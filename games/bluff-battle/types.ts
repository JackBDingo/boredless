// ============================================================
// BLUFF BATTLE — Game-specific types
// ============================================================

/** A single prompt/question */
export interface BBPrompt {
  id: number;
  question: string;
  correctAnswer: string;
}

/** An answer option shown during voting (includes real + fakes) */
export interface BBAnswerOption {
  answerId: string;         // nanoid
  text: string;
  isCorrect?: boolean;      // Only revealed after voting
  submittedBy?: string;     // PlayerId, only revealed after voting
}

/** Public game state for display (what the TV shows) */
export interface BBPublicState {
  gameId: 'bluff_battle';
  currentPrompt: string | null;
  roundNumber: number;
  totalRounds: number;
  /** Available answers (during voting phase, no metadata) */
  answers: BBAnswerOption[];
  /** Submission count (during submit phase) */
  submittedCount: number;
  totalPlayers: number;
  /** Votes received count (during voting phase) */
  votedCount: number;
  /** Reveal data (during reveal phase) */
  revealData: BBRevealData | null;
}

/** Reveal data shown after voting */
export interface BBRevealData {
  correctAnswerId: string;
  answers: BBRevealAnswer[];
  roundScores: BBRoundScore[];
}

/** A revealed answer with metadata */
export interface BBRevealAnswer {
  answerId: string;
  text: string;
  isCorrect: boolean;
  submittedByPlayerId: string | null; // null for correct answer
  submittedByPlayerName: string | null;
  voterPlayerIds: string[];
  voterPlayerNames: string[];
}

/** Round score for one player */
export interface BBRoundScore {
  playerId: string;
  playerName: string;
  fooledCount: number;       // How many players voted for their fake
  foundCorrect: boolean;     // Did they vote for the real answer
  roundPoints: number;
  totalPoints: number;
}

/** Private state sent to individual player phones */
export interface BBPrivateState {
  gameId: 'bluff_battle';
  /** Current prompt (during submit phase) */
  prompt: string | null;
  /** Whether this player has submitted */
  hasSubmitted: boolean;
  /** Whether this player has voted */
  hasVoted: boolean;
  /** Their own answer (so they can see it) */
  ownAnswer: string | null;
  /** Answer options for voting (excludes their own) */
  voteOptions: BBAnswerOption[] | null;
}
