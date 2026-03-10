import { create } from 'zustand';
import type { ServerMessage } from '@boredless/shared';
import { ServerMessageType, ClientMessageType } from '@boredless/shared';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

type MsgHandler = (msg: ServerMessage) => void;

// Listeners live OUTSIDE zustand state to avoid re-render loops
const listeners = new Map<string, Set<MsgHandler>>();

function dispatchMessage(msg: ServerMessage) {
  const handlers = listeners.get(msg.type);
  if (handlers) {
    for (const handler of handlers) handler(msg);
  }
}

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
  on: (type: string, handler: MsgHandler) => () => void;
}

/** Cleanly detach all event handlers from a WebSocket. */
function detachWs(ws: WebSocket | null) {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  try { ws.close(); } catch { /* ignore */ }
}

function setupWsHandlers(ws: WebSocket, get: () => ConnectionState, set: (s: Partial<ConnectionState>) => void) {
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      console.log('[ws] received:', msg.type);
      dispatchMessage(msg);
    } catch (e) {
      console.error('WebSocket parse error', e);
    }
  };

  ws.onclose = () => {
    if (get().ws === ws) {
      set({ connected: false, ws: null });
    }
  };

  ws.onerror = (e) => {
    console.error('[ws] error', e);
  };
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  ws: null,
  connected: false,
  sessionId: null,
  playerId: null,
  reconnectToken: null,

  connect: (roomCode, playerName) => {
    return new Promise<void>((resolve, reject) => {
      detachWs(get().ws);

      const ws = new WebSocket(WS_URL);
      let resolved = false;

      // Temporary join handler
      const handleJoin = (msg: ServerMessage) => {
        if (msg.type === ServerMessageType.JOINED && !resolved) {
          const joined = msg as Extract<ServerMessage, { type: 'joined' }>;
          set({
            connected: true,
            sessionId: joined.result.sessionId,
            playerId: joined.result.playerId,
            reconnectToken: joined.result.reconnectToken,
            ws,
          });
          sessionStorage.setItem('boredless_phone_session', JSON.stringify({
            sessionId: joined.result.sessionId,
            playerId: joined.result.playerId,
            reconnectToken: joined.result.reconnectToken,
          }));
          resolved = true;
          resolve();
        }
        if (msg.type === ServerMessageType.ERROR && !resolved) {
          const err = msg as Extract<ServerMessage, { type: 'error' }>;
          resolved = true;
          reject(new Error(err.message));
          ws.close();
        }
      };

      // Register temporary listener
      if (!listeners.has(ServerMessageType.JOINED)) listeners.set(ServerMessageType.JOINED, new Set());
      listeners.get(ServerMessageType.JOINED)!.add(handleJoin);
      if (!listeners.has(ServerMessageType.ERROR)) listeners.set(ServerMessageType.ERROR, new Set());
      listeners.get(ServerMessageType.ERROR)!.add(handleJoin);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.JOIN_ROOM,
          roomCode: roomCode.toUpperCase(),
          playerName,
          preferredColor: null,
        }));
        // Set up permanent handlers after join message sent
        setupWsHandlers(ws, get, set);
      };

      ws.onclose = () => {
        if (get().ws === ws) set({ connected: false, ws: null });
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection closed before join confirmed'));
        }
        // Clean up temp listeners
        listeners.get(ServerMessageType.JOINED)?.delete(handleJoin);
        listeners.get(ServerMessageType.ERROR)?.delete(handleJoin);
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
      detachWs(get().ws);

      const ws = new WebSocket(WS_URL);
      let resolved = false;

      const handleJoin = (msg: ServerMessage) => {
        if (msg.type === ServerMessageType.JOINED && !resolved) {
          const joined = msg as Extract<ServerMessage, { type: 'joined' }>;
          set({
            connected: true,
            ws,
            sessionId: joined.result.sessionId,
            playerId: joined.result.playerId,
            reconnectToken: joined.result.reconnectToken,
          });
          sessionStorage.setItem('boredless_phone_session', JSON.stringify({
            sessionId: joined.result.sessionId,
            playerId: joined.result.playerId,
            reconnectToken: joined.result.reconnectToken,
          }));
          resolved = true;
          resolve();
        }
        if (msg.type === ServerMessageType.ERROR && !resolved) {
          resolved = true;
          reject(new Error((msg as Extract<ServerMessage, { type: 'error' }>).message));
          ws.close();
        }
      };

      if (!listeners.has(ServerMessageType.JOINED)) listeners.set(ServerMessageType.JOINED, new Set());
      listeners.get(ServerMessageType.JOINED)!.add(handleJoin);
      if (!listeners.has(ServerMessageType.ERROR)) listeners.set(ServerMessageType.ERROR, new Set());
      listeners.get(ServerMessageType.ERROR)!.add(handleJoin);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.REJOIN,
          sessionId,
          reconnectToken,
        }));
        setupWsHandlers(ws, get, set);
      };

      ws.onclose = () => {
        if (get().ws === ws) set({ connected: false, ws: null });
        if (!resolved) {
          resolved = true;
          reject(new Error('Reconnect failed'));
        }
        listeners.get(ServerMessageType.JOINED)?.delete(handleJoin);
        listeners.get(ServerMessageType.ERROR)?.delete(handleJoin);
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
    detachWs(get().ws);
    sessionStorage.removeItem('boredless_phone_session');
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

  // on() is stable — does NOT trigger zustand state updates
  on: (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
    return () => {
      listeners.get(type)?.delete(handler);
    };
  },
}));

/** Retrieve persisted session for reconnection on refresh. */
export function getPersistedSession(): { sessionId: string; playerId: string; reconnectToken: string } | null {
  try {
    const raw = sessionStorage.getItem('boredless_phone_session');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.sessionId && data.playerId && data.reconnectToken) return data;
    return null;
  } catch {
    return null;
  }
}
