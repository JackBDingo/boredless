# TESTS.md — Boredless Test Specifications

## PURPOSE

This document defines EXACT test cases with EXACT expected outputs.
An agent implementing any phase MUST write and pass these tests before
considering the phase complete.

Tests use **Vitest** for server/shared and **Jest** for phone.
All test files live adjacent to their source files as `*.test.ts`.

---

## 1. SHARED PACKAGE TESTS

### File: packages/shared/src/validation.test.ts

```ts
import { describe, it, expect } from 'vitest';
import {
  playerNameSchema,
  roomCodeSchema,
  bbSubmitSchema,
  voteSchema,
  nightActionSchema,
} from './validation';
import { InputType } from './enums';

describe('playerNameSchema', () => {
  it('accepts valid names', () => {
    expect(playerNameSchema.parse('Alice')).toBe('Alice');
    expect(playerNameSchema.parse('A')).toBe('A');
    expect(playerNameSchema.parse('Player With Space')).toBe('Player With Space');
  });

  it('trims whitespace', () => {
    expect(playerNameSchema.parse('  Bob  ')).toBe('Bob');
  });

  it('rejects empty strings', () => {
    expect(() => playerNameSchema.parse('')).toThrow();
  });

  it('rejects names longer than 16 chars', () => {
    expect(() => playerNameSchema.parse('A'.repeat(17))).toThrow();
  });

  it('accepts exactly 16 chars', () => {
    expect(playerNameSchema.parse('A'.repeat(16))).toBe('A'.repeat(16));
  });
});

describe('roomCodeSchema', () => {
  it('accepts valid 4-char codes', () => {
    expect(roomCodeSchema.parse('ABCD')).toBe('ABCD');
    expect(roomCodeSchema.parse('X2Y3')).toBe('X2Y3');
  });

  it('uppercases input', () => {
    expect(roomCodeSchema.parse('abcd')).toBe('ABCD');
  });

  it('rejects wrong length', () => {
    expect(() => roomCodeSchema.parse('ABC')).toThrow();
    expect(() => roomCodeSchema.parse('ABCDE')).toThrow();
  });
});

describe('bbSubmitSchema', () => {
  it('accepts valid text submission', () => {
    const result = bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: 'My fake answer' },
    });
    expect(result.payload.answer).toBe('My fake answer');
  });

  it('trims answer whitespace', () => {
    const result = bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: '  trimmed  ' },
    });
    expect(result.payload.answer).toBe('trimmed');
  });

  it('rejects empty answer', () => {
    expect(() => bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: '' },
    })).toThrow();
  });

  it('rejects answer over 100 chars', () => {
    expect(() => bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: 'A'.repeat(101) },
    })).toThrow();
  });

  it('rejects wrong input type', () => {
    expect(() => bbSubmitSchema.parse({
      inputType: InputType.VOTE,
      payload: { answer: 'test' },
    })).toThrow();
  });
});

describe('voteSchema', () => {
  it('accepts valid vote', () => {
    const result = voteSchema.parse({
      inputType: InputType.VOTE,
      payload: { answerId: 'abc123' },
    });
    expect(result.payload.answerId).toBe('abc123');
  });

  it('rejects empty answerId', () => {
    expect(() => voteSchema.parse({
      inputType: InputType.VOTE,
      payload: { answerId: '' },
    })).toThrow();
  });
});

describe('nightActionSchema', () => {
  it('accepts valid night action', () => {
    const result = nightActionSchema.parse({
      inputType: InputType.NIGHT_ACTION,
      payload: { targetPlayerId: 'player1' },
    });
    expect(result.payload.targetPlayerId).toBe('player1');
  });
});
```

### File: packages/shared/src/constants.test.ts

