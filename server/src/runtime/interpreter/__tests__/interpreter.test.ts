/**
 * interpreter.test.ts — Tests for the Declarative Game Interpreter (Phase 1.3).
 *
 * Tests cover:
 * - Initialization: StateManager created with correct player IDs
 * - Initial phase is the first phase defined in schema
 * - State initialized from schema defaults
 * - handleInput during input_gate stores value in StateManager
 * - handleInput from unknown player rejected
 * - After all players submit, phase advances
 * - getPublicState returns current phase + public state fields
 * - getPrivateState returns player's private fields
 * - Integration: full game cycle from game.yaml fixture
 *
 * GameContext mocking:
 * We create a MockGameContext that captures all calls to broadcastPhase,
 * sendPrivateState, addPoints, startTimer, etc. so we can assert on them.
 * This mirrors the approach used in the phase-machine integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player, PhaseState, GameDefinition, GameOverState, ScoreEntry, ServerMessage } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';
import type { Room } from '@boredless/shared';
import type { RoomStatus } from '@boredless/shared';
import { DeclarativeGameModule } from '../declarative-game-module.js';
import { loadGamePackage } from '../../schema-engine/index.js';
import type { TimerImpl } from '../../phase-machine/index.js';
import type { GameContext } from '../../../games/game-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, '../../../../../games/_test-v2/game.yaml');

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/**
 * Controllable timer implementation for unit tests.
 * Captures the onExpire callback and exposes trigger() to fire it manually.
 */
class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();
  public calls: Array<{ roomId: string; phaseType: string; durationMs: number }> = [];

  start(
    roomId: string,
    phaseType: string,
    durationMs: number,
    _sessionIds: string[],
    onExpire: () => void,
  ): void {
    this.calls.push({ roomId, phaseType, durationMs });
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

  isRunning(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }
}

/**
 * Mock GameContext that captures all calls.
 */
class MockGameContext implements GameContext {
  readonly roomId: string;

  broadcastPhaseCalls: Array<{ phase: PhaseState; publicState: Record<string, unknown> }> = [];
  broadcastPrivateStateCalls: number = 0;
  broadcastGameOverCalls: GameOverState[] = [];
  addPointsCalls: Array<{ playerId: string; points: number }> = [];
  sendToAllCalls: ServerMessage[] = [];
  sendToPlayerCalls: Array<{ playerId: string; message: ServerMessage }> = [];
  setRoomStatusCalls: RoomStatus[] = [];
  initScoresCalls: string[][] = [];

  private timerImpl: TestTimerImpl;

  constructor(roomId: string, timerImpl: TestTimerImpl) {
    this.roomId = roomId;
    this.timerImpl = timerImpl;
  }

  // Timer
  startTimer(phaseType: string, durationMs: number, onExpire: () => void): void {
    this.timerImpl.start(this.roomId, phaseType, durationMs, [], onExpire);
  }
  stopTimer(): void {
    this.timerImpl.stop(this.roomId);
  }
  getTimerRemaining(): number | null {
    return this.timerImpl.getRemaining(this.roomId);
  }

  // Messaging
  sendToAll(message: ServerMessage): void {
    this.sendToAllCalls.push(message);
  }
  sendToPlayer(playerId: string, message: ServerMessage): void {
    this.sendToPlayerCalls.push({ playerId, message });
  }
  sendToDisplay(_message: ServerMessage): void {}

  // Event Bus
  emit(_event: string, _data?: unknown): void {}
  emitTo(_playerId: string, _event: string, _data?: unknown): void {}
  emitToDisplay(_event: string, _data?: unknown): void {}

