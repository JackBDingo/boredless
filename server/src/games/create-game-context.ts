import type { GameContext } from './game-context.js';
import { roomManager } from '../engine/room-manager.js';
import { timerEngine } from '../engine/timer-engine.js';
import { scoreEngine } from '../engine/score-engine.js';
import { sendToSession, sendToSessions } from '../ws/send.js';
import { logger } from '../utils/logger.js';
import { ServerMessageType } from '@boredless/shared';

/**
 * Factory: creates a GameContext bound to a specific room.
 * This is the ONLY file that imports engine internals for game use.
 */
export function createGameContext(roomId: string): GameContext {
  function getAllSessionIds(): string[] {
    const room = roomManager.getRoom(roomId);
    if (!room) return [];
    const ids = room.players
      .filter(p => p.status !== 'removed')
      .map(p => p.sessionId);
    if (room.displaySessionId) ids.push(room.displaySessionId);
    return ids;
  }

  function getPlayerSessionIds(excludePlayerId?: string): string[] {
    const room = roomManager.getRoom(roomId);
    if (!room) return [];
    return room.players
      .filter(p => p.status !== 'removed' && p.id !== excludePlayerId)
      .map(p => p.sessionId);
  }

  /** Resolve a playerId to a sessionId for internal routing. */
  function resolvePlayerSessionId(playerId: string): string | undefined {
    const room = roomManager.getRoom(roomId);
    if (!room) return undefined;
    const player = room.players.find(p => p.id === playerId && p.status !== 'removed');
    return player?.sessionId;
  }

  /** Get all active player IDs (excluding 'removed' players). */
  function getActivePlayerIds(): string[] {
    const room = roomManager.getRoom(roomId);
    if (!room) return [];
    return room.players
      .filter(p => p.status !== 'removed')
      .map(p => p.id);
  }

  return {
    roomId,

    // ── Timer ──────────────────────────────────────────────────
    startTimer(phaseType, durationMs, onExpire) {
      const sessionIds = getAllSessionIds();
      timerEngine.start(roomId, phaseType, durationMs, sessionIds, onExpire);
    },
    stopTimer() {
      timerEngine.stop(roomId);
    },
    getTimerRemaining() {
      return timerEngine.getRemaining(roomId);
    },

    // ── Messaging ──────────────────────────────────────────────
    sendToAll(message) {
      const sessionIds = getAllSessionIds();
      sendToSessions(sessionIds, message);
    },
    sendToPlayer(playerId, message) {
      const sessionId = resolvePlayerSessionId(playerId);
      if (sessionId) {
        sendToSession(sessionId, message);
      }
    },
    sendToDisplay(message) {
      const room = roomManager.getRoom(roomId);
      if (room?.displaySessionId) {
        sendToSession(room.displaySessionId, message);
      }
    },

    // ── Event Bus (Tier 2 — custom game events) ────────────────
    emit(event, data) {
      const sessionIds = getAllSessionIds();
      sendToSessions(sessionIds, {
        type: ServerMessageType.GAME_EVENT,
        event,
        data: data ?? null,
      });
    },
    emitTo(playerId, event, data) {
      const sessionId = resolvePlayerSessionId(playerId);
      if (sessionId) {
        sendToSession(sessionId, {
          type: ServerMessageType.GAME_EVENT,
          event,
          data: data ?? null,
        });
      }
    },
    emitToDisplay(event, data) {
      const room = roomManager.getRoom(roomId);
      if (room?.displaySessionId) {
        sendToSession(room.displaySessionId, {
          type: ServerMessageType.GAME_EVENT,
          event,
          data: data ?? null,
        });
      }
    },

    // ── Scores ─────────────────────────────────────────────────
    initScores(playerIds) {
      scoreEngine.init(roomId, playerIds);
    },
    addPoints(playerId, points) {
      scoreEngine.addPoints(roomId, playerId, points);
    },
    getScore(playerId) {
      return scoreEngine.getScore(roomId, playerId);
    },
    getScores() {
      return scoreEngine.getScores(roomId);
    },
    broadcastScores(roundScores) {
      scoreEngine.broadcastScores(roomId, roundScores);
    },
    clearScores() {
      scoreEngine.clear(roomId);
    },

    // ── Room ───────────────────────────────────────────────────
    getRoom() {
      return roomManager.getRoom(roomId);
    },
    setRoomStatus(status) {
      roomManager.setRoomStatus(roomId, status);
    },
    getAllSessionIds,
    getPlayerSessionIds,

    // ── Phase Broadcasting (convenience helpers) ───────────────
    broadcastPhase(phase, publicState) {
      const sessionIds = getAllSessionIds();
      sendToSessions(sessionIds, {
        type: ServerMessageType.PHASE_CHANGED,
        phase,
        gamePublicState: publicState,
      });
    },
    broadcastPrivateState(getState) {
      const playerIds = getActivePlayerIds();
      for (const playerId of playerIds) {
        const sessionId = resolvePlayerSessionId(playerId);
        if (sessionId) {
          sendToSession(sessionId, {
            type: ServerMessageType.PRIVATE_STATE,
            state: getState(playerId),
          });
        }
      }
    },
    broadcastGameOver(finalState) {
      const sessionIds = getAllSessionIds();
      sendToSessions(sessionIds, {
        type: ServerMessageType.GAME_OVER,
        result: finalState,
      });
    },

    // ── Logging ────────────────────────────────────────────────
    log: {
      info(message, meta) {
        logger.info(message, { roomId, ...meta });
      },
      error(message, meta) {
        logger.error(message, { roomId, ...meta });
      },
      warn(message, meta) {
        logger.warn(message, { roomId, ...meta });
      },
    },
  };
}
