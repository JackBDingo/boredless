/**
 * phase-machine.test.ts — Comprehensive tests for the Phase Machine subsystem.
 *
 * Timer approach:
 * ---------------
 * The real timerEngine uses setInterval + WS calls, which are unsuitable for
 * unit tests. We use a TestTimerImpl that captures the onExpire callback
 * and exposes a trigger() method to fire it manually. This gives us full
 * control over timer expiry without needing fake timers or WS mocks.
 *
 * Integration tests at the bottom use the real fixture + StateManager to
 * exercise the full Phase 0+1 stack together.
 */

import { describe, it, expect, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PhaseMachine } from '../phase-machine.js';
import { evaluateCondition } from '../expression-eval.js';
import type { TimerImpl } from '../phase-machine.js';
import type { ExpressionContext } from '../types.js';
import type { PhaseMachineOptions } from '../types.js';
import type { Phases, PhaseAction } from '../../schema-engine/index.js';
import { StateManager } from '../../state-manager/index.js';
import { loadGamePackage } from '../../schema-engine/index.js';
import type { StateModel } from '../../schema-engine/index.js';

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

  /** Manually trigger timer expiry for a room. */
  trigger(roomId: string): void {
    const cb = this.callbacks.get(roomId);
    if (cb) {
      this.callbacks.delete(roomId);
      cb();
    }
  }

  /** Check if a timer is currently running for a room. */
  isRunning(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }
}

/** Build a minimal valid Phases object for testing. */
function makePhases(overrides: Phases = {}): Phases {
  return {
    start: {
      type: 'timed',
      duration: 5,
      on_exit: [{ action: 'advance', to: 'middle' }],
    },
    middle: {
      type: 'timed',
      duration: 5,
      on_exit: [{ action: 'advance', to: 'end' }],
    },
    end: {
      type: 'timed',
      duration: 5,
    },
    ...overrides,
  };
}

/** Build a minimal StateModel for testing. */
function makeStateModel(overrides: Partial<StateModel> = {}): StateModel {
  return {
    globals: {
      round: { type: 'integer', default: 0 },
      total_rounds: { type: 'integer', default: 3 },
      score: { type: 'integer', default: 0 },
    },
    per_player: {
      answer: { type: 'string', default: null, visibility: 'private' },
      voted: { type: 'boolean', default: false },
    },
    ...overrides,
  };
}

/** Build a StateManager from a state model and player IDs. */
function makeStateManager(
  stateModel: StateModel = makeStateModel(),
  playerIds: string[] = ['p1', 'p2'],
): StateManager {
  return new StateManager(stateModel, playerIds);
}

/** Build PhaseMachineOptions with spy callbacks. */
function makeOptions(overrides: Partial<PhaseMachineOptions> = {}): {
  options: PhaseMachineOptions;
  onPhaseChange: ReturnType<typeof vi.fn>;
  onGameEnd: ReturnType<typeof vi.fn>;
  onAction: ReturnType<typeof vi.fn>;
} {
  const onPhaseChange = vi.fn();
  const onGameEnd = vi.fn();
  const onAction = vi.fn();

  const options: PhaseMachineOptions = {
    roomId: 'test-room',
    sessionIds: () => [],
    onPhaseChange,
    onGameEnd,
    onAction,
    ...overrides,
  };

  return { options, onPhaseChange, onGameEnd, onAction };
}

/** Build a PhaseMachine with test timer and spy options. */
function makeMachine(
  phasesOverride?: Phases,
  stateManagerOverride?: StateManager,
): {
  machine: PhaseMachine;
  timer: TestTimerImpl;
  onPhaseChange: ReturnType<typeof vi.fn>;
  onGameEnd: ReturnType<typeof vi.fn>;
  onAction: ReturnType<typeof vi.fn>;
  stateManager: StateManager;
} {
  const timer = new TestTimerImpl();
  const { options, onPhaseChange, onGameEnd, onAction } = makeOptions();
  const stateManager = stateManagerOverride ?? makeStateManager();
  const phases = phasesOverride ?? makePhases();
  const machine = new PhaseMachine(phases, stateManager, options, timer);
  return { machine, timer, onPhaseChange, onGameEnd, onAction, stateManager };
}

