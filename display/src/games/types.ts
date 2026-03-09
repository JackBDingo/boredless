import type { PhaseState, ScoreEntry, GameEventHook, PlayerInfo } from '@boredless/shared';

/**
 * Canonical props interface for all display (TV) game components.
 * Exported from here so games can import the type for explicit conformance.
 */
export interface DisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  players: PlayerInfo[];
  scores: ScoreEntry[];
  timerMs: number | null;
  useGameEvent: GameEventHook;
}
