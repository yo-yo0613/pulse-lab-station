import type { OmniActionMessage, OmniActionType } from '../types/omniInput';

const DEFAULT_REMOTE_ROOM = 'shys19';
const TOPIC_PREFIX = 'shys-pulse-remote-v2-';

/**
 * 取得跨裝置遙控房號（預設 shys19，可透過網址 ?room=... 自訂）
 */
export function getRemoteRoomId(): string {
  if (typeof window === 'undefined') return DEFAULT_REMOTE_ROOM;
  try {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room')?.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return room || DEFAULT_REMOTE_ROOM;
  } catch {
    return DEFAULT_REMOTE_ROOM;
  }
}

export function getRemoteTopic(roomId: string): string {
  return `${TOPIC_PREFIX}${roomId}`;
}

export function buildMobileRemoteUrl(roomId: string): string {
  if (typeof window === 'undefined') return `/remote?room=${roomId}`;
  return `${window.location.origin}/remote?room=${encodeURIComponent(roomId)}`;
}

/**
 * 透過公開 HTTPS Relay (ntfy.sh) 跨裝置傳送遙控指令（手機 4G/5G/Wi-Fi 皆可直控電腦電視）
 */
export async function publishRemoteCommand(
  roomId: string,
  type: OmniActionType,
  payload?: unknown
): Promise<boolean> {
  const msg: OmniActionMessage = {
    type,
    source: 'remote_web',
    timestamp: Date.now(),
    payload,
  };
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(getRemoteTopic(roomId))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(msg),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 訂閱遠端遙控指令（WebSocket 自動重連 + 去重）
 */
export function subscribeRemoteCommands(
  roomId: string,
  onMessage: (msg: OmniActionMessage) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let closed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  const seenIds = new Set<string>();

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(`wss://ntfy.sh/${encodeURIComponent(getRemoteTopic(roomId))}/ws`);
      ws.onopen = () => {
        onStatusChange?.(true);
      };
      ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          if (envelope?.event !== 'message' || typeof envelope.message !== 'string') return;
          const cmd = JSON.parse(envelope.message) as OmniActionMessage;
          if (!cmd?.type) return;
          const dedupKey = `${cmd.type}:${cmd.timestamp}`;
          if (seenIds.has(dedupKey)) return;
          seenIds.add(dedupKey);
          if (seenIds.size > 50) {
            const first = seenIds.values().next().value;
            if (first) seenIds.delete(first);
          }
          onMessage(cmd);
        } catch {
          // 忽略非 JSON 訊息
        }
      };
      ws.onerror = () => {
        onStatusChange?.(false);
      };
      ws.onclose = () => {
        onStatusChange?.(false);
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    } catch {
      onStatusChange?.(false);
      if (!closed) {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
    }
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };
}
