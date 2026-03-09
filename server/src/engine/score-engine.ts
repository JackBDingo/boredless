import type { ScoreEntry } from '@boredless/shared';
import { ServerMessageType, PlayerStatus } from '@boredless/shared';
import { roomManager } from './room-manager.js';
import { sendToSessions } from '../ws/send.js';

class ScoreEngine {
  /** roomId → playerId → cumulative score */
  private scores = new Map<string, Map<string, number>>();

  /** Initialize scores for a room */
  init(roomId: string, playerIds: string[]): void {
    const scoreMap = new Map<string, number>();
    for (const id of playerIds) {
      scoreMap.set(id, 0);
    }
    this.scores.set(roomId, scoreMap);
  }

  /** Add points to a player */
  addPoints(roomId: string, playerId: string, points: number): void {
    const scoreMap = this.scores.get(roomId);
    if (!scoreMap) return;
    const current = scoreMap.get(playerId) ?? 0;
    scoreMap.set(playerId, current + points);
  }

  /** Get current score for a player */
  getScore(roomId: string, playerId: string): number {
    return this.scores.get(roomId)?.get(playerId) ?? 0;
  }

  /** Get all scores for a room, sorted descending */
  getScores(roomId: string): ScoreEntry[] {
    const scoreMap = this.scores.get(roomId);
    if (!scoreMap) return [];

    const room = roomManager.getRoom(roomId);
    if (!room) return [];

    const entries: ScoreEntry[] = [];
    for (const [playerId, score] of scoreMap) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        entries.push({
          playerId,
          playerName: player.name,
          playerColor: player.color,
          score,
          roundScore: 0, // Set by game module
        });
      }
    }

    return entries.sort((a, b) => b.score - a.score);
  }

  /** Broadcast scores to all sessions in a room */
  broadcastScores(roomId: string, roundScores?: Map<string, number>): void {
    const scores = this.getScores(roomId);
    if (roundScores) {
      for (const entry of scores) {
        entry.roundScore = roundScores.get(entry.playerId) ?? 0;
      }
    }

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const sessionIds = [
      ...room.players.filter(p => p.status !== PlayerStatus.REMOVED).map(p => p.sessionId),
      ...(room.displaySessionId ? [room.displaySessionId] : []),
    ];

    sendToSessions(sessionIds, {
      type: ServerMessageType.SCORE_UPDATE,
      scores,
    });
  }

  /** Clear scores for a room */
  clear(roomId: string): void {
    this.scores.delete(roomId);
  }
}

export const scoreEngine = new ScoreEngine();
