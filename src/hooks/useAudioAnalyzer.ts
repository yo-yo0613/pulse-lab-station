import { useState, useEffect, useRef, useCallback } from 'react';
import type { AudioMetrics, MATSMetricsSummary } from '../types/speak';

const BUFFER_CAPACITY = 900; // 15 秒 * 60 fps = 900 槽位
const MACRO_F0_WINDOW = 18; // 300ms @ 60fps 巨觀語調滑動平均窗 (MATS Pitfall 01 防護)

export interface PersonalBaseline {
  rmsBase: number;
  f0Base: number;
  isCalibrated: boolean;
}

export interface UseAudioAnalyzerReturn {
  audioMetrics: AudioMetrics;
  isListening: boolean;
  isCalibrating: boolean;
  isCalibratingBaseline: boolean;
  baselineProfile: PersonalBaseline;
  noiseFloor: number;
  recordedFrames: number;
  userAudioBlob: Blob | null;
  userAudioUrl: string | null;
  getValidRecordings: () => {
    volume: Float32Array;
    pitch: Float32Array;
    matsSummary: MATSMetricsSummary;
  };
  startRecording: () => void;
  stopRecording: () => void;
  unlockAudio: () => Promise<boolean>;
  muteInput: (mute: boolean) => void;
  setMuteInput: (muted: boolean) => void;
  calibrateNoiseFloor: () => void;
  calibratePersonalBaseline: () => void;
  getElapsedHardwareTime: () => number;
  clearRecordedAudio: () => void;
}

/**
 * 時域歸一化自相關演算法 (Normalized Autocorrelation)
 * 在 85Hz ~ 350Hz 人聲自然基頻區間搜尋波形週期重複間隔，同時估算 HNR 諧波雜訊比
 */
