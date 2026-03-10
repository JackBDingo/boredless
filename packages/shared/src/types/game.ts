/**
 * Signature for the useGameEvent hook passed in to game display/phone components.
 * Defined once here so all game components share a single canonical type.
 */
export type GameEventHook = (event: string, handler: (data: unknown) => void) => void;

import { InputType } from '../enums.js';

/** Game definition metadata (for catalog display) */
export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  icon: string;            // emoji
}

/** Current phase state (sent to clients) */
export interface PhaseState {
  phaseType: string;
  roundNumber: number;
  totalRounds: number;
  timerRemainingMs: number | null;
  timerTotalMs: number | null;
}

/** Player input submitted from phone */
export interface PlayerInput {
  inputType: InputType;
  payload: Record<string, unknown>;
}

/** Score entry for a player */
export interface ScoreEntry {
  playerId: string;
  playerName: string;
  playerColor: string;
  score: number;
  roundScore: number;    // Points earned this round
}

/** Info about a player passed to game components */
export interface PlayerInfo {
  playerId: string;
  playerName: string;
  playerColor: string;
  isAlive: boolean;
}

/** Game over state */
export interface GameOverState {
  winnerId: string | null;     // null for team win
  winnerName: string | null;
  winnerTeam: string | null;   // For team-based games
  /** Human-readable team label set by the game (e.g. "The Village", "The Werewolves") */
  winnerTeamDisplay?: string;
  finalScores: ScoreEntry[];
  gameId: string;
}