```ts
import { describe, it, expect } from 'vitest';
import {
  PLAYER_COLORS,
  ROOM_CODE_CHARS,
  BB_POINTS_CORRECT_ANSWER,
  BB_POINTS_FOOLED_PLAYER,
} from './constants';

describe('constants integrity', () => {
  it('has exactly 12 player colors', () => {
    expect(PLAYER_COLORS).toHaveLength(12);
  });

  it('all player colors are valid hex', () => {
    for (const color of PLAYER_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('room code chars exclude ambiguous characters', () => {
    expect(ROOM_CODE_CHARS).not.toContain('I');
    expect(ROOM_CODE_CHARS).not.toContain('O');
    expect(ROOM_CODE_CHARS).not.toContain('0');
    expect(ROOM_CODE_CHARS).not.toContain('1');
  });

  it('scoring constants are correct', () => {
    expect(BB_POINTS_CORRECT_ANSWER).toBe(1000);
    expect(BB_POINTS_FOOLED_PLAYER).toBe(500);
  });
});
```

---

## 2. SERVER TESTS

### File: server/src/utils/code.test.ts

```ts
import { describe, it, expect } from 'vitest';
import { generateRoomCode } from './code';
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@boredless/shared';

describe('generateRoomCode', () => {
  it('generates code of correct length', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('only uses allowed characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ROOM_CODE_CHARS).toContain(char);
      }
    }
  });

  it('generates different codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRoomCode());
    }
    // With 28^4 = 614,656 possibilities, 50 codes should all be unique
    expect(codes.size).toBe(50);
  });
});
```

### File: server/src/utils/id.test.ts

```ts
import { describe, it, expect } from 'vitest';
import { generateId, generateToken } from './id';

describe('generateId', () => {
  it('generates 21-char string', () => {
    expect(generateId()).toHaveLength(21);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('generateToken', () => {
  it('generates 10-char string', () => {
    expect(generateToken()).toHaveLength(10);
  });
});
```

### File: server/src/games/bluff-battle/scoring.test.ts

```ts
import { describe, it, expect } from 'vitest';
import { calculateBBScores, type BBAnswer, type BBVote } from './scoring';

describe('calculateBBScores', () => {
  const correctAnswer: BBAnswer = {
    answerId: 'correct',
    text: 'Vatican City',
    submittedByPlayerId: null,
    isCorrect: true,
  };

  const fakeByAlice: BBAnswer = {
    answerId: 'fake-alice',
    text: 'Monaco',
    submittedByPlayerId: 'alice',
    isCorrect: false,
  };

  const fakeByBob: BBAnswer = {
    answerId: 'fake-bob',
    text: 'Luxembourg',
    submittedByPlayerId: 'bob',
    isCorrect: false,
  };

  it('awards 1000 points for voting correct answer', () => {
    const answers = [correctAnswer, fakeByAlice, fakeByBob];
    const votes: BBVote[] = [
      { voterId: 'alice', answerId: 'correct' },
      { voterId: 'bob', answerId: 'correct' },
    ];

    const result = calculateBBScores(answers, votes);
    expect(result.roundPoints.get('alice')).toBe(1000);
    expect(result.roundPoints.get('bob')).toBe(1000);
  });

  it('awards 500 points per player fooled by your fake', () => {
    const answers = [correctAnswer, fakeByAlice, fakeByBob];
    const votes: BBVote[] = [
      { voterId: 'bob', answerId: 'fake-alice' },    // Bob fooled by Alice
      { voterId: 'charlie', answerId: 'fake-alice' }, // Charlie fooled by Alice
    ];

    const result = calculateBBScores(answers, votes);
    expect(result.roundPoints.get('alice')).toBe(1000); // 2 players × 500
    expect(result.roundPoints.get('bob')).toBeUndefined(); // Got nothing
  });

  it('awards both correct vote AND fool points', () => {
    const fakeByCharlie: BBAnswer = {
      answerId: 'fake-charlie',
      text: 'Nauru',
      submittedByPlayerId: 'charlie',
      isCorrect: false,
    };

    const answers = [correctAnswer, fakeByAlice, fakeByBob, fakeByCharlie];
    const votes: BBVote[] = [
      { voterId: 'alice', answerId: 'correct' },        // Alice gets 1000 for correct
      { voterId: 'bob', answerId: 'fake-alice' },       // Alice gets 500 for fooling Bob
      { voterId: 'charlie', answerId: 'fake-alice' },   // Alice gets 500 for fooling Charlie
    ];

    const result = calculateBBScores(answers, votes);
    // Alice: 1000 (correct vote) + 1000 (fooled 2 players)
    expect(result.roundPoints.get('alice')).toBe(2000);
  });

  it('handles no votes gracefully', () => {
    const answers = [correctAnswer, fakeByAlice];
    const votes: BBVote[] = [];

    const result = calculateBBScores(answers, votes);
    expect(result.roundPoints.size).toBe(0);
  });

  it('returns correct answerResults structure', () => {
    const answers = [correctAnswer, fakeByAlice];
    const votes: BBVote[] = [
      { voterId: 'bob', answerId: 'fake-alice' },
    ];

    const result = calculateBBScores(answers, votes);
    expect(result.answerResults).toHaveLength(2);

    const correctResult = result.answerResults.find(r => r.isCorrect);
    expect(correctResult?.voterIds).toEqual([]);

    const fakeResult = result.answerResults.find(r => !r.isCorrect);
    expect(fakeResult?.voterIds).toEqual(['bob']);
    expect(fakeResult?.submittedByPlayerId).toBe('alice');
  });
});
```

