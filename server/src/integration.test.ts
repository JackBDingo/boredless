import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './engine/room-manager';
import { bluffBattleModule } from './games/bluff-battle/index';
import { villageModule } from './games/village/index';
import { gameRegistry } from './games/registry';
import { PhaseType } from '@boredless/shared';
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
