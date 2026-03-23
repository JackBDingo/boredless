import { create } from 'zustand';
import type { ServerMessage } from '@boredless/shared';

interface ConnectionState {
  ws: WebSocket | null;
  connected: boolean;
  roomId: string | null;

  connect: (roomId: string) => void;
  disconnect: () => void;
  send: (data: Record<string, unknown>) => void;

  /** Listeners for server messages */
  listeners: Map<string, Set<(msg: ServerMessage) => void>>;
  on: (type: string, handler: (msg: ServerMessage) => void) => () => void;
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

/** Max reconnect delay: 10 seconds */
const MAX_RECONNECT_MS = 10_000;

export const useConnectionStore = create<ConnectionState>((set, get) => {
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempt = 0;
  }

  function scheduleReconnect() {
    const roomId = get().roomId;
    if (!roomId) return; // Nothing to reconnect to

    // Exponential backoff: 500, 1000, 2000, 4000, 8000, 10000...
    const delay = Math.min(500 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_MS);
    reconnectAttempt++;

    console.log(`[ws] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})...`);
    reconnectTimer = setTimeout(() => {
      const state = get();
      if (!state.connected && state.roomId) {
        state.connect(state.roomId);
      }
    }, delay);
  }

  return {
    ws: null,
    connected: false,
    roomId: null,
    listeners: new Map(),

    connect: (roomId: string) => {
      const existing = get().ws;
      if (existing) {
        // Prevent the close handler from triggering a reconnect
        existing.onclose = null;
        existing.close();
      }
      clearReconnect();

      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        reconnectAttempt = 0;
        set({ connected: true, roomId });
        // Send join_display message
        ws.send(JSON.stringify({
          type: 'join_display',
          roomId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          const listeners = get().listeners.get(msg.type);
          if (listeners) {
            for (const handler of listeners) {
              handler(msg);
            }
          }
        } catch (e) {
          console.error('Failed to parse message', e);
        }
      };

      ws.onclose = () => {
        set({ connected: false, ws: null });
        // Auto-reconnect if we still have a roomId
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error('WebSocket error', err);
      };

      set({ ws, roomId });
    },

    disconnect: () => {
      clearReconnect();
      const ws = get().ws;
      if (ws) {
        ws.onclose = null; // Prevent reconnect on intentional disconnect
        ws.close();
      }
      set({ ws: null, connected: false, roomId: null });
    },

    send: (data) => {
      const ws = get().ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },

    on: (type, handler) => {
      const listeners = get().listeners;
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(handler);
      set({ listeners: new Map(listeners) });

      return () => {
        const current = get().listeners.get(type);
        if (current) {
          current.delete(handler);
        }
      };
    },
  };
});
