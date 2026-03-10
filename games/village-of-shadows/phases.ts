// ============================================================
// VILLAGE OF SHADOWS — Phase type string constants
// Keep these strings in sync with what the server emits.
// ============================================================

export const VOSPhase = {
  ROLE_REVEAL: 'vos_role_reveal',
  NIGHT: 'vos_night',
  NIGHT_RESULT: 'vos_night_result',
  DAY: 'vos_day',
  VOTE: 'vos_vote',
  VOTE_RESULT: 'vos_vote_result',
} as const;

export type VOSPhaseType = typeof VOSPhase[keyof typeof VOSPhase];
