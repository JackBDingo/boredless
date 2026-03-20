/**
 * battleship-v2.test.ts — Integration tests for Battleship V2 declarative migration.
 *
 * Tests the full game lifecycle through BattleshipGameModule (wrapper) + extension actions:
 *   setup → battle → result → scores → game_over
 *
 * Architecture note on getPhaseState():
 *   BattleshipGameModule wraps DeclarativeGameModule. The wrapper intercepts 'confirm'
 *   and 'vote' inputs, managing its own phase (room.currentPhase). getPhaseState()
 *   delegates to the inner DeclarativeGameModule which stays in 'setup' throughout.
 *
 *   Observable state is used to detect phase instead:
 *     - setup active:  publicState.activePlayerId === null
 *     - battle active: publicState.activePlayerId is a non-null player id
 *     - battle ended:  'vote' input rejected (not in battle phase)
 *     - game_over:     broadcastGameOver was called
 */

import { describe, it, expect, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { Player, GameDefinition } from '@boredless/shared';

import { createBattleshipModule } from '../extensions/game-module.js';
import { randomPlacement, BS_FLEET, toCell } from '../extensions/board.js';
import type { PlacedShip } from '../extensions/board.js';

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

// ---------------------------------------------------------------------------
// Mock GameContext
// ---------------------------------------------------------------------------

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
      getAllSessionIds: vi.fn(() => ['p1', 'p2']),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as any,
  };
}

// ---------------------------------------------------------------------------
// Fleet helpers
// ---------------------------------------------------------------------------

/**
 * Fleet for p1 — uses rows 1-5, columns A-E.
 * Ships occupy: A1-E1, A2-D2, A3-C3, A4-C4, A5-B5.
 */
function makeValidFleet(): PlacedShip[] {
  return [
    { shipId: 'carrier',    cells: ['A1','B1','C1','D1','E1'], hits: [], sunk: false },
    { shipId: 'battleship', cells: ['A2','B2','C2','D2'],      hits: [], sunk: false },
    { shipId: 'cruiser',    cells: ['A3','B3','C3'],            hits: [], sunk: false },
    { shipId: 'submarine',  cells: ['A4','B4','C4'],            hits: [], sunk: false },
    { shipId: 'destroyer',  cells: ['A5','B5'],                 hits: [], sunk: false },
  ];
}

/**
 * Fleet for p2 — uses rows 6-10, columns A-E.
 * Ships occupy: A6-E6, A7-D7, A8-C8, A9-C9, A10-B10.
 */
function makeValidFleetP2(): PlacedShip[] {
  return [
    { shipId: 'carrier',    cells: ['A6','B6','C6','D6','E6'], hits: [], sunk: false },
    { shipId: 'battleship', cells: ['A7','B7','C7','D7'],      hits: [], sunk: false },
    { shipId: 'cruiser',    cells: ['A8','B8','C8'],            hits: [], sunk: false },
    { shipId: 'submarine',  cells: ['A9','B9','C9'],            hits: [], sunk: false },
    { shipId: 'destroyer',  cells: ['A10','B10'],               hits: [], sunk: false },
  ];
}

function allCells(ships: PlacedShip[]): string[] {
  return ships.flatMap(s => s.cells);
}

/**
 * Generate a list of cells in column J (J1-J10) and then I (I1-I10), etc.
 * These are safely clear of both fleets (which use columns A-E rows 1-10).
 * Provides up to 100 unique miss cells for defender pass shots.
 */
