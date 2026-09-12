import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '../../../shared/protocol';
import { resetLsp } from '../lib/lsp';

// Survives reconnects, page refreshes, closed tabs AND browser restarts: the
// last session id is offered back to the server, which resumes the session
// from memory (parked on disconnect) or rehydrates it from disk (after a
// server restart). localStorage, not sessionStorage — a closed tab must not
// orphan a 40-minute interview.
const SID_KEY = 'practice-ide:sid';

export function rememberSessionId(id: string): void {
  localStorage.setItem(SID_KEY, id);
}

export function useSocket(onMessage: (msg: ServerMessage) => void): {
  /** Returns false when the socket is down — the message was NOT sent. */
  send: (msg: ClientMessage) => boolean;
  connected: boolean;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sid = localStorage.getItem(SID_KEY);
      const ws = new WebSocket(`${proto}://${location.host}/ws${sid ? `?sid=${encodeURIComponent(sid)}` : ''}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          onMessageRef.current(JSON.parse(ev.data) as ServerMessage);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setConnected(false);
        // The server-side clangd is per-connection and died with the socket;
        // stop claiming the semantic tier is available until the next
        // lsp:status says so.
        resetLsp();
        if (!disposed) retryTimer = setTimeout(connect, 1500);
      };
    }

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  return { send, connected };
}