### File: server/src/games/bluff-battle/prompts.test.ts

```ts
import { describe, it, expect } from 'vitest';
import { PROMPTS, getRandomPrompts } from './prompts';

describe('PROMPTS', () => {
  it('has at least 50 prompts', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(50);
  });

  it('every prompt has id, question, and correctAnswer', () => {
    for (const prompt of PROMPTS) {
      expect(prompt.id).toBeDefined();
      expect(typeof prompt.question).toBe('string');
      expect(prompt.question.length).toBeGreaterThan(0);
      expect(typeof prompt.correctAnswer).toBe('string');
      expect(prompt.correctAnswer.length).toBeGreaterThan(0);
    }
  });

  it('all prompt IDs are unique', () => {
    const ids = new Set(PROMPTS.map(p => p.id));
    expect(ids.size).toBe(PROMPTS.length);
  });
});

describe('getRandomPrompts', () => {
  it('returns requested number of prompts', () => {
    expect(getRandomPrompts(3)).toHaveLength(3);
    expect(getRandomPrompts(5)).toHaveLength(5);
  });

  it('excludes specified IDs', () => {
    const result = getRandomPrompts(10, [1, 2, 3]);
    for (const prompt of result) {
      expect([1, 2, 3]).not.toContain(prompt.id);
    }
  });

  it('returns different prompts on repeated calls (probabilistic)', () => {
    const set1 = getRandomPrompts(5).map(p => p.id).sort();
    const set2 = getRandomPrompts(5).map(p => p.id).sort();
    // Very unlikely to be identical with 50+ prompts
    // Allow occasional collision but not consistent
    const attempts = Array.from({ length: 10 }, () =>
      getRandomPrompts(5).map(p => p.id).sort().join(',')
    );
    const unique = new Set(attempts);
    expect(unique.size).toBeGreaterThan(1);
  });
});
```

### File: server/src/games/village/roles.test.ts

```ts
import { describe, it, expect } from 'vitest';
import { distributeRoles, getRoleInfo } from './roles';
import { VillageRole, ROLE_DISTRIBUTIONS } from '@boredless/shared';
import type { Player } from '@boredless/shared';
import { PlayerStatus, DeviceType } from '@boredless/shared';

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
```

### File: server/src/games/village/resolution.test.ts

```ts
import { describe, it, expect } from 'vitest';
import { resolveNight, checkWinCondition, type NightAction } from './resolution';
import { VillageRole } from '@boredless/shared';
import type { RoleAssignment } from './roles';

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
```

### File: server/src/engine/room-manager.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './room-manager';

// NOTE: roomManager is a singleton. Tests must account for shared state.
// In a real setup, you'd refactor to allow isolated instances.
// For MVP, these tests verify the public API contract.

