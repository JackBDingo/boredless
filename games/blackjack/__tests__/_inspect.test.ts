import { describe, it } from 'vitest';
import { join } from 'node:path';
import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { createBlackjackModule } from '../extensions/game-module.js';
import { vi } from 'vitest';

const GAME_DIR = join(import.meta.dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

describe('inspect state', () => {
  it('shows private state structure', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const def = { id: 'blackjack', name: 'Blackjack', description: 'Test', minPlayers: 2, maxPlayers: 8, estimatedMinutes: 15, icon: 'diamond' };
    const module = createBlackjackModule(def, pkg, GAME_DIR);
    
    const ctx = {
      roomId: 'test-room',
      initScores: () => {},
      addPoints: () => {},
      getScore: () => 0,
      getScores: () => [],
      clearScores: () => {},
      setRoomStatus: vi.fn(),
      broadcastPhase: vi.fn(),
      broadcastPrivateState: vi.fn(),
      broadcastScores: vi.fn(),
      broadcastGameOver: vi.fn(),
      sendToAll: vi.fn(),
      sendToPlayer: vi.fn(),
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      getTimerRemaining: vi.fn(() => null),
      getAllSessionIds: vi.fn(() => ['p1', 'p2']),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;
    
    const players = [{ id: 'p1', name: 'Alice', isHost: true }, { id: 'p2', name: 'Bob', isHost: false }];
    module.setup(players, ctx);
    
    const priv = module.getPrivateState('test-room', 'p1');
    console.log('PRIV:', JSON.stringify(priv));
    
    const pub = module.getPublicState('test-room');
    console.log('PUB keys:', Object.keys(pub));
    console.log('PUB globals:', JSON.stringify((pub as any).globals));
  });
});
