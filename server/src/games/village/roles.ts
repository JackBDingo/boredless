import { VillageRole, ROLE_DISTRIBUTIONS } from '@boredless/shared';
import type { Player } from '@boredless/shared';

export interface RoleAssignment {
  playerId: string;
  role: VillageRole;
}

/**
 * Distribute roles to players based on player count.
 * Returns shuffled role assignments.
 */
export function distributeRoles(players: Player[]): RoleAssignment[] {
  const count = players.length;
  const dist = ROLE_DISTRIBUTIONS[count];

  if (!dist) {
    throw new Error(`No role distribution for ${count} players`);
  }

  // Build role pool
  const roles: VillageRole[] = [];
  for (let i = 0; i < dist.werewolves; i++) roles.push(VillageRole.WEREWOLF);
  for (let i = 0; i < dist.seers; i++) roles.push(VillageRole.SEER);
  for (let i = 0; i < dist.doctors; i++) roles.push(VillageRole.DOCTOR);
  for (let i = 0; i < dist.villagers; i++) roles.push(VillageRole.VILLAGER);

  // Shuffle roles
  const shuffled = [...roles].sort(() => Math.random() - 0.5);

  // Assign to players
  return players.map((player, i) => ({
    playerId: player.id,
    role: shuffled[i],
  }));
}

/** Get role display info */
export function getRoleInfo(role: VillageRole): { name: string; description: string; team: 'villagers' | 'werewolves' } {
  switch (role) {
    case VillageRole.VILLAGER:
      return {
        name: 'Villager',
        description: 'You are a villager. Find and eliminate the werewolves through discussion and voting.',
        team: 'villagers',
      };
    case VillageRole.WEREWOLF:
      return {
        name: 'Werewolf',
        description: 'You are a werewolf. Each night, choose a villager to eliminate. Blend in during the day.',
        team: 'werewolves',
      };
    case VillageRole.SEER:
      return {
        name: 'Seer',
        description: 'You are the Seer. Each night, you may inspect one player to learn if they are a werewolf.',
        team: 'villagers',
      };
    case VillageRole.DOCTOR:
      return {
        name: 'Doctor',
        description: 'You are the Doctor. Each night, you may protect one player from the werewolves.',
        team: 'villagers',
      };
  }
}
