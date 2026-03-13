/**
 * types.ts — Type definitions for the Scoring & Victory subsystem.
 *
 * All scoring configuration lives in the game schema (YAML/JSON).
 * No game-specific logic belongs here — only structural contracts.
 */

// ---------------------------------------------------------------------------
// ScoreTrack — a single score dimension (points, lives, money, etc.)
// ---------------------------------------------------------------------------

/**
 * A score track defines a single dimension of scoring.
 * Games can have multiple tracks (e.g. points + lives + multiplier).
 */
export interface ScoreTrack {
  id: string;
  name: string;
  initial: number;
  min?: number;
  max?: number;
  direction: 'higher-better' | 'lower-better';
  display?: {
    format?: 'number' | 'currency' | 'percentage';
    suffix?: string;
    icon?: string;
  };
}

// ---------------------------------------------------------------------------
// ScoringFormula — how score changes are calculated
// ---------------------------------------------------------------------------

export type FixedFormula = {
  type: 'fixed';
  amount: number;
};

export type ExpressionFormula = {
  type: 'expression';
  expr: string;
};

export type MultiplierFormula = {
  type: 'multiplier';
  base: number;
  multiplier: string;
};

export type LookupFormula = {
  type: 'lookup';
  key: string;
  table: Record<string, number>;
};

export type ScoringFormula =
  | FixedFormula
  | ExpressionFormula
  | MultiplierFormula
  | LookupFormula;

// ---------------------------------------------------------------------------
// ScoringCondition — optional gate on a scoring rule
// ---------------------------------------------------------------------------

export interface ScoringCondition {
  field: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: unknown;
}

// ---------------------------------------------------------------------------
// ScoringRule
// ---------------------------------------------------------------------------

export interface ScoringRule {
  id: string;
  name?: string;
  track: string;
  trigger: 'manual' | 'event';
  eventType?: string;
  targets: 'active-player' | 'all-players' | 'specific';
  targetPlayerId?: string;
  formula: ScoringFormula;
  conditions?: ScoringCondition[];
}

// ---------------------------------------------------------------------------
// VictoryCondition
// ---------------------------------------------------------------------------

export interface HighestScoreVictory {
  type: 'highest_score';
  track: string;
}

export interface TargetScoreVictory {
  type: 'target_score';
  track: string;
  target: number;
}

export interface LastStandingVictory {
  type: 'last_standing';
  eliminationTrack?: string;
}

export interface RoundLimitVictory {
  type: 'round_limit';
  maxRounds: number;
  thenBy: 'highest_score' | 'lowest_score';
  track: string;
}

export interface CustomVictory {
  type: 'custom';
  expression: string;
}

export type VictoryCondition =
  | HighestScoreVictory
  | TargetScoreVictory
  | LastStandingVictory
  | RoundLimitVictory
  | CustomVictory;

// ---------------------------------------------------------------------------
// TiebreakRule
// ---------------------------------------------------------------------------

export interface TiebreakRule {
  method:
    | 'none'
    | 'secondary_track'
    | 'most_recent_gain'
    | 'sudden_death'
    | 'random';
  track?: string;
}

// ---------------------------------------------------------------------------
// ScoringConfig
// ---------------------------------------------------------------------------

export interface ScoringConfig {
  tracks: ScoreTrack[];
  rules: ScoringRule[];
  victory: VictoryCondition;
  tiebreak?: TiebreakRule;
}

// ---------------------------------------------------------------------------
// PlayerScores
// ---------------------------------------------------------------------------

export interface ScoreChange {
  trackId: string;
  ruleId: string;
  amount: number;
  previousValue: number;
  newValue: number;
  timestamp: number;
}

export interface PlayerScores {
  playerId: string;
  scores: Record<string, number>;
  history: ScoreChange[];
}

// ---------------------------------------------------------------------------
// VictoryResult
// ---------------------------------------------------------------------------

export interface VictoryResult {
  gameOver: boolean;
  winners: string[];
  rankings: Array<{
    playerId: string;
    rank: number;
    scores: Record<string, number>;
  }>;
  tiebroken: boolean;
}

// ---------------------------------------------------------------------------
// ScoringRuleContext
// ---------------------------------------------------------------------------

export interface ScoringRuleContext {
  playerId?: string;
  state: Record<string, unknown>;
  event?: {
    type: string;
    data?: Record<string, unknown>;
  };
  round?: number;
}
