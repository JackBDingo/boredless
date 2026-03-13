// ============================================================
// BATTLESHIP — Phase type string constants
// Keep these strings in sync with what the server emits.
// ============================================================

export const BSPhase = {
  SETUP: 'bs_setup',
  BATTLE: 'bs_battle',
  RESULT: 'bs_result',
  SCORES: 'bs_scores',
} as const;

export type BSPhaseType = typeof BSPhase[keyof typeof BSPhase];
