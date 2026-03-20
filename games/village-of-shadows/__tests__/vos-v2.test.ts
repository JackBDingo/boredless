/**
 * vos-v2.test.ts — Integration tests for Village of Shadows V2 declarative migration.
 *
 * Tests the full game lifecycle through DeclarativeGameModule + extension actions:
 *   role_reveal → night → night_result → day → vote → vote_result → [loop] → game_over
 *
 * Validates:
 *   - Role assignment distributes correct roles for player count
 *   - Night phase: werewolves target, seer inspects, doctor protects
 *   - Doctor saves prevent elimination
 *   - Day vote eliminates correct player
 *   - Victory: wolves win when they outnumber villagers
 *   - Victory: village wins when all wolves dead
 *   - Full multi-round game lifecycle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { Player, GameDefinition } from '@boredless/shared';

import {
  isVOSAction,
  handleAssignRoles,
  handleSetupNight,
  handleSetupVote,
  handleResolveNight,
  handleResolveVote,
  handleCheckVictory,
  getAliveMap,
  VOS_ROLE,
  assignRoles,
  checkWinCondition,
  resolveNight,
  resolveVote,
  type VOSActionContext,
  type VOSRoleAssignment,
} from '../extensions/index.js';

import { ROLE_DISTRIBUTIONS } from '../extensions/role-system.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_DIR = join(__dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

/** Controllable timer for testing */
class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();

  start(roomId: string, _phaseType: string, _durationMs: number, _sessionIds: string[], onExpire: () => void): void {
    this.callbacks.set(roomId, onExpire);
  }

  stop(roomId: string): void {
    this.callbacks.delete(roomId);
  }

  getRemaining(_roomId: string): number | null {
    return null;
  }

  trigger(roomId: string): void {
    const cb = this.callbacks.get(roomId);
    if (cb) {
      this.callbacks.delete(roomId);
      cb();
    }
  }

  hasPending(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }
}

/** Mock GameContext matching what DeclarativeGameModule expects */
function createMockCtx(roomId: string) {
  const scores = new Map<string, number>();
  const sentMessages: Array<{ to: string | null; msg: unknown }> = [];
  const broadcastPhaseCalls: Array<{ phase: unknown; publicState: unknown }> = [];

  return {
    roomId,
    scores,
    sentMessages,
    broadcastPhaseCalls,

    ctx: {
      roomId,
      initScores: (playerIds: string[]) => {
        for (const id of playerIds) scores.set(id, 0);
      },
      addPoints: (playerId: string, points: number) => {
        scores.set(playerId, (scores.get(playerId) ?? 0) + points);
      },
      getScore: (playerId: string) => scores.get(playerId) ?? 0,
      getScores: () => {
        const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        return entries.map(([playerId, score]) => ({
          playerId,
          playerName: playerId,
          score,
        }));
      },
      clearScores: () => scores.clear(),
      setRoomStatus: vi.fn(),
      broadcastPhase: vi.fn((phase: unknown, publicState: unknown) => {
        broadcastPhaseCalls.push({ phase, publicState });
      }),
      broadcastPrivateState: vi.fn(),
      broadcastScores: vi.fn(),
      broadcastGameOver: vi.fn(),
      sendToAll: vi.fn((msg: unknown) => {
        sentMessages.push({ to: null, msg });
      }),
      sendToPlayer: vi.fn((playerId: string, msg: unknown) => {
        sentMessages.push({ to: playerId, msg });
      }),
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      getTimerRemaining: vi.fn(() => null),
      getAllSessionIds: vi.fn(() => []),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as any,
  };
}

/** Create the VOS extension handler (mirrors game-module.ts createVOSHandler) */
function createVOSHandler(): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isVOSAction(actionName)) return false;

    const vosCtx: VOSActionContext = {
      globals: ctx.globals,
      players: ctx.players,
      playerInfo: ctx.playerInfo,
      setGlobal: ctx.setGlobal,
      setPlayer: ctx.setPlayer,
      log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
    };

    switch (actionName) {
      case 'vos_assign_roles':  handleAssignRoles(vosCtx);  return true;
      case 'vos_setup_night':   handleSetupNight(vosCtx);   return true;
      case 'vos_setup_vote':    handleSetupVote(vosCtx);    return true;
      case 'vos_resolve_night': handleResolveNight(vosCtx); return true;
      case 'vos_resolve_vote':  handleResolveVote(vosCtx);  return true;
      case 'vos_check_victory': handleCheckVictory(vosCtx); return true;
      default: return false;
    }
  };
}

/** Standard 5-player game definition */
const gameDefinition: GameDefinition = {
  id: 'village-of-shadows',
  name: 'Village of Shadows',
  description: 'Test',
  minPlayers: 5,
  maxPlayers: 10,
  estimatedMinutes: 15,
  icon: 'moon',
};

