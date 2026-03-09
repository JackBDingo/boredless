import { VillageRole } from '../enums.js';

// ============================================================
// VILLAGE OF SHADOWS — Game-specific types
// ============================================================

/** A player's role assignment */
export interface VillagePlayerRole {
  playerId: string;
  role: VillageRole;
  isAlive: boolean;
}

/** Public game state for display (what the TV shows) */
export interface VillagePublicState {
  gameId: 'village_of_shadows';
  dayNumber: number;
  /** Player statuses (alive/dead, but NOT their roles) */
  players: VillagePublicPlayer[];
  /** Last night's result message (e.g., "No one was killed" or "PlayerX was killed") */
  nightResultMessage: string | null;
  /** Last vote result */
  voteResultMessage: string | null;
  /** Eliminated player this round */
  eliminatedPlayerId: string | null;
  eliminatedPlayerName: string | null;
  eliminatedPlayerRole: VillageRole | null; // Revealed on elimination
  /** Vote tally (during/after vote phase) */
  votes: VillageVoteTally[] | null;
  /** Win state */
  winningTeam: 'villagers' | 'werewolves' | null;
  /** Night action submission counts (no details) */
  nightActionsSubmitted: number;
  nightActionsExpected: number;
}

/** Public player info (no role info!) */
export interface VillagePublicPlayer {
  playerId: string;
  playerName: string;
  playerColor: string;
  isAlive: boolean;
}

/** Vote tally entry */
export interface VillageVoteTally {
  targetPlayerId: string;
  targetPlayerName: string;
  voteCount: number;
  voterNames: string[];    // Revealed after vote
}

/** Private state sent to individual player */
export interface VillagePrivateState {
  gameId: 'village_of_shadows';
  role: VillageRole;
  isAlive: boolean;
  /** Seer: result of last inspection */
  seerResult: SeerInspectionResult | null;
  /** Whether this player has submitted their night action */
  hasActed: boolean;
  /** Whether this player has voted (day vote) */
  hasVoted: boolean;
  /** Werewolf: other werewolf player IDs (so they know teammates) */
  werewolfTeammates: string[];
  /** Night action targets (alive players they can target) */
  nightTargets: VillageNightTarget[] | null;
  /** Vote targets (alive players they can vote for) */
  voteTargets: VillageVoteTarget[] | null;
}

/** Seer inspection result */
export interface SeerInspectionResult {
  targetPlayerId: string;
  targetPlayerName: string;
  isWerewolf: boolean;
}

/** A potential night action target */
export interface VillageNightTarget {
  playerId: string;
  playerName: string;
}

/** A potential vote target */
export interface VillageVoteTarget {
  playerId: string;
  playerName: string;
}

/** Night resolution (internal server type, NOT sent to clients) */
export interface NightResolution {
  werewolfTargetId: string | null;
  seerTargetId: string | null;
  doctorTargetId: string | null;
  killedPlayerId: string | null;  // null if doctor saved
  killedPlayerName: string | null;
  seerResult: SeerInspectionResult | null;
}

/** Role distribution rules */
export interface RoleDistribution {
  playerCount: number;
  werewolves: number;
  seers: number;
  doctors: number;
  villagers: number;
}

/**
 * Role distribution table
 * Key: player count, Value: role counts
 */
export const ROLE_DISTRIBUTIONS: Record<number, RoleDistribution> = {
  5:  { playerCount: 5,  werewolves: 1, seers: 1, doctors: 1, villagers: 2 },
  6:  { playerCount: 6,  werewolves: 1, seers: 1, doctors: 1, villagers: 3 },
  7:  { playerCount: 7,  werewolves: 2, seers: 1, doctors: 1, villagers: 3 },
  8:  { playerCount: 8,  werewolves: 2, seers: 1, doctors: 1, villagers: 4 },
  9:  { playerCount: 9,  werewolves: 2, seers: 1, doctors: 1, villagers: 5 },
  10: { playerCount: 10, werewolves: 3, seers: 1, doctors: 1, villagers: 5 },
};
