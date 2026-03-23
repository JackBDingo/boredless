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

describe('inspect natural BJ stand behavior', () => {
  it('shows what happens when a player has natural blackjack', () => {
    // Run many trials to catch BJ
    for (let trial = 0; trial < 50; trial++) {
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
      
      const privP1 = module.getPrivateState(roomId, 'p1') as any;
      const handsP1 = JSON.parse(privP1.players?.p1?.hands_json || '[]');
      const hasNaturalP1 = handsP1[0]?.blackjack === true;
      
      if (hasNaturalP1) {
        const s1 = module.handleInput(roomId, 'p1', 'action', { action: 'stand' });
        console.log(`Trial ${trial}: P1 has natural BJ! Stand accepted=${s1.accepted} reason=${s1.reason}`);
        break;
      }
    }
    console.log('Done trials - no natural BJ found (very unlikely with 6 decks)');
  });
});