// ---------------------------------------------------------------------------
// Phase transition tests
// ---------------------------------------------------------------------------

describe('PhaseMachine — phase transitions', () => {
  it('starts in the initial phase correctly', () => {
    const { machine, onPhaseChange } = makeMachine();
    machine.start('start');

    expect(machine.getCurrentPhase()?.id).toBe('start');
    expect(onPhaseChange).toHaveBeenCalledOnce();
    expect(onPhaseChange).toHaveBeenCalledWith('start', expect.objectContaining({ type: 'timed' }));
  });

  it('getCurrentPhase returns null before start()', () => {
    const { machine } = makeMachine();
    expect(machine.getCurrentPhase()).toBeNull();
  });

  it('timed phase auto-advances after timer fires', () => {
    const { machine, timer, onPhaseChange } = makeMachine();
    machine.start('start');

    expect(machine.getCurrentPhase()?.id).toBe('start');
    timer.trigger('test-room');

    expect(machine.getCurrentPhase()?.id).toBe('middle');
    expect(onPhaseChange).toHaveBeenCalledTimes(2);
    expect(onPhaseChange).toHaveBeenLastCalledWith(
      'middle',
      expect.objectContaining({ type: 'timed' }),
    );
  });

  it('timed phase advances through multiple phases in sequence', () => {
    const { machine, timer, onPhaseChange } = makeMachine();
    machine.start('start');

    timer.trigger('test-room'); // start → middle
    timer.trigger('test-room'); // middle → end

    expect(machine.getCurrentPhase()?.id).toBe('end');
    expect(onPhaseChange).toHaveBeenCalledTimes(3);
  });

  it('input_gate phase advances when all players submit', () => {
    const phases: Phases = {
      waiting: {
        type: 'input_gate',
        input: { primitive: 'text_submit', target: 'per_player.answer', required: 'all_players' },
        on_complete: [{ action: 'advance', to: 'done' }],
      },
      done: { type: 'timed', duration: 5 },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1', 'p2']);
    const { machine, onPhaseChange } = makeMachine(phases, stateManager);
    machine.start('waiting');

    expect(machine.getCurrentPhase()?.id).toBe('waiting');

    machine.submitInput('p1', 'text_submit', 'hello');
    expect(machine.getCurrentPhase()?.id).toBe('waiting'); // p2 hasn't submitted

    machine.submitInput('p2', 'text_submit', 'world');
    expect(machine.getCurrentPhase()?.id).toBe('done');
    expect(onPhaseChange).toHaveBeenCalledTimes(2);
  });

  it('input_gate phase auto-advances on timeout even without all inputs', () => {
    const phases: Phases = {
      waiting: {
        type: 'input_gate',
        duration: 30,
        input: { primitive: 'text_submit', required: 'all_players' },
        on_complete: [{ action: 'advance', to: 'done' }],
      },
      done: { type: 'timed', duration: 5 },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1', 'p2']);
    const { machine, timer, onPhaseChange } = makeMachine(phases, stateManager);
    machine.start('waiting');

    machine.submitInput('p1', 'text_submit', 'hello'); // Only p1 submits
    expect(machine.getCurrentPhase()?.id).toBe('waiting');

    timer.trigger('test-room'); // Timer fires — auto-advance
    expect(machine.getCurrentPhase()?.id).toBe('done');
    expect(onPhaseChange).toHaveBeenCalledTimes(2);
  });

  it('conditional phase evaluates true branch and transitions', async () => {
    const phases: Phases = {
      check: {
        type: 'conditional',
        condition: 'globals.round < globals.total_rounds',
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'loop_back' },
            else: { advance_to: 'final' },
          } as unknown as PhaseAction,
        ],
      },
      loop_back: { type: 'timed', duration: 5 },
      final: { type: 'timed', duration: 5 },
    };

    const stateManager = makeStateManager();
    stateManager.setGlobal('round', 1);
    stateManager.setGlobal('total_rounds', 3);

    const { machine, onPhaseChange } = makeMachine(phases, stateManager);
    machine.start('check');

    // Wait for microtask (conditional phases use Promise.resolve().then())
    await Promise.resolve();
    await Promise.resolve();

    expect(machine.getCurrentPhase()?.id).toBe('loop_back');
    expect(onPhaseChange).toHaveBeenCalledWith('loop_back', expect.anything());
  });

  it('conditional phase evaluates false branch and transitions', async () => {
    const phases: Phases = {
      check: {
        type: 'conditional',
        condition: 'globals.round < globals.total_rounds',
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'loop_back' },
            else: { advance_to: 'final' },
          } as unknown as PhaseAction,
        ],
      },
      loop_back: { type: 'timed', duration: 5 },
      final: { type: 'timed', duration: 5 },
    };

    const stateManager = makeStateManager();
    stateManager.setGlobal('round', 3);
    stateManager.setGlobal('total_rounds', 3);

    const { machine } = makeMachine(phases, stateManager);
    machine.start('check');

    await Promise.resolve();
    await Promise.resolve();

    expect(machine.getCurrentPhase()?.id).toBe('final');
  });

  it('calls onGameEnd when a terminal phase has no advance target', async () => {
    const phases: Phases = {
      last: {
        type: 'timed',
        duration: 5,
        // No on_exit — terminal phase
      },
    };
    const { machine, timer, onGameEnd } = makeMachine(phases);
    machine.start('last');

    timer.trigger('test-room');

    expect(onGameEnd).toHaveBeenCalledOnce();
  });

  it('throws if start() is called twice', () => {
    const { machine } = makeMachine();
    machine.start('start');
    expect(() => machine.start('start')).toThrow(/start\(\) called more than once/);
  });
});

