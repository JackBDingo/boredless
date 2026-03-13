// ============================================================
// WORDCRAFT — Phase type string constants
// ============================================================

export const WCPhase = {
  STARTING:     'wc_starting',
  PLAYING:      'wc_playing',
  WORD_REVEAL:  'wc_word_reveal',
  SCORES:       'wc_scores',
} as const;

export type WCPhaseType = typeof WCPhase[keyof typeof WCPhase];
