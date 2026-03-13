/**
 * state-manager.test.ts — Comprehensive tests for the State Manager subsystem.
 *
 * Test strategy:
 * - Most tests use the _test-v2/game.yaml fixture loaded via the Schema Engine
 *   (ensures integration between subsystems)
 * - Some inline state models test edge cases not in the fixture
 *
 * Coverage:
 * - Initialization from schema defaults
 * - Globals get/set
 * - Per-player get/set
 * - Per-team get/set (stub)
 * - Bulk operations: setPlayerAll, resetTransientState
 * - Change events: subscribe, unsubscribe, oldValue/newValue, multiple listeners
 * - Visibility projection: getPublicState, getPrivateState
 * - Snapshot (deep copy isolation)
 * - Edge cases: null defaults, missing sections, unknown players
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGamePackage } from '../../schema-engine/index.js';
import { StateManager } from '../state-manager.js';
import type { StateModel } from '../../schema-engine/index.js';
import type { StateChangeEvent } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_PATH = join(__dirname, '../../../../../games/_test-v2/game.yaml');

// ---------------------------------------------------------------------------
// Shared fixture setup
// ---------------------------------------------------------------------------

/** Load state model from the _test-v2 fixture via the Schema Engine. */
function loadFixtureStateModel(): StateModel {
  const pkg = loadGamePackage(FIXTURE_PATH);
  return pkg.state_model;
}

/** Create a 4-player StateManager from the test fixture. */
function makeFixtureManager(playerIds = ['p1', 'p2', 'p3', 'p4']): StateManager {
  const stateModel = loadFixtureStateModel();
  return new StateManager(stateModel, playerIds);
}

// ---------------------------------------------------------------------------
// INITIALIZATION TESTS
// ---------------------------------------------------------------------------

