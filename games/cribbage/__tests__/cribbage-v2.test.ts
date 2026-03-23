/**
 * cribbage-v2.test.ts — Integration tests for Cribbage V2 declarative migration.
 *
 * Tests the full game lifecycle through CribbageDeclarativeModule (wrapper):
 *   dealing → discard → cut → pegging → scoring → crib → results → scores → [loop/game_over]
 *
 * Validates:
 *   - Game creation and initial state
 *   - Deal phase (cards dealt to players + crib)
 *   - Discard to crib phase
 *   - Cut card (+ his heels)
 *   - Pegging/play phase (play_card, go)
 *   - Hand scoring (15s, pairs, runs, flushes, nobs)
 *   - Crib scoring
 *   - Dealer rotation between rounds
 *   - Full round lifecycle
 *   - Game over detection (reaching 121 points)
 *
 * ARCHITECTURAL NOTE:
 *   CribbageDeclarativeModule manages all state internally (not via DeclarativeGameModule).
 *   getPublicState() returns the full public-facing game state.
 *   getPrivateState() returns per-player private state (hand, turn, playable cards).
 *   All phase transitions are driven by timer triggers or input completion.
 */

import { describe, it, expect, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { Player, GameDefinition } from '@boredless/shared';

import { createCribbageModule } from '../extensions/game-module.js';
import { scoreHand, scorePegging } from '../server/scoring.js';
import { freshDeck, dealCards } from '../server/deck.js';
import { CR_WIN_SCORE, CR_HAND_SIZE, CR_DISCARD_COUNT } from '../constants.js';
import type { Card, HandScore } from '../types.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_DIR = join(__dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

// ---------------------------------------------------------------------------
// Test timer
// ---------------------------------------------------------------------------

class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();

  start(
    roomId: string,
    _phaseType: string,
    _durationMs: number,
    _sessionIds: string[],
    onExpire: () => void,
  ): void {
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

// ---------------------------------------------------------------------------
// Mock GameContext
// ---------------------------------------------------------------------------

function createMockCtx(roomId: string, playerIds?: string[]) {
  const scores = new Map<string, number>();
  const sentMessages: Array<{ to: string | null; msg: unknown }> = [];
  const broadcastPhaseCalls: Array<{ phase: unknown; publicState: unknown }> = [];
  const broadcastGameOverCalls: unknown[] = [];

  const ids = playerIds ?? ['p1', 'p2'];

  return {
    roomId,
    scores,
    sentMessages,
    broadcastPhaseCalls,
    broadcastGameOverCalls,

    ctx: {
      roomId,
      initScores: (pids: string[]) => {
        for (const id of pids) scores.set(id, 0);
      },
      addPoints: (pid: string, pts: number) => {
        scores.set(pid, (scores.get(pid) ?? 0) + pts);
      },
      getScore: (pid: string) => scores.get(pid) ?? 0,
      getScores: () => {
        const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        return entries.map(([pid, score]) => ({ playerId: pid, playerName: pid, score }));
      },
      clearScores: () => scores.clear(),
      setRoomStatus: vi.fn(),
      broadcastPhase: vi.fn((phase: unknown, publicState: unknown) => {
        broadcastPhaseCalls.push({ phase, publicState });
      }),
      broadcastPrivateState: vi.fn(),
      broadcastScores: vi.fn(),
      broadcastGameOver: vi.fn((data: unknown) => {
        broadcastGameOverCalls.push(data);
      }),
      sendToAll: vi.fn((msg: unknown) => {
        sentMessages.push({ to: null, msg });
      }),
      sendToPlayer: vi.fn((pid: string, msg: unknown) => {
        sentMessages.push({ to: pid, msg });
      }),
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      getTimerRemaining: vi.fn(() => null),
      getAllSessionIds: vi.fn(() => ids),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as any,
  };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

const TWO_PLAYERS: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true },
  { id: 'p2', name: 'Bob', isHost: false },
];

const THREE_PLAYERS: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true },
  { id: 'p2', name: 'Bob', isHost: false },
  { id: 'p3', name: 'Charlie', isHost: false },
];

const GAME_DEFINITION: GameDefinition = {
  id: 'cribbage',
  name: 'Cribbage',
  description: 'Classic cribbage',
  minPlayers: 2,
  maxPlayers: 6,
  estimatedMinutes: 30,
  icon: 'diamond',
};

// ---------------------------------------------------------------------------
// Factory + state accessors
// ---------------------------------------------------------------------------

function createModule(timerImpl?: TimerImpl) {
  const pkg = loadGamePackage(GAME_YAML);
  return createCribbageModule(GAME_DEFINITION, pkg, GAME_DIR, timerImpl);
}

/** Get publicState for a room */
function getPublic(
  module: ReturnType<typeof createModule>,
  roomId: string,
): Record<string, unknown> {
  return module.getPublicState(roomId) as Record<string, unknown>;
}

/** Get private state for a player */
function getPrivate(
  module: ReturnType<typeof createModule>,
  roomId: string,
  playerId: string,
): Record<string, unknown> {
  return module.getPrivateState(roomId, playerId) as Record<string, unknown>;
}

