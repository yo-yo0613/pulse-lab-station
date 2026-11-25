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
  Radio,
  Wifi,
} from 'lucide-react';

export const MobileWebRemote: React.FC = () => {
  const [roomId, setRoomId] = useState<string>(() => getRemoteRoomId());
  const [showRoomEdit, setShowRoomEdit] = useState(false);
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0);
  const [lastSentAction, setLastSentAction] = useState<string | null>(null);
  const [lastSentTime, setLastSentTime] = useState<string>('');
  const [relayStatus, setRelayStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');

  const sendAction = useCallback(
    (type: OmniActionType, payload?: unknown) => {
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

      setRelayStatus('sending');
      publishRemoteCommand(roomId, type, payload).then((ok) => {
        setRelayStatus(ok ? 'ok' : 'err');
      });

      setLastSentAction(type);
      setLastSentTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(25);
        } catch {
          // ignore
        }
      }
    },
    [roomId]
  );

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#0a0a0a] text-white font-mono flex flex-col justify-between px-3.5 py-3 select-none">
      {/* 精簡單列頂部狀態 */}
      <header className="border-b border-white/10 pb-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-white text-black font-black flex items-center justify-center text-[10px] shrink-0">
              RMT
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-black tracking-wide truncate">
                SHYS 手機遠端遙控器
              </h1>
              <button
                onClick={() => setShowRoomEdit((v) => !v)}
                className="text-[10px] text-zinc-400 flex items-center gap-1 cursor-pointer"
              >
                <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                <span>房號：{roomId}</span>
                <span className="text-zinc-600">（點此改）</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[10px] text-emerald-400 shrink-0">
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            <span>
              {relayStatus === 'sending'
                ? '傳送中'
                : relayStatus === 'err'
                ? '本機模式'
                : lastSentAction
                ? `${lastSentAction} ${lastSentTime}`
                : '跨裝置連線中'}
            </span>
          </div>
        </div>

        {showRoomEdit && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 shrink-0">ROOM:</span>
            <input
              type="text"
              value={roomId}
              onChange={(e) =>
                setRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') || 'shys19')
              }
              className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/15 text-xs text-white focus:outline-none"
              placeholder="shys19"
            />
          </div>
        )}
      </header>

      {/* 核心快捷按鈕區：剛剛好塞滿單屏免捲動 */}
      <main className="flex-1 flex flex-col justify-center gap-2.5 min-h-0 py-2">
        <button
          onClick={() => sendAction('NEXT_STEP')}
          className="w-full py-3.5 rounded-2xl bg-white text-black font-black text-base tracking-wide flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,255,255,0.18)] active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <span>下一步 / START / 確定</span>
          <ArrowRight className="w-5 h-5 stroke-[2.8]" />
        </button>

        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={() => sendAction('PREV_STEP')}
            className="py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>上一部 / 返回</span>
          </button>

          <button
            onClick={() => sendAction('START_RECORDING')}
            className="py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-bold text-xs whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400 fill-current shrink-0" />
            <span>開始模仿 / 重錄</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={() => sendAction('FORCE_SUBMIT')}
            className="py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-[11px] whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Square className="w-3 h-3 text-rose-400 fill-current shrink-0" />
            <span>提早完成看結果</span>
          </button>

          <button
            onClick={() => sendAction('RESTART')}
            className="py-2.5 rounded-xl bg-zinc-900 border border-white/15 text-zinc-300 hover:text-white font-bold text-[11px] whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-amber-400 shrink-0" />
            <span>回首頁</span>
          </button>
        </div>

        {/* 6 部情境直達（緊湊 2x3 格，全部一次露出一屏內） */}
        <div className="pt-1 flex-1 flex flex-col justify-center min-h-0">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest block mb-1.5 shrink-0">
            SELECT SCENARIO // 快速切換 6 部影片
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {PROMPT_SCENARIOS.map((sc, idx) => {
              const isSelected = selectedScenarioIndex === idx;
              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    setSelectedScenarioIndex(idx);
                    sendAction('SELECT_SCENARIO', idx);
                  }}
                  className={`px-2.5 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black border-white font-bold shadow-sm'
                      : 'bg-black/40 border-white/15 text-zinc-300 hover:text-white'
                  }`}
                >
                  <div className="text-[9px] opacity-60 leading-tight">{sc.tagLabel}</div>
                  <div className="text-[11px] truncate leading-tight mt-0.5">{sc.title}</div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};
