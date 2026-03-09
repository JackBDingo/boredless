import type { PhaseState, ScoreEntry, GameEventHook, PlayerInfo } from '@boredless/shared';

/**
 * Canonical props interface for all phone game components.
 * Exported from here so games can import the type for explicit conformance.
 */
export interface PhoneProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  privateState: Record<string, unknown>;
  myPlayer: PlayerInfo;
  scores: ScoreEntry[];
  timerMs: number | null;
  submitInput: (inputType: string, data: unknown) => void;
  useGameEvent: GameEventHook;
}
