import type { WebSocket } from 'ws';
import type { ClientMessage } from '@boredless/shared';
import {
  ClientMessageType,
  ServerMessageType,
  InputType,
} from '@boredless/shared';
import { sessionRegistry } from './registry.js';
import { sendToSocket, sendError } from './send.js';
import { roomManager } from '../engine/room-manager.js';
import { gameRegistry } from '../games/registry.js';
import { logger } from '../utils/logger.js';

/**
 * Handle a new WebSocket connection.
 * This function is registered with Fastify's WebSocket plugin.
 */
export function handleConnection(ws: WebSocket): void {
  logger.info('WebSocket connected');

  ws.on('message', (raw: Buffer | string) => {
    try {
      const data = JSON.parse(raw.toString()) as ClientMessage;
      handleMessage(ws, data);
    } catch (err) {
      sendError(ws, 'PARSE_ERROR', 'Invalid message format');
    }
  });

  ws.on('close', () => {
    const sessionId = sessionRegistry.unregister(ws);
    if (sessionId) {
      roomManager.handleDisconnect(sessionId);
      logger.info('Session disconnected', { sessionId });
    }
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { error: String(err) });
  });
}

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case ClientMessageType.JOIN_ROOM:
      handleJoinRoom(ws, msg as Extract<ClientMessage, { type: 'join_room' }>);
      break;

    case ClientMessageType.REJOIN:
      handleRejoin(ws, msg as Extract<ClientMessage, { type: 'rejoin' }>);
      break;

    case ClientMessageType.JOIN_DISPLAY:
      handleJoinDisplay(ws, msg as Extract<ClientMessage, { type: 'join_display' }>);
      break;

    case ClientMessageType.SELECT_GAME:
      handleSelectGame(ws, msg as Extract<ClientMessage, { type: 'select_game' }>);
      break;

    case ClientMessageType.START_GAME:
      handleStartGame(ws);
      break;

    case ClientMessageType.SUBMIT_INPUT:
      handleSubmitInput(ws, msg as Extract<ClientMessage, { type: 'submit_input' }>);
      break;

    case ClientMessageType.KICK_PLAYER:
      handleKickPlayer(ws, msg as Extract<ClientMessage, { type: 'kick_player' }>);
      break;

    case ClientMessageType.RETURN_TO_LOBBY:
      handleReturnToLobby(ws);
      break;

    case ClientMessageType.CLOSE_ROOM:
      handleCloseRoom(ws);
      break;

    case ClientMessageType.PING:
      ws.send(JSON.stringify({
        type: ServerMessageType.PONG,
        timestamp: (msg as Extract<ClientMessage, { type: 'ping' }>).timestamp,
        serverTime: Date.now(),
      }));
      break;

    default:
      sendError(ws, 'UNKNOWN_MESSAGE', `Unknown message type`);
  }
}

function handleJoinRoom(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join_room' }>): void {
  const result = roomManager.joinRoom(msg.roomCode, msg.playerName, msg.preferredColor);

  if ('error' in result) {
    sendError(ws, 'JOIN_FAILED', result.error);
    return;
  }

  const { session, player, room } = result;
  sessionRegistry.register(session.id, ws);

  // Send joined confirmation to the new player
  sendToSocket(ws, {
    type: ServerMessageType.JOINED,
    result: {
      sessionId: session.id,
      playerId: player.id,
      reconnectToken: session.reconnectToken,
      room: roomManager.getPublicRoomState(room),
    },
  });
}

function handleRejoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'rejoin' }>): void {
  const result = roomManager.rejoin(msg.sessionId, msg.reconnectToken);

  if ('error' in result) {
    sendError(ws, 'REJOIN_FAILED', result.error);
    return;
  }

  const { session, player, room } = result;
  sessionRegistry.register(session.id, ws);

  // Send full state
  sendToSocket(ws, {
    type: ServerMessageType.JOINED,
    result: {
      sessionId: session.id,
      playerId: player.id,
      reconnectToken: session.reconnectToken,
      room: roomManager.getPublicRoomState(room),
    },
  });

  // If game is active, send current game state
  if (room.selectedGameId) {
    const gameModule = gameRegistry.get(room.selectedGameId);
    if (gameModule) {
      sendToSocket(ws, {
        type: ServerMessageType.PHASE_CHANGED,
        phase: gameModule.getPhaseState(room.id),
        gamePublicState: gameModule.getPublicState(room.id),
      });
      sendToSocket(ws, {
        type: ServerMessageType.PRIVATE_STATE,
        state: gameModule.getPrivateState(room.id, player.id),
      });
    }
  }
}