describe('RoomManager', () => {
  beforeEach(() => {
    // roomManager.init() needs a config — provide minimal
    roomManager.init({
      port: 3100,
      host: '0.0.0.0',
      corsOrigins: [],
      baseUrl: 'http://localhost:3100',
    });
  });

  describe('createRoom', () => {
    it('returns roomId, code, and qrDataUrl', async () => {
      const result = await roomManager.createRoom();
      expect(result.roomId).toBeTruthy();
      expect(result.code).toHaveLength(4);
      expect(result.qrDataUrl).toContain('data:image/png');
    });

    it('generates unique codes', async () => {
      const r1 = await roomManager.createRoom();
      const r2 = await roomManager.createRoom();
      expect(r1.code).not.toBe(r2.code);
    });
  });

  describe('joinRoom', () => {
    it('adds player to room', async () => {
      const { code } = await roomManager.createRoom();
      const result = roomManager.joinRoom(code, 'Alice', null);
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.player.name).toBe('Alice');
        expect(result.player.isHost).toBe(true); // First player is host
        expect(result.session.reconnectToken).toBeTruthy();
      }
    });

    it('first player becomes host', async () => {
      const { code } = await roomManager.createRoom();
      const r1 = roomManager.joinRoom(code, 'Alice', null);
      const r2 = roomManager.joinRoom(code, 'Bob', null);
      if (!('error' in r1)) expect(r1.player.isHost).toBe(true);
      if (!('error' in r2)) expect(r2.player.isHost).toBe(false);
    });

    it('rejects invalid room code', () => {
      const result = roomManager.joinRoom('ZZZZ', 'Alice', null);
      expect('error' in result).toBe(true);
    });

    it('assigns different colors to players', async () => {
      const { code } = await roomManager.createRoom();
      const r1 = roomManager.joinRoom(code, 'Alice', null);
      const r2 = roomManager.joinRoom(code, 'Bob', null);
      if (!('error' in r1) && !('error' in r2)) {
        expect(r1.player.color).not.toBe(r2.player.color);
      }
    });
  });

  describe('getRoomByCode', () => {
    it('finds room by code', async () => {
      const { code, roomId } = await roomManager.createRoom();
      const room = roomManager.getRoomByCode(code);
      expect(room).toBeDefined();
      expect(room!.id).toBe(roomId);
    });

    it('is case-insensitive', async () => {
      const { code } = await roomManager.createRoom();
      const room = roomManager.getRoomByCode(code.toLowerCase());
      expect(room).toBeDefined();
    });

    it('returns undefined for unknown code', () => {
      expect(roomManager.getRoomByCode('NOPE')).toBeUndefined();
    });
  });
});
```

---

## 3. INTEGRATION TEST SCRIPT

### File: server/src/integration.test.ts

This test verifies the full flow without WebSocket (calling modules directly).

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './engine/room-manager';
import { bluffBattleModule } from './games/bluff-battle/index';
import { villageModule } from './games/village/index';
import { gameRegistry } from './games/registry';
import { InputType, GameId, PhaseType, RoomStatus } from '@boredless/shared';
import type { Player } from '@boredless/shared';

describe('Integration: Bluff Battle full game', () => {
  let roomId: string;
  let players: Player[];

  beforeEach(async () => {
    roomManager.init({
      port: 3100,
      host: '0.0.0.0',
      corsOrigins: [],
      baseUrl: 'http://localhost:3100',
    });
    gameRegistry.register(bluffBattleModule);
    gameRegistry.register(villageModule);

    const room = await roomManager.createRoom();
    roomId = room.roomId;

    // Join 4 players
    const names = ['Alice', 'Bob', 'Charlie', 'Dana'];
    players = [];
    for (const name of names) {
      const result = roomManager.joinRoom(room.code, name, null);
      if (!('error' in result)) {
        players.push(result.player);
      }
    }
    expect(players).toHaveLength(4);
  });

  it('setup initializes game state', () => {
    bluffBattleModule.setup(roomId, players);

    const phase = bluffBattleModule.getPhaseState(roomId);
    expect(phase.phaseType).toBe(PhaseType.INSTRUCTIONS);
    expect(phase.roundNumber).toBe(0);
    expect(phase.totalRounds).toBe(3);
  });

  it('public state has correct shape', () => {
    bluffBattleModule.setup(roomId, players);
    const pub = bluffBattleModule.getPublicState(roomId) as any;
    expect(pub.gameId).toBe('bluff_battle');
    expect(pub.totalRounds).toBe(3);
    expect(pub.totalPlayers).toBe(4);
  });

  it('private state has correct shape for each player', () => {
    bluffBattleModule.setup(roomId, players);
    for (const player of players) {
      const priv = bluffBattleModule.getPrivateState(roomId, player.id) as any;
      expect(priv.gameId).toBe('bluff_battle');
      expect(priv.hasSubmitted).toBe(false);
      expect(priv.hasVoted).toBe(false);
    }
  });

  it('teardown cleans up', () => {
    bluffBattleModule.setup(roomId, players);
    bluffBattleModule.teardown(roomId);
    const phase = bluffBattleModule.getPhaseState(roomId);
    expect(phase.phaseType).toBe(PhaseType.LOBBY); // Default when no state
  });
});

describe('Integration: Village of Shadows setup', () => {
  let roomId: string;
  let players: Player[];

  beforeEach(async () => {
    roomManager.init({
      port: 3100,
      host: '0.0.0.0',
      corsOrigins: [],
      baseUrl: 'http://localhost:3100',
    });

    const room = await roomManager.createRoom();
    roomId = room.roomId;

    const names = ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve'];
    players = [];
    for (const name of names) {
      const result = roomManager.joinRoom(room.code, name, null);
      if (!('error' in result)) {
        players.push(result.player);
      }
    }
    expect(players).toHaveLength(5);
  });

  it('setup assigns roles to all players', () => {
    villageModule.setup(roomId, players);

    // Check each player gets private state with a role
    for (const player of players) {
      const priv = villageModule.getPrivateState(roomId, player.id) as any;
      expect(priv.gameId).toBe('village_of_shadows');
      expect(priv.role).toBeDefined();
      expect(priv.isAlive).toBe(true);
    }
  });

  it('public state shows all players alive', () => {
    villageModule.setup(roomId, players);
    const pub = villageModule.getPublicState(roomId) as any;
    expect(pub.players).toHaveLength(5);
    expect(pub.players.every((p: any) => p.isAlive)).toBe(true);
  });
});
```

