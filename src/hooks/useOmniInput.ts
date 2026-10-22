import { useEffect, useRef, useCallback, useState } from 'react';
import type { OmniActionType, OmniInputSource, OmniActionMessage } from '../types/omniInput';
import type { AudioMetrics, SpeakState } from '../types/speak';

export const OMNI_BUS_CHANNEL_NAME = 'see-how-you-speak-bus';

interface UseOmniInputProps {
  currentState: SpeakState;
  audioMetrics: AudioMetrics;
  voiceTriggerLocked?: boolean; // 示範影片播放時為 true，防喇叭自激 (7.22)
  onAction: (action: OmniActionType, source: OmniInputSource, payload?: any) => void;
  enableVoiceVad?: boolean;
}

export function useOmniInput({
  currentState,
  audioMetrics,
  voiceTriggerLocked = false,
  onAction,
  enableVoiceVad = true,
}: UseOmniInputProps) {
  const [lastActionSource, setLastActionSource] = useState<OmniInputSource | null>(null);
  const [lastActionTime, setLastActionTime] = useState<number>(0);
  const [watchdogRemaining, setWatchdogRemaining] = useState<number | null>(null);

  // 1. 狀態遷移互斥鎖 (Transition Mutex with 350ms Debounce - A/B 31)
  const lastTransitionTimeRef = useRef<number>(0);
  const currentStateRef = useRef<SpeakState>(currentState);
  currentStateRef.current = currentState;

  // 2. 語音活動檢測 (VAD) 窗口累加器 (A/B 29)
  const vadStartTimeRef = useRef<number | null>(null);
  const vadTriggerFiredRef = useRef<boolean>(false);

  // 廣播頻道實例
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // 集中派發動作 (帶互斥鎖)
  const dispatchAction = useCallback(
    (action: OmniActionType, source: OmniInputSource, payload?: any) => {
      const now = performance.now();
      // 350ms 互斥閥門
      if (now - lastTransitionTimeRef.current < 350 && action !== 'TOGGLE_REMOTE_DRAWER') {
        return;
      }

      lastTransitionTimeRef.current = now;
      setLastActionSource(source);
      setLastActionTime(now);

      // 調用外部回調
      onAction(action, source, payload);

      // 同步廣播給其他本地分頁/手機端控制器 (A/B 30)
      if (broadcastChannelRef.current) {
        const msg: OmniActionMessage = {
          type: action,
          source,
          timestamp: Date.now(),
          payload,
        };
        try {
          broadcastChannelRef.current.postMessage(msg);
        } catch (_) {}
      }
    },
    [onAction]
  );

  // 監聽鍵盤與 USB 簡報筆 (Defense 7.23: 嚴格攔截 event.repeat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 7.23 攔截按鍵連發
      if (e.repeat) return;

      const key = e.key;
      const code = e.code;

      // 下一步 / 觸發：空白鍵、Enter、右方向鍵、PageDown (簡報筆常用下一頁鍵)
      if (
        key === ' ' ||
        key === 'Enter' ||
        key === 'ArrowRight' ||
        code === 'PageDown'
      ) {
        e.preventDefault();
        dispatchAction('NEXT_STEP', 'clicker');
        return;
      }

      // 上一步 / 前翻：左方向鍵、PageUp (簡報筆常用上一頁鍵)
      if (key === 'ArrowLeft' || code === 'PageUp') {
        e.preventDefault();
        dispatchAction('PREV_STEP', 'clicker');
        return;
      }

      // 重置 / 回到首頁：R 鍵
      if (code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatchAction('RESTART', 'keyboard');
        return;
      }

      // 快速切換 4 大情緒情境：數字鍵 1 ~ 4
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(code)) {
        const index = parseInt(code.replace('Digit', ''), 10) - 1;
        dispatchAction('SELECT_SCENARIO', 'keyboard', index);
        return;
      }

      // 維護者遠端抽屜：M 鍵或波浪符號
      if (code === 'KeyM' || code === 'Backquote') {
        dispatchAction('TOGGLE_REMOTE_DRAWER', 'keyboard');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dispatchAction]);

  // 零接觸聲控 VAD 檢測 (A/B 29 & Defense 7.22 示範影片播放時閘門鎖定)
  useEffect(() => {
    if (!enableVoiceVad || voiceTriggerLocked) {
      vadStartTimeRef.current = null;
      vadTriggerFiredRef.current = false;
      return;
    }

    const { isVoiceActive, pitchHz, smoothVolume } = audioMetrics;

    // 人聲判定：突破底噪門檻、基頻落在 85Hz ~ 350Hz 正常人聲區間
    const isHumanVocal = isVoiceActive && pitchHz >= 85 && pitchHz <= 350 && smoothVolume > 15;

    if (isHumanVocal) {
      const now = performance.now();
      if (!vadStartTimeRef.current) {
        vadStartTimeRef.current = now;
      } else {
        const duration = now - vadStartTimeRef.current;
        // 需連續維持人聲能量 > 150ms
        if (duration >= 150 && !vadTriggerFiredRef.current) {
          // 在 LANDING 首頁，偵測到人聲即可零接觸自動進入
          if (currentStateRef.current === 'LANDING') {
            vadTriggerFiredRef.current = true;
            dispatchAction('NEXT_STEP', 'voice_vad');
          }
        }
      }
    } else {
      vadStartTimeRef.current = null;
      vadTriggerFiredRef.current = false;
    }
  }, [audioMetrics, enableVoiceVad, voiceTriggerLocked, dispatchAction]);

  // 階梯式看門狗無人自動退回機制 (Tiered Watchdog Timer - A/B 32)
  useEffect(() => {
    let timer: number | null = null;
    let countdownInterval: number | null = null;

    if (currentState === 'SCORE_ANALYSIS') {
      // 結算分析頁：12 秒無操作自動進入海報掃碼頁
      let remaining = 12;
      setWatchdogRemaining(remaining);

      countdownInterval = window.setInterval(() => {
        remaining -= 1;
        setWatchdogRemaining(remaining);
      }, 1000);

      timer = window.setTimeout(() => {
        dispatchAction('NEXT_STEP', 'watchdog');
      }, 12000);
    } else if (currentState === 'EXPORT_CARD') {
      // 海報掃碼頁：25 秒無人掃碼/操作自動退回待機首頁
      let remaining = 25;
      setWatchdogRemaining(remaining);

      countdownInterval = window.setInterval(() => {
        remaining -= 1;
        setWatchdogRemaining(remaining);
      }, 1000);

      timer = window.setTimeout(() => {
        dispatchAction('RESTART', 'watchdog');
      }, 25000);
    } else {
      setWatchdogRemaining(null);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [currentState, dispatchAction, lastActionTime]);

  // 本地 Peer / Web 廣播匯流排 (A/B 30)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel(OMNI_BUS_CHANNEL_NAME);
      broadcastChannelRef.current = bc;

      bc.onmessage = (event: MessageEvent<OmniActionMessage>) => {
        const msg = event.data;
        if (msg && msg.type) {
          dispatchAction(msg.type, msg.source || 'remote_web', msg.payload);
        }
      };

      return () => {
        bc.close();
      };
    }
  }, [dispatchAction]);

  // 螢幕防休眠 Wake Lock 與虛擬活性心跳 (Defense 7.26)
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (_) {}
    };

    requestWakeLock();

    // 每 20 秒派發微小虛擬 Pointer 事件維持作業系統活性
    const heartbeatInterval = window.setInterval(() => {
      try {
        const evt = new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: 1,
          clientY: 1,
        });
        window.dispatchEvent(evt);
      } catch (_) {}
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  return {
    dispatchAction,
    lastActionSource,
    watchdogRemaining,
  };
}
