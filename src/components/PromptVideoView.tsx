import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PromptScenario } from '../types/speak';
import { Volume2, Sparkles, ArrowRight, Play, RotateCcw } from 'lucide-react';

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  // 0. 全域終止所有音訊與語音播放 (A/B 41, A/B 42, 7.35 零延遲熔斷)
  const stopAllAudio = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

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

    setIsPlaying(false);
    onPlayStateChange?.(false);
  }, [onPlayStateChange]);

  // 1. 核心發聲引擎：雙軌熱抽換 (A/B 38 實體音檔優先，A/B 39 Web Speech TTS 兜底)
  const playDemoVoice = useCallback(() => {
    stopAllAudio();
    setIsPlaying(true);
    setPlayProgress(0);
    onPlayStateChange?.(true);

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

  // 2. 切換情境或初次載入時觸發發音 (A/B 42 單一通道互斥)
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

  // 3. 使用者點擊「換我模仿」時，零延遲強切所有音訊 (A/B 41, 7.35)
  const handleProceedToRecord = () => {
    stopAllAudio();
    onReadyToRecord();
  };

  return (
    <div className="relative z-20 w-full h-screen flex flex-col justify-between pt-20 pb-6 px-4 sm:px-8 max-w-4xl mx-auto font-mono select-none overflow-hidden">
      {/* 1. 頂部情境切換 Tab 列 (A/B 42 切換即中斷前音) */}
      <div className="w-full flex items-center justify-center gap-2 overflow-x-auto py-1">
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider uppercase transition-all cursor-pointer border flex items-center gap-2 ${
                isActive
                  ? 'bg-white/15 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.25)]'
                  : 'bg-black/40 border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: sc.accentColor }}
              />
              <span>{sc.title.split('//')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* 2. 中央核心主卡片 */}
      <div className="w-full my-auto bg-zinc-950/90 border border-white/15 p-6 sm:p-8 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col gap-6 backdrop-blur-xl">
        {/* 卡片頂部資訊列 */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'animate-ping' : ''}`}
              style={{ backgroundColor: scenario.accentColor }}
            />
            <span className="text-xs font-bold text-white tracking-widest uppercase">
              PROMPT DEMO // 原片語氣示範
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] px-2.5 py-0.5 rounded-full border font-bold"
              style={{
                borderColor: `${scenario.themeColor}88`,
                color: scenario.accentColor,
                backgroundColor: `${scenario.themeColor}15`,
              }}
            >
              {scenario.emotion}
            </span>
            {isPlaying && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1 font-bold">
                <Volume2 className="w-3 h-3" />
                示範發聲中
              </span>
            )}
          </div>
        </div>

        {/* 示範台詞主視覺 */}
        <div className="text-center py-2 px-2">
          <p className="text-[11px] text-zinc-500 tracking-widest uppercase mb-2">
            角色定位：{scenario.character}
          </p>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-wide leading-snug max-w-2xl mx-auto">
            「{scenario.line}」
          </h2>
        </div>

        {/* 示範黃金聲波能量柱列 */}
        <div className="w-full bg-black/60 border border-white/10 p-4 rounded-xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5 font-bold">
              <Volume2 className="w-3.5 h-3.5" style={{ color: scenario.accentColor }} />
              標準聲波能量曲線 (REFERENCE WAVEFORM)
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500">
                {isPlaying ? 'PLAYING...' : 'COMPLETED'}
              </span>
              <button
                onClick={playDemoVoice}
                className="text-[11px] text-white bg-white/10 hover:bg-white/20 border border-white/20 px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer font-bold transition-all active:scale-95"
                title="重新播放示範語音"
              >
                <RotateCcw className="w-3 h-3" /> 重播示範原音
              </button>
            </div>
          </div>

          {/* 聲波長條圖 */}
          <div className="h-14 w-full flex items-end justify-between gap-1.5 pt-1">
            {scenario.referenceVolumeCurve.map((val, idx) => {
              const active = (idx / scenario.referenceVolumeCurve.length) * 100 <= playProgress;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-t transition-all duration-150"
                  style={{
                    height: `${Math.max(12, val)}%`,
                    backgroundColor: active ? scenario.accentColor : 'rgba(255,255,255,0.1)',
                    boxShadow: active ? `0 0 12px ${scenario.accentColor}88` : 'none',
                  }}
                />
              );
            })}
          </div>

          {/* 發聲技術指示徽章 */}
          <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
            <span className="flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-emerald-400" />
              {scenario.audioPromptUrl
                ? '高傳真原聲雙軌 (HQ Audio)'
                : ttsSupported
                ? '動態語氣合成 (Web Speech TTS)'
                : '波形視覺示範'}
            </span>
            <span className="text-zinc-400">
              {isPlaying ? '🔇 麥克風已自動靜音防迴音' : '🎙️ 錄音通道已就緒'}
            </span>
          </div>
        </div>

        {/* 挑戰提示 */}
        <div className="text-xs tracking-wider text-center flex items-center justify-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-zinc-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{scenario.hint}</span>
        </div>
      </div>

      {/* 3. 底部啟動按鈕 (A/B 41 零延遲熔斷中斷示範音) */}
      <div className="w-full max-w-md mx-auto pt-2 pb-2">
        <button
          onClick={handleProceedToRecord}
          className="w-full py-3.5 rounded-xl font-black text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-xl active:scale-95 hover:brightness-110"
          style={{
            backgroundColor: scenario.accentColor,
            color: '#000000',
            boxShadow: `0 0 25px ${scenario.themeColor}55`,
          }}
        >
          <Play className="w-4 h-4 fill-current" />
          <span>我聽懂了，換我模仿 (START VOICE CHALLENGE)</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