---

## 4. VITEST CONFIGURATION

### File: server/vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

### File: packages/shared/vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

---

## 5. TEST EXECUTION COMMANDS

```bash
# Run all tests
npm test

# Run shared package tests only
npm test --workspace=packages/shared

# Run server tests only
npm test --workspace=server

# Run a specific test file
npx vitest run server/src/games/bluff-battle/scoring.test.ts
```

---

## 6. MANDATORY PASS CRITERIA

### Phase 2 Complete When:
- [ ] `npm run build:shared` succeeds
- [ ] All validation tests pass
- [ ] All constants tests pass

### Phase 3 Complete When:
- [ ] Server starts without errors
- [ ] `curl http://localhost:3100/api/health` returns `{"status":"ok"}`
- [ ] All code/id utility tests pass
- [ ] All scoring tests pass
- [ ] All prompt tests pass
- [ ] All role distribution tests pass
- [ ] All night resolution tests pass
- [ ] All room manager tests pass
- [ ] Integration tests pass

### Phase 4 Complete When:
- [ ] `npm run dev:display` opens in browser without errors
- [ ] Create Room button calls API and shows lobby
- [ ] QR code renders
- [ ] Browser console has no TypeScript/React errors

### Phase 5 Complete When:
- [ ] Phone app starts (Expo or web)
- [ ] Can enter room code and name
- [ ] Player appears in lobby on display

### End-to-End Complete When:
- [ ] Create room on display
- [ ] 3+ players join from phone/browser
- [ ] Start Bluff Battle
- [ ] All players submit fake answers
- [ ] All players vote
- [ ] Reveal shows correct answer highlighted
- [ ] Scores update correctly
- [ ] Game completes after 3 rounds
- [ ] Return to lobby works
- [ ] Start Village of Shadows
- [ ] All players see their roles
- [ ] Night phase completes
- [ ] Day discussion timer works
- [ ] Vote eliminates correct player
- [ ] Game ends with correct win condition

---

*Every test case in this file is REQUIRED. Do not skip tests. Do not write stub tests.*
*If a test fails, fix the implementation — do not modify the test.*
