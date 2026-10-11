import React, { useState, useEffect } from 'react';
import type { ScoreResult, PromptScenario } from '../types/speak';
import { Award, Zap, Activity, ArrowRight, RotateCcw } from 'lucide-react';

interface ScoreAnalysisViewProps {
  scoreResult: ScoreResult;
  scenario: PromptScenario;
  onProceedToExport: () => void;
  onTryAgain: () => void;
}

export const ScoreAnalysisView: React.FC<ScoreAnalysisViewProps> = ({
  scoreResult,
  scenario,
  onProceedToExport,
  onTryAgain,
}) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  // 數字滾動跳動效果
  useEffect(() => {
    let start = 0;
    const end = scoreResult.overallScore;
    const duration = 1200;
    const startTime = performance.now();

    const frame = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Ease out cubic
      const current = Math.round(start + (end - start) * (1 - Math.pow(1 - progress, 3)));
      setAnimatedScore(current);

      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  }, [scoreResult.overallScore]);

  return (
    <div className="relative z-20 w-full h-screen flex flex-col justify-between pt-20 pb-6 px-4 sm:px-8 max-w-4xl mx-auto font-mono select-none overflow-hidden">
      {/* 中央主卡片 */}
      <div className="w-full my-auto bg-zinc-950/90 border border-white/15 p-6 sm:p-8 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col gap-5 backdrop-blur-xl">
        {/* 頂部標題 */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-xs text-white tracking-widest">
            <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="font-bold">DTW 聲學特徵比對完成 // ACOUSTIC ALIGNMENT COMPLETE</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">#{scoreResult.verificationCode}</span>
        </div>

        {/* 中央評分主看板 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-2">
          {/* 左側：大分數與評級 */}
          <div className="flex flex-col items-center md:items-start">
            <span className="text-[11px] text-zinc-500 tracking-widest uppercase">
              SIMILARITY SCORE
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span
                className="text-6xl sm:text-7xl font-black tracking-tight"
                style={{ color: scenario.accentColor }}
              >
                {animatedScore}
              </span>
              <span className="text-lg font-bold text-zinc-500">/ 100</span>
            </div>

            <div className="flex items-center gap-2.5 mt-2">
              <span
                className="text-xl sm:text-2xl font-black px-3 py-0.5 rounded border"
                style={{
                  borderColor: scenario.themeColor,
                  color: scenario.accentColor,
                  backgroundColor: `${scenario.themeColor}20`,
                  boxShadow: `0 0 20px ${scenario.themeColor}44`,
                }}
              >
                {scoreResult.rank}
              </span>
              <span className="text-xs font-bold text-white tracking-wider">
                {scoreResult.rankTitle}
              </span>
            </div>
          </div>

          {/* 右側：雙維度詳細數據 */}
          <div className="flex flex-col gap-3 w-full md:w-80">
            {/* 音量起伏比對 */}
            <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" style={{ color: scenario.themeColor }} />
                  音量能量起伏相似度 (60%)
                </span>
                <span className="font-bold text-white">{scoreResult.volumeScore}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${scoreResult.volumeScore}%`,
                    backgroundColor: scenario.themeColor,
                  }}
                />
              </div>
            </div>

            {/* 音高走勢比對 */}
            <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" style={{ color: scenario.accentColor }} />
                  音調高低走勢相似度 (40%)
                </span>
                <span className="font-bold text-white">{scoreResult.pitchScore}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${scoreResult.pitchScore}%`,
                    backgroundColor: scenario.accentColor,
                  }}
                />
              </div>
            </div>

            {/* 評語 */}
            <div className="text-xs text-zinc-300 bg-white/5 border border-white/10 p-2.5 rounded-xl leading-relaxed">
              💡 {scoreResult.comment}
            </div>
          </div>
        </div>

        {/* 示範台詞回顧 */}
        <div className="text-xs text-zinc-400 border-t border-white/10 pt-3 text-center">
          挑戰台詞：『{scenario.line}』
        </div>
      </div>

      {/* 底部按鈕 */}
      <div className="w-full max-w-md mx-auto flex gap-3 pt-2 pb-2">
        <button
          onClick={onProceedToExport}
          className="flex-1 py-3.5 rounded-xl font-black text-xs sm:text-sm tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl active:scale-95"
          style={{
            backgroundColor: scenario.accentColor,
            color: '#000000',
            boxShadow: `0 0 25px ${scenario.themeColor}55`,
          }}
        >
          <Award className="w-4 h-4" />
          <span>生成聲音視覺卡片 (GENERATE CARD)</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onTryAgain}
          className="py-3.5 px-5 bg-white/5 border border-white/20 hover:bg-white/15 text-white font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer rounded-xl"
        >
          <RotateCcw className="w-4 h-4" />
          <span>重試</span>
        </button>
      </div>
    </div>
  );
};
