import type { GameContext } from './game-context.js';
import { roomManager } from '../engine/room-manager.js';
import { timerEngine } from '../engine/timer-engine.js';
import { scoreEngine } from '../engine/score-engine.js';
import { sendToSession, sendToSessions } from '../ws/send.js';
import { logger } from '../utils/logger.js';

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
    sendToPlayer(sessionId, message) {
      sendToSession(sessionId, message);
    },
    sendToDisplay(message) {
      const room = roomManager.getRoom(roomId);
      if (room?.displaySessionId) {
        sendToSession(room.displaySessionId, message);
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
