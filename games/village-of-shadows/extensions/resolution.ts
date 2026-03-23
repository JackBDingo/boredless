/**
 * resolution.ts — Village of Shadows night and vote resolution.
 *
 * Migrated from server/resolution.ts — same logic in the V2 extension layer.
 * The original V1 server/resolution.ts is kept intact for the hybrid loader.
 *
 * Resolution order (deterministic):
 *   1. Seer inspects target
 *   2. Doctor protects target
 *   3. Werewolves attack (majority vote)
 *   4. If doctor protected attack target → no kill
 */

import type { VOSRoleAssignment } from './role-system.js';
import { VOS_ROLE, type VOSRole } from './role-system.js';

// ---------------------------------------------------------------------------
// Night action types
// ---------------------------------------------------------------------------

export interface VOSNightAction {
  playerId: string;
  role: VOSRole;
  targetPlayerId: string;
}

// ---------------------------------------------------------------------------
// Night resolution
// ---------------------------------------------------------------------------

export interface SeerInspectionResult {
  targetPlayerId: string;
  targetPlayerName: string;
  isWerewolf: boolean;
}

export interface NightResolution {
  werewolfTargetId: string | null;
  seerTargetId: string | null;
  doctorTargetId: string | null;
  killedPlayerId: string | null;
  killedPlayerName: string | null;
  seerResult: SeerInspectionResult | null;
}

/**
 * Resolve night actions.
 *
 * Resolution order (critical — must be deterministic):
 *   1. Seer inspects their target
 *   2. Doctor protects their target
 *   3. Werewolves attack their target (majority vote)
 *   4. If doctor protected attack target → no kill
 */
export function resolveNight(
  actions: VOSNightAction[],
  roleAssignments: VOSRoleAssignment[],
  alivePlayers: { playerId: string; playerName: string }[],
): NightResolution {
  const werewolfActions = actions.filter(a => a.role === VOS_ROLE.WEREWOLF);
  const seerAction = actions.find(a => a.role === VOS_ROLE.SEER);
  const doctorAction = actions.find(a => a.role === VOS_ROLE.DOCTOR);

  // 1. Resolve werewolf target (majority vote among werewolves)
  let werewolfTargetId: string | null = null;
  if (werewolfActions.length > 0) {
    const targetVotes = new Map<string, number>();
    for (const action of werewolfActions) {
      const count = targetVotes.get(action.targetPlayerId) ?? 0;
      targetVotes.set(action.targetPlayerId, count + 1);
    }

    let maxVotes = 0;
    for (const [targetId, votes] of targetVotes) {
      if (votes > maxVotes) {
        maxVotes = votes;
        werewolfTargetId = targetId;
      }
    }
  }

  // 2. Resolve seer inspection
  let seerResult: SeerInspectionResult | null = null;
  const seerTargetId = seerAction?.targetPlayerId ?? null;
  if (seerTargetId) {
    const targetRole = roleAssignments.find(r => r.playerId === seerTargetId);
    const targetPlayer = alivePlayers.find(p => p.playerId === seerTargetId);
    if (targetRole && targetPlayer) {
      seerResult = {
        targetPlayerId: seerTargetId,
        targetPlayerName: targetPlayer.playerName,
        isWerewolf: targetRole.role === VOS_ROLE.WEREWOLF,
      };
    }
  }

  // 3. Resolve doctor protection
  const doctorTargetId = doctorAction?.targetPlayerId ?? null;

  // 4. Determine kill
  let killedPlayerId: string | null = null;
  let killedPlayerName: string | null = null;

  if (werewolfTargetId && werewolfTargetId !== doctorTargetId) {
    const killed = alivePlayers.find(p => p.playerId === werewolfTargetId);
    if (killed) {
      killedPlayerId = killed.playerId;
      killedPlayerName = killed.playerName;
    }
  }

  return {
    werewolfTargetId,
    seerTargetId,
    doctorTargetId,
    killedPlayerId,
    killedPlayerName,
    seerResult,
  };
}

