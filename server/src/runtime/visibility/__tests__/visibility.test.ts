/**
 * visibility.test.ts — Comprehensive tests for the Visibility & Projection subsystem.
 *
 * Test categories:
 * 1. Basic projection (player, host, spectator, eliminated)
 * 2. Redaction strategies (omit, null, placeholder, count)
 * 3. Global visibility (public, host-only)
 * 4. Edge cases (empty model, unknown player, no visibility declared)
 * 5. Integration test with _test-v2/game.yaml fixture
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectionEngine } from '../projection-engine.js';
import type { Audience } from '../types.js';
import type { StateModel } from '../../schema-engine/index.js';
import type { StateSnapshot } from '../../state-manager/index.js';
import { StateManager } from '../../state-manager/index.js';
import { loadGamePackage } from '../../schema-engine/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/**
 * Build a StateModel for testing:
 *   globals:
 *     round       — public
 *     secret_code — host-only
 *     hint        — spectator-visible
 *   per_player:
 *     score       — public
 *     hand        — private, redaction: omit (default)
 *     role        — private, redaction: null
 *     alias       — private, redaction: placeholder ("???")
 *     cards       — private, redaction: count (array)
 *   per_team:
 *     team_score  — public
 *     team_secret — private
 */
function buildTestStateModel(): StateModel {
  return {
    globals: {
      round: { type: 'integer', default: 1, visibility: 'public' },
      secret_code: { type: 'string', default: 'XYZZY', visibility: 'host' },
      hint: { type: 'string', default: 'A helpful hint', visibility: 'spectator' },
    },
    per_player: {
      score: { type: 'integer', default: 0, visibility: 'public' },
      hand: { type: 'string', default: null, visibility: 'private' /* redaction default: omit */ },
      role: { type: 'string', default: null, visibility: 'private', redaction: 'null' },
      alias: { type: 'string', default: null, visibility: 'private', redaction: 'placeholder', placeholder: '???' },
      cards: { type: 'array', default: [], visibility: 'private', redaction: 'count' },
    },
    per_team: {
      team_score: { type: 'integer', default: 0, visibility: 'public' },
      team_secret: { type: 'string', default: 'mission', visibility: 'private' },
    },
  };
}

/**
 * Build a StateSnapshot with two players and one team.
 */