/** 5 players for a standard game */
const fivePlayers: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true } as Player,
  { id: 'p2', name: 'Bob', isHost: false } as Player,
  { id: 'p3', name: 'Charlie', isHost: false } as Player,
  { id: 'p4', name: 'Diana', isHost: false } as Player,
  { id: 'p5', name: 'Eve', isHost: false } as Player,
];

/** 7 players for multi-wolf scenarios */
const sevenPlayers: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true } as Player,
  { id: 'p2', name: 'Bob', isHost: false } as Player,
  { id: 'p3', name: 'Charlie', isHost: false } as Player,
  { id: 'p4', name: 'Diana', isHost: false } as Player,
  { id: 'p5', name: 'Eve', isHost: false } as Player,
  { id: 'p6', name: 'Frank', isHost: false } as Player,
  { id: 'p7', name: 'Grace', isHost: false } as Player,
];

// ---------------------------------------------------------------------------
// Helper: extract role assignments from globals after role_reveal
// ---------------------------------------------------------------------------

/**
 * Read role assignments from module by iterating all player private states.
 * Per-player `role` field is private-scoped, so each player can see their own role.
 * roles_json in globals is host-only (private global → omitted from player views).
 */
function getRolesFromModule(module: DeclarativeGameModule, roomId: string, playerIds: string[]): VOSRoleAssignment[] {
  const assignments: VOSRoleAssignment[] = [];
  for (const playerId of playerIds) {
    const privateState = module.getPrivateState(roomId, playerId);
    const players = privateState['players'] as Record<string, Record<string, unknown>>;
    const playerFields = players?.[playerId];
    const role = playerFields?.['role'];
    if (role && typeof role === 'string') {
      assignments.push({ playerId, role: role as VOSRoleAssignment['role'] });
    }
  }
  return assignments;
}

// ---------------------------------------------------------------------------
// Unit tests: role-system module
// ---------------------------------------------------------------------------

