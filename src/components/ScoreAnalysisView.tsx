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
    <div className="relative z-20 flex flex-col items-center justify-between min-h-[85vh] w-full max-w-4xl mx-auto p-4 sm:p-8 font-mono select-none">
      <div className="w-full bg-[#111111]/90 border border-white/20 p-6 sm:p-8 rounded-sm shadow-[0_0_60px_rgba(0,0,0,0.9)] flex flex-col gap-6">
        {/* 頂部標題 */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 text-xs text-[#00F0FF] tracking-widest">
            <Activity className="w-4 h-4 animate-pulse" />
            <span>DTW 聲學特徵比對完成 // ACOUSTIC ALIGNMENT COMPLETE</span>
          </div>
          <span className="text-xs text-white/40">#{scoreResult.verificationCode}</span>
        </div>

        {/* 中央評分主看板 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 py-4">
          {/* 左側：大分數與評級 */}
          <div className="flex flex-col items-center md:items-start">
            <span className="text-xs text-white/50 tracking-widest">SIMILARITY SCORE</span>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl sm:text-8xl font-black text-[#FFE600] tracking-tight">
                {animatedScore}
              </span>
              <span className="text-xl font-bold text-white/80">%</span>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span
                className="text-2xl sm:text-3xl font-black px-3 py-1 border"
                style={{
                  borderColor: scenario.themeColor,
                  color: scenario.themeColor,
                  boxShadow: `0 0 20px ${scenario.themeColor}55`,
                }}
              >
                {scoreResult.rank}
              </span>
              <span className="text-sm font-bold text-white tracking-wider">
                {scoreResult.rankTitle}
              </span>
            </div>
          </div>

          {/* 右側：雙維度詳細數據 */}
          <div className="flex flex-col gap-4 w-full md:w-80">
            {/* 音量起伏比對 */}
            <div className="bg-white/5 border border-white/10 p-3.5 rounded-sm">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-white/60 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#FF0055]" />
                  音量能量曲線相似度 (60%)
                </span>
                <span className="font-bold text-white">{scoreResult.volumeScore}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FF0055] transition-all duration-1000"
                  style={{ width: `${scoreResult.volumeScore}%` }}
                />
              </div>
            </div>

            {/* 音高走勢比對 */}
            <div className="bg-white/5 border border-white/10 p-3.5 rounded-sm">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-white/60 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#00F0FF]" />
                  音調高低走勢相似度 (40%)
                </span>
                <span className="font-bold text-white">{scoreResult.pitchScore}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00F0FF] transition-all duration-1000"
                  style={{ width: `${scoreResult.pitchScore}%` }}
                />
              </div>
            </div>

            {/* 評語 */}
            <div className="text-xs text-white/70 bg-white/5 border border-white/10 p-3 rounded-sm leading-relaxed">
              💡 {scoreResult.comment}
            </div>
          </div>
        </div>

        {/* 示範台詞回顧 */}
        <div className="text-xs text-white/40 border-t border-white/10 pt-3 text-center">
          挑戰台詞：『{scenario.line}』
        </div>
      </div>

      {/* 底部按鈕 */}
      <div className="w-full max-w-md flex flex-col sm:flex-row gap-3 pt-6">
        <button
          onClick={onProceedToExport}
          className="flex-1 py-4 bg-[#00F0FF] hover:bg-[#00d0df] text-black font-black text-sm tracking-widest uppercase flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(0,240,255,0.4)] transition-transform active:scale-98 cursor-pointer rounded-sm"
        >
          <Award className="w-4 h-4" />
          <span>生成聲音視覺卡片 (GENERATE CARD)</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onTryAgain}
          className="py-4 px-6 bg-transparent border border-white/30 hover:border-white text-white font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer rounded-sm"
        >
          <RotateCcw className="w-4 h-4" />
          <span>再試一次</span>
        </button>
      </div>
    </div>
  );
};