function buildTestSnapshot(): StateSnapshot {
  return {
    globals: {
      round: 3,
      secret_code: 'XYZZY',
      hint: 'A helpful hint',
    },
    players: {
      alice: {
        score: 150,
        hand: 'ace_of_spades',
        role: 'werewolf',
        alias: 'Shadow',
        cards: ['card1', 'card2', 'card3'],
      },
      bob: {
        score: 80,
        hand: 'king_of_hearts',
        role: 'villager',
        alias: 'Oak',
        cards: ['card4', 'card5'],
      },
    },
    teams: {
      red: {
        team_score: 200,
        team_secret: 'steal the flag',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Basic projection tests
// ---------------------------------------------------------------------------

describe('ProjectionEngine — basic projection', () => {
  let engine: ProjectionEngine;
  let snapshot: StateSnapshot;

  beforeEach(() => {
    engine = new ProjectionEngine(buildTestStateModel());
    snapshot = buildTestSnapshot();
  });

  // --- player audience ---

  it('player sees their own private fields', () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Alice sees her own hand, role, alias, cards
    expect(result.players['alice']).toMatchObject({
      score: 150,
      hand: 'ace_of_spades',
      role: 'werewolf',
      alias: 'Shadow',
      cards: ['card1', 'card2', 'card3'],
    });
  });

  it("player does NOT see other players' private fields (omit)", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Bob's 'hand' has redaction: omit (default) → absent from output
    expect(result.players['bob']).not.toHaveProperty('hand');
  });

  it("player sees other players' public fields", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    expect(result.players['bob']['score']).toBe(80);
  });

  it("player sees public globals", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['round']).toBe(3);
  });

  it("player does NOT see host-only globals", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    expect(result.globals).not.toHaveProperty('secret_code');
  });

  it("player sees spectator-scoped globals", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['hint']).toBe('A helpful hint');
  });

  // --- host audience ---

  it('host sees ALL player fields (private, role, alias, cards)', () => {
    const audience: Audience = { type: 'host' };
    const result = engine.project(snapshot, audience);

    expect(result.players['alice']).toMatchObject({
      score: 150,
      hand: 'ace_of_spades',
      role: 'werewolf',
      alias: 'Shadow',
      cards: ['card1', 'card2', 'card3'],
    });
    expect(result.players['bob']).toMatchObject({
      score: 80,
      hand: 'king_of_hearts',
      role: 'villager',
      alias: 'Oak',
      cards: ['card4', 'card5'],
    });
  });

  it('host sees host-only globals', () => {
    const audience: Audience = { type: 'host' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['secret_code']).toBe('XYZZY');
  });

  it('host sees spectator-scoped and public globals', () => {
    const audience: Audience = { type: 'host' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['round']).toBe(3);
    expect(result.globals['hint']).toBe('A helpful hint');
  });

  it('host sees team private fields', () => {
    const audience: Audience = { type: 'host' };
    const result = engine.project(snapshot, audience);

    expect(result.teams['red']['team_secret']).toBe('steal the flag');
  });

  // --- spectator audience ---

  it('spectator sees public globals', () => {
    const audience: Audience = { type: 'spectator' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['round']).toBe(3);
  });

  it('spectator sees spectator-scoped globals', () => {
    const audience: Audience = { type: 'spectator' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['hint']).toBe('A helpful hint');
  });

  it('spectator does NOT see host-only globals', () => {
    const audience: Audience = { type: 'spectator' };
    const result = engine.project(snapshot, audience);

    expect(result.globals).not.toHaveProperty('secret_code');
  });

  it("spectator only sees players' public fields", () => {
    const audience: Audience = { type: 'spectator' };
    const result = engine.project(snapshot, audience);

    expect(result.players['alice']['score']).toBe(150);
    expect(result.players['alice']).not.toHaveProperty('hand');
  });

  // --- eliminated audience ---

  it('eliminated player sees only public globals', () => {
    const audience: Audience = { type: 'eliminated', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    expect(result.globals['round']).toBe(3);
    expect(result.globals).not.toHaveProperty('secret_code');
    // spectator field should also be hidden for eliminated
    expect(result.globals).not.toHaveProperty('hint');
  });

  it("eliminated player sees only public player fields", () => {
    const audience: Audience = { type: 'eliminated', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Eliminated player sees public fields for themselves and others
    expect(result.players['alice']['score']).toBe(150);
    expect(result.players['alice']).not.toHaveProperty('hand');
    expect(result.players['bob']['score']).toBe(80);
    expect(result.players['bob']).not.toHaveProperty('hand');
  });
});

// ---------------------------------------------------------------------------
// 2. Redaction strategy tests
// ---------------------------------------------------------------------------

describe('ProjectionEngine — redaction strategies', () => {
  let engine: ProjectionEngine;
  let snapshot: StateSnapshot;

  beforeEach(() => {
    engine = new ProjectionEngine(buildTestStateModel());
    snapshot = buildTestSnapshot();
  });

  it("'omit' strategy: field absent from output", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Bob's hand has no explicit redaction → defaults to omit
    expect(result.players['bob']).not.toHaveProperty('hand');
  });

  it("'null' strategy: field present with null value", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Bob's role has redaction: null
    expect(result.players['bob']).toHaveProperty('role');
    expect(result.players['bob']['role']).toBeNull();
  });

  it("'placeholder' strategy: field present with placeholder value", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Bob's alias has redaction: placeholder, placeholder: '???'
    expect(result.players['bob']).toHaveProperty('alias');
    expect(result.players['bob']['alias']).toBe('???');
  });

  it("'count' strategy: array field shown as { count: N }", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Bob has 2 cards; alice sees count instead of contents
    expect(result.players['bob']).toHaveProperty('cards');
    expect(result.players['bob']['cards']).toEqual({ count: 2 });
  });

  it("'count' strategy: own player sees actual array", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Alice sees her own cards as actual array
    expect(result.players['alice']['cards']).toEqual(['card1', 'card2', 'card3']);
  });

  it("redactedFields meta lists which fields were redacted", () => {
    const audience: Audience = { type: 'player', playerId: 'alice' };
    const result = engine.project(snapshot, audience);

    // Bob's private fields should appear in redactedFields
    expect(result.meta.redactedFields).toContain('players.bob.hand');
    expect(result.meta.redactedFields).toContain('players.bob.role');
    expect(result.meta.redactedFields).toContain('players.bob.alias');
    expect(result.meta.redactedFields).toContain('players.bob.cards');
    // Not Alice's own fields
    expect(result.meta.redactedFields).not.toContain('players.alice.hand');
  });
});

// ---------------------------------------------------------------------------
// 3. Global visibility tests
// ---------------------------------------------------------------------------