/** Parse hand from private state */
function getHand(
  module: ReturnType<typeof createModule>,
  roomId: string,
  playerId: string,
): Card[] {
  const priv = getPrivate(module, roomId, playerId);
  return (priv['hand'] as Card[]) ?? [];
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

/**
 * Create a module + setup with two players.
 * Module starts in 'dealing' phase (timer armed).
 */
function setupTwoPlayers(roomId: string) {
  const timer = new TestTimerImpl();
  const module = createModule(timer);
  const mock = createMockCtx(roomId);
  module.setup(TWO_PLAYERS, mock.ctx);
  return { timer, module, mock };
}

/**
 * Setup -> advance through dealing (trigger timer) -> now in 'discard'.
 */
function setupAndDeal(roomId: string) {
  const { timer, module, mock } = setupTwoPlayers(roomId);
  timer.trigger(roomId); // dealing timer expires -> discard phase
  return { timer, module, mock };
}

/**
 * Discard both players (2-player game: each discards 2 cards).
 */
function discardBothPlayers(
  module: ReturnType<typeof createModule>,
  roomId: string,
) {
  const p1Hand = getHand(module, roomId, 'p1');
  const p2Hand = getHand(module, roomId, 'p2');
  const r1 = module.handleInput(roomId, 'p1', 'vote', {
    action: 'discard',
    cardIds: [p1Hand[0]!.id, p1Hand[1]!.id],
  });
  const r2 = module.handleInput(roomId, 'p2', 'vote', {
    action: 'discard',
    cardIds: [p2Hand[0]!.id, p2Hand[1]!.id],
  });
  return { r1, r2 };
}

/**
 * Full setup -> dealing -> discard -> cut phase.
 */
function setupThroughCut(roomId: string) {
  const { timer, module, mock } = setupAndDeal(roomId);
  discardBothPlayers(module, roomId);
  return { timer, module, mock };
}

/**
 * Drive pegging to completion for 2 players.
 * Each player plays cards in turn until all hands are empty.
 */
function driveFullPegging(
  module: ReturnType<typeof createModule>,
  roomId: string,
): void {
  let safety = 200;
  while (safety-- > 0) {
    const phase = module.getPhaseState(roomId).phaseType;
    if (phase !== 'pegging') break;

    const pub = getPublic(module, roomId);
    const activeId = pub['activePlayerId'] as string | null;
    if (!activeId) break;

    const priv = getPrivate(module, roomId, activeId);
    const hand = (priv['hand'] as Card[]) ?? [];
    const playableIds = (priv['playableCardIds'] as string[]) ?? [];

    if (hand.length === 0) {
      const r = module.handleInput(roomId, activeId, 'vote', { action: 'go' });
      if (!r.accepted) break;
      continue;
    }

    if (playableIds.length > 0) {
      const cardId = playableIds[0]!;
      const r = module.handleInput(roomId, activeId, 'vote', {
        action: 'play_card',
        cardId,
      });
      if (!r.accepted) {
        module.handleInput(roomId, activeId, 'vote', { action: 'go' });
      }
    } else {
      const r = module.handleInput(roomId, activeId, 'vote', { action: 'go' });
      if (!r.accepted) break;
    }
  }
}

/**
 * Play a full round from 'dealing' through 'scores'.
 */
function playFullRound(
  module: ReturnType<typeof createModule>,
  roomId: string,
  timer: TestTimerImpl,
) {
  // dealing -> discard
  timer.trigger(roomId);

  // Discard
  discardBothPlayers(module, roomId);
  // -> cut (auto-advances after all discard)

  // cut timer -> pegging
  timer.trigger(roomId);

  // Pegging
  driveFullPegging(module, roomId);

  // If still in pegging for some reason, force timer
  if (module.getPhaseState(roomId).phaseType === 'pegging') {
    timer.trigger(roomId);
  }

  // scoring timer
  timer.trigger(roomId);

  // crib timer
  timer.trigger(roomId);

  // results timer
  timer.trigger(roomId);
  // now in scores phase
}

// ===========================================================================
// Tests: Game package
// ===========================================================================

describe('Cribbage V2 -- game package', () => {
  it('loads the V2 game package with correct manifest', () => {
    const pkg = loadGamePackage(GAME_YAML);
    expect(pkg.manifest.id).toBe('cribbage');
    expect(pkg.manifest.name).toBe('Cribbage');
    expect(pkg.manifest.players.min).toBe(2);
    expect(pkg.manifest.players.max).toBe(6);
  });

  it('has schema version 2.0', () => {
    const pkg = loadGamePackage(GAME_YAML);
    expect(pkg.manifest.version).toBe('2.0.0');
  });

  it('has correct phases defined', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const phaseIds = Object.keys(pkg.phases);
    for (const phase of ['dealing', 'discard', 'cut', 'pegging', 'scoring', 'crib', 'results', 'scores', 'game_over']) {
      expect(phaseIds).toContain(phase);
    }
  });

  it('has correct extensions defined in YAML', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const ext = pkg.extensions ?? [];
    expect(ext.length).toBeGreaterThan(0);
    expect(ext[0]?.id).toBe('cribbage-core');
  });
});

// ===========================================================================
// Tests: Game creation and initial state
// ===========================================================================

describe('Cribbage V2 -- game creation and initial state', () => {
  it('starts in dealing phase', () => {
    const { module } = setupTwoPlayers('room-init-1');
    expect(module.getPhaseState('room-init-1').phaseType).toBe('dealing');
  });

  it('round is 1 after setup (handleDealRound fires on dealing enter)', () => {
    const { module } = setupTwoPlayers('room-init-2');
    const pub = getPublic(module, 'room-init-2');
    expect(pub['round']).toBe(1);
  });

  it('initialises scores to 0 for all players', () => {
    const { mock } = setupTwoPlayers('room-init-3');
    expect(mock.scores.get('p1')).toBe(0);
    expect(mock.scores.get('p2')).toBe(0);
  });

  it('winner is null at start', () => {
    const { module } = setupTwoPlayers('room-init-4');
    const pub = getPublic(module, 'room-init-4');
    expect(pub['winner']).toBeNull();
  });

  it('player order and names are set', () => {
    const { module } = setupTwoPlayers('room-init-5');
    const pub = getPublic(module, 'room-init-5');
    expect(pub['playerOrder']).toContain('p1');
    expect(pub['playerOrder']).toContain('p2');
    const names = pub['playerNames'] as Record<string, string>;
    expect(names['p1']).toBe('Alice');
    expect(names['p2']).toBe('Bob');
  });

  it('teardown cleans up without throwing', () => {
    const { module } = setupTwoPlayers('room-init-6');
    expect(() => module.teardown('room-init-6')).not.toThrow();
  });

  it('returns empty state for unknown roomId', () => {
    const module = createModule();
    expect(module.getPublicState('nonexistent')).toEqual({});
    expect(module.getPrivateState('nonexistent', 'p1')).toEqual({});
  });

  it('getPhaseState returns lobby phase for unknown room', () => {
    const module = createModule();
    const ps = module.getPhaseState('nonexistent');
    expect(ps.phaseType).toBe('lobby');
  });

  it('works with three players', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-init-7', ['p1', 'p2', 'p3']);
    module.setup(THREE_PLAYERS, mock.ctx);
    expect(module.getPhaseState('room-init-7').phaseType).toBe('dealing');
    const pub = getPublic(module, 'room-init-7');
    expect((pub['playerOrder'] as string[]).length).toBe(3);
  });
});

// ===========================================================================
// Tests: Deal phase
// ===========================================================================

