/**
 * event-system.test.ts — Comprehensive tests for the Event System subsystem.
 *
 * Tests cover:
 * - Trigger matching (phase, field, wildcard)
 * - Effect execution (set_state, increment, decrement, delegated effects)
 * - Priority ordering
 * - Guard conditions
 * - Once-only rules
 * - Enable/disable rules
 * - History tracking
 * - Integration (multi-rule scenario)
 * - Schema validation (EventRuleSchema, parseEventRules)
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEngine } from '../event-engine.js';
import { parseEventRules, safeParseEventRules, EventRuleSchema } from '../schema-integration.js';
import { StateManager } from '../../state-manager/index.js';
import { evaluateCondition } from '../../phase-machine/expression-eval.js';
import type { EventRule, EventEffect, EffectContext } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal StateManager with globals: round=0, total_rounds=3
 */
function makeStateManager(playerIds: string[] = []): StateManager {
  return new StateManager(
    {
      globals: {
        round: { type: 'integer', default: 0 },
        total_rounds: { type: 'integer', default: 3 },
        status: { type: 'string', default: 'idle' },
      },
      per_player: {
        score: { type: 'integer', default: 0 },
      },
    },
    playerIds,
  );
}

/**
 * Create a no-op onEffect spy that records calls
 */
function makeOnEffect() {
  return vi.fn((_effect: EventEffect, _context: EffectContext): void => {
    // no-op
  });
}

/**
 * Create an EventEngine with a given set of rules.
 * Uses a real StateManager and a spy onEffect.
 */
function makeEngine(rules: EventRule[], stateManager?: StateManager) {
  const sm = stateManager ?? makeStateManager();
  const onEffect = makeOnEffect();
  const engine = new EventEngine(rules, {
    stateManager: sm,
    onEffect,
  });
  return { engine, stateManager: sm, onEffect };
}

// ---------------------------------------------------------------------------
// Trigger Matching Tests
// ---------------------------------------------------------------------------

describe('Trigger Matching', () => {
  it('phase_enter trigger matches the correct phase', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-1',
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'Play started' }],
      },
    ]);

    const fired = engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(fired).toHaveLength(1);
    expect(fired[0].ruleId).toBe('rule-1');
    expect(onEffect).toHaveBeenCalledOnce();
  });

  it('phase_enter trigger does NOT match a different phase', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-1',
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'Play started' }],
      },
    ]);

    const fired = engine.emit({ type: 'phase_enter', phase: 'results' });
    expect(fired).toHaveLength(0);
    expect(onEffect).not.toHaveBeenCalled();
  });

  it('phase_exit trigger matches the correct phase', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-exit',
        triggers: [{ type: 'phase_exit', phase: 'voting' }],
        effects: [{ type: 'announce', message: 'Voting over' }],
      },
    ]);

    const fired = engine.emit({ type: 'phase_exit', phase: 'voting' });
    expect(fired).toHaveLength(1);
  });

  it('state_change trigger matches the correct field', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-sc',
        triggers: [{ type: 'state_change', field: 'globals.round' }],
        effects: [{ type: 'announce', message: 'Round changed' }],
      },
    ]);

    const fired = engine.emit({ type: 'state_change', field: 'globals.round' });
    expect(fired).toHaveLength(1);
  });

  it('state_change trigger does NOT match a different field', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-sc',
        triggers: [{ type: 'state_change', field: 'globals.round' }],
        effects: [{ type: 'announce', message: 'Round changed' }],
      },
    ]);

    const fired = engine.emit({ type: 'state_change', field: 'globals.status' });
    expect(fired).toHaveLength(0);
  });

  it('wildcard phase_enter trigger (no phase) matches any phase', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-any',
        triggers: [{ type: 'phase_enter' }],
        effects: [{ type: 'announce', message: 'Phase entered' }],
      },
    ]);

    const firedA = engine.emit({ type: 'phase_enter', phase: 'play' });
    const firedB = engine.emit({ type: 'phase_enter', phase: 'results' });
    expect(firedA).toHaveLength(1);
    expect(firedB).toHaveLength(1);
  });

  it('wildcard state_change trigger (no field) matches any field change', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-any-field',
        triggers: [{ type: 'state_change' }],
        effects: [{ type: 'announce', message: 'Something changed' }],
      },
    ]);

    const firedA = engine.emit({ type: 'state_change', field: 'globals.round' });
    const firedB = engine.emit({ type: 'state_change', field: 'globals.status' });
    expect(firedA).toHaveLength(1);
    expect(firedB).toHaveLength(1);
  });

  it('trigger type mismatch never fires', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-gs',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'Game started' }],
      },
    ]);

    const fired = engine.emit({ type: 'game_end' });
    expect(fired).toHaveLength(0);
  });

  it('rule with multiple triggers fires if ANY trigger matches', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-multi',
        triggers: [
          { type: 'phase_enter', phase: 'play' },
          { type: 'game_start' },
        ],
        effects: [{ type: 'announce', message: 'Either condition' }],
      },
    ]);

    const firedA = engine.emit({ type: 'game_start' });
    expect(firedA).toHaveLength(1);
    expect(firedA[0].ruleId).toBe('rule-multi');

    engine.reset();
    const firedB = engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(firedB).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Effect Execution Tests
