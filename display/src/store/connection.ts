import { create } from 'zustand';
import type { ServerMessage } from '@boredless/shared';
// ServerMessageType imported for reference but dispatching by string key

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

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  ws: null,
  connected: false,
  roomId: null,
  listeners: new Map(),

  connect: (roomId: string) => {
    const existing = get().ws;
    if (existing) existing.close();

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
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
    };

    ws.onerror = (err) => {
      console.error('WebSocket error', err);
    };

    set({ ws });
  },

  disconnect: () => {
    const ws = get().ws;
    if (ws) ws.close();
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

    // Return unsubscribe function
    return () => {
      const current = get().listeners.get(type);
      if (current) {
        current.delete(handler);
      }
    };
  },
}));
