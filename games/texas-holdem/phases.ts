// ============================================================
// TEXAS HOLD'EM — Phase type string constants
// ============================================================

export const THPhase = {
  PREFLOP:  'th_preflop',
  FLOP:     'th_flop',
  TURN:     'th_turn',
  RIVER:    'th_river',
  SHOWDOWN: 'th_showdown',
  SCORES:   'th_scores',
} as const;

export type THPhaseType = typeof THPhase[keyof typeof THPhase];