// ---------------------------------------------------------------------------

describe('Effect Execution', () => {
  it('set_state effect updates global state', () => {
    const sm = makeStateManager();
    const { engine } = makeEngine(
      [
        {
          id: 'rule-set',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'set_state', target: 'globals.status', value: 'active' }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_start' });
    expect(sm.getGlobal('status')).toBe('active');
  });

  it('increment effect increases global value', () => {
    const sm = makeStateManager();
    const { engine } = makeEngine(
      [
        {
          id: 'rule-inc',
          triggers: [{ type: 'phase_enter', phase: 'play' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 1 }],
        },
      ],
      sm,
    );

    expect(sm.getGlobal('round')).toBe(0);
    engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(sm.getGlobal('round')).toBe(1);
    engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(sm.getGlobal('round')).toBe(2);
  });

  it('increment with custom amount', () => {
    const sm = makeStateManager();
    const { engine } = makeEngine(
      [
        {
          id: 'rule-inc5',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 5 }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_start' });
    expect(sm.getGlobal('round')).toBe(5);
  });

  it('decrement effect decreases global value', () => {
    const sm = makeStateManager();
    sm.setGlobal('round', 3);

    const { engine } = makeEngine(
      [
        {
          id: 'rule-dec',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'decrement', target: 'globals.round', amount: 1 }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_start' });
    expect(sm.getGlobal('round')).toBe(2);
  });

  it('decrement with custom amount', () => {
    const sm = makeStateManager();
    sm.setGlobal('round', 10);

    const { engine } = makeEngine(
      [
        {
          id: 'rule-dec3',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'decrement', target: 'globals.round', amount: 3 }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_start' });
    expect(sm.getGlobal('round')).toBe(7);
  });

  it('announce effect delegates to onEffect callback', () => {
    const sm = makeStateManager();
    const { engine, onEffect } = makeEngine(
      [
        {
          id: 'rule-announce',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'announce', message: 'Game is starting!' }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_start' });
    expect(onEffect).toHaveBeenCalledOnce();
    const calls = onEffect.mock.calls;
    const [effect, context] = calls[0];
    expect(effect.type).toBe('announce');
    expect(effect.message).toBe('Game is starting!');
    expect(context.trigger.type).toBe('game_start');
  });

  it('broadcast effect delegates to onEffect callback', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-broadcast',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'broadcast', message: 'Welcome!' }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    expect(onEffect).toHaveBeenCalledOnce();
    const calls = onEffect.mock.calls;
    expect(calls[0][0].type).toBe('broadcast');
  });

  it('play_sound effect delegates to onEffect callback', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-sound',
        triggers: [{ type: 'timer_expire' }],
        effects: [{ type: 'play_sound', sound: 'warning_beep' }],
      },
    ]);

    engine.emit({ type: 'timer_expire' });
    expect(onEffect).toHaveBeenCalledOnce();
    const calls = onEffect.mock.calls;
    expect(calls[0][0].sound).toBe('warning_beep');
  });

  it('advance_phase effect delegates to onEffect callback', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-advance',
        triggers: [{ type: 'timer_expire' }],
        effects: [{ type: 'advance_phase' }],
      },
    ]);

    engine.emit({ type: 'timer_expire' });
    expect(onEffect).toHaveBeenCalledOnce();
    const calls = onEffect.mock.calls;
    expect(calls[0][0].type).toBe('advance_phase');
  });

  it('add_points effect delegates to onEffect callback', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-pts',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'add_points', amount: 100 }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    expect(onEffect).toHaveBeenCalledOnce();
    const calls = onEffect.mock.calls;
    expect(calls[0][0].amount).toBe(100);
  });

  it('custom effect delegates to onEffect callback with data', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-custom',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'custom', custom: 'deal_cards', data: { count: 5 } }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    expect(onEffect).toHaveBeenCalledOnce();
    const calls = onEffect.mock.calls;
    const [effect] = calls[0];
    expect(effect.type).toBe('custom');
    expect(effect.custom).toBe('deal_cards');
    expect(effect.data).toEqual({ count: 5 });
  });

  it('multiple effects execute in order', () => {
    const sm = makeStateManager();
    const callOrder: string[] = [];

    const onEffect = vi.fn((_effect: EventEffect, _context: EffectContext): void => {
      callOrder.push(`delegated:${_effect.type}:${_effect.message ?? _effect.type}`);
    });

    const engine = new EventEngine(
      [
        {
          id: 'rule-multi-fx',
          triggers: [{ type: 'game_start' }],
          effects: [
            { type: 'set_state', target: 'globals.status', value: 'active' },
            { type: 'increment', target: 'globals.round', amount: 1 },
            { type: 'announce', message: 'first-announce' },
            { type: 'announce', message: 'second-announce' },
          ],
        },
      ],
      { stateManager: sm, onEffect },
    );

    engine.emit({ type: 'game_start' });

    // State mutations happened
    expect(sm.getGlobal('status')).toBe('active');
    expect(sm.getGlobal('round')).toBe(1);

    // Delegated effects in order
    expect(callOrder).toEqual([
      'delegated:announce:first-announce',
      'delegated:announce:second-announce',
    ]);
  });

  it('onEffect receives correct EffectContext with rule reference', () => {
    const { engine, onEffect } = makeEngine([
      {
        id: 'rule-ctx',
        name: 'Context Test Rule',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'hello' }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    const calls = onEffect.mock.calls;
    const [, context] = calls[0];
    expect(context.rule.id).toBe('rule-ctx');
    expect(context.rule.name).toBe('Context Test Rule');
  });
});

// ---------------------------------------------------------------------------
// Priority Tests
// ---------------------------------------------------------------------------

describe('Priority', () => {
  it('higher priority rules execute before lower priority', () => {
    const executionOrder: string[] = [];
    const onEffect = vi.fn((_effect: EventEffect): void => {
      executionOrder.push(_effect.message ?? '');
    });

    const engine = new EventEngine(
      [
        {
          id: 'low',
          priority: 0,
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'announce', message: 'low' }],
        },
        {
          id: 'high',
          priority: 10,
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'announce', message: 'high' }],
        },
        {
          id: 'medium',
          priority: 5,
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'announce', message: 'medium' }],
        },
      ],
      {
        stateManager: makeStateManager(),
        onEffect,
      },
    );

    engine.emit({ type: 'game_start' });

    // High first, then medium, then low
    expect(executionOrder).toEqual(['high', 'medium', 'low']);
  });

  it('same priority rules execute in declaration order', () => {
    const executionOrder: string[] = [];
    const onEffect = vi.fn((_effect: EventEffect): void => {
      executionOrder.push(_effect.message ?? '');
    });

    const engine = new EventEngine(
      [
        { id: 'first', priority: 5, triggers: [{ type: 'game_start' }], effects: [{ type: 'announce', message: 'first' }] },
        { id: 'second', priority: 5, triggers: [{ type: 'game_start' }], effects: [{ type: 'announce', message: 'second' }] },
        { id: 'third', priority: 5, triggers: [{ type: 'game_start' }], effects: [{ type: 'announce', message: 'third' }] },
      ],
      {
        stateManager: makeStateManager(),
        onEffect,
      },
    );

    engine.emit({ type: 'game_start' });
    expect(executionOrder).toEqual(['first', 'second', 'third']);
  });

  it('rules without priority default to 0 and follow declaration order', () => {
    const executionOrder: string[] = [];
    const onEffect = vi.fn((_effect: EventEffect): void => {
      executionOrder.push(_effect.message ?? '');
    });

    const engine = new EventEngine(
      [
        { id: 'a', triggers: [{ type: 'game_start' }], effects: [{ type: 'announce', message: 'a' }] },
        { id: 'b', triggers: [{ type: 'game_start' }], effects: [{ type: 'announce', message: 'b' }] },
      ],
      {
        stateManager: makeStateManager(),
        onEffect,
      },
    );

    engine.emit({ type: 'game_start' });
    expect(executionOrder).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Guard Condition Tests
// ---------------------------------------------------------------------------

describe('Guard Conditions', () => {
  it('rule with passing condition fires', () => {
    const sm = makeStateManager();
    sm.setGlobal('round', 3);

    const engine = new EventEngine(
      [
        {
          id: 'rule-cond',
          triggers: [{ type: 'state_change', field: 'globals.round', condition: 'globals.round == 3' }],
          effects: [{ type: 'announce', message: 'Round 3!' }],
        },
      ],
      {
        stateManager: sm,
        onEffect: vi.fn((_effect: EventEffect): void => {}),
        evaluateCondition: (expr: string) => {
          return evaluateCondition(expr, { getGlobal: (field) => sm.getGlobal(field) });
        },
      },
    );

    const fired = engine.emit({ type: 'state_change', field: 'globals.round' });
    expect(fired).toHaveLength(1);
  });

  it('rule with failing condition does NOT fire', () => {
    const sm = makeStateManager();
    sm.setGlobal('round', 1);

    const engine = new EventEngine(
      [
        {
          id: 'rule-cond',
          triggers: [{ type: 'state_change', field: 'globals.round', condition: 'globals.round == 3' }],
          effects: [{ type: 'announce', message: 'Round 3!' }],
        },
      ],
      {
        stateManager: sm,
        onEffect: vi.fn((_effect: EventEffect): void => {}),
        evaluateCondition: (expr: string) => {
          return evaluateCondition(expr, { getGlobal: (field) => sm.getGlobal(field) });
        },
      },
    );

    const fired = engine.emit({ type: 'state_change', field: 'globals.round' });
    expect(fired).toHaveLength(0);
  });

  it('condition evaluator throwing an error causes rule to not fire', () => {
    const engine = new EventEngine(
      [
        {
          id: 'rule-bad-cond',
          triggers: [{ type: 'game_start', condition: 'INVALID_SYNTAX' }],
          effects: [{ type: 'announce', message: 'should not fire' }],
        },
      ],
      {
        stateManager: makeStateManager(),
        onEffect: vi.fn((_effect: EventEffect): void => {}),
        evaluateCondition: () => {
          throw new Error('Bad expression');
        },
      },
    );

    const fired = engine.emit({ type: 'game_start' });
    expect(fired).toHaveLength(0);
  });

  it('when no evaluateCondition is provided, conditions are treated as true', () => {
    // No evaluateCondition in options
    const { engine } = makeEngine([
      {
        id: 'rule-passthru',
        triggers: [{ type: 'game_start', condition: 'anything' }],
        effects: [{ type: 'announce', message: 'fired anyway' }],
      },
    ]);

    const fired = engine.emit({ type: 'game_start' });
    expect(fired).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Once-Shot Tests
// ---------------------------------------------------------------------------

describe('Once-Only Rules', () => {
  it('once:true rule fires the first time', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-once',
        once: true,
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'First play!' }],
      },
    ]);

    const fired = engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(fired).toHaveLength(1);
  });

  it('once:true rule does NOT fire a second time', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-once',
        once: true,
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'First play!' }],
      },
    ]);

    engine.emit({ type: 'phase_enter', phase: 'play' });
    const secondFired = engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(secondFired).toHaveLength(0);
  });

  it('reset() re-enables once:true rules', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-once',
        once: true,
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'First play!' }],
      },
    ]);

    engine.emit({ type: 'phase_enter', phase: 'play' });
    engine.reset(); // resets hasFired

    const firedAfterReset = engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(firedAfterReset).toHaveLength(1);
  });

  it('once:false rules (default) fire every time', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-repeat',
        once: false,
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'Repeat' }],
      },
    ]);

    engine.emit({ type: 'phase_enter', phase: 'play' });
    engine.emit({ type: 'phase_enter', phase: 'play' });
    const third = engine.emit({ type: 'phase_enter', phase: 'play' });
    expect(third).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Enable/Disable Tests