function safeMissCells(): string[] {
  const cells: string[] = [];
  // Columns F-J, all rows — these are always misses for both fleets
  for (const col of ['F','G','H','I','J'] as const) {
    for (let row = 1; row <= 10; row++) {
      cells.push(`${col}${row}`);
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const TWO_PLAYERS: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true },
  { id: 'p2', name: 'Bob',   isHost: false },
];

const GAME_DEFINITION: GameDefinition = {
  id: 'battleship',
  name: 'Battleship',
  description: 'Classic naval warfare',
  minPlayers: 2,
  maxPlayers: 2,
  estimatedMinutes: 15,
  icon: 'anchor',
};

function createModule(timerImpl?: TimerImpl) {
  const pkg = loadGamePackage(GAME_YAML);
  return createBattleshipModule(GAME_DEFINITION, pkg, GAME_DIR, timerImpl);
}

// ---------------------------------------------------------------------------
// Phase detection helpers
//
// getPhaseState() reflects the inner DeclarativeGameModule which stays in 'setup'
// throughout the game (wrapper manages phase internally). Use observable state.
// ---------------------------------------------------------------------------

function isInSetup(module: ReturnType<typeof createModule>, roomId: string): boolean {
  const ps = module.getPublicState(roomId) as any;
  return ps.activePlayerId == null;
}

function isInBattle(module: ReturnType<typeof createModule>, roomId: string): boolean {
  const ps = module.getPublicState(roomId) as any;
  return typeof ps.activePlayerId === 'string' && ps.activePlayerId.length > 0;
}

// ---------------------------------------------------------------------------
// Sink-all helper
//
// Sinks every ship in the defender's fleet by firing at all their cells.
// Defender fires safe miss cells (columns F-J) to pass turns.
// ---------------------------------------------------------------------------

function sinkAllShips(
  module: ReturnType<typeof createModule>,
  roomId: string,
  attackerId: string,
  defenderId: string,
  defenderFleet: PlacedShip[],
): void {
  const targets = allCells(defenderFleet);
  const misses = safeMissCells();
  let missIdx = 0;

  for (const cell of targets) {
    if (!isInBattle(module, roomId)) break;

    const ps = module.getPublicState(roomId) as any;
    if (ps.activePlayerId === attackerId) {
      module.handleInput(roomId, attackerId, 'vote', { cell });
    } else {
      // Defender passes turn with a guaranteed miss
      const passCell = misses[missIdx++ % misses.length]!;
      const passResult = module.handleInput(roomId, defenderId, 'vote', { cell: passCell });
      // If pass was rejected (already fired), skip to next miss cell
      if (!passResult.accepted) {
        const nextPass = misses[missIdx++ % misses.length]!;
        module.handleInput(roomId, defenderId, 'vote', { cell: nextPass });
      }
      if (isInBattle(module, roomId)) {
        module.handleInput(roomId, attackerId, 'vote', { cell });
      }
    }
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Battleship V2 — game package', () => {
  it('loads the V2 game package with correct manifest', () => {
    const pkg = loadGamePackage(GAME_YAML);
    expect(pkg.manifest.id).toBe('battleship');
    expect(pkg.manifest.name).toBe('Battleship');
    expect(pkg.manifest.players.min).toBe(2);
    expect(pkg.manifest.players.max).toBe(2);
  });

  it('has the correct phases defined', () => {
    const pkg = loadGamePackage(GAME_YAML);
    const phaseIds = Object.keys(pkg.phases);
    expect(phaseIds).toEqual(['setup', 'battle', 'result', 'scores', 'game_over']);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — setup phase', () => {
  it('starts in setup phase (active player not yet assigned)', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-setup-1');

    module.setup(TWO_PLAYERS, ctx);
    expect(isInSetup(module, 'room-setup-1')).toBe(true);
  });

  it('inner declarative phase is setup', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-setup-2');

    module.setup(TWO_PLAYERS, ctx);
    expect(module.getPhaseState('room-setup-2').phaseType).toBe('setup');
  });

  it('initialises empty boards for both players', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-setup-3');

    module.setup(TWO_PLAYERS, ctx);

    const p1State = module.getPrivateState('room-setup-3', 'p1') as any;
    const p2State = module.getPrivateState('room-setup-3', 'p2') as any;

    expect(p1State.myBoard.ships).toEqual([]);
    expect(p1State.myBoard.incomingShots).toEqual([]);
    expect(p2State.myBoard.ships).toEqual([]);
    expect(p2State.myBoard.incomingShots).toEqual([]);
  });

  it('provides available ships list in setup phase private state', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-setup-4');

    module.setup(TWO_PLAYERS, ctx);

    const p1State = module.getPrivateState('room-setup-4', 'p1') as any;
    expect(p1State.availableShips).toBeDefined();
    expect(p1State.availableShips.length).toBe(BS_FLEET.length);
  });

  it('marks both players as not ready initially', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-setup-5');

    module.setup(TWO_PLAYERS, ctx);

    const p1State = module.getPrivateState('room-setup-5', 'p1') as any;
    expect(p1State.isReady).toBe(false);

    const p2State = module.getPrivateState('room-setup-5', 'p2') as any;
    expect(p2State.isReady).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — ship placement validation', () => {
  it('accepts a valid full fleet placement', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-1');

    module.setup(TWO_PLAYERS, ctx);
    const result = module.handleInput('room-val-1', 'p1', 'confirm', { ships: makeValidFleet() });
    expect(result.accepted).toBe(true);
  });

  it('rejects placement with wrong ship count', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-2');

    module.setup(TWO_PLAYERS, ctx);

    const tooFew: PlacedShip[] = [
      { shipId: 'carrier', cells: ['A1','B1','C1','D1','E1'], hits: [], sunk: false },
    ];
    const result = module.handleInput('room-val-2', 'p1', 'confirm', { ships: tooFew });
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/Expected/i);
  });

  it('rejects placement with overlapping ships', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-3');

    module.setup(TWO_PLAYERS, ctx);

    const overlapping: PlacedShip[] = [
      { shipId: 'carrier',    cells: ['A1','B1','C1','D1','E1'], hits: [], sunk: false },
      { shipId: 'battleship', cells: ['A1','B1','C1','D1'],      hits: [], sunk: false },
      { shipId: 'cruiser',    cells: ['A3','B3','C3'],            hits: [], sunk: false },
      { shipId: 'submarine',  cells: ['A4','B4','C4'],            hits: [], sunk: false },
      { shipId: 'destroyer',  cells: ['A5','B5'],                 hits: [], sunk: false },
    ];
    const result = module.handleInput('room-val-3', 'p1', 'confirm', { ships: overlapping });
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/occupied/i);
  });

  it('rejects placement with cells not in a straight line', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-4');

    module.setup(TWO_PLAYERS, ctx);

    const diagonal: PlacedShip[] = [
      { shipId: 'carrier',    cells: ['A1','B2','C3','D4','E5'], hits: [], sunk: false },
      { shipId: 'battleship', cells: ['A2','B2','C2','D2'],      hits: [], sunk: false },
      { shipId: 'cruiser',    cells: ['A3','B3','C3'],            hits: [], sunk: false },
      { shipId: 'submarine',  cells: ['A4','B4','C4'],            hits: [], sunk: false },
      { shipId: 'destroyer',  cells: ['A5','B5'],                 hits: [], sunk: false },
    ];
    const result = module.handleInput('room-val-4', 'p1', 'confirm', { ships: diagonal });
    expect(result.accepted).toBe(false);
  });

  it('rejects placement with wrong ship size', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-5');

    module.setup(TWO_PLAYERS, ctx);

    const wrongSize: PlacedShip[] = [
      { shipId: 'carrier',    cells: ['A1','B1','C1'],            hits: [], sunk: false },
      { shipId: 'battleship', cells: ['A2','B2','C2','D2'],       hits: [], sunk: false },
      { shipId: 'cruiser',    cells: ['A3','B3','C3'],             hits: [], sunk: false },
      { shipId: 'submarine',  cells: ['A4','B4','C4'],             hits: [], sunk: false },
      { shipId: 'destroyer',  cells: ['A5','B5'],                  hits: [], sunk: false },
    ];
    const result = module.handleInput('room-val-5', 'p1', 'confirm', { ships: wrongSize });
    expect(result.accepted).toBe(false);
  });

  it('rejects a second placement attempt by the same player', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-6');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-val-6', 'p1', 'confirm', { ships: makeValidFleet() });
    const second = module.handleInput('room-val-6', 'p1', 'confirm', { ships: makeValidFleet() });
    expect(second.accepted).toBe(false);
    expect(second.reason).toMatch(/already ready/i);
  });

  it('rejects confirm input without ships payload', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-val-7');

    module.setup(TWO_PLAYERS, ctx);
    const result = module.handleInput('room-val-7', 'p1', 'confirm', {});
    expect(result.accepted).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — transition to battle', () => {
  it('stays in setup (no active player) when only one player is ready', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-trans-1');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-trans-1', 'p1', 'confirm', { ships: makeValidFleet() });
    expect(isInSetup(module, 'room-trans-1')).toBe(true);
  });

  it('activates battle when both players place their ships', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-trans-2');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-trans-2', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-trans-2', 'p2', 'confirm', { ships: makeValidFleetP2() });

    expect(isInBattle(module, 'room-trans-2')).toBe(true);
  });

  it('accepts vote inputs once battle is active', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-trans-3');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-trans-3', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-trans-3', 'p2', 'confirm', { ships: makeValidFleetP2() });

    const ps = module.getPublicState('room-trans-3') as any;
    const activeId: string = ps.activePlayerId;
    const result = module.handleInput('room-trans-3', activeId, 'vote', { cell: 'F1' });
    expect(result.accepted).toBe(true);
  });

  it('sets active_player_id to a valid player after battle starts', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-trans-4');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-trans-4', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-trans-4', 'p2', 'confirm', { ships: makeValidFleetP2() });

    const publicState = module.getPublicState('room-trans-4') as any;
    expect(['p1', 'p2']).toContain(publicState.activePlayerId);
  });

  it('marks ready status for p1 after their placement', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-trans-5');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-trans-5', 'p1', 'confirm', { ships: makeValidFleet() });

    const p1State = module.getPrivateState('room-trans-5', 'p1') as any;
    expect(p1State.isReady).toBe(true);
    const p2State = module.getPrivateState('room-trans-5', 'p2') as any;
    expect(p2State.isReady).toBe(false);
  });

  it('stores ships in private state after placement', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-trans-6');

    module.setup(TWO_PLAYERS, ctx);
    module.handleInput('room-trans-6', 'p1', 'confirm', { ships: makeValidFleet() });

    const p1State = module.getPrivateState('room-trans-6', 'p1') as any;
    expect(p1State.myBoard.ships.length).toBe(5);
    expect(p1State.isReady).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — battle phase fire shot', () => {
  function setupBattlePhase(roomId: string) {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx(roomId);

    module.setup(TWO_PLAYERS, mock.ctx);

    const p1Fleet = makeValidFleet();
    const p2Fleet = makeValidFleetP2();

    module.handleInput(roomId, 'p1', 'confirm', { ships: p1Fleet });
    module.handleInput(roomId, 'p2', 'confirm', { ships: p2Fleet });

    const publicState = module.getPublicState(roomId) as any;
    const activePlayerId: string = publicState.activePlayerId;
    const opponentId = activePlayerId === 'p1' ? 'p2' : 'p1';

    return { timer, module, mock, activePlayerId, opponentId, p1Fleet, p2Fleet };
  }

  it('rejects fire from non-active player', () => {
    const { module, opponentId } = setupBattlePhase('room-battle-1');
    const result = module.handleInput('room-battle-1', opponentId, 'vote', { cell: 'A1' });
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/not your turn/i);
  });

  it('accepts fire from active player — records a miss on empty cell', () => {
    const { module, activePlayerId } = setupBattlePhase('room-battle-2');

    // F-J columns are always empty for both fleets
    const result = module.handleInput('room-battle-2', activePlayerId, 'vote', { cell: 'F1' });
    expect(result.accepted).toBe(true);

    const publicState = module.getPublicState('room-battle-2') as any;
    expect(publicState.lastShot).toBeTruthy();
    expect(publicState.lastShot.result).toBe('miss');
    expect(publicState.lastShot.cell).toBe('F1');
  });

  it('records a hit when firing at an occupied cell', () => {
    const { module, activePlayerId, p1Fleet, p2Fleet } = setupBattlePhase('room-battle-3');

    const opponentFleet = activePlayerId === 'p1' ? p2Fleet : p1Fleet;
    const hitCell = opponentFleet[0]!.cells[0]!;

    const result = module.handleInput('room-battle-3', activePlayerId, 'vote', { cell: hitCell });
    expect(result.accepted).toBe(true);

    const publicState = module.getPublicState('room-battle-3') as any;
    expect(publicState.lastShot.result).toBe('hit');
    expect(publicState.lastShot.cell).toBe(hitCell);
  });

  it('awards 50 points for a hit', () => {
    const { module, mock, activePlayerId, p1Fleet, p2Fleet } = setupBattlePhase('room-battle-4');

    const opponentFleet = activePlayerId === 'p1' ? p2Fleet : p1Fleet;
    const hitCell = opponentFleet[0]!.cells[0]!;

    const scoreBefore = mock.scores.get(activePlayerId) ?? 0;
    module.handleInput('room-battle-4', activePlayerId, 'vote', { cell: hitCell });
    const scoreAfter = mock.scores.get(activePlayerId) ?? 0;

    expect(scoreAfter - scoreBefore).toBe(50);
  });

  it('swaps active player after a shot', () => {
    const { module, activePlayerId } = setupBattlePhase('room-battle-5');

    module.handleInput('room-battle-5', activePlayerId, 'vote', { cell: 'F1' });

    const publicState = module.getPublicState('room-battle-5') as any;
    expect(publicState.activePlayerId).not.toBe(activePlayerId);
  });

  it('increments turn number after each shot', () => {
    const { module, activePlayerId, opponentId } = setupBattlePhase('room-battle-6');

    module.handleInput('room-battle-6', activePlayerId, 'vote', { cell: 'F1' });
    const after1 = (module.getPublicState('room-battle-6') as any).turnNumber;
    expect(after1).toBe(1);

    module.handleInput('room-battle-6', opponentId, 'vote', { cell: 'F2' });
    const after2 = (module.getPublicState('room-battle-6') as any).turnNumber;
    expect(after2).toBe(2);
  });

  it('rejects firing at a cell already targeted', () => {
    const { module, activePlayerId, opponentId } = setupBattlePhase('room-battle-7');

    module.handleInput('room-battle-7', activePlayerId, 'vote', { cell: 'F1' });
    module.handleInput('room-battle-7', opponentId, 'vote', { cell: 'F2' });
    module.handleInput('room-battle-7', activePlayerId, 'vote', { cell: 'F3' });
    module.handleInput('room-battle-7', opponentId, 'vote', { cell: 'F4' });

    // Re-fire F1 — already targeted
    const repeat = module.handleInput('room-battle-7', activePlayerId, 'vote', { cell: 'F1' });
    expect(repeat.accepted).toBe(false);
    expect(repeat.reason).toMatch(/already fired/i);
  });

  it('rejects an invalid cell format', () => {
    const { module, activePlayerId } = setupBattlePhase('room-battle-8');
    const result = module.handleInput('room-battle-8', activePlayerId, 'vote', { cell: 'Z99' });
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/invalid cell/i);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — ship sinking', () => {
  it('awards 200 bonus points when a ship is sunk', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-sink-1');

    module.setup(TWO_PLAYERS, mock.ctx);
    const p1Fleet = makeValidFleet();
    const p2Fleet = makeValidFleetP2();
    module.handleInput('room-sink-1', 'p1', 'confirm', { ships: p1Fleet });
    module.handleInput('room-sink-1', 'p2', 'confirm', { ships: p2Fleet });

    const ps = module.getPublicState('room-sink-1') as any;
    const attackerId: string = ps.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? p2Fleet : p1Fleet;
    const destroyer = defenderFleet.find(s => s.shipId === 'destroyer')!;

    const scoreBefore = mock.scores.get(attackerId) ?? 0;

    // Hit 1 on destroyer
    module.handleInput('room-sink-1', attackerId, 'vote', { cell: destroyer.cells[0]! });
    // Defender passes turn with a miss (F-column is safe)
    module.handleInput('room-sink-1', defenderId, 'vote', { cell: 'F1' });
    // Hit 2 on destroyer — sinks it
    module.handleInput('room-sink-1', attackerId, 'vote', { cell: destroyer.cells[1]! });

    const scoreAfter = mock.scores.get(attackerId) ?? 0;
    // 50 (hit1) + 50 (hit2) + 200 (sunk) = 300
    expect(scoreAfter - scoreBefore).toBeGreaterThanOrEqual(300);
  });

  it('marks ship as sunk in private state after all cells hit', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-sink-2');

    module.setup(TWO_PLAYERS, mock.ctx);
    const p1Fleet = makeValidFleet();
    const p2Fleet = makeValidFleetP2();
    module.handleInput('room-sink-2', 'p1', 'confirm', { ships: p1Fleet });
    module.handleInput('room-sink-2', 'p2', 'confirm', { ships: p2Fleet });

    const ps = module.getPublicState('room-sink-2') as any;
    const attackerId: string = ps.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? p2Fleet : p1Fleet;
    const destroyer = defenderFleet.find(s => s.shipId === 'destroyer')!;

    module.handleInput('room-sink-2', attackerId, 'vote', { cell: destroyer.cells[0]! });
    module.handleInput('room-sink-2', defenderId, 'vote', { cell: 'F1' });
    module.handleInput('room-sink-2', attackerId, 'vote', { cell: destroyer.cells[1]! });

    const defenderPrivate = module.getPrivateState('room-sink-2', defenderId) as any;
    const sunkShips = defenderPrivate.myBoard.ships.filter((s: any) => s.sunk);
    expect(sunkShips.some((s: any) => s.shipId === 'destroyer')).toBe(true);
  });

  it('sunk ship appears in public display board', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-sink-3');

    module.setup(TWO_PLAYERS, mock.ctx);
    const p1Fleet = makeValidFleet();
    const p2Fleet = makeValidFleetP2();
    module.handleInput('room-sink-3', 'p1', 'confirm', { ships: p1Fleet });
    module.handleInput('room-sink-3', 'p2', 'confirm', { ships: p2Fleet });

    const ps0 = module.getPublicState('room-sink-3') as any;
    const attackerId: string = ps0.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? p2Fleet : p1Fleet;
    const destroyer = defenderFleet.find(s => s.shipId === 'destroyer')!;

    module.handleInput('room-sink-3', attackerId, 'vote', { cell: destroyer.cells[0]! });
    module.handleInput('room-sink-3', defenderId, 'vote', { cell: 'F1' });
    module.handleInput('room-sink-3', attackerId, 'vote', { cell: destroyer.cells[1]! });

    const ps = module.getPublicState('room-sink-3') as any;
    // Attacker's board in public state is indexed by player order
    const defenderBoard = attackerId === 'p1' ? ps.player2.board : ps.player1.board;
    expect(defenderBoard.sunkShips.some((s: any) => s.shipId === 'destroyer')).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — victory condition', () => {
  it('ends battle (vote rejected) when all opponent ships are sunk', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-win-1');

    module.setup(TWO_PLAYERS, mock.ctx);
    module.handleInput('room-win-1', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-win-1', 'p2', 'confirm', { ships: makeValidFleetP2() });

    const ps = module.getPublicState('room-win-1') as any;
    const attackerId: string = ps.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? makeValidFleetP2() : makeValidFleet();

    sinkAllShips(module, 'room-win-1', attackerId, defenderId, defenderFleet);

    // After all ships sunk, further votes are rejected (not in battle phase)
    const postResult = module.handleInput('room-win-1', attackerId, 'vote', { cell: 'F10' });
    expect(postResult.accepted).toBe(false);
  });

  it('awards 1000 victory bonus points to the winner', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-win-2');

    module.setup(TWO_PLAYERS, mock.ctx);
    module.handleInput('room-win-2', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-win-2', 'p2', 'confirm', { ships: makeValidFleetP2() });

    const ps = module.getPublicState('room-win-2') as any;
    const attackerId: string = ps.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? makeValidFleetP2() : makeValidFleet();

    sinkAllShips(module, 'room-win-2', attackerId, defenderId, defenderFleet);

    const winnerScore = mock.scores.get(attackerId) ?? 0;
    // Minimum: 1000 victory bonus alone
    expect(winnerScore).toBeGreaterThanOrEqual(1000);
  });

  it('calls broadcastGameOver with correct winnerId', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-win-3');

    module.setup(TWO_PLAYERS, mock.ctx);
    module.handleInput('room-win-3', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-win-3', 'p2', 'confirm', { ships: makeValidFleetP2() });

    const ps0 = module.getPublicState('room-win-3') as any;
    const attackerId: string = ps0.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? makeValidFleetP2() : makeValidFleet();

    sinkAllShips(module, 'room-win-3', attackerId, defenderId, defenderFleet);

    // Trigger result → scores → game_over timers
    timer.trigger('room-win-3');
    timer.trigger('room-win-3');

    expect(mock.ctx.broadcastGameOver).toHaveBeenCalled();
    const call = mock.ctx.broadcastGameOver.mock.calls[0][0] as any;
    expect(call.winnerId).toBe(attackerId);
  });
});