function detectFundamentalPitch(
  timeDomain: Float32Array,
  sampleRate: number
): { pitchHz: number; pitchNorm: number; hnrDb: number; isPeriodicVoice: boolean } {
  const SIZE = timeDomain.length;
  const MIN_SAMPLES = Math.floor(sampleRate / 350); // 350Hz 對應最小取樣點
  const MAX_SAMPLES = Math.floor(sampleRate / 85);  // 85Hz 對應最大取樣點

  let bestOffset = -1;
  let maxCorrelation = 0;
  let rmsSq = 0;

  for (let i = 0; i < SIZE; i++) {
    const val = timeDomain[i];
    rmsSq += val * val;
  }
  const meanPower = rmsSq / SIZE;
  const rms = Math.sqrt(meanPower);

  // 能量過小視為無有效語音音高
  if (rms < 0.015) {
    return { pitchHz: 130, pitchNorm: 0.17, hnrDb: 16, isPeriodicVoice: false };
  }

  // 尋找最大歸一化自相關係數波峰
  for (let offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = SIZE - offset;
    for (let i = 0; i < limit; i++) {
      const a = timeDomain[i];
      const b = timeDomain[i + offset];
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denom = Math.sqrt(energyA * energyB) + 1e-8;
    const normCorr = correlation / denom;

    if (normCorr > maxCorrelation) {
      maxCorrelation = normCorr;
      bestOffset = offset;
    }
  }

  // 依據 Boersma (Praat) 公式估算 HNR (dB)：10 * log10(r / (1 - r))
  const clampedCorr = Math.max(0.15, Math.min(0.97, maxCorrelation));
  const rawHnr = 10 * Math.log10(clampedCorr / Math.max(0.03, 1 - clampedCorr)) + 8;
  const hnrDb = Number(Math.max(4, Math.min(26, rawHnr)).toFixed(1));

  if (bestOffset > 0 && maxCorrelation > 0.28) {
    const fundamentalHz = sampleRate / bestOffset;
    const clampedHz = Math.max(85, Math.min(350, fundamentalHz));
    const pitchNorm = (clampedHz - 85) / (350 - 85);
    return {
      pitchHz: Math.round(clampedHz),
      pitchNorm,
      hnrDb,
      isPeriodicVoice: true,
    };
  }

  return { pitchHz: 130, pitchNorm: 0.17, hnrDb: Math.min(12, hnrDb), isPeriodicVoice: false };
}

function classifyQuadrant(valence: number, arousal: number): string {
  if (arousal >= 0.25 && valence >= 0.1) return '高亢正向・興奮／驚喜 (High Arousal +)';
  if (arousal >= 0.25 && valence < 0.1) return '高亢張力・激動／驚恐 (High Arousal −)';
  if (arousal < 0.25 && valence >= 0.1) return '柔和舒緩・沉靜／慵懶 (Low Arousal +)';
  return '低沉內斂・遲疑／呢喃 (Low Arousal −)';
}

/**
 * 純前端 16-bit PCM WAV 封裝器 + 自動峰值正規化 (AGC)
 * 完全繞過 MediaRecorder 的 WebM 空檔/檔頭損毀問題，並將偏小的麥克風人聲自動拉抬至清晰可聽音量
 */
function encodeWavBlob(chunks: Float32Array[], sampleRate: number): Blob | null {
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i].length;
  }
  // 過短（少於 0.1 秒）視為無有效錄音，避免產出 0-byte 壞檔
  if (totalLength < Math.floor(sampleRate * 0.1)) {
    return null;
  }

  const merged = new Float32Array(totalLength);
  let offset = 0;
  let peak = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    merged.set(chunk, offset);
    for (let j = 0; j < chunk.length; j++) {
      const absVal = Math.abs(chunk[j]);
      if (absVal > peak) peak = absVal;
    }
    offset += chunk.length;
  }

  // 自動增益正規化：目標峰值 0.88 (-1.1 dBFS)，最高增益上限 8.0x 防止純底噪爆音
  const gain = peak > 0.002 ? Math.min(8.0, 0.88 / peak) : 1.0;

  const dataByteLength = totalLength * 2; // 16-bit mono = 2 bytes per sample
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeString = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(pos + i, str.charCodeAt(i));
    }
  };

  // Standard 44-byte RIFF/WAVE PCM header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate = SampleRate * Channels * BitsPerSample/8
  view.setUint16(32, 2, true); // BlockAlign = Channels * BitsPerSample/8
  view.setUint16(34, 16, true); // BitsPerSample = 16
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let sampleOffset = 44;
  for (let i = 0; i < totalLength; i++) {
    // 柔性壓限防削波失真
    const boosted = merged[i] * gain;
    const clamped = Math.max(-1, Math.min(1, boosted));
    view.setInt16(sampleOffset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    sampleOffset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function useAudioAnalyzer(): UseAudioAnalyzerReturn {
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    rawVolume: 0,
    smoothVolume: 0,
    pitchHz: 130,
    pitchNormalized: 0.2,
    pitchYOffset: 0,
    sustainedDuration: 0,
    isSustained: false,
    isStaccato: false,
    isVoiceActive: false,
    frequencyData: new Uint8Array(128),
    waveform: new Float32Array(512),
    f0MacroHz: 150,
    deltaRms: 0,
    deltaF0: 0,
    jitter: 0,
    hnrDb: 18,
    speechRate: 0,
    pauseDurationMs: 0,
    valence: 0,
    arousal: 0,
  });

  const [isListening, setIsListening] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibratingBaseline, setIsCalibratingBaseline] = useState(false);
  const [baselineProfile, setBaselineProfile] = useState<PersonalBaseline>({
    rmsBase: 28,
    f0Base: 155,
    isCalibrated: false,
  });
  const [noiseFloor, setNoiseFloor] = useState(12);
  const [recordedFrames, setRecordedFrames] = useState(0);

  // 原生 Web Audio PCM WAV 錄音緩衝與 URL (零 Vite AudioWorklet 路徑依賴，100% 跨瀏覽器可播)
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSamplesCountRef = useRef<number>(0);
  const recordingSampleRateRef = useRef<number>(44100);
  const userAudioUrlRef = useRef<string | null>(null);
  const [userAudioBlob, setUserAudioBlob] = useState<Blob | null>(null);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);

  // Web Audio 原生節點
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentSinkRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unlockPromiseRef = useRef<Promise<boolean> | null>(null);

  // 預分配定長環形緩衝池 (0 GC Spike, 15s * 60fps = 900 槽位)
  const volumeBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const pitchBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const jitterBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const hnrBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const f0HzBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const deltaRmsBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const valenceBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const arousalBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));

  const headPointerRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const recordedFramesRef = useRef<number>(0);

  // 物理彈簧阻尼平滑值與時基
  const smoothVolumeRef = useRef<number>(0);
  const smoothPitchNormRef = useRef<number>(0.2);
  const lastFrameTimeRef = useRef<number>(0);
  const zeroFramesCountRef = useRef<number>(0);

  // MATS v1.0 物理追蹤器
  const baselineRef = useRef<PersonalBaseline>({ rmsBase: 28, f0Base: 155, isCalibrated: false });
  useEffect(() => {
    baselineRef.current = baselineProfile;
  }, [baselineProfile]);

  const macroF0RingRef = useRef<number[]>([]);
  const prevValidPitchHzRef = useRef<number>(150);
  const smoothJitterRef = useRef<number>(0);
  const smoothHnrRef = useRef<number>(18);

  const silenceStartMsRef = useRef<number | null>(null);
  const settledPauseMsRef = useRef<number>(0);
  const wasVoiceActiveRef = useRef<boolean>(false);

  // 音節率追蹤 (2.5 秒滑動窗口中的音量波峰觸發時間戳)
  const syllableTimestampsRef = useRef<number[]>([]);
  const wasAboveSyllableThresholdRef = useRef<boolean>(false);
  const recordedMaxPauseMsRef = useRef<number>(0);

  // 語感物理追蹤器：動態基準線、持音累加器、短音脈衝
  const pitchBaselineRef = useRef<number>(155);
  const sustainedDurationRef = useRef<number>(0);
  const recentPitchesRef = useRef<number[]>([]);
  const lastRawVolRef = useRef<number>(0);
  const lastRiseTimeRef = useRef<number>(0);
  const isStaccatoRef = useRef<boolean>(false);

  // 錄音硬體時鐘
  const recordingStartAudioTimeRef = useRef<number>(0);

  // 暫停/恢復輸入 (示範影片播放時靜音麥克風以防喇叭迴音自激，A/B 45 第 0 毫秒強制賦值)
  const muteInput = useCallback((mute: boolean) => {
    if (micGainRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      micGainRef.current.gain.cancelScheduledValues(now);
      micGainRef.current.gain.setValueAtTime(mute ? 0 : 1, now);
    }
  }, []);

  // 安全釋放既有的 Blob ObjectURL (重錄或卸載時防記憶體洩漏)
  const revokeCurrentAudioUrl = useCallback(() => {
    if (userAudioUrlRef.current) {
      URL.revokeObjectURL(userAudioUrlRef.current);
      userAudioUrlRef.current = null;
    }
    setUserAudioUrl(null);
    setUserAudioBlob(null);
  }, []);

  // 元件卸載時釋放 ObjectURL 與音訊管線資源
  useEffect(() => {
    return () => {
      if (userAudioUrlRef.current) {
        URL.revokeObjectURL(userAudioUrlRef.current);
        userAudioUrlRef.current = null;
      }
      if (processorRef.current) {
        processorRef.current.onaudioprocess = null;
        try {
          processorRef.current.disconnect();
        } catch {
          // Ignore disconnect errors on unmount
        }
      }
      if (silentSinkRef.current) {
        try {
          silentSinkRef.current.disconnect();
        } catch {
          // Ignore disconnect errors on unmount
        }
      }
    };
  }, []);

  // 點擊手勢解鎖音訊上下文 (防並發競態 + 音訊軌道存活檢查 + 掛載 PCM 錄音節點)
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    if (unlockPromiseRef.current) {
      return unlockPromiseRef.current;
    }

    const runUnlock = async (): Promise<boolean> => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('[See How You Speak] navigator.mediaDevices unavailable (requires HTTPS or localhost)');
          return false;
        }

        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new AudioContextClass();
        }

        if (audioCtxRef.current.state === 'suspended') {
          // 防止無手勢自動初始化時 resume() 永久懸置；有手勢時會在 <5ms 內完成
          await Promise.race([
            audioCtxRef.current.resume().catch(() => {}),
            new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
          ]);
        }

        const hasLiveTrack =
          !!streamRef.current &&
          streamRef.current.getAudioTracks().some((track) => track.readyState === 'live');

        if (!hasLiveTrack) {
          // 清理已失效的舊節點與串流
          if (processorRef.current) {
            processorRef.current.onaudioprocess = null;
            try {
              processorRef.current.disconnect();
            } catch {
              // Ignore
            }
            processorRef.current = null;
          }
          if (silentSinkRef.current) {
            try {
              silentSinkRef.current.disconnect();
            } catch {
              // Ignore
            }
            silentSinkRef.current = null;
          }
          if (sourceRef.current) {
            try {
              sourceRef.current.disconnect();
            } catch {
              // Ignore
            }
            sourceRef.current = null;
          }
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: false, // 保留原聲情緒與氣聲細節
              autoGainControl: false,  // 防止瀏覽器壓平音量動態反差
            },
          });
          streamRef.current = stream;

          const ctx = audioCtxRef.current;
          const source = ctx.createMediaStreamSource(stream);
          const micGain = ctx.createGain();
          const compressor = ctx.createDynamicsCompressor();
          const analyser = ctx.createAnalyser();

          compressor.threshold.setValueAtTime(-18, ctx.currentTime);
          compressor.knee.setValueAtTime(24, ctx.currentTime);
          compressor.ratio.setValueAtTime(10, ctx.currentTime);
          compressor.attack.setValueAtTime(0.003, ctx.currentTime);
          compressor.release.setValueAtTime(0.15, ctx.currentTime);

          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.4;

          source.connect(micGain);
          micGain.connect(compressor);
          compressor.connect(analyser);

          // Web Audio 直接擷取經 Compressor 處理之單聲道 PCM (無外部 Worklet 路徑依賴，靜音匯流防迴授)
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          const silentSink = ctx.createGain();
          silentSink.gain.setValueAtTime(0, ctx.currentTime);

          processor.onaudioprocess = (event: AudioProcessingEvent) => {
            if (!isRecordingRef.current) return;
            const inputData = event.inputBuffer.getChannelData(0);
            const maxSamples = Math.floor((ctx.sampleRate || 44100) * 16.5);
            if (pcmSamplesCountRef.current >= maxSamples) return;
            const copy = new Float32Array(inputData.length);
            copy.set(inputData);
            pcmChunksRef.current.push(copy);
            pcmSamplesCountRef.current += copy.length;
          };

          compressor.connect(processor);
          processor.connect(silentSink);
          silentSink.connect(ctx.destination);

          sourceRef.current = source;
          micGainRef.current = micGain;
          compressorRef.current = compressor;
          analyserRef.current = analyser;
          processorRef.current = processor;
          silentSinkRef.current = silentSink;
        }

        setIsListening(true);
        return true;
      } catch (err) {
        console.warn('[See How You Speak] Audio init failed:', err);
        return false;
      } finally {
        unlockPromiseRef.current = null;
      }
    };

    unlockPromiseRef.current = runUnlock();
    return unlockPromiseRef.current;
  }, []);

  // 300ms 環境底噪自動校準 (Noise Gate Calibration)
  const calibrateNoiseFloor = useCallback(() => {
    setIsCalibrating(true);
    let sampleSum = 0;
    let sampleCount = 0;
    const start = performance.now();

    const calLoop = () => {
      if (!analyserRef.current) {
        setIsCalibrating(false);
        return;
      }
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = (sum / dataArray.length / 255) * 100;

      sampleSum += avg;
      sampleCount++;

      if (performance.now() - start < 350) {
        requestAnimationFrame(calLoop);
      } else {
        const floor = sampleCount > 0 ? sampleSum / sampleCount : 12;
        const safeFloor = Math.max(8, Math.min(35, Math.round(floor + 4)));
        setNoiseFloor(safeFloor);
        setIsCalibrating(false);
      }
    };

    requestAnimationFrame(calLoop);
  }, []);

  // MATS A/B 02: 2.0 秒個人基準校準 (採集自然平靜說話音高與音量作為 ΔF0 / ΔRMS 基準)
  const calibratePersonalBaseline = useCallback(async () => {
    await unlockAudio();
    muteInput(false);
    setIsCalibratingBaseline(true);

    const volSamples: number[] = [];
    const f0Samples: number[] = [];
    const start = performance.now();

    const loop = () => {
      const analyser = analyserRef.current;
      if (!analyser) {
        setIsCalibratingBaseline(false);
        return;
      }

      const timeData = new Float32Array(512);
      analyser.getFloatTimeDomainData(timeData);
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) sumSq += timeData[i] * timeData[i];
      const vol = Math.min(100, Math.sqrt(sumSq / timeData.length) * 280);
      const { pitchHz, isPeriodicVoice } = detectFundamentalPitch(
        timeData,
        audioCtxRef.current?.sampleRate || 44100
      );

      if (vol > Math.max(8, noiseFloor * 0.7)) {
        volSamples.push(vol);
        if (isPeriodicVoice && pitchHz >= 85 && pitchHz <= 350) {
          f0Samples.push(pitchHz);
        }
      }

      if (performance.now() - start < 2000) {
        requestAnimationFrame(loop);
      } else {
        const avgRms =
          volSamples.length > 5
            ? volSamples.reduce((a, b) => a + b, 0) / volSamples.length
            : 28;
        const avgF0 =
          f0Samples.length > 5
            ? f0Samples.reduce((a, b) => a + b, 0) / f0Samples.length
            : 155;

        const nextProfile: PersonalBaseline = {
          rmsBase: Math.max(12, Math.min(70, Math.round(avgRms))),
          f0Base: Math.max(95, Math.min(300, Math.round(avgF0))),
          isCalibrated: true,
        };
        baselineRef.current = nextProfile;
        pitchBaselineRef.current = nextProfile.f0Base;
        setBaselineProfile(nextProfile);
        setIsCalibratingBaseline(false);
      }
    };

    requestAnimationFrame(loop);
  }, [unlockAudio, muteInput, noiseFloor]);

  // 啟動錄音 (支援最長 15 秒環形緩衝池 + 16-bit PCM WAV 擷取)
  const startRecording = useCallback(() => {
    // 重錄前先釋放舊的 ObjectURL，避免殘留舊檔或記憶體洩漏
    revokeCurrentAudioUrl();

    headPointerRef.current = 0;
    recordedFramesRef.current = 0;
    recordedMaxPauseMsRef.current = 0;
    settledPauseMsRef.current = 0;
    silenceStartMsRef.current = null;
    pcmChunksRef.current = [];
    pcmSamplesCountRef.current = 0;
    volumeBufferRef.current.fill(0);
    pitchBufferRef.current.fill(0);
    jitterBufferRef.current.fill(0);
    hnrBufferRef.current.fill(0);
    f0HzBufferRef.current.fill(0);
    deltaRmsBufferRef.current.fill(0);
    valenceBufferRef.current.fill(0);
    arousalBufferRef.current.fill(0);
    setRecordedFrames(0);

    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      recordingSampleRateRef.current = audioCtxRef.current.sampleRate || 44100;
      recordingStartAudioTimeRef.current = audioCtxRef.current.currentTime;
      if (micGainRef.current) {
        micGainRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
        micGainRef.current.gain.setValueAtTime(1.0, audioCtxRef.current.currentTime);
      }
    }
    muteInput(false);
    isRecordingRef.current = true;
  }, [muteInput, revokeCurrentAudioUrl]);

  // 結束錄音並同步封裝標準 16-bit PCM WAV Blob (附自動峰值正規化)
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    const chunks = pcmChunksRef.current;
    const sampleRate = recordingSampleRateRef.current || audioCtxRef.current?.sampleRate || 44100;
    const wavBlob = encodeWavBlob(chunks, sampleRate);
    pcmChunksRef.current = [];
    pcmSamplesCountRef.current = 0;

    if (wavBlob && wavBlob.size > 44) {
      if (userAudioUrlRef.current) {
        URL.revokeObjectURL(userAudioUrlRef.current);
      }
      const url = URL.createObjectURL(wavBlob);
      userAudioUrlRef.current = url;
      setUserAudioBlob(wavBlob);
      setUserAudioUrl(url);
    } else {
      revokeCurrentAudioUrl();
    }
  }, [revokeCurrentAudioUrl]);

  // 取得聲卡 DAC 硬體已消耗秒數
  const getElapsedHardwareTime = useCallback(() => {
    if (!audioCtxRef.current || !isRecordingRef.current) return 0;
    return Math.max(0, audioCtxRef.current.currentTime - recordingStartAudioTimeRef.current);
  }, []);

  // 釋放記憶體 Blob URL
  const clearRecordedAudio = useCallback(() => {
    revokeCurrentAudioUrl();
    pcmChunksRef.current = [];
    pcmSamplesCountRef.current = 0;
  }, [revokeCurrentAudioUrl]);

  // 取得有效切片與 MATS 摘要統計資料
  const getValidRecordings = useCallback(() => {
    const validCount = Math.max(1, Math.min(BUFFER_CAPACITY, recordedFramesRef.current));
    const volume = volumeBufferRef.current.subarray(0, validCount);
    const pitch = pitchBufferRef.current.subarray(0, validCount);
    const jitterSlice = jitterBufferRef.current.subarray(0, validCount);
    const hnrSlice = hnrBufferRef.current.subarray(0, validCount);
    const f0Slice = f0HzBufferRef.current.subarray(0, validCount);
    const deltaRmsSlice = deltaRmsBufferRef.current.subarray(0, validCount);
    const valSlice = valenceBufferRef.current.subarray(0, validCount);
    const aroSlice = arousalBufferRef.current.subarray(0, validCount);

    let activeCount = 0;
    let sumDeltaRms = 0;
    let sumF0 = 0;
    let sumJitter = 0;
    let sumHnr = 0;
    let sumValence = 0;
    let sumArousal = 0;

    for (let i = 0; i < validCount; i++) {
      if (volume[i] > Math.max(6, noiseFloor * 0.6)) {
        activeCount++;
        sumDeltaRms += deltaRmsSlice[i];
        sumF0 += f0Slice[i] || 150;
        sumJitter += jitterSlice[i];
        sumHnr += hnrSlice[i] || 18;
        sumValence += valSlice[i];
        sumArousal += aroSlice[i];
      }
    }

    const div = Math.max(1, activeCount);
    const avgDeltaRms = Number((sumDeltaRms / div).toFixed(2));
    const avgF0Hz = Math.round(activeCount > 0 ? sumF0 / div : baselineRef.current.f0Base);
    const avgJitter = Number((sumJitter / div).toFixed(2));
    const avgHnrDb = Number((activeCount > 0 ? sumHnr / div : 18).toFixed(1));
    const valence = Number(Math.max(-1, Math.min(1, sumValence / div)).toFixed(2));
    const arousal = Number(Math.max(-1, Math.min(1, sumArousal / div)).toFixed(2));

    return {
      volume,
      pitch,
      matsSummary: {
        avgDeltaRms,
        avgF0Hz,
        avgJitter,
        avgHnrDb,
        avgPauseMs: Math.round(recordedMaxPauseMsRef.current),
        valence,
        arousal,
        quadrantLabel: classifyQuadrant(valence, arousal),
        isCalibrated: baselineRef.current.isCalibrated,
      },
    };
  }, [noiseFloor]);

  // 60fps 音訊採樣與 MATS v1.0 特徵擷取主迴圈
  useEffect(() => {
    if (!isListening) return;

    let animId: number;
    const freqData = new Uint8Array(128);
    const timeData = new Float32Array(512);

    const updateLoop = (now: number) => {
      animId = requestAnimationFrame(updateLoop);

      const analyser = analyserRef.current;
      if (!analyser) return;

      const prevTime = lastFrameTimeRef.current || now;
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
      lastFrameTimeRef.current = now;

      // 1. 讀取頻譜與波形
      analyser.getByteFrequencyData(freqData);
      analyser.getFloatTimeDomainData(timeData);

      // 2. 計算即時振幅 RMS 音量 (0 ~ 100)
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSq += timeData[i] * timeData[i];
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const rawVol = Math.min(100, Math.round(rms * 280));

      // 3. 麥克風假死心跳偵測
      if (rawVol === 0) {
        zeroFramesCountRef.current++;
        if (zeroFramesCountRef.current > 120 && isListening) {
          if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume();
          }
          zeroFramesCountRef.current = 0;
        }
      } else {
        zeroFramesCountRef.current = 0;
      }

      // 4. 時域歸一化自相關計算 F0 與 HNR (dB)
      const sampleRate = audioCtxRef.current?.sampleRate || 44100;
      const { pitchHz, pitchNorm, hnrDb, isPeriodicVoice } = detectFundamentalPitch(timeData, sampleRate);

      // 短音快攻瞬態偵測 (Staccato Impulse)
      const volDelta = rawVol - lastRawVolRef.current;
      if (volDelta > 25) {
        lastRiseTimeRef.current = now;
      }
      const isQuickImpulse = now - lastRiseTimeRef.current < 90 && rawVol < smoothVolumeRef.current;
      isStaccatoRef.current = isQuickImpulse;
      lastRawVolRef.current = rawVol;

      // 5. 非對稱彈簧阻尼平滑
      const attackSpeed = 1 - Math.exp(-22 * dt);
      const decayCoeff = isQuickImpulse ? 26 : 7;
      const decaySpeed = 1 - Math.exp(-decayCoeff * dt);
      const alpha = rawVol > smoothVolumeRef.current ? attackSpeed : decaySpeed;

      smoothVolumeRef.current += (rawVol - smoothVolumeRef.current) * alpha;
      smoothPitchNormRef.current += (pitchNorm - smoothPitchNormRef.current) * (1 - Math.exp(-12 * dt));

      // 6. Dual VAD 雙重語音活性檢測
      const hasHumanVoice =
        isPeriodicVoice &&
        pitchHz >= 85 &&
        pitchHz <= 350 &&
        (rawVol > 6 || smoothVolumeRef.current > noiseFloor * 0.75);
      const isVoiceActive = smoothVolumeRef.current > noiseFloor || hasHumanVoice;

      // 7. MATS Pitfall 01: 300ms 滑動視窗濾波巨觀語調 (f0MacroHz)
      if (isVoiceActive && isPeriodicVoice) {
        macroF0RingRef.current.push(pitchHz);
        if (macroF0RingRef.current.length > MACRO_F0_WINDOW) {
          macroF0RingRef.current.shift();
        }
      } else if (macroF0RingRef.current.length > 0 && !isVoiceActive) {
        // 靜音過久緩慢清除以準備下一句
        if (settledPauseMsRef.current > 900) {
          macroF0RingRef.current = [];
        }
      }

      const f0MacroHz =
        macroF0RingRef.current.length > 0
          ? Math.round(
              macroF0RingRef.current.reduce((a, b) => a + b, 0) / macroF0RingRef.current.length
            )
          : baselineRef.current.f0Base;

      // 8. MATS Jitter (%) & HNR (dB) 平滑追蹤
      if (isVoiceActive && isPeriodicVoice) {
        const instJitter =
          (Math.abs(pitchHz - prevValidPitchHzRef.current) / Math.max(85, prevValidPitchHzRef.current)) *
          100;
        prevValidPitchHzRef.current = pitchHz;
        const clampedJitter = Math.min(10, instJitter);
        smoothJitterRef.current += (clampedJitter - smoothJitterRef.current) * (1 - Math.exp(-10 * dt));
      } else {
        smoothJitterRef.current = Math.max(0, smoothJitterRef.current - dt * 3.0);
      }
      smoothHnrRef.current += (hnrDb - smoothHnrRef.current) * (1 - Math.exp(-8 * dt));

      // 9. MATS Pause 停頓包絡線追蹤 + Speech Rate 音節率計算
      if (!isVoiceActive) {
        if (wasVoiceActiveRef.current) {
          silenceStartMsRef.current = now;
        }
        if (silenceStartMsRef.current !== null) {
          const gap = now - silenceStartMsRef.current;
          settledPauseMsRef.current = Math.min(2000, gap);
          if (isRecordingRef.current && gap > recordedMaxPauseMsRef.current && gap < 2500) {
            recordedMaxPauseMsRef.current = gap;
          }
        }
      } else {
        // 有聲回復時，先前停頓值慢速衰退保留視覺間隔感
        settledPauseMsRef.current = Math.max(0, settledPauseMsRef.current - dt * 380);
        silenceStartMsRef.current = null;
      }
      wasVoiceActiveRef.current = isVoiceActive;

      // Syllable onset rate (2.5 秒窗)
      const sylGate = Math.max(noiseFloor * 1.15, 16);
      if (rawVol > sylGate && !wasAboveSyllableThresholdRef.current) {
        syllableTimestampsRef.current.push(now);
        wasAboveSyllableThresholdRef.current = true;
      } else if (rawVol < sylGate * 0.7) {
        wasAboveSyllableThresholdRef.current = false;
      }
      while (
        syllableTimestampsRef.current.length > 0 &&
        now - syllableTimestampsRef.current[0] > 2500
      ) {
        syllableTimestampsRef.current.shift();
      }
      const speechRate = Number((syllableTimestampsRef.current.length / 2.5).toFixed(1));

      // 10. MATS A/B 02: 個人化動態基準正規化 (ΔRMS & ΔF0)
      if (!baselineRef.current.isCalibrated && isVoiceActive) {
        pitchBaselineRef.current +=
          (f0MacroHz - pitchBaselineRef.current) * (1 - Math.exp(-0.4 * dt));
      }
      const baseRms = Math.max(10, baselineRef.current.rmsBase);
      const baseF0 = baselineRef.current.isCalibrated
        ? baselineRef.current.f0Base
        : pitchBaselineRef.current;

      const deltaRms = isVoiceActive
        ? Number(((smoothVolumeRef.current - baseRms) / baseRms).toFixed(2))
        : 0;
      const deltaF0 = isVoiceActive
        ? Number(((f0MacroHz - baseF0) / Math.max(85, baseF0)).toFixed(3))
        : 0;

      // 雙曲正切軟箝位 Y 軸偏移 [-28, +28] px
      const deltaPitchHz = f0MacroHz - baseF0;
      const pitchYOffset = isVoiceActive ? Math.round(-Math.tanh(deltaPitchHz / 55) * 28) : 0;

      // 11. MATS A/B 01: Continuous Valence–Arousal 情感雙軸
      const volNormArousal = Math.tanh((smoothVolumeRef.current - 30) / 35);
      const pitchSpanArousal = Math.min(0.6, Math.abs(deltaF0) * 1.6);
      const speedArousal = Math.min(0.4, speechRate / 8);
      const arousal = Number(
        Math.max(-1, Math.min(1, volNormArousal * 0.65 + pitchSpanArousal + speedArousal - 0.15)).toFixed(2)
      );

      const clarityScore = (smoothHnrRef.current - 13) / 10; // 高 HNR 清亮偏向正向，低 HNR 緊繃/沙啞偏負向
      const pitchLiftScore = Math.tanh(deltaF0 * 2.0) * 0.4;
      const jitterPenalty = Math.min(0.7, Math.max(0, (smoothJitterRef.current - 1.8) * 0.25));
      const valence = Number(
        Math.max(-1, Math.min(1, clarityScore * 0.6 + pitchLiftScore - jitterPenalty)).toFixed(2)
      );

      // 12. 拉長音穩定累加器
      if (isVoiceActive && (smoothVolumeRef.current > noiseFloor * 0.8 || hasHumanVoice)) {
        recentPitchesRef.current.push(pitchHz);
        if (recentPitchesRef.current.length > 10) recentPitchesRef.current.shift();

        let sumP = 0;
        for (let i = 0; i < recentPitchesRef.current.length; i++) sumP += recentPitchesRef.current[i];
        const meanP = sumP / recentPitchesRef.current.length;
        let varP = 0;
        for (let i = 0; i < recentPitchesRef.current.length; i++) {
          const diff = recentPitchesRef.current[i] - meanP;
          varP += diff * diff;
        }
        const stdP = Math.sqrt(varP / recentPitchesRef.current.length);
        const relativeStd = meanP > 0 ? stdP / meanP : 1;

        if (relativeStd < 0.12 && recentPitchesRef.current.length >= 4) {
          sustainedDurationRef.current = Math.min(1.5, sustainedDurationRef.current + dt * 1.6);
        } else {
          sustainedDurationRef.current = Math.max(0, sustainedDurationRef.current - dt * 2.0);
        }
      } else {
        recentPitchesRef.current = [];
        sustainedDurationRef.current = Math.max(0, sustainedDurationRef.current - dt * 3.0);
      }
      const isSustained = sustainedDurationRef.current > 0.35;

      // 13. 錄音狀態下記錄至定長環形緩衝池
      if (isRecordingRef.current && headPointerRef.current < BUFFER_CAPACITY) {
        const ptr = headPointerRef.current;
        volumeBufferRef.current[ptr] = smoothVolumeRef.current;
        pitchBufferRef.current[ptr] = smoothPitchNormRef.current;
        jitterBufferRef.current[ptr] = smoothJitterRef.current;
        hnrBufferRef.current[ptr] = smoothHnrRef.current;
        f0HzBufferRef.current[ptr] = f0MacroHz;
        deltaRmsBufferRef.current[ptr] = deltaRms;
        valenceBufferRef.current[ptr] = valence;
        arousalBufferRef.current[ptr] = arousal;
        headPointerRef.current = ptr + 1;
        recordedFramesRef.current = ptr + 1;
        setRecordedFrames(ptr + 1);
      }

      // 14. 更新外部讀取指標
      setAudioMetrics({
        rawVolume: rawVol,
        smoothVolume: Math.round(smoothVolumeRef.current),
        pitchHz,
        pitchNormalized: Number(smoothPitchNormRef.current.toFixed(3)),
        pitchYOffset,
        sustainedDuration: Number(sustainedDurationRef.current.toFixed(2)),
        isSustained,
        isStaccato: isStaccatoRef.current,
        isVoiceActive,
        frequencyData: freqData,
        waveform: timeData,
        f0MacroHz,
        deltaRms,
        deltaF0,
        jitter: Number(smoothJitterRef.current.toFixed(2)),
        hnrDb: Number(smoothHnrRef.current.toFixed(1)),
        speechRate,
        pauseDurationMs: Math.round(settledPauseMsRef.current),
        valence,
        arousal,
      });
    };

    animId = requestAnimationFrame(updateLoop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isListening, noiseFloor]);

  return {
    audioMetrics,
    isListening,
    isCalibrating,
    isCalibratingBaseline,
    baselineProfile,
    noiseFloor,
    recordedFrames,
    userAudioBlob,
    userAudioUrl,
    getValidRecordings,
    startRecording,
    stopRecording,
    unlockAudio,
    muteInput,
    setMuteInput: muteInput,
    calibrateNoiseFloor,
    calibratePersonalBaseline,
    getElapsedHardwareTime,
    clearRecordedAudio,
  };
}
