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

describe('inspect stand behavior', () => {
  it('shows what happens on stand - possible blackjack auto-stand', () => {
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
    
    console.log('Phase after bet:', module.getPhaseState('r1').phaseType);
    
    // Check if dealing was auto-done (all naturals?)
    const privAfterBet = module.getPrivateState('r1', 'p1') as any;
    console.log('P1 hands after bet:', privAfterBet.players?.p1?.hands_json);
    console.log('all_hands_settled:', privAfterBet.globals?.all_hands_settled);
    
    timer.trigger('r1'); // dealing timer
    console.log('Phase after deal trigger:', module.getPhaseState('r1').phaseType);
    
    const privAfterDeal = module.getPrivateState('r1', 'p1') as any;
    console.log('P1 hands after deal trigger:', privAfterDeal.players?.p1?.hands_json);
    console.log('P1 all_settled:', privAfterDeal.players?.p1?.all_settled);
    console.log('all_hands_settled global:', privAfterDeal.globals?.all_hands_settled);
    
    const r1stand = module.handleInput('r1', 'p1', 'action', { action: 'stand' });
    console.log('Stand p1 result:', r1stand);
    console.log('Phase after p1 stand:', module.getPhaseState('r1').phaseType);
    
    const r2stand = module.handleInput('r1', 'p2', 'action', { action: 'stand' });
    console.log('Stand p2 result:', r2stand);
    console.log('Phase after p2 stand:', module.getPhaseState('r1').phaseType);
  });
});
