/**
 * BoredlessClient — Platform-level client SDK for phone controllers.
 *
 * Manages the ENTIRE lifecycle: connection, room state, game transitions,
 * phase updates, private state, timers, scores, and game events.
 *
 * Game components receive clean props. They never touch WebSocket or
 * raw message handling. The platform handles ALL of that.
 *
 * LIFECYCLE:
 *   disconnected → connecting → lobby → game → gameOver → lobby
 */

import { create } from 'zustand';
import type {
  ServerMessage,
  PhaseState,
  ScoreEntry,
  PublicRoomState,
  PlayerInfo,
  PublicPlayerState,
  GameOverState,
} from '@boredless/shared';
import {
  ServerMessageType,
  ClientMessageType,
  RoomStatus,
  PhaseType,
} from '@boredless/shared';

// ── Types ────────────────────────────────────────────────────

export type AppScreen = 'join' | 'lobby' | 'game' | 'gameOver';

type MsgHandler = (msg: ServerMessage) => void;

interface PersistedSession {
  sessionId: string;
  playerId: string;
  reconnectToken: string;
}

// ── External listener registry (outside Zustand = no re-render loops) ──

const listeners = new Map<string, Set<MsgHandler>>();

function addListener(type: string, handler: MsgHandler): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(handler);
  return () => { listeners.get(type)?.delete(handler); };
}

function dispatch(msg: ServerMessage) {
  const handlers = listeners.get(msg.type);
  if (handlers) for (const h of handlers) h(msg);
}

// ── WebSocket helpers ────────────────────────────────────────

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
const SESSION_KEY = 'boredless_phone_session';

function detachWs(ws: WebSocket | null) {
  if (!ws) return;
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  try { ws.close(); } catch { /* noop */ }
}

function persistSession(s: PersistedSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.sessionId && d.playerId && d.reconnectToken ? d : null;
  } catch { return null; }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── Platform Store ───────────────────────────────────────────

export interface PlatformState {
  // Connection
  ws: WebSocket | null;
  connected: boolean;
  sessionId: string | null;
  playerId: string | null;
  reconnectToken: string | null;

  // Navigation
  screen: AppScreen;

  // Room
  room: PublicRoomState | null;

  // Game state (managed by platform, consumed by game components)
  phase: PhaseState | null;
  publicState: Record<string, unknown>;
  privateState: Record<string, unknown> | null;
  scores: ScoreEntry[];
  timerMs: number | null;
  gameOverResult: GameOverState | null;

  // Actions
  connect: (roomCode: string, playerName: string) => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => void;
  send: (data: Record<string, unknown>) => void;
  on: (type: string, handler: MsgHandler) => () => void;

  // Derived helpers
  getMyPlayer: () => PlayerInfo;
  isHost: () => boolean;
}

