import { useState, useEffect, useRef, useCallback } from 'react';
import type { AudioMetrics } from '../types/speak';

const BUFFER_CAPACITY = 300; // 5 秒 * 60 fps = 300 槽位

export interface UseAudioAnalyzerReturn {
  audioMetrics: AudioMetrics;
  isListening: boolean;
  isCalibrating: boolean;
  noiseFloor: number;
  recordedFrames: number;
  userAudioBlob: Blob | null;
  userAudioUrl: string | null;
  getValidRecordings: () => { volume: Float32Array; pitch: Float32Array };
  startRecording: () => void;
  stopRecording: () => void;
  unlockAudio: () => Promise<boolean>;
  muteInput: (mute: boolean) => void;
  setMuteInput: (muted: boolean) => void;
  calibrateNoiseFloor: () => void;
  getElapsedHardwareTime: () => number;
  clearRecordedAudio: () => void;
}

/**
 * 時域歸一化自相關演算法 (Normalized Autocorrelation)
 * 在 85Hz ~ 350Hz 人聲自然基頻區間搜尋波形週期重複間隔
 */
function detectFundamentalPitch(
  timeDomain: Float32Array,
  sampleRate: number
): { pitchHz: number; pitchNorm: number } {
  const SIZE = timeDomain.length;
  const MIN_SAMPLES = Math.floor(sampleRate / 350); // 350Hz 對應最小取樣點
  const MAX_SAMPLES = Math.floor(sampleRate / 85);  // 85Hz 對應最大取樣點

  let bestOffset = -1;
  let maxCorrelation = 0;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    const val = timeDomain[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  // 能量過小視為無有效語音音高
  if (rms < 0.015) {
    return { pitchHz: 120, pitchNorm: 0.15 };
  }

  // 尋找最大自相關係數波峰
  for (let offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
    let correlation = 0;
    for (let i = 0; i < SIZE - offset; i++) {
      correlation += timeDomain[i] * timeDomain[i + offset];
    }
    correlation = correlation / (SIZE - offset);

    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestOffset > 0 && maxCorrelation > 0.005) {
    const fundamentalHz = sampleRate / bestOffset;
    // 限制在 85 ~ 350Hz 範圍內
    const clampedHz = Math.max(85, Math.min(350, fundamentalHz));
    const pitchNorm = (clampedHz - 85) / (350 - 85);
    return { pitchHz: Math.round(clampedHz), pitchNorm };
  }

  return { pitchHz: 130, pitchNorm: 0.2 };
}

export function useAudioAnalyzer(): UseAudioAnalyzerReturn {
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    rawVolume: 0,
    smoothVolume: 0,
    pitchHz: 120,
    pitchNormalized: 0.2,
    pitchYOffset: 0,
    sustainedDuration: 0,
    isSustained: false,
    isStaccato: false,
    isVoiceActive: false,
    frequencyData: new Uint8Array(128),
    waveform: new Float32Array(512),
  });

  const [isListening, setIsListening] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState(12);
  const [recordedFrames, setRecordedFrames] = useState(0);

  // 原生錄音切片與 URL (A/B 36 原音重現)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [userAudioBlob, setUserAudioBlob] = useState<Blob | null>(null);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);

  // Web Audio 原生節點
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 預分配定長環形緩衝池 (0 GC Spike)
  const volumeBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const pitchBufferRef = useRef<Float32Array>(new Float32Array(BUFFER_CAPACITY));
  const headPointerRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const recordedFramesRef = useRef<number>(0);

  // 物理彈簧阻尼平滑值與時基
  const smoothVolumeRef = useRef<number>(0);
  const smoothPitchNormRef = useRef<number>(0.2);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const zeroFramesCountRef = useRef<number>(0);

  // 林妤安語感物理追蹤器：動態基準線、持音累加器、短音脈衝
  const pitchBaselineRef = useRef<number>(150);
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

  // 點擊手勢解鎖音訊上下文
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
      }

      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false, // 保留原聲情緒細節
            autoGainControl: false,  // 防止瀏覽器無腦壓平音量反差
          },
        });
        streamRef.current = stream;

        // 串聯 Web Audio 鏈路：
        // Mic -> Gain (防迴音) -> Compressor (防噴麥) -> Analyser
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        const micGain = audioCtxRef.current.createGain();
        const compressor = audioCtxRef.current.createDynamicsCompressor();
        const analyser = audioCtxRef.current.createAnalyser();

        compressor.threshold.setValueAtTime(-18, audioCtxRef.current.currentTime);
        compressor.knee.setValueAtTime(24, audioCtxRef.current.currentTime);
        compressor.ratio.setValueAtTime(10, audioCtxRef.current.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtxRef.current.currentTime);
        compressor.release.setValueAtTime(0.15, audioCtxRef.current.currentTime);

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;

        source.connect(micGain);
        micGain.connect(compressor);
        compressor.connect(analyser);

        micGainRef.current = micGain;
        compressorRef.current = compressor;
        analyserRef.current = analyser;
      }

      setIsListening(true);
      return true;
    } catch (err) {
      console.warn('[See How You Speak] Audio init failed:', err);
      return false;
    }
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
        // 門檻向上保留 3dB 冗餘
        const safeFloor = Math.max(8, Math.min(35, Math.round(floor + 4)));
        setNoiseFloor(safeFloor);
        setIsCalibrating(false);
      }
    };

    requestAnimationFrame(calLoop);
  }, []);

  // 啟動 5 秒錄音
  const startRecording = useCallback(() => {
    // 每次進入錄音，強制重置指針與清空緩衝區 (防上一位資料殘留)
    headPointerRef.current = 0;
    recordedFramesRef.current = 0;
    volumeBufferRef.current.fill(0);
    pitchBufferRef.current.fill(0);
    setRecordedFrames(0);

    if (audioCtxRef.current) {
      recordingStartAudioTimeRef.current = audioCtxRef.current.currentTime;
      // 強制在第 0 毫秒解鎖麥克風硬體 GainNode 回到 1.0 (A/B 45 全域強制解鎖，杜絕 VOL: 0% 卡死)
      if (micGainRef.current) {
        micGainRef.current.gain.cancelScheduledValues(audioCtxRef.current.currentTime);
        micGainRef.current.gain.setValueAtTime(1.0, audioCtxRef.current.currentTime);
      }
    }
    isRecordingRef.current = true;
    muteInput(false);
    calibrateNoiseFloor();

    // 啟動 MediaRecorder 串流錄製 (A/B 36 原音重現 - 跨平台格式自適應)
    audioChunksRef.current = [];
    if (streamRef.current && typeof MediaRecorder !== 'undefined') {
      try {
        const candidateTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/aac',
          'audio/ogg',
        ];
        let mimeType =
          candidateTypes.find((type) => {
            try {
              return MediaRecorder.isTypeSupported(type);
            } catch (_) {
              return false;
            }
          }) || '';

        const options = mimeType ? { mimeType } : undefined;
        const mr = new MediaRecorder(streamRef.current, options);
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        mr.onstop = () => {
          const blobType = mr.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: blobType });
          setUserAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setUserAudioUrl(url);
        };
        mr.start(100);
        mediaRecorderRef.current = mr;
      } catch (e) {
        console.warn('[See How You Speak] MediaRecorder init failed:', e);
      }
    }
  }, [muteInput, calibrateNoiseFloor]);

  // 結束錄音
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
  }, []);

  // 取得聲卡 DAC 硬體已消耗秒數 (A/B 10 精度 0.1ms 零漂移)
  const getElapsedHardwareTime = useCallback(() => {
    if (!audioCtxRef.current || !isRecordingRef.current) return 0;
    return Math.max(0, audioCtxRef.current.currentTime - recordingStartAudioTimeRef.current);
  }, []);

  // 釋放記憶體 Blob URL (Defense 7.31 杜絕記憶體洩漏)
  const clearRecordedAudio = useCallback(() => {
    if (userAudioUrl) {
      URL.revokeObjectURL(userAudioUrl);
    }
    setUserAudioUrl(null);
    setUserAudioBlob(null);
    audioChunksRef.current = [];
  }, [userAudioUrl]);

  // 取得有效切片資料 (傳入 DTW 演算法，防未填滿的 0 破壞分數)
  const getValidRecordings = useCallback(() => {
    const validCount = Math.max(1, Math.min(BUFFER_CAPACITY, recordedFramesRef.current));
    return {
      volume: volumeBufferRef.current.subarray(0, validCount),
      pitch: pitchBufferRef.current.subarray(0, validCount),
    };
  }, []);

  // 60fps 音訊採樣主迴圈
  useEffect(() => {
    if (!isListening) return;

    let animId: number;
    const freqData = new Uint8Array(128);
    const timeData = new Float32Array(512);

    const updateLoop = (now: number) => {
      animId = requestAnimationFrame(updateLoop);

      const analyser = analyserRef.current;
      if (!analyser) return;

      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTimeRef.current) / 1000));
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

      // 3. 麥克風假死心跳偵測 (Liveness check)
      if (rawVol === 0) {
        zeroFramesCountRef.current++;
        if (zeroFramesCountRef.current > 120 && isListening) {
          // 超過 2 秒持續絕對為 0，重新嘗試喚醒 AudioContext
          if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume();
          }
          zeroFramesCountRef.current = 0;
        }
      } else {
        zeroFramesCountRef.current = 0;
      }

      // 4. 時域自相關計算音高 (85Hz ~ 350Hz)
      const sampleRate = audioCtxRef.current?.sampleRate || 44100;
      const { pitchHz, pitchNorm } = detectFundamentalPitch(timeData, sampleRate);

      // 短音快攻瞬態偵測 (Staccato Impulse)
      const volDelta = rawVol - lastRawVolRef.current;
      if (volDelta > 25) {
        lastRiseTimeRef.current = now;
      }
      const isQuickImpulse = now - lastRiseTimeRef.current < 90 && rawVol < smoothVolumeRef.current;
      isStaccatoRef.current = isQuickImpulse;
      lastRawVolRef.current = rawVol;

      // 5. 非對稱自適應彈簧阻尼平滑 (Attack 迅猛 16ms / Decay 雙階自適應)
      const attackSpeed = 1 - Math.exp(-22 * dt);
      const decayCoeff = isQuickImpulse ? 26 : 7;
      const decaySpeed = 1 - Math.exp(-decayCoeff * dt);
      const alpha = rawVol > smoothVolumeRef.current ? attackSpeed : decaySpeed;

      smoothVolumeRef.current += (rawVol - smoothVolumeRef.current) * alpha;
      smoothPitchNormRef.current += (pitchNorm - smoothPitchNormRef.current) * (1 - Math.exp(-12 * dt));

      // A/B 46: 雙重語音活性檢測 (Dual VAD) - 結合人聲音高區間 (85~350Hz)，防止底噪過高卡死
      const hasHumanVoice = pitchHz >= 85 && pitchHz <= 350 && (rawVol > 6 || smoothVolumeRef.current > noiseFloor * 0.75);
      const isVoiceActive = smoothVolumeRef.current > noiseFloor || hasHumanVoice;

      // 個人化指數滑動動態音高基準線 (A/B 14 方案 B)
      if (isVoiceActive) {
        if (pitchBaselineRef.current === 150) {
          pitchBaselineRef.current = pitchHz;
        } else {
          pitchBaselineRef.current += (pitchHz - pitchBaselineRef.current) * (1 - Math.exp(-0.8 * dt));
        }
      }
      // 雙曲正切軟箝位 [-28, +28] px (隱性坑點 7.10 防護)
      const deltaPitch = pitchHz - (pitchBaselineRef.current || 150);
      const pitchYOffset = isVoiceActive ? Math.round(-Math.tanh(deltaPitch / 60) * 28) : 0;

      // 拉長音雙條件滑動窗口判定 (A/B 15, A/B 43 方案 B：加速響應，只要音高穩定即累加)
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
      const isSustained = sustainedDurationRef.current > 0.15;

      // 6. 錄音狀態下記錄至定長環形緩衝池 (0 GC 開銷)
      if (isRecordingRef.current && headPointerRef.current < BUFFER_CAPACITY) {
        const ptr = headPointerRef.current;
        volumeBufferRef.current[ptr] = smoothVolumeRef.current;
        pitchBufferRef.current[ptr] = smoothPitchNormRef.current;
        headPointerRef.current = ptr + 1;
        recordedFramesRef.current = ptr + 1;
        setRecordedFrames(ptr + 1);
      }

      // 7. 更新 React 外部可讀取的分析數值
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
    getElapsedHardwareTime,
    clearRecordedAudio,
  };
}