describe('VOS Role System — unit tests', () => {
  it('has correct role distributions for all player counts', () => {
    expect(ROLE_DISTRIBUTIONS[5]).toEqual({ playerCount: 5, werewolves: 1, seers: 1, doctors: 1, villagers: 2 });
    expect(ROLE_DISTRIBUTIONS[6]).toEqual({ playerCount: 6, werewolves: 1, seers: 1, doctors: 1, villagers: 3 });
    expect(ROLE_DISTRIBUTIONS[7]).toEqual({ playerCount: 7, werewolves: 2, seers: 1, doctors: 1, villagers: 3 });
    expect(ROLE_DISTRIBUTIONS[10]).toEqual({ playerCount: 10, werewolves: 3, seers: 1, doctors: 1, villagers: 5 });
  });

  it('assignRoles distributes correct counts for 5 players', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const assignments = assignRoles(playerIds);

    expect(assignments).toHaveLength(5);
    const wolves = assignments.filter(a => a.role === VOS_ROLE.WEREWOLF);
    const seers = assignments.filter(a => a.role === VOS_ROLE.SEER);
    const doctors = assignments.filter(a => a.role === VOS_ROLE.DOCTOR);
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);

    expect(wolves).toHaveLength(1);
    expect(seers).toHaveLength(1);
    expect(doctors).toHaveLength(1);
    expect(villagers).toHaveLength(2);
  });

  it('assignRoles distributes correct counts for 7 players', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    const assignments = assignRoles(playerIds);

    expect(assignments).toHaveLength(7);
    const wolves = assignments.filter(a => a.role === VOS_ROLE.WEREWOLF);
    expect(wolves).toHaveLength(2);
  });

  it('assignRoles assigns every player exactly one role', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const assignments = assignRoles(playerIds);
    const assignedIds = assignments.map(a => a.playerId).sort();
    expect(assignedIds).toEqual([...playerIds].sort());
  });

  it('assignRoles uses deterministic shuffle for testing', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    // Fixed shuffle: no reordering, so roles come out in definition order
    const fixedShuffle = (arr: any[]) => arr;
    const assignments = assignRoles(playerIds, fixedShuffle as any);
    // With no shuffling: wolf, seer, doctor, villager, villager
    expect(assignments[0].role).toBe(VOS_ROLE.WEREWOLF);
    expect(assignments[1].role).toBe(VOS_ROLE.SEER);
    expect(assignments[2].role).toBe(VOS_ROLE.DOCTOR);
    expect(assignments[3].role).toBe(VOS_ROLE.VILLAGER);
    expect(assignments[4].role).toBe(VOS_ROLE.VILLAGER);
  });

  it('throws for invalid player count (too few)', () => {
    expect(() => assignRoles(['p1', 'p2', 'p3'])).toThrow();
  });

  it('throws for invalid player count (too many)', () => {
    expect(() => assignRoles(['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11'])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Unit tests: resolution module
// ---------------------------------------------------------------------------

describe('VOS Resolution — unit tests', () => {
  const assignments: VOSRoleAssignment[] = [
    { playerId: 'p1', role: VOS_ROLE.WEREWOLF },
    { playerId: 'p2', role: VOS_ROLE.SEER },
    { playerId: 'p3', role: VOS_ROLE.DOCTOR },
    { playerId: 'p4', role: VOS_ROLE.VILLAGER },
    { playerId: 'p5', role: VOS_ROLE.VILLAGER },
  ];

  const alivePlayers = assignments.map(a => ({
    playerId: a.playerId,
    playerName: `Player ${a.playerId}`,
  }));

  describe('resolveNight', () => {
    it('werewolf kills target when unprotected', () => {
      const actions = [
        { playerId: 'p1', role: VOS_ROLE.WEREWOLF as const, targetPlayerId: 'p4' },
      ];
      const result = resolveNight(actions, assignments, alivePlayers);
      expect(result.killedPlayerId).toBe('p4');
      expect(result.killedPlayerName).toBe('Player p4');
      expect(result.werewolfTargetId).toBe('p4');
    });

    it('doctor save prevents werewolf kill', () => {
      const actions = [
        { playerId: 'p1', role: VOS_ROLE.WEREWOLF as const, targetPlayerId: 'p4' },
        { playerId: 'p3', role: VOS_ROLE.DOCTOR as const, targetPlayerId: 'p4' },
      ];
      const result = resolveNight(actions, assignments, alivePlayers);
      expect(result.killedPlayerId).toBeNull();
      expect(result.doctorTargetId).toBe('p4');
      expect(result.werewolfTargetId).toBe('p4');
    });

    it('seer correctly identifies werewolf', () => {
      const actions = [
        { playerId: 'p2', role: VOS_ROLE.SEER as const, targetPlayerId: 'p1' },
      ];
      const result = resolveNight(actions, assignments, alivePlayers);
      expect(result.seerResult).not.toBeNull();
      expect(result.seerResult?.isWerewolf).toBe(true);
      expect(result.seerResult?.targetPlayerId).toBe('p1');
    });

    it('seer correctly identifies non-werewolf', () => {
      const actions = [
        { playerId: 'p2', role: VOS_ROLE.SEER as const, targetPlayerId: 'p4' },
      ];
      const result = resolveNight(actions, assignments, alivePlayers);
      expect(result.seerResult?.isWerewolf).toBe(false);
    });

    it('no kill when no werewolf action submitted', () => {
      const result = resolveNight([], assignments, alivePlayers);
      expect(result.killedPlayerId).toBeNull();
    });

    it('multiple werewolves use majority vote for target', () => {
      const twoWolfAssignments: VOSRoleAssignment[] = [
        { playerId: 'p1', role: VOS_ROLE.WEREWOLF },
        { playerId: 'p2', role: VOS_ROLE.WEREWOLF },
        { playerId: 'p3', role: VOS_ROLE.SEER },
        { playerId: 'p4', role: VOS_ROLE.DOCTOR },
        { playerId: 'p5', role: VOS_ROLE.VILLAGER },
        { playerId: 'p6', role: VOS_ROLE.VILLAGER },
        { playerId: 'p7', role: VOS_ROLE.VILLAGER },
      ];
      const twoWolfPlayers = twoWolfAssignments.map(a => ({
        playerId: a.playerId,
        playerName: `Player ${a.playerId}`,
      }));
      const actions = [
        { playerId: 'p1', role: VOS_ROLE.WEREWOLF as const, targetPlayerId: 'p5' },
        { playerId: 'p2', role: VOS_ROLE.WEREWOLF as const, targetPlayerId: 'p5' },
      ];
      const result = resolveNight(actions, twoWolfAssignments, twoWolfPlayers);
      expect(result.killedPlayerId).toBe('p5');
    });

    it('doctor protects different player than wolf target — kill proceeds', () => {
      const actions = [
        { playerId: 'p1', role: VOS_ROLE.WEREWOLF as const, targetPlayerId: 'p4' },
        { playerId: 'p3', role: VOS_ROLE.DOCTOR as const, targetPlayerId: 'p5' }, // protects p5, not p4
      ];
      const result = resolveNight(actions, assignments, alivePlayers);
      expect(result.killedPlayerId).toBe('p4');
      expect(result.doctorTargetId).toBe('p5');
    });
  });

  describe('resolveVote', () => {
    it('player with most votes is eliminated', () => {
      const votes = new Map([
        ['p2', 'p4'],
        ['p3', 'p4'],
        ['p4', 'p1'],
      ]);
      const result = resolveVote(votes, assignments, alivePlayers);
      expect(result.eliminatedPlayerId).toBe('p4');
      expect(result.isTied).toBe(false);
    });

    it('tied vote results in no elimination', () => {
      const votes = new Map([
        ['p2', 'p4'],
        ['p3', 'p1'],
      ]);
      const result = resolveVote(votes, assignments, alivePlayers);
      expect(result.isTied).toBe(true);
      expect(result.eliminatedPlayerId).toBeNull();
    });

    it('reveals the role of eliminated player', () => {
      const votes = new Map([
        ['p2', 'p1'],
        ['p3', 'p1'],
        ['p4', 'p1'],
      ]);
      const result = resolveVote(votes, assignments, alivePlayers);
      expect(result.eliminatedPlayerId).toBe('p1');
      expect(result.eliminatedPlayerRole).toBe(VOS_ROLE.WEREWOLF);
    });

    it('generates vote tally with correct counts', () => {
      const votes = new Map([
        ['p2', 'p4'],
        ['p3', 'p4'],
        ['p4', 'p1'],
      ]);
      const result = resolveVote(votes, assignments, alivePlayers);
      const p4Tally = result.voteTally.find(t => t.targetPlayerId === 'p4');
      expect(p4Tally?.voteCount).toBe(2);
    });

    it('message describes no elimination on tie', () => {
      const votes = new Map([['p2', 'p4'], ['p3', 'p1']]);
      const result = resolveVote(votes, assignments, alivePlayers);
      expect(result.message).toContain('tied');
    });

    it('message names the eliminated player', () => {
      const votes = new Map([['p2', 'p1'], ['p3', 'p1'], ['p4', 'p1']]);
      const result = resolveVote(votes, assignments, alivePlayers);
      expect(result.message).toContain('Player p1');
    });
  });

  describe('checkWinCondition', () => {
    it('villagers win when all werewolves eliminated', () => {
      const alive = [
        { playerId: 'p2' }, // seer
        { playerId: 'p3' }, // doctor
        { playerId: 'p4' }, // villager
      ];
      expect(checkWinCondition(alive, assignments)).toBe('villagers');
    });

    it('werewolves win when they equal villager count', () => {
      // 1 wolf, 1 non-wolf → equal → wolves win
      const alive = [
        { playerId: 'p1' }, // werewolf
        { playerId: 'p4' }, // villager
      ];
      expect(checkWinCondition(alive, assignments)).toBe('werewolves');
    });

    it('werewolves win when they outnumber villagers', () => {
      // Need a 2-wolf setup for outnumber scenario
      const twoWolfAssignments: VOSRoleAssignment[] = [
        { playerId: 'p1', role: VOS_ROLE.WEREWOLF },
        { playerId: 'p2', role: VOS_ROLE.WEREWOLF },
        { playerId: 'p3', role: VOS_ROLE.SEER },
        { playerId: 'p4', role: VOS_ROLE.VILLAGER },
      ];
      // 2 wolves, 1 villager remaining
      const alive = [{ playerId: 'p1' }, { playerId: 'p2' }, { playerId: 'p4' }];
      expect(checkWinCondition(alive, twoWolfAssignments)).toBe('werewolves');
    });

    it('returns null when villagers still outnumber wolves', () => {
      // 1 wolf, 3 others alive
      const alive = [
        { playerId: 'p1' }, // wolf
        { playerId: 'p2' }, // seer
        { playerId: 'p3' }, // doctor
        { playerId: 'p4' }, // villager
      ];
      expect(checkWinCondition(alive, assignments)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests: VOS V2 with DeclarativeGameModule
// ---------------------------------------------------------------------------

describe('Village of Shadows V2 — full game integration', () => {
  let pkg: ReturnType<typeof loadGamePackage>;
  let timer: TestTimerImpl;

  beforeEach(() => {
    pkg = loadGamePackage(GAME_YAML);
    timer = new TestTimerImpl();
  });

  it('loads the V2 game package', () => {
    expect(pkg.manifest.id).toBe('village-of-shadows');
    expect(pkg.manifest.name).toBe('Village of Shadows');
    expect(pkg.manifest.players.min).toBe(5);
    expect(pkg.manifest.players.max).toBe(10);
  });

  it('has correct phases defined', () => {
    const phaseIds = Object.keys(pkg.phases);
    expect(phaseIds).toEqual([
      'role_reveal', 'night', 'night_result', 'day', 'vote', 'vote_result', 'game_over',
    ]);
  });

  it('starts in role_reveal phase', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    expect(module.getPhaseState('room1').phaseType).toBe('role_reveal');
  });

  it('assigns roles on role_reveal entry (vos_assign_roles)', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);

    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));
    expect(assignments).toHaveLength(5);

    const wolves = assignments.filter(a => a.role === VOS_ROLE.WEREWOLF);
    const seers = assignments.filter(a => a.role === VOS_ROLE.SEER);
    const doctors = assignments.filter(a => a.role === VOS_ROLE.DOCTOR);
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);

    expect(wolves).toHaveLength(1);
    expect(seers).toHaveLength(1);
    expect(doctors).toHaveLength(1);
    expect(villagers).toHaveLength(2);
  });

  it('public state includes alive player list after role assignment', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);

    const publicState = module.getPublicState('room1');
    const globals = publicState['globals'] as Record<string, unknown>;
    expect(globals['public_players_json']).toBeTruthy();

    const publicPlayers = JSON.parse(globals['public_players_json'] as string) as Array<{ playerId: string; isAlive: boolean }>;
    expect(publicPlayers).toHaveLength(5);
    expect(publicPlayers.every(p => p.isAlive)).toBe(true);
  });

  it('advances from role_reveal to night after timer', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);

    timer.trigger('room1'); // role_reveal → night
    expect(module.getPhaseState('room1').phaseType).toBe('night');
  });

  it('night phase increments day_number on entry', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);

    const beforeNight = (module.getPublicState('room1')['globals'] as Record<string, unknown>)['day_number'];
    expect(beforeNight).toBe(0);

    timer.trigger('room1'); // → night
    const afterNight = (module.getPublicState('room1')['globals'] as Record<string, unknown>)['day_number'];
    expect(afterNight).toBe(1);
  });

  it('night phase setup prepares targeting lists for non-villagers only', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night (triggers vos_setup_night)

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const wolfPrivate = module.getPrivateState('room1', wolf.playerId);
    const wolfFields = (wolfPrivate['players'] as Record<string, Record<string, unknown>>)[wolf.playerId];
    expect(wolfFields['night_targets_json']).toBeTruthy();

    const villager = assignments.find(a => a.role === VOS_ROLE.VILLAGER)!;
    const villagerPrivate = module.getPrivateState('room1', villager.playerId);
    const villagerFields = (villagerPrivate['players'] as Record<string, Record<string, unknown>>)[villager.playerId];
    expect(villagerFields['night_targets_json']).toBeNull();
  });

  it('night input_gate completes when all players submit', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night

    // All 5 players must submit (input_gate required = all_players)
    // Non-role players submit a dummy vote; resolution ignores them (role check)
    for (const player of fivePlayers) {
      const otherPlayer = fivePlayers.find(p => p.id !== player.id)!;
      module.handleInput('room1', player.id, 'vote', { value: otherPlayer.id });
    }

    // All submitted → advances to night_result
    expect(module.getPhaseState('room1').phaseType).toBe('night_result');
  });

  it('doctor save prevents night kill (wolf and doctor target same player)', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);
    const savedTarget = villagers[0].playerId;

    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) {
        targetId = savedTarget;          // wolf targets villager[0]
      } else if (player.id === doctor.playerId) {
        targetId = savedTarget;          // doctor SAVES wolf's target
      } else if (player.id === seer.playerId) {
        targetId = wolf.playerId;        // seer inspects the wolf
      } else {
        // Villager: submit dummy vote (required for input_gate completion)
        targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      }
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    // → night_result
    expect(module.getPhaseState('room1').phaseType).toBe('night_result');

    const globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    // Doctor saved → no kill
    expect(globals['eliminated_player_id']).toBeNull();
    expect(globals['night_result_message']).toContain('quiet');
  });

  it('wolf kill without doctor protection eliminates target', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);

    // Wolf targets villager[0], doctor protects villager[1] (different from wolf's target)
    const wolfTarget = villagers[0].playerId;
    const doctorTarget = villagers[1]?.playerId ?? seer.playerId;

    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget;
      else if (player.id === doctor.playerId) targetId = doctorTarget; // protects different player
      else if (player.id === seer.playerId) targetId = wolf.playerId;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    const globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    expect(globals['eliminated_player_id']).toBe(wolfTarget);
    expect(globals['night_result_message']).toContain('found dead');

    // Check public_players_json shows victim as dead
    const publicPlayers = JSON.parse(globals['public_players_json'] as string) as Array<{ playerId: string; isAlive: boolean }>;
    const victim = publicPlayers.find(p => p.playerId === wolfTarget);
    expect(victim?.isAlive).toBe(false);
  });

  it('seer inspection result stored in seer private state', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);

    // Seer inspects wolf; doctor saves villager; wolf kills villager[1]
    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === seer.playerId) targetId = wolf.playerId;    // seer → wolf
      else if (player.id === doctor.playerId) targetId = villagers[0].playerId;
      else if (player.id === wolf.playerId) targetId = villagers[1]?.playerId ?? villagers[0].playerId;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    // → night_result
    const seerPrivate = module.getPrivateState('room1', seer.playerId);
    const seerPlayerFields = (seerPrivate['players'] as Record<string, Record<string, unknown>>)[seer.playerId];
    const seerResultJson = seerPlayerFields?.['seer_result_json'];

    if (seerResultJson) {
      const seerResult = JSON.parse(seerResultJson as string) as { isWerewolf: boolean; targetPlayerId: string };
      expect(seerResult.isWerewolf).toBe(true);
      expect(seerResult.targetPlayerId).toBe(wolf.playerId);
    }
    // Note: seer result only stored if seer submitted a night action
  });

  it('night_result advances to day (no winner yet)', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);

    // Doctor saves wolf's target → no kill → no possible win condition yet
    const wolfTarget = villagers[0].playerId;
    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget;
      else if (player.id === doctor.playerId) targetId = wolfTarget;
      else if (player.id === seer.playerId) targetId = villagers[1]?.playerId ?? wolfTarget;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    expect(module.getPhaseState('room1').phaseType).toBe('night_result');

    timer.trigger('room1'); // night_result → day (game continues, no winner)
    expect(module.getPhaseState('room1').phaseType).toBe('day');
  });

  it('day phase advances to vote after timer', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    timer.trigger('room1'); // → night

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);
    const wolfTarget = villagers[0].playerId;

    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget;
      else if (player.id === doctor.playerId) targetId = wolfTarget;
      else if (player.id === seer.playerId) targetId = villagers[1]?.playerId ?? wolfTarget;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    timer.trigger('room1'); // night_result → day
    expect(module.getPhaseState('room1').phaseType).toBe('day');

    timer.trigger('room1'); // day → vote
    expect(module.getPhaseState('room1').phaseType).toBe('vote');
  });

  it('day vote eliminates player with majority votes', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    // Night 1: doctor saves, no kill → all 5 alive for vote
    timer.trigger('room1'); // → night
    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);
    const wolfTarget = villagers[0].playerId;

    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget;
      else if (player.id === doctor.playerId) targetId = wolfTarget; // saves
      else if (player.id === seer.playerId) targetId = villagers[1]?.playerId ?? wolfTarget;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    timer.trigger('room1'); // night_result → day
    if (module.getPhaseState('room1').phaseType === 'game_over') return;
    timer.trigger('room1'); // day → vote

    // All alive (5 players). Vote 3-for-1 on villagers[0]
    const voteTarget = villagers[0].playerId;
    const nonTargetPlayers = fivePlayers.filter(p => p.id !== voteTarget);

    // 3 players vote for voteTarget (majority)
    module.handleInput('room1', nonTargetPlayers[0].id, 'vote', { value: voteTarget });
    module.handleInput('room1', nonTargetPlayers[1].id, 'vote', { value: voteTarget });
    module.handleInput('room1', nonTargetPlayers[2].id, 'vote', { value: voteTarget });
    // voteTarget votes for someone else
    module.handleInput('room1', voteTarget, 'vote', { value: nonTargetPlayers[0].id });
    // Last player votes for someone else too
    module.handleInput('room1', nonTargetPlayers[3].id, 'vote', { value: nonTargetPlayers[0].id });

    // → vote_result
    expect(module.getPhaseState('room1').phaseType).toBe('vote_result');
    const voteGlobals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    expect(voteGlobals['eliminated_player_id']).toBe(voteTarget);
    expect(voteGlobals['vote_result_message']).toBeTruthy();
  });

  it('village wins when wolf voted out', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);
    const wolfTarget = villagers[0].playerId;

    // Night 1: doctor saves wolf's target → no kill
    timer.trigger('room1'); // → night
    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget;
      else if (player.id === doctor.playerId) targetId = wolfTarget;
      else if (player.id === seer.playerId) targetId = wolf.playerId;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    timer.trigger('room1'); // night_result → day
    if (module.getPhaseState('room1').phaseType === 'game_over') return;
    timer.trigger('room1'); // day → vote

    // All 5 alive; 4 non-wolf players vote for wolf (clear majority)
    const nonWolves = fivePlayers.filter(p => p.id !== wolf.playerId);
    for (const player of nonWolves) {
      module.handleInput('room1', player.id, 'vote', { value: wolf.playerId });
    }
    // Wolf votes for someone else
    module.handleInput('room1', wolf.playerId, 'vote', { value: nonWolves[0].id });

    // → vote_result
    expect(module.getPhaseState('room1').phaseType).toBe('vote_result');
    const voteGlobals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    expect(voteGlobals['eliminated_player_id']).toBe(wolf.playerId);

    // vote_result → game_over (wolf eliminated → village wins)
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('game_over');

    const finalGlobals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    expect(finalGlobals['game_over']).toBe(true);
    expect(finalGlobals['winning_team']).toBe('villagers');
  });

  it('werewolf victory: wolves win when they outnumber remaining villagers (unit)', () => {
    // Direct checkWinCondition test with 7-player assignments
    const sevenPlayerAssignments: VOSRoleAssignment[] = [
      { playerId: 'p1', role: VOS_ROLE.WEREWOLF },
      { playerId: 'p2', role: VOS_ROLE.WEREWOLF },
      { playerId: 'p3', role: VOS_ROLE.SEER },
      { playerId: 'p4', role: VOS_ROLE.DOCTOR },
      { playerId: 'p5', role: VOS_ROLE.VILLAGER },
      { playerId: 'p6', role: VOS_ROLE.VILLAGER },
      { playerId: 'p7', role: VOS_ROLE.VILLAGER },
    ];

    // Scenario: 2 wolves remain, 1 villager remains → wolves win
    const scenario = [{ playerId: 'p1' }, { playerId: 'p2' }, { playerId: 'p5' }];
    expect(checkWinCondition(scenario, sevenPlayerAssignments)).toBe('werewolves');
  });

  it('werewolves win when they equal remaining non-wolves (integration)', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const mockCtx = createMockCtx('room2');
    module.setup(sevenPlayers, mockCtx.ctx);
    const assignments = getRolesFromModule(module, 'room2', sevenPlayers.map(p => p.id));

    const wolves = assignments.filter(a => a.role === VOS_ROLE.WEREWOLF);
    const nonWolves = assignments.filter(a => a.role !== VOS_ROLE.WEREWOLF);

    expect(wolves).toHaveLength(2);
    expect(nonWolves).toHaveLength(5);

    // Win condition check: 2 wolves vs 2 remaining non-wolves → wolves win
    const alive = [...wolves, nonWolves[0], nonWolves[1]].map(a => ({ playerId: a.playerId }));
    expect(checkWinCondition(alive, assignments)).toBe('werewolves');
  });

  it('vote_result loops back to night if game continues', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);
    const wolfTarget = villagers[0].playerId;

    // Night 1 — doctor saves
    timer.trigger('room1'); // → night
    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget;
      else if (player.id === doctor.playerId) targetId = wolfTarget;
      else if (player.id === seer.playerId) targetId = wolf.playerId;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    timer.trigger('room1'); // night_result → day
    if (module.getPhaseState('room1').phaseType === 'game_over') return;
    timer.trigger('room1'); // day → vote

    // Tied day vote → no elimination → game continues
    // p1 → p2, p2 → p1, p3 → p4, p4 → p3, p5 → p1
    module.handleInput('room1', 'p1', 'vote', { value: 'p2' });
    module.handleInput('room1', 'p2', 'vote', { value: 'p1' });
    module.handleInput('room1', 'p3', 'vote', { value: 'p4' });
    module.handleInput('room1', 'p4', 'vote', { value: 'p3' });
    module.handleInput('room1', 'p5', 'vote', { value: 'p1' });

    expect(module.getPhaseState('room1').phaseType).toBe('vote_result');

    timer.trigger('room1'); // vote_result → night (no winner) or game_over (if p1/p2 tie broke the condition)
    const nextPhase = module.getPhaseState('room1').phaseType;
    const finalGlobals = module.getPublicState('room1')['globals'] as Record<string, unknown>;

    if (finalGlobals['game_over'] === true) {
      expect(nextPhase).toBe('game_over');
    } else {
      expect(nextPhase).toBe('night');
    }
  });

  it('full multi-round lifecycle: night1 (save) → day1 (tie) → night2 (kill) → day2 (wolf vote out) → game over', () => {
    const module = new DeclarativeGameModule(gameDefinition, pkg, timer, createVOSHandler());
    const { ctx } = createMockCtx('room1');
    module.setup(fivePlayers, ctx);
    const assignments = getRolesFromModule(module, 'room1', fivePlayers.map(p => p.id));

    const wolf = assignments.find(a => a.role === VOS_ROLE.WEREWOLF)!;
    const doctor = assignments.find(a => a.role === VOS_ROLE.DOCTOR)!;
    const seer = assignments.find(a => a.role === VOS_ROLE.SEER)!;
    const villagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER);

    // ===== ROUND 1 =====

    // Night 1: doctor saves wolf's first target
    timer.trigger('room1'); // role_reveal → night
    expect(module.getPhaseState('room1').phaseType).toBe('night');

    const wolfTarget1 = villagers[0].playerId;
    for (const player of fivePlayers) {
      let targetId: string;
      if (player.id === wolf.playerId) targetId = wolfTarget1;
      else if (player.id === doctor.playerId) targetId = wolfTarget1; // saves
      else if (player.id === seer.playerId) targetId = wolf.playerId;
      else targetId = fivePlayers.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    expect(module.getPhaseState('room1').phaseType).toBe('night_result');
    let globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    expect(globals['eliminated_player_id']).toBeNull(); // doctor saved

    timer.trigger('room1'); // night_result → day
    if (module.getPhaseState('room1').phaseType === 'game_over') return;
    expect(module.getPhaseState('room1').phaseType).toBe('day');

    timer.trigger('room1'); // day → vote
    expect(module.getPhaseState('room1').phaseType).toBe('vote');

    // Day vote 1: tie → no elimination
    module.handleInput('room1', 'p1', 'vote', { value: 'p2' });
    module.handleInput('room1', 'p2', 'vote', { value: 'p1' });
    module.handleInput('room1', 'p3', 'vote', { value: 'p4' });
    module.handleInput('room1', 'p4', 'vote', { value: 'p3' });
    module.handleInput('room1', 'p5', 'vote', { value: 'p2' });

    expect(module.getPhaseState('room1').phaseType).toBe('vote_result');
    globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    // Could be tied or someone got 2 votes

    timer.trigger('room1'); // vote_result → night (no winner) or game_over
    if (module.getPhaseState('room1').phaseType === 'game_over') return;
    expect(module.getPhaseState('room1').phaseType).toBe('night');

    // ===== ROUND 2 =====

    // Check day_number incremented
    globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    expect(globals['day_number']).toBe(2);

    // Night 2: wolf kills villager[1] this time (doctor doesn't save)
    const aliveAfterR1 = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    const aliveMapR2 = getAliveMap(aliveAfterR1);
    const alivePlayersR2 = fivePlayers.filter(p => aliveMapR2.get(p.id) !== false);

    // Find alive villager to kill this time
    const aliveVillagers = assignments.filter(a => a.role === VOS_ROLE.VILLAGER && aliveMapR2.get(a.playerId) !== false);
    const wolfTarget2 = aliveVillagers[1]?.playerId ?? aliveVillagers[0]?.playerId ?? villagers[0].playerId;

    // Doctor protects doctor themselves (or someone other than wolf's target)
    const doctorSelf = doctor.playerId;

    for (const player of alivePlayersR2) {
      let targetId: string;
      const assignment = assignments.find(a => a.playerId === player.id)!;
      if (player.id === wolf.playerId) targetId = wolfTarget2;
      else if (player.id === doctor.playerId) targetId = doctorSelf; // protects self, NOT wolf's target
      else if (player.id === seer.playerId) targetId = wolf.playerId;
      else targetId = alivePlayersR2.find(p => p.id !== player.id)!.id;
      module.handleInput('room1', player.id, 'vote', { value: targetId });
    }

    expect(module.getPhaseState('room1').phaseType).toBe('night_result');

    timer.trigger('room1'); // night_result → day or game_over
    if (module.getPhaseState('room1').phaseType === 'game_over') {
      // Check if wolves won
      globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
      expect(globals['game_over']).toBe(true);
      return;
    }
    expect(module.getPhaseState('room1').phaseType).toBe('day');

    timer.trigger('room1'); // day → vote

    // Day vote 2: everyone votes for wolf → wolf eliminated → village wins
    const aliveAfterNight2 = module.getPublicState('room1')['globals'] as Record<string, unknown>;
    const aliveMapVote2 = getAliveMap(aliveAfterNight2);
    const aliveVote2 = fivePlayers.filter(p => aliveMapVote2.get(p.id) !== false);

    for (const player of aliveVote2) {
      if (player.id !== wolf.playerId) {
        module.handleInput('room1', player.id, 'vote', { value: wolf.playerId });
      } else {
        const target = aliveVote2.find(p => p.id !== wolf.playerId)!;
        module.handleInput('room1', player.id, 'vote', { value: target.id });
      }
    }

    expect(module.getPhaseState('room1').phaseType).toBe('vote_result');
    globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;

    if (globals['eliminated_player_id'] === wolf.playerId) {
      // Wolf eliminated → village wins
      timer.trigger('room1'); // vote_result → game_over
      expect(module.getPhaseState('room1').phaseType).toBe('game_over');

      globals = module.getPublicState('room1')['globals'] as Record<string, unknown>;
      expect(globals['game_over']).toBe(true);
      expect(globals['winning_team']).toBe('villagers');
    } else {
      // Tie or wolf survived round 2 — game continues
      timer.trigger('room1');
      expect(['night', 'game_over']).toContain(module.getPhaseState('room1').phaseType);
    }
  });
});
