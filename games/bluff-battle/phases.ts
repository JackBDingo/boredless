// ============================================================
// BLUFF BATTLE — Phase type string constants
// Must match the phase IDs in game.yaml exactly.
// ============================================================

export const BBPhase = {
  SUBMIT: 'submit',
  VOTING: 'voting',
  REVEAL: 'reveal',
  SCORES: 'scores',
} as const;

export type BBPhaseType = typeof BBPhase[keyof typeof BBPhase];
