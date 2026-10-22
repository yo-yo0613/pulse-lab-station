import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Shield, ExternalLink, RefreshCw } from 'lucide-react';
import type { OmniInputSource } from '../types/omniInput';

interface MaintainerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  noiseFloor: number;
  onCalibrateNoise: () => void;
  lastActionSource: OmniInputSource | null;
  watchdogRemaining: number | null;
  enableVoiceVad: boolean;
  onToggleVoiceVad: () => void;
}

export const MaintainerDrawer: React.FC<MaintainerDrawerProps> = ({
  isOpen,
  onClose,
  noiseFloor,
  onCalibrateNoise,
  lastActionSource,
  watchdogRemaining,
  enableVoiceVad,
  onToggleVoiceVad,
}) => {
  if (!isOpen) return null;

  const remoteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?remote=true`
      : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm select-none font-mono">
      <div className="w-full max-w-md h-full bg-zinc-950 border-l border-white/20 p-6 flex flex-col justify-between overflow-y-auto">
        {/* 頂部標題 */}
        <div>
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-sm font-black text-white tracking-wider uppercase">
                  維護者暗樁調試抽屜
                </h2>
                <p className="text-[10px] text-zinc-500 tracking-widest">
                  MAINTAINER TAP JAIL // 0 外網離線維護
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 全模態輸入即時狀態監視 */}
          <div className="mt-5 space-y-3">
            <span className="text-[11px] text-zinc-400 font-bold tracking-wider uppercase block">
              1. 全模態輸入即時遙測 (OMNI-INPUT TELEMETRY)
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/5 border border-white/10 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 block">最近輸入源 (Source)</span>
                <span className="font-bold text-emerald-400 uppercase">
                  {lastActionSource || '待命中 (IDLE)'}
                </span>
              </div>
              <div className="bg-white/5 border border-white/10 p-2.5 rounded-lg">
                <span className="text-[10px] text-zinc-500 block">看門狗倒數 (Watchdog)</span>
                <span className="font-bold text-amber-400">
                  {watchdogRemaining !== null ? `${watchdogRemaining}s` : '關閉中'}
                </span>
              </div>
            </div>

            {/* 零接觸聲控開關 */}
            <div className="bg-white/5 border border-white/10 p-3 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">零碰觸聲控 VAD 自動跳轉</span>
                <span className="text-[10px] text-zinc-500">人聲基頻 85~350Hz 能量持音 150ms 即觸發</span>
              </div>
              <button
                onClick={onToggleVoiceVad}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                  enableVoiceVad
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'bg-zinc-800 text-zinc-400 border border-white/10'
                }`}
              >
                {enableVoiceVad ? '已啟用' : '已關閉'}
              </button>
            </div>
          </div>

          {/* 音訊底噪手動微調 */}
          <div className="mt-6 space-y-3">
            <span className="text-[11px] text-zinc-400 font-bold tracking-wider uppercase block">
              2. 展場聲學底噪監測
            </span>
            <div className="bg-white/5 border border-white/10 p-3 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-400 block">當前環境底噪門檻 (Noise Floor)</span>
                <span className="text-xl font-bold text-white">{Math.round(noiseFloor)}%</span>
              </div>
              <button
                onClick={onCalibrateNoise}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>重新採樣 300ms</span>
              </button>
            </div>
          </div>

          {/* 手機遠端遙控配對 QR Code (A/B 30 本地局域網直連) */}
          <div className="mt-6 space-y-3">
            <span className="text-[11px] text-zinc-400 font-bold tracking-wider uppercase block">
              3. 展場掌上型手機遙控器配對 (LOCAL WEB REMOTE)
            </span>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center text-center">
              <div className="p-3 bg-white rounded-xl shadow-lg mb-3">
                <QRCodeCanvas
                  value={remoteUrl}
                  size={150}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-xs text-zinc-300 font-bold mb-1">
                以手機或平板掃描開啟掌上遙控器
              </p>
              <p className="text-[10px] text-zinc-500 max-w-xs mb-3">
                同網域或本機毫秒級廣播直連 (&lt; 16ms)，0 外網依賴，免裝 App！
              </p>
              <a
                href={remoteUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500 text-emerald-400 hover:bg-emerald-500 hover:text-black font-bold text-xs flex items-center gap-1.5 transition-all"
              >
                <span>在目前視窗開啟遙控器測試</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* 底部關閉說明 */}
        <div className="border-t border-white/10 pt-4 text-[10px] text-zinc-500 text-center">
          連點螢幕左上角 Logo 5 次或按 M 鍵可隨時喚出 / 關閉此面板
        </div>
      </div>
    </div>
  );
};
