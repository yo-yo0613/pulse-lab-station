import React from 'react';
import type { FsmState, KineticStats, ThemeConfig } from '../types/pulse';
import { calculateRank } from '../utils/math';
import { Zap, ShieldAlert, Cpu, Activity, Clock } from 'lucide-react';

interface HudOverlayProps {
  fsmState: FsmState;
  stats: KineticStats;
  theme: ThemeConfig;
  remainingSeconds: number;
  onAdminTap: () => void;
  wakeLockActive: boolean;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  fsmState,
  stats,
  theme,
  remainingSeconds,
  onAdminTap,
  wakeLockActive,
}) => {
  const currentRank = calculateRank(stats.pulseScore);
  const isSurge = stats.isSurge;

  // 動能條顏色梯度
  const getKineticColor = (val: number) => {
    if (val >= theme.gameplay.surgeThreshold) return theme.particles.peakColor;
    if (val >= 40) return theme.particles.midColor;
    return theme.particles.baseColor;
  };

  const currentColor = getKineticColor(stats.kineticIndex);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-20 overflow-hidden font-mono select-none">
      {/* 頂部數據列 (Top Bar) */}
      <div className="flex items-start justify-between w-full">
        {/* 左上品牌與系統狀態 (含維護者5次點擊暗樁) */}
        <div className="flex flex-col gap-1 pointer-events-auto cursor-pointer" onClick={onAdminTap}>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#00F0FF] animate-pulse" />
            <h1 className="text-2xl font-black tracking-widest text-white">
              {theme.branding.mainTitle}
            </h1>
            <span className="text-xs px-2 py-0.5 border border-[#00F0FF]/40 text-[#00F0FF] font-bold">
              KINETIC V2.6
            </span>
          </div>
          <p className="text-xs text-white/50 tracking-wider">
            {theme.branding.subTitle}
          </p>

          <div className="flex items-center gap-3 mt-2 text-[10px] text-white/40 tracking-wider">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[#00F0FF]" /> 60FPS AIR-GAPPED
            </span>
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-[#FF007A]" /> 100% OFFLINE
            </span>
            {wakeLockActive && (
              <span className="text-[#FFE600] flex items-center gap-1">
                <Zap className="w-3 h-3" /> WAKE-LOCK ON
              </span>
            )}
            {stats.isEmulated && (
              <span className="text-[#FF007A] flex items-center gap-1 font-bold animate-pulse">
                <ShieldAlert className="w-3 h-3" /> [CURSOR EMULATION]
              </span>
            )}
          </div>
        </div>

        {/* 中上方：30 秒倒數計時器 (只在 ACTIVE 時高亮顯示) */}
        {fsmState === 'ACTIVE' && (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 px-5 py-2 bg-black/70 border border-white/20 backdrop-blur-md">
              <Clock className="w-5 h-5 text-[#FFE600] animate-pulse" />
              <span className="text-xs text-white/60 tracking-widest">SESSION TIME</span>
              <span className="text-4xl font-black tracking-tighter text-[#FFE600] min-w-[70px] text-right">
                {String(remainingSeconds).padStart(2, '0')}s
              </span>
            </div>

            {/* 微型進度條 */}
            <div className="w-48 h-1 bg-white/10 mt-1 overflow-hidden">
              <div
                className="h-full bg-[#FFE600] transition-all duration-100"
                style={{
                  width: `${(remainingSeconds / theme.gameplay.sessionDurationSeconds) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 右上方：累積能量分數 (PULSE SCORE) */}
        <div className="flex flex-col items-end">
          <span className="text-[11px] text-white/40 tracking-widest">PULSE SCORE</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight text-white">
              {stats.pulseScore.toLocaleString()}
            </span>
            <span className="text-sm font-bold text-[#00F0FF]">PTS</span>
          </div>

          {/* 成就勳章 */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-white/40">CURRENT RANK:</span>
            <span
              className="text-xs font-black px-2 py-0.5 border"
              style={{
                color: currentRank.badgeColor,
                borderColor: currentRank.badgeColor,
                boxShadow: `0 0 10px ${currentRank.badgeColor}33`,
              }}
            >
              {currentRank.rank} // {currentRank.title}
            </span>
          </div>
        </div>
      </div>

      {/* 中間高動能爆發提示 (Kinetic Surge Alert) */}
      {fsmState === 'ACTIVE' && isSurge && (
        <div className="self-center flex flex-col items-center gap-1 animate-bounce">
          <div className="px-6 py-2 bg-[#FFE600] text-black font-black text-xl tracking-widest flex items-center gap-2 shadow-[0_0_30px_#FFE600]">
            <Zap className="w-6 h-6 fill-black" />
            <span>KINETIC SURGE // OVERDRIVE</span>
            <Zap className="w-6 h-6 fill-black" />
          </div>
          <span className="text-[10px] text-[#FFE600] tracking-widest uppercase">
            MAXIMUM ENERGY DETECTED
          </span>
        </div>
      )}

      {/* 底部數據儀表 (Bottom Bar) */}
      <div className="flex flex-col gap-2 w-full">
        {/* 動能百分比條 (Kinetic Index Bar) */}
        <div className="flex items-center justify-between text-xs text-white/60 mb-1">
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00F0FF]" />
            <span>REAL-TIME KINETIC ENERGY</span>
          </span>
          <span className="font-bold text-sm" style={{ color: currentColor }}>
            {stats.kineticIndex}% {isSurge ? '🔥 OVERDRIVE' : ''}
          </span>
        </div>

        {/* 雙層賽博條 */}
        <div className="relative w-full h-3 bg-white/10 border border-white/20 p-0.5 overflow-hidden">
          <div
            className="h-full transition-all duration-75 ease-out"
            style={{
              width: `${stats.kineticIndex}%`,
              backgroundColor: currentColor,
              boxShadow: `0 0 15px ${currentColor}`,
            }}
          />
          {/* 爆發閾值標記線 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
            style={{ left: `${theme.gameplay.surgeThreshold}%` }}
          />
        </div>

        {/* 底部輔助數據標記 */}
        <div className="flex justify-between items-center text-[10px] text-white/40 tracking-widest pt-1">
          <span>SURGE BURSTS: {stats.surgeCount} TIMES</span>
          <span>THRESHOLD: {theme.gameplay.surgeThreshold}%</span>
          <span>PEAK: {stats.peakVelocity}%</span>
          <span>PARTS: WRISTS [15,16] / ANKLES [27,28]</span>
        </div>
      </div>
    </div>
  );
};