describe('StateManager — Initialization', () => {
  it('P0-2: initializes a 4-player game with correct default globals', () => {
    const sm = makeFixtureManager(['p1', 'p2', 'p3', 'p4']);

    expect(sm.getGlobal('round')).toBe(0);
    expect(sm.getGlobal('total_rounds')).toBe(3);
    expect(sm.getGlobal('current_question')).toBeNull();
  });

  it('P0-2: initializes per_player state for each of 4 players', () => {
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    const sm = makeFixtureManager(playerIds);

    for (const pid of playerIds) {
      expect(sm.getPlayer(pid, 'score')).toBe(0);
      expect(sm.getPlayer(pid, 'answer')).toBeNull();
    }
  });

  it('handles null defaults correctly (current_question = null)', () => {
    const sm = makeFixtureManager();
    expect(sm.getGlobal('current_question')).toBeNull();
    // null is stored, not undefined
    expect(sm.getGlobal('current_question')).not.toBeUndefined();
  });

  it('handles missing per_player section gracefully (empty state model)', () => {
    const stateModel: StateModel = {
      globals: {
        round: { type: 'integer', default: 1, visibility: 'public' },
      },
      // per_player omitted
    };
    const sm = new StateManager(stateModel, ['p1', 'p2']);

    expect(sm.getGlobal('round')).toBe(1);
    expect(sm.getPlayerState('p1')).toEqual({});
    expect(sm.getPlayerState('p2')).toEqual({});
  });

  it('handles missing globals section gracefully (only per_player)', () => {
    const stateModel: StateModel = {
      // globals omitted
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
      },
    };
    const sm = new StateManager(stateModel, ['p1', 'p2']);

    expect(sm.getGlobals()).toEqual({});
    expect(sm.getPlayer('p1', 'score')).toBe(0);
    expect(sm.getPlayer('p2', 'score')).toBe(0);
  });

  it('handles a completely empty state model', () => {
    const sm = new StateManager({}, ['p1']);
    expect(sm.getGlobals()).toEqual({});
    expect(sm.getPlayerState('p1')).toEqual({});
  });

  it('initializes players with independent state (not shared references)', () => {
    const sm = makeFixtureManager(['a', 'b']);
    sm.setPlayer('a', 'score', 100);
    // Player b's score should remain at default
    expect(sm.getPlayer('b', 'score')).toBe(0);
  });

  it('getPlayerIds() returns all initialized player IDs', () => {
    const playerIds = ['alice', 'bob', 'carol', 'dave'];
    const sm = makeFixtureManager(playerIds);
    expect(sm.getPlayerIds()).toEqual(playerIds);
  });

  it('getPlayerIds() returns a copy (mutation does not affect internal list)', () => {
    const sm = makeFixtureManager(['p1', 'p2']);
    const ids = sm.getPlayerIds();
    ids.push('hacker');
    expect(sm.getPlayerIds()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// MUTATION TESTS
// ---------------------------------------------------------------------------

describe('StateManager — Mutations', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = makeFixtureManager(['p1', 'p2', 'p3']);
  });

  it('P0-3: setGlobal / getGlobal round-trip', () => {
    sm.setGlobal('round', 2);
    expect(sm.getGlobal('round')).toBe(2);
  });

  it('P0-3: setPlayer / getPlayer round-trip', () => {
    sm.setPlayer('p1', 'score', 250);
    expect(sm.getPlayer('p1', 'score')).toBe(250);
  });

  it('setGlobal persists across multiple sets (last write wins)', () => {
    sm.setGlobal('round', 1);
    sm.setGlobal('round', 2);
    sm.setGlobal('round', 3);
    expect(sm.getGlobal('round')).toBe(3);
  });

  it('getGlobals() returns all current globals as a plain object', () => {
    sm.setGlobal('round', 2);
    const globals = sm.getGlobals();
    expect(globals['round']).toBe(2);
    expect(globals['total_rounds']).toBe(3);
    expect(globals['current_question']).toBeNull();
  });

  it('getGlobals() returns a shallow copy (mutation does not affect live state)', () => {
    const globals = sm.getGlobals();
    globals['round'] = 99;
    expect(sm.getGlobal('round')).toBe(0); // unchanged
  });

  it('getPlayerState() returns all fields for a player', () => {
    sm.setPlayer('p2', 'score', 150);
    sm.setPlayer('p2', 'answer', 'hello');
    const state = sm.getPlayerState('p2');
    expect(state['score']).toBe(150);
    expect(state['answer']).toBe('hello');
  });

  it('getPlayerState() returns empty object for unknown player', () => {
    expect(sm.getPlayerState('unknown-player')).toEqual({});
  });

  it('getAllPlayerStates() returns state for all players', () => {
    sm.setPlayer('p1', 'score', 100);
    sm.setPlayer('p2', 'score', 200);
    sm.setPlayer('p3', 'score', 50);

    const all = sm.getAllPlayerStates();
    expect(all.get('p1')?.['score']).toBe(100);
    expect(all.get('p2')?.['score']).toBe(200);
    expect(all.get('p3')?.['score']).toBe(50);
  });

  it('getAllPlayerStates() returns shallow copies (not live references)', () => {
    const all = sm.getAllPlayerStates();
    const p1State = all.get('p1')!;
    p1State['score'] = 9999;
    expect(sm.getPlayer('p1', 'score')).toBe(0); // unchanged
  });

  it('setPlayerAll sets the same value for every player', () => {
    sm.setPlayerAll('score', 100);
    for (const pid of ['p1', 'p2', 'p3']) {
      expect(sm.getPlayer(pid, 'score')).toBe(100);
    }
  });

  it('setPlayerAll with different prior values all get overwritten', () => {
    sm.setPlayer('p1', 'score', 10);
    sm.setPlayer('p2', 'score', 20);
    sm.setPlayer('p3', 'score', 30);
    sm.setPlayerAll('answer', 'reset');
    for (const pid of ['p1', 'p2', 'p3']) {
      expect(sm.getPlayer(pid, 'answer')).toBe('reset');
    }
    // setPlayerAll on one field doesn't touch others
    expect(sm.getPlayer('p1', 'score')).toBe(10);
  });

  it('resetTransientState resets all state back to schema defaults', () => {
    sm.setGlobal('round', 5);
    sm.setPlayer('p1', 'score', 300);
    sm.setPlayer('p2', 'answer', 'my answer');

    sm.resetTransientState();

    expect(sm.getGlobal('round')).toBe(0);
    expect(sm.getGlobal('total_rounds')).toBe(3);
    expect(sm.getPlayer('p1', 'score')).toBe(0);
    expect(sm.getPlayer('p2', 'answer')).toBeNull();
  });

  it('resetTransientState resets all players, not just some', () => {
    sm.setPlayer('p1', 'score', 100);
    sm.setPlayer('p2', 'score', 200);
    sm.setPlayer('p3', 'score', 300);

    sm.resetTransientState();

    for (const pid of ['p1', 'p2', 'p3']) {
      expect(sm.getPlayer(pid, 'score')).toBe(0);
    }
  });

  it('setPlayer can store string values', () => {
    sm.setPlayer('p1', 'answer', 'The Eiffel Tower');
    expect(sm.getPlayer('p1', 'answer')).toBe('The Eiffel Tower');
  });

  it('setGlobal can store arbitrary unknown values (arrays, objects)', () => {
    sm.setGlobal('current_question', { text: 'What is 2+2?', difficulty: 'easy' });
    expect(sm.getGlobal('current_question')).toEqual({ text: 'What is 2+2?', difficulty: 'easy' });
  });

  it('setPlayer auto-registers unknown player gracefully', () => {
    // Player 'x' was not in the initial player list
    sm.setPlayer('x', 'score', 42);
    expect(sm.getPlayer('x', 'score')).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// CHANGE EVENT TESTS
// ---------------------------------------------------------------------------

describe('StateManager — Change Events', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = makeFixtureManager(['p1', 'p2']);
  });

  it('P0-4: setting a global fires onChange with correct event', () => {
    const events: StateChangeEvent[] = [];
    sm.onChange((e) => events.push(e));

    sm.setGlobal('round', 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scope: 'global',
      field: 'round',
      oldValue: 0,
      newValue: 1,
    });
  });

  it('P0-4: setting a player field fires onChange with playerId', () => {
    const events: StateChangeEvent[] = [];
    sm.onChange((e) => events.push(e));

    sm.setPlayer('p1', 'score', 100);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scope: 'player',
      field: 'score',
      playerId: 'p1',
      oldValue: 0,
      newValue: 100,
    });
  });

  it('change event includes correct oldValue and newValue', () => {
    sm.setGlobal('round', 2);
    const events: StateChangeEvent[] = [];
    sm.onChange((e) => events.push(e));

    sm.setGlobal('round', 5);

    expect(events[0].oldValue).toBe(2);
    expect(events[0].newValue).toBe(5);
  });

  it('multiple listeners all fire on a single mutation', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const l3 = vi.fn();

    sm.onChange(l1);
    sm.onChange(l2);
    sm.onChange(l3);

    sm.setGlobal('round', 1);

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
    expect(l3).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops receiving notifications', () => {
    const events: StateChangeEvent[] = [];
    const unsubscribe = sm.onChange((e) => events.push(e));

    sm.setGlobal('round', 1); // should receive this
    unsubscribe();
    sm.setGlobal('round', 2); // should NOT receive this

    expect(events).toHaveLength(1);
    expect(events[0].newValue).toBe(1);
  });

  it('unsubscribe of one listener does not affect other listeners', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();

    const unsub1 = sm.onChange(l1);
    sm.onChange(l2);

    unsub1();
    sm.setGlobal('round', 1);

    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('setPlayerAll fires one event per player', () => {
    const events: StateChangeEvent[] = [];
    sm.onChange((e) => events.push(e));

    sm.setPlayerAll('score', 50);

    // 2 players → 2 events
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.scope === 'player')).toBe(true);
    expect(events.every((e) => e.field === 'score')).toBe(true);
    expect(events.every((e) => e.newValue === 50)).toBe(true);
  });

  it('resetTransientState fires events for each field reset', () => {
    sm.setGlobal('round', 3);
    sm.setPlayer('p1', 'score', 100);

    const events: StateChangeEvent[] = [];
    sm.onChange((e) => events.push(e));

    sm.resetTransientState();

    // At minimum: round, total_rounds, current_question globals + score, answer per p1 and p2
    expect(events.length).toBeGreaterThan(0);
    const globalEvents = events.filter((e) => e.scope === 'global');
    const playerEvents = events.filter((e) => e.scope === 'player');
    expect(globalEvents.length).toBeGreaterThan(0);
    expect(playerEvents.length).toBeGreaterThan(0);
  });

  it('setting a team field fires onChange with teamId and scope=team', () => {
    const events: StateChangeEvent[] = [];
    sm.onChange((e) => events.push(e));

    sm.setTeam('team-red', 'score', 0);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      scope: 'team',
      field: 'score',
      teamId: 'team-red',
      oldValue: undefined,
      newValue: 0,
    });
  });

  it('no events fire when no mutations are made', () => {
    const listener = vi.fn();
    sm.onChange(listener);
    // no mutations
    expect(listener).not.toHaveBeenCalled();
  });

  it('listeners fire synchronously (not deferred)', () => {
    let firedDuring = false;
    sm.onChange(() => {
      firedDuring = true;
    });
    sm.setGlobal('round', 1);
    // If synchronous, firedDuring is true immediately after setGlobal
    expect(firedDuring).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PROJECTION TESTS
// ---------------------------------------------------------------------------

describe('StateManager — Visibility Projection', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = makeFixtureManager(['p1', 'p2', 'p3']);
    sm.setGlobal('round', 2);
    sm.setPlayer('p1', 'score', 100);
    sm.setPlayer('p1', 'answer', 'Paris');
    sm.setPlayer('p2', 'score', 50);
    sm.setPlayer('p2', 'answer', 'London');
    sm.setPlayer('p3', 'score', 75);
    sm.setPlayer('p3', 'answer', 'Berlin');
  });

  it('getPublicState only includes public per-player fields (not private)', () => {
    const pub = sm.getPublicState() as {
      globals: Record<string, unknown>;
      players: Record<string, Record<string, unknown>>;
    };

    // 'score' is public — should be present
    expect(pub.players['p1']['score']).toBe(100);
    // 'answer' is private — should NOT be present
    expect(pub.players['p1']['answer']).toBeUndefined();
  });

  it('getPublicState includes public globals', () => {
    const pub = sm.getPublicState() as { globals: Record<string, unknown> };

    // round, total_rounds, current_question are all public
    expect(pub.globals['round']).toBe(2);
    expect(pub.globals['total_rounds']).toBe(3);
  });

  it('getPublicState includes public data for all players', () => {
    const pub = sm.getPublicState() as { players: Record<string, Record<string, unknown>> };

    expect(pub.players['p1']['score']).toBe(100);
    expect(pub.players['p2']['score']).toBe(50);
    expect(pub.players['p3']['score']).toBe(75);
  });

  it('getPublicState does not include private fields for any player', () => {
    const pub = sm.getPublicState() as { players: Record<string, Record<string, unknown>> };

    for (const pid of ['p1', 'p2', 'p3']) {
      expect(pub.players[pid]['answer']).toBeUndefined();
    }
  });

  it('getPrivateState includes all fields for the target player (public + private)', () => {
    const priv = sm.getPrivateState('p1') as { players: Record<string, Record<string, unknown>> };

    expect(priv.players['p1']['score']).toBe(100);
    expect(priv.players['p1']['answer']).toBe('Paris');
  });

  it('getPrivateState does NOT leak other players private fields', () => {
    const priv = sm.getPrivateState('p1') as { players: Record<string, Record<string, unknown>> };

    // p2 and p3 answers should NOT appear in p1's private state
    expect(priv.players['p2']['answer']).toBeUndefined();
    expect(priv.players['p3']['answer']).toBeUndefined();
  });

  it('getPrivateState includes public fields for other players', () => {
    const priv = sm.getPrivateState('p1') as { players: Record<string, Record<string, unknown>> };

    // Public score is visible for others
    expect(priv.players['p2']['score']).toBe(50);
    expect(priv.players['p3']['score']).toBe(75);
  });

  it('getPrivateState includes all globals', () => {
    const priv = sm.getPrivateState('p1') as { globals: Record<string, unknown> };

    expect(priv.globals['round']).toBe(2);
    expect(priv.globals['total_rounds']).toBe(3);
    expect(priv.globals['current_question']).toBeNull();
  });

  it('getPrivateState for each player returns their own private answer', () => {
    const privP1 = sm.getPrivateState('p1') as { players: Record<string, Record<string, unknown>> };
    const privP2 = sm.getPrivateState('p2') as { players: Record<string, Record<string, unknown>> };

    expect(privP1.players['p1']['answer']).toBe('Paris');
    expect(privP2.players['p2']['answer']).toBe('London');
  });

  it('getPublicState with no per_player definition returns empty players', () => {
    const stateModel: StateModel = {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
      },
    };
    const sm2 = new StateManager(stateModel, ['p1']);
    const pub = sm2.getPublicState() as { players: Record<string, Record<string, unknown>> };
    expect(pub.players['p1']).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// SNAPSHOT TESTS
// ---------------------------------------------------------------------------

describe('StateManager — Snapshot', () => {
  let sm: StateManager;

  beforeEach(() => {
    sm = makeFixtureManager(['p1', 'p2']);
    sm.setGlobal('round', 1);
    sm.setPlayer('p1', 'score', 100);
    sm.setPlayer('p2', 'score', 50);
  });

  it('snapshot returns current state values', () => {
    const snap = sm.snapshot();
    expect(snap.globals['round']).toBe(1);
    expect(snap.players['p1']['score']).toBe(100);
    expect(snap.players['p2']['score']).toBe(50);
  });

  it('mutations after snapshot do not affect the snapshot (deep copy)', () => {
    const snap = sm.snapshot();

    sm.setGlobal('round', 99);
    sm.setPlayer('p1', 'score', 9999);

    // Snapshot values unchanged
    expect(snap.globals['round']).toBe(1);
    expect(snap.players['p1']['score']).toBe(100);
  });

  it('mutating snapshot does not affect live state', () => {
    const snap = sm.snapshot();

    // Mutate snapshot directly
    snap.globals['round'] = 999;
    (snap.players['p1'] as Record<string, unknown>)['score'] = 999;

    // Live state unchanged
    expect(sm.getGlobal('round')).toBe(1);
    expect(sm.getPlayer('p1', 'score')).toBe(100);
  });

  it('snapshot includes teams section (empty if no teams set)', () => {
    const snap = sm.snapshot();
    expect(snap.teams).toBeDefined();
    expect(typeof snap.teams).toBe('object');
  });

  it('snapshot deep-clones nested objects', () => {
    sm.setGlobal('current_question', { text: 'Q?', answers: [1, 2, 3] });
    const snap = sm.snapshot();

    // Mutate the original
    (sm.getGlobal('current_question') as Record<string, unknown>)['text'] = 'changed';

    // Snapshot should still have original text
    expect((snap.globals['current_question'] as Record<string, unknown>)['text']).toBe('Q?');
  });

  it('successive snapshots are independent', () => {
    const snap1 = sm.snapshot();
    sm.setGlobal('round', 5);
    const snap2 = sm.snapshot();

    expect(snap1.globals['round']).toBe(1);
    expect(snap2.globals['round']).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PER-TEAM TESTS (stub)
// ---------------------------------------------------------------------------

describe('StateManager — Per-Team (stub)', () => {
  it('getTeam returns undefined for non-existent team/field', () => {
    const sm = makeFixtureManager(['p1']);
    expect(sm.getTeam('team-blue', 'score')).toBeUndefined();
  });

  it('setTeam / getTeam round-trip', () => {
    const sm = makeFixtureManager(['p1']);
    sm.setTeam('team-blue', 'score', 250);
    expect(sm.getTeam('team-blue', 'score')).toBe(250);
  });

  it('setTeam creates team state for new team ID', () => {
    const sm = makeFixtureManager(['p1']);
    sm.setTeam('red', 'points', 10);
    sm.setTeam('blue', 'points', 20);
    expect(sm.getTeam('red', 'points')).toBe(10);
    expect(sm.getTeam('blue', 'points')).toBe(20);
  });

  it('team state persists across multiple mutations', () => {
    const sm = makeFixtureManager(['p1']);
    sm.setTeam('red', 'points', 10);
    sm.setTeam('red', 'points', 30);
    expect(sm.getTeam('red', 'points')).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// INTEGRATION TESTS (Schema Engine → State Manager)
// ---------------------------------------------------------------------------

describe('StateManager — Integration with Schema Engine', () => {
  it('loads and initializes from _test-v2 fixture (integration)', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const sm = new StateManager(pkg.state_model, ['a', 'b', 'c', 'd']);

    // Verify all declared fields initialized correctly
    expect(sm.getGlobal('round')).toBe(0);
    expect(sm.getGlobal('total_rounds')).toBe(3);
    expect(sm.getGlobal('current_question')).toBeNull();

    for (const pid of ['a', 'b', 'c', 'd']) {
      expect(sm.getPlayer(pid, 'score')).toBe(0);
      expect(sm.getPlayer(pid, 'answer')).toBeNull();
    }
  });

  it('simulates a round of gameplay correctly', () => {
    const pkg = loadGamePackage(FIXTURE_PATH);
    const sm = new StateManager(pkg.state_model, ['alice', 'bob']);

    // Round 1 begins
    sm.setGlobal('round', 1);
    sm.setGlobal('current_question', 'What is the capital of France?');

    // Players submit answers
    sm.setPlayer('alice', 'answer', 'Paris');
    sm.setPlayer('bob', 'answer', 'London');

    // Scoring
    sm.setPlayer('alice', 'score', 100); // correct
    sm.setPlayer('bob', 'score', 0);     // wrong

    // Verify state
    expect(sm.getGlobal('round')).toBe(1);
    expect(sm.getPlayer('alice', 'score')).toBe(100);
    expect(sm.getPlayer('bob', 'score')).toBe(0);

    // Alice's private view has her answer
    const alicePriv = sm.getPrivateState('alice') as {
      players: Record<string, Record<string, unknown>>;
    };
    expect(alicePriv.players['alice']['answer']).toBe('Paris');

    // Public view hides both answers
    const pub = sm.getPublicState() as {
      players: Record<string, Record<string, unknown>>;
    };
    expect(pub.players['alice']['answer']).toBeUndefined();
    expect(pub.players['bob']['answer']).toBeUndefined();

    // Reset for next round
    sm.setPlayerAll('answer', null);
    expect(sm.getPlayer('alice', 'answer')).toBeNull();
    expect(sm.getPlayer('bob', 'answer')).toBeNull();
    // Scores persist through setPlayerAll on a different field
    expect(sm.getPlayer('alice', 'score')).toBe(100);
  });

  it('works correctly for a minimal game (globals-only state model)', () => {
    // Simulates a game type that only needs global state (e.g. display-only quiz)
    const stateModel: StateModel = {
      globals: {
        question_number: { type: 'integer', default: 1, visibility: 'public' },
        question_text: { type: 'string', default: null, visibility: 'public' },
        time_remaining: { type: 'integer', default: 30, visibility: 'public' },
      },
    };
    const sm = new StateManager(stateModel, []);

    expect(sm.getGlobal('question_number')).toBe(1);
    expect(sm.getGlobal('question_text')).toBeNull();
    expect(sm.getGlobal('time_remaining')).toBe(30);

    sm.setGlobal('question_text', 'Who invented the telephone?');
    expect(sm.getGlobal('question_text')).toBe('Who invented the telephone?');
  });
});
