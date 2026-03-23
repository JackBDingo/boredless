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

describe('inspect after bet/deal', () => {
  it('shows state after betting and dealing', () => {
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
    
    console.log('PHASE after bet:', module.getPhaseState('r1').phaseType);
    const privAfterBet = module.getPrivateState('r1', 'p1') as any;
    console.log('P1 after bet - chips:', privAfterBet.players?.p1?.chips, 'hands_json:', privAfterBet.players?.p1?.hands_json);
    
    // Trigger dealing timer 
    timer.trigger('r1');
    
    console.log('PHASE after deal trigger:', module.getPhaseState('r1').phaseType);
    const privAfterDeal = module.getPrivateState('r1', 'p1') as any;
    console.log('P1 after deal - chips:', privAfterDeal.players?.p1?.chips);
    console.log('P1 hands_json:', privAfterDeal.players?.p1?.hands_json);
    
    // Stand both
    module.handleInput('r1', 'p1', 'action', { action: 'stand' });
    module.handleInput('r1', 'p2', 'action', { action: 'stand' });
    console.log('PHASE after stand:', module.getPhaseState('r1').phaseType);
    
    timer.trigger('r1'); // dealer plays
    console.log('PHASE after dealer timer:', module.getPhaseState('r1').phaseType);
    
    const privAfterResults = module.getPrivateState('r1', 'p1') as any;
    console.log('P1 after dealer - result:', privAfterResults.players?.p1?.result);
    console.log('P1 after dealer - chips:', privAfterResults.players?.p1?.chips);
    console.log('P1 after dealer - result_amount:', privAfterResults.players?.p1?.result_amount);
  });
});