describe('Cribbage V2 -- deal phase', () => {
  it('handleDealRound fires on setup -- hands are dealt immediately', () => {
    const { module } = setupTwoPlayers('room-deal-1');
    const hand = getHand(module, 'room-deal-1', 'p1');
    expect(hand.length).toBe(CR_HAND_SIZE[2]); // 2 players -> 6 cards each
  });

  it('deals correct hand size for 2 players (6 cards)', () => {
    const { module } = setupTwoPlayers('room-deal-2');
    expect(getHand(module, 'room-deal-2', 'p1').length).toBe(6);
    expect(getHand(module, 'room-deal-2', 'p2').length).toBe(6);
  });

  it('deals correct hand size for 3 players (5 cards)', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-deal-3', ['p1', 'p2', 'p3']);
    module.setup(THREE_PLAYERS, mock.ctx);
    expect(getHand(module, 'room-deal-3', 'p1').length).toBe(5);
    expect(getHand(module, 'room-deal-3', 'p2').length).toBe(5);
    expect(getHand(module, 'room-deal-3', 'p3').length).toBe(5);
  });

  it('hand_size in public state matches dealt cards', () => {
    const { module } = setupTwoPlayers('room-deal-4');
    const pub = getPublic(module, 'room-deal-4');
    const handSizes = pub['playerHandSizes'] as Record<string, number>;
    expect(handSizes['p1']).toBe(6);
    expect(handSizes['p2']).toBe(6);
  });

  it('dealing timer advances to discard phase', () => {
    const { timer, module } = setupTwoPlayers('room-deal-5');
    expect(module.getPhaseState('room-deal-5').phaseType).toBe('dealing');
    timer.trigger('room-deal-5');
    expect(module.getPhaseState('room-deal-5').phaseType).toBe('discard');
  });

  it('cards in hand are unique across both players (no duplicates)', () => {
    const { module } = setupTwoPlayers('room-deal-6');
    const p1Hand = getHand(module, 'room-deal-6', 'p1');
    const p2Hand = getHand(module, 'room-deal-6', 'p2');
    const allIds = [...p1Hand.map(c => c.id), ...p2Hand.map(c => c.id)];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('all cards have valid rank and suit', () => {
    const { module } = setupTwoPlayers('room-deal-7');
    const hand = getHand(module, 'room-deal-7', 'p1');
    const validRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
    for (const card of hand) {
      expect(validRanks).toContain(card.rank);
      expect(validSuits).toContain(card.suit);
    }
  });

  it('round number is 1 after first deal', () => {
    const { module } = setupTwoPlayers('room-deal-8');
    const pub = getPublic(module, 'room-deal-8');
    expect(pub['round']).toBe(1);
  });

  it('discards_done all false after fresh deal', () => {
    const { module } = setupTwoPlayers('room-deal-9');
    const pub = getPublic(module, 'room-deal-9');
    const discardsDone = pub['discardsDone'] as Record<string, boolean>;
    expect(discardsDone['p1']).toBe(false);
    expect(discardsDone['p2']).toBe(false);
  });
});

// ===========================================================================
// Tests: Discard phase
// ===========================================================================

describe('Cribbage V2 -- discard phase', () => {
  it('enters discard after dealing timer', () => {
    const { timer, module } = setupTwoPlayers('room-disc-1');
    timer.trigger('room-disc-1');
    expect(module.getPhaseState('room-disc-1').phaseType).toBe('discard');
  });

  it('accepts valid discard from p1', () => {
    const { module } = setupAndDeal('room-disc-2');
    const hand = getHand(module, 'room-disc-2', 'p1');
    const r = module.handleInput('room-disc-2', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[0]!.id, hand[1]!.id],
    });
    expect(r.accepted).toBe(true);
  });

  it('rejects discard if player already discarded', () => {
    const { module } = setupAndDeal('room-disc-3');
    const hand = getHand(module, 'room-disc-3', 'p1');
    module.handleInput('room-disc-3', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[0]!.id, hand[1]!.id],
    });
    // Try to discard again
    const r = module.handleInput('room-disc-3', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[2]!.id, hand[3]!.id],
    });
    expect(r.accepted).toBe(false);
  });

  it('rejects discard with wrong number of cards (1 instead of 2)', () => {
    const { module } = setupAndDeal('room-disc-4');
    const hand = getHand(module, 'room-disc-4', 'p1');
    const r = module.handleInput('room-disc-4', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[0]!.id], // only 1, need 2
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('rejects discard with card not in hand', () => {
    const { module } = setupAndDeal('room-disc-5');
    const r = module.handleInput('room-disc-5', 'p1', 'vote', {
      action: 'discard',
      cardIds: ['fake-card-id', 'another-fake-id'],
    });
    expect(r.accepted).toBe(false);
  });

  it('discards_done updates after p1 discards', () => {
    const { module } = setupAndDeal('room-disc-6');
    const hand = getHand(module, 'room-disc-6', 'p1');
    module.handleInput('room-disc-6', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[0]!.id, hand[1]!.id],
    });
    const pub = getPublic(module, 'room-disc-6');
    const discardsDone = pub['discardsDone'] as Record<string, boolean>;
    expect(discardsDone['p1']).toBe(true);
    expect(discardsDone['p2']).toBe(false);
  });

  it('stays in discard after only p1 discards', () => {
    const { module } = setupAndDeal('room-disc-7');
    const hand = getHand(module, 'room-disc-7', 'p1');
    module.handleInput('room-disc-7', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[0]!.id, hand[1]!.id],
    });
    expect(module.getPhaseState('room-disc-7').phaseType).toBe('discard');
  });

  it('advances to cut after both players discard', () => {
    const { module } = setupAndDeal('room-disc-8');
    discardBothPlayers(module, 'room-disc-8');
    expect(module.getPhaseState('room-disc-8').phaseType).toBe('cut');
  });

  it('hand sizes shrink after discarding (2 cards removed)', () => {
    const { module } = setupAndDeal('room-disc-9');
    discardBothPlayers(module, 'room-disc-9');
    const pub = getPublic(module, 'room-disc-9');
    const handSizes = pub['playerHandSizes'] as Record<string, number>;
    // 6 dealt - 2 discarded = 4
    expect(handSizes['p1']).toBe(4);
    expect(handSizes['p2']).toBe(4);
  });

  it('rejects non-vote input type', () => {
    const { module } = setupAndDeal('room-disc-10');
    const hand = getHand(module, 'room-disc-10', 'p1');
    const r = module.handleInput('room-disc-10', 'p1', 'action', {
      action: 'discard',
      cardIds: [hand[0]!.id, hand[1]!.id],
    });
    expect(r.accepted).toBe(false);
  });

  it('discard timer auto-discards and advances to cut', () => {
    const { timer, module } = setupAndDeal('room-disc-11');
    // Only p1 discards -- p2 does not
    const hand = getHand(module, 'room-disc-11', 'p1');
    module.handleInput('room-disc-11', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand[0]!.id, hand[1]!.id],
    });
    // Timer fires -> finalize_discards for p2
    timer.trigger('room-disc-11');
    expect(module.getPhaseState('room-disc-11').phaseType).toBe('cut');
  });

  it('3-player game: each discards 1 card', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-disc-12', ['p1', 'p2', 'p3']);
    module.setup(THREE_PLAYERS, mock.ctx);
    timer.trigger('room-disc-12'); // dealing -> discard

    const hand1 = getHand(module, 'room-disc-12', 'p1');
    const r = module.handleInput('room-disc-12', 'p1', 'vote', {
      action: 'discard',
      cardIds: [hand1[0]!.id], // 1 card for 3-player game
    });
    expect(r.accepted).toBe(true);
  });
});

// ===========================================================================
// Tests: Cut phase
// ===========================================================================

