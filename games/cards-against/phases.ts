// ============================================================
// CARDS AGAINST HUMANITY — Phase type string constants
// ============================================================

export const CAHPhase = {
  DEAL: 'cah_deal',
  PROMPT: 'cah_prompt',
  READING: 'cah_reading',
  REVEAL: 'cah_reveal',
  SCORES: 'cah_scores',
} as const;

export type CAHPhaseType = typeof CAHPhase[keyof typeof CAHPhase];
