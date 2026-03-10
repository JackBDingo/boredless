// ============================================================
// BLUFF BATTLE — Phase type string constants
// Keep these strings in sync with what the server emits.
// ============================================================

export const BBPhase = {
  PROMPT: 'bb_prompt',
  SUBMIT: 'bb_submit',
  VOTING: 'bb_voting',
  REVEAL: 'bb_reveal',
  SCORES: 'bb_scores',
} as const;

export type BBPhaseType = typeof BBPhase[keyof typeof BBPhase];