  // Scores
  private scores = new Map<string, number>();
  initScores(playerIds: string[]): void {
    this.initScoresCalls.push(playerIds);
    for (const id of playerIds) {
      this.scores.set(id, 0);
    }
  }
  addPoints(playerId: string, points: number): void {
    this.addPointsCalls.push({ playerId, points });
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + points);
  }
  getScore(playerId: string): number {
    return this.scores.get(playerId) ?? 0;
  }
  getScores(): ScoreEntry[] {
    return [...this.scores.entries()].map(([playerId, score]) => ({
      playerId,
      playerName: playerId,
      playerColor: '#000000',
      score,
      roundScore: 0,
    }));
  }
  broadcastScores(_roundScores?: Map<string, number>): void {}
  clearScores(): void {
    this.scores.clear();
  }

  // Room
  getRoom(): Room | undefined {
    return undefined;
  }
  setRoomStatus(status: RoomStatus): void {
    this.setRoomStatusCalls.push(status);
  }
  getAllSessionIds(): string[] {
    return [];
  }
  getPlayerSessionIds(_excludePlayerId?: string): string[] {
    return [];
  }

  // Phase Broadcasting
  broadcastPhase(phase: PhaseState, publicState: Record<string, unknown>): void {
    this.broadcastPhaseCalls.push({ phase, publicState });
  }
  broadcastPrivateState(_getState: (playerId: string) => Record<string, unknown>): void {
    this.broadcastPrivateStateCalls++;
  }
  broadcastGameOver(finalState: GameOverState): void {
    this.broadcastGameOverCalls.push(finalState);
  }

  // Logging
  log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

/** Create a Player object for testing. */
function makePlayer(id: string): Player {
  return {
    id,
    name: `Player ${id}`,
    sessionId: `session-${id}`,
    color: '#ff0000',
    status: 'connected',
  } as unknown as Player;
}

/** Create a GameDefinition for testing. */
function makeDefinition(): GameDefinition {
  return {
    id: 'test-v2-fixture',
    name: 'Test V2 Fixture',
    description: 'Test fixture',
    minPlayers: 2,
    maxPlayers: 6,
    estimatedMinutes: 10,
    icon: '🎮',
  };
}

// ---------------------------------------------------------------------------
// Helper: set up a complete test game
// ---------------------------------------------------------------------------

function setupGame(playerIds: string[] = ['p1', 'p2', 'p3']) {
  const pkg = loadGamePackage(FIXTURE_PATH);
  const timer = new TestTimerImpl();
  const roomId = 'test-room';
  const ctx = new MockGameContext(roomId, timer);
  const definition = makeDefinition();

  const module = new DeclarativeGameModule(definition, pkg, timer);
  const players = playerIds.map(makePlayer);

  module.setup(players, ctx);

  return { module, timer, ctx, roomId, pkg, players };
}

// ---------------------------------------------------------------------------
// Initialization tests
// ---------------------------------------------------------------------------

describe('DeclarativeGameModule — initialization', () => {
  it('implements the GameModule interface (has definition, setup, getPhaseState, etc.)', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const module = new DeclarativeGameModule(makeDefinition(), pkg);

    expect(typeof module.setup).toBe('function');
    expect(typeof module.getPhaseState).toBe('function');
    expect(typeof module.getPublicState).toBe('function');
    expect(typeof module.getPrivateState).toBe('function');
    expect(typeof module.handleInput).toBe('function');
    expect(typeof module.teardown).toBe('function');
    expect(module.definition).toBeDefined();
  });

  it('definition matches provided GameDefinition', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const def = makeDefinition();
    const module = new DeclarativeGameModule(def, pkg);
    expect(module.definition).toBe(def);
  });

  it('initializes scores for all players during setup', () => {
    const { ctx } = setupGame(['p1', 'p2', 'p3']);
    expect(ctx.initScoresCalls.length).toBe(1);
    expect(ctx.initScoresCalls[0]).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
  });

  it('broadcasts GAME_STARTED message during setup', () => {
    const { ctx } = setupGame();
    const gameStarted = ctx.sendToAllCalls.find(m => m.type === ServerMessageType.GAME_STARTED);
    expect(gameStarted).toBeDefined();
  });

  it('initial phase is the first phase defined in schema (instructions)', () => {
    const { module, roomId } = setupGame();
    const phase = module.getPhaseState(roomId);
    expect(phase.phaseType).toBe('instructions');
  });

  it('state is initialized from schema defaults (round = 0)', () => {
    const { module, roomId } = setupGame();
    const publicState = module.getPublicState(roomId);
    // globals.round defaults to 0
    expect((publicState.globals as Record<string, unknown>)?.round).toBe(0);
  });

  it('getPublicState returns globals and players', () => {
    const { module, roomId } = setupGame(['p1', 'p2']);
    const state = module.getPublicState(roomId);
    expect(state).toHaveProperty('globals');
    expect(state).toHaveProperty('players');
    expect(state).toHaveProperty('phase');
  });

  it('getPhaseState returns correct structure before any advance', () => {
    const { module, roomId } = setupGame();
    const phase = module.getPhaseState(roomId);
    expect(phase).toMatchObject({
      phaseType: 'instructions',
      roundNumber: expect.any(Number),
      totalRounds: expect.any(Number),
    });
  });
});

