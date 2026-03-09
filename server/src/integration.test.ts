import { describe, it, expect, beforeEach, vi } from 'vitest';
import { roomManager } from './engine/room-manager';
import { gameRegistry } from './games/registry';
import { createGameContext } from './games/create-game-context';
import { PhaseType } from '@boredless/shared';
import type { Player } from '@boredless/shared';
import type { GameModule } from './games/game-module';


// Mock WebSocket dependencies to isolate integration tests
vi.mock('./ws/send.js', () => ({
  sendToSession: vi.fn(),
  sendToSessions: vi.fn(),
}));

vi.mock('./engine/timer-engine.js', () => ({
  timerEngine: {
    start: vi.fn(),
    stop: vi.fn(),
    getRemaining: vi.fn(() => null),
  },
}));

vi.mock('./engine/score-engine.js', () => ({
  scoreEngine: {
    init: vi.fn(),
    addPoints: vi.fn(),
    getScore: vi.fn(() => 0),
    getScores: vi.fn(() => []),
    broadcastScores: vi.fn(),
    clear: vi.fn(),
  },
}));

/** Dynamically load a game module using createModule. Auto-discover uses the same approach. */
async function loadBluffBattle(): Promise<GameModule> {
  // Use auto-discover to load the module from the games/ directory
  const { discoverGames, manifestToDefinition } = await import('./games/auto-discover.js');
  const discovered = await discoverGames();
  const bb = discovered.find(g => g.manifest.id === 'bluff-battle');
  if (!bb) throw new Error('bluff-battle not found via auto-discover');
  return bb.createModule(manifestToDefinition(bb.manifest));
}

async function loadVillage(): Promise<GameModule> {
  const { discoverGames, manifestToDefinition } = await import('./games/auto-discover.js');
  const discovered = await discoverGames();
  const vos = discovered.find(g => g.manifest.id === 'village-of-shadows');
  if (!vos) throw new Error('village-of-shadows not found via auto-discover');
  return vos.createModule(manifestToDefinition(vos.manifest));
}

describe('Integration: Bluff Battle full game', () => {
  let roomId: string;
  let players: Player[];
  let bbModule: GameModule;

  beforeEach(async () => {
    roomManager.init({
      port: 3100,
      host: '0.0.0.0',
      corsOrigins: [],
      baseUrl: 'http://localhost:3100',
    });

    bbModule = await loadBluffBattle();
    gameRegistry.register(bbModule);

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
    bbModule.setup(players, createGameContext(roomId));

    const phase = bbModule.getPhaseState(roomId);
    expect(phase.phaseType).toBe(PhaseType.INSTRUCTIONS);
    expect(phase.roundNumber).toBe(0);
    expect(phase.totalRounds).toBe(3);
  });

  it('public state has correct shape', () => {
    bbModule.setup(players, createGameContext(roomId));
    const pub = bbModule.getPublicState(roomId) as Record<string, unknown>;
    expect(pub.gameId).toBe('bluff_battle');
    expect(pub.totalRounds).toBe(3);
    expect(pub.totalPlayers).toBe(4);
  });

  it('private state has correct shape for each player', () => {
    bbModule.setup(players, createGameContext(roomId));
    for (const player of players) {
      const priv = bbModule.getPrivateState(roomId, player.id) as Record<string, unknown>;
      expect(priv.gameId).toBe('bluff_battle');
      expect(priv.hasSubmitted).toBe(false);
      expect(priv.hasVoted).toBe(false);
    }
  });

  it('teardown cleans up', () => {
    bbModule.setup(players, createGameContext(roomId));
    bbModule.teardown(roomId);
    const phase = bbModule.getPhaseState(roomId);
    expect(phase.phaseType).toBe(PhaseType.LOBBY); // Default when no state
  });
});

describe('Integration: Village of Shadows setup', () => {
  let roomId: string;
  let players: Player[];
  let vosModule: GameModule;

  beforeEach(async () => {
    roomManager.init({
      port: 3100,
      host: '0.0.0.0',
      corsOrigins: [],
      baseUrl: 'http://localhost:3100',
    });

    vosModule = await loadVillage();

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
    vosModule.setup(players, createGameContext(roomId));

    // Check each player gets private state with a role
    for (const player of players) {
      const priv = vosModule.getPrivateState(roomId, player.id) as Record<string, unknown>;
      expect(priv.gameId).toBe('village_of_shadows');
      expect(priv.role).toBeDefined();
      expect(priv.isAlive).toBe(true);
    }
  });

  it('public state shows all players alive', () => {
    vosModule.setup(players, createGameContext(roomId));
    const pub = vosModule.getPublicState(roomId) as Record<string, unknown>;
    const playerList = pub.players as Array<Record<string, unknown>>;
    expect(playerList).toHaveLength(5);
    expect(playerList.every((p) => p.isAlive)).toBe(true);
  });
});