export const usePlatform = create<PlatformState>()((set, get) => {
  // ── Wire up platform message handlers (runs once at store creation) ──

  // JOINED (join or rejoin confirmation)
  addListener(ServerMessageType.JOINED, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'joined' }>;
    const { sessionId, playerId, reconnectToken, room } = m.result;
    set({ sessionId, playerId, reconnectToken, connected: true });
    persistSession({ sessionId, playerId, reconnectToken });
    if (room) {
      set({ room });
      if (room.status === RoomStatus.IN_GAME) {
        set({ screen: 'game' });
      } else {
        set({ screen: 'lobby' });
      }
    }
  });

  // ROOM_STATE
  addListener(ServerMessageType.ROOM_STATE, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'room_state' }>;
    const updates: Partial<PlatformState> = { room: m.room };
    if (m.phase) updates.phase = m.phase;
    if (m.gamePublicState) updates.publicState = m.gamePublicState;
    // Handle return-to-lobby
    if (m.room.status === RoomStatus.IN_LOBBY && get().screen === 'game') {
      updates.screen = 'lobby';
      updates.phase = null;
      updates.publicState = {};
      updates.privateState = null;
      updates.scores = [];
      updates.timerMs = null;
      updates.gameOverResult = null;
    }
    set(updates);
  });

  // GAME_STARTED
  addListener(ServerMessageType.GAME_STARTED, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'game_started' }>;
    set({
      screen: 'game',
      phase: m.phase,
      publicState: m.gamePublicState ?? {},
      gameOverResult: null,
    });
  });

  // PHASE_CHANGED
  addListener(ServerMessageType.PHASE_CHANGED, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'phase_changed' }>;
    set({ phase: m.phase, publicState: m.gamePublicState ?? get().publicState });
    if (get().screen !== 'game') set({ screen: 'game' });
  });

  // PRIVATE_STATE
  addListener(ServerMessageType.PRIVATE_STATE, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'private_state' }>;
    set({ privateState: m.state });
  });

  // TIMER_TICK
  addListener(ServerMessageType.TIMER_TICK, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'timer_tick' }>;
    set({ timerMs: m.remainingMs });
  });

  // SCORE_UPDATE
  addListener(ServerMessageType.SCORE_UPDATE, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'score_update' }>;
    set({ scores: m.scores });
  });

  // GAME_OVER
  addListener(ServerMessageType.GAME_OVER, (msg) => {
    const m = msg as Extract<ServerMessage, { type: 'game_over' }>;
    set({
      gameOverResult: m.result,
      phase: get().phase ? { ...get().phase!, phaseType: PhaseType.GAME_OVER } : null,
    });
  });

  // ROOM_CLOSED
  addListener(ServerMessageType.ROOM_CLOSED, () => {
    clearSession();
    set({
      screen: 'join',
      room: null,
      phase: null,
      publicState: {},
      privateState: null,
      scores: [],
      timerMs: null,
      gameOverResult: null,
    });
  });

  // ── Internal: wire WS message routing ──

  function wireWs(ws: WebSocket) {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        dispatch(msg);
      } catch (e) {
        console.error('[platform] parse error', e);
      }
    };
    ws.onclose = () => {
      if (get().ws === ws) {
        set({ connected: false, ws: null });
        // Auto-reconnect
        const s = get();
        if (s.screen !== 'join' && s.sessionId && s.reconnectToken) {
          setTimeout(() => {
            get().reconnect().catch(() => {
              clearSession();
              set({
                screen: 'join', room: null, phase: null,
                publicState: {}, privateState: null,
                scores: [], timerMs: null,
              });
            });
          }, 1000);
        }
      }
    };
    ws.onerror = () => { /* onclose fires */ };
  }

  return {
    ws: null,
    connected: false,
    sessionId: null,
    playerId: null,
    reconnectToken: null,
    screen: 'join' as AppScreen,
    room: null,
    phase: null,
    publicState: {},
    privateState: null,
    scores: [],
    timerMs: null,
    gameOverResult: null,

    connect: (roomCode, playerName) => new Promise<void>((resolve, reject) => {
      detachWs(get().ws);
      const ws = new WebSocket(WS_URL);
      let resolved = false;

      const cleanup = addListener(ServerMessageType.JOINED, () => {
        if (!resolved) { resolved = true; resolve(); cleanup(); errCleanup(); }
      });
      const errCleanup = addListener(ServerMessageType.ERROR, (msg) => {
        if (!resolved) {
          resolved = true;
          reject(new Error((msg as Extract<ServerMessage, { type: 'error' }>).message));
          cleanup(); errCleanup(); ws.close();
        }
      });

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.JOIN_ROOM,
          roomCode: roomCode.toUpperCase(),
          playerName,
          preferredColor: null,
        }));
        wireWs(ws);
      };
      ws.onclose = () => {
        if (get().ws === ws) set({ connected: false, ws: null });
        if (!resolved) { resolved = true; reject(new Error('Connection closed')); cleanup(); errCleanup(); }
      };
      ws.onerror = () => {
        if (!resolved) { resolved = true; reject(new Error('Connection failed')); cleanup(); errCleanup(); }
      };
      set({ ws });
    }),

    reconnect: () => {
      const { sessionId, reconnectToken } = get();
      if (!sessionId || !reconnectToken) return Promise.reject(new Error('No session'));

      return new Promise<void>((resolve, reject) => {
        detachWs(get().ws);
        const ws = new WebSocket(WS_URL);
        let resolved = false;

        const cleanup = addListener(ServerMessageType.JOINED, () => {
          if (!resolved) { resolved = true; resolve(); cleanup(); errCleanup(); }
        });
        const errCleanup = addListener(ServerMessageType.ERROR, (msg) => {
          if (!resolved) {
            resolved = true;
            reject(new Error((msg as Extract<ServerMessage, { type: 'error' }>).message));
            cleanup(); errCleanup(); ws.close();
          }
        });

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: ClientMessageType.REJOIN, sessionId, reconnectToken }));
          wireWs(ws);
        };
        ws.onclose = () => {
          if (get().ws === ws) set({ connected: false, ws: null });
          if (!resolved) { resolved = true; reject(new Error('Reconnect failed')); cleanup(); errCleanup(); }
        };
        ws.onerror = () => {
          if (!resolved) { resolved = true; reject(new Error('Reconnect error')); cleanup(); errCleanup(); }
        };
        set({ ws });
      });
    },

    disconnect: () => {
      detachWs(get().ws);
      clearSession();
      set({
        ws: null, connected: false,
        sessionId: null, playerId: null, reconnectToken: null,
        screen: 'join', room: null,
        phase: null, publicState: {}, privateState: null,
        scores: [], timerMs: null, gameOverResult: null,
      });
    },

    send: (data) => {
      const ws = get().ws;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    },

    on: (type, handler) => addListener(type, handler),

    getMyPlayer: () => {
      const { playerId, room } = get();
      const p = room?.players.find((pl: PublicPlayerState) => pl.id === playerId);
      return {
        playerId: playerId ?? '',
        playerName: p?.name ?? '',
        playerColor: p?.color ?? '#6366f1',
        isAlive: p?.status === 'connected' || p?.status === 'disconnected',
      };
    },

    isHost: () => {
      const { playerId, room } = get();
      return !!(room && playerId === room.hostPlayerId);
    },
  };
});

// ── Auto-reconnect on page load ──
const persisted = loadSession();
if (persisted) {
  usePlatform.setState({
    sessionId: persisted.sessionId,
    playerId: persisted.playerId,
    reconnectToken: persisted.reconnectToken,
  });
  usePlatform.getState().reconnect().catch(() => clearSession());
}