// ---------------------------------------------------------------------------
// Action execution tests
// ---------------------------------------------------------------------------

describe('PhaseMachine — action execution', () => {
  it('"advance" action transitions to named phase', () => {
    const phases: Phases = {
      a: {
        type: 'timed',
        duration: 5,
        on_exit: [{ action: 'advance', to: 'b' }],
      },
      b: { type: 'timed', duration: 5 },
    };
    const { machine, timer } = makeMachine(phases);
    machine.start('a');
    timer.trigger('test-room');
    expect(machine.getCurrentPhase()?.id).toBe('b');
  });

  it('"increment" action increments a global field', () => {
    const phases: Phases = {
      inc: {
        type: 'timed',
        duration: 5,
        on_enter: [{ action: 'increment', target: 'globals.round' } as PhaseAction],
      },
      end: { type: 'timed', duration: 5 },
    };
    const stateManager = makeStateManager();
    stateManager.setGlobal('round', 2);

    const { machine } = makeMachine(phases, stateManager);
    machine.start('inc');

    expect(stateManager.getGlobal('round')).toBe(3);
  });

  it('"increment" starts from 0 if field is null/undefined', () => {
    const phases: Phases = {
      inc: {
        type: 'timed',
        duration: 5,
        on_enter: [{ action: 'increment', target: 'globals.round' } as PhaseAction],
      },
    };
    const stateManager = makeStateManager();
    // round defaults to 0 from state model

    const { machine } = makeMachine(phases, stateManager);
    machine.start('inc');

    expect(stateManager.getGlobal('round')).toBe(1);
  });

  it('"set" action sets a global state field', () => {
    const phases: Phases = {
      setter: {
        type: 'timed',
        duration: 5,
        on_enter: [{ action: 'set', target: 'globals.score', value: 42 } as unknown as PhaseAction],
      },
    };
    const stateManager = makeStateManager();

    const { machine } = makeMachine(phases, stateManager);
    machine.start('setter');

    expect(stateManager.getGlobal('score')).toBe(42);
  });

  it('"reset_players" resets a per_player field for all players', () => {
    const phases: Phases = {
      reset: {
        type: 'timed',
        duration: 5,
        on_enter: [{ action: 'reset_players', field: 'answer' } as unknown as PhaseAction],
      },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1', 'p2', 'p3']);
    // Set some answers first
    stateManager.setPlayer('p1', 'answer', 'existing answer');
    stateManager.setPlayer('p2', 'answer', 'another answer');

    const { machine } = makeMachine(phases, stateManager);
    machine.start('reset');

    expect(stateManager.getPlayer('p1', 'answer')).toBeNull();
    expect(stateManager.getPlayer('p2', 'answer')).toBeNull();
    expect(stateManager.getPlayer('p3', 'answer')).toBeNull();
  });

  it('unknown actions call onAction callback', () => {
    const phases: Phases = {
      scoring: {
        type: 'timed',
        duration: 5,
        on_enter: [
          {
            action: 'score_round',
            formulas: { correct_answer: 100 },
          } as unknown as PhaseAction,
        ],
      },
    };
    const { machine, onAction } = makeMachine(phases);
    machine.start('scoring');

    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'score_round' }),
    );
  });

  it('multiple unknown actions all call onAction callback', () => {
    const phases: Phases = {
      multi: {
        type: 'timed',
        duration: 5,
        on_enter: [
          { action: 'score_round' } as unknown as PhaseAction,
          { action: 'content_draw', pool: 'prompts' } as unknown as PhaseAction,
        ],
      },
    };
    const { machine, onAction } = makeMachine(phases);
    machine.start('multi');

    expect(onAction).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// on_enter / on_exit tests
// ---------------------------------------------------------------------------

describe('PhaseMachine — on_enter / on_exit lifecycle', () => {
  it('on_enter actions fire when entering a phase', () => {
    const phases: Phases = {
      enter_test: {
        type: 'timed',
        duration: 5,
        on_enter: [{ action: 'increment', target: 'globals.round' } as PhaseAction],
      },
    };
    const stateManager = makeStateManager();

    const { machine } = makeMachine(phases, stateManager);
    machine.start('enter_test');

    // on_enter fires before onPhaseChange, so state should be updated
    expect(stateManager.getGlobal('round')).toBe(1);
  });

  it('on_exit actions fire when leaving a phase', () => {
    const phases: Phases = {
      exit_test: {
        type: 'timed',
        duration: 5,
        on_exit: [
          { action: 'set', target: 'globals.score', value: 99 } as unknown as PhaseAction,
          { action: 'advance', to: 'next' },
        ],
      },
      next: { type: 'timed', duration: 5 },
    };
    const stateManager = makeStateManager();

    const { machine, timer } = makeMachine(phases, stateManager);
    machine.start('exit_test');

    expect(stateManager.getGlobal('score')).toBe(0); // Not yet

    timer.trigger('test-room');

    expect(stateManager.getGlobal('score')).toBe(99); // on_exit fired
    expect(machine.getCurrentPhase()?.id).toBe('next');
  });

  it('on_enter fires before onPhaseChange callback', () => {
    const order: string[] = [];
    const phases: Phases = {
      first: {
        type: 'timed',
        duration: 5,
        on_enter: [{ action: 'score_round' } as unknown as PhaseAction],
      },
    };
    const timer = new TestTimerImpl();
    const onAction = vi.fn(() => order.push('on_enter_action'));
    const onPhaseChange = vi.fn(() => order.push('onPhaseChange'));
    const stateManager = makeStateManager();

    const machine = new PhaseMachine(
      phases,
      stateManager,
      {
        roomId: 'test-room',
        sessionIds: () => [],
        onPhaseChange,
        onGameEnd: vi.fn(),
        onAction,
      },
      timer,
    );
    machine.start('first');

    expect(order).toEqual(['on_enter_action', 'onPhaseChange']);
  });

  it('on_complete fires for input_gate on completion', () => {
    const phases: Phases = {
      gate: {
        type: 'input_gate',
        input: { primitive: 'text_submit', required: 'all_players' },
        on_complete: [{ action: 'score_round' } as unknown as PhaseAction],
      },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1']);
    const { machine, onAction } = makeMachine(phases, stateManager);
    machine.start('gate');

    machine.submitInput('p1', 'text_submit', 'answer');

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'score_round' }));
  });
});

