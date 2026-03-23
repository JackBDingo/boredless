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

describe('inspect both naturals', () => {
  it('if both players natural BJ, does phase skip to dealer?', () => {
    // Find a case where both p1 and p2 have naturals (very rare with 2 players from same shoe)
    // Actually let's just check what happens when p2 also has a natural
    // Also check: when p1 has natural, what phase is it in, and does p2's stand advance?
    for (let trial = 0; trial < 200; trial++) {
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
      timer.trigger(roomId); // → playing
      
      const privP1 = module.getPrivateState(roomId, 'p1') as any;
      const privP2 = module.getPrivateState(roomId, 'p2') as any;
      const handsP1 = JSON.parse(privP1.players?.p1?.hands_json || '[]');
      const handsP2 = JSON.parse(privP2.players?.p2?.hands_json || '[]');
      const naturalP1 = handsP1[0]?.blackjack === true;
      const naturalP2 = handsP2[0]?.blackjack === true;
      
      if (naturalP1 && naturalP2) {
        console.log(`Trial ${trial}: BOTH naturals!`);
        console.log('Phase:', module.getPhaseState(roomId).phaseType);
        break;
      }
      if (naturalP1) {
        console.log(`Trial ${trial}: P1 natural, P2 not. Phase=${module.getPhaseState(roomId).phaseType}`);
        const s1 = module.handleInput(roomId, 'p1', 'action', { action: 'stand' }); // rejected
        const s2 = module.handleInput(roomId, 'p2', 'action', { action: 'stand' }); // accepted?
        console.log(`  After p1 stand (rejected?): ${s1.accepted}. Phase: ${module.getPhaseState(roomId).phaseType}`);
        console.log(`  After p2 stand: ${s2.accepted}. Phase: ${module.getPhaseState(roomId).phaseType}`);
        break;
      }
    }
  });
});