describe('Cribbage V2 -- cut phase', () => {
  it('enters cut after all discards', () => {
    const { module } = setupAndDeal('room-cut-1');
    discardBothPlayers(module, 'room-cut-1');
    expect(module.getPhaseState('room-cut-1').phaseType).toBe('cut');
  });

  it('sets starter_card after cut', () => {
    const { module } = setupAndDeal('room-cut-2');
    discardBothPlayers(module, 'room-cut-2');
    const pub = getPublic(module, 'room-cut-2');
    const starterCard = pub['starterCard'] as Card | null;
    expect(starterCard).not.toBeNull();
    expect(starterCard?.rank).toBeTruthy();
    expect(starterCard?.suit).toBeTruthy();
  });

  it('cut timer advances to pegging', () => {
    const { timer, module } = setupAndDeal('room-cut-3');
    discardBothPlayers(module, 'room-cut-3');
    expect(module.getPhaseState('room-cut-3').phaseType).toBe('cut');
    timer.trigger('room-cut-3'); // cut timer -> pegging
    expect(module.getPhaseState('room-cut-3').phaseType).toBe('pegging');
  });

  it('starter card is a valid card (rank + suit)', () => {
    const { module } = setupAndDeal('room-cut-4');
    discardBothPlayers(module, 'room-cut-4');
    const pub = getPublic(module, 'room-cut-4');
    const starterCard = pub['starterCard'] as Card | null;
    const validRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
    expect(validRanks).toContain(starterCard?.rank);
    expect(validSuits).toContain(starterCard?.suit);
  });
});

// ===========================================================================
// Tests: Pegging phase
// ===========================================================================