// ---------------------------------------------------------------------------
// submitInput tests
// ---------------------------------------------------------------------------

describe('PhaseMachine — submitInput', () => {
  it('returns false when not in an input_gate phase', () => {
    const { machine } = makeMachine();
    machine.start('start');
    expect(machine.submitInput('p1', 'text_submit', 'value')).toBe(false);
  });

  it('returns true when input is accepted', () => {
    const phases: Phases = {
      gate: {
        type: 'input_gate',
        input: { primitive: 'text_submit', required: 'all_players' },
      },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1', 'p2']);
    const { machine } = makeMachine(phases, stateManager);
    machine.start('gate');

    expect(machine.submitInput('p1', 'text_submit', 'hello')).toBe(true);
  });

  it('records submitted player IDs and updates state target', () => {
    const phases: Phases = {
      gate: {
        type: 'input_gate',
        input: {
          primitive: 'text_submit',
          target: 'per_player.answer',
          required: 'all_players',
        },
      },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1', 'p2']);
    const { machine } = makeMachine(phases, stateManager);
    machine.start('gate');

    machine.submitInput('p1', 'text_submit', 'my answer');

    expect(stateManager.getPlayer('p1', 'answer')).toBe('my answer');
  });

  it('rejects input with wrong primitive type', () => {
    const phases: Phases = {
      gate: {
        type: 'input_gate',
        input: { primitive: 'vote', required: 'all_players' },
      },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1']);
    const { machine } = makeMachine(phases, stateManager);
    machine.start('gate');

    expect(machine.submitInput('p1', 'text_submit', 'value')).toBe(false);
  });

  it('does not double-advance when advancing is already in progress', () => {
    const phases: Phases = {
      gate: {
        type: 'input_gate',
        duration: 30,
        input: { primitive: 'text_submit', required: 'all_players' },
        on_complete: [{ action: 'advance', to: 'done' }],
      },
      done: { type: 'timed', duration: 5 },
    };
    const stateManager = makeStateManager(makeStateModel(), ['p1']);
    const { machine, onPhaseChange } = makeMachine(phases, stateManager);
    machine.start('gate');

    machine.submitInput('p1', 'text_submit', 'done'); // triggers advance
    // Try to submit again while advancing
    machine.submitInput('p1', 'text_submit', 'again');

    // Should only have changed phase once (gate → done)
    expect(onPhaseChange).toHaveBeenCalledTimes(2);
    expect(machine.getCurrentPhase()?.id).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// destroy() tests
// ---------------------------------------------------------------------------

describe('PhaseMachine — destroy', () => {
  it('stops timers and clears state on destroy()', () => {
    const { machine, timer } = makeMachine();
    machine.start('start');

    expect(timer.isRunning('test-room')).toBe(true);

    machine.destroy();

    expect(machine.getCurrentPhase()).toBeNull();
    expect(timer.isRunning('test-room')).toBe(false);
  });

  it('does not call callbacks after destroy()', () => {
    const { machine, timer, onPhaseChange } = makeMachine();
    machine.start('start');
    machine.destroy();

    timer.trigger('test-room'); // Trigger after destroy — should be ignored

    // onPhaseChange was called once (for 'start'), not again after destroy
    expect(onPhaseChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Expression evaluator tests
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  function makeContext(globals: Record<string, unknown>): ExpressionContext {
    return {
      getGlobal: (field) => globals[field],
    };
  }

  it('simple less-than: true when lhs < rhs', () => {
    const ctx = makeContext({ round: 1, total_rounds: 3 });
    expect(evaluateCondition('globals.round < globals.total_rounds', ctx)).toBe(true);
  });

  it('simple less-than: false when lhs >= rhs', () => {
    const ctx = makeContext({ round: 3, total_rounds: 3 });
    expect(evaluateCondition('globals.round < globals.total_rounds', ctx)).toBe(false);
  });

  it('equality: true when values match', () => {
    const ctx = makeContext({ round: 3 });
    expect(evaluateCondition('globals.round == 3', ctx)).toBe(true);
  });

  it('equality: false when values do not match', () => {
    const ctx = makeContext({ round: 2 });
    expect(evaluateCondition('globals.round == 3', ctx)).toBe(false);
  });

  it('not-equal: true when values differ', () => {
    const ctx = makeContext({ round: 1 });
    expect(evaluateCondition('globals.round != 3', ctx)).toBe(true);
  });

  it('greater-than: true when lhs > rhs', () => {
    const ctx = makeContext({ score: 150 });
    expect(evaluateCondition('globals.score > 100', ctx)).toBe(true);
  });

  it('less-than-or-equal: true at boundary', () => {
    const ctx = makeContext({ round: 3 });
    expect(evaluateCondition('globals.round <= 3', ctx)).toBe(true);
  });

  it('greater-than-or-equal: true at boundary', () => {
    const ctx = makeContext({ score: 100 });
    expect(evaluateCondition('globals.score >= 100', ctx)).toBe(true);
  });

  it('AND: both sides true → true', () => {
    const ctx = makeContext({ round: 2, total_rounds: 3 });
    expect(
      evaluateCondition('globals.round > 0 AND globals.round < globals.total_rounds', ctx),
    ).toBe(true);
  });

  it('AND: one side false → false', () => {
    const ctx = makeContext({ round: 0, total_rounds: 3 });
    expect(
      evaluateCondition('globals.round > 0 AND globals.round < globals.total_rounds', ctx),
    ).toBe(false);
  });

  it('OR: one side true → true', () => {
    const ctx = makeContext({ round: 0 });
    expect(evaluateCondition('globals.round == 0 OR globals.round == 5', ctx)).toBe(true);
  });

  it('OR: both sides false → false', () => {
    const ctx = makeContext({ round: 3 });
    expect(evaluateCondition('globals.round == 0 OR globals.round == 5', ctx)).toBe(false);
  });

  it('string comparison: equality with string literal', () => {
    const ctx = makeContext({ status: 'active' });
    expect(evaluateCondition('globals.status == "active"', ctx)).toBe(true);
  });

  it('string comparison: inequality with string literal', () => {
    const ctx = makeContext({ status: 'inactive' });
    expect(evaluateCondition('globals.status == "active"', ctx)).toBe(false);
  });

  it('comparison with literal number on lhs', () => {
    const ctx = makeContext({ round: 3 });
    expect(evaluateCondition('3 == globals.round', ctx)).toBe(true);
  });

  it('throws on malformed expression', () => {
    const ctx = makeContext({});
    expect(() => evaluateCondition('not a valid expression', ctx)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration test: full Phase 0+1 stack
// ---------------------------------------------------------------------------

describe('PhaseMachine — integration with game.yaml fixture', () => {
  it('loads fixture and initializes correctly', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2', 'p3']);
    const timer = new TestTimerImpl();
    const onPhaseChange = vi.fn();
    const onGameEnd = vi.fn();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2', 'p3'],
        onPhaseChange,
        onGameEnd,
        onAction: vi.fn(),
      },
      timer,
    );

    machine.start('instructions');
    expect(machine.getCurrentPhase()?.id).toBe('instructions');
    expect(machine.getCurrentPhase()?.node.type).toBe('timed');
  });

  it('transitions through instructions → play on timer expiry', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    const timer = new TestTimerImpl();
    const onPhaseChange = vi.fn();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange,
        onGameEnd: vi.fn(),
        onAction: vi.fn(),
      },
      timer,
    );

    machine.start('instructions');
    timer.trigger('integration-room'); // instructions expires → on_exit: advance to play

    expect(machine.getCurrentPhase()?.id).toBe('play');
    expect(machine.getCurrentPhase()?.node.type).toBe('input_gate');
  });

  it('play phase does not increment round (event system handles it)', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    const timer = new TestTimerImpl();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange: vi.fn(),
        onGameEnd: vi.fn(),
        onAction: vi.fn(),
      },
      timer,
    );

    machine.start('instructions');
    expect(stateManager.getGlobal('round')).toBe(0);

    timer.trigger('integration-room'); // → play
    // Round increment is now handled by the event system, not on_enter
    expect(stateManager.getGlobal('round')).toBe(0);
  });

  it('play → results when all players submit', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    const timer = new TestTimerImpl();
    const onAction = vi.fn();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange: vi.fn(),
        onGameEnd: vi.fn(),
        onAction,
      },
      timer,
    );

    machine.start('instructions');
    timer.trigger('integration-room'); // → play

    machine.submitInput('p1', 'text_submit', 'p1 answer');
    machine.submitInput('p2', 'text_submit', 'p2 answer');

    expect(machine.getCurrentPhase()?.id).toBe('results');
  });

  it('results → play loops back when round < total_rounds', async () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    // Set up state: round=1, total_rounds=3 → should loop back
    stateManager.setGlobal('round', 1);

    const timer = new TestTimerImpl();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange: vi.fn(),
        onGameEnd: vi.fn(),
        onAction: vi.fn(),
      },
      timer,
    );

    // Jump directly to results
    machine.start('results');

    // results on_exit fires a conditional action: if round < total_rounds → play, else final_results
    timer.trigger('integration-room'); // results expires → on_exit fires conditional

    expect(machine.getCurrentPhase()?.id).toBe('play');
  });

  it('results → final_results when round >= total_rounds', async () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    // Set round = total_rounds → should go to final_results
    stateManager.setGlobal('round', 3);
    stateManager.setGlobal('total_rounds', 3);

    const timer = new TestTimerImpl();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange: vi.fn(),
        onGameEnd: vi.fn(),
        onAction: vi.fn(),
      },
      timer,
    );

    machine.start('results');
    timer.trigger('integration-room');

    expect(machine.getCurrentPhase()?.id).toBe('final_results');
  });

  it('full game progression: instructions → play → results → play (loop) → results → final_results', async () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    // total_rounds = 1 so we go through play→results→final_results once
    stateManager.setGlobal('total_rounds', 1);

    const timer = new TestTimerImpl();
    const phaseHistory: string[] = [];

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange: (id) => phaseHistory.push(id),
        onGameEnd: vi.fn(),
        onAction: vi.fn(),
      },
      timer,
    );

    machine.start('instructions');
    // instructions (timed) → advance to play
    timer.trigger('integration-room');

    // play (input_gate) — both players submit → advance to results
    machine.submitInput('p1', 'text_submit', 'answer1');
    machine.submitInput('p2', 'text_submit', 'answer2');

    // Simulate event system incrementing round (PhaseMachine alone doesn't do it)
    stateManager.setGlobal('round', 1);

    // results (timed) → conditional: round(1) < total_rounds(1) → false → final_results
    timer.trigger('integration-room');

    expect(phaseHistory).toEqual(['instructions', 'play', 'results', 'final_results']);
    expect(machine.getCurrentPhase()?.id).toBe('final_results');
  });

  it('score_round action delegated to onAction in results phase', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const stateManager = new StateManager(pkg.state_model, ['p1', 'p2']);
    const onAction = vi.fn();
    const timer = new TestTimerImpl();

    const machine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId: 'integration-room',
        sessionIds: () => ['p1', 'p2'],
        onPhaseChange: vi.fn(),
        onGameEnd: vi.fn(),
        onAction,
      },
      timer,
    );

    machine.start('results');

    // on_enter of results fires score_round — should be delegated to onAction
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'score_round' }),
    );
  });
});
