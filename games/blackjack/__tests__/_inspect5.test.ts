import { describe, it } from 'vitest';
import { join } from 'node:path';
import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { createBlackjackModule } from '../extensions/game-module.js';
import { BJ_DEFAULT_BET } from '../extensions/index.js';
import { vi } from 'vitest';

const GAME_DIR = join(import.meta.dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

class TestTimer {
  private cbs = new Map<string, () => void>();
  start(roomId: string, _: string, __: number, ___: string[], cb: () => void) { this.cbs.set(roomId, cb); }
  stop(roomId: string) { this.cbs.delete(roomId); }
  getRemaining() { return null; }
  trigger(roomId: string) { const cb = this.cbs.get(roomId); if (cb) { this.cbs.delete(roomId); cb(); } }
}

describe('inspect full lifecycle', () => {
  it('shows phases through lifecycle', () => {
    // Run multiple times to catch blackjack natural variation
    for (let trial = 0; trial < 5; trial++) {
      const timer = new TestTimer();
      const pkg = loadGamePackage(GAME_YAML);
      const def = { id: 'blackjack', name: 'Blackjack', description: 'Test', minPlayers: 2, maxPlayers: 8, estimatedMinutes: 15, icon: 'diamond' };
      const module = createBlackjackModule(def, pkg, GAME_DIR, timer as any);
      
      const ctx = {
        roomId: `r${trial}`,
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
      const roomId = `r${trial}`;
      module.setup(players, ctx);
      module.handleInput(roomId, 'p1', 'action', { action: 'bet', bet: BJ_DEFAULT_BET });
      module.handleInput(roomId, 'p2', 'action', { action: 'bet', bet: BJ_DEFAULT_BET });
      timer.trigger(roomId);
      
      const phase1 = module.getPhaseState(roomId).phaseType;
      
      // If natural blackjack - all hands are already settled (phase may skip to dealer)
      // Try standing - if rejected, that means phase already moved on
      const s1 = module.handleInput(roomId, 'p1', 'action', { action: 'stand' });
      const s2 = module.handleInput(roomId, 'p2', 'action', { action: 'stand' });
      
      const phase2 = module.getPhaseState(roomId).phaseType;
      console.log(`Trial ${trial}: phase1=${phase1} s1=${s1.accepted} s2=${s2.accepted} phase2=${phase2}`);
    }
  });
});
