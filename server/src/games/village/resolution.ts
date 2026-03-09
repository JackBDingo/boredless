import type { NightResolution, SeerInspectionResult } from '@boredless/shared';
import { VillageRole } from '@boredless/shared';
import type { RoleAssignment } from './roles.js';

export interface NightAction {
  playerId: string;
  role: VillageRole;
  targetPlayerId: string;
}

/**
 * Resolve night actions.
 *
 * Resolution order (this is critical and must be deterministic):
 * 1. Seer inspects their target
 * 2. Doctor protects their target
 * 3. Werewolves attack their target
 * 4. If doctor protected the attack target, no one dies
 */
export function resolveNight(
  actions: NightAction[],
  roleAssignments: RoleAssignment[],
  alivePlayers: { playerId: string; playerName: string }[],
): NightResolution {
  // Find each action type
  const werewolfActions = actions.filter(a => a.role === VillageRole.WEREWOLF);
  const seerAction = actions.find(a => a.role === VillageRole.SEER);
  const doctorAction = actions.find(a => a.role === VillageRole.DOCTOR);

  // 1. Resolve werewolf target (majority vote among werewolves, or first if tie)
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
        isWerewolf: targetRole.role === VillageRole.WEREWOLF,
      };
    }
  }

  // 3. Resolve doctor protection
  const doctorTargetId = doctorAction?.targetPlayerId ?? null;

  // 4. Determine kill
  let killedPlayerId: string | null = null;
  let killedPlayerName: string | null = null;

  if (werewolfTargetId && werewolfTargetId !== doctorTargetId) {
    // Werewolves killed someone and doctor didn't save them
    const killed = alivePlayers.find(p => p.playerId === werewolfTargetId);
    if (killed) {
      killedPlayerId = killed.playerId;
      killedPlayerName = killed.playerName;
    }
  }
  // If doctor protected the target, no one dies

  return {
    werewolfTargetId,
    seerTargetId,
    doctorTargetId,
    killedPlayerId,
    killedPlayerName,
    seerResult,
  };
}

/**
 * Check win condition.
 * - Villagers win if all werewolves are eliminated
 * - Werewolves win if they equal or outnumber villagers
 */
export function checkWinCondition(
  alivePlayers: { playerId: string }[],
  roleAssignments: RoleAssignment[],
): 'villagers' | 'werewolves' | null {
  const aliveIds = new Set(alivePlayers.map(p => p.playerId));

  const aliveWerewolves = roleAssignments.filter(
    r => r.role === VillageRole.WEREWOLF && aliveIds.has(r.playerId),
  ).length;

  const aliveVillagers = aliveIds.size - aliveWerewolves;

  if (aliveWerewolves === 0) return 'villagers';
  if (aliveWerewolves >= aliveVillagers) return 'werewolves';
  return null;
}
