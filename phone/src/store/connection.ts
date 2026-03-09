import { create } from 'zustand';
import type { ServerMessage } from '@boredless/shared';
import { ServerMessageType, ClientMessageType } from '@boredless/shared';

// Server URL — use Vite proxy in dev, configurable for production
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

interface ConnectionState {
  ws: WebSocket | null;
  connected: boolean;
  sessionId: string | null;
  playerId: string | null;
  reconnectToken: string | null;

  connect: (roomCode: string, playerName: string) => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => void;
  send: (data: Record<string, unknown>) => void;

  listeners: Map<string, Set<(msg: ServerMessage) => void>>;
  on: (type: string, handler: (msg: ServerMessage) => void) => () => void;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  ws: null,
  connected: false,
  sessionId: null,
  playerId: null,
  reconnectToken: null,
  listeners: new Map(),

  connect: (roomCode, playerName) => {
    return new Promise<void>((resolve, reject) => {
      const existing = get().ws;
      if (existing) existing.close();

      const ws = new WebSocket(WS_URL);
      let resolved = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.JOIN_ROOM,
          roomCode: roomCode.toUpperCase(),
          playerName,
          preferredColor: null,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;

          // Handle join confirmation
          if (msg.type === ServerMessageType.JOINED && !resolved) {
            const joined = msg as Extract<ServerMessage, { type: 'joined' }>;
            set({
              connected: true,
              sessionId: joined.result.sessionId,
              playerId: joined.result.playerId,
              reconnectToken: joined.result.reconnectToken,
              ws,
            });
            resolved = true;
            resolve();
          }

          // Handle error before join
          if (msg.type === ServerMessageType.ERROR && !resolved) {
            const err = msg as Extract<ServerMessage, { type: 'error' }>;
            resolved = true;
            reject(new Error(err.message));
            ws.close();
            return;
          }

          // Dispatch to listeners
          const listeners = get().listeners.get(msg.type);
          if (listeners) {
            for (const handler of listeners) {
              handler(msg);
            }
          }
        } catch (e) {
          console.error('WebSocket parse error', e);
        }
      };

      ws.onclose = () => {
        set({ connected: false, ws: null });
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection closed before join confirmed'));
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('WebSocket connection failed'));
        }
      };

      set({ ws });
    });
  },

  reconnect: () => {
    const { sessionId, reconnectToken } = get();
    if (!sessionId || !reconnectToken) return Promise.reject(new Error('No session to reconnect'));

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      let resolved = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.REJOIN,
          sessionId,
          reconnectToken,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMessage;

          if (msg.type === ServerMessageType.JOINED && !resolved) {
            set({ connected: true, ws });
            resolved = true;
            resolve();
          }

          if (msg.type === ServerMessageType.ERROR && !resolved) {
            resolved = true;
            reject(new Error((msg as Extract<ServerMessage, { type: 'error' }>).message));
            ws.close();
            return;
          }

          const listeners = get().listeners.get(msg.type);
          if (listeners) for (const handler of listeners) handler(msg);
        } catch (e) {
          console.error('Reconnect parse error', e);
        }
      };

      ws.onclose = () => {
        set({ connected: false, ws: null });
        if (!resolved) {
          resolved = true;
          reject(new Error('Reconnect failed'));
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Reconnect connection error'));
        }
      };

      set({ ws });
    });
  },

  disconnect: () => {
    get().ws?.close();
    set({
      ws: null,
      connected: false,
      sessionId: null,
      playerId: null,
      reconnectToken: null,
    });
  },

  send: (data) => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  },

  on: (type, handler) => {
    const listeners = get().listeners;
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
    set({ listeners: new Map(listeners) });
    return () => {
      get().listeners.get(type)?.delete(handler);
    };
  },
}));