// ---------------------------------------------------------------------------

describe('Enable / Disable Rules', () => {
  it('disabled rules do not fire', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-disabled',
        enabled: false,
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'Should not fire' }],
      },
    ]);

    const fired = engine.emit({ type: 'game_start' });
    expect(fired).toHaveLength(0);
  });

  it('disableRule() prevents an enabled rule from firing', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-toggle',
        enabled: true,
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'Toggle test' }],
      },
    ]);

    engine.disableRule('rule-toggle');
    const fired = engine.emit({ type: 'game_start' });
    expect(fired).toHaveLength(0);
  });

  it('enableRule() re-activates a disabled rule', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-re-enable',
        enabled: false,
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'Re-enabled!' }],
      },
    ]);

    engine.enableRule('rule-re-enable');
    const fired = engine.emit({ type: 'game_start' });
    expect(fired).toHaveLength(1);
  });

  it('enableRule/disableRule for non-existent id is a safe no-op', () => {
    const { engine } = makeEngine([]);
    expect(() => engine.enableRule('ghost')).not.toThrow();
    expect(() => engine.disableRule('ghost')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// History Tests
// ---------------------------------------------------------------------------

describe('History', () => {
  it('getHistory() returns all fired events', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-a',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'A' }],
      },
      {
        id: 'rule-b',
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'B' }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    engine.emit({ type: 'phase_enter', phase: 'play' });

    const history = engine.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].ruleId).toBe('rule-a');
    expect(history[1].ruleId).toBe('rule-b');
  });

  it('history entries contain the trigger that caused firing', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-hist',
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'announce', message: 'hist' }],
      },
    ]);

    engine.emit({ type: 'phase_enter', phase: 'play' });
    const history = engine.getHistory();
    expect(history[0].trigger.type).toBe('phase_enter');
    expect(history[0].trigger.phase).toBe('play');
  });

  it('history entries include a timestamp', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-ts',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'ts' }],
      },
    ]);

    const before = Date.now();
    engine.emit({ type: 'game_start' });
    const after = Date.now();

    const history = engine.getHistory();
    expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(history[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('reset() clears history', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-clear',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'clear' }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    expect(engine.getHistory()).toHaveLength(1);

    engine.reset();
    expect(engine.getHistory()).toHaveLength(0);
  });

  it('getHistory() returns a copy — mutations do not affect engine state', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-copy',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'copy' }],
      },
    ]);

    engine.emit({ type: 'game_start' });
    const history = engine.getHistory();
    history.push({ ruleId: 'fake', trigger: { type: 'game_end' }, timestamp: 0 });

    // Engine's internal history should be unchanged
    expect(engine.getHistory()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration Test
// ---------------------------------------------------------------------------

describe('Integration: Multi-Rule Round Counter + Final Round Alert', () => {
  it('emitting phase_enter:play 3 times increments round to 3 and triggers final round announce', () => {
    const sm = makeStateManager();
    const announceMessages: string[] = [];

    const engine = new EventEngine(
      [
        // Rule 1: entering 'play' phase increments round counter
        {
          id: 'increment_round',
          name: 'Increment round on play',
          triggers: [{ type: 'phase_enter', phase: 'play' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 1 }],
        },
        // Rule 2: when round reaches total_rounds, announce "Final round!"
        {
          id: 'final_round_alert',
          name: 'Alert on final round',
          triggers: [{
            type: 'state_change',
            field: 'globals.round',
            condition: 'globals.round == globals.total_rounds',
          }],
          effects: [{ type: 'announce', message: 'Final round!' }],
        },
      ],
      {
        stateManager: sm,
        onEffect: (effect) => {
          if (effect.type === 'announce' && effect.message) {
            announceMessages.push(effect.message);
          }
        },
        evaluateCondition: (expr) => {
          return evaluateCondition(expr, {
            getGlobal: (field) => sm.getGlobal(field),
          });
        },
      },
    );

    // Subscribe to state changes and re-emit them as event system events
    sm.onChange((event) => {
      engine.emit({
        type: 'state_change',
        field: `${event.scope === 'global' ? 'globals' : 'per_player'}.${event.field}`,
      });
    });

    // Enter play phase 3 times (simulating 3 rounds)
    engine.emit({ type: 'phase_enter', phase: 'play' }); // round becomes 1
    engine.emit({ type: 'phase_enter', phase: 'play' }); // round becomes 2
    engine.emit({ type: 'phase_enter', phase: 'play' }); // round becomes 3

    // Verify round counter is at 3
    expect(sm.getGlobal('round')).toBe(3);

    // Verify "Final round!" was announced exactly once (when round == total_rounds == 3)
    expect(announceMessages).toContain('Final round!');
    expect(announceMessages.filter(m => m === 'Final round!')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Schema Validation Tests
// ---------------------------------------------------------------------------

describe('Schema Validation', () => {
  it('EventRuleSchema parses a valid rule', () => {
    const raw = {
      id: 'test-rule',
      name: 'Test Rule',
      triggers: [{ type: 'phase_enter', phase: 'play' }],
      effects: [{ type: 'increment', target: 'globals.round', amount: 1 }],
      priority: 5,
      once: false,
      enabled: true,
    };

    const result = EventRuleSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('EventRuleSchema rejects a rule with empty id', () => {
    const raw = {
      id: '',
      triggers: [{ type: 'phase_enter' }],
      effects: [{ type: 'announce', message: 'test' }],
    };

    const result = EventRuleSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('EventRuleSchema rejects a rule with no triggers', () => {
    const raw = {
      id: 'no-triggers',
      triggers: [],
      effects: [{ type: 'announce', message: 'test' }],
    };

    const result = EventRuleSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('EventRuleSchema rejects a rule with no effects', () => {
    const raw = {
      id: 'no-effects',
      triggers: [{ type: 'game_start' }],
      effects: [],
    };

    const result = EventRuleSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('EventRuleSchema rejects invalid trigger type', () => {
    const raw = {
      id: 'bad-trigger',
      triggers: [{ type: 'invalid_trigger_type' }],
      effects: [{ type: 'announce', message: 'test' }],
    };

    const result = EventRuleSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('EventRuleSchema rejects invalid effect type', () => {
    const raw = {
      id: 'bad-effect',
      triggers: [{ type: 'game_start' }],
      effects: [{ type: 'invalid_effect_type' }],
    };

    const result = EventRuleSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('parseEventRules() parses a valid array of rules', () => {
    const rawRules = [
      {
        id: 'rule-1',
        triggers: [{ type: 'phase_enter', phase: 'play' }],
        effects: [{ type: 'increment', target: 'globals.round', amount: 1 }],
      },
      {
        id: 'rule-2',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'Hello!' }],
      },
    ];

    const rules = parseEventRules(rawRules);
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe('rule-1');
    expect(rules[1].id).toBe('rule-2');
  });

  it('parseEventRules() throws ZodError on invalid input', () => {
    expect(() => parseEventRules([{ id: '', triggers: [], effects: [] }])).toThrow();
  });

  it('safeParseEventRules() returns success:true for valid rules', () => {
    const rawRules = [
      {
        id: 'valid-rule',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'Hi' }],
      },
    ];

    const result = safeParseEventRules(rawRules);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
  });

  it('safeParseEventRules() returns success:false for invalid rules', () => {
    const result = safeParseEventRules([{ id: '' }]);
    expect(result.success).toBe(false);
  });

  it('parseEventRules() handles all trigger types', () => {
    const triggerTypes = [
      'phase_enter', 'phase_exit', 'state_change', 'input_received',
      'timer_expire', 'game_start', 'game_end',
    ] as const;

    for (const type of triggerTypes) {
      const rules = parseEventRules([{
        id: `rule-${type}`,
        triggers: [{ type }],
        effects: [{ type: 'announce', message: type }],
      }]);
      expect(rules[0].triggers[0].type).toBe(type);
    }
  });

  it('parseEventRules() handles all effect types', () => {
    const effectTypes = [
      'set_state', 'increment', 'decrement', 'add_points',
      'broadcast', 'play_sound', 'announce', 'advance_phase', 'custom',
    ] as const;

    const rules = parseEventRules(effectTypes.map((type, i) => ({
      id: `rule-${i}`,
      triggers: [{ type: 'game_start' as const }],
      effects: [{ type }],
    })));

    expect(rules).toHaveLength(effectTypes.length);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  it('emitting a trigger with no matching rules returns empty array', () => {
    const { engine } = makeEngine([
      {
        id: 'rule-gs',
        triggers: [{ type: 'game_start' }],
        effects: [{ type: 'announce', message: 'start' }],
      },
    ]);

    const fired = engine.emit({ type: 'game_end' });
    expect(fired).toHaveLength(0);
  });

  it('empty rules array is valid and emits nothing', () => {
    const { engine } = makeEngine([]);
    const fired = engine.emit({ type: 'game_start' });
    expect(fired).toHaveLength(0);
  });

  it('set_state with null value works', () => {
    const sm = makeStateManager();
    sm.setGlobal('status', 'active');

    const { engine } = makeEngine(
      [
        {
          id: 'rule-null',
          triggers: [{ type: 'game_end' }],
          effects: [{ type: 'set_state', target: 'globals.status', value: null }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_end' });
    expect(sm.getGlobal('status')).toBeNull();
  });

  it('increment on non-existent field starts from 0', () => {
    const sm = makeStateManager();
    const { engine } = makeEngine(
      [
        {
          id: 'rule-new-field',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'increment', target: 'globals.new_counter', amount: 1 }],
        },
      ],
      sm,
    );

    engine.emit({ type: 'game_start' });
    expect(sm.getGlobal('new_counter')).toBe(1);
  });
});
