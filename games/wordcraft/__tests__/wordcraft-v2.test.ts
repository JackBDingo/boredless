/**
 * wordcraft-v2.test.ts — Integration tests for WordCraft V2 declarative migration.
 *
 * Tests the full game lifecycle through WordCraftGameModule (wrapper) + extension actions:
 *   starting (3s) → playing (90s) → word_reveal (5s) → scores (5s) → [loop] → game_over
 *
 * Validates:
 *   - Game package loads with correct manifest and phases
 *   - Initial state: board, bag, racks, turn order
 *   - Tile placement (valid word, cross-words, premium squares)
 *   - Invalid placement rejection (out of bounds, wrong player, bad words)
 *   - Tile exchange (swap)
 *   - Pass action
 *   - Turn progression (round robin via wc_sync_scores)
 *   - Game-over conditions (consecutive passes, empty bag + empty rack)
 *
 * ARCHITECTURAL NOTES:
 *   WordCraftGameModule manages input state internally via MutationBridge.
 *   getPrivateState() returns declarative stale state during playing phase.
 *   During playing phase we test observable outcomes: phase transitions,
 *   globals (board_json, tiles_in_bag, last_word_json, consecutive_passes),
 *   and platform scores via mock ctx.scores.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { registerPrimitive, createConfirmPrimitive } from '../../../server/src/runtime/interaction-primitives/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { Player, GameDefinition } from '@boredless/shared';

import { createWordCraftModule } from '../extensions/game-module.js';
import {
  createTileBag,
  createBoard,
  validatePlacement,
  calculatePlacementScore,
  scoreWord,
  applyPlacement,
  isGameOver,
  applyEndGamePenalties,
  shuffleBag,
  drawTiles,
  boardIsEmpty,
} from '../extensions/board.js';
import { isValidWord } from '../extensions/dictionary.js';
import { WC_BOARD_SIZE, WC_RACK_SIZE, WC_ALL_TILES_BONUS, LETTER_POINTS } from '../constants.js';
import type { Tile, BoardCell, PlacedTile } from '../types.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_DIR = join(__dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

// ---------------------------------------------------------------------------
// Register custom primitives required by WordCraft game.yaml
// The playing phase uses primitive: structured_message (a WordCraft-specific
// interaction primitive that the wrapper module intercepts before the
// DeclarativeGameModule processes it). We register it as a confirm-style
// primitive so the schema engine and interaction runtime can handle it.
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Register structured_message as a confirm-compatible primitive for tests.
  // The WordCraftGameModule wrapper intercepts all input in playing phase,
  // so the primitive is never directly validated — this just satisfies the
  // interaction-primitives registry lookup.
  registerPrimitive('structured_message', createConfirmPrimitive);
});

// ---------------------------------------------------------------------------
// Test timer
// ---------------------------------------------------------------------------

class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();

  start(
    roomId: string,
    _pt: string,
    _ms: number,
    _sids: string[],
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

function createMockCtx(roomId: string, playerIds: string[] = ['p1', 'p2']) {
  const scores = new Map<string, number>();
  const sentMessages: Array<{ to: string | null; msg: unknown }> = [];

  return {
    roomId,
    scores,
    sentMessages,

    ctx: {
      roomId,
      initScores: (ids: string[]) => {
        for (const id of ids) scores.set(id, 0);
      },
      addPoints: (pid: string, pts: number) => {
        scores.set(pid, (scores.get(pid) ?? 0) + pts);
      },
      getScore: (pid: string) => scores.get(pid) ?? 0,
      getScores: () =>
        [...scores.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([pid, score]) => ({ playerId: pid, playerName: pid, score })),
      clearScores: () => scores.clear(),
      setRoomStatus: vi.fn(),
      broadcastPhase: vi.fn(),
      broadcastPrivateState: vi.fn(),
      broadcastScores: vi.fn(),
      broadcastGameOver: vi.fn(),
      sendToAll: vi.fn((msg: unknown) => {
        sentMessages.push({ to: null, msg });
      }),
      sendToPlayer: vi.fn((pid: string, msg: unknown) => {
        sentMessages.push({ to: pid, msg });
      }),
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      getTimerRemaining: vi.fn(() => null),
      getAllSessionIds: vi.fn(() => playerIds),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any,
  };
}

// ---------------------------------------------------------------------------
// Shared constants
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
  id: 'wordcraft',
  name: 'WordCraft',
  description: 'Scrabble-style word game',
  minPlayers: 2,
  maxPlayers: 4,
  estimatedMinutes: 30,
  icon: 'spell-check',
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createModule(timerImpl?: TimerImpl) {
  const pkg = loadGamePackage(GAME_YAML);
  return createWordCraftModule(GAME_DEFINITION, pkg, GAME_DIR, timerImpl);
}

/** Setup module and advance past the `starting` timed phase into `playing`. */
function setupAndStart(roomId: string, players = TWO_PLAYERS) {
  const timer = new TestTimerImpl();
  const module = createModule(timer);
  const mock = createMockCtx(roomId, players.map(p => p.id));
  module.setup(players, mock.ctx);
  // Trigger starting timer → playing phase (wc_init_game fires on_enter of starting)
  timer.trigger(roomId);
  return { timer, module, mock };
}

// ---------------------------------------------------------------------------
// State accessors
// ---------------------------------------------------------------------------

function getGlobals(module: ReturnType<typeof createModule>, roomId: string): Record<string, unknown> {
  const pub = module.getPublicState(roomId) as any;
  return (pub.globals ?? {}) as Record<string, unknown>;
}

function getPrivatePlayers(module: ReturnType<typeof createModule>, roomId: string, playerId: string): Record<string, unknown> {
  const priv = module.getPrivateState(roomId, playerId) as any;
  return (priv.players?.[playerId] ?? {}) as Record<string, unknown>;
}

function getTurnOrder(module: ReturnType<typeof createModule>, roomId: string): string[] {
  const globals = getGlobals(module, roomId);
  return Array.isArray(globals['turn_order']) ? (globals['turn_order'] as string[]) : [];
}

function getCurrentPlayerId(module: ReturnType<typeof createModule>, roomId: string): string | null {
  const globals = getGlobals(module, roomId);
  const turnOrder = getTurnOrder(module, roomId);
  const idx = typeof globals['current_player_index'] === 'number'
    ? globals['current_player_index'] : 0;
  return turnOrder[idx] ?? null;
}

/** Get the rack for a player from the module's private state */
function getRack(module: ReturnType<typeof createModule>, roomId: string, playerId: string): Tile[] {
  const priv = module.getPrivateState(roomId, playerId) as any;
  // enrichPrivateState puts rack at top-level
  if (Array.isArray(priv.rack)) return priv.rack as Tile[];
  // Fallback: parse from players
  const playerState = (priv.players?.[playerId] ?? {}) as Record<string, unknown>;
  const rackJson = playerState['rack_json'];
  if (typeof rackJson === 'string' && rackJson) {
    try { return JSON.parse(rackJson) as Tile[]; } catch { return []; }
  }
  return [];
}

/** Build a valid first-word placement at the center using tiles from the rack. */
function buildFirstWordPlacement(rack: Tile[]): { placed: PlacedTile[]; word: string } | null {
  // Try to find a valid word using tiles in rack that crosses center (7,7)
  // Try horizontal placements starting at col 7 going right
  const nonBlanks = rack.filter(t => t.letter !== '');
  
  // Try each combination of tiles to form a known valid word
  for (let len = 2; len <= Math.min(nonBlanks.length, 5); len++) {
    const combos = getCombinations(nonBlanks, len);
    for (const combo of combos) {
      // Horizontal: start at col = 7, extending right
      const word = combo.map(t => t.letter).join('');
      if (isValidWord(word)) {
        const placed: PlacedTile[] = combo.map((t, i) => ({
          row: 7,
          col: 7 + i,
          letter: t.letter,
          tileId: t.id,
        }));
        return { placed, word };
      }
    }
  }
  return null;
}

