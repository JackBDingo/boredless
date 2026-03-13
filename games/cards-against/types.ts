// ============================================================
// CARDS AGAINST HUMANITY — Game-specific types
// ============================================================

/** A white response card */
export interface CAHWhiteCard {
  id: string;       // nanoid
  text: string;
}

/** A black prompt card */
export interface CAHBlackCard {
  id: string;       // nanoid
  text: string;
  pick: number;     // how many white cards to play
}

/** A player's submission for the current round */
export interface CAHSubmission {
  submissionId: string;
  playerId: string;
  cards: CAHWhiteCard[];   // ordered (matters for pick > 1)
}

/** Public game state sent to display and players */
export interface CAHPublicState {
  gameId: 'cards_against';
  currentBlackCard: CAHBlackCard | null;
  czarPlayerId: string | null;
  czarPlayerName: string | null;
  roundNumber: number;
  totalRounds: number;
  submittedCount: number;
  totalNonCzarPlayers: number;
  /** Shuffled anonymous submissions (shown during READING phase) */
  submissions: CAHAnonymousSubmission[];
  /** Winner info (shown during REVEAL phase) */
  winner: CAHWinner | null;
}

/** Anonymous submission for display during READING phase */
export interface CAHAnonymousSubmission {
  submissionId: string;
  cards: { text: string }[];
}

/** Revealed submission (with player name) */
export interface CAHRevealedSubmission extends CAHAnonymousSubmission {
  playerId: string;
  playerName: string;
  isWinner: boolean;
}

/** Winner data shown during REVEAL phase */
export interface CAHWinner {
  submissionId: string;
  playerId: string;
  playerName: string;
  cards: { text: string }[];
}

/** Private state sent to individual players */
export interface CAHPrivateState {
  gameId: 'cards_against';
  isCzar: boolean;
  hand: CAHWhiteCard[];
  selectedCardIds: string[];   // cards chosen this round, in order
  hasSubmitted: boolean;
  /** During READING: submissions for czar to judge (null for non-czars) */
  submissionsToJudge: CAHAnonymousSubmission[] | null;
  /** During READING: all subs visible read-only for non-czar */
  allSubmissions: CAHAnonymousSubmission[] | null;
  /** During REVEAL: full revealed submissions for phone */
  revealedSubmissions: CAHRevealedSubmission[] | null;
}