// ---------------------------------------------------------------------------
// Phase transition tests
// ---------------------------------------------------------------------------

describe('DeclarativeGameModule — phase transitions', () => {
  it('broadcasts PHASE_CHANGED when phase changes', () => {
    const { ctx, timer, roomId: _roomId } = setupGame();
    const initialCount = ctx.broadcastPhaseCalls.length;

    timer.trigger('test-room'); // instructions → play

    expect(ctx.broadcastPhaseCalls.length).toBeGreaterThan(initialCount);
  });

  it('phase advances from instructions to play after timer', () => {
    const { module, timer, roomId } = setupGame();

    expect(module.getPhaseState(roomId).phaseType).toBe('instructions');
    timer.trigger(roomId); // instructions timer expires → play

    expect(module.getPhaseState(roomId).phaseType).toBe('play');
  });

  it('PHASE_CHANGED message contains correct phase data', () => {
    const { ctx, timer } = setupGame();

    timer.trigger('test-room'); // → play

    const lastCall = ctx.broadcastPhaseCalls[ctx.broadcastPhaseCalls.length - 1];
    expect(lastCall.phase.phaseType).toBe('play');
  });

  it('PHASE_CHANGED includes public state', () => {
    const { ctx, timer } = setupGame();

    timer.trigger('test-room');

    const lastCall = ctx.broadcastPhaseCalls[ctx.broadcastPhaseCalls.length - 1];
    expect(lastCall.publicState).toBeDefined();
    expect(typeof lastCall.publicState).toBe('object');
  });

  it('round counter increments when play phase is entered (on_enter: increment)', () => {
    const { module, timer, roomId } = setupGame();

    const before = (module.getPublicState(roomId).globals as Record<string, unknown>)?.round;
    expect(before).toBe(0);

    timer.trigger(roomId); // → play (on_enter: increment globals.round)

    const after = (module.getPublicState(roomId).globals as Record<string, unknown>)?.round;
    expect(after).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Input handling tests
// ---------------------------------------------------------------------------

describe('DeclarativeGameModule — handleInput', () => {
  it('rejects input when not in input_gate phase', () => {
    const { module, roomId } = setupGame();
    // instructions phase is 'timed', not 'input_gate'
    const result = module.handleInput(roomId, 'p1', 'text_submit', { value: 'hello' });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('accepts valid input during input_gate phase', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play (input_gate)

    const result = module.handleInput(roomId, 'p1', 'text_submit', { value: 'my answer' });
    expect(result.accepted).toBe(true);
  });

  it('rejects input with wrong primitive type', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play

    const result = module.handleInput(roomId, 'p1', 'vote', { value: 'some-id' });
    expect(result.accepted).toBe(false);
  });

  it('rejects empty text_submit payload', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play

    const result = module.handleInput(roomId, 'p1', 'text_submit', { value: '' });
    expect(result.accepted).toBe(false);
  });

  it('stores submission in StateManager via per_player.answer', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'test answer' });

    // Private state for p1 should show the answer
    const privateState = module.getPrivateState(roomId, 'p1');
    const playerState = (privateState.players as Record<string, Record<string, unknown>>)?.p1;
    // The answer field should be set (it's private visibility)
    expect(playerState?.answer).toBe('test answer');
  });

  it('rejects duplicate submission from same player', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'first answer' });
    const result = module.handleInput(roomId, 'p1', 'text_submit', { value: 'second answer' });
    expect(result.accepted).toBe(false);
  });

  it('sends updated private state to submitter after input', () => {
    const { module, timer, ctx, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play

    const before = ctx.sendToPlayerCalls.length;
    module.handleInput(roomId, 'p1', 'text_submit', { value: 'my answer' });
    expect(ctx.sendToPlayerCalls.length).toBeGreaterThan(before);

    const lastCall = ctx.sendToPlayerCalls[ctx.sendToPlayerCalls.length - 1];
    expect(lastCall.playerId).toBe('p1');
    expect(lastCall.message.type).toBe(ServerMessageType.PRIVATE_STATE);
  });

  it('phase advances to results after ALL players submit', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2', 'p3']);

    timer.trigger(roomId); // → play

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'answer 1' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'answer 2' });
    expect(module.getPhaseState(roomId).phaseType).toBe('play'); // not done yet

    module.handleInput(roomId, 'p3', 'text_submit', { value: 'answer 3' });
    expect(module.getPhaseState(roomId).phaseType).toBe('results'); // advanced!
  });

  it('rejects input for room that does not exist', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const module = new DeclarativeGameModule(makeDefinition(), pkg);

    const result = module.handleInput('nonexistent-room', 'p1', 'text_submit', { value: 'hi' });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('Game not found');
  });
});

