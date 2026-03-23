/**
 * role-system.ts — Village of Shadows role definitions and assignment.
 *
 * Migrated from server/roles.ts — same logic, now in the V2 extension layer.
 * The V1 server/roles.ts is kept intact (hybrid loader keeps V1 game working).
 *
 * Role distribution:
 *   5 players:  1 wolf, 1 seer, 1 doctor, 2 villagers
 *   6 players:  1 wolf, 1 seer, 1 doctor, 3 villagers
 *   7 players:  2 wolves, 1 seer, 1 doctor, 3 villagers
 *   8 players:  2 wolves, 1 seer, 1 doctor, 4 villagers
 *   9 players:  2 wolves, 1 seer, 1 doctor, 5 villagers
 *   10 players: 3 wolves, 1 seer, 1 doctor, 5 villagers
 */

// ---------------------------------------------------------------------------
// Role constants
// ---------------------------------------------------------------------------

export const VOS_ROLE = {
  VILLAGER: 'villager',
  WEREWOLF: 'werewolf',
  SEER: 'seer',
  DOCTOR: 'doctor',
} as const;

export type VOSRole = typeof VOS_ROLE[keyof typeof VOS_ROLE];

// ---------------------------------------------------------------------------
// Role distribution table
// ---------------------------------------------------------------------------

export interface RoleDistribution {
  playerCount: number;
  werewolves: number;
  seers: number;
  doctors: number;
  villagers: number;
}

export const ROLE_DISTRIBUTIONS: Record<number, RoleDistribution> = {
  5:  { playerCount: 5,  werewolves: 1, seers: 1, doctors: 1, villagers: 2 },
  6:  { playerCount: 6,  werewolves: 1, seers: 1, doctors: 1, villagers: 3 },
  7:  { playerCount: 7,  werewolves: 2, seers: 1, doctors: 1, villagers: 3 },
  8:  { playerCount: 8,  werewolves: 2, seers: 1, doctors: 1, villagers: 4 },
  9:  { playerCount: 9,  werewolves: 2, seers: 1, doctors: 1, villagers: 5 },
  10: { playerCount: 10, werewolves: 3, seers: 1, doctors: 1, villagers: 5 },
};

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

export interface VOSRoleAssignment {
  playerId: string;
  role: VOSRole;
}

/**
 * Distribute roles to players based on player count.
 * Returns shuffled role assignments.
 *
 * @param playerIds - Array of player IDs to assign roles to
 * @param shuffle   - Custom shuffle function for testing (defaults to Math.random)
 */
export function assignRoles(
  playerIds: string[],
  shuffle: (arr: VOSRole[]) => VOSRole[] = defaultShuffle,
): VOSRoleAssignment[] {
  const count = playerIds.length;
  const dist = ROLE_DISTRIBUTIONS[count];

  if (!dist) {
    throw new Error(
      `Village of Shadows: No role distribution for ${count} players. ` +
      `Supported: ${Object.keys(ROLE_DISTRIBUTIONS).join(', ')}`,
    );
  }

  // Build role pool
  const roles: VOSRole[] = [];
  for (let i = 0; i < dist.werewolves; i++) roles.push(VOS_ROLE.WEREWOLF);
  for (let i = 0; i < dist.seers; i++) roles.push(VOS_ROLE.SEER);
  for (let i = 0; i < dist.doctors; i++) roles.push(VOS_ROLE.DOCTOR);
  for (let i = 0; i < dist.villagers; i++) roles.push(VOS_ROLE.VILLAGER);

  const shuffled = shuffle([...roles]);

  return playerIds.map((playerId, i) => ({
    playerId,
    role: shuffled[i],
  }));
}

/** Default Fisher-Yates shuffle using Math.random */
function defaultShuffle(arr: VOSRole[]): VOSRole[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Role info
// ---------------------------------------------------------------------------

export interface VOSRoleInfo {
  name: string;
  description: string;
  team: 'villagers' | 'werewolves';
}

export function getRoleInfo(role: VOSRole): VOSRoleInfo {
  switch (role) {
    case VOS_ROLE.VILLAGER:
      return {
        name: 'Villager',
        description: 'You are a villager. Find and eliminate the werewolves through discussion and voting.',
        team: 'villagers',
      };
    case VOS_ROLE.WEREWOLF:
      return {
        name: 'Werewolf',
        description: 'You are a werewolf. Each night, choose a villager to eliminate. Blend in during the day.',
        team: 'werewolves',
      };
    case VOS_ROLE.SEER:
      return {
        name: 'Seer',
        description: 'You are the Seer. Each night, you may inspect one player to learn if they are a werewolf.',
        team: 'villagers',
      };
    case VOS_ROLE.DOCTOR:
      return {
        name: 'Doctor',
        description: 'You are the Doctor. Each night, you may protect one player from the werewolves.',
        team: 'villagers',
      };
  }
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

/** Check if a role has a night action (werewolf, seer, doctor — not villager) */
export function roleHasNightAction(role: VOSRole): boolean {
  return role !== VOS_ROLE.VILLAGER;
}

/** Get all alive role assignments */
export function getAliveAssignments(
  assignments: VOSRoleAssignment[],
  aliveMap: Map<string, boolean>,
): VOSRoleAssignment[] {
  return assignments.filter(a => aliveMap.get(a.playerId) === true);
}

/** Get alive werewolves */
export function getAliveWerewolves(
  assignments: VOSRoleAssignment[],
  aliveMap: Map<string, boolean>,
): VOSRoleAssignment[] {
  return getAliveAssignments(assignments, aliveMap).filter(
    a => a.role === VOS_ROLE.WEREWOLF,
  );
}

/** Get alive non-werewolves */
export function getAliveVillagers(
  assignments: VOSRoleAssignment[],
  aliveMap: Map<string, boolean>,
): VOSRoleAssignment[] {
  return getAliveAssignments(assignments, aliveMap).filter(
    a => a.role !== VOS_ROLE.WEREWOLF,
  );
}