describe('ProjectionEngine — global visibility', () => {
  let engine: ProjectionEngine;
  let snapshot: StateSnapshot;

  beforeEach(() => {
    engine = new ProjectionEngine(buildTestStateModel());
    snapshot = buildTestSnapshot();
  });

  it('public globals visible to all audience types', () => {
    const audiences: Audience[] = [
      { type: 'player', playerId: 'alice' },
      { type: 'host' },
      { type: 'spectator' },
      { type: 'eliminated', playerId: 'alice' },
    ];

    for (const audience of audiences) {
      const result = engine.project(snapshot, audience);
      expect(result.globals['round']).toBe(3);
    }
  });

  it('host-only globals visible only to host', () => {
    const nonHostAudiences: Audience[] = [
      { type: 'player', playerId: 'alice' },
      { type: 'spectator' },
      { type: 'eliminated', playerId: 'alice' },
    ];

    for (const audience of nonHostAudiences) {
      const result = engine.project(snapshot, audience);
      expect(result.globals).not.toHaveProperty('secret_code');
    }

    const hostResult = engine.project(snapshot, { type: 'host' });
    expect(hostResult.globals['secret_code']).toBe('XYZZY');
  });

  it('fields with no visibility declaration default to public', () => {
    const modelWithUndeclaredField: StateModel = {
      globals: {
        // No visibility declared
        turn: { type: 'integer', default: 1 },
      },
    };
    const eng = new ProjectionEngine(modelWithUndeclaredField);
    const snap: StateSnapshot = {
      globals: { turn: 7 },
      players: {},
      teams: {},
    };

    // All audience types should see it
    expect(eng.project(snap, { type: 'player', playerId: 'p1' }).globals['turn']).toBe(7);
    expect(eng.project(snap, { type: 'spectator' }).globals['turn']).toBe(7);
    expect(eng.project(snap, { type: 'eliminated', playerId: 'p1' }).globals['turn']).toBe(7);
    expect(eng.project(snap, { type: 'host' }).globals['turn']).toBe(7);
  });

  it('undeclared fields in snapshot (not in schema) default to public', () => {
    const eng = new ProjectionEngine({});
    const snap: StateSnapshot = {
      globals: { mystery_field: 42 },
      players: {},
      teams: {},
    };

    const result = eng.project(snap, { type: 'spectator' });
    expect(result.globals['mystery_field']).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// 4. Edge cases
// ---------------------------------------------------------------------------

describe('ProjectionEngine — edge cases', () => {
  it('empty state model produces empty projection', () => {
    const engine = new ProjectionEngine({});
    const snap: StateSnapshot = { globals: {}, players: {}, teams: {} };
    const result = engine.project(snap, { type: 'spectator' });

    expect(result.globals).toEqual({});
    expect(result.players).toEqual({});
    expect(result.teams).toEqual({});
    expect(result.meta.redactedFields).toEqual([]);
  });

  it('player not in state snapshot — returns empty player entry', () => {
    const engine = new ProjectionEngine(buildTestStateModel());
    const snap: StateSnapshot = {
      globals: { round: 1 },
      players: {}, // no players
      teams: {},
    };

    // Requesting as a player who does not exist in snapshot
    const result = engine.project(snap, { type: 'player', playerId: 'ghost' });

    // No player data returned for 'ghost'
    expect(result.players).not.toHaveProperty('ghost');
    // Globals still projected correctly
    expect(result.globals['round']).toBe(1);
  });

  it('phase extracted from globals.phase when present', () => {
    const engine = new ProjectionEngine({});
    const snap: StateSnapshot = {
      globals: { phase: 'voting' },
      players: {},
      teams: {},
    };

    const result = engine.project(snap, { type: 'spectator' });
    expect(result.meta.phase).toBe('voting');
  });

  it('phase is null when not in globals', () => {
    const engine = new ProjectionEngine({});
    const snap: StateSnapshot = { globals: {}, players: {}, teams: {} };

    const result = engine.project(snap, { type: 'host' });
    expect(result.meta.phase).toBeNull();
  });

  it('audience info preserved in meta', () => {
    const engine = new ProjectionEngine({});
    const snap: StateSnapshot = { globals: {}, players: {}, teams: {} };
    const audience: Audience = { type: 'player', playerId: 'alice' };

    const result = engine.project(snap, audience);
    expect(result.meta.audience).toEqual(audience);
  });

  it('no visibility on per_player fields defaults to public', () => {
    const model: StateModel = {
      per_player: {
        name: { type: 'string', default: '' }, // no visibility
      },
    };
    const engine = new ProjectionEngine(model);
    const snap: StateSnapshot = {
      globals: {},
      players: { alice: { name: 'Alice' }, bob: { name: 'Bob' } },
      teams: {},
    };

    // Player audience sees all names (public default)
    const result = engine.project(snap, { type: 'player', playerId: 'alice' });
    expect(result.players['alice']['name']).toBe('Alice');
    expect(result.players['bob']['name']).toBe('Bob');
  });

  it('count redaction on non-array falls back to null', () => {
    const model: StateModel = {
      per_player: {
        chips: { type: 'integer', default: 0, visibility: 'private', redaction: 'count' },
      },
    };
    const engine = new ProjectionEngine(model);
    const snap: StateSnapshot = {
      globals: {},
      players: { alice: { chips: 100 }, bob: { chips: 50 } },
      teams: {},
    };

    const result = engine.project(snap, { type: 'player', playerId: 'alice' });
    // Bob's chips are private; count on non-array → null
    expect(result.players['bob']['chips']).toBeNull();
  });

  it('placeholder strategy uses "?" when no placeholder declared', () => {
    const model: StateModel = {
      per_player: {
        secret: { type: 'string', default: null, visibility: 'private', redaction: 'placeholder' },
        // No placeholder value declared
      },
    };
    const engine = new ProjectionEngine(model);
    const snap: StateSnapshot = {
      globals: {},
      players: { alice: { secret: 'classified' }, bob: { secret: 'hidden' } },
      teams: {},
    };

    const result = engine.project(snap, { type: 'player', playerId: 'alice' });
    // Bob's secret: placeholder falls back to '?'
    expect(result.players['bob']['secret']).toBe('?');
  });
});

// ---------------------------------------------------------------------------
// 5. Integration test with _test-v2/game.yaml
// ---------------------------------------------------------------------------

describe('ProjectionEngine — integration with _test-v2/game.yaml', () => {
  it('loads fixture, sets values, projects correctly', async () => {
    // Load the real game package
    const __filename = fileURLToPath(import.meta.url);
    const __dirname_local = dirname(__filename);
    const fixturePath = join(__dirname_local, '../../../../../games/_test-v2/game.yaml');
    const pkg = await loadGamePackage(fixturePath);

    // Create StateManager with two players
    const players = ['player1', 'player2'];
    const sm = new StateManager(pkg.state_model, players);

    // Set some values
    sm.setGlobal('round', 2);
    sm.setGlobal('current_question', 'What is the meaning of life?');
    sm.setPlayer('player1', 'answer', 'chocolate cake');
    sm.setPlayer('player1', 'score', 100);
    sm.setPlayer('player2', 'answer', '42');
    sm.setPlayer('player2', 'score', 50);

    // Build projection engine from the package's state model
    const engine = new ProjectionEngine(pkg.state_model);
    const snapshot = sm.snapshot();

    // --- Player 1 view ---
    const p1View = engine.project(snapshot, { type: 'player', playerId: 'player1' });

    // Player 1 sees their own answer
    expect(p1View.players['player1']['answer']).toBe('chocolate cake');
    // Player 1 does NOT see player 2's answer (private)
    expect(p1View.players['player2']).not.toHaveProperty('answer');
    // Player 1 sees public scores
    expect(p1View.players['player1']['score']).toBe(100);
    expect(p1View.players['player2']['score']).toBe(50);
    // Public globals visible
    expect(p1View.globals['round']).toBe(2);
    expect(p1View.globals['current_question']).toBe('What is the meaning of life?');

    // --- Player 2 view ---
    const p2View = engine.project(snapshot, { type: 'player', playerId: 'player2' });

    // Player 2 sees their own answer
    expect(p2View.players['player2']['answer']).toBe('42');
    // Player 2 does NOT see player 1's answer
    expect(p2View.players['player1']).not.toHaveProperty('answer');

    // --- Host view ---
    const hostView = engine.project(snapshot, { type: 'host' });

    // Host sees everything
    expect(hostView.players['player1']['answer']).toBe('chocolate cake');
    expect(hostView.players['player2']['answer']).toBe('42');
    expect(hostView.globals['round']).toBe(2);

    // --- Spectator view ---
    const spectatorView = engine.project(snapshot, { type: 'spectator' });

    // Spectator does NOT see private answers
    expect(spectatorView.players['player1']).not.toHaveProperty('answer');
    expect(spectatorView.players['player2']).not.toHaveProperty('answer');
    // But spectator sees public scores
    expect(spectatorView.players['player1']['score']).toBe(100);
    expect(spectatorView.players['player2']['score']).toBe(50);
  });
});
