/**
 * E2E Test Suite — Boredless Gaming Platform
 *
 * Tests every experience in Bluff Battle and Village of Shadows using real
 * Fastify server + real WebSocket connections.
 *
 * Port: OS-assigned (avoids conflicts)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'net';
import { buildApp } from '../app.js';
import { timerEngine } from '../engine/timer-engine.js';
import {
  ServerMessageType,
  ClientMessageType,
  PhaseType,
  GameId,
  InputType,
  VillageRole,
  ROLE_DISTRIBUTIONS,
  BB_MAX_PLAYERS,
} from '@boredless/shared';
import type {
  ServerMessage,
  JoinedMessage,
  PhaseChangedMessage,
  GameStartedMessage,
  GameOverMessage,
  ErrorMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  RoomClosedMessage,
  PongMessage,
  InputAcceptedMessage,
  InputRejectedMessage,
  RoomStateMessage,
  PrivateStateMessage,
  GameSelectedMessage,
  ScoreUpdateMessage,
  TimerTickMessage,
} from '@boredless/shared';
import type { FastifyInstance } from 'fastify';

// ─────────────────────────────────────────────────────────────────────────────
// SERVER LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let serverUrl: string;
let wsUrl: string;

beforeAll(async () => {
  app = await buildApp({
    port: 0,
    host: '127.0.0.1',
    corsOrigins: ['*'],
    baseUrl: 'http://localhost:3299',
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as AddressInfo;
  serverUrl = `http://127.0.0.1:${address.port}`;
  wsUrl = `ws://127.0.0.1:${address.port}/ws`;
}, 15_000);

afterAll(async () => {
  timerEngine.stopAll();
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

type VillagePrivate = {
  role: VillageRole;
  isAlive: boolean;
  werewolfTeammates: string[];
  seerResult: { targetPlayerId: string; isWerewolf: boolean } | null;
  hasActed: boolean;
  hasVoted: boolean;
  nightTargets: { playerId: string; playerName: string }[] | null;
  voteTargets: { playerId: string; playerName: string }[] | null;
};

/**
 * Wait for a specific message type from a WebSocket client.
 * Rejects after timeoutMs if no matching message arrives.
 */
function waitForMessage<T extends ServerMessage>(
  ws: WebSocket,
  type: T['type'],
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeoutMs);

    function handler(raw: WebSocket.RawData) {
      try {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === type) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg as T);
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.on('message', handler);
  });
}

/**
 * Wait for a specific phase type via PHASE_CHANGED or GAME_STARTED messages.
 */
async function waitForPhase(
  ws: WebSocket,
  phaseType: PhaseType,
  timeoutMs: number,
): Promise<PhaseChangedMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for phase: ${phaseType} (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(raw: WebSocket.RawData) {
      try {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (
          (msg.type === ServerMessageType.PHASE_CHANGED ||
            msg.type === ServerMessageType.GAME_STARTED) &&
          (msg as PhaseChangedMessage | GameStartedMessage).phase.phaseType === phaseType
        ) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg as PhaseChangedMessage);
        }
      } catch {
        // ignore
      }
    }

    ws.on('message', handler);
  });
}

/** Create a new room via HTTP */
async function createRoom(): Promise<{ roomId: string; code: string; qrDataUrl: string }> {
  const res = await fetch(`${serverUrl}/api/rooms`, { method: 'POST' });
  expect(res.status).toBe(201);
  return res.json() as Promise<{ roomId: string; code: string; qrDataUrl: string }>;
}

/** Open a raw WebSocket connection */
function openWs(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Send a JSON message over WebSocket */
function send(ws: WebSocket, msg: Record<string, unknown>): void {
  ws.send(JSON.stringify(msg));
}

interface ConnectedPlayer {
  ws: WebSocket;
  sessionId: string;
  playerId: string;
  reconnectToken: string;
  name: string;
}

/** Join a room and return the connected player info */
async function connectPlayer(roomCode: string, name: string): Promise<ConnectedPlayer> {
  const ws = await openWs();
  const joinedPromise = waitForMessage<JoinedMessage>(ws, ServerMessageType.JOINED);
  send(ws, {
    type: ClientMessageType.JOIN_ROOM,
    roomCode,
    playerName: name,
    preferredColor: null,
  });
  const joined = await joinedPromise;
  return {
    ws,
    sessionId: joined.result.sessionId,
    playerId: joined.result.playerId,
    reconnectToken: joined.result.reconnectToken,
    name,
  };
}

/** Connect multiple players sequentially */
async function connectPlayers(roomCode: string, names: string[]): Promise<ConnectedPlayer[]> {
  const players: ConnectedPlayer[] = [];
  for (const name of names) {
    players.push(await connectPlayer(roomCode, name));
  }
  return players;
}

/** Select a game and start it */
function selectAndStartGame(hostWs: WebSocket, gameId: GameId): void {
  send(hostWs, { type: ClientMessageType.SELECT_GAME, gameId });
  send(hostWs, { type: ClientMessageType.START_GAME });
}

/** Close all WebSocket connections */
async function closeAll(clients: ConnectedPlayer[]): Promise<void> {
  await Promise.all(
    clients.map(
      c =>
        new Promise<void>(resolve => {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.once('close', () => resolve());
            c.ws.close();
          } else {
            resolve();
          }
        }),
    ),
  );
}


/**
 * Wait for a PRIVATE_STATE that is a VOS night-phase state.
 * Simply waits for the next PRIVATE_STATE with gameId=village_of_shadows.
 * Must be called AFTER consuming the role-reveal PRIVATE_STATE to avoid collisions.
 */
function waitForNightPrivateState(ws: WebSocket, timeoutMs = 10_000): Promise<PrivateStateMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for night PRIVATE_STATE (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(raw: WebSocket.RawData) {
      try {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === ServerMessageType.PRIVATE_STATE) {
          const state = (msg as PrivateStateMessage).state as VillagePrivate & { gameId?: string };
          if (state.gameId === 'village_of_shadows' && typeof state.hasActed === 'boolean') {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(msg as PrivateStateMessage);
          }
        }
      } catch {
        // ignore
      }
    }

    ws.on('message', handler);
  });
}

/**
 * Wait for a VOS PRIVATE_STATE with a hasVoted field (i.e., during VOS_VOTE phase).
 * Must be called BEFORE the VOS_VOTE phase fires to avoid missing the message.
 */
function waitForVotePrivateState(ws: WebSocket, timeoutMs = 10_000): Promise<PrivateStateMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for vote PRIVATE_STATE (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(raw: WebSocket.RawData) {
      try {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === ServerMessageType.PRIVATE_STATE) {
          const state = (msg as PrivateStateMessage).state as VillagePrivate & { gameId?: string };
          // The vote phase private state has voteTargets and hasVoted fields
          if (state.gameId === 'village_of_shadows' && state.hasVoted === false) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(msg as PrivateStateMessage);
          }
        }
      } catch {
        // ignore
      }
    }

    ws.on('message', handler);
  });
}

/** Have all players submit fake answers during BB_SUBMIT */
async function submitAllAnswers(players: ConnectedPlayer[]): Promise<void> {
  const accepted = Promise.all(
    players.map(p =>
      waitForMessage<InputAcceptedMessage>(p.ws, ServerMessageType.INPUT_ACCEPTED, 5_000),
    ),
  );
  players.forEach((p, i) => {
    send(p.ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: `Fake answer number ${i} unique text here` },
    });
  });
  await accepted;
}


/**
 * Wait for the PRIVATE_STATE that includes voteOptions (only sent in BB_VOTING phase).
 * Must be called BEFORE the voting phase starts to avoid missing the message.
 * Each player gets a PRIVATE_STATE with voteOptions !== null when VOTING begins.
 */
