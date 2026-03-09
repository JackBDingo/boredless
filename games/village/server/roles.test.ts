import { describe, it, expect } from 'vitest';
import { distributeRoles, getRoleInfo } from './roles';
import { VillageRole, ROLE_DISTRIBUTIONS } from '../types.js';
import type { Player } from '@boredless/shared';
import { PlayerStatus } from '@boredless/shared';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`,
    name: `Player ${i}`,
    color: '#FF0000',
    status: PlayerStatus.CONNECTED,
    isHost: i === 0,
    sessionId: `session-${i}`,
    joinedAt: Date.now(),
    disconnectedAt: null,
  }));
}

describe('distributeRoles', () => {
  it.each([5, 6, 7, 8, 9, 10])('distributes correct roles for %d players', (count) => {
    const players = makePlayers(count);
    const assignments = distributeRoles(players);
    const dist = ROLE_DISTRIBUTIONS[count];

    expect(assignments).toHaveLength(count);

    const roleCounts = {
      [VillageRole.WEREWOLF]: 0,
      [VillageRole.SEER]: 0,
      [VillageRole.DOCTOR]: 0,
      [VillageRole.VILLAGER]: 0,
    };
    for (const a of assignments) {
      roleCounts[a.role]++;
    }

    expect(roleCounts[VillageRole.WEREWOLF]).toBe(dist.werewolves);
    expect(roleCounts[VillageRole.SEER]).toBe(dist.seers);
    expect(roleCounts[VillageRole.DOCTOR]).toBe(dist.doctors);
    expect(roleCounts[VillageRole.VILLAGER]).toBe(dist.villagers);
  });

  it('assigns one role per player', () => {
    const players = makePlayers(7);
    const assignments = distributeRoles(players);
    const playerIds = new Set(assignments.map(a => a.playerId));
    expect(playerIds.size).toBe(7);
  });

  it('throws for unsupported player counts', () => {
    expect(() => distributeRoles(makePlayers(4))).toThrow();
    expect(() => distributeRoles(makePlayers(11))).toThrow();
  });
});

describe('getRoleInfo', () => {
  it('returns info for all roles', () => {
    for (const role of Object.values(VillageRole)) {
      const info = getRoleInfo(role);
      expect(info.name).toBeTruthy();
      expect(info.description).toBeTruthy();
      expect(['villagers', 'werewolves']).toContain(info.team);
    }
  });

  it('werewolf is on werewolves team', () => {
    expect(getRoleInfo(VillageRole.WEREWOLF).team).toBe('werewolves');
  });

  it('seer is on villagers team', () => {
    expect(getRoleInfo(VillageRole.SEER).team).toBe('villagers');
  });
});
