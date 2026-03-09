import type { Room, ScoreEntry } from '@boredless/shared';
import type { RoomStatus } from '@boredless/shared';
import type { ServerMessage } from '@boredless/shared';

/**
 * GameContext — the API that game modules use to talk to the platform.
 *
 * Games receive this via setup() and use it for timers, messaging, scores,
 * and room operations. Games NEVER import engine internals directly.
 */
export interface GameContext {
  readonly roomId: string;

  // ── Timer ──────────────────────────────────────────────────
  startTimer(phaseType: string, durationMs: number, onExpire: () => void): void;
  stopTimer(): void;
  getTimerRemaining(): number | null;

  // ── Messaging ──────────────────────────────────────────────
  sendToAll(message: ServerMessage): void;
  sendToPlayer(sessionId: string, message: ServerMessage): void;
  sendToDisplay(message: ServerMessage): void;

  // ── Scores ─────────────────────────────────────────────────
  initScores(playerIds: string[]): void;
  addPoints(playerId: string, points: number): void;
  getScore(playerId: string): number;
  getScores(): ScoreEntry[];
  broadcastScores(roundScores?: Map<string, number>): void;
  clearScores(): void;

  // ── Room ───────────────────────────────────────────────────
  getRoom(): Room | undefined;
  setRoomStatus(status: RoomStatus): void;
  getAllSessionIds(): string[];

  // ── Logging ────────────────────────────────────────────────
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}
