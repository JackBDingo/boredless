import { describe, it, expect } from 'vitest';
import { resolveNight, checkWinCondition, type NightAction } from './resolution.js';
import { VillageRole } from '../types.js';
import type { RoleAssignment } from './roles.js';

describe('resolveNight', () => {
  const roles: RoleAssignment[] = [
    { playerId: 'wolf1', role: VillageRole.WEREWOLF },
    { playerId: 'seer', role: VillageRole.SEER },
    { playerId: 'doctor', role: VillageRole.DOCTOR },
    { playerId: 'v1', role: VillageRole.VILLAGER },
    { playerId: 'v2', role: VillageRole.VILLAGER },
  ];

  const alivePlayers = [
    { playerId: 'wolf1', playerName: 'Wolf' },
    { playerId: 'seer', playerName: 'Seer' },
    { playerId: 'doctor', playerName: 'Doctor' },
    { playerId: 'v1', playerName: 'Villager1' },
    { playerId: 'v2', playerName: 'Villager2' },
  ];

  it('werewolf kills unprotected player', () => {
    const actions: NightAction[] = [
      { playerId: 'wolf1', role: VillageRole.WEREWOLF, targetPlayerId: 'v1' },
    ];

    const result = resolveNight(actions, roles, alivePlayers);
    expect(result.killedPlayerId).toBe('v1');
    expect(result.killedPlayerName).toBe('Villager1');
  });

  it('doctor saves the werewolf target', () => {
    const actions: NightAction[] = [
      { playerId: 'wolf1', role: VillageRole.WEREWOLF, targetPlayerId: 'v1' },
      { playerId: 'doctor', role: VillageRole.DOCTOR, targetPlayerId: 'v1' },
    ];

    const result = resolveNight(actions, roles, alivePlayers);
    expect(result.killedPlayerId).toBeNull();
    expect(result.killedPlayerName).toBeNull();
  });

  it('doctor protecting wrong player doesnt save target', () => {
    const actions: NightAction[] = [
      { playerId: 'wolf1', role: VillageRole.WEREWOLF, targetPlayerId: 'v1' },
      { playerId: 'doctor', role: VillageRole.DOCTOR, targetPlayerId: 'v2' },
    ];

    const result = resolveNight(actions, roles, alivePlayers);
    expect(result.killedPlayerId).toBe('v1');
  });

  it('seer correctly inspects werewolf', () => {
    const actions: NightAction[] = [
      { playerId: 'seer', role: VillageRole.SEER, targetPlayerId: 'wolf1' },
    ];

    const result = resolveNight(actions, roles, alivePlayers);
    expect(result.seerResult).not.toBeNull();
    expect(result.seerResult!.targetPlayerId).toBe('wolf1');
    expect(result.seerResult!.isWerewolf).toBe(true);
  });

  it('seer correctly inspects villager', () => {
    const actions: NightAction[] = [
      { playerId: 'seer', role: VillageRole.SEER, targetPlayerId: 'v1' },
    ];

    const result = resolveNight(actions, roles, alivePlayers);
    expect(result.seerResult!.isWerewolf).toBe(false);
  });

  it('no actions means no deaths', () => {
    const result = resolveNight([], roles, alivePlayers);
    expect(result.killedPlayerId).toBeNull();
    expect(result.seerResult).toBeNull();
  });

  it('multiple werewolves use majority vote for target', () => {
    const roles2: RoleAssignment[] = [
      { playerId: 'wolf1', role: VillageRole.WEREWOLF },
      { playerId: 'wolf2', role: VillageRole.WEREWOLF },
      { playerId: 'v1', role: VillageRole.VILLAGER },
      { playerId: 'v2', role: VillageRole.VILLAGER },
      { playerId: 'v3', role: VillageRole.VILLAGER },
      { playerId: 'v4', role: VillageRole.VILLAGER },
      { playerId: 'v5', role: VillageRole.VILLAGER },
    ];
    const alive2 = roles2.map(r => ({ playerId: r.playerId, playerName: r.playerId }));

    const actions: NightAction[] = [
      { playerId: 'wolf1', role: VillageRole.WEREWOLF, targetPlayerId: 'v1' },
      { playerId: 'wolf2', role: VillageRole.WEREWOLF, targetPlayerId: 'v1' },
    ];

    const result = resolveNight(actions, roles2, alive2);
    expect(result.killedPlayerId).toBe('v1');
  });
});

describe('checkWinCondition', () => {
  const makeRoles = (wolves: string[], villagers: string[]): RoleAssignment[] => [
    ...wolves.map(id => ({ playerId: id, role: VillageRole.WEREWOLF })),
    ...villagers.map(id => ({ playerId: id, role: VillageRole.VILLAGER })),
  ];

  it('villagers win when all werewolves dead', () => {
    const roles = makeRoles(['w1'], ['v1', 'v2', 'v3']);
    const alive = [{ playerId: 'v1' }, { playerId: 'v2' }, { playerId: 'v3' }];
    expect(checkWinCondition(alive, roles)).toBe('villagers');
  });

  it('werewolves win when equal to villagers', () => {
    const roles = makeRoles(['w1'], ['v1']);
    const alive = [{ playerId: 'w1' }, { playerId: 'v1' }];
    expect(checkWinCondition(alive, roles)).toBe('werewolves');
  });

  it('werewolves win when outnumber villagers', () => {
    const roles = makeRoles(['w1', 'w2'], ['v1']);
    const alive = [{ playerId: 'w1' }, { playerId: 'w2' }, { playerId: 'v1' }];
    expect(checkWinCondition(alive, roles)).toBe('werewolves');
  });

  it('no winner when game should continue', () => {
    const roles = makeRoles(['w1'], ['v1', 'v2', 'v3']);
    const alive = [{ playerId: 'w1' }, { playerId: 'v1' }, { playerId: 'v2' }, { playerId: 'v3' }];
    expect(checkWinCondition(alive, roles)).toBeNull();
  });
});
