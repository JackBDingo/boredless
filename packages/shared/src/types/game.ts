/**
 * Signature for the useGameEvent hook passed in to game display/phone components.
 * Defined once here so all game components share a single canonical type.
 */
export type GameEventHook = (event: string, handler: (data: unknown) => void) => void;

import { GameId, PhaseType, InputType } from '../enums.js';

/** Game definition metadata (for catalog display) */
export interface GameDefinition {
  id: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  icon: string;            // emoji
}

/** Current phase state (sent to clients) */
export interface PhaseState {
  phaseType: PhaseType;
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

/** Game over state */
export interface GameOverState {
  winnerId: string | null;     // null for team win
  winnerName: string | null;
  winnerTeam: string | null;   // For team-based games
  finalScores: ScoreEntry[];
  gameId: GameId;
}

/** Available game catalog entry */
export const GAME_CATALOG: GameDefinition[] = [
  {
    id: GameId.BLUFF_BATTLE,
    name: 'Bluff Battle',
    description: 'Submit fake answers, fool your friends, spot the truth. The best liars win!',
    minPlayers: 3,
    maxPlayers: 8,
    estimatedMinutes: 10,
    icon: '🎭',
  },
  {
    id: GameId.VILLAGE_OF_SHADOWS,
    name: 'Village of Shadows',
    description: 'Hidden roles. Secret actions. Trust no one. Will the village survive the night?',
    minPlayers: 5,
    maxPlayers: 10,
    estimatedMinutes: 15,
    icon: '🐺',
  },
];
