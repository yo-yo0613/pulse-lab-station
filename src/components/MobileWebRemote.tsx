import React, { useState, useCallback } from 'react';
import { OMNI_BUS_CHANNEL_NAME } from '../hooks/useOmniInput';
import type { OmniActionType, OmniActionMessage } from '../types/omniInput';
import { PROMPT_SCENARIOS } from '../config/speakScenarios';
import { getRemoteRoomId, publishRemoteCommand } from '../utils/remoteRelay';
import {
  Play,
  Square,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Radio,
  Wifi,
} from 'lucide-react';

export const MobileWebRemote: React.FC = () => {
  const [roomId, setRoomId] = useState<string>(() => getRemoteRoomId());
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0);
  const [lastSentAction, setLastSentAction] = useState<string | null>(null);
  const [lastSentTime, setLastSentTime] = useState<string>('');
  const [relayStatus, setRelayStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');

  const sendAction = useCallback(
    (type: OmniActionType, payload?: unknown) => {
      // 1. 同機跨分頁直連 (BroadcastChannel + localStorage)
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
        } catch {
          // ignore
        }
      }

      try {
        localStorage.setItem(
          'spk_remote_action',
          JSON.stringify({ type, payload, t: Date.now() })
        );
      } catch {
        // ignore
      }

      // 2. 跨裝置雲端 Relay (手機 4G/5G/Wi-Fi -> 電視主機)
      setRelayStatus('sending');
      publishRemoteCommand(roomId, type, payload).then((ok) => {
        setRelayStatus(ok ? 'ok' : 'err');
      });

      setLastSentAction(type);
      setLastSentTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(30);
        } catch {
          // ignore
        }
      }
    },
    [roomId]
  );

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white font-mono flex flex-col justify-between p-5 select-none">
      {/* 頂部遙控狀態列 */}
      <header className="border-b border-white/10 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white text-black font-black flex items-center justify-center text-xs">
              RMT
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wider uppercase">
                SHYS 手機遠端遙控器
              </h1>
              <p className="text-[10px] text-zinc-400 tracking-wider flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>房號：{roomId}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-[10px] text-emerald-400 shrink-0">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>
              {relayStatus === 'sending'
                ? '傳送中...'
                : relayStatus === 'err'
                ? '本機模式'
                : '跨裝置連線中'}
            </span>
          </div>
        </div>

        {/* 房號切換 (預設 shys19) */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 shrink-0">ROOM:</span>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') || 'shys19')}
            className="flex-1 px-2.5 py-1 rounded bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-white/40"
            placeholder="shys19"
          />
          {lastSentAction && (
            <span className="text-[10px] text-zinc-400 shrink-0">
              已送 <b className="text-white">{lastSentAction}</b> ({lastSentTime})
            </span>
          )}
        </div>
      </header>

      {/* 核心快捷按鈕區 (單手拇指秒點) */}
      <main className="flex-1 flex flex-col justify-center gap-3.5 my-4">
        {/* 主要前進 / START / 選這段 / 確定按鈕 */}
        <button
          onClick={() => sendAction('NEXT_STEP')}
          className="w-full py-5 rounded-2xl bg-white text-black font-black text-lg tracking-wider flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,255,255,0.2)] active:scale-95 transition-all cursor-pointer"
        >
          <span>下一步 / START / 確定</span>
          <ArrowRight className="w-6 h-6 stroke-[3]" />
        </button>

        {/* 左右切卡與返回 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => sendAction('PREV_STEP')}
            className="py-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-sm tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>上一部 / 返回</span>
          </button>

          <button
            onClick={() => sendAction('START_RECORDING')}
            className="py-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-bold text-sm tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-current" />
            <span>開始模仿 / 重錄</span>
          </button>
        </div>

        {/* 提早送出 / 回首頁 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => sendAction('FORCE_SUBMIT')}
            className="py-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 text-rose-400 fill-current" />
            <span>提早完成看結果</span>
          </button>

          <button
            onClick={() => sendAction('RESTART')}
            className="py-3.5 rounded-xl bg-zinc-900 border border-white/15 text-zinc-300 hover:text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>回首頁</span>
          </button>
        </div>

        {/* 6 部情境直達按鈕 */}
        <div className="pt-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-2">
            SELECT SCENARIO // 點選直接切換並預覽影片
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
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black border-white font-bold shadow-md'
                      : 'bg-black/40 border-white/15 text-zinc-300 hover:text-white'
                  }`}
                >
                  <div className="text-[10px] opacity-60 mb-0.5">{sc.tagLabel}</div>
                  <div className="truncate">{sc.title}</div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* 底部說明 */}
      <footer className="border-t border-white/10 pt-3 flex items-center justify-between text-[10px] text-zinc-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>手機連網即可遙控電視電腦</span>
        </div>
        <span>SHYS V2.1 REMOTE</span>
      </footer>
    </div>
  );
};