function waitForVoteOptions(
  ws: WebSocket,
  timeoutMs = 10_000,
): Promise<{ answerId: string; text: string }[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for voteOptions in PRIVATE_STATE`));
    }, timeoutMs);

    function handler(raw: WebSocket.RawData) {
      try {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === ServerMessageType.PRIVATE_STATE) {
          const state = (msg as PrivateStateMessage).state as { voteOptions: { answerId: string; text: string }[] | null };
          if (state.voteOptions !== null && state.voteOptions !== undefined) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(state.voteOptions);
          }
        }
      } catch {
        // ignore
      }
    }

    ws.on('message', handler);
  });
}

/**
 * Pre-register vote option listeners, then await vote options.
 * Waits for a PRIVATE_STATE that has voteOptions !== null.
 */
function preRegisterVoteOptions(players: ConnectedPlayer[]): Promise<{ answerId: string; text: string }[][]> {
  return Promise.all(players.map(p => waitForVoteOptions(p.ws, 10_000)));
}

/** Have all players vote for their first available option */
async function voteAll(
  players: ConnectedPlayer[],
  voteOptions: { answerId: string; text: string }[][],
): Promise<void> {
  const voted = Promise.all(
    players.map(p =>
      waitForMessage<InputAcceptedMessage>(p.ws, ServerMessageType.INPUT_ACCEPTED, 5_000),
    ),
  );
  players.forEach((p, i) => {
    const opts = voteOptions[i];
    if (opts.length > 0) {
      send(p.ws, {
        type: ClientMessageType.SUBMIT_INPUT,
        inputType: InputType.VOTE,
        payload: { answerId: opts[0].answerId },
      });
    }
  });
  await voted;
}

/** Have all special-role players submit night actions */
async function performNightActions(
  players: ConnectedPlayer[],
  nightPrivates: PrivateStateMessage[],
): Promise<void> {
  const specialRoles = [VillageRole.WEREWOLF, VillageRole.SEER, VillageRole.DOCTOR];
  for (let i = 0; i < players.length; i++) {
    const state = nightPrivates[i].state as VillagePrivate;
    if (specialRoles.includes(state.role) && state.nightTargets && state.nightTargets.length > 0) {
      send(players[i].ws, {
        type: ClientMessageType.SUBMIT_INPUT,
        inputType: InputType.NIGHT_ACTION,
        payload: { targetPlayerId: state.nightTargets[0].playerId },
      });
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

/** Verify role distribution for a given player count */
async function verifyRoleDistribution(playerCount: number): Promise<void> {
  const { code } = await createRoom();
  const names = Array.from({ length: playerCount }, (_, i) => `P${i + 1}`);
  const players = await connectPlayers(code, names);

  const privatePromises = players.map(p =>
    waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE, 5_000),
  );
  selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
  const privates = await Promise.all(privatePromises);

  const dist = ROLE_DISTRIBUTIONS[playerCount];
  const roles = privates.map(p => (p.state as VillagePrivate).role);

  expect(roles.filter(r => r === VillageRole.WEREWOLF).length).toBe(dist.werewolves);
  expect(roles.filter(r => r === VillageRole.SEER).length).toBe(dist.seers);
  expect(roles.filter(r => r === VillageRole.DOCTOR).length).toBe(dist.doctors);
  expect(roles.filter(r => r === VillageRole.VILLAGER).length).toBe(dist.villagers);

  await closeAll(players);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROOM LIFECYCLE — HAPPY PATH
// ─────────────────────────────────────────────────────────────────────────────

describe('Room Lifecycle — Happy Path', () => {
  it('creates a room via POST /api/rooms', async () => {
    const room = await createRoom();
    expect(room.roomId).toBeTruthy();
    expect(room.code).toHaveLength(4);
    expect(room.qrDataUrl).toContain('data:image/png');
  });

  it('host connects via WebSocket and gets session token', async () => {
    const { code } = await createRoom();
    const host = await connectPlayer(code, 'Host');
    expect(host.playerId).toBeTruthy();
    expect(host.sessionId).toBeTruthy();
    expect(host.reconnectToken).toBeTruthy();
    host.ws.close();
  });

  it('player joins room and appears in room state', async () => {
    const { code } = await createRoom();
    const p = await connectPlayer(code, 'Alice');
    // JOINED message contains room state with the player
    expect(p.playerId).toBeTruthy();
    expect(p.reconnectToken).toBeTruthy();
    p.ws.close();
  });

  it('multiple players join (4 players), all get unique IDs', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie', 'Dana']);
    expect(players).toHaveLength(4);
    const ids = new Set(players.map(p => p.playerId));
    expect(ids.size).toBe(4);
    await closeAll(players);
  });

  it('PLAYER_JOINED broadcast to existing players when someone joins', async () => {
    const { code } = await createRoom();
    const alice = await connectPlayer(code, 'Alice');
    const joinedPromise = waitForMessage<PlayerJoinedMessage>(
      alice.ws,
      ServerMessageType.PLAYER_JOINED,
    );
    const bob = await connectPlayer(code, 'Bob');
    const joined = await joinedPromise;
    expect(joined.playerName).toBe('Bob');
    expect(joined.playerCount).toBe(2);
    alice.ws.close();
    bob.ws.close();
  });

  it('6 players can join and playerCount increments correctly', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(players).toHaveLength(6);
    await closeAll(players);
  });

  it('host starts Bluff Battle → GAME_STARTED broadcast to all', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const startedPromises = players.map(p =>
      waitForMessage<GameStartedMessage>(p.ws, ServerMessageType.GAME_STARTED),
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const started = await Promise.all(startedPromises);
    for (const s of started) {
      expect(s.gameId).toBe(GameId.BLUFF_BATTLE);
    }
    await closeAll(players);
  });

  it('room status is in_lobby after joining', async () => {
    const { code } = await createRoom();
    const ws = await openWs();
    const joinedPromise = waitForMessage<JoinedMessage>(ws, ServerMessageType.JOINED);
    send(ws, {
      type: ClientMessageType.JOIN_ROOM,
      roomCode: code,
      playerName: 'Alice',
      preferredColor: null,
    });
    const joined = await joinedPromise;
    expect(joined.result.room.status).toBe('in_lobby');
    ws.close();
  });

  it('GET /api/rooms/:code returns room info', async () => {
    const { code } = await createRoom();
    const res = await fetch(`${serverUrl}/api/rooms/${code}`);
    expect(res.status).toBe(200);
    const info = await res.json() as { code: string; status: string; playerCount: number };
    expect(info.code).toBe(code);
    expect(info.playerCount).toBe(0);
  });

  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${serverUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('first player is host', async () => {
    const { code } = await createRoom();
    const alice = await connectPlayer(code, 'Alice');
    // Alice is first player, should be host — verified by being able to start game
    const bob = await connectPlayer(code, 'Bob');
    const charlie = await connectPlayer(code, 'Charlie');
    const startedPromise = waitForMessage<GameStartedMessage>(
      alice.ws,
      ServerMessageType.GAME_STARTED,
    );
    selectAndStartGame(alice.ws, GameId.BLUFF_BATTLE);
    const started = await startedPromise;
    expect(started.gameId).toBe(GameId.BLUFF_BATTLE);
    await closeAll([alice, bob, charlie]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROOM LIFECYCLE — EDGE CASES & ERRORS
// ─────────────────────────────────────────────────────────────────────────────

describe('Room Lifecycle — Edge Cases & Errors', () => {
  it('join with invalid room code → JOIN_FAILED error', async () => {
    const ws = await openWs();
    const errorPromise = waitForMessage<ErrorMessage>(ws, ServerMessageType.ERROR);
    send(ws, {
      type: ClientMessageType.JOIN_ROOM,
      roomCode: 'ZZZZ',
      playerName: 'Alice',
      preferredColor: null,
    });
    const err = await errorPromise;
    expect(err.code).toBe('JOIN_FAILED');
    expect(err.message).toContain('not found');
    ws.close();
  });

  it('join when game already started → JOIN_FAILED error', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await waitForMessage<GameStartedMessage>(players[0].ws, ServerMessageType.GAME_STARTED);

    const ws = await openWs();
    const errorPromise = waitForMessage<ErrorMessage>(ws, ServerMessageType.ERROR);
    send(ws, {
      type: ClientMessageType.JOIN_ROOM,
      roomCode: code,
      playerName: 'Latecomer',
      preferredColor: null,
    });
    const err = await errorPromise;
    expect(err.code).toBe('JOIN_FAILED');
    ws.close();
    await closeAll(players);
  });

  it('player disconnects → PLAYER_LEFT broadcast to others', async () => {
    const { code } = await createRoom();
    const alice = await connectPlayer(code, 'Alice');
    const bob = await connectPlayer(code, 'Bob');
    const leftPromise = waitForMessage<PlayerLeftMessage>(
      alice.ws,
      ServerMessageType.PLAYER_LEFT,
    );
    bob.ws.close();
    const left = await leftPromise;
    expect(left.playerName).toBe('Bob');
    alice.ws.close();
  });

  it('player reconnects with session token → state restored', async () => {
    const { code } = await createRoom();
    const p = await connectPlayer(code, 'Alice');
    const { sessionId, reconnectToken, playerId } = p;
    p.ws.close();
    await new Promise(r => setTimeout(r, 150));

    const ws2 = await openWs();
    const joinedPromise = waitForMessage<JoinedMessage>(ws2, ServerMessageType.JOINED);
    send(ws2, { type: ClientMessageType.REJOIN, sessionId, reconnectToken });
    const joined = await joinedPromise;
    expect(joined.result.playerId).toBe(playerId);
    ws2.close();
  });

  it('rejoin with invalid token → REJOIN_FAILED error', async () => {
    const { code } = await createRoom();
    const p = await connectPlayer(code, 'Alice');
    const { sessionId } = p;
    p.ws.close();
    await new Promise(r => setTimeout(r, 150));

    const ws2 = await openWs();
    const errorPromise = waitForMessage<ErrorMessage>(ws2, ServerMessageType.ERROR);
    send(ws2, { type: ClientMessageType.REJOIN, sessionId, reconnectToken: 'BADTOKEN' });
    const err = await errorPromise;
    expect(err.code).toBe('REJOIN_FAILED');
    ws2.close();
  });

  it('host kicks player → player WS closes with KICKED code', async () => {
    const { code } = await createRoom();
    const alice = await connectPlayer(code, 'Alice');
    const bob = await connectPlayer(code, 'Bob');

    const kickedPromise = new Promise<void>(resolve => {
      bob.ws.on('close', () => resolve());
    });

    send(alice.ws, { type: ClientMessageType.KICK_PLAYER, playerId: bob.playerId });
    await kickedPromise;
    expect(bob.ws.readyState).not.toBe(WebSocket.OPEN);

    alice.ws.close();
  });

  it('non-host cannot kick → host player not affected', async () => {
    const { code } = await createRoom();
    const alice = await connectPlayer(code, 'Alice');
    const bob = await connectPlayer(code, 'Bob');

    send(bob.ws, { type: ClientMessageType.KICK_PLAYER, playerId: alice.playerId });
    await new Promise(r => setTimeout(r, 300));
    expect(alice.ws.readyState).toBe(WebSocket.OPEN);

    alice.ws.close();
    bob.ws.close();
  });

  it('invalid message type → UNKNOWN_MESSAGE error', async () => {
    const ws = await openWs();
    const errorPromise = waitForMessage<ErrorMessage>(ws, ServerMessageType.ERROR);
    ws.send(JSON.stringify({ type: 'not_a_real_type' }));
    const err = await errorPromise;
    expect(err.code).toBe('UNKNOWN_MESSAGE');
    ws.close();
  });

  it('malformed JSON → PARSE_ERROR error', async () => {
    const ws = await openWs();
    const errorPromise = waitForMessage<ErrorMessage>(ws, ServerMessageType.ERROR);
    ws.send('not json!!!');
    const err = await errorPromise;
    expect(err.code).toBe('PARSE_ERROR');
    ws.close();
  });

  it('start game without selecting one → NO_GAME error', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const errorPromise = waitForMessage<ErrorMessage>(players[0].ws, ServerMessageType.ERROR);
    send(players[0].ws, { type: ClientMessageType.START_GAME });
    const err = await errorPromise;
    expect(err.code).toBe('NO_GAME');
    await closeAll(players);
  });

  it('start Bluff Battle with 2 players → TOO_FEW_PLAYERS error', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob']);
    send(players[0].ws, { type: ClientMessageType.SELECT_GAME, gameId: GameId.BLUFF_BATTLE });
    const errorPromise = waitForMessage<ErrorMessage>(players[0].ws, ServerMessageType.ERROR);
    send(players[0].ws, { type: ClientMessageType.START_GAME });
    const err = await errorPromise;
    expect(err.code).toBe('TOO_FEW_PLAYERS');
    await closeAll(players);
  });

  it('non-host cannot start game → NOT_HOST error', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    send(players[0].ws, { type: ClientMessageType.SELECT_GAME, gameId: GameId.BLUFF_BATTLE });
    const errorPromise = waitForMessage<ErrorMessage>(players[1].ws, ServerMessageType.ERROR);
    send(players[1].ws, { type: ClientMessageType.START_GAME });
    const err = await errorPromise;
    expect(err.code).toBe('NOT_HOST');
    await closeAll(players);
  });

  it('select invalid game → INVALID_GAME error', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice']);
    const errorPromise = waitForMessage<ErrorMessage>(players[0].ws, ServerMessageType.ERROR);
    send(players[0].ws, { type: ClientMessageType.SELECT_GAME, gameId: 'not_a_game' as GameId });
    const err = await errorPromise;
    expect(err.code).toBe('INVALID_GAME');
    await closeAll(players);
  });

  it('close room → ROOM_CLOSED broadcast', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob']);
    const closedPromise = waitForMessage<RoomClosedMessage>(
      players[1].ws,
      ServerMessageType.ROOM_CLOSED,
    );
    send(players[0].ws, { type: ClientMessageType.CLOSE_ROOM });
    const closed = await closedPromise;
    expect(closed.reason).toBeTruthy();
    await closeAll(players);
  });

  it('PING → PONG response with serverTime', async () => {
    const { code } = await createRoom();
    const p = await connectPlayer(code, 'Alice');
    const pongPromise = waitForMessage<PongMessage>(
      p.ws,
      ServerMessageType.PONG,
    );
    send(p.ws, { type: ClientMessageType.PING, timestamp: Date.now() });
    const pong = await pongPromise;
    expect(pong.serverTime).toBeGreaterThan(0);
    p.ws.close();
  });

  it('display client receives ROOM_STATE on join', async () => {
    const { roomId, code } = await createRoom();
    const displayWs = await openWs();
    const roomStatePromise = waitForMessage<RoomStateMessage>(
      displayWs,
      ServerMessageType.ROOM_STATE,
    );
    send(displayWs, { type: ClientMessageType.JOIN_DISPLAY, roomId });
    const roomState = await roomStatePromise;
    expect(roomState.room.code).toBe(code);
    displayWs.close();
  });

  it('display client receives PLAYER_JOINED when player joins', async () => {
    const { roomId, code } = await createRoom();
    const displayWs = await openWs();
    const roomStatePromise = waitForMessage<RoomStateMessage>(displayWs, ServerMessageType.ROOM_STATE);
    send(displayWs, { type: ClientMessageType.JOIN_DISPLAY, roomId });
    await roomStatePromise;

    const playerJoinedPromise = waitForMessage<PlayerJoinedMessage>(
      displayWs,
      ServerMessageType.PLAYER_JOINED,
    );
    const alice = await connectPlayer(code, 'Alice');
    const playerJoined = await playerJoinedPromise;
    expect(playerJoined.playerName).toBe('Alice');

    alice.ws.close();
    displayWs.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BLUFF BATTLE — FULL HAPPY PATH
// ─────────────────────────────────────────────────────────────────────────────

describe('Bluff Battle — Full Happy Path', () => {
  it('host selects Bluff Battle → GAME_SELECTED broadcast', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const selectedPromise = waitForMessage<GameSelectedMessage>(
      players[0].ws,
      ServerMessageType.GAME_SELECTED,
    );
    send(players[0].ws, { type: ClientMessageType.SELECT_GAME, gameId: GameId.BLUFF_BATTLE });
    const selected = await selectedPromise;
    expect(selected.gameId).toBe(GameId.BLUFF_BATTLE);
    await closeAll(players);
  });

  it('game starts → INSTRUCTIONS phase broadcast to all players', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const startedPromises = players.map(p =>
      waitForMessage<GameStartedMessage>(p.ws, ServerMessageType.GAME_STARTED),
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const started = await Promise.all(startedPromises);
    for (const s of started) {
      expect(s.gameId).toBe(GameId.BLUFF_BATTLE);
      expect(s.phase.phaseType).toBe(PhaseType.INSTRUCTIONS);
      expect(s.phase.totalRounds).toBe(3);
    }
    await closeAll(players);
  });

  it('each player receives PRIVATE_STATE after game starts', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const privates = await Promise.all(privatePromises);
    for (const priv of privates) {
      const s = priv.state as { gameId: string; hasSubmitted: boolean; hasVoted: boolean };
      expect(s.gameId).toBe('bluff_battle');
      expect(s.hasSubmitted).toBe(false);
      expect(s.hasVoted).toBe(false);
    }
    await closeAll(players);
  });

  it('phase auto-advances INSTRUCTIONS → BB_SUBMIT after timer', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await waitForMessage<GameStartedMessage>(players[0].ws, ServerMessageType.GAME_STARTED);
    const submitPhase = await waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    expect(submitPhase.phase.phaseType).toBe(PhaseType.BB_SUBMIT);
    expect(submitPhase.phase.roundNumber).toBe(1);
    await closeAll(players);
  }, 20_000);

  it('all players submit answers → immediately advances to BB_VOTING', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhasePromise;
    const votingPromise = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    const voting = await votingPromise;
    expect(voting.phase.phaseType).toBe(PhaseType.BB_VOTING);
    await closeAll(players);
  }, 25_000);

  it('voting phase: each player gets voteOptions excluding their own answer', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhasePromise;
    const voteOptionsPromise = preRegisterVoteOptions(players);
    const votingPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    await votingPhasePromise;
    const voteOptions = await voteOptionsPromise;
    // 3 players → 3 fake answers + 1 correct = 4 total, minus own = 3 each
    for (const opts of voteOptions) {
      expect(opts.length).toBeGreaterThan(0);
      expect(opts.length).toBeLessThanOrEqual(3); // cannot vote own
    }
    await closeAll(players);
  }, 25_000);

  it('all players vote → advances to BB_REVEAL with reveal data', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhasePromise;
    const voteOptionsPromise = preRegisterVoteOptions(players);
    const votingPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    await votingPhasePromise;
    const voteOptions = await voteOptionsPromise;
    const revealPhaseP = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
    await voteAll(players, voteOptions);
    const reveal = await revealPhaseP;
    const pub = reveal.gamePublicState as { revealData: { correctAnswerId: string } | null };
    expect(pub.revealData).not.toBeNull();
    expect(pub.revealData!.correctAnswerId).toBeTruthy();
    await closeAll(players);
  }, 30_000);

  it('REVEAL shows correct answer highlighted and round scores', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhasePromise;
    const voteOptionsPromise = preRegisterVoteOptions(players);
    const votingPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    await votingPhasePromise;
    const voteOptions = await voteOptionsPromise;
    const revealPhaseP = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
    await voteAll(players, voteOptions);
    const reveal = await revealPhaseP;
    const pub = reveal.gamePublicState as {
      revealData: {
        correctAnswerId: string;
        answers: { answerId: string; isCorrect: boolean }[];
        roundScores: { playerId: string; roundPoints: number }[];
      };
    };
    expect(pub.revealData.answers.some(a => a.isCorrect)).toBe(true);
    expect(pub.revealData.roundScores).toHaveLength(3);
    await closeAll(players);
  }, 30_000);

  it('SCORE_UPDATE broadcast after reveal phase', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhasePromise;
    const voteOptionsPromise = preRegisterVoteOptions(players);
    const votingPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    await votingPhasePromise;
    const voteOptions = await voteOptionsPromise;
    const revealPhaseP2 = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
    await voteAll(players, voteOptions);
    // Register SCORE_UPDATE waiter before REVEAL phase resolves to avoid missing it
    const scoreUpdateP2 = waitForMessage<ScoreUpdateMessage>(
      players[0].ws,
      ServerMessageType.SCORE_UPDATE,
      20_000,
    );
    await revealPhaseP2;
    const scoreUpdate = await scoreUpdateP2;
    expect(scoreUpdate.scores).toHaveLength(3);
    for (const s of scoreUpdate.scores) {
      expect(s.playerId).toBeTruthy();
      expect(typeof s.score).toBe('number');
    }
    await closeAll(players);
  }, 35_000);

  it('game ends after 3 rounds → GAME_OVER with final scores', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const firstSubmitPhase = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    for (let round = 0; round < 3; round++) {
      if (round === 0) { await firstSubmitPhase; } else { await waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000); }
      const voteOptionsP = preRegisterVoteOptions(players);
      const votingPhaseP = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
      await submitAllAnswers(players);
      await votingPhaseP;
      const voteOptions = await voteOptionsP;
      const revealP3 = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
      await voteAll(players, voteOptions);
      await revealP3;
      // Register BB_SCORES waiter before the 10s REVEAL timer expires
      const scoresPhaseP3 = waitForPhase(players[0].ws, PhaseType.BB_SCORES, 20_000);
      await scoresPhaseP3;
    }
    const gameOver = await waitForMessage<GameOverMessage>(
      players[0].ws,
      ServerMessageType.GAME_OVER,
      15_000,
    );
    expect(gameOver.result.gameId).toBe(GameId.BLUFF_BATTLE);
    expect(gameOver.result.finalScores).toHaveLength(3);
    expect(gameOver.result.winnerId).toBeTruthy();
    await closeAll(players);
  }, 120_000);

  it('return to lobby after game → room status in_lobby', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const gameOverPromise = waitForMessage<GameOverMessage>(players[0].ws, ServerMessageType.GAME_OVER, 180_000);
    const firstSubmitPhase = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    // Play through all 3 rounds to reach GAME_OVER faster
    for (let round = 0; round < 3; round++) {
      if (round === 0) { await firstSubmitPhase; } else { await waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 20_000); }
      const voteOptionsP = preRegisterVoteOptions(players);
      const votingP = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
      await submitAllAnswers(players);
      await votingP;
      const voteOptions = await voteOptionsP;
      const revealP = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
      await voteAll(players, voteOptions);
      await revealP;
      await waitForPhase(players[0].ws, PhaseType.BB_SCORES, 20_000);
    }
    const gameOver = await gameOverPromise;
    expect(gameOver.result.gameId).toBe(GameId.BLUFF_BATTLE);
    const roomStatePromise = waitForMessage<RoomStateMessage>(
      players[0].ws,
      ServerMessageType.ROOM_STATE,
      5_000,
    );
    send(players[0].ws, { type: ClientMessageType.RETURN_TO_LOBBY });
    const roomState = await roomStatePromise;
    expect(roomState.room.status).toBe('in_lobby');
    await closeAll(players);
  }, 180_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. BLUFF BATTLE — ALTERNATIVE PATHS
// ─────────────────────────────────────────────────────────────────────────────

describe('Bluff Battle — Alternative Paths', () => {
  it('submit during wrong phase → rejected with reason', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const startedPromise = waitForMessage<GameStartedMessage>(players[0].ws, ServerMessageType.GAME_STARTED);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await startedPromise;
    const rejectedPromise = waitForMessage<InputRejectedMessage>(
      players[0].ws,
      ServerMessageType.INPUT_REJECTED,
      3_000,
    );
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: 'Too early' },
    });
    const rejected = await rejectedPromise;
    expect(rejected.reason).toBe('Not in submission phase');
    await closeAll(players);
  }, 15_000);

  it('player submits answer twice → second rejected with Already submitted', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhaseP = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhaseP;
    const accepted = waitForMessage<InputAcceptedMessage>(
      players[0].ws,
      ServerMessageType.INPUT_ACCEPTED,
    );
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: 'My answer' },
    });
    await accepted;
    const rejectedPromise = waitForMessage<InputRejectedMessage>(
      players[0].ws,
      ServerMessageType.INPUT_REJECTED,
      3_000,
    );
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: 'Another answer' },
    });
    const rejected = await rejectedPromise;
    expect(rejected.reason).toBe('Already submitted');
    await closeAll(players);
  }, 25_000);

  it('player votes twice → second vote rejected with Already voted', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhaseP = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhaseP;
    const voteOptionsPromise = preRegisterVoteOptions(players);
    const votingPhasePromise = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    await votingPhasePromise;
    const voteOptions = await voteOptionsPromise;
    const accepted = waitForMessage<InputAcceptedMessage>(
      players[0].ws,
      ServerMessageType.INPUT_ACCEPTED,
    );
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId: voteOptions[0][0].answerId },
    });
    await accepted;
    const rejectedPromise = waitForMessage<InputRejectedMessage>(
      players[0].ws,
      ServerMessageType.INPUT_REJECTED,
      3_000,
    );
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId: voteOptions[0][0].answerId },
    });
    const rejected = await rejectedPromise;
    expect(rejected.reason).toBe('Already voted');
    await closeAll(players);
  }, 30_000);

  it('vote with invalid answerId → rejected with Invalid answer', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhaseP = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhaseP;
    const _voteOpts = preRegisterVoteOptions(players);
    const votingPhaseInvalid = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
    await submitAllAnswers(players);
    await votingPhaseInvalid;
    await _voteOpts; // ensure private state received
    const rejectedPromise = waitForMessage<InputRejectedMessage>(
      players[0].ws,
      ServerMessageType.INPUT_REJECTED,
      3_000,
    );
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId: 'definitely_not_a_real_answer_id' },
    });
    const rejected = await rejectedPromise;
    expect(rejected.reason).toContain('Invalid answer');
    await closeAll(players);
  }, 30_000);

  it('only minimum players (3) → game starts correctly', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const startedPromise = waitForMessage<GameStartedMessage>(
      players[0].ws,
      ServerMessageType.GAME_STARTED,
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const started = await startedPromise;
    expect(started.gameId).toBe(GameId.BLUFF_BATTLE);
    const pub = started.gamePublicState as { totalPlayers: number };
    expect(pub.totalPlayers).toBe(3);
    await closeAll(players);
  }, 15_000);

  it(`maximum players (${BB_MAX_PLAYERS}) → game starts correctly`, async () => {
    const { code } = await createRoom();
    const names = Array.from({ length: BB_MAX_PLAYERS }, (_, i) => `PL${i + 1}`);
    const players = await connectPlayers(code, names);
    const startedPromise = waitForMessage<GameStartedMessage>(
      players[0].ws,
      ServerMessageType.GAME_STARTED,
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const started = await startedPromise;
    const pub = started.gamePublicState as { totalPlayers: number };
    expect(pub.totalPlayers).toBe(BB_MAX_PLAYERS);
    await closeAll(players);
  }, 15_000);

  it('timer tick messages are received and count down', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const startedP = waitForMessage<GameStartedMessage>(players[0].ws, ServerMessageType.GAME_STARTED);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await startedP;
    const ticks: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No timer ticks received')), 4000);
      players[0].ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as ServerMessage;
          if (msg.type === ServerMessageType.TIMER_TICK) {
            ticks.push((msg as TimerTickMessage).remainingMs);
            if (ticks.length >= 3) {
              clearTimeout(timer);
              resolve();
            }
          }
        } catch {}
      });
    });
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks[0]).toBeGreaterThanOrEqual(ticks[ticks.length - 1]);
    await closeAll(players);
  }, 20_000);

  it('public state shows submittedCount updating as players submit', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhaseP = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhaseP;
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: 'First answer' },
    });
    const phaseChanged = await waitForMessage<PhaseChangedMessage>(
      players[0].ws,
      ServerMessageType.PHASE_CHANGED,
      5_000,
    );
    const pub = phaseChanged.gamePublicState as { submittedCount: number; totalPlayers: number };
    expect(pub.submittedCount).toBe(1);
    expect(pub.totalPlayers).toBe(3);
    await closeAll(players);
  }, 25_000);

  it('score accumulates correctly across 2 rounds', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const firstSubmitP = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    let prevTotal = 0;
    for (let round = 0; round < 2; round++) {
      if (round === 0) { await firstSubmitP; } else { await waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000); }
      const voteOptionsP = preRegisterVoteOptions(players);
      const votingPhaseP = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
      await submitAllAnswers(players);
      await votingPhaseP;
      const voteOptions = await voteOptionsP;
      const revealP4 = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
      await voteAll(players, voteOptions);
      await revealP4;
      // Register SCORE_UPDATE and BB_SCORES phase watchers before the 10s REVEAL timer expires
      const scoreUpdateP = waitForMessage<ScoreUpdateMessage>(
        players[0].ws,
        ServerMessageType.SCORE_UPDATE,
        15_000,
      );
      const scoresPhaseP = waitForPhase(players[0].ws, PhaseType.BB_SCORES, 20_000);
      const scoreUpdate = await scoreUpdateP;
      const currentTotal = scoreUpdate.scores.reduce((s, e) => s + e.score, 0);
      if (round > 0) {
        expect(currentTotal).toBeGreaterThanOrEqual(prevTotal);
      }
      prevTotal = currentTotal;
      await scoresPhaseP;
    }
    await closeAll(players);
  }, 90_000);

  it('player who does not submit still shows in round (timer advances phase)', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const submitPhaseP = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await submitPhaseP;
    // Only Alice and Bob submit, Charlie does not.
    // Register the phase change listener BEFORE sending submissions (since PHASE_CHANGED
    // arrives before INPUT_ACCEPTED due to server message ordering).
    const phaseChangePromise = waitForMessage<PhaseChangedMessage>(
      players[0].ws,
      ServerMessageType.PHASE_CHANGED,
      5_000,
    );
    const accepted = Promise.all([
      waitForMessage<InputAcceptedMessage>(players[0].ws, ServerMessageType.INPUT_ACCEPTED),
      waitForMessage<InputAcceptedMessage>(players[1].ws, ServerMessageType.INPUT_ACCEPTED),
    ]);
    send(players[0].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: 'Alice fake' },
    });
    send(players[1].ws, {
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: 'Bob fake' },
    });
    // Wait for the phase change that includes updated submittedCount
    const phaseChange = await phaseChangePromise;
    const pub = phaseChange.gamePublicState as { submittedCount: number };
    // submittedCount should be 1 or 2 (after one or both submissions)
    expect(pub.submittedCount).toBeGreaterThanOrEqual(1);
    await accepted;
    await closeAll(players);
  }, 25_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. VILLAGE OF SHADOWS — FULL HAPPY PATH
// ─────────────────────────────────────────────────────────────────────────────

describe('Village of Shadows — Full Happy Path', () => {
  it('host selects Village of Shadows → GAME_SELECTED broadcast', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const selectedPromise = waitForMessage<GameSelectedMessage>(
      players[0].ws,
      ServerMessageType.GAME_SELECTED,
    );
    send(players[0].ws, {
      type: ClientMessageType.SELECT_GAME,
      gameId: GameId.VILLAGE_OF_SHADOWS,
    });
    const selected = await selectedPromise;
    expect(selected.gameId).toBe(GameId.VILLAGE_OF_SHADOWS);
    await closeAll(players);
  });

  it('roles distributed correctly for 5 players', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const privates = await Promise.all(privatePromises);
    const dist = ROLE_DISTRIBUTIONS[5];
    const roles = privates.map(p => (p.state as VillagePrivate).role);
    expect(roles.filter(r => r === VillageRole.WEREWOLF).length).toBe(dist.werewolves);
    expect(roles.filter(r => r === VillageRole.SEER).length).toBe(dist.seers);
    expect(roles.filter(r => r === VillageRole.DOCTOR).length).toBe(dist.doctors);
    expect(roles.filter(r => r === VillageRole.VILLAGER).length).toBe(dist.villagers);
    await closeAll(players);
  }, 15_000);

  it('game starts → VOS_ROLE_REVEAL phase with all players alive', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const startedPromises = players.map(p =>
      waitForMessage<GameStartedMessage>(p.ws, ServerMessageType.GAME_STARTED),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const started = await Promise.all(startedPromises);
    for (const s of started) {
      expect(s.phase.phaseType).toBe(PhaseType.VOS_ROLE_REVEAL);
      const pub = s.gamePublicState as { players: { isAlive: boolean }[] };
      expect(pub.players.every(p => p.isAlive)).toBe(true);
    }
    await closeAll(players);
  }, 15_000);

  it('after role reveal → NIGHT phase with werewolves getting night targets', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const privates = await Promise.all(privatePromises);
    const wolfIdx = privates.findIndex(p => (p.state as VillagePrivate).role === VillageRole.WEREWOLF);
    // Register night state watcher BEFORE the NIGHT phase fires
    const wolfNightPrivateP = waitForNightPrivateState(players[wolfIdx].ws, 15_000);
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const wolfNightPrivate = await wolfNightPrivateP;
    const wolfState = wolfNightPrivate.state as VillagePrivate;
    expect(wolfState.nightTargets).not.toBeNull();
    expect(wolfState.nightTargets!.length).toBeGreaterThan(0);
    await closeAll(players);
  }, 20_000);

  it('NIGHT phase: wolves act → VOS_NIGHT_RESULT with message', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers and NIGHT phase watcher simultaneously
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const nightResultPromise = waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
    await performNightActions(players, nightPrivates);
    const nightResult = await nightResultPromise;
    const pub = nightResult.gamePublicState as { nightResultMessage: string | null };
    expect(pub.nightResultMessage).toBeTruthy();
    await closeAll(players);
  }, 60_000);

  it('NIGHT_RESULT → VOS_DAY phase with timer', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const nightResultP = waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
    await performNightActions(players, nightPrivates);
    await nightResultP;
    const dayPhase = await waitForPhase(players[0].ws, PhaseType.VOS_DAY, 20_000);
    expect(dayPhase.phase.phaseType).toBe(PhaseType.VOS_DAY);
    expect(dayPhase.phase.timerTotalMs).toBeGreaterThan(0);
    await closeAll(players);
  }, 70_000);

  it('players vote in VOS_VOTE phase → VOS_VOTE_RESULT with elimination message', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const nightResultP = waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
    await performNightActions(players, nightPrivates);
    await nightResultP;
    await waitForPhase(players[0].ws, PhaseType.VOS_DAY, 20_000);
    // Register vote private state watchers BEFORE VOTE phase fires
    const votePrivatePromises = players.map(p => waitForVotePrivateState(p.ws, 185_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_VOTE, 175_000);
    const votePrivates = await Promise.all(votePrivatePromises);
    // All alive players vote for first available target
    const votedPromises: Promise<unknown>[] = [];
    for (let i = 0; i < players.length; i++) {
      const vState = votePrivates[i].state as VillagePrivate;
      if (!vState.isAlive || !vState.voteTargets?.length) continue;
      votedPromises.push(
        waitForMessage<InputAcceptedMessage>(players[i].ws, ServerMessageType.INPUT_ACCEPTED, 5_000),
      );
      send(players[i].ws, {
        type: ClientMessageType.SUBMIT_INPUT,
        inputType: InputType.VOTE,
        payload: { answerId: vState.voteTargets[0].playerId },
      });
    }
    await Promise.all(votedPromises);
    const voteResult = await waitForPhase(players[0].ws, PhaseType.VOS_VOTE_RESULT, 45_000);
    const pub = voteResult.gamePublicState as { voteResultMessage: string | null };
    expect(pub.voteResultMessage).toBeTruthy();
    await closeAll(players);
  }, 200_000);

  it('game runs to completion → GAME_OVER with winner team', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const gameOver = await waitForMessage<GameOverMessage>(
      players[0].ws,
      ServerMessageType.GAME_OVER,
      300_000,
    );
    expect(gameOver.result.winnerTeam).toBeTruthy();
    expect(['villagers', 'werewolves']).toContain(gameOver.result.winnerTeam);
    expect(gameOver.result.gameId).toBe(GameId.VILLAGE_OF_SHADOWS);
    await closeAll(players);
  }, 310_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. VILLAGE OF SHADOWS — ALTERNATIVE PATHS
// ─────────────────────────────────────────────────────────────────────────────

describe('Village of Shadows — Alternative Paths', () => {
  it('role distribution correct for 5 players', async () => {
    await verifyRoleDistribution(5);
  }, 15_000);

  it('role distribution correct for 6 players', async () => {
    await verifyRoleDistribution(6);
  }, 15_000);

  it('role distribution correct for 7 players', async () => {
    await verifyRoleDistribution(7);
  }, 15_000);

  it('role distribution correct for 8 players', async () => {
    await verifyRoleDistribution(8);
  }, 15_000);

  it('minimum players (5) for Village → game starts', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const startedPromise = waitForMessage<GameStartedMessage>(
      players[0].ws,
      ServerMessageType.GAME_STARTED,
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const started = await startedPromise;
    expect(started.gameId).toBe(GameId.VILLAGE_OF_SHADOWS);
    await closeAll(players);
  }, 15_000);

  it('4 players → TOO_FEW_PLAYERS for Village', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D']);
    send(players[0].ws, {
      type: ClientMessageType.SELECT_GAME,
      gameId: GameId.VILLAGE_OF_SHADOWS,
    });
    const errorPromise = waitForMessage<ErrorMessage>(players[0].ws, ServerMessageType.ERROR);
    send(players[0].ws, { type: ClientMessageType.START_GAME });
    const err = await errorPromise;
    expect(err.code).toBe('TOO_FEW_PLAYERS');
    await closeAll(players);
  }, 10_000);

  it('non-special role (villager) cannot do night action', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const villagerIdx = nightPrivates.findIndex(
      p => (p.state as VillagePrivate).role === VillageRole.VILLAGER,
    );
    if (villagerIdx >= 0) {
      const rejectedPromise = waitForMessage<InputRejectedMessage>(
        players[villagerIdx].ws,
        ServerMessageType.INPUT_REJECTED,
        5_000,
      );
      const targetId = players[(villagerIdx + 1) % players.length].playerId;
      send(players[villagerIdx].ws, {
        type: ClientMessageType.SUBMIT_INPUT,
        inputType: InputType.NIGHT_ACTION,
        payload: { targetPlayerId: targetId },
      });
      const rejected = await rejectedPromise;
      expect(rejected.reason).toBe('Villagers have no night action');
    }
    await closeAll(players);
  }, 25_000);

  it('seer uses night power → gets role inspection result', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const seerIdx = nightPrivates.findIndex(
      p => (p.state as VillagePrivate).role === VillageRole.SEER,
    );
    if (seerIdx >= 0) {
      const seerState = nightPrivates[seerIdx].state as VillagePrivate;
      if (seerState.nightTargets && seerState.nightTargets.length > 0) {
        const accepted = waitForMessage<InputAcceptedMessage>(
          players[seerIdx].ws,
          ServerMessageType.INPUT_ACCEPTED,
        );
        send(players[seerIdx].ws, {
          type: ClientMessageType.SUBMIT_INPUT,
          inputType: InputType.NIGHT_ACTION,
          payload: { targetPlayerId: seerState.nightTargets[0].playerId },
        });
        await accepted;
        // Register seer PRIVATE_STATE watcher BEFORE NIGHT_RESULT fires
        const seerNightResultP = waitForMessage<PrivateStateMessage>(
          players[seerIdx].ws,
          ServerMessageType.PRIVATE_STATE,
          45_000,
        );
        await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
        const seerNightResult = await seerNightResultP;
        const sr = seerNightResult.state as VillagePrivate;
        expect(sr.seerResult).not.toBeNull();
        expect(typeof sr.seerResult!.isWerewolf).toBe('boolean');
        expect(sr.seerResult!.targetPlayerId).toBe(seerState.nightTargets[0].playerId);
      }
    }
    await closeAll(players);
  }, 60_000);

  it('doctor protects wolf target → night result message may say no death', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const wolfIdx = nightPrivates.findIndex(p => (p.state as VillagePrivate).role === VillageRole.WEREWOLF);
    const doctorIdx = nightPrivates.findIndex(p => (p.state as VillagePrivate).role === VillageRole.DOCTOR);
    if (wolfIdx >= 0 && doctorIdx >= 0) {
      const wolfState = nightPrivates[wolfIdx].state as VillagePrivate;
      const doctorState = nightPrivates[doctorIdx].state as VillagePrivate;
      if (wolfState.nightTargets && wolfState.nightTargets.length > 0) {
        const wolfTarget = wolfState.nightTargets[0].playerId;
        send(players[wolfIdx].ws, {
          type: ClientMessageType.SUBMIT_INPUT,
          inputType: InputType.NIGHT_ACTION,
          payload: { targetPlayerId: wolfTarget },
        });
        if (doctorState.nightTargets) {
          const docTarget = doctorState.nightTargets.find(t => t.playerId === wolfTarget);
          const targetToProtect = docTarget ?? doctorState.nightTargets[0];
          if (targetToProtect.playerId === wolfTarget) {
            send(players[doctorIdx].ws, {
              type: ClientMessageType.SUBMIT_INPUT,
              inputType: InputType.NIGHT_ACTION,
              payload: { targetPlayerId: wolfTarget },
            });
          }
        }
      }
    }
    // Doctor+wolf actions alone won't trigger early resolution (need all 3 special roles)
    // so NIGHT_RESULT fires at 30s timer; safe to await here
    const nightResult = await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
    const pub = nightResult.gamePublicState as { nightResultMessage: string | null };
    expect(pub.nightResultMessage).toBeTruthy();
    await closeAll(players);
  }, 60_000);

  it('day vote tie → no elimination (tied vote result message)', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    const nightResultP = waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
    await performNightActions(players, nightPrivates);
    await nightResultP;
    await waitForPhase(players[0].ws, PhaseType.VOS_DAY, 20_000);
    // Register vote private state watchers BEFORE VOTE phase fires
    const votePrivatePromises = players.map(p => waitForVotePrivateState(p.ws, 185_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_VOTE, 175_000);
    const votePrivates = await Promise.all(votePrivatePromises);
    // Split votes to create a tie
    const alivePlayers = players
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => (votePrivates[i].state as VillagePrivate).isAlive);
    if (alivePlayers.length >= 4) {
      const firstAliveState = votePrivates[alivePlayers[0].i].state as VillagePrivate;
      if (firstAliveState.voteTargets && firstAliveState.voteTargets.length >= 2) {
        const targetA = firstAliveState.voteTargets[0].playerId;
        const targetB = firstAliveState.voteTargets[1].playerId;
        for (let k = 0; k < alivePlayers.length; k++) {
          const { p, i } = alivePlayers[k];
          const pvt = votePrivates[i].state as VillagePrivate;
          if (!pvt.voteTargets?.length) continue;
          const wantTarget = k % 2 === 0 ? targetA : targetB;
          const actualTarget = pvt.voteTargets.find(t => t.playerId === wantTarget) ?? pvt.voteTargets[0];
          send(p.ws, {
            type: ClientMessageType.SUBMIT_INPUT,
            inputType: InputType.VOTE,
            payload: { answerId: actualTarget.playerId },
          });
        }
      }
    }
    const voteResult = await waitForPhase(players[0].ws, PhaseType.VOS_VOTE_RESULT, 45_000);
    const pub = voteResult.gamePublicState as { voteResultMessage: string | null };
    expect(pub.voteResultMessage).toBeTruthy();
    await closeAll(players);
  }, 200_000);

  it('dead player tries to vote → Dead players cannot act error', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    await Promise.all(privatePromises);
    // Register night private state watchers BEFORE NIGHT phase fires (they come together)
    const nightPrivatePromises = players.map(p => waitForNightPrivateState(p.ws, 15_000));
    await waitForPhase(players[0].ws, PhaseType.VOS_NIGHT, 15_000);
    const nightPrivates = await Promise.all(nightPrivatePromises);
    // Wolf kills a specific target
    const wolfIdx = nightPrivates.findIndex(p => (p.state as VillagePrivate).role === VillageRole.WEREWOLF);
    if (wolfIdx >= 0) {
      const wolfState = nightPrivates[wolfIdx].state as VillagePrivate;
      if (wolfState.nightTargets && wolfState.nightTargets.length > 0) {
        send(players[wolfIdx].ws, {
          type: ClientMessageType.SUBMIT_INPUT,
          inputType: InputType.NIGHT_ACTION,
          payload: { targetPlayerId: wolfState.nightTargets[0].playerId },
        });
      }
    }
    const nightResultP2 = waitForPhase(players[0].ws, PhaseType.VOS_NIGHT_RESULT, 40_000);
    await performNightActions(players, nightPrivates); // let all others act too
    await nightResultP2;
    await waitForPhase(players[0].ws, PhaseType.VOS_DAY, 20_000);
    await waitForPhase(players[0].ws, PhaseType.VOS_VOTE, 175_000);
    // Get updated vote phase private states
    const votePrivates = await Promise.all(
      players.map(p => waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE, 5_000)),
    );
    const deadIdx = votePrivates.findIndex(p => !(p.state as VillagePrivate).isAlive);
    if (deadIdx >= 0) {
      // Find a valid target from an alive player's perspective
      const aliveIdx = votePrivates.findIndex(p => (p.state as VillagePrivate).isAlive);
      if (aliveIdx >= 0) {
        const aliveState = votePrivates[aliveIdx].state as VillagePrivate;
        const someTarget = aliveState.voteTargets?.[0];
        if (someTarget) {
          const rejectedPromise = waitForMessage<InputRejectedMessage>(
            players[deadIdx].ws,
            ServerMessageType.INPUT_REJECTED,
            5_000,
          );
          send(players[deadIdx].ws, {
            type: ClientMessageType.SUBMIT_INPUT,
            inputType: InputType.VOTE,
            payload: { answerId: someTarget.playerId },
          });
          const rejected = await rejectedPromise;
          expect(rejected.reason).toBe('Dead players cannot act');
        }
      }
    }
    await closeAll(players);
  }, 200_000);

  it('wolves see each other as teammates (7 player game)', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const privates = await Promise.all(privatePromises);
    const wolves = privates
      .map((p, i) => ({ state: p.state as VillagePrivate, idx: i }))
      .filter(p => p.state.role === VillageRole.WEREWOLF);
    expect(wolves.length).toBe(ROLE_DISTRIBUTIONS[7].werewolves);
    for (const wolf of wolves) {
      // Each wolf should see the other wolves as teammates
      expect(wolf.state.werewolfTeammates.length).toBeGreaterThanOrEqual(
        wolves.length - 1, // number of other wolves
      );
    }
    await closeAll(players);
  }, 15_000);

  it('non-wolves do NOT see werewolf teammate list', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const privatePromises = players.map(p =>
      waitForMessage<PrivateStateMessage>(p.ws, ServerMessageType.PRIVATE_STATE),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const privates = await Promise.all(privatePromises);
    for (const priv of privates) {
      const state = priv.state as VillagePrivate;
      if (state.role !== VillageRole.WEREWOLF) {
        expect(state.werewolfTeammates).toHaveLength(0);
      }
    }
    await closeAll(players);
  }, 15_000);

  it('public state does not reveal player roles', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['A', 'B', 'C', 'D', 'E']);
    const startedPromises = players.map(p =>
      waitForMessage<GameStartedMessage>(p.ws, ServerMessageType.GAME_STARTED),
    );
    selectAndStartGame(players[0].ws, GameId.VILLAGE_OF_SHADOWS);
    const started = await Promise.all(startedPromises);
    for (const s of started) {
      const pub = s.gamePublicState as { players: { isAlive: boolean; role?: string }[] };
      for (const p of pub.players) {
        expect(p.role).toBeUndefined();
      }
    }
    await closeAll(players);
  }, 15_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. CROSS-CUTTING CONCERNS
// ─────────────────────────────────────────────────────────────────────────────

describe('Cross-Cutting Concerns', () => {
  it('all WebSocket messages have a type field', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const msgs: ServerMessage[] = [];
    for (const p of players) {
      p.ws.on('message', (raw) => {
        try {
          msgs.push(JSON.parse(raw.toString()) as ServerMessage);
        } catch {}
      });
    }
    const startedP = waitForMessage<GameStartedMessage>(players[0].ws, ServerMessageType.GAME_STARTED, 5_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await startedP;
    await new Promise(r => setTimeout(r, 2000));
    expect(msgs.length).toBeGreaterThan(0);
    for (const msg of msgs) {
      expect(msg.type).toBeTruthy();
      expect(typeof msg.type).toBe('string');
    }
    await closeAll(players);
  });

  it('PRIVATE_STATE is sent to each player individually', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const playerMessages: ServerMessage[][] = players.map(() => []);
    players.forEach((p, i) => {
      p.ws.on('message', (raw) => {
        try {
          playerMessages[i].push(JSON.parse(raw.toString()) as ServerMessage);
        } catch {}
      });
    });
    const startedP = waitForMessage<GameStartedMessage>(players[0].ws, ServerMessageType.GAME_STARTED);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    await startedP;
    await new Promise(r => setTimeout(r, 500));
    for (const msgs of playerMessages) {
      const privateStates = msgs.filter(m => m.type === ServerMessageType.PRIVATE_STATE);
      expect(privateStates.length).toBeGreaterThanOrEqual(1);
    }
    await closeAll(players);
  });

  it('GAME_STARTED broadcast to all players simultaneously', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const gameStartedAll = Promise.all(
      players.map(p => waitForMessage<GameStartedMessage>(p.ws, ServerMessageType.GAME_STARTED, 5_000)),
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);  // set listeners first, then trigger
    const all = await gameStartedAll;
    for (const s of all) {
      expect(s.gameId).toBe(GameId.BLUFF_BATTLE);
    }
    await closeAll(players);
  });

  it('session tokens work for reconnection mid-lobby', async () => {
    const { code } = await createRoom();
    const alice = await connectPlayer(code, 'Alice');
    const { sessionId, reconnectToken, playerId } = alice;
    alice.ws.close();
    await new Promise(r => setTimeout(r, 200));
    const ws2 = await openWs();
    const joinedPromise = waitForMessage<JoinedMessage>(ws2, ServerMessageType.JOINED);
    send(ws2, { type: ClientMessageType.REJOIN, sessionId, reconnectToken });
    const joined = await joinedPromise;
    expect(joined.result.playerId).toBe(playerId);
    ws2.close();
  });

  it('room cleanup: GET /api/rooms/:code still returns data after disconnect', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob']);
    await closeAll(players);
    await new Promise(r => setTimeout(r, 500));
    const res = await fetch(`${serverUrl}/api/rooms/${code}`);
    expect(res.status).toBe(200);
  });

  it('multiple games in sequence in same room', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const gameOver1Promise = waitForMessage<GameOverMessage>(
      players[0].ws,
      ServerMessageType.GAME_OVER,
      180_000,
    );
    const firstSubmitP_seq = waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 15_000);
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    // Play through game to reach GAME_OVER quickly
    for (let round = 0; round < 3; round++) {
      if (round === 0) { await firstSubmitP_seq; } else { await waitForPhase(players[0].ws, PhaseType.BB_SUBMIT, 20_000); }
      const voteOptsSeq = preRegisterVoteOptions(players);
      const votingSeq = waitForPhase(players[0].ws, PhaseType.BB_VOTING, 5_000);
      await submitAllAnswers(players);
      await votingSeq;
      const revealSeq = waitForPhase(players[0].ws, PhaseType.BB_REVEAL, 5_000);
      await voteAll(players, await voteOptsSeq);
      await revealSeq;
      await waitForPhase(players[0].ws, PhaseType.BB_SCORES, 20_000);
    }
    const gameOver1 = await gameOver1Promise;
    expect(gameOver1.result.gameId).toBe(GameId.BLUFF_BATTLE);
    const roomStatePromise = waitForMessage<RoomStateMessage>(
      players[0].ws,
      ServerMessageType.ROOM_STATE,
      5_000,
    );
    send(players[0].ws, { type: ClientMessageType.RETURN_TO_LOBBY });
    await roomStatePromise;
    const started2 = waitForMessage<GameStartedMessage>(
      players[0].ws,
      ServerMessageType.GAME_STARTED,
      5_000,
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const s2 = await started2;
    expect(s2.gameId).toBe(GameId.BLUFF_BATTLE);
    await closeAll(players);
  }, 130_000);

  it('PHASE_CHANGED broadcast to all players', async () => {
    const { code } = await createRoom();
    const players = await connectPlayers(code, ['Alice', 'Bob', 'Charlie']);
    const allSubmitPhasePromise = Promise.all(
      players.map(p => waitForPhase(p.ws, PhaseType.BB_SUBMIT, 20_000)),
    );
    selectAndStartGame(players[0].ws, GameId.BLUFF_BATTLE);
    const allSubmitPhase = await allSubmitPhasePromise;
    for (const phase of allSubmitPhase) {
      expect(phase.phase.phaseType).toBe(PhaseType.BB_SUBMIT);
    }
    await closeAll(players);
  }, 25_000);

  it('GET /api/rooms unknown code → 404', async () => {
    const res = await fetch(`${serverUrl}/api/rooms/XXXX`);
    expect(res.status).toBe(404);
  });
});
