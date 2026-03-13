// ============================================================
// BLACKJACK — Phase type string constants
// ============================================================

export const BJPhase = {
  BETTING:  'bj_betting',
  DEALING:  'bj_dealing',
  PLAYING:  'bj_playing',
  DEALER:   'bj_dealer',
  RESULTS:  'bj_results',
  SCORES:   'bj_scores',
} as const;

export type BJPhaseType = typeof BJPhase[keyof typeof BJPhase];