// ---------------------------------------------------------------------------
// State projection tests
// ---------------------------------------------------------------------------

describe('DeclarativeGameModule — state projection', () => {
  it('getPublicState returns current phase identifier', () => {
    const { module, roomId } = setupGame();
    const state = module.getPublicState(roomId);
    expect(state.phase).toBe('instructions');
  });

  it('getPublicState includes public globals (round, total_rounds)', () => {
    const { module, roomId } = setupGame();
    const state = module.getPublicState(roomId);
    const globals = state.globals as Record<string, unknown>;
    expect(globals).toHaveProperty('round');
    expect(globals).toHaveProperty('total_rounds');
  });

  it('getPublicState does NOT expose private per-player fields (answer is private)', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play
    module.handleInput(roomId, 'p1', 'text_submit', { value: 'secret answer' });

    const state = module.getPublicState(roomId);
    const players = state.players as Record<string, Record<string, unknown>>;

    // 'answer' is declared visibility: private — should NOT appear in public state
    expect(players['p1']).not.toHaveProperty('answer');
  });

  it('getPrivateState returns player-specific private fields', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play
    module.handleInput(roomId, 'p1', 'text_submit', { value: 'secret answer' });

    const privateState = module.getPrivateState(roomId, 'p1');
    const playerState = (privateState.players as Record<string, Record<string, unknown>>)?.p1;

    // p1 should see their own private answer
    expect(playerState?.answer).toBe('secret answer');
  });

  it('getPrivateState does NOT expose other players private fields', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play
    module.handleInput(roomId, 'p1', 'text_submit', { value: 'secret answer' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'p2 secret' });

    // p2 should not see p1's answer
    const p2PrivateState = module.getPrivateState(roomId, 'p2');
    const p1State = (p2PrivateState.players as Record<string, Record<string, unknown>>)?.p1;
    expect(p1State).not.toHaveProperty('answer'); // p1 answer is private to p1
  });

  it('getPrivateState includes input status (hasSubmitted)', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    timer.trigger(roomId); // → play

    const before = module.getPrivateState(roomId, 'p1');
    expect((before.input as Record<string, unknown>)?.hasSubmitted).toBe(false);

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'answer' });

    const after = module.getPrivateState(roomId, 'p1');
    expect((after.input as Record<string, unknown>)?.hasSubmitted).toBe(true);
  });

  it('getPrivateState for nonexistent room returns empty object', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const module = new DeclarativeGameModule(makeDefinition(), pkg);
    const state = module.getPrivateState('nonexistent', 'p1');
    expect(state).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Cleanup tests
// ---------------------------------------------------------------------------

describe('DeclarativeGameModule — teardown', () => {
  it('teardown removes room state', () => {
    const { module, roomId } = setupGame();

    module.teardown(roomId);

    // After teardown, room should not exist
    const phase = module.getPhaseState(roomId);
    expect(phase.phaseType).toBe('lobby'); // fallback phase
  });

  it('teardown stops the timer', () => {
    const { module, timer, roomId } = setupGame();

    expect(timer.isRunning(roomId)).toBe(true); // timer started during setup

    module.teardown(roomId);

    expect(timer.isRunning(roomId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration test — THE BIG ONE
// Full game cycle with the _test-v2/game.yaml fixture
// ---------------------------------------------------------------------------

describe('DeclarativeGameModule — integration: full game cycle', () => {
  it('kernel cannot distinguish V1 from V2 (implements GameModule exactly)', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const module = new DeclarativeGameModule(makeDefinition(), pkg);

    // Verify all required GameModule members are present
    expect(module.definition).toBeDefined();
    expect(typeof module.setup).toBe('function');
    expect(typeof module.getPhaseState).toBe('function');
    expect(typeof module.getPublicState).toBe('function');
    expect(typeof module.getPrivateState).toBe('function');
    expect(typeof module.handleInput).toBe('function');
    expect(typeof module.teardown).toBe('function');
  });

  it('full 3-round game cycle: instructions → play × 3 → final_results', async () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const timer = new TestTimerImpl();
    const roomId = 'integration-room';
    const ctx = new MockGameContext(roomId, timer);
    const playerIds = ['p1', 'p2', 'p3'];

    const module = new DeclarativeGameModule(makeDefinition(), pkg, timer);
    const players = playerIds.map(makePlayer);

    module.setup(players, ctx);

    // Track phase history via broadcastPhase calls
    

    // === Phase 1: instructions ===
    expect(module.getPhaseState(roomId).phaseType).toBe('instructions');

    // Advance timer: instructions → play
    timer.trigger(roomId);
    expect(module.getPhaseState(roomId).phaseType).toBe('play');

    // === Round 1: play ===
    let roundState = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(roundState.round).toBe(1); // on_enter incremented

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'r1-p1' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'r1-p2' });
    module.handleInput(roomId, 'p3', 'text_submit', { value: 'r1-p3' });

    // All players submitted → advance to results
    expect(module.getPhaseState(roomId).phaseType).toBe('results');

    // Advance results timer → conditional: round(1) < total_rounds(3) → play
    timer.trigger(roomId);
    expect(module.getPhaseState(roomId).phaseType).toBe('play');

    // === Round 2: play ===
    roundState = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(roundState.round).toBe(2);

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'r2-p1' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'r2-p2' });
    module.handleInput(roomId, 'p3', 'text_submit', { value: 'r2-p3' });

    expect(module.getPhaseState(roomId).phaseType).toBe('results');

    // Advance results → conditional: round(2) < total_rounds(3) → play
    timer.trigger(roomId);
    expect(module.getPhaseState(roomId).phaseType).toBe('play');

    // === Round 3: play ===
    roundState = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(roundState.round).toBe(3);

    module.handleInput(roomId, 'p1', 'text_submit', { value: 'r3-p1' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'r3-p2' });
    module.handleInput(roomId, 'p3', 'text_submit', { value: 'r3-p3' });

    expect(module.getPhaseState(roomId).phaseType).toBe('results');

    // Advance results → conditional: round(3) < total_rounds(3) → FALSE → final_results
    timer.trigger(roomId);
    expect(module.getPhaseState(roomId).phaseType).toBe('final_results');

    // Verify phase history shows all transitions
    const allPhases = ctx.broadcastPhaseCalls.map(c => c.phase.phaseType);
    expect(allPhases).toContain('play');
    expect(allPhases).toContain('results');
    expect(allPhases).toContain('final_results');
  });

  it('verifies PHASE_CHANGED fired for each transition (P1-7)', () => {
    const { ctx, timer, module, roomId } = setupGame(['p1', 'p2']);

    // setup fires PHASE_CHANGED for instructions (via onPhaseChange callback)
    timer.trigger(roomId); // → play
    module.handleInput(roomId, 'p1', 'text_submit', { value: 'a1' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'a2' });
    timer.trigger(roomId); // results → play or final_results

    // At minimum, should have broadcastPhase calls for:
    // instructions, play, results, play or final_results
    expect(ctx.broadcastPhaseCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('DeclarativeGameModule can be loaded from YAML and runs (P1-6)', () => {
    // This is the acceptance criterion test: V2 YAML game runs via interpreter
    const pkg = loadGamePackage(FIXTURE_PATH);
    expect(pkg.manifest.id).toBe('test-v2-fixture');

    const { module, roomId, timer } = setupGame(['p1', 'p2']);

    // Game starts and enters first phase
    expect(module.getPhaseState(roomId).phaseType).toBe('instructions');

    // Can advance through timer
    timer.trigger(roomId);
    expect(module.getPhaseState(roomId).phaseType).toBe('play');

    // Can receive input
    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'test' });
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'test' });
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);

    // Advanced to results
    expect(module.getPhaseState(roomId).phaseType).toBe('results');
  });

  it('input collector resets between rounds (accepts new submissions in round 2)', () => {
    const { module, timer, roomId } = setupGame(['p1', 'p2']);

    // Round 1
    timer.trigger(roomId); // → play
    module.handleInput(roomId, 'p1', 'text_submit', { value: 'round1' });
    module.handleInput(roomId, 'p2', 'text_submit', { value: 'round1' });
    // → results

    timer.trigger(roomId); // → play (round 2, total_rounds=3 so round 1<3=true)

    // Round 2 — both players should be able to submit again
    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'round2' });
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'round2' });
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });
});
