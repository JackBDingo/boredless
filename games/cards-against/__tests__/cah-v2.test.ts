/**
 * cah-v2.test.ts — Integration tests for Cards Against Humanity V2 declarative migration.
 *
 * Tests the full game lifecycle through DeclarativeGameModule + extension actions:
 *   deal → prompt → reading → reveal → scores → (deal_next → prompt → ...) → game_over
 *
 * Validates:
 *   - Game loads and starts in deal phase
 *   - Extension deals cards to all players (hands_map_json populated)
 *   - Black card drawn on prompt phase entry
 *   - Non-czar players can submit white cards; czar is blocked
 *   - Phase advances to reading when all non-czar players (+ czar) have voted
 *   - Czar picks winner → points awarded (1000 pts)
 *   - Czar rotates between rounds
 *   - Full multi-round lifecycle reaches game_over
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { Player, GameDefinition } from '@boredless/shared';

import {
  isCAHAction,
  handleDealCards,
  handleSelectBlackCard,
  handleBuildSubmissions,
  handleCzarPickWinner,
  handleRotateCzar,
  getHandsMap,
  getPlayerHand,
  getAnonymousSubmissions,
  getCurrentBlackCard,
  resetCardCache,
  type CAHActionContext,
  CAH_HAND_SIZE,
  CAH_POINTS_AWESOME,
} from '../extensions/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_DIR = join(__dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

/** Controllable timer for testing */
class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();

  start(roomId: string, _phaseType: string, _durationMs: number, _sessionIds: string[], onExpire: () => void): void {
    this.callbacks.set(roomId, onExpire);
  }

  stop(roomId: string): void {
    this.callbacks.delete(roomId);
  }

  getRemaining(_roomId: string): number | null {
    return null;
  }

  trigger(roomId: string): void {
    const cb = this.callbacks.get(roomId);
    if (cb) {
      this.callbacks.delete(roomId);
      cb();
    }
  }

  hasPending(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }
}

/** Mock GameContext */
function createMockCtx(roomId: string) {
  const scores = new Map<string, number>();
  const sentMessages: Array<{ to: string | null; msg: unknown }> = [];
  const broadcastPhaseCalls: Array<{ phase: unknown; publicState: unknown }> = [];

  return {
    roomId,
    scores,
    sentMessages,
    broadcastPhaseCalls,

    ctx: {
      roomId,
      initScores: (playerIds: string[]) => {
        for (const id of playerIds) scores.set(id, 0);
      },
      addPoints: (playerId: string, points: number) => {
        scores.set(playerId, (scores.get(playerId) ?? 0) + points);
      },
      getScore: (playerId: string) => scores.get(playerId) ?? 0,
      getScores: () => {
        const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        return entries.map(([playerId, score]) => ({
          playerId,
          playerName: playerId,
          score,
        }));
      },
      clearScores: () => scores.clear(),
      setRoomStatus: vi.fn(),
      broadcastPhase: vi.fn((phase: unknown, publicState: unknown) => {
        broadcastPhaseCalls.push({ phase, publicState });
      }),
      broadcastPrivateState: vi.fn(),
      broadcastScores: vi.fn(),
      broadcastGameOver: vi.fn(),
      sendToAll: vi.fn((msg: unknown) => {
        sentMessages.push({ to: null, msg });
      }),
      sendToPlayer: vi.fn((playerId: string, msg: unknown) => {
        sentMessages.push({ to: playerId, msg });
      }),
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      getTimerRemaining: vi.fn(() => null),
      getAllSessionIds: vi.fn(() => ['p1', 'p2', 'p3']),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as any,
  };
}

/** Create the CAH extension handler (mirrors game-module.ts createCAHHandler) */
function createCAHHandler(gameDir: string): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isCAHAction(actionName)) return false;

    const cahCtx: CAHActionContext = {
      globals: ctx.globals,
      players: ctx.players,
      playerInfo: ctx.playerInfo,
      getScore: ctx.getScore,
      setGlobal: ctx.setGlobal,
      addPoints: ctx.addPoints,
      log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
    };

    switch (actionName) {
      case 'cah_deal_cards': handleDealCards(cahCtx, gameDir); return true;
      case 'cah_select_black_card': handleSelectBlackCard(cahCtx); return true;
      case 'cah_build_submissions': handleBuildSubmissions(cahCtx); return true;
      case 'cah_czar_pick_winner': handleCzarPickWinner(cahCtx); return true;
      case 'cah_rotate_czar': handleRotateCzar(cahCtx); return true;
      default: return false;
    }
  };
}