function handleJoinDisplay(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join_display' }>): void {
  const session = roomManager.registerDisplay(msg.roomId);

  if (!session) {
    sendError(ws, 'DISPLAY_FAILED', 'Room not found');
    return;
  }

  sessionRegistry.register(session.id, ws);

  const room = roomManager.getRoom(msg.roomId)!;
  sendToSocket(ws, {
    type: ServerMessageType.ROOM_STATE,
    room: roomManager.getPublicRoomState(room),
    phase: null,
    gamePublicState: null,
  });
}

function handleSelectGame(ws: WebSocket, msg: Extract<ClientMessage, { type: 'select_game' }>): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.hostPlayerId !== player.id) {
    sendError(ws, 'NOT_HOST', 'Only the host can select a game');
    return;
  }

  const gameModule = gameRegistry.get(msg.gameId);
  if (!gameModule) {
    sendError(ws, 'INVALID_GAME', 'Game not found');
    return;
  }

  roomManager.selectGame(session.roomId, player.id, msg.gameId);
}

function handleStartGame(ws: WebSocket): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.hostPlayerId !== player.id) {
    sendError(ws, 'NOT_HOST', 'Only the host can start the game');
    return;
  }

  if (!room.selectedGameId) {
    sendError(ws, 'NO_GAME', 'No game selected');
    return;
  }

  const gameModule = gameRegistry.get(room.selectedGameId);
  if (!gameModule) {
    sendError(ws, 'INVALID_GAME', 'Game module not found');
    return;
  }

  // Check player count
  const activePlayers = roomManager.getActivePlayers(session.roomId);
  if (activePlayers.length < gameModule.definition.minPlayers) {
    sendError(ws, 'TOO_FEW_PLAYERS', `Need at least ${gameModule.definition.minPlayers} players`);
    return;
  }
  if (activePlayers.length > gameModule.definition.maxPlayers) {
    sendError(ws, 'TOO_MANY_PLAYERS', `Maximum ${gameModule.definition.maxPlayers} players`);
    return;
  }

  // Start game
  gameModule.setup(session.roomId, activePlayers);
}

function handleSubmitInput(ws: WebSocket, msg: Extract<ClientMessage, { type: 'submit_input' }>): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session || !session.playerId) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room || !room.selectedGameId) return;

  const gameModule = gameRegistry.get(room.selectedGameId);
  if (!gameModule) return;

  const result = gameModule.handleInput(
    session.roomId,
    session.playerId,
    msg.inputType as InputType,
    msg.payload,
  );

  if (result.accepted) {
    sendToSocket(ws, { type: ServerMessageType.INPUT_ACCEPTED, inputType: msg.inputType as InputType });
  } else {
    sendToSocket(ws, { type: ServerMessageType.INPUT_REJECTED, inputType: msg.inputType as InputType, reason: result.reason ?? 'Rejected' });
  }
}

function handleKickPlayer(ws: WebSocket, msg: Extract<ClientMessage, { type: 'kick_player' }>): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  roomManager.kickPlayer(session.roomId, player.id, msg.playerId);
}

function handleReturnToLobby(ws: WebSocket): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.selectedGameId) {
    const gameModule = gameRegistry.get(room.selectedGameId);
    if (gameModule) {
      gameModule.teardown(session.roomId);
    }
  }

  roomManager.returnToLobby(session.roomId, player.id);
}

function handleCloseRoom(ws: WebSocket): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.hostPlayerId !== player.id) {
    sendError(ws, 'NOT_HOST', 'Only the host can close the room');
    return;
  }

  const gameModule = room.selectedGameId ? gameRegistry.get(room.selectedGameId) : null;
  if (gameModule) {
    gameModule.teardown(session.roomId);
  }

  roomManager.closeRoom(session.roomId);
}
