import React, { useState, useCallback } from 'react';
import { OMNI_BUS_CHANNEL_NAME } from '../hooks/useOmniInput';
import type { OmniActionType, OmniActionMessage } from '../types/omniInput';
import { PROMPT_SCENARIOS } from '../config/speakScenarios';
import { Play, Square, RotateCcw, ArrowRight, ShieldCheck, Radio } from 'lucide-react';

export const MobileWebRemote: React.FC = () => {
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0);
  const [lastSentAction, setLastSentAction] = useState<string | null>(null);
  const [lastSentTime, setLastSentTime] = useState<string>('');

  // 初始化廣播通道
  const sendAction = useCallback((type: OmniActionType, payload?: any) => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(OMNI_BUS_CHANNEL_NAME);
        const msg: OmniActionMessage = {
          type,
          source: 'remote_web',
          timestamp: Date.now(),
          payload,
        };
        bc.postMessage(msg);
        bc.close();
      } catch (_) {}
    }

    // 亦同步寫入 LocalStorage，支援同源跨視窗觸發
    try {
      localStorage.setItem(
        'spk_remote_action',
        JSON.stringify({ type, payload, t: Date.now() })
      );
    } catch (_) {}

    setLastSentAction(type);
    setLastSentTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));

    // 觸覺震動回饋 (如果手機支援)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(30);
      } catch (_) {}
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white font-mono flex flex-col justify-between p-5 select-none">
      {/* 頂部遙控狀態列 */}
      <header className="border-b border-white/10 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-400 text-black font-black flex items-center justify-center text-xs">
              RMT
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wider uppercase">
                SPK 展場掌上遙控器
              </h1>
              <p className="text-[10px] text-zinc-500 tracking-widest">
                LOCAL BUS // 0 外網依賴
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-[10px] text-emerald-400">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>&lt; 16ms 毫秒直連</span>
          </div>
        </div>

        {lastSentAction && (
          <div className="mt-3 text-[10px] bg-white/5 border border-white/10 rounded px-2.5 py-1 text-zinc-400 flex items-center justify-between">
            <span>最近發送：<b className="text-white">{lastSentAction}</b></span>
            <span>{lastSentTime}</span>
          </div>
        )}
      </header>

      {/* 核心快捷按鈕區 (大按鈕，單手拇指秒點) */}
      <main className="flex-1 flex flex-col justify-center gap-3.5 my-4">
        {/* 下一步核心按鈕 */}
        <button
          onClick={() => sendAction('NEXT_STEP')}
          className="w-full py-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-black text-lg tracking-widest uppercase flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)] active:scale-95 transition-all cursor-pointer"
        >
          <span>下一步 // NEXT STEP</span>
          <ArrowRight className="w-6 h-6 stroke-[3]" />
        </button>

        {/* 雙列副控制按鈕 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => sendAction('START_RECORDING')}
            className="py-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-current" />
            <span>開始模仿錄音</span>
          </button>

          <button
            onClick={() => sendAction('FORCE_SUBMIT')}
            className="py-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <Square className="w-4 h-4 text-rose-400 fill-current" />
            <span>提早完成計算</span>
          </button>
        </div>

        {/* 重置與待機首頁 */}
        <button
          onClick={() => sendAction('RESTART')}
          className="w-full py-3.5 rounded-xl bg-zinc-900 border border-white/15 text-zinc-300 hover:text-white font-bold text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <span>重置回到 LANDING 首頁</span>
        </button>

        {/* 情境快速切換 Presets */}
        <div className="pt-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-2">
            SELECT SCENARIO // 快速切換台詞情境
          </span>
          <div className="grid grid-cols-2 gap-2">
            {PROMPT_SCENARIOS.map((sc, idx) => {
              const isSelected = selectedScenarioIndex === idx;
              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    setSelectedScenarioIndex(idx);
                    sendAction('SELECT_SCENARIO', idx);
                  }}
                  className={`p-2.5 rounded-lg border text-left text-xs font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/20 border-white text-white font-bold shadow-md'
                      : 'bg-black/40 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: sc.accentColor }}
                    />
                    <span className="truncate">{sc.title.split('//')[0]}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate">{sc.emotion}</p>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* 底部工業級安全與防護說明 */}
      <footer className="border-t border-white/10 pt-3 text-[10px] text-zinc-500 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>350ms 互斥鎖已啟用</span>
        </div>
        <span>SEE HOW YOU SPEAK</span>
      </footer>
    </div>
  );
};
