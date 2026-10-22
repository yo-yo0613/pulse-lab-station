import React, { useState, useEffect } from 'react';
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

  // 模擬播放示範台詞與黃金聲波 (播放期間通知父層鎖定聲控，防喇叭自激迴圈 - 7.22)
  useEffect(() => {
    setIsPlaying(true);
    onPlayStateChange?.(true);
    setPlayProgress(0);

    const interval = setInterval(() => {
      setPlayProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPlaying(false);
          onPlayStateChange?.(false);
          return 100;
        }
        return prev + 3; // 約 3.3 秒播完
      });
    }, 100);

    return () => {
      clearInterval(interval);
      onPlayStateChange?.(false);
    };
  }, [scenario.id, onPlayStateChange]);

  const handleReplay = () => {
    setIsPlaying(true);
    onPlayStateChange?.(true);
    setPlayProgress(0);
    const interval = setInterval(() => {
      setPlayProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPlaying(false);
          onPlayStateChange?.(false);
          return 100;
        }
        return prev + 3;
      });
    }, 100);
  };

  return (
    <div className="relative z-20 w-full h-screen flex flex-col justify-between pt-20 pb-6 px-4 sm:px-8 max-w-4xl mx-auto font-mono select-none overflow-hidden">
      {/* 1. 頂部情境切換 Tab 列 (整齊居中，避免與全域 Header 碰撞) */}
      <div className="w-full flex items-center justify-center gap-2 overflow-x-auto py-1">
        {scenarios.map((sc) => {
          const isActive = sc.id === scenario.id;
          return (
            <button
              key={sc.id}
              onClick={() => onSelectScenario(sc)}
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

      {/* 2. 中央核心主卡片 (自適應縮放，確保 100vh 內絕不溢出) */}
      <div className="w-full my-auto bg-zinc-950/90 border border-white/15 p-6 sm:p-8 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col gap-6 backdrop-blur-xl">
        {/* 卡片頂部資訊列 */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full animate-ping"
              style={{ backgroundColor: scenario.accentColor }}
            />
            <span className="text-xs font-bold text-white tracking-widest uppercase">
              PROMPT DEMO // 原片語氣示範
            </span>
          </div>
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
        </div>

        {/* 示範台詞主視覺 (優化斷句與行距) */}
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
                onClick={handleReplay}
                className="text-[10px] text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
                title="重新播放聲波"
              >
                <RotateCcw className="w-3 h-3" /> 重播
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
        </div>

        {/* 挑戰提示 */}
        <div className="text-xs tracking-wider text-center flex items-center justify-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-zinc-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{scenario.hint}</span>
        </div>
      </div>

      {/* 3. 底部啟動按鈕 (始終可見，不被任何邊界截斷) */}
      <div className="w-full max-w-md mx-auto pt-2 pb-2">
        <button
          onClick={onReadyToRecord}
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
