import React, { useEffect, useState } from 'react';
import type { FsmState, KineticStats, ThemeConfig } from '../types/pulse';
import { playCountdownTick } from '../services/soundEngine';
import { Scan, UserCheck } from 'lucide-react';

interface IdleViewProps {
  fsmState: FsmState;
  stats: KineticStats;
  theme: ThemeConfig;
  onActivate: () => void;
  onAudioUnlockClick: () => void;
  isAudioUnlocked: boolean;
}

export const IdleView: React.FC<IdleViewProps> = ({
  fsmState,
  stats,
  theme,
  onActivate,
  onAudioUnlockClick,
  isAudioUnlocked,
}) => {
  const [countdown, setCountdown] = useState(theme.gameplay.countdownSeconds);
  const [isCounting, setIsCounting] = useState(false);

  // 偵測到人體進入畫面中央且有基本動能，啟動倒數
  useEffect(() => {
    if (fsmState !== 'IDLE' && fsmState !== 'COUNTDOWN') {
      setIsCounting(false);
      return;
    }

    // 當檢測到人體或游標「正在移動」且動能大於門檻，才啟動 3 秒預備倒數
    const hasActiveMotion = stats.smoothVelocity > 0.08;

    if (hasActiveMotion && !isCounting && fsmState === 'IDLE') {
      setIsCounting(true);
      setCountdown(theme.gameplay.countdownSeconds);
      playCountdownTick(false);
    }
  }, [stats.smoothVelocity, isCounting, fsmState, theme.gameplay.countdownSeconds]);

  // 3秒倒數計時器
  useEffect(() => {
    if (!isCounting) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          playCountdownTick(true);
          onActivate();
          return 0;
        } else {
          playCountdownTick(false);
          return prev - 1;
        }
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isCounting, onActivate]);

  if (fsmState !== 'IDLE' && fsmState !== 'COUNTDOWN') {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center font-mono pointer-events-auto cursor-pointer"
      onClick={onAudioUnlockClick}
    >
      {/* 首次點擊喚醒音效提詞 (Autoplay Policy Audio Unlock Hint) */}
      {!isAudioUnlocked && (
        <div className="absolute top-24 px-4 py-2 bg-[#FF007A]/80 border border-white/40 text-white text-xs tracking-widest animate-pulse backdrop-blur-md">
          ⚡ TAP ANYWHERE TO UNLOCK FULL WEB AUDIO ENGINE
        </div>
      )}

      {/* 中央雷達掃描與感測框 (Central Sensing ROI Box) */}
      <div className="relative w-[340px] h-[500px] border-2 border-white/20 flex flex-col items-center justify-between p-6">
        {/* 四角準心 (Crosshair Corners) */}
        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-[#00F0FF]" />
        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-[#00F0FF]" />
        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-[#00F0FF]" />
        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-[#00F0FF]" />

        {/* 雷達掃描圓環與旋轉射線 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 rounded-full border border-[#00F0FF]/15 animate-ping opacity-25" />
          <div className="w-72 h-72 rounded-full border border-white/10" />
          <div className="w-80 h-80 rounded-full border border-[#00F0FF]/20 relative animate-radar">
            <div className="absolute top-1/2 left-1/2 w-1/2 h-0.5 bg-gradient-to-r from-transparent to-[#00F0FF]" />
          </div>
        </div>

        {/* 頂部引導文字 */}
        <div className="flex items-center gap-2 text-xs tracking-widest text-[#00F0FF] z-10">
          <Scan className="w-4 h-4 animate-spin" />
          <span>ROI SENSING ZONE</span>
        </div>

        {/* 中央內容：待機引導 vs 倒數 3..2..1 */}
        {isCounting ? (
          <div className="flex flex-col items-center z-10 animate-scale">
            <span className="text-[11px] text-[#FFE600] tracking-widest mb-2">
              PREPARE KINETIC ENERGY
            </span>
            <div className="text-8xl font-black text-[#FFE600] tracking-tighter drop-shadow-[0_0_20px_#FFE600]">
              {countdown}
            </div>
            <span className="text-xs text-white/70 tracking-widest mt-3">
              GET READY TO MOVE!
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center z-10">
            <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center bg-black/40">
              <UserCheck className="w-8 h-8 text-[#00F0FF] animate-pulse" />
            </div>
            <div>
              <p className="text-lg font-black tracking-widest text-white">
                STAND IN THE BOX
              </p>
              <p className="text-xs text-[#00F0FF] tracking-wider mt-1">
                TO ACTIVATE 30S PULSE
              </p>
            </div>
            <span className="text-[10px] text-white/40 tracking-widest border border-white/10 px-3 py-1">
              OR CLICK TO START MANUALLY
            </span>
          </div>
        )}

        {/* 底部輔助標籤 */}
        <div className="text-[10px] text-white/40 tracking-widest z-10">
          PULSE LAB // POSITION CALIBRATION
        </div>
      </div>
    </div>
  );
};