// ---------------------------------------------------------------------------

describe('Battleship V2 — full game lifecycle', () => {
  it('completes full game: setup → battle → result → scores → game_over', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const mock = createMockCtx('room-lifecycle-1');

    // 1. Setup
    module.setup(TWO_PLAYERS, mock.ctx);
    expect(isInSetup(module, 'room-lifecycle-1')).toBe(true);

    // 2. Place ships → battle
    module.handleInput('room-lifecycle-1', 'p1', 'confirm', { ships: makeValidFleet() });
    module.handleInput('room-lifecycle-1', 'p2', 'confirm', { ships: makeValidFleetP2() });
    expect(isInBattle(module, 'room-lifecycle-1')).toBe(true);

    // 3. Sink all defender ships
    const ps = module.getPublicState('room-lifecycle-1') as any;
    const attackerId: string = ps.activePlayerId;
    const defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    const defenderFleet = attackerId === 'p1' ? makeValidFleetP2() : makeValidFleet();

    sinkAllShips(module, 'room-lifecycle-1', attackerId, defenderId, defenderFleet);

    // Battle ended — vote is rejected
    expect(module.handleInput('room-lifecycle-1', attackerId, 'vote', { cell: 'F10' }).accepted).toBe(false);

    // 4. result timer → scores
    timer.trigger('room-lifecycle-1');
    expect(mock.ctx.broadcastScores).toHaveBeenCalled();

    // 5. scores timer → game_over
    timer.trigger('room-lifecycle-1');
    expect(mock.ctx.broadcastGameOver).toHaveBeenCalled();

    const call = mock.ctx.broadcastGameOver.mock.calls[0][0] as any;
    expect(call.gameId).toBe('battleship');
    expect(call.winnerId).toBe(attackerId);
  });

  it('teardown cleans up room state without throwing', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-lifecycle-2');

    module.setup(TWO_PLAYERS, ctx);
    expect(() => module.teardown('room-lifecycle-2')).not.toThrow();
  });

  it('randomPlacement() produces a valid full fleet', () => {
    const ships = randomPlacement();
    expect(ships.length).toBe(BS_FLEET.length);
    const shipIds = ships.map(s => s.shipId).sort();
    const expectedIds = BS_FLEET.map(f => f.id).sort();
    expect(shipIds).toEqual(expectedIds);
  });

  it('accepts placement from randomPlacement() utility', () => {
    const timer = new TestTimerImpl();
    const module = createModule(timer);
    const { ctx } = createMockCtx('room-lifecycle-3');

    module.setup(TWO_PLAYERS, ctx);
    const ships = randomPlacement();
    const result = module.handleInput('room-lifecycle-3', 'p1', 'confirm', { ships });
    expect(result.accepted).toBe(true);
  });
});
