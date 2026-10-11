import React, { useState, useEffect } from 'react';
import type { PromptScenario } from '../types/speak';
import { Play, Volume2, Sparkles, ArrowRight } from 'lucide-react';

interface PromptVideoViewProps {
  scenario: PromptScenario;
  onReadyToRecord: () => void;
  onSelectScenario: (scenario: PromptScenario) => void;
  scenarios: PromptScenario[];
}

export const PromptVideoView: React.FC<PromptVideoViewProps> = ({
  scenario,
  onReadyToRecord,
  onSelectScenario,
  scenarios,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);

  // 模擬播放示範台詞與黃金聲波
  useEffect(() => {
    setIsPlaying(true);
    setPlayProgress(0);

    const interval = setInterval(() => {
      setPlayProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsPlaying(false);
          return 100;
        }
        return prev + 2.5; // 約 4 秒播完
      });
    }, 100);

    return () => clearInterval(interval);
  }, [scenario.id]);

  return (
    <div className="relative z-20 flex flex-col items-center justify-between min-h-[80vh] w-full max-w-4xl mx-auto p-4 sm:p-8 font-mono select-none">
      {/* 頂部場景切換器 (供林妤安測試 4 大極端情緒) */}
      <div className="w-full flex flex-wrap items-center justify-center gap-2 mb-6">
        {scenarios.map((sc) => {
          const isActive = sc.id === scenario.id;
          return (
            <button
              key={sc.id}
              onClick={() => onSelectScenario(sc)}
              className={`px-3 py-1.5 text-xs font-bold tracking-wider uppercase border transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                  : 'bg-black/50 text-white/60 border-white/20 hover:border-white/60'
              }`}
            >
              {sc.title.split('//')[0]}
            </button>
          );
        })}
      </div>

      {/* 中央主展示窗 (模擬原片播放器與黃金聲波輪廓) */}
      <div className="w-full bg-[#111111]/90 border border-white/20 p-6 sm:p-8 rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col items-center gap-6">
        <div className="flex items-center justify-between w-full border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full animate-ping"
              style={{ backgroundColor: scenario.themeColor }}
            />
            <span className="text-sm font-bold text-white tracking-widest">
              PROMPT DEMO // 原片示範
            </span>
          </div>
          <span
            className="text-xs px-2 py-0.5 border font-bold"
            style={{ borderColor: scenario.themeColor, color: scenario.themeColor }}
          >
            {scenario.emotion}
          </span>
        </div>

        {/* 示範台詞大字呈現 */}
        <div className="text-center py-6 px-4">
          <p className="text-xs text-white/50 tracking-widest mb-3">
            角色：{scenario.character}
          </p>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-wide leading-tight">
            「{scenario.line}」
          </h2>
        </div>

        {/* 示範黃金聲波動態長條 */}
        <div className="w-full bg-black/60 border border-white/10 p-4 rounded-sm flex flex-col gap-2">
          <div className="flex justify-between text-[11px] text-white/50">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-[#00F0FF]" />
              標準聲波能量曲線 (REFERENCE WAVEFORM)
            </span>
            <span>{isPlaying ? 'PLAYING...' : 'COMPLETED'}</span>
          </div>

          <div className="h-16 w-full flex items-end justify-between gap-1 pt-2">
            {scenario.referenceVolumeCurve.map((val, idx) => {
              const active = (idx / scenario.referenceVolumeCurve.length) * 100 <= playProgress;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-t-sm transition-all duration-150"
                  style={{
                    height: `${val}%`,
                    backgroundColor: active ? scenario.themeColor : 'rgba(255,255,255,0.15)',
                    boxShadow: active ? `0 0 10px ${scenario.themeColor}` : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* 挑戰提示 */}
        <div className="text-xs text-[#00F0FF] tracking-wider text-center flex items-center gap-2 bg-[#00F0FF]/10 border border-[#00F0FF]/30 px-4 py-2 rounded-sm">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{scenario.hint}</span>
        </div>
      </div>

      {/* 底部啟動按鈕 */}
      <div className="w-full max-w-md pt-8">
        <button
          onClick={onReadyToRecord}
          className="w-full py-4 bg-gradient-to-r from-[#FF0055] to-[#7000FF] hover:opacity-90 text-white font-black text-sm tracking-widest uppercase flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,0,85,0.4)] transition-transform active:scale-98 cursor-pointer rounded-sm"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>我聽懂了，換我說話 (START VOICE CHALLENGE)</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