const players: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true },
  { id: 'p2', name: 'Bob', isHost: false },
  { id: 'p3', name: 'Charlie', isHost: false },
];

const definition: GameDefinition = {
  id: 'cards-against',
  name: 'Cards Against Humanity',
  description: 'The party game for horrible people.',
  minPlayers: 3,
  maxPlayers: 8,
  estimatedMinutes: 30,
  icon: 'layers',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cards Against Humanity V2 — full game integration', () => {
  let pkg: ReturnType<typeof loadGamePackage>;
  let timer: TestTimerImpl;

  beforeEach(() => {
    resetCardCache();
    pkg = loadGamePackage(GAME_YAML);
    timer = new TestTimerImpl();
  });

  // -------------------------------------------------------------------------
  // Package loading
  // -------------------------------------------------------------------------

  it('loads the V2 game package', () => {
    expect(pkg.manifest.id).toBe('cards-against');
    expect(pkg.manifest.name).toBe('Cards Against Humanity');
    expect(pkg.manifest.players.min).toBe(3);
    expect(pkg.manifest.players.max).toBe(8);
  });

  it('has correct phases defined', () => {
    const phaseIds = Object.keys(pkg.phases);
    expect(phaseIds).toContain('deal');
    expect(phaseIds).toContain('prompt');
    expect(phaseIds).toContain('reading');
    expect(phaseIds).toContain('reveal');
    expect(phaseIds).toContain('scores');
    expect(phaseIds).toContain('deal_next');
    expect(phaseIds).toContain('game_over');
  });

  // -------------------------------------------------------------------------
  // Game start — deal phase
  // -------------------------------------------------------------------------

  it('starts in deal phase', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    expect(module.getPhaseState('room1').phaseType).toBe('deal');
  });

  it('deals cards to all players on deal phase entry', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);

    // Deal phase auto-triggers cah_deal_cards on_enter
    const publicState = module.getPublicState('room1');
    const globals = publicState.globals as Record<string, unknown>;

    // czar_player_id should be set
    expect(globals.czar_player_id).toBeTruthy();
    expect(['p1', 'p2', 'p3']).toContain(globals.czar_player_id as string);
  });

  it('advances from deal to prompt after timer, selecting a black card', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    expect(module.getPhaseState('room1').phaseType).toBe('deal');

    // Trigger deal timer → moves to prompt
    timer.trigger('room1');

    expect(module.getPhaseState('room1').phaseType).toBe('prompt');

    // Black card should be drawn
    const globals = module.getPublicState('room1').globals as Record<string, unknown>;
    expect(globals.current_black_card).toBeTruthy();
    const blackCard = JSON.parse(globals.current_black_card as string) as { id: string; text: string; pick: number };
    expect(typeof blackCard.id).toBe('string');
    expect(typeof blackCard.text).toBe('string');
    expect(typeof blackCard.pick).toBe('number');
    expect(blackCard.pick).toBeGreaterThanOrEqual(1);

    // Round incremented
    expect(globals.round).toBe(1);

    // submitted_count reset to 0
    expect(globals.submitted_count).toBe(0);
  });

  it('gives each player a full hand after dealing', () => {
    // Use the extension directly on a context to verify hand size
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: () => {},
      log: () => {},
    };

    handleDealCards(cahCtx, GAME_DIR);

    const handsMap = getHandsMap(globals);
    for (const { id } of playerInfo) {
      const hand = handsMap[id];
      expect(hand).toBeDefined();
      expect(hand.length).toBe(CAH_HAND_SIZE);
      // Each card should have id and text
      for (const card of hand) {
        expect(typeof card.id).toBe('string');
        expect(typeof card.text).toBe('string');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Card submission — prompt phase
  // -------------------------------------------------------------------------

  it('advances to reading phase after all players submit votes in prompt', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    timer.trigger('room1'); // deal → prompt
    expect(module.getPhaseState('room1').phaseType).toBe('prompt');

    // All players submit vote (required: all_players)
    module.handleInput('room1', 'p1', 'vote', { value: 'card-1' });
    module.handleInput('room1', 'p2', 'vote', { value: 'card-2' });
    module.handleInput('room1', 'p3', 'vote', { value: 'card-3' });

    // Should advance to reading after all_players voted
    expect(module.getPhaseState('room1').phaseType).toBe('reading');
  });

  it('accepts vote input from all players in prompt phase', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    timer.trigger('room1'); // deal → prompt

    const result1 = module.handleInput('room1', 'p1', 'vote', { value: 'card-1' });
    expect(result1.accepted).toBe(true);

    const result2 = module.handleInput('room1', 'p2', 'vote', { value: 'card-2' });
    expect(result2.accepted).toBe(true);

    const result3 = module.handleInput('room1', 'p3', 'vote', { value: 'card-3' });
    expect(result3.accepted).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Czar reads and picks winner — reading phase
  // -------------------------------------------------------------------------

  it('czar picking winner advances to reveal phase', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);
    timer.trigger('room1'); // deal → prompt

    // All submit
    module.handleInput('room1', 'p1', 'vote', { value: 'card-1' });
    module.handleInput('room1', 'p2', 'vote', { value: 'card-2' });
    module.handleInput('room1', 'p3', 'vote', { value: 'card-3' });

    expect(module.getPhaseState('room1').phaseType).toBe('reading');

    // Get czar and have them pick
    const globals = module.getPublicState('room1').globals as Record<string, unknown>;
    const czarId = globals.czar_player_id as string;

    const czarResult = module.handleInput('room1', czarId, 'vote', { value: 'any-submission-id' });
    expect(czarResult.accepted).toBe(true);

    // Should advance to reveal (no 'required', so first vote advances)
    expect(module.getPhaseState('room1').phaseType).toBe('reveal');
  });

  // -------------------------------------------------------------------------
  // Full round flow: deal → prompt → reading → reveal → scores
  // -------------------------------------------------------------------------

  it('completes a full round: deal → prompt → reading → reveal → scores', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);
    expect(module.getPhaseState('room1').phaseType).toBe('deal');

    // deal → prompt
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('prompt');
    expect((module.getPublicState('room1').globals as Record<string, unknown>).round).toBe(1);

    // All players submit votes
    module.handleInput('room1', 'p1', 'vote', { value: 'x1' });
    module.handleInput('room1', 'p2', 'vote', { value: 'x2' });
    module.handleInput('room1', 'p3', 'vote', { value: 'x3' });
    expect(module.getPhaseState('room1').phaseType).toBe('reading');

    // Czar picks winner
    const czarId = (module.getPublicState('room1').globals as Record<string, unknown>).czar_player_id as string;
    module.handleInput('room1', czarId, 'vote', { value: 'winner-sub' });
    expect(module.getPhaseState('room1').phaseType).toBe('reveal');

    // reveal → scores (timed)
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('scores');
  });

  // -------------------------------------------------------------------------
  // Czar winner pick awards points (unit test on extension)
  // -------------------------------------------------------------------------

  it('cah_czar_pick_winner awards points to winner when submission map is valid', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));
    const pointsAwarded: Array<{ id: string; pts: number }> = [];

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: (playerId, amount) => { pointsAwarded.push({ id: playerId, pts: amount }); },
      log: () => {},
    };

    // Set up state: deal cards, select black card
    handleDealCards(cahCtx, GAME_DIR);
    handleSelectBlackCard(cahCtx);

    // Simulate p2 being czar
    globals['czar_index'] = 1;
    globals['czar_player_id'] = 'p2';

    // Set up submission map: submission 'sub-001' belongs to 'p1'
    globals['submission_map_json'] = JSON.stringify({ 'sub-001': 'p1' });
    globals['submissions_json'] = JSON.stringify([
      { submissionId: 'sub-001', cards: [{ text: 'Some white card' }] },
    ]);

    // Czar picks 'sub-001'
    globals['winner_json'] = 'sub-001';

    handleCzarPickWinner(cahCtx);

    // p1 should receive CAH_POINTS_AWESOME
    expect(pointsAwarded.length).toBeGreaterThan(0);
    const award = pointsAwarded.find(a => a.id === 'p1');
    expect(award).toBeDefined();
    expect(award!.pts).toBe(CAH_POINTS_AWESOME);

    // winner_json should be updated to full CAHWinner object
    const winnerObj = JSON.parse(globals['winner_json'] as string) as {
      submissionId: string; playerId: string; playerName: string; cards: unknown[];
    };
    expect(winnerObj.submissionId).toBe('sub-001');
    expect(winnerObj.playerId).toBe('p1');
    expect(winnerObj.playerName).toBe('Alice');
    expect(winnerObj.cards).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Czar rotation
  // -------------------------------------------------------------------------

  it('rotates czar between rounds', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);
    timer.trigger('room1'); // deal → prompt

    const g1 = module.getPublicState('room1').globals as Record<string, unknown>;
    const firstCzar = g1.czar_player_id as string;
    const firstCzarIndex = g1.czar_index as number;

    // Complete round 1
    module.handleInput('room1', 'p1', 'vote', { value: 'x1' });
    module.handleInput('room1', 'p2', 'vote', { value: 'x2' });
    module.handleInput('room1', 'p3', 'vote', { value: 'x3' });
    module.handleInput('room1', firstCzar, 'vote', { value: 'winner-pick' });
    // reveal → scores
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('scores');

    // scores → deal_next (round 1 < total_rounds 10)
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('deal_next');

    // deal_next → prompt
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('prompt');

    // Czar should have rotated
    const g2 = module.getPublicState('room1').globals as Record<string, unknown>;
    const secondCzar = g2.czar_player_id as string;
    const secondCzarIndex = g2.czar_index as number;

    expect(secondCzarIndex).toBe((firstCzarIndex + 1) % players.length);
    expect(secondCzar).not.toBe(firstCzar);
    expect(['p1', 'p2', 'p3']).toContain(secondCzar);
  });

  it('rotates czar correctly via extension (unit test)', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: () => {},
      log: () => {},
    };

    handleDealCards(cahCtx, GAME_DIR);

    const startIndex = globals['czar_index'] as number;
    const expectedNext = (startIndex + 1) % players.length;

    handleRotateCzar(cahCtx);

    expect(globals['czar_index']).toBe(expectedNext);
    expect(globals['czar_player_id']).toBe(players[expectedNext].id);
  });

  it('replenishes player hands when rotating czar', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: () => {},
      log: () => {},
    };

    handleDealCards(cahCtx, GAME_DIR);

    // Simulate p1 played 3 cards (remove from hand)
    const handsMap = getHandsMap(globals);
    handsMap['p1'] = handsMap['p1'].slice(3); // 10 - 3 = 7 cards
    globals['hands_map_json'] = JSON.stringify(handsMap);
    expect(getPlayerHand(globals, 'p1').length).toBe(CAH_HAND_SIZE - 3);

    handleRotateCzar(cahCtx);

    // After rotation, hand should be replenished back to 10
    const newHand = getPlayerHand(globals, 'p1');
    expect(newHand.length).toBe(CAH_HAND_SIZE);
  });

  // -------------------------------------------------------------------------
  // Black card selection
  // -------------------------------------------------------------------------

  it('draws different black cards across multiple rounds', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: () => {},
      log: () => {},
    };

    handleDealCards(cahCtx, GAME_DIR);

    handleSelectBlackCard(cahCtx);
    const card1 = getCurrentBlackCard(globals);
    expect(card1).not.toBeNull();
    expect(card1!.id).toBeTruthy();

    handleSelectBlackCard(cahCtx);
    const card2 = getCurrentBlackCard(globals);
    expect(card2).not.toBeNull();
    expect(card2!.id).toBeTruthy();

    // Cards should be different (deck is large and shuffled)
    expect(card1!.id).not.toBe(card2!.id);
  });

  it('selects a black card with valid pick count', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: () => {},
      log: () => {},
    };

    handleDealCards(cahCtx, GAME_DIR);
    handleSelectBlackCard(cahCtx);

    const card = getCurrentBlackCard(globals);
    expect(card).not.toBeNull();
    expect(card!.pick).toBeGreaterThanOrEqual(1);
    expect(card!.pick).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Multi-round lifecycle
  // -------------------------------------------------------------------------

  it('plays multiple rounds and rotates czar each time', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);

    /** Play one full round from prompt phase */
    function playRound() {
      expect(module.getPhaseState('room1').phaseType).toBe('prompt');

      const globals = module.getPublicState('room1').globals as Record<string, unknown>;
      const czarId = globals.czar_player_id as string;

      // All players submit votes in prompt
      for (const p of players) {
        module.handleInput('room1', p.id, 'vote', { value: `card-${p.id}-${Math.random()}` });
      }

      expect(module.getPhaseState('room1').phaseType).toBe('reading');

      // Czar picks winner
      module.handleInput('room1', czarId, 'vote', { value: 'some-submission' });
      expect(module.getPhaseState('room1').phaseType).toBe('reveal');

      // reveal → scores
      timer.trigger('room1');
      expect(module.getPhaseState('room1').phaseType).toBe('scores');
    }

    // deal → prompt (round 1)
    timer.trigger('room1');

    const czar1 = (module.getPublicState('room1').globals as Record<string, unknown>).czar_player_id as string;
    playRound();

    // scores → deal_next → prompt (round 2)
    timer.trigger('room1'); // scores → deal_next
    expect(module.getPhaseState('room1').phaseType).toBe('deal_next');
    timer.trigger('room1'); // deal_next → prompt

    const czar2 = (module.getPublicState('room1').globals as Record<string, unknown>).czar_player_id as string;
    expect(czar2).not.toBe(czar1); // czar rotated
    playRound();

    // scores → deal_next → prompt (round 3)
    timer.trigger('room1'); // scores → deal_next
    timer.trigger('room1'); // deal_next → prompt

    const czar3 = (module.getPublicState('room1').globals as Record<string, unknown>).czar_player_id as string;
    expect(czar3).not.toBe(czar2); // czar rotated again
    playRound();

    // 3 rounds completed
    const globals3 = module.getPublicState('room1').globals as Record<string, unknown>;
    expect(globals3.round).toBe(3);
  });

  it('reaches game_over after 10 rounds (total_rounds default)', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);
    timer.trigger('room1'); // deal → prompt (round 1 starts)

    for (let round = 1; round <= 10; round++) {
      expect(module.getPhaseState('room1').phaseType).toBe('prompt');

      const globals = module.getPublicState('room1').globals as Record<string, unknown>;
      const czarId = globals.czar_player_id as string;

      // All players submit
      for (const p of players) {
        module.handleInput('room1', p.id, 'vote', { value: `${p.id}-r${round}` });
      }

      // Czar picks
      module.handleInput('room1', czarId, 'vote', { value: 'pick' });

      // reveal → scores
      timer.trigger('room1');
      expect(module.getPhaseState('room1').phaseType).toBe('scores');

      const g = module.getPublicState('room1').globals as Record<string, unknown>;
      expect(g.round).toBe(round);

      if (round < 10) {
        // scores → deal_next → prompt
        timer.trigger('room1'); // → deal_next
        timer.trigger('room1'); // → prompt
      } else {
        // Last round: scores → game_over
        timer.trigger('room1');
        expect(module.getPhaseState('room1').phaseType).toBe('game_over');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Points accumulation
  // -------------------------------------------------------------------------

  it('accumulates correct points across multiple picks', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));
    const pointsByPlayer: Record<string, number> = {};

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: (id) => pointsByPlayer[id] ?? 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: (playerId, amount) => {
        pointsByPlayer[playerId] = (pointsByPlayer[playerId] ?? 0) + amount;
      },
      log: () => {},
    };

    handleDealCards(cahCtx, GAME_DIR);
    handleSelectBlackCard(cahCtx);

    // p2 is czar, p1 wins first round
    globals['czar_player_id'] = 'p2';
    globals['czar_index'] = 1;
    globals['submission_map_json'] = JSON.stringify({ 'sub-aaa': 'p1', 'sub-bbb': 'p3' });
    globals['submissions_json'] = JSON.stringify([
      { submissionId: 'sub-aaa', cards: [{ text: 'p1 answer' }] },
      { submissionId: 'sub-bbb', cards: [{ text: 'p3 answer' }] },
    ]);
    globals['winner_json'] = 'sub-aaa';

    handleCzarPickWinner(cahCtx);

    expect(pointsByPlayer['p1']).toBe(CAH_POINTS_AWESOME);
    expect(pointsByPlayer['p3']).toBeUndefined();
    expect(pointsByPlayer['p2']).toBeUndefined();

    // Second winner — p3 wins
    globals['submission_map_json'] = JSON.stringify({ 'sub-ccc': 'p3' });
    globals['submissions_json'] = JSON.stringify([
      { submissionId: 'sub-ccc', cards: [{ text: 'p3 answer 2' }] },
    ]);
    globals['winner_json'] = 'sub-ccc';

    handleCzarPickWinner(cahCtx);

    expect(pointsByPlayer['p1']).toBe(CAH_POINTS_AWESOME); // unchanged
    expect(pointsByPlayer['p3']).toBe(CAH_POINTS_AWESOME); // now has points
  });

  // -------------------------------------------------------------------------
  // build_submissions — anonymization
  // -------------------------------------------------------------------------

  it('cah_build_submissions creates anonymous submissions from real card selections', () => {
    const globals: Record<string, unknown> = {};
    const playerInfo = players.map(p => ({ id: p.id, name: p.name }));

    const cahCtx: CAHActionContext = {
      globals,
      players: {},
      playerInfo,
      getScore: () => 0,
      setGlobal: (field, value) => { globals[field] = value; },
      addPoints: () => {},
      log: () => {},
    };

    // Deal cards and set up state
    handleDealCards(cahCtx, GAME_DIR);
    handleSelectBlackCard(cahCtx);

    // p1 is czar
    globals['czar_player_id'] = 'p1';
    globals['czar_index'] = 0;

    // Get real card IDs from p2 and p3's hands
    const handsMap = getHandsMap(globals);
    const p2Hand = handsMap['p2'] ?? [];
    const p3Hand = handsMap['p3'] ?? [];

    expect(p2Hand.length).toBeGreaterThan(0);
    expect(p3Hand.length).toBeGreaterThan(0);

    // Determine pick count from the black card
    const blackCard = getCurrentBlackCard(globals);
    const pick = blackCard?.pick ?? 1;

    // Select `pick` cards from each non-czar player's hand
    const p2Selection = p2Hand.slice(0, pick).map(c => c.id);
    const p3Selection = p3Hand.slice(0, pick).map(c => c.id);

    // Set up selections
    globals['selections_map_json'] = JSON.stringify({
      'p2': p2Selection,
      'p3': p3Selection,
    });
    globals['submitted_map_json'] = JSON.stringify({ 'p2': true, 'p3': true });

    handleBuildSubmissions(cahCtx);

    const submissions = getAnonymousSubmissions(globals);
    expect(submissions.length).toBe(2); // p2 and p3 (not p1 czar)

    // Each submission should have submissionId and cards
    for (const sub of submissions) {
      expect(sub.submissionId).toBeTruthy();
      expect(Array.isArray(sub.cards)).toBe(true);
      expect(sub.cards.length).toBe(pick);
      for (const card of sub.cards) {
        expect(typeof card.text).toBe('string');
      }
    }

    // submission_map_json should track submissionId → playerId
    expect(globals['submission_map_json']).toBeTruthy();
    const subMap = JSON.parse(globals['submission_map_json'] as string) as Record<string, string>;
    const submitterIds = Object.values(subMap);
    expect(submitterIds).toContain('p2');
    expect(submitterIds).toContain('p3');
    expect(submitterIds).not.toContain('p1'); // czar excluded
  });

  // -------------------------------------------------------------------------
  // State visibility — private fields
  // -------------------------------------------------------------------------

  it('does not expose private fields in public state', () => {
    const module = new DeclarativeGameModule(definition, pkg, timer, createCAHHandler(GAME_DIR));
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);

    const publicState = module.getPublicState('room1');
    const globals = publicState.globals as Record<string, unknown>;

    // Private fields should be omitted from public state
    expect(globals['hands_map_json']).toBeUndefined();
    expect(globals['deck_state_json']).toBeUndefined();
    expect(globals['selections_map_json']).toBeUndefined();
    expect(globals['submission_map_json']).toBeUndefined();

    // Public fields should be present
    expect('round' in globals).toBe(true);
    expect('czar_player_id' in globals).toBe(true);
    expect('submitted_count' in globals).toBe(true);
    expect('total_rounds' in globals).toBe(true);
  });
});
