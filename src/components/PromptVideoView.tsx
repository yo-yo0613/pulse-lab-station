import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PromptScenario, AudioMetrics } from '../types/speak';
import { Volume2, Sparkles, ArrowRight, Play, RotateCcw } from 'lucide-react';
import { KineticTypography } from './KineticTypography';

const emptyFreq = new Uint8Array(32);
const emptyWave = new Float32Array(32);

const defaultAudioMetrics: AudioMetrics = {
  rawVolume: 0,
  smoothVolume: 0,
  pitchHz: 150,
  pitchNormalized: 0.5,
  pitchYOffset: 0,
  sustainedDuration: 0,
  isSustained: false,
  isStaccato: false,
  isVoiceActive: false,
  frequencyData: emptyFreq,
  waveform: emptyWave,
};

interface PromptVideoViewProps {
  scenario: PromptScenario;
  onReadyToRecord: () => void;
  onSelectScenario: (scenario: PromptScenario) => void;
  scenarios: PromptScenario[];
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export const PromptVideoView: React.FC<PromptVideoViewProps> = ({
  scenario,
  onReadyToRecord,
  onSelectScenario,
  scenarios,
  onPlayStateChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const [ttsSupported, setTtsSupported] = useState(true);
  const [demoAudioMetrics, setDemoAudioMetrics] = useState<AudioMetrics>(defaultAudioMetrics);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const demoRafRef = useRef<number | null>(null);
  const sustainedDurationRef = useRef<number>(0);
  const lastDemoTimeRef = useRef<number>(performance.now());

  // 0. 全域終止所有音訊、視訊與語音播放 (A/B 41, A/B 42, 7.35 零延遲熔斷)
  const stopAllAudio = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (demoRafRef.current) {
      cancelAnimationFrame(demoRafRef.current);
      demoRafRef.current = null;
    }
    sustainedDurationRef.current = 0;
    setDemoAudioMetrics(defaultAudioMetrics);

    // 終止 Web Speech API TTS 並解除強引用 (7.33)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      (window as any).__activeUtterance = null;
    }

    // 終止 HTMLAudio 實體示範音檔
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // 終止 HTMLVideo 實體示範影片 (A/B 54, 7.48 GPU 解碼資源防死鎖)
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    setIsPlaying(false);
    onPlayStateChange?.(false);
  }, [onPlayStateChange]);

  // 1. 核心發聲/視訊引擎：三軌熱抽換 (A/B 53 示範影片優先，A/B 38 實體音檔次之，A/B 39 Web Speech TTS 兜底)
  const playDemoVoice = useCallback(() => {
    stopAllAudio();
    setIsPlaying(true);
    setPlayProgress(0);
    onPlayStateChange?.(true);

    // 軌道 S：若有示範影片 (MOV / MP4)，優先透過視訊元素播放
    if (scenario.videoPromptUrl && videoRef.current) {
      const video = videoRef.current;
      video.currentTime = 0;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('[VideoPrompt] 自動播放受阻 (需要使用者交互):', err);
          setIsPlaying(false);
          onPlayStateChange?.(false);
        });
      return;
    }

    // 軌道 A：若有實體原音音檔 (MP3 / WAV)，優先播放
    if (scenario.audioPromptUrl) {
      const audio = new Audio(scenario.audioPromptUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration > 0) {
          setPlayProgress(Math.min(100, (audio.currentTime / audio.duration) * 100));
        }
      };

      audio.onended = () => {
        setPlayProgress(100);
        setIsPlaying(false);
        onPlayStateChange?.(false);
      };

      audio.onerror = () => {
        console.warn(`[AudioPrompt] 實體音檔載入失敗: ${scenario.audioPromptUrl}，降級切換至 Web Speech TTS`);
        fallbackWebSpeech();
      };

      audio.play().catch((err) => {
        console.warn('[AudioPrompt] 自動播放受阻，降級切換至 TTS:', err);
        fallbackWebSpeech();
      });
      return;
    }

    // 軌道 B：Web Speech API 情感合成 (A/B 39)
    fallbackWebSpeech();

    function fallbackWebSpeech() {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setTtsSupported(false);
        simulateVisualProgress();
        return;
      }

      setTtsSupported(true);
      const textToSpeak = scenario.line;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);

      // 防垃圾回收靜音 Bug：全域強引用鎖定 (Defense 7.33)
      (window as any).__activeUtterance = utterance;

      // 情緒語氣映射 (A/B 39)
      utterance.pitch = scenario.ttsConfig?.pitch ?? 1.0;
      utterance.rate = scenario.ttsConfig?.rate ?? 1.0;
      utterance.volume = 1.0;

      // 優先挑選台灣繁中語系 (cmn-Hant-TW / zh-TW)
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.lang === 'zh-TW' || v.lang === 'cmn-Hant-TW') ||
        voices.find((v) => v.lang.startsWith('zh')) ||
        null;
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      // 計算預估時長並啟動聲波動畫進度條
      const estimatedMs = Math.max(1800, (textToSpeak.length / (utterance.rate || 1)) * 260);
      const stepInterval = 50;
      const progressIncrement = (stepInterval / estimatedMs) * 100;

      progressTimerRef.current = window.setInterval(() => {
        setPlayProgress((prev) => {
          if (prev >= 98) {
            return 98; // 等待真實 onend 觸發 100%
          }
          return prev + progressIncrement;
        });
      }, stepInterval);

      utterance.onend = () => {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        (window as any).__activeUtterance = null;
        setPlayProgress(100);
        setIsPlaying(false);
        onPlayStateChange?.(false);
      };

      utterance.onerror = (e) => {
        console.warn('[TTS] 合成中斷或報錯:', e);
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        (window as any).__activeUtterance = null;
        setIsPlaying(false);
        onPlayStateChange?.(false);
      };

      window.speechSynthesis.speak(utterance);
    }

    function simulateVisualProgress() {
      const step = 3;
      progressTimerRef.current = window.setInterval(() => {
        setPlayProgress((prev) => {
          if (prev >= 100) {
            if (progressTimerRef.current) clearInterval(progressTimerRef.current);
            setIsPlaying(false);
            onPlayStateChange?.(false);
            return 100;
          }
          return prev + step;
        });
      }, 100);
    }
  }, [scenario, stopAllAudio, onPlayStateChange]);

  // 2. 60FPS 動態字體示範插值器 (A/B 58, A/B 60, Defense 7.52)
  // 當示範音訊/影片播放時，高頻插值標準曲線驅動 KineticTypography 形變
  useEffect(() => {
    if (!isPlaying) {
      if (demoRafRef.current) {
        cancelAnimationFrame(demoRafRef.current);
        demoRafRef.current = null;
      }
      sustainedDurationRef.current = 0;
      setDemoAudioMetrics(defaultAudioMetrics);
      return;
    }

    lastDemoTimeRef.current = performance.now();

    const updateDemoMetrics = () => {
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastDemoTimeRef.current) / 1000);
      lastDemoTimeRef.current = now;

      let progress = 0;
      if (videoRef.current && videoRef.current.duration > 0) {
        progress = Math.min(1, Math.max(0, videoRef.current.currentTime / videoRef.current.duration));
      } else if (audioRef.current && audioRef.current.duration > 0) {
        progress = Math.min(1, Math.max(0, audioRef.current.currentTime / audioRef.current.duration));
      } else {
        progress = Math.min(1, Math.max(0, playProgress / 100));
      }

      const volCurve = scenario.referenceVolumeCurve || [20, 50, 80, 50, 20];
      const pitchCurve = scenario.referencePitchCurve || [0.5, 0.6, 0.7, 0.5, 0.4];

      // 線性平滑插值 (Linear Interpolation across golden curves)
      const N = volCurve.length;
      const fIdx = progress * (N - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(N - 1, i0 + 1);
      const ratio = fIdx - i0;

      const volume = volCurve[i0] + (volCurve[i1] - volCurve[i0]) * ratio;
      const pitchNorm = pitchCurve[i0] + (pitchCurve[i1] - pitchCurve[i0]) * ratio;

      // 持音累積 (音量超過門檻時持續拉長，驅動 scaleX 橫向延展)
      if (volume > 35) {
        sustainedDurationRef.current += dt;
      } else {
        sustainedDurationRef.current = Math.max(0, sustainedDurationRef.current - dt * 2.5);
      }

      const pitchHz = Math.round(80 + pitchNorm * 420);
      // 高音向上浮動 (-20px ~ +15px)
      const pitchYOffset = -((pitchNorm - 0.5) * 30);

      setDemoAudioMetrics({
        rawVolume: volume,
        smoothVolume: volume,
        pitchHz,
        pitchNormalized: pitchNorm,
        pitchYOffset,
        sustainedDuration: sustainedDurationRef.current,
        isSustained: sustainedDurationRef.current > 0.4,
        isStaccato: false,
        isVoiceActive: volume > 18,
        frequencyData: emptyFreq,
        waveform: emptyWave,
      });

      demoRafRef.current = requestAnimationFrame(updateDemoMetrics);
    };

    demoRafRef.current = requestAnimationFrame(updateDemoMetrics);

    return () => {
      if (demoRafRef.current) {
        cancelAnimationFrame(demoRafRef.current);
        demoRafRef.current = null;
      }
    };
  }, [isPlaying, scenario, playProgress]);

  // 3. 切換情境或初次載入時觸發發音 (A/B 42 單一通道互斥)
  useEffect(() => {
    // 延遲 150ms 確保瀏覽器音訊解鎖與語音列表就緒
    const timer = setTimeout(() => {
      playDemoVoice();
    }, 150);

    return () => {
      clearTimeout(timer);
      stopAllAudio();
    };
  }, [scenario.id, playDemoVoice, stopAllAudio]);

  // 4. 使用者點擊「換我模仿」時，零延遲強切所有音訊 (A/B 41, 7.35)
  const handleProceedToRecord = () => {
    stopAllAudio();
    onReadyToRecord();
  };

  return (
    <div className="relative z-20 w-full min-h-screen flex flex-col justify-between pt-16 sm:pt-24 pb-8 px-3 sm:px-8 max-w-5xl mx-auto font-mono select-none overflow-y-auto">
      {/* 1. 頂部情境切換 Tab 列 (手機端緊湊平鋪可橫向滾動) */}
      <div className="w-full flex items-center justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto py-1 sm:py-2 mb-1 sm:mb-2 shrink-0 no-scrollbar">
        {scenarios.map((sc) => {
          const isActive = sc.id === scenario.id;
          return (
            <button
              key={sc.id}
              onClick={() => {
                if (sc.id !== scenario.id) {
                  stopAllAudio();
                  onSelectScenario(sc);
                }
              }}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase transition-all cursor-pointer border flex items-center gap-1.5 sm:gap-2 shrink-0 ${
                isActive
                  ? 'bg-white/15 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                  : 'bg-black/60 border-white/15 text-zinc-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span
                className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0"
                style={{ backgroundColor: sc.accentColor }}
              />
              <span className="whitespace-nowrap">{sc.title.split('//')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* 2. 中央核心主卡片：手機上下流暢單欄 + 桌面左右雙欄 */}
      <div className="w-full my-auto bg-zinc-950/90 border border-white/15 p-4 sm:p-7 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-xl flex flex-col gap-4 sm:gap-5">
        {/* 卡片頂部資訊列 (單行響應式適配) */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5 sm:pb-3 gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${isPlaying ? 'animate-ping' : ''}`}
              style={{ backgroundColor: scenario.accentColor }}
            />
            <span className="text-[10px] sm:text-xs font-bold text-white tracking-widest uppercase truncate">
              PROMPT DEMO
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span
              className="text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 rounded-full border font-bold truncate max-w-[150px] sm:max-w-none text-right"
              style={{
                borderColor: `${scenario.themeColor}88`,
                color: scenario.accentColor,
                backgroundColor: `${scenario.themeColor}15`,
              }}
            >
              {scenario.emotion}
            </span>
            {isPlaying && (
              <span className="text-[9px] sm:text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 sm:px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1 font-bold shrink-0">
                <Volume2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                示範中
              </span>
            )}
          </div>
        </div>

        {/* 核心佈局：手機上下單欄 / 桌面左右雙欄 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-center">
          {/* 左欄：示範影片播放器 + 標準聲波能量曲線 */}
          <div className="flex flex-col gap-3 sm:gap-4">
            {scenario.videoPromptUrl && (
              <div className="w-full rounded-xl overflow-hidden border border-white/20 bg-black/90 shadow-[0_0_30px_rgba(0,0,0,0.8)] relative group aspect-video max-h-[190px] sm:max-h-none flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  preload="auto"
                  className="w-full h-full object-contain mx-auto"
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (v.duration > 0) {
                      setPlayProgress(Math.min(100, (v.currentTime / v.duration) * 100));
                    }
                  }}
                  onEnded={() => {
                    setPlayProgress(100);
                    setIsPlaying(false);
                    onPlayStateChange?.(false);
                  }}
                >
                  <source src={scenario.videoPromptUrl} type="video/mp4" />
                  <source src={scenario.videoPromptUrl.replace('.mp4', '.mov')} type="video/quicktime" />
                  您的瀏覽器不支援內嵌示範影片播放。
                </video>
                {!isPlaying && (
                  <div
                    onClick={playDemoVoice}
                    className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center cursor-pointer transition-opacity group-hover:bg-black/20"
                  >
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 active:scale-95"
                      style={{ backgroundColor: scenario.accentColor, color: '#000000' }}
                    >
                      <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 示範黃金聲波能量柱列 */}
            <div className="w-full bg-black/60 border border-white/10 p-2.5 sm:p-3.5 rounded-xl flex flex-col gap-1.5 sm:gap-2">
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400">
                <span className="flex items-center gap-1 sm:gap-1.5 font-bold truncate">
                  <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color: scenario.accentColor }} />
                  標準聲波能量
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] sm:text-[10px] text-zinc-500">
                    {isPlaying ? 'PLAYING' : 'READY'}
                  </span>
                  <button
                    onClick={playDemoVoice}
                    className="text-[9px] sm:text-[10px] text-white bg-white/10 hover:bg-white/20 border border-white/20 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer font-bold transition-all active:scale-95"
                    title="重新播放示範語音"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> 重播
                  </button>
                </div>
              </div>

              {/* 聲波長條圖 */}
              <div className="h-8 sm:h-10 w-full flex items-end justify-between gap-1 pt-1">
                {scenario.referenceVolumeCurve.map((val, idx) => {
                  const active = (idx / scenario.referenceVolumeCurve.length) * 100 <= playProgress;
                  return (
                    <div
                      key={idx}
                      className="flex-1 rounded-t transition-all duration-150"
                      style={{
                        height: `${Math.max(12, val)}%`,
                        backgroundColor: active ? scenario.accentColor : 'rgba(255,255,255,0.1)',
                        boxShadow: active ? `0 0 10px ${scenario.accentColor}88` : 'none',
                      }}
                    />
                  );
                })}
              </div>

              {/* 發聲技術指示徽章 */}
              <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-zinc-500 pt-0.5">
                <span className="flex items-center gap-1 truncate">
                  <Volume2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400 shrink-0" />
                  {scenario.audioPromptUrl
                    ? 'HQ 原聲'
                    : ttsSupported
                    ? '語氣合成 (TTS)'
                    : '波形示範'}
                </span>
                <span className="text-zinc-400 shrink-0">
                  {isPlaying ? '🔇 麥克風已靜音' : '🎙️ 錄音就緒'}
                </span>
              </div>
            </div>
          </div>

          {/* 右欄：台詞主視覺 + 挑戰提示 + 啟動模仿大按鈕 */}
          <div className="flex flex-col justify-between gap-3 sm:gap-5 h-full">
            <div className="flex flex-col gap-2 sm:gap-3 text-left">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                  角色：
                </span>
                <span
                  className="text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded border"
                  style={{
                    color: scenario.accentColor,
                    borderColor: `${scenario.themeColor}66`,
                    backgroundColor: `${scenario.themeColor}15`,
                  }}
                >
                  {scenario.character}
                </span>
              </div>

              <div className="py-1 sm:py-2 flex flex-col items-start w-full">
                <div className="flex items-center justify-between w-full mb-1">
                  <p className="text-[10px] sm:text-[11px] text-zinc-500 tracking-wider">
                    // 原片語調示範動態字體：
                  </p>
                  {isPlaying && (
                    <span className="text-[9px] text-amber-400 font-mono tracking-wider animate-pulse flex items-center gap-1 font-bold">
                      VOL: {Math.round(demoAudioMetrics.smoothVolume)}% | {demoAudioMetrics.pitchHz}Hz
                    </span>
                  )}
                </div>
                <div className="w-full min-h-[110px] sm:min-h-[140px] flex items-center justify-center bg-black/40 border border-white/10 rounded-xl px-2 py-4 overflow-visible relative">
                  <KineticTypography
                    text={scenario.line}
                    audioMetrics={demoAudioMetrics}
                    noiseFloor={15}
                    themeColor={scenario.themeColor}
                    accentColor={scenario.accentColor}
                    variant="preview"
                  />
                </div>
              </div>

              {/* 挑戰提示 */}
              <div className="text-[11px] sm:text-xs tracking-wider flex items-center gap-2 bg-white/5 border border-white/10 p-2.5 sm:p-3 rounded-xl text-zinc-300">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                <span>{scenario.hint}</span>
              </div>
            </div>

            {/* 啟動按鈕 (點擊直接進入錄音，A/B 41 零延遲熔斷示範音) */}
            <div className="w-full pt-1 sm:pt-2 pb-2">
              <button
                onClick={handleProceedToRecord}
                className="w-full py-3.5 sm:py-4 rounded-xl font-black text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl active:scale-95 hover:brightness-110"
                style={{
                  backgroundColor: scenario.accentColor,
                  color: '#000000',
                  boxShadow: `0 0 30px ${scenario.themeColor}66`,
                }}
              >
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                <span>換我模仿 (START CHALLENGE)</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 底部輔助空間 */}
      <div className="w-full py-1 text-center shrink-0">
        <span className="text-[9px] sm:text-[10px] text-zinc-500">
          SEE HOW YOU SPEAK // 聲音的形狀，由你決定
        </span>
      </div>
    </div>
  );
};
