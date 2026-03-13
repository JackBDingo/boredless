// ============================================================
// CRIBBAGE — Phase type string constants
// ============================================================

export const CRPhase = {
  DEALING:  'cr_dealing',
  DISCARD:  'cr_discard',
  CUT:      'cr_cut',
  PEGGING:  'cr_pegging',
  SCORING:  'cr_scoring',
  CRIB:     'cr_crib',
  RESULTS:  'cr_results',
  SCORES:   'cr_scores',
} as const;

export type CRPhaseType = typeof CRPhase[keyof typeof CRPhase];
