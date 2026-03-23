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

describe('inspect full round chips', () => {
  it('shows chip state through full round', () => {
    const timer = new TestTimer();
    const pkg = loadGamePackage(GAME_YAML);
    const def = { id: 'blackjack', name: 'Blackjack', description: 'Test', minPlayers: 2, maxPlayers: 8, estimatedMinutes: 15, icon: 'diamond' };
    const module = createBlackjackModule(def, pkg, GAME_DIR, timer as any);
    
    const ctx = {
      roomId: 'r1',
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
    module.handleInput('r1', 'p1', 'action', { action: 'bet', bet: BJ_DEFAULT_BET });
    module.handleInput('r1', 'p2', 'action', { action: 'bet', bet: BJ_DEFAULT_BET });
    timer.trigger('r1'); // → playing
    module.handleInput('r1', 'p1', 'action', { action: 'stand' });
    module.handleInput('r1', 'p2', 'action', { action: 'stand' });
    timer.trigger('r1'); // dealer
    
    console.log('Phase after dealer:', module.getPhaseState('r1').phaseType);
    // Now in bj_results
    const inResults = module.getPrivateState('r1', 'p1') as any;
    console.log('In results - result:', inResults.players?.p1?.result);
    console.log('In results - chips:', inResults.players?.p1?.chips);
    console.log('In results - result_amount:', inResults.players?.p1?.result_amount);
    
    timer.trigger('r1'); // → scores
    const inScores = module.getPrivateState('r1', 'p1') as any;
    console.log('In scores - result:', inScores.players?.p1?.result);
    console.log('In scores - chips:', inScores.players?.p1?.chips);
    
    // What does the public seats_json show?
    const pub = module.getPublicState('r1') as any;
    console.log('seats_json:', pub.globals?.seats_json?.substring(0, 200));
  });
});