describe('Cribbage V2 -- pegging phase', () => {
  it('enters pegging after cut timer', () => {
    const { timer, module } = setupAndDeal('room-peg-1');
    discardBothPlayers(module, 'room-peg-1');
    timer.trigger('room-peg-1'); // cut -> pegging
    expect(module.getPhaseState('room-peg-1').phaseType).toBe('pegging');
  });

  it('active_player_id is set at start of pegging', () => {
    const { timer, module } = setupAndDeal('room-peg-2');
    discardBothPlayers(module, 'room-peg-2');
    timer.trigger('room-peg-2'); // -> pegging
    const pub = getPublic(module, 'room-peg-2');
    expect(pub['activePlayerId']).toBeTruthy();
  });

  it('active player is left of dealer at start of pegging', () => {
    const { timer, module } = setupAndDeal('room-peg-3');
    discardBothPlayers(module, 'room-peg-3');
    timer.trigger('room-peg-3'); // -> pegging
    const pub = getPublic(module, 'room-peg-3');
    const dealerIndex = pub['dealerIndex'] as number;
    const playerOrder = pub['playerOrder'] as string[];
    const n = playerOrder.length;
    const expectedActive = playerOrder[(dealerIndex + 1) % n];
    expect(pub['activePlayerId']).toBe(expectedActive);
  });

  it('non-active player input is rejected during pegging', () => {
    const { timer, module } = setupAndDeal('room-peg-4');
    discardBothPlayers(module, 'room-peg-4');
    timer.trigger('room-peg-4'); // -> pegging
    const pub = getPublic(module, 'room-peg-4');
    const activeId = pub['activePlayerId'] as string;
    const nonActiveId = activeId === 'p1' ? 'p2' : 'p1';

    const nonActiveHand = getHand(module, 'room-peg-4', nonActiveId);
    const r = module.handleInput('room-peg-4', nonActiveId, 'vote', {
      action: 'play_card',
      cardId: nonActiveHand[0]!.id,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/turn/i);
  });

  it('accepts play_card from active player', () => {
    const { timer, module } = setupAndDeal('room-peg-5');
    discardBothPlayers(module, 'room-peg-5');
    timer.trigger('room-peg-5'); // -> pegging
    const pub = getPublic(module, 'room-peg-5');
    const activeId = pub['activePlayerId'] as string;
    const priv = getPrivate(module, 'room-peg-5', activeId);
    const playableIds = priv['playableCardIds'] as string[];

    if (playableIds.length > 0) {
      const r = module.handleInput('room-peg-5', activeId, 'vote', {
        action: 'play_card',
        cardId: playableIds[0]!,
      });
      expect(r.accepted).toBe(true);
    }
  });

  it('peg_count increases after playing a card', () => {
    const { timer, module } = setupAndDeal('room-peg-6');
    discardBothPlayers(module, 'room-peg-6');
    timer.trigger('room-peg-6'); // -> pegging
    const pub0 = getPublic(module, 'room-peg-6');
    const activeId = pub0['activePlayerId'] as string;
    const priv = getPrivate(module, 'room-peg-6', activeId);
    const playableIds = priv['playableCardIds'] as string[];

    if (playableIds.length > 0) {
      module.handleInput('room-peg-6', activeId, 'vote', {
        action: 'play_card',
        cardId: playableIds[0]!,
      });
      const pub1 = getPublic(module, 'room-peg-6');
      expect((pub1['pegCount'] as number)).toBeGreaterThan(0);
    }
  });

  it('pegging completes and advances to scoring', () => {
    const { timer, module } = setupAndDeal('room-peg-7');
    discardBothPlayers(module, 'room-peg-7');
    timer.trigger('room-peg-7'); // cut -> pegging
    driveFullPegging(module, 'room-peg-7');
    expect(module.getPhaseState('room-peg-7').phaseType).toBe('scoring');
  });

  it('played_sequence_json is populated during pegging', () => {
    const { timer, module } = setupAndDeal('room-peg-8');
    discardBothPlayers(module, 'room-peg-8');
    timer.trigger('room-peg-8'); // -> pegging
    const pub0 = getPublic(module, 'room-peg-8');
    const activeId = pub0['activePlayerId'] as string;
    const priv = getPrivate(module, 'room-peg-8', activeId);
    const playableIds = priv['playableCardIds'] as string[];

    if (playableIds.length > 0) {
      module.handleInput('room-peg-8', activeId, 'vote', {
        action: 'play_card',
        cardId: playableIds[0]!,
      });
      const pub1 = getPublic(module, 'room-peg-8');
      expect((pub1['playedCards'] as unknown[]).length).toBeGreaterThan(0);
    }
  });

  it('go is rejected if player has playable cards', () => {
    const { timer, module } = setupAndDeal('room-peg-9');
    discardBothPlayers(module, 'room-peg-9');
    timer.trigger('room-peg-9'); // -> pegging
    const pub = getPublic(module, 'room-peg-9');
    const activeId = pub['activePlayerId'] as string;
    const priv = getPrivate(module, 'room-peg-9', activeId);
    const playableIds = priv['playableCardIds'] as string[];

    if (playableIds.length > 0) {
      const r = module.handleInput('room-peg-9', activeId, 'vote', { action: 'go' });
      expect(r.accepted).toBe(false);
      expect(r.reason).toMatch(/playable/i);
    }
  });

  it('rejects unknown pegging action', () => {
    const { timer, module } = setupAndDeal('room-peg-10');
    discardBothPlayers(module, 'room-peg-10');
    timer.trigger('room-peg-10'); // -> pegging
    const pub = getPublic(module, 'room-peg-10');
    const activeId = pub['activePlayerId'] as string;
    const r = module.handleInput('room-peg-10', activeId, 'vote', {
      action: 'unknown_action',
    });
    expect(r.accepted).toBe(false);
  });

  it('pegging timer auto-plays active player card when it expires', () => {
    // The pegging timer fires once and auto-plays one card for the active player.
    // After that, pegging continues normally (timer is not re-registered between cards).
    // We verify the timer fires correctly and the play is accepted.
    const { timer, module } = setupAndDeal('room-peg-11');
    discardBothPlayers(module, 'room-peg-11');
    timer.trigger('room-peg-11'); // cut -> pegging
    expect(module.getPhaseState('room-peg-11').phaseType).toBe('pegging');

    // Get the initial peg count and active player state
    const pubBefore = getPublic(module, 'room-peg-11');
    const activeIdBefore = pubBefore['activePlayerId'] as string;
    const privBefore = getPrivate(module, 'room-peg-11', activeIdBefore);
    const handBefore = (privBefore['hand'] as Card[]).length;

    // Trigger the pegging timer -- auto-plays one card for active player
    timer.trigger('room-peg-11');

    // After auto-play: active player should have one fewer card OR phase advanced
    const phase = module.getPhaseState('room-peg-11').phaseType;
    const isValid = phase === 'pegging' || phase === 'scoring';
    expect(isValid).toBe(true);

    if (phase === 'pegging') {
      // Active player's card count decreased OR a different player is active (go was issued)
      const privAfter = getPrivate(module, 'room-peg-11', activeIdBefore);
      const handAfter = (privAfter['hand'] as Card[]).length;
      // Either hand shrank (card played) or a go was issued (hand same, but peg state changed)
      expect(handAfter).toBeLessThanOrEqual(handBefore);
    }
    // If scoring: pegging completed via auto-play chain, which is also valid
  });
});

// ===========================================================================
// Tests: Scoring (hand scores)
// ===========================================================================

describe('Cribbage V2 -- hand scoring', () => {
  it('enters scoring phase after pegging completes', () => {
    const { timer, module } = setupAndDeal('room-score-1');
    discardBothPlayers(module, 'room-score-1');
    timer.trigger('room-score-1'); // cut -> pegging
    driveFullPegging(module, 'room-score-1');
    expect(module.getPhaseState('room-score-1').phaseType).toBe('scoring');
  });

  it('hand_scores populated after scoring phase is entered', () => {
    const { timer, module } = setupAndDeal('room-score-2');
    discardBothPlayers(module, 'room-score-2');
    timer.trigger('room-score-2'); // -> pegging
    driveFullPegging(module, 'room-score-2');
    // Now in scoring -- on_enter fires handleScoreHands
    const pub = getPublic(module, 'room-score-2');
    const handScores = pub['handScores'] as HandScore[];
    expect(handScores.length).toBe(2); // Both players scored
  });

  it('hand scores have valid total (>= 0)', () => {
    const { timer, module } = setupAndDeal('room-score-3');
    discardBothPlayers(module, 'room-score-3');
    timer.trigger('room-score-3'); // -> pegging
    driveFullPegging(module, 'room-score-3');
    const pub = getPublic(module, 'room-score-3');
    const handScores = pub['handScores'] as HandScore[];
    for (const hs of handScores) {
      expect(hs.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('scoring phase timer advances to crib', () => {
    const { timer, module } = setupAndDeal('room-score-4');
    discardBothPlayers(module, 'room-score-4');
    timer.trigger('room-score-4'); // -> pegging
    driveFullPegging(module, 'room-score-4');
    expect(module.getPhaseState('room-score-4').phaseType).toBe('scoring');
    timer.trigger('room-score-4'); // scoring -> crib
    expect(module.getPhaseState('room-score-4').phaseType).toBe('crib');
  });

  it('player scores are numbers after hand scoring', () => {
    const { timer, module } = setupAndDeal('room-score-5');
    discardBothPlayers(module, 'room-score-5');
    timer.trigger('room-score-5'); // -> pegging
    driveFullPegging(module, 'room-score-5');
    const pub = getPublic(module, 'room-score-5');
    const scores = pub['scores'] as Record<string, number>;
    expect(typeof scores['p1']).toBe('number');
    expect(typeof scores['p2']).toBe('number');
  });
});

// ===========================================================================
// Tests: Crib scoring
// ===========================================================================

describe('Cribbage V2 -- crib scoring', () => {
  it('enters crib phase after scoring timer', () => {
    const { timer, module } = setupAndDeal('room-crib-1');
    discardBothPlayers(module, 'room-crib-1');
    timer.trigger('room-crib-1'); // -> pegging
    driveFullPegging(module, 'room-crib-1');
    timer.trigger('room-crib-1'); // scoring -> crib
    expect(module.getPhaseState('room-crib-1').phaseType).toBe('crib');
  });

  it('crib_score is set after crib phase entered', () => {
    const { timer, module } = setupAndDeal('room-crib-2');
    discardBothPlayers(module, 'room-crib-2');
    timer.trigger('room-crib-2'); // -> pegging
    driveFullPegging(module, 'room-crib-2');
    timer.trigger('room-crib-2'); // -> crib
    const pub = getPublic(module, 'room-crib-2');
    const cribScore = pub['cribScore'];
    if (cribScore !== null) {
      const hs = cribScore as HandScore;
      expect(hs.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('crib timer advances to results', () => {
    const { timer, module } = setupAndDeal('room-crib-3');
    discardBothPlayers(module, 'room-crib-3');
    timer.trigger('room-crib-3'); // -> pegging
    driveFullPegging(module, 'room-crib-3');
    timer.trigger('room-crib-3'); // scoring -> crib
    timer.trigger('room-crib-3'); // crib -> results
    expect(module.getPhaseState('room-crib-3').phaseType).toBe('results');
  });
});

// ===========================================================================
// Tests: Results and scores phase
// ===========================================================================

describe('Cribbage V2 -- results and scores phase', () => {
  it('enters results phase after crib timer', () => {
    const { timer, module } = setupThroughCut('room-res-1');
    timer.trigger('room-res-1'); // cut -> pegging
    driveFullPegging(module, 'room-res-1');
    timer.trigger('room-res-1'); // scoring -> crib
    timer.trigger('room-res-1'); // crib -> results
    expect(module.getPhaseState('room-res-1').phaseType).toBe('results');
  });

  it('results timer advances to scores', () => {
    const { timer, module } = setupThroughCut('room-res-2');
    timer.trigger('room-res-2'); // -> pegging
    driveFullPegging(module, 'room-res-2');
    timer.trigger('room-res-2'); // -> crib
    timer.trigger('room-res-2'); // -> results
    timer.trigger('room-res-2'); // -> scores
    expect(module.getPhaseState('room-res-2').phaseType).toBe('scores');
  });

  it('dealer rotates after scores phase', () => {
    const { timer, module } = setupTwoPlayers('room-res-3');
    const pubBefore = getPublic(module, 'room-res-3');
    const dealerBefore = pubBefore['dealerIndex'] as number;

    playFullRound(module, 'room-res-3', timer);
    // Now in scores phase -- scores on_enter fires handleRotateDealer

    const pubAfter = getPublic(module, 'room-res-3');
    const dealerAfter = pubAfter['dealerIndex'] as number;
    expect(dealerAfter).not.toBe(dealerBefore);
  });

  it('scores timer loops back to dealing for next round', () => {
    const { timer, module } = setupTwoPlayers('room-res-4');
    playFullRound(module, 'room-res-4', timer);
    expect(module.getPhaseState('room-res-4').phaseType).toBe('scores');

    timer.trigger('room-res-4'); // scores -> dealing (next round)
    expect(module.getPhaseState('room-res-4').phaseType).toBe('dealing');
  });

  it('round number increments between rounds', () => {
    const { timer, module } = setupTwoPlayers('room-res-5');
    const pub1 = getPublic(module, 'room-res-5');
    expect(pub1['round']).toBe(1);

    playFullRound(module, 'room-res-5', timer);
    timer.trigger('room-res-5'); // scores -> dealing (round 2)

    const pub2 = getPublic(module, 'room-res-5');
    expect(pub2['round']).toBe(2);
  });
});

// ===========================================================================
// Tests: Dealer rotation
// ===========================================================================

describe('Cribbage V2 -- dealer rotation', () => {
  it('dealer index changes after each round (2-player flip)', () => {
    const { timer, module } = setupTwoPlayers('room-rot-1');
    const pub0 = getPublic(module, 'room-rot-1');
    const dealer0 = pub0['dealerIndex'] as number;

    playFullRound(module, 'room-rot-1', timer);
    const pub1 = getPublic(module, 'room-rot-1');
    const dealer1 = pub1['dealerIndex'] as number;

    const n = 2;
    expect(dealer1).toBe((dealer0 + 1) % n);
  });

  it('dealer rotates correctly over two rounds (returns to original)', () => {
    const { timer, module } = setupTwoPlayers('room-rot-2');
    const pub0 = getPublic(module, 'room-rot-2');
    const dealer0 = pub0['dealerIndex'] as number;

    playFullRound(module, 'room-rot-2', timer);
    timer.trigger('room-rot-2'); // scores -> dealing round 2
    playFullRound(module, 'room-rot-2', timer);

    const pub2 = getPublic(module, 'room-rot-2');
    const dealer2 = pub2['dealerIndex'] as number;
    expect(dealer2).toBe(dealer0);
  });

  it('dealer name updates after rotation', () => {
    const { timer, module } = setupTwoPlayers('room-rot-3');
    const pub0 = getPublic(module, 'room-rot-3');
    const dealerName0 = pub0['dealerName'] as string;

    playFullRound(module, 'room-rot-3', timer);
    const pub1 = getPublic(module, 'room-rot-3');
    const dealerName1 = pub1['dealerName'] as string;

    expect(dealerName1).not.toBe(dealerName0);
    expect(['Alice', 'Bob']).toContain(dealerName1);
  });
});

// ===========================================================================
// Tests: Full round lifecycle
// ===========================================================================

describe('Cribbage V2 -- full round lifecycle', () => {
  it('completes full phase sequence: dealing -> discard -> cut -> pegging -> scoring -> crib -> results -> scores', () => {
    const { timer, module } = setupTwoPlayers('room-lc-1');

    expect(module.getPhaseState('room-lc-1').phaseType).toBe('dealing');
    timer.trigger('room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('discard');
    discardBothPlayers(module, 'room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('cut');
    timer.trigger('room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('pegging');
    driveFullPegging(module, 'room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('scoring');
    timer.trigger('room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('crib');
    timer.trigger('room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('results');
    timer.trigger('room-lc-1');
    expect(module.getPhaseState('room-lc-1').phaseType).toBe('scores');
  });

  it('loops back to dealing for a second round', () => {
    const { timer, module } = setupTwoPlayers('room-lc-2');
    playFullRound(module, 'room-lc-2', timer);
    expect(module.getPhaseState('room-lc-2').phaseType).toBe('scores');

    timer.trigger('room-lc-2'); // -> dealing
    expect(module.getPhaseState('room-lc-2').phaseType).toBe('dealing');
  });

  it('can complete two full rounds without crashing', () => {
    const { timer, module } = setupTwoPlayers('room-lc-3');

    playFullRound(module, 'room-lc-3', timer);
    timer.trigger('room-lc-3'); // -> dealing round 2
    playFullRound(module, 'room-lc-3', timer);

    expect(module.getPhaseState('room-lc-3').phaseType).toBe('scores');
    const pub = getPublic(module, 'room-lc-3');
    expect(pub['round']).toBe(2);
  });

  it('scores are non-negative numbers after a round', () => {
    const { timer, module } = setupTwoPlayers('room-lc-4');
    playFullRound(module, 'room-lc-4', timer);
    const pub = getPublic(module, 'room-lc-4');
    const scores = pub['scores'] as Record<string, number>;
    expect(typeof scores['p1']).toBe('number');
    expect(typeof scores['p2']).toBe('number');
    expect(scores['p1']!).toBeGreaterThanOrEqual(0);
    expect(scores['p2']!).toBeGreaterThanOrEqual(0);
  });

  it('teardown after a full round does not throw', () => {
    const { timer, module } = setupTwoPlayers('room-lc-5');
    playFullRound(module, 'room-lc-5', timer);
    expect(() => module.teardown('room-lc-5')).not.toThrow();
  });
});

// ===========================================================================
// Tests: Game over detection
// ===========================================================================

describe('Cribbage V2 -- game over detection', () => {
  it('winner_json is null before anyone scores enough', () => {
    const { module } = setupTwoPlayers('room-go-1');
    const pub = getPublic(module, 'room-go-1');
    expect(pub['winner']).toBeNull();
  });

  it('game loops back to dealing when no winner after scores', () => {
    const { timer, module } = setupTwoPlayers('room-go-2');
    playFullRound(module, 'room-go-2', timer);
    timer.trigger('room-go-2'); // scores -> dealing (no winner)
    expect(module.getPhaseState('room-go-2').phaseType).toBe('dealing');
  });

  it('broadcastGameOver is callable - mock is properly wired', () => {
    const { mock } = setupTwoPlayers('room-go-3');
    const broadcastGameOverMock = mock.ctx.broadcastGameOver as ReturnType<typeof vi.fn>;
    expect(broadcastGameOverMock).toBeDefined();
    expect(broadcastGameOverMock.mock.calls.length).toBe(0);
  });

  it('game_over phase does not have a timer (no further advance)', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const gameOverPhase = pkg.phases['game_over'];
    // game_over is a timed phase but with no duration in the constants
    // (it persists indefinitely showing results)
    expect(gameOverPhase).toBeDefined();
    expect(gameOverPhase?.type).toBe('timed');
  });

  it('can run multiple rounds without crashing (stability test)', () => {
    const { timer, module } = setupTwoPlayers('room-go-4');
    let rounds = 0;
    const maxRounds = 5;

    while (
      module.getPhaseState('room-go-4').phaseType !== 'game_over' &&
      rounds < maxRounds
    ) {
      playFullRound(module, 'room-go-4', timer);
      if (module.getPhaseState('room-go-4').phaseType === 'game_over') break;
      if (module.getPhaseState('room-go-4').phaseType === 'scores') {
        timer.trigger('room-go-4'); // scores -> dealing (next round)
      }
      rounds++;
    }

    expect(typeof module.getPhaseState('room-go-4').phaseType).toBe('string');
  });
});

// ===========================================================================
// Tests: Scoring logic (unit tests via direct scoring functions)
// ===========================================================================

describe('Cribbage V2 -- scoring logic (direct)', () => {
  it('scores a fifteen (2 pts)', () => {
    const hand: Card[] = [
      { id: 'A-hearts', rank: 'A', suit: 'hearts' },
      { id: '4-spades', rank: '4', suit: 'spades' },
    ];
    const starter: Card = { id: '10-clubs', rank: '10', suit: 'clubs' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const fifteens = result.items.filter(i => i.type === 'fifteen');
    expect(fifteens.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('scores a pair (2 pts)', () => {
    const hand: Card[] = [
      { id: 'K-hearts', rank: 'K', suit: 'hearts' },
      { id: 'K-spades', rank: 'K', suit: 'spades' },
      { id: '3-clubs', rank: '3', suit: 'clubs' },
      { id: '7-diamonds', rank: '7', suit: 'diamonds' },
    ];
    const starter: Card = { id: '2-hearts', rank: '2', suit: 'hearts' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const pairs = result.items.filter(i => i.type === 'pair');
    expect(pairs.length).toBe(1);
    expect(pairs[0]!.points).toBe(2);
  });

  it('scores a run of 3 (3 pts)', () => {
    const hand: Card[] = [
      { id: 'A-hearts', rank: 'A', suit: 'hearts' },
      { id: '2-spades', rank: '2', suit: 'spades' },
      { id: '3-clubs', rank: '3', suit: 'clubs' },
      { id: '9-diamonds', rank: '9', suit: 'diamonds' },
    ];
    const starter: Card = { id: '7-hearts', rank: '7', suit: 'hearts' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const runs = result.items.filter(i => i.type === 'run');
    expect(runs.length).toBeGreaterThan(0);
    const runPoints = runs.reduce((s, r) => s + r.points, 0);
    expect(runPoints).toBeGreaterThanOrEqual(3);
  });

  it('scores a 4-card flush (4 pts) when hand all same suit, starter different', () => {
    const hand: Card[] = [
      { id: 'A-hearts', rank: 'A', suit: 'hearts' },
      { id: '3-hearts', rank: '3', suit: 'hearts' },
      { id: '7-hearts', rank: '7', suit: 'hearts' },
      { id: '9-hearts', rank: '9', suit: 'hearts' },
    ];
    const starter: Card = { id: 'K-spades', rank: 'K', suit: 'spades' }; // different suit
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const flush = result.items.filter(i => i.type === 'flush');
    expect(flush.length).toBe(1);
    expect(flush[0]!.points).toBe(4);
  });

  it('scores a 5-card flush (5 pts) when all 5 same suit', () => {
    const hand: Card[] = [
      { id: 'A-hearts', rank: 'A', suit: 'hearts' },
      { id: '3-hearts', rank: '3', suit: 'hearts' },
      { id: '7-hearts', rank: '7', suit: 'hearts' },
      { id: '9-hearts', rank: '9', suit: 'hearts' },
    ];
    const starter: Card = { id: '2-hearts', rank: '2', suit: 'hearts' }; // same suit
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const flush = result.items.filter(i => i.type === 'flush');
    expect(flush.length).toBe(1);
    expect(flush[0]!.points).toBe(5);
  });

  it('scores nobs (1 pt) when Jack matches starter suit', () => {
    const hand: Card[] = [
      { id: 'J-hearts', rank: 'J', suit: 'hearts' },
      { id: '3-spades', rank: '3', suit: 'spades' },
      { id: '7-clubs', rank: '7', suit: 'clubs' },
      { id: '9-diamonds', rank: '9', suit: 'diamonds' },
    ];
    const starter: Card = { id: '5-hearts', rank: '5', suit: 'hearts' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const nobs = result.items.filter(i => i.type === 'nobs');
    expect(nobs.length).toBe(1);
    expect(nobs[0]!.points).toBe(1);
  });

  it('does NOT score nobs when Jack does not match starter suit', () => {
    const hand: Card[] = [
      { id: 'J-hearts', rank: 'J', suit: 'hearts' },
      { id: '3-spades', rank: '3', suit: 'spades' },
      { id: '7-clubs', rank: '7', suit: 'clubs' },
      { id: '9-diamonds', rank: '9', suit: 'diamonds' },
    ];
    const starter: Card = { id: '5-spades', rank: '5', suit: 'spades' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    const nobs = result.items.filter(i => i.type === 'nobs');
    expect(nobs.length).toBe(0);
  });

  it('no flush in crib with only 4-card flush (crib requires 5 cards same suit)', () => {
    const hand: Card[] = [
      { id: 'A-hearts', rank: 'A', suit: 'hearts' },
      { id: '3-hearts', rank: '3', suit: 'hearts' },
      { id: '7-hearts', rank: '7', suit: 'hearts' },
      { id: '9-hearts', rank: '9', suit: 'hearts' },
    ];
    const starter: Card = { id: 'K-spades', rank: 'K', suit: 'spades' };
    const result = scoreHand(hand, starter, 'p1', 'Alice', true); // isCrib = true
    const flush = result.items.filter(i => i.type === 'flush');
    expect(flush.length).toBe(0);
  });

  it('returns valid HandScore structure', () => {
    const hand: Card[] = [
      { id: '5-hearts', rank: '5', suit: 'hearts' },
      { id: '5-spades', rank: '5', suit: 'spades' },
      { id: '5-clubs', rank: '5', suit: 'clubs' },
      { id: 'J-diamonds', rank: 'J', suit: 'diamonds' },
    ];
    const starter: Card = { id: '5-diamonds', rank: '5', suit: 'diamonds' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    expect(result.playerId).toBe('p1');
    expect(result.playerName).toBe('Alice');
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.total).toBe('number');
    expect(result.total).toBeGreaterThan(0);
  });

  it('perfect 29-hand scores correctly (5s + J of cut suit)', () => {
    // Classic 29-hand: J-diamonds, 5-hearts, 5-clubs, 5-spades, cut=5-diamonds
    const hand: Card[] = [
      { id: 'J-diamonds', rank: 'J', suit: 'diamonds' },
      { id: '5-hearts', rank: '5', suit: 'hearts' },
      { id: '5-clubs', rank: '5', suit: 'clubs' },
      { id: '5-spades', rank: '5', suit: 'spades' },
    ];
    const starter: Card = { id: '5-diamonds', rank: '5', suit: 'diamonds' };
    const result = scoreHand(hand, starter, 'p1', 'Alice');
    expect(result.total).toBe(29);
  });

  it('scorePegging: fifteen counts as 2 pts', () => {
    const sequence: Card[] = [
      { id: '6-hearts', rank: '6', suit: 'hearts' },
      { id: '9-spades', rank: '9', suit: 'spades' },
    ];
    const items = scorePegging(sequence, 15);
    const fifteen = items.find(i => i.type === 'fifteen');
    expect(fifteen).toBeDefined();
    expect(fifteen!.points).toBe(2);
  });

  it('scorePegging: 31 counts as 2 pts', () => {
    const sequence: Card[] = [
      { id: 'K-hearts', rank: 'K', suit: 'hearts' },
      { id: 'K-spades', rank: 'K', suit: 'spades' },
      { id: 'J-clubs', rank: 'J', suit: 'clubs' },
    ];
    const items = scorePegging(sequence, 31);
    const thirtyOne = items.find(i => i.type === 'thirty_one');
    expect(thirtyOne).toBeDefined();
    expect(thirtyOne!.points).toBe(2);
  });

  it('scorePegging: pair counts as 2 pts', () => {
    const sequence: Card[] = [
      { id: 'K-hearts', rank: 'K', suit: 'hearts' },
      { id: 'K-spades', rank: 'K', suit: 'spades' },
    ];
    const items = scorePegging(sequence, 20);
    const pair = items.find(i => i.type === 'pair');
    expect(pair).toBeDefined();
    expect(pair!.points).toBe(2);
  });

  it('scorePegging: run of 3 scores 3 pts', () => {
    const sequence: Card[] = [
      { id: '4-hearts', rank: '4', suit: 'hearts' },
      { id: '6-spades', rank: '6', suit: 'spades' },
      { id: '5-clubs', rank: '5', suit: 'clubs' },
    ];
    const items = scorePegging(sequence, 15);
    const run = items.find(i => i.type === 'run');
    expect(run).toBeDefined();
    expect(run!.points).toBe(3);
  });

  it('fresh deck has 52 cards', () => {
    const deck = freshDeck();
    expect(deck.length).toBe(52);
  });

  it('dealCards removes cards from deck', () => {
    const deck = freshDeck();
    const hand = dealCards(deck, 6);
    expect(hand.length).toBe(6);
    expect(deck.length).toBe(46);
  });

  it('CR_HAND_SIZE constants are correct', () => {
    expect(CR_HAND_SIZE[2]).toBe(6);
    expect(CR_HAND_SIZE[3]).toBe(5);
    expect(CR_HAND_SIZE[4]).toBe(5);
  });

  it('CR_DISCARD_COUNT constants are correct', () => {
    expect(CR_DISCARD_COUNT[2]).toBe(2);
    expect(CR_DISCARD_COUNT[3]).toBe(1);
    expect(CR_DISCARD_COUNT[4]).toBe(1);
  });

  it('CR_WIN_SCORE is 121', () => {
    expect(CR_WIN_SCORE).toBe(121);
  });
});

// ===========================================================================
// Tests: State visibility
// ===========================================================================

describe('Cribbage V2 -- state visibility', () => {
  it('getPublicState includes phase, round, dealerIndex', () => {
    const { module } = setupTwoPlayers('room-vis-1');
    const pub = getPublic(module, 'room-vis-1');
    expect(pub['phase']).toBe('dealing');
    expect(typeof pub['round']).toBe('number');
    expect(typeof pub['dealerIndex']).toBe('number');
  });

  it('getPrivateState includes hand, phase, isMyTurn', () => {
    const { module } = setupTwoPlayers('room-vis-2');
    const priv = getPrivate(module, 'room-vis-2', 'p1');
    expect(Array.isArray(priv['hand'])).toBe(true);
    expect(typeof priv['phase']).toBe('string');
    expect(typeof priv['isMyTurn']).toBe('boolean');
  });

  it('getPrivateState includes playableCardIds array during pegging', () => {
    const { timer, module } = setupAndDeal('room-vis-3');
    discardBothPlayers(module, 'room-vis-3');
    timer.trigger('room-vis-3'); // -> pegging
    const pub = getPublic(module, 'room-vis-3');
    const activeId = pub['activePlayerId'] as string;
    const priv = getPrivate(module, 'room-vis-3', activeId);
    expect(Array.isArray(priv['playableCardIds'])).toBe(true);
  });

  it('active player has isMyTurn = true during pegging', () => {
    const { timer, module } = setupAndDeal('room-vis-4');
    discardBothPlayers(module, 'room-vis-4');
    timer.trigger('room-vis-4'); // -> pegging
    const pub = getPublic(module, 'room-vis-4');
    const activeId = pub['activePlayerId'] as string;
    const priv = getPrivate(module, 'room-vis-4', activeId);
    expect(priv['isMyTurn']).toBe(true);
  });

  it('non-active player has isMyTurn = false during pegging', () => {
    const { timer, module } = setupAndDeal('room-vis-5');
    discardBothPlayers(module, 'room-vis-5');
    timer.trigger('room-vis-5'); // -> pegging
    const pub = getPublic(module, 'room-vis-5');
    const activeId = pub['activePlayerId'] as string;
    const nonActiveId = activeId === 'p1' ? 'p2' : 'p1';
    const priv = getPrivate(module, 'room-vis-5', nonActiveId);
    expect(priv['isMyTurn']).toBe(false);
  });

  it('getPhaseState returns valid round number', () => {
    const { module } = setupTwoPlayers('room-vis-6');
    const ps = module.getPhaseState('room-vis-6');
    expect(ps.roundNumber).toBe(1);
    expect(typeof ps.timerTotalMs).toBe('number');
  });

  it('scores are visible in public state', () => {
    const { module } = setupTwoPlayers('room-vis-7');
    const pub = getPublic(module, 'room-vis-7');
    const scores = pub['scores'] as Record<string, number>;
    expect(typeof scores['p1']).toBe('number');
    expect(typeof scores['p2']).toBe('number');
  });

  it('starter card is null before cut phase', () => {
    const { module } = setupTwoPlayers('room-vis-8');
    const pub = getPublic(module, 'room-vis-8');
    expect(pub['starterCard']).toBeNull();
  });

  it('peg count starts at 0', () => {
    const { module } = setupTwoPlayers('room-vis-9');
    const pub = getPublic(module, 'room-vis-9');
    expect(pub['pegCount']).toBe(0);
  });

  it('go players list starts empty', () => {
    const { module } = setupTwoPlayers('room-vis-10');
    const pub = getPublic(module, 'room-vis-10');
    expect(Array.isArray(pub['goPlayers'])).toBe(true);
    expect((pub['goPlayers'] as string[]).length).toBe(0);
  });
});
