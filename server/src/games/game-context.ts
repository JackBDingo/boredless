import type { Room, ScoreEntry, PhaseState, GameOverState } from '@boredless/shared';
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
  /** Send a message to a specific player. Pass playerId — session resolution is internal. */
  sendToPlayer(playerId: string, message: ServerMessage): void;
  sendToDisplay(message: ServerMessage): void;

  // ── Event Bus (Tier 2 — custom game events) ────────────────
  /** Emit a custom event to ALL connected clients (display + all players). */
  emit(event: string, data?: unknown): void;
  /** Emit a custom event to a single player's phone. */
  emitTo(playerId: string, event: string, data?: unknown): void;
  /** Emit a custom event to the display (TV) only. */
  emitToDisplay(event: string, data?: unknown): void;

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
  /** Returns session IDs for all active players (optionally excluding one player). */
  getPlayerSessionIds(excludePlayerId?: string): string[];

  // ── Phase Broadcasting (convenience helpers) ───────────────
  /** Broadcast PHASE_CHANGED to all clients. */
  broadcastPhase(phase: PhaseState, publicState: Record<string, unknown>): void;
  /** Broadcast PRIVATE_STATE to each player with their personalized state. */
  broadcastPrivateState(getState: (playerId: string) => Record<string, unknown>): void;
  /** Broadcast GAME_OVER to all clients. */
  broadcastGameOver(finalState: GameOverState): void;

  // ── Logging ────────────────────────────────────────────────
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
  };
}