function getCombinations<T>(arr: T[], len: number): T[][] {
  if (len === 1) return arr.map(x => [x]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - len; i++) {
    const rest = getCombinations(arr.slice(i + 1), len - 1);
    for (const combo of rest) {
      result.push([arr[i]!, ...combo]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers to build a board with a specific word already placed (for cross-word tests)
// ---------------------------------------------------------------------------

/** Place a word on the board directly (for test setup). Returns modified board. */
function placeWordOnBoard(board: BoardCell[][], word: string, row: number, startCol: number): BoardCell[][] {
  const b = board.map(r => r.map(c => ({ ...c, tile: c.tile ? { ...c.tile } : null })));
  for (let i = 0; i < word.length; i++) {
    const letter = word[i]!.toUpperCase();
    b[row]![startCol + i]!.tile = {
      id: `existing-${i}`,
      letter,
      points: LETTER_POINTS[letter] ?? 1,
      isBlank: false,
    };
    b[row]![startCol + i]!.premiumUsed = true;
  }
  return b;
}

// ===========================================================================
// Tests
// ===========================================================================

// ---------------------------------------------------------------------------
describe('WordCraft V2 — game package', () => {
  it('loads the V2 game package with correct manifest', () => {
    const pkg = loadGamePackage(GAME_YAML);
    expect(pkg.manifest.id).toBe('wordcraft');
    expect(pkg.manifest.name).toBe('WordCraft');
    expect(pkg.manifest.players.min).toBe(2);
    expect(pkg.manifest.players.max).toBe(4);
  });

  it('has the correct schema version', () => {
    const pkg = loadGamePackage(GAME_YAML);
    expect(pkg.manifest.version).toBe('2.0.0');
  });

  it('has the correct phases defined', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const ids = Object.keys(pkg.phases);
    expect(ids).toContain('starting');
    expect(ids).toContain('playing');
    expect(ids).toContain('word_reveal');
    expect(ids).toContain('scores');
    expect(ids).toContain('game_over');
  });

  it('starting phase has wc_init_game on_enter action', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const starting = pkg.phases['starting'];
    const onEnter = (starting as any)?.on_enter ?? [];
    const actions = onEnter.map((a: any) => a.action);
    expect(actions).toContain('wc_init_game');
  });

  it('scores phase has wc_sync_scores on_enter action', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const scoresPhase = pkg.phases['scores'];
    const onEnter = (scoresPhase as any)?.on_enter ?? [];
    const actions = onEnter.map((a: any) => a.action);
    expect(actions).toContain('wc_sync_scores');
  });

  it('scores phase has game_over_flag conditional in on_exit', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const scoresPhase = pkg.phases['scores'];
    const onExit = (scoresPhase as any)?.on_exit ?? [];
    const cond = onExit.find((a: any) => a.action === 'conditional');
    expect(cond).toBeDefined();
    expect((cond as any).condition as string).toMatch(/game_over_flag/);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — game creation and initial state', () => {
  it('starts in starting phase immediately after setup', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('wc-init-1');
    module.setup(TWO_PLAYERS, ctx);
    expect(module.getPhaseState('wc-init-1').phaseType).toBe('starting');
  });

  it('advances to playing phase after starting timer fires', () => {
    const { module } = setupAndStart('wc-init-2');
    expect(module.getPhaseState('wc-init-2').phaseType).toBe('playing');
  });

  it('initialises a 15x15 board', () => {
    const { module } = setupAndStart('wc-init-3');
    const globals = getGlobals(module, 'wc-init-3');
    const boardJson = globals['board_json'];
    expect(typeof boardJson).toBe('string');
    const board = JSON.parse(boardJson as string) as BoardCell[][];
    expect(board.length).toBe(WC_BOARD_SIZE);
    expect(board[0]!.length).toBe(WC_BOARD_SIZE);
  });

  it('all board cells start empty', () => {
    const { module } = setupAndStart('wc-init-4');
    const globals = getGlobals(module, 'wc-init-4');
    const board = JSON.parse(globals['board_json'] as string) as BoardCell[][];
    const allEmpty = board.every(row => row.every(cell => cell.tile === null));
    expect(allEmpty).toBe(true);
  });

  it('createTileBag produces 100 tiles', () => {
    const bag = createTileBag();
    expect(bag.length).toBe(100);
  });

  it('tiles_in_bag is set correctly after init (100 - 7*numPlayers)', () => {
    const { module } = setupAndStart('wc-init-5');
    const globals = getGlobals(module, 'wc-init-5');
    // 100 total - 7 per player * 2 players = 86
    expect(globals['tiles_in_bag']).toBe(100 - WC_RACK_SIZE * TWO_PLAYERS.length);
  });

  it('each player receives 7 tiles in their rack', () => {
    const { module } = setupAndStart('wc-init-6');
    const rack1 = getRack(module, 'wc-init-6', 'p1');
    const rack2 = getRack(module, 'wc-init-6', 'p2');
    expect(rack1.length).toBe(WC_RACK_SIZE);
    expect(rack2.length).toBe(WC_RACK_SIZE);
  });

  it('turn_order contains all player IDs', () => {
    const { module } = setupAndStart('wc-init-7');
    const turnOrder = getTurnOrder(module, 'wc-init-7');
    expect(turnOrder.length).toBe(TWO_PLAYERS.length);
    expect(turnOrder).toContain('p1');
    expect(turnOrder).toContain('p2');
  });

  it('current_player_index starts at 0', () => {
    const { module } = setupAndStart('wc-init-8');
    const globals = getGlobals(module, 'wc-init-8');
    expect(globals['current_player_index']).toBe(0);
  });

  it('consecutive_passes starts at 0', () => {
    const { module } = setupAndStart('wc-init-9');
    const globals = getGlobals(module, 'wc-init-9');
    expect(globals['consecutive_passes']).toBe(0);
  });

  it('round_number starts at 1', () => {
    const { module } = setupAndStart('wc-init-10');
    const globals = getGlobals(module, 'wc-init-10');
    expect(globals['round_number']).toBe(1);
  });

  it('last_word_json is null initially', () => {
    const { module } = setupAndStart('wc-init-11');
    const globals = getGlobals(module, 'wc-init-11');
    expect(globals['last_word_json']).toBeNull();
  });

  it('teardown cleans up without throwing', () => {
    const { module } = setupAndStart('wc-init-12');
    expect(() => module.teardown('wc-init-12')).not.toThrow();
  });

  it('returns empty state for unknown roomId', () => {
    const module = createModule();
    expect(module.getPublicState('nonexistent')).toEqual({});
    expect(module.getPrivateState('nonexistent', 'p1')).toEqual({});
  });

  it('works with 3 players — all receive racks', () => {
    const { module } = setupAndStart('wc-init-14', THREE_PLAYERS);
    for (const p of THREE_PLAYERS) {
      const rack = getRack(module, 'wc-init-14', p.id);
      expect(rack.length).toBe(WC_RACK_SIZE);
    }
    expect(getGlobals(module, 'wc-init-14')['tiles_in_bag']).toBe(100 - WC_RACK_SIZE * THREE_PLAYERS.length);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — pass action', () => {
  it('accepts pass from current player', () => {
    const { module } = setupAndStart('wc-pass-1');
    const currentId = getCurrentPlayerId(module, 'wc-pass-1')!;
    const r = module.handleInput('wc-pass-1', currentId, 'structured_message', { action: 'pass' });
    expect(r.accepted).toBe(true);
  });

  it('rejects pass from non-current player', () => {
    const { module } = setupAndStart('wc-pass-2');
    const turnOrder = getTurnOrder(module, 'wc-pass-2');
    const notCurrentId = turnOrder.find(id => id !== turnOrder[0])!;
    const r = module.handleInput('wc-pass-2', notCurrentId, 'structured_message', { action: 'pass' });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/not your turn/i);
  });

  it('advances to word_reveal phase after pass', () => {
    const { module } = setupAndStart('wc-pass-3');
    const currentId = getCurrentPlayerId(module, 'wc-pass-3')!;
    module.handleInput('wc-pass-3', currentId, 'structured_message', { action: 'pass' });
    expect(module.getPhaseState('wc-pass-3').phaseType).toBe('word_reveal');
  });

  it('increments consecutive_passes after pass', () => {
    const { module } = setupAndStart('wc-pass-4');
    const currentId = getCurrentPlayerId(module, 'wc-pass-4')!;
    module.handleInput('wc-pass-4', currentId, 'structured_message', { action: 'pass' });
    const globals = getGlobals(module, 'wc-pass-4');
    expect(globals['consecutive_passes']).toBe(1);
  });

  it('sets last_word_json to null after pass', () => {
    const { module } = setupAndStart('wc-pass-5');
    const currentId = getCurrentPlayerId(module, 'wc-pass-5')!;
    module.handleInput('wc-pass-5', currentId, 'structured_message', { action: 'pass' });
    const globals = getGlobals(module, 'wc-pass-5');
    expect(globals['last_word_json']).toBeNull();
  });

  it('rejects action in non-playing phase (starting phase)', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('wc-pass-6');
    module.setup(TWO_PLAYERS, ctx);
    // Still in starting phase
    const r = module.handleInput('wc-pass-6', 'p1', 'structured_message', { action: 'pass' });
    expect(r.accepted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — swap action', () => {
  it('accepts swap from current player with valid tile IDs', () => {
    const { module } = setupAndStart('wc-swap-1');
    const currentId = getCurrentPlayerId(module, 'wc-swap-1')!;
    const rack = getRack(module, 'wc-swap-1', currentId);
    expect(rack.length).toBeGreaterThan(0);
    const tileIds = [rack[0]!.id];
    const r = module.handleInput('wc-swap-1', currentId, 'structured_message', {
      action: 'swap',
      tileIds,
    });
    // bag has 86 tiles >= 7 so swap should be accepted
    expect(r.accepted).toBe(true);
  });

  it('advances to word_reveal phase after swap', () => {
    const { module } = setupAndStart('wc-swap-2');
    const currentId = getCurrentPlayerId(module, 'wc-swap-2')!;
    const rack = getRack(module, 'wc-swap-2', currentId);
    const r = module.handleInput('wc-swap-2', currentId, 'structured_message', {
      action: 'swap',
      tileIds: [rack[0]!.id],
    });
    expect(r.accepted).toBe(true);
    expect(module.getPhaseState('wc-swap-2').phaseType).toBe('word_reveal');
  });

  it('rejects swap from non-current player', () => {
    const { module } = setupAndStart('wc-swap-3');
    const turnOrder = getTurnOrder(module, 'wc-swap-3');
    const notCurrentId = turnOrder.find(id => id !== turnOrder[0])!;
    const rack = getRack(module, 'wc-swap-3', notCurrentId);
    const r = module.handleInput('wc-swap-3', notCurrentId, 'structured_message', {
      action: 'swap',
      tileIds: rack.length > 0 ? [rack[0]!.id] : ['fake-id'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/not your turn/i);
  });

  it('rejects swap with tile IDs not in rack', () => {
    const { module } = setupAndStart('wc-swap-4');
    const currentId = getCurrentPlayerId(module, 'wc-swap-4')!;
    const r = module.handleInput('wc-swap-4', currentId, 'structured_message', {
      action: 'swap',
      tileIds: ['nonexistent-tile-id'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('rejects swap with empty tileIds array', () => {
    const { module } = setupAndStart('wc-swap-5');
    const currentId = getCurrentPlayerId(module, 'wc-swap-5')!;
    const r = module.handleInput('wc-swap-5', currentId, 'structured_message', {
      action: 'swap',
      tileIds: [],
    });
    expect(r.accepted).toBe(false);
  });

  it('increments consecutive_passes after swap (counts as non-play)', () => {
    const { module } = setupAndStart('wc-swap-6');
    const currentId = getCurrentPlayerId(module, 'wc-swap-6')!;
    const rack = getRack(module, 'wc-swap-6', currentId);
    module.handleInput('wc-swap-6', currentId, 'structured_message', {
      action: 'swap',
      tileIds: [rack[0]!.id],
    });
    const globals = getGlobals(module, 'wc-swap-6');
    expect(globals['consecutive_passes']).toBe(1);
  });

  it('swapped player still has tiles after swap (rack maintained)', () => {
    const { module } = setupAndStart('wc-swap-7');
    const currentId = getCurrentPlayerId(module, 'wc-swap-7')!;
    const rack = getRack(module, 'wc-swap-7', currentId);
    const tileIds = rack.slice(0, 3).map(t => t.id);
    module.handleInput('wc-swap-7', currentId, 'structured_message', { action: 'swap', tileIds });
    // tiles_in_bag should be reasonable after swap
    const globals = getGlobals(module, 'wc-swap-7');
    const tilesInBag = Number(globals['tiles_in_bag']);
    expect(tilesInBag).toBeGreaterThan(0);
    expect(tilesInBag).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — tile placement (valid)', () => {
  it('accepts a valid first-word placement crossing center', () => {
    const { module } = setupAndStart('wc-place-1');
    const currentId = getCurrentPlayerId(module, 'wc-place-1')!;
    const rack = getRack(module, 'wc-place-1', currentId);

    const result = buildFirstWordPlacement(rack);
    if (!result) {
      console.warn('wc-place-1: Could not build first word from rack:', rack.map(t => t.letter));
      return;
    }

    const r = module.handleInput('wc-place-1', currentId, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    expect(r.accepted).toBe(true);
  });

  it('advances to word_reveal after valid placement', () => {
    const { module } = setupAndStart('wc-place-2');
    const currentId = getCurrentPlayerId(module, 'wc-place-2')!;
    const rack = getRack(module, 'wc-place-2', currentId);
    const result = buildFirstWordPlacement(rack);
    if (!result) return;

    module.handleInput('wc-place-2', currentId, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    expect(module.getPhaseState('wc-place-2').phaseType).toBe('word_reveal');
  });

  it('sets last_word_json with word, score, playerId after placement', () => {
    const { module } = setupAndStart('wc-place-3');
    const currentId = getCurrentPlayerId(module, 'wc-place-3')!;
    const rack = getRack(module, 'wc-place-3', currentId);
    const result = buildFirstWordPlacement(rack);
    if (!result) return;

    module.handleInput('wc-place-3', currentId, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });

    const globals = getGlobals(module, 'wc-place-3');
    const lastWordJson = globals['last_word_json'];
    expect(typeof lastWordJson).toBe('string');
    const lastWord = JSON.parse(lastWordJson as string);
    expect(lastWord.playerId).toBe(currentId);
    expect(typeof lastWord.word).toBe('string');
    expect(lastWord.word.length).toBeGreaterThan(0);
    expect(typeof lastWord.score).toBe('number');
    expect(lastWord.score).toBeGreaterThan(0);
  });

  it('reduces tiles_in_bag after placement (draws replacement tiles)', () => {
    const { module } = setupAndStart('wc-place-4');
    const currentId = getCurrentPlayerId(module, 'wc-place-4')!;
    const rack = getRack(module, 'wc-place-4', currentId);
    const result = buildFirstWordPlacement(rack);
    if (!result) return;

    const bagBefore = Number(getGlobals(module, 'wc-place-4')['tiles_in_bag']);
    module.handleInput('wc-place-4', currentId, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    // After placing N tiles and drawing N back: bag decreases by N
    const bagAfter = Number(getGlobals(module, 'wc-place-4')['tiles_in_bag']);
    const placedCount = result.placed.length;
    expect(bagAfter).toBe(bagBefore - placedCount);
  });

  it('resets consecutive_passes to 0 after placement', () => {
    const { module, timer } = setupAndStart('wc-place-5');

    // First player passes
    const p1 = getCurrentPlayerId(module, 'wc-place-5')!;
    module.handleInput('wc-place-5', p1, 'structured_message', { action: 'pass' });
    expect(Number(getGlobals(module, 'wc-place-5')['consecutive_passes'])).toBe(1);

    // Advance to next player's turn
    timer.trigger('wc-place-5'); // word_reveal → scores
    timer.trigger('wc-place-5'); // scores → playing

    // Next player places a word
    const p2 = getCurrentPlayerId(module, 'wc-place-5')!;
    const rack2 = getRack(module, 'wc-place-5', p2);
    const result = buildFirstWordPlacement(rack2);
    if (!result) return;

    module.handleInput('wc-place-5', p2, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    expect(Number(getGlobals(module, 'wc-place-5')['consecutive_passes'])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — tile placement (invalid rejections)', () => {
  it('rejects placement from non-current player', () => {
    const { module } = setupAndStart('wc-inv-1');
    const turnOrder = getTurnOrder(module, 'wc-inv-1');
    const notCurrentId = turnOrder.find(id => id !== turnOrder[0])!;
    const rack = getRack(module, 'wc-inv-1', notCurrentId);
    const result = buildFirstWordPlacement(rack);
    if (!result) return;

    const r = module.handleInput('wc-inv-1', notCurrentId, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/not your turn/i);
  });

  it('rejects empty tiles array', () => {
    const { module } = setupAndStart('wc-inv-2');
    const currentId = getCurrentPlayerId(module, 'wc-inv-2')!;
    const r = module.handleInput('wc-inv-2', currentId, 'structured_message', {
      action: 'place',
      tiles: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('rejects missing tiles field', () => {
    const { module } = setupAndStart('wc-inv-3');
    const currentId = getCurrentPlayerId(module, 'wc-inv-3')!;
    const r = module.handleInput('wc-inv-3', currentId, 'structured_message', {
      action: 'place',
    });
    expect(r.accepted).toBe(false);
  });

  it('rejects placement not crossing center on first move', () => {
    const { module } = setupAndStart('wc-inv-4');
    const currentId = getCurrentPlayerId(module, 'wc-inv-4')!;
    const rack = getRack(module, 'wc-inv-4', currentId);
    const nonBlankTiles = rack.filter(t => t.letter !== '').slice(0, 2);
    if (nonBlankTiles.length < 2) return;

    // Place far from center (row 0, col 0)
    const placed: PlacedTile[] = [
      { row: 0, col: 0, letter: nonBlankTiles[0]!.letter, tileId: nonBlankTiles[0]!.id },
      { row: 0, col: 1, letter: nonBlankTiles[1]!.letter, tileId: nonBlankTiles[1]!.id },
    ];
    const r = module.handleInput('wc-inv-4', currentId, 'structured_message', {
      action: 'place',
      tiles: placed,
    });
    expect(r.accepted).toBe(false);
  });

  it('rejects placement with tiles not in rack', () => {
    const { module } = setupAndStart('wc-inv-5');
    const currentId = getCurrentPlayerId(module, 'wc-inv-5')!;
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 'fake-tile-id-1' },
      { row: 7, col: 8, letter: 'B', tileId: 'fake-tile-id-2' },
    ];
    const r = module.handleInput('wc-inv-5', currentId, 'structured_message', {
      action: 'place',
      tiles: placed,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('rejects non-linear placement (not in a straight line)', () => {
    const { module } = setupAndStart('wc-inv-6');
    const currentId = getCurrentPlayerId(module, 'wc-inv-6')!;
    const rack = getRack(module, 'wc-inv-6', currentId);
    const nonBlankTiles = rack.filter(t => t.letter !== '').slice(0, 3);
    if (nonBlankTiles.length < 3) return;

    // L-shaped placement: (7,7), (7,8), (8,8)
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: nonBlankTiles[0]!.letter, tileId: nonBlankTiles[0]!.id },
      { row: 7, col: 8, letter: nonBlankTiles[1]!.letter, tileId: nonBlankTiles[1]!.id },
      { row: 8, col: 8, letter: nonBlankTiles[2]!.letter, tileId: nonBlankTiles[2]!.id },
    ];
    const r = module.handleInput('wc-inv-6', currentId, 'structured_message', {
      action: 'place',
      tiles: placed,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/straight line/i);
  });

  it('rejects single tile placement (minimum 2 letters)', () => {
    const { module } = setupAndStart('wc-inv-7');
    const currentId = getCurrentPlayerId(module, 'wc-inv-7')!;
    const rack = getRack(module, 'wc-inv-7', currentId);
    const tile = rack.find(t => t.letter !== '');
    if (!tile) return;

    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: tile.letter, tileId: tile.id },
    ];
    const r = module.handleInput('wc-inv-7', currentId, 'structured_message', {
      action: 'place',
      tiles: placed,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('rejects invalid word (not in dictionary)', () => {
    const { module } = setupAndStart('wc-inv-8');
    const currentId = getCurrentPlayerId(module, 'wc-inv-8')!;
    const rack = getRack(module, 'wc-inv-8', currentId);
    const nonBlankTiles = rack.filter(t => t.letter !== '').slice(0, 2);
    if (nonBlankTiles.length < 2) return;

    const t1 = nonBlankTiles[0]!;
    const t2 = nonBlankTiles[1]!;
    const candidate = t1.letter + t2.letter;
    
    if (!isValidWord(candidate)) {
      const placed: PlacedTile[] = [
        { row: 7, col: 7, letter: t1.letter, tileId: t1.id },
        { row: 7, col: 8, letter: t2.letter, tileId: t2.id },
      ];
      const r = module.handleInput('wc-inv-8', currentId, 'structured_message', {
        action: 'place',
        tiles: placed,
      });
      expect(r.accepted).toBe(false);
      expect(r.reason).toMatch(/invalid word/i);
    }
    // If candidate happens to be valid, skip (we can't reliably form an invalid word)
  });

  it('rejects unknown action type', () => {
    const { module } = setupAndStart('wc-inv-9');
    const currentId = getCurrentPlayerId(module, 'wc-inv-9')!;
    const r = module.handleInput('wc-inv-9', currentId, 'structured_message', {
      action: 'fly',
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/unknown action/i);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — turn progression', () => {
  /** Helper: complete a full word_reveal → scores cycle via timers. */
  function advanceThroughRevealAndScores(module: ReturnType<typeof createModule>, roomId: string, timer: TestTimerImpl) {
    timer.trigger(roomId); // word_reveal → scores
    expect(module.getPhaseState(roomId).phaseType).toBe('scores');
    timer.trigger(roomId); // scores → playing (next player)
  }

  it('turn advances to next player after pass + scores cycle', () => {
    const { module, timer } = setupAndStart('wc-turn-1');
    const turnOrder = getTurnOrder(module, 'wc-turn-1');
    const firstPlayerId = turnOrder[0]!;
    const secondPlayerId = turnOrder[1]!;

    // First player passes
    module.handleInput('wc-turn-1', firstPlayerId, 'structured_message', { action: 'pass' });
    expect(module.getPhaseState('wc-turn-1').phaseType).toBe('word_reveal');

    advanceThroughRevealAndScores(module, 'wc-turn-1', timer);
    expect(module.getPhaseState('wc-turn-1').phaseType).toBe('playing');

    // Now it should be second player's turn
    const newCurrentId = getCurrentPlayerId(module, 'wc-turn-1');
    expect(newCurrentId).toBe(secondPlayerId);
  });

  it('turn wraps around after all players take a turn', () => {
    const { module, timer } = setupAndStart('wc-turn-2');
    const turnOrder = getTurnOrder(module, 'wc-turn-2');
    const firstPlayerId = turnOrder[0]!;

    // Player 1 passes
    module.handleInput('wc-turn-2', firstPlayerId, 'structured_message', { action: 'pass' });
    advanceThroughRevealAndScores(module, 'wc-turn-2', timer);

    // Player 2 passes
    const p2 = getCurrentPlayerId(module, 'wc-turn-2')!;
    module.handleInput('wc-turn-2', p2, 'structured_message', { action: 'pass' });
    advanceThroughRevealAndScores(module, 'wc-turn-2', timer);

    // Should be back to player 1
    const backToFirst = getCurrentPlayerId(module, 'wc-turn-2');
    expect(backToFirst).toBe(firstPlayerId);
  });

  it('round_number increments after each turn cycle', () => {
    const { module, timer } = setupAndStart('wc-turn-3');
    expect(getGlobals(module, 'wc-turn-3')['round_number']).toBe(1);

    const p1 = getCurrentPlayerId(module, 'wc-turn-3')!;
    module.handleInput('wc-turn-3', p1, 'structured_message', { action: 'pass' });
    advanceThroughRevealAndScores(module, 'wc-turn-3', timer);

    expect(getGlobals(module, 'wc-turn-3')['round_number']).toBe(2);
  });

  it('word_reveal phase transitions to scores', () => {
    const { module, timer } = setupAndStart('wc-turn-4');
    const currentId = getCurrentPlayerId(module, 'wc-turn-4')!;
    module.handleInput('wc-turn-4', currentId, 'structured_message', { action: 'pass' });
    expect(module.getPhaseState('wc-turn-4').phaseType).toBe('word_reveal');
    timer.trigger('wc-turn-4');
    expect(module.getPhaseState('wc-turn-4').phaseType).toBe('scores');
  });

  it('consecutive_passes resets after a successful placement', () => {
    const { module, timer } = setupAndStart('wc-turn-5');

    // Player 1 passes
    const p1 = getCurrentPlayerId(module, 'wc-turn-5')!;
    module.handleInput('wc-turn-5', p1, 'structured_message', { action: 'pass' });
    expect(Number(getGlobals(module, 'wc-turn-5')['consecutive_passes'])).toBe(1);
    advanceThroughRevealAndScores(module, 'wc-turn-5', timer);

    // Player 2 places a word (resets consecutive_passes to 0)
    const p2 = getCurrentPlayerId(module, 'wc-turn-5')!;
    const rack2 = getRack(module, 'wc-turn-5', p2);
    const result = buildFirstWordPlacement(rack2);
    if (!result) return;

    module.handleInput('wc-turn-5', p2, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    expect(Number(getGlobals(module, 'wc-turn-5')['consecutive_passes'])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — full round lifecycle', () => {
  it('completes: starting → playing → word_reveal → scores → playing', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('wc-lc-1');
    module.setup(TWO_PLAYERS, ctx);

    expect(module.getPhaseState('wc-lc-1').phaseType).toBe('starting');

    timer.trigger('wc-lc-1'); // starting → playing
    expect(module.getPhaseState('wc-lc-1').phaseType).toBe('playing');

    const currentId = getCurrentPlayerId(module, 'wc-lc-1')!;
    module.handleInput('wc-lc-1', currentId, 'structured_message', { action: 'pass' });
    expect(module.getPhaseState('wc-lc-1').phaseType).toBe('word_reveal');

    timer.trigger('wc-lc-1'); // word_reveal → scores
    expect(module.getPhaseState('wc-lc-1').phaseType).toBe('scores');

    timer.trigger('wc-lc-1'); // scores → playing (next turn)
    expect(module.getPhaseState('wc-lc-1').phaseType).toBe('playing');
  });

  it('multiple rounds cycle correctly (4 turns → same player again)', () => {
    const { module, timer } = setupAndStart('wc-lc-2');
    const turnOrder = getTurnOrder(module, 'wc-lc-2');
    const firstPlayerId = turnOrder[0]!;

    // Complete 4 turns (2 players × 2 rounds)
    for (let turn = 0; turn < 4; turn++) {
      const currentId = getCurrentPlayerId(module, 'wc-lc-2')!;
      module.handleInput('wc-lc-2', currentId, 'structured_message', { action: 'pass' });
      timer.trigger('wc-lc-2'); // word_reveal → scores
      timer.trigger('wc-lc-2'); // scores → playing
    }

    // After 4 turns (2 full cycles), should be back to first player
    expect(getCurrentPlayerId(module, 'wc-lc-2')).toBe(firstPlayerId);
  });

  it('can run two complete turn cycles without errors', () => {
    const { module, timer } = setupAndStart('wc-lc-3');

    // Cycle 1: p1 pass
    const p1first = getCurrentPlayerId(module, 'wc-lc-3')!;
    module.handleInput('wc-lc-3', p1first, 'structured_message', { action: 'pass' });
    timer.trigger('wc-lc-3');
    timer.trigger('wc-lc-3');

    // Cycle 2: p2 pass
    const p2 = getCurrentPlayerId(module, 'wc-lc-3')!;
    expect(p2).not.toBe(p1first);
    module.handleInput('wc-lc-3', p2, 'structured_message', { action: 'pass' });
    timer.trigger('wc-lc-3');
    timer.trigger('wc-lc-3');

    // Cycle 3: p1 pass again
    const p1second = getCurrentPlayerId(module, 'wc-lc-3')!;
    expect(p1second).toBe(p1first);
    module.handleInput('wc-lc-3', p1second, 'structured_message', { action: 'pass' });
    expect(module.getPhaseState('wc-lc-3').phaseType).toBe('word_reveal');
  });

  it('scores phase enters and exits correctly', () => {
    const { module, timer } = setupAndStart('wc-lc-4');
    const currentId = getCurrentPlayerId(module, 'wc-lc-4')!;
    module.handleInput('wc-lc-4', currentId, 'structured_message', { action: 'pass' });
    timer.trigger('wc-lc-4'); // → scores
    expect(module.getPhaseState('wc-lc-4').phaseType).toBe('scores');
    timer.trigger('wc-lc-4'); // → playing
    expect(module.getPhaseState('wc-lc-4').phaseType).toBe('playing');
  });

  it('teardown after multiple rounds does not throw', () => {
    const { module, timer } = setupAndStart('wc-lc-5');
    const p1 = getCurrentPlayerId(module, 'wc-lc-5')!;
    module.handleInput('wc-lc-5', p1, 'structured_message', { action: 'pass' });
    timer.trigger('wc-lc-5');
    timer.trigger('wc-lc-5');
    expect(() => module.teardown('wc-lc-5')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — game-over conditions', () => {
  it('triggers game_over after 2*playerCount consecutive passes', () => {
    const { module, timer } = setupAndStart('wc-over-1');
    const playerCount = TWO_PLAYERS.length; // 2
    const requiredPasses = playerCount * 2; // 4

    for (let i = 0; i < requiredPasses; i++) {
      const currentId = getCurrentPlayerId(module, 'wc-over-1')!;
      module.handleInput('wc-over-1', currentId, 'structured_message', { action: 'pass' });
      timer.trigger('wc-over-1'); // word_reveal → scores

      if (i < requiredPasses - 1) {
        timer.trigger('wc-over-1'); // scores → playing (not game over yet)
        expect(module.getPhaseState('wc-over-1').phaseType).toBe('playing');
      }
    }

    // 4th pass: scores → game_over
    timer.trigger('wc-over-1');
    expect(module.getPhaseState('wc-over-1').phaseType).toBe('game_over');
  });

  it('consecutive_passes resets when player places a word (no game over)', () => {
    const { module, timer } = setupAndStart('wc-over-2');

    // Do 3 passes (just below limit of 4 for 2 players)
    for (let i = 0; i < 3; i++) {
      const currentId = getCurrentPlayerId(module, 'wc-over-2')!;
      module.handleInput('wc-over-2', currentId, 'structured_message', { action: 'pass' });
      timer.trigger('wc-over-2'); // word_reveal → scores
      timer.trigger('wc-over-2'); // scores → playing
    }

    expect(Number(getGlobals(module, 'wc-over-2')['consecutive_passes'])).toBe(3);

    // Now place a word to reset consecutive_passes
    const currentId = getCurrentPlayerId(module, 'wc-over-2')!;
    const rack = getRack(module, 'wc-over-2', currentId);
    const result = buildFirstWordPlacement(rack);
    if (!result) return;

    module.handleInput('wc-over-2', currentId, 'structured_message', {
      action: 'place',
      tiles: result.placed,
    });
    expect(Number(getGlobals(module, 'wc-over-2')['consecutive_passes'])).toBe(0);
    // Game should NOT be over (passes were reset)
    expect(module.getPhaseState('wc-over-2').phaseType).toBe('word_reveal');
  });

  it('isGameOver() returns false for insufficient passes', () => {
    const bag: Tile[] = [{ id: 't1', letter: 'A', points: 1, isBlank: false }];
    const racks: Tile[][] = [
      [{ id: 't2', letter: 'B', points: 3, isBlank: false }],
      [{ id: 't3', letter: 'C', points: 3, isBlank: false }],
    ];
    // 2 passes, 2 players → need 4 for game over
    expect(isGameOver(2, 2, false, racks)).toBe(false);
  });

  it('isGameOver() returns true when consecutive passes >= 2 * playerCount', () => {
    const racks: Tile[][] = [
      [{ id: 't1', letter: 'A', points: 1, isBlank: false }],
      [{ id: 't2', letter: 'B', points: 3, isBlank: false }],
    ];
    expect(isGameOver(4, 2, false, racks)).toBe(true);
  });

  it('isGameOver() returns true when bag empty and any rack empty', () => {
    const racks: Tile[][] = [
      [], // empty rack
      [{ id: 't1', letter: 'A', points: 1, isBlank: false }],
    ];
    expect(isGameOver(0, 2, true, racks)).toBe(true);
  });

  it('isGameOver() returns false when bag empty but all racks have tiles', () => {
    const racks: Tile[][] = [
      [{ id: 't1', letter: 'A', points: 1, isBlank: false }],
      [{ id: 't2', letter: 'B', points: 3, isBlank: false }],
    ];
    expect(isGameOver(0, 2, true, racks)).toBe(false);
  });

  it('applyEndGamePenalties deducts rack tile values from scores', () => {
    const scores = [100, 80];
    const racks: Tile[][] = [
      [
        { id: 't1', letter: 'A', points: 1, isBlank: false },
        { id: 't2', letter: 'Z', points: 10, isBlank: false },
      ],
      [{ id: 't3', letter: 'B', points: 3, isBlank: false }],
    ];
    const penalised = applyEndGamePenalties(scores, racks);
    expect(penalised[0]).toBe(89); // 100 - 1 - 10
    expect(penalised[1]).toBe(77); // 80 - 3
  });

  it('applyEndGamePenalties floors at 0 (no negative scores)', () => {
    const scores = [5, 0];
    const racks: Tile[][] = [
      [{ id: 't1', letter: 'Q', points: 10, isBlank: false }],
      [{ id: 't2', letter: 'Z', points: 10, isBlank: false }],
    ];
    const penalised = applyEndGamePenalties(scores, racks);
    expect(penalised[0]).toBe(0); // 5 - 10 → floored to 0
    expect(penalised[1]).toBe(0); // 0 - 10 → floored to 0
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — scoring (unit tests on board.ts)', () => {
  it('scoreWord computes plain letter values without premiums', () => {
    const board = createBoard();
    // Mark premiumUsed = true so no premium applies
    board[7]![7]!.premiumUsed = true;
    board[7]![8]!.premiumUsed = true;
    board[7]![9]!.premiumUsed = true;

    const wordCells = [
      { row: 7, col: 7, letter: 'C', points: 3, isNewTile: true },
      { row: 7, col: 8, letter: 'A', points: 1, isNewTile: true },
      { row: 7, col: 9, letter: 'T', points: 1, isNewTile: true },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(5); // C(3) + A(1) + T(1) = 5
  });

  it('scoreWord applies DL (double letter) to new tiles', () => {
    const board = createBoard();
    // row=7, col=3 is DL according to constants
    const wordCells = [
      { row: 7, col: 3, letter: 'A', points: 1, isNewTile: true }, // DL: 1*2 = 2
      { row: 7, col: 4, letter: 'T', points: 1, isNewTile: true }, // no premium
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(3); // A*2 + T = 2 + 1 = 3
  });

  it('scoreWord applies TL (triple letter) to new tiles', () => {
    const board = createBoard();
    // row=1, col=5 is TL according to constants
    const wordCells = [
      { row: 1, col: 5, letter: 'A', points: 1, isNewTile: true }, // TL: 1*3 = 3
      { row: 1, col: 6, letter: 'T', points: 1, isNewTile: true },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(4); // A*3 + T = 3 + 1 = 4
  });

  it('scoreWord applies DW (double word) to new tiles', () => {
    const board = createBoard();
    // row=1, col=1 is DW according to constants
    const wordCells = [
      { row: 1, col: 1, letter: 'A', points: 1, isNewTile: true }, // DW
      { row: 1, col: 2, letter: 'T', points: 1, isNewTile: true },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(4); // (A + T) * 2 = 4
  });

  it('scoreWord applies TW (triple word) to new tiles', () => {
    const board = createBoard();
    // row=0, col=0 is TW according to constants
    const wordCells = [
      { row: 0, col: 0, letter: 'A', points: 1, isNewTile: true }, // TW
      { row: 0, col: 1, letter: 'T', points: 1, isNewTile: true },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(6); // (A + T) * 3 = 6
  });

  it('scoreWord does NOT apply premium to existing tiles (isNewTile=false)', () => {
    const board = createBoard();
    // row=0, col=0 is TW but tile is existing (not new)
    const wordCells = [
      { row: 0, col: 0, letter: 'A', points: 1, isNewTile: false }, // TW, but not new
      { row: 0, col: 1, letter: 'T', points: 1, isNewTile: false },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(2); // no TW applied: A + T = 2
  });

  it('scoreWord does NOT apply premium when premiumUsed is already true', () => {
    const board = createBoard();
    board[0]![0]!.premiumUsed = true; // TW already used
    const wordCells = [
      { row: 0, col: 0, letter: 'A', points: 1, isNewTile: true },
      { row: 0, col: 1, letter: 'T', points: 1, isNewTile: true },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(2); // no TW: A + T = 2
  });

  it('scoreWord handles center DW square correctly', () => {
    const board = createBoard();
    // row=7, col=7 is DW (center star)
    const wordCells = [
      { row: 7, col: 7, letter: 'C', points: 3, isNewTile: true }, // DW applies
      { row: 7, col: 8, letter: 'A', points: 1, isNewTile: true },
    ];
    const score = scoreWord(board, wordCells);
    expect(score).toBe(8); // (C + A) * 2 = 8
  });

  it('calculatePlacementScore adds all-tiles bonus (50) for 7-tile play', () => {
    const board = createBoard();
    // Mark all cells as premiumUsed to isolate the bonus
    for (let r = 0; r < WC_BOARD_SIZE; r++) {
      for (let c = 0; c < WC_BOARD_SIZE; c++) {
        board[r]![c]!.premiumUsed = true;
      }
    }
    const mainWord = [
      { row: 7, col: 7, letter: 'A', points: 1, isNewTile: true },
      { row: 7, col: 8, letter: 'B', points: 3, isNewTile: true },
    ];
    const totalScore = calculatePlacementScore(board, mainWord, [], 7, 7);
    // Base: A(1) + B(3) = 4, bonus: +50 = 54
    expect(totalScore).toBe(54);
  });

  it('calculatePlacementScore does NOT add bonus for fewer than 7 tiles', () => {
    const board = createBoard();
    for (let r = 0; r < WC_BOARD_SIZE; r++) {
      for (let c = 0; c < WC_BOARD_SIZE; c++) {
        board[r]![c]!.premiumUsed = true;
      }
    }
    const mainWord = [
      { row: 7, col: 7, letter: 'A', points: 1, isNewTile: true },
      { row: 7, col: 8, letter: 'T', points: 1, isNewTile: true },
    ];
    const totalScore = calculatePlacementScore(board, mainWord, [], 2, 7);
    expect(totalScore).toBe(2); // no bonus
  });

  it('calculatePlacementScore includes cross-words in total', () => {
    const board = createBoard();
    for (let r = 0; r < WC_BOARD_SIZE; r++) {
      for (let c = 0; c < WC_BOARD_SIZE; c++) {
        board[r]![c]!.premiumUsed = true;
      }
    }
    const mainWord = [
      { row: 7, col: 7, letter: 'A', points: 1, isNewTile: true },
      { row: 7, col: 8, letter: 'T', points: 1, isNewTile: true },
    ];
    const crossWord = [
      { row: 6, col: 7, letter: 'C', points: 3, isNewTile: false },
      { row: 7, col: 7, letter: 'A', points: 1, isNewTile: true },
      { row: 8, col: 7, letter: 'B', points: 3, isNewTile: false },
    ];
    const totalScore = calculatePlacementScore(board, mainWord, [crossWord], 2, 7);
    // mainWord: 1+1=2, crossWord: 3+1+3=7, total=9
    expect(totalScore).toBe(9);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — board validation (unit tests on board.ts)', () => {
  it('validatePlacement rejects empty placement', () => {
    const board = createBoard();
    const rack: Tile[] = [];
    const r = validatePlacement(board, [], rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no tiles placed/i);
  });

  it('validatePlacement rejects tiles not in rack', () => {
    const board = createBoard();
    const rack: Tile[] = [{ id: 't1', letter: 'A', points: 1, isBlank: false }];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 'unknown-id' },
      { row: 7, col: 8, letter: 'T', tileId: 'also-unknown' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/not in your rack/i);
  });

  it('validatePlacement rejects out-of-bounds placement', () => {
    const board = createBoard();
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    const placed: PlacedTile[] = [
      { row: 99, col: 7, letter: 'A', tileId: 't1' },
      { row: 100, col: 7, letter: 'T', tileId: 't2' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/out of bounds/i);
  });

  it('validatePlacement rejects duplicate positions', () => {
    const board = createBoard();
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 't1' },
      { row: 7, col: 7, letter: 'T', tileId: 't2' }, // same position!
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/duplicate/i);
  });

  it('validatePlacement rejects occupied cells', () => {
    const board = createBoard();
    board[7]![7]!.tile = { id: 'existing', letter: 'X', points: 8, isBlank: false };

    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 't1' },
      { row: 7, col: 8, letter: 'T', tileId: 't2' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('already occupied');
  });

  it('validatePlacement rejects non-linear placement', () => {
    const board = createBoard();
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
      { id: 't3', letter: 'E', points: 1, isBlank: false },
    ];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 't1' },
      { row: 7, col: 8, letter: 'T', tileId: 't2' },
      { row: 8, col: 8, letter: 'E', tileId: 't3' }, // L-shape
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/straight line/i);
  });

  it('validatePlacement requires first word to cross center (7,7)', () => {
    const board = createBoard(); // empty
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    // Place far from center
    const placed: PlacedTile[] = [
      { row: 0, col: 0, letter: 'A', tileId: 't1' },
      { row: 0, col: 1, letter: 'T', tileId: 't2' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/center square/i);
  });

  it('validatePlacement requires word length >= 2', () => {
    const board = createBoard();
    const rack: Tile[] = [{ id: 't1', letter: 'A', points: 1, isBlank: false }];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 't1' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/at least 2/i);
  });

  it('validatePlacement succeeds for valid first word at center', () => {
    const board = createBoard();
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 't1' },
      { row: 7, col: 8, letter: 'T', tileId: 't2' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(true);
    expect(r.mainWord).toBeDefined();
    expect(r.mainWord!.length).toBe(2);
  });

  it('validatePlacement detects cross-words from existing board tiles', () => {
    const board = placeWordOnBoard(createBoard(), 'CAT', 7, 7);
    // Place 'A','T' vertically at col=9 extending below existing 'T' at (7,9)
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    // Vertical: row 8 and row 9, col 9 → connects to existing T at (7,9)
    const placed: PlacedTile[] = [
      { row: 8, col: 9, letter: 'A', tileId: 't1' },
      { row: 9, col: 9, letter: 'T', tileId: 't2' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(true);
    // Main word is vertical: T(existing) + A + T = "TAT"
    expect(r.mainWord).toBeDefined();
    expect(r.mainWord!.length).toBe(3);
  });

  it('validatePlacement requires connection to existing tiles on non-first play', () => {
    const board = placeWordOnBoard(createBoard(), 'CAT', 7, 7);
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    // Place completely isolated from existing tiles
    const placed: PlacedTile[] = [
      { row: 0, col: 0, letter: 'A', tileId: 't1' },
      { row: 0, col: 1, letter: 'T', tileId: 't2' },
    ];
    const r = validatePlacement(board, placed, rack);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/connect/i);
  });

  it('boardIsEmpty returns true for fresh board', () => {
    const board = createBoard();
    expect(boardIsEmpty(board)).toBe(true);
  });

  it('boardIsEmpty returns false after placing a tile', () => {
    const board = createBoard();
    board[7]![7]!.tile = { id: 't', letter: 'A', points: 1, isBlank: false };
    expect(boardIsEmpty(board)).toBe(false);
  });

  it('applyPlacement mutates board with placed tiles', () => {
    const board = createBoard();
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    const placed: PlacedTile[] = [
      { row: 7, col: 7, letter: 'A', tileId: 't1' },
      { row: 7, col: 8, letter: 'T', tileId: 't2' },
    ];
    applyPlacement(board, placed, rack);
    expect(board[7]![7]!.tile?.letter).toBe('A');
    expect(board[7]![8]!.tile?.letter).toBe('T');
    expect(board[7]![7]!.premiumUsed).toBe(true);
  });

  it('applyPlacement marks premium squares as used', () => {
    const board = createBoard();
    // (0,0) is TW, (0,1) has no premium
    const rack: Tile[] = [
      { id: 't1', letter: 'A', points: 1, isBlank: false },
      { id: 't2', letter: 'T', points: 1, isBlank: false },
    ];
    applyPlacement(board, [
      { row: 0, col: 0, letter: 'A', tileId: 't1' },
      { row: 0, col: 1, letter: 'T', tileId: 't2' },
    ], rack);
    expect(board[0]![0]!.premiumUsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — tile bag and rack (unit tests)', () => {
  it('createTileBag produces 100 tiles', () => {
    const bag = createTileBag();
    expect(bag.length).toBe(100);
  });

  it('createTileBag produces unique tile IDs', () => {
    const bag = createTileBag();
    const ids = new Set(bag.map(t => t.id));
    expect(ids.size).toBe(100);
  });

  it('createTileBag has correct letter distribution', () => {
    const bag = createTileBag();
    const counts: Record<string, number> = {};
    for (const tile of bag) {
      counts[tile.letter] = (counts[tile.letter] ?? 0) + 1;
    }
    expect(counts['A']).toBe(9);
    expect(counts['E']).toBe(12);
    expect(counts['Z']).toBe(1);
    expect(counts['Q']).toBe(1);
    expect(counts['']).toBe(2); // blank tiles
  });

  it('shuffleBag returns new array with same tiles', () => {
    const bag = createTileBag();
    const shuffled = shuffleBag(bag);
    expect(shuffled.length).toBe(bag.length);
    const origIds = new Set(bag.map(t => t.id));
    const shuffledIds = new Set(shuffled.map(t => t.id));
    expect(shuffledIds.size).toBe(origIds.size);
  });

  it('shuffleBag does not mutate input', () => {
    const bag = createTileBag();
    const firstId = bag[0]!.id;
    shuffleBag(bag);
    expect(bag[0]!.id).toBe(firstId); // original unchanged
  });

  it('drawTiles removes tiles from bag', () => {
    const bag = createTileBag();
    const initialLength = bag.length;
    const drawn = drawTiles(bag, 7);
    expect(drawn.length).toBe(7);
    expect(bag.length).toBe(initialLength - 7);
  });

  it('drawTiles draws no more than bag length', () => {
    const bag: Tile[] = [{ id: 't1', letter: 'A', points: 1, isBlank: false }];
    const drawn = drawTiles(bag, 10);
    expect(drawn.length).toBe(1);
    expect(bag.length).toBe(0);
  });

  it('drawTiles from empty bag returns empty array', () => {
    const bag: Tile[] = [];
    const drawn = drawTiles(bag, 7);
    expect(drawn.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — dictionary integration', () => {
  it('isValidWord accepts common English words', () => {
    expect(isValidWord('CAT')).toBe(true);
    expect(isValidWord('DOG')).toBe(true);
    expect(isValidWord('WORD')).toBe(true);
    expect(isValidWord('PLAY')).toBe(true);
  });

  it('isValidWord is case-insensitive', () => {
    expect(isValidWord('cat')).toBe(true);
    expect(isValidWord('Cat')).toBe(true);
    expect(isValidWord('CAT')).toBe(true);
  });

  it('isValidWord rejects nonsense words', () => {
    expect(isValidWord('ZZZZZ')).toBe(false);
    expect(isValidWord('XKCD')).toBe(false);
    expect(isValidWord('QQQ')).toBe(false);
  });

  it('isValidWord rejects empty string', () => {
    expect(isValidWord('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('WordCraft V2 — state visibility', () => {
  it('getPublicState returns globals object', () => {
    const { module } = setupAndStart('wc-vis-1');
    const pub = module.getPublicState('wc-vis-1') as any;
    expect(pub.globals).toBeDefined();
    expect(typeof pub.globals).toBe('object');
  });

  it('getPublicState includes board_json', () => {
    const { module } = setupAndStart('wc-vis-2');
    const pub = module.getPublicState('wc-vis-2') as any;
    expect(typeof pub.globals?.board_json).toBe('string');
  });

  it('getPublicState includes tiles_in_bag count', () => {
    const { module } = setupAndStart('wc-vis-3');
    const pub = module.getPublicState('wc-vis-3') as any;
    expect(typeof pub.globals?.tiles_in_bag).toBe('number');
  });

  it('getPublicState includes turn_order array', () => {
    const { module } = setupAndStart('wc-vis-4');
    const pub = module.getPublicState('wc-vis-4') as any;
    expect(Array.isArray(pub.globals?.turn_order)).toBe(true);
  });

  it('getPrivateState enriches with isMyTurn and rack', () => {
    const { module } = setupAndStart('wc-vis-5');
    const turnOrder = getTurnOrder(module, 'wc-vis-5');
    const currentId = turnOrder[0]!;
    const priv = module.getPrivateState('wc-vis-5', currentId) as any;
    expect(typeof priv.isMyTurn).toBe('boolean');
    expect(priv.isMyTurn).toBe(true);
    expect(Array.isArray(priv.rack)).toBe(true);
  });

  it('getPrivateState: non-current player has isMyTurn = false', () => {
    const { module } = setupAndStart('wc-vis-6');
    const turnOrder = getTurnOrder(module, 'wc-vis-6');
    const notCurrentId = turnOrder.find(id => id !== turnOrder[0])!;
    const priv = module.getPrivateState('wc-vis-6', notCurrentId) as any;
    expect(priv.isMyTurn).toBe(false);
  });

  it('getPrivateState includes canPass = true', () => {
    const { module } = setupAndStart('wc-vis-7');
    const currentId = getCurrentPlayerId(module, 'wc-vis-7')!;
    const priv = module.getPrivateState('wc-vis-7', currentId) as any;
    expect(priv.canPass).toBe(true);
  });

  it('getPrivateState includes canSwap = true when bag has >= 7 tiles', () => {
    const { module } = setupAndStart('wc-vis-8');
    const currentId = getCurrentPlayerId(module, 'wc-vis-8')!;
    const priv = module.getPrivateState('wc-vis-8', currentId) as any;
    // bag has 86 tiles initially, so swap is allowed
    expect(priv.canSwap).toBe(true);
  });

  it('getPhaseState returns phaseType', () => {
    const { module } = setupAndStart('wc-vis-9');
    const ps = module.getPhaseState('wc-vis-9');
    expect(ps.phaseType).toBe('playing');
    expect(typeof ps.roundNumber).toBe('number');
  });

  it('bag_json is redacted in public state (private/omit field)', () => {
    const { module } = setupAndStart('wc-vis-10');
    const pub = module.getPublicState('wc-vis-10') as any;
    // bag_json has visibility: private, redaction: omit
    // It should NOT appear in public globals
    expect(pub.globals?.bag_json).toBeUndefined();
  });
});