// ---------------------------------------------------------------------------
// Vote resolution
// ---------------------------------------------------------------------------

export interface VoteResolution {
  eliminatedPlayerId: string | null;
  eliminatedPlayerName: string | null;
  eliminatedPlayerRole: VOSRole | null;
  isTied: boolean;
  message: string;
  voteTally: Array<{
    targetPlayerId: string;
    targetPlayerName: string;
    voteCount: number;
    voterNames: string[];
  }>;
}

/**
 * Resolve a day vote.
 * Player with the most votes is eliminated. Ties result in no elimination.
 */
export function resolveVote(
  votes: Map<string, string>, // voterId → targetPlayerId
  roleAssignments: VOSRoleAssignment[],
  players: { playerId: string; playerName: string }[],
): VoteResolution {
  // Build vote tally
  const tallyCounts = new Map<string, number>(); // targetId → count
  const tallyVoters = new Map<string, string[]>(); // targetId → voterNames

  for (const [voterId, targetId] of votes) {
    tallyCounts.set(targetId, (tallyCounts.get(targetId) ?? 0) + 1);
    if (!tallyVoters.has(targetId)) tallyVoters.set(targetId, []);
    const voter = players.find(p => p.playerId === voterId);
    tallyVoters.get(targetId)!.push(voter?.playerName ?? 'Unknown');
  }

  // Build tally array for display
  const voteTally = [...tallyCounts.entries()].map(([targetId, voteCount]) => {
    const target = players.find(p => p.playerId === targetId);
    return {
      targetPlayerId: targetId,
      targetPlayerName: target?.playerName ?? 'Unknown',
      voteCount,
      voterNames: tallyVoters.get(targetId) ?? [],
    };
  });

  // Find player with most votes
  const maxCount = tallyCounts.size > 0 ? Math.max(...tallyCounts.values()) : 0;
  const playersWithMax = [...tallyCounts.entries()].filter(([, v]) => v === maxCount);

  // Tie check
  if (playersWithMax.length > 1 || tallyCounts.size === 0) {
    return {
      eliminatedPlayerId: null,
      eliminatedPlayerName: null,
      eliminatedPlayerRole: null,
      isTied: true,
      message: 'The vote was tied. No one was eliminated.',
      voteTally,
    };
  }

  const [eliminatedId] = playersWithMax[0];
  const eliminatedPlayer = players.find(p => p.playerId === eliminatedId);
  const eliminatedRole = roleAssignments.find(r => r.playerId === eliminatedId);

  return {
    eliminatedPlayerId: eliminatedId,
    eliminatedPlayerName: eliminatedPlayer?.playerName ?? 'Unknown',
    eliminatedPlayerRole: eliminatedRole?.role ?? null,
    isTied: false,
    message: `${eliminatedPlayer?.playerName ?? 'Unknown'} was eliminated by the village.`,
    voteTally,
  };
}

// ---------------------------------------------------------------------------
// Victory condition
// ---------------------------------------------------------------------------

/**
 * Check win condition.
 * - Villagers win if all werewolves are eliminated
 * - Werewolves win if they equal or outnumber remaining villagers
 */
export function checkWinCondition(
  alivePlayers: { playerId: string }[],
  roleAssignments: VOSRoleAssignment[],
): 'villagers' | 'werewolves' | null {
  const aliveIds = new Set(alivePlayers.map(p => p.playerId));

  const aliveWerewolves = roleAssignments.filter(
    r => r.role === VOS_ROLE.WEREWOLF && aliveIds.has(r.playerId),
  ).length;

  const aliveVillagers = aliveIds.size - aliveWerewolves;

  if (aliveWerewolves === 0) return 'villagers';
  if (aliveWerewolves >= aliveVillagers) return 'werewolves';
  return null;
}
