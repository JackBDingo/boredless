/**
 * schema-engine.test.ts — Tests for the V2 Schema Engine subsystem.
 *
 * Covers:
 * - Valid game package passes validation
 * - Invalid package (missing required fields) fails with clear error paths
 * - Invalid package (wrong types) fails with clear errors
 * - YAML loading works end-to-end (via loadGamePackage)
 * - Schema version mismatch is rejected
 */

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GamePackageSchema, type GamePackage } from '../schema.js';
import { loadGamePackage, validateGamePackage } from '../loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the test fixture game package
const TEST_FIXTURE_PATH = join(__dirname, '../../../../../games/_test-v2/game.yaml');

// ---------------------------------------------------------------------------
// Minimal valid package for inline tests
// ---------------------------------------------------------------------------

const VALID_PACKAGE: unknown = {
  schema_version: '2.0',
  manifest: {
    id: 'inline-test',
    name: 'Inline Test',
    description: 'For inline test validation only.',
    version: '1.0.0',
    players: { min: 2, max: 8 },
  },
  state_model: {
    globals: {
      round: { type: 'integer', default: 0 },
    },
    per_player: {
      score: { type: 'integer', default: 0, visibility: 'public' },
    },
  },
  phases: {
    start: {
      type: 'timed',
      duration: 5,
      on_exit: [{ action: 'advance', to: 'end' }],
    },
    end: {
      type: 'timed',
      duration: 10,
    },
  },
  turn_model: {
    type: 'simultaneous',
  },
  presentation: {
    theme: {
      accent: 'blue',
    },
  },
  scoring: {
    correct_answer: 100,
  },
  victory: {
    type: 'highest_score',
    after: 'all_rounds',
  },
};

// ---------------------------------------------------------------------------
// Tests: validateGamePackage (schema-only, no file I/O)
// ---------------------------------------------------------------------------

describe('validateGamePackage', () => {
  it('accepts a valid game package', () => {
    const result = validateGamePackage(VALID_PACKAGE);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects a package missing the schema_version field', () => {
    const pkg = { ...VALID_PACKAGE as Record<string, unknown> };
    delete pkg['schema_version'];
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    // Error should reference the missing field
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/schema_version/);
  });

  it('rejects a package with wrong schema_version ("1.0" instead of "2.0")', () => {
    const pkg = { ...(VALID_PACKAGE as Record<string, unknown>), schema_version: '1.0' };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors!.join('\n')).toMatch(/schema_version/);
  });

  it('rejects a package missing required manifest fields', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      manifest: {
        // id is missing
        name: 'No ID',
        description: 'Missing id field',
        version: '1.0.0',
        players: { min: 2, max: 8 },
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/manifest\.id/);
  });

  it('rejects a package where manifest.id contains invalid characters', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      manifest: {
        ...(VALID_PACKAGE as Record<string, unknown>)['manifest'] as Record<string, unknown>,
        id: 'Invalid ID With Spaces',
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors!.join('\n')).toMatch(/manifest\.id/);
  });

  it('rejects a package with wrong player count type', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      manifest: {
        ...(VALID_PACKAGE as Record<string, unknown>)['manifest'] as Record<string, unknown>,
        players: { min: 'two', max: 8 },
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    // Should include path to the problematic field
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/manifest\.players\.min/);
  });

  it('rejects a package with an invalid phase type', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      phases: {
        start: {
          type: 'magic',  // not a valid PhaseType
          duration: 5,
        },
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/phases\.start\.type/);
  });

  it('rejects a package with an invalid victory type', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      victory: { type: 'coin_flip' },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/victory\.type/);
  });

  it('rejects a package with an invalid turn_model type', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      turn_model: { type: 'free_for_all' },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/turn_model\.type/);
  });

  it('accepts a package with optional fields omitted', () => {
    // Minimal package — no content, events, roles, teams, objects, rules, extensions, authoring
    const result = validateGamePackage(VALID_PACKAGE);
    expect(result.valid).toBe(true);
  });

  it('accepts a package with optional fields present', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      content: {
        prompts: { type: 'prompt_pool', source: './prompts.json' },
      },
      events: [{ id: 'test_event', trigger: { type: 'phase_start' }, effect: { type: 'state_mutation' } }],
      authoring: { notes: 'Test game' },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(true);
  });

  it('provides error paths for deeply nested invalid fields', () => {
    const pkg = {
      ...(VALID_PACKAGE as Record<string, unknown>),
      state_model: {
        per_player: {
          score: {
            type: 'not_a_valid_type',  // invalid enum value
            default: 0,
          },
        },
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const errorText = result.errors!.join('\n');
    expect(errorText).toMatch(/state_model\.per_player\.score\.type/);
  });

  it('rejects an empty object', () => {
    const result = validateGamePackage({});
    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('rejects null input', () => {
    const result = validateGamePackage(null);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: loadGamePackage (file I/O + validation)
// ---------------------------------------------------------------------------

describe('loadGamePackage', () => {
  it('loads and validates the _test-v2 fixture successfully', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.schema_version).toBe('2.0');
    expect(pkg.manifest.id).toBe('test-v2-fixture');
    expect(pkg.manifest.name).toBe('Test V2 Fixture');
    expect(pkg.manifest.players.min).toBe(2);
    expect(pkg.manifest.players.max).toBe(6);
  });

  it('fixture has expected phases', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(Object.keys(pkg.phases)).toContain('instructions');
    expect(Object.keys(pkg.phases)).toContain('play');
    expect(Object.keys(pkg.phases)).toContain('results');
    expect(Object.keys(pkg.phases)).toContain('final_results');
  });

  it('fixture instructions phase is timed type', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.phases['instructions'].type).toBe('timed');
    expect(pkg.phases['instructions'].duration).toBe(8);
  });

  it('fixture play phase is input_gate type with correct input primitive', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    const play = pkg.phases['play'];
    expect(play.type).toBe('input_gate');
    expect(play.input).toBeDefined();
    expect(play.input!.primitive).toBe('text_submit');
    expect(play.input!.required).toBe('all_players');
  });

  it('fixture has expected state_model globals', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.state_model.globals).toBeDefined();
    expect(pkg.state_model.globals!['round']).toBeDefined();
    expect(pkg.state_model.globals!['round'].type).toBe('integer');
    expect(pkg.state_model.globals!['round'].default).toBe(0);
  });

  it('fixture has expected per_player state with visibility', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.state_model.per_player).toBeDefined();
    expect(pkg.state_model.per_player!['score'].visibility).toBe('public');
    expect(pkg.state_model.per_player!['answer'].visibility).toBe('private');
  });

  it('fixture has simultaneous turn_model', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.turn_model.type).toBe('simultaneous');
  });

  it('fixture has scoring formulas', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.scoring['correct_answer']).toBe(100);
    expect(pkg.scoring['first_correct']).toBe(50);
  });

  it('fixture has highest_score victory condition', () => {
    const pkg = loadGamePackage(TEST_FIXTURE_PATH);
    expect(pkg.victory.type).toBe('highest_score');
    expect(pkg.victory.after).toBe('all_rounds');
  });

  it('returns a properly typed GamePackage object', () => {
    const pkg: GamePackage = loadGamePackage(TEST_FIXTURE_PATH);
    // TypeScript type check — if this compiles, types are correct
    const _id: string = pkg.manifest.id;
    const _version: '2.0' = pkg.schema_version;
    expect(_id).toBeTruthy();
    expect(_version).toBe('2.0');
  });

  it('throws a clear error for a non-existent file', () => {
    expect(() => loadGamePackage('/no/such/file.yaml')).toThrow(
      /Failed to read game package/,
    );
  });

  it('throws with field paths for an invalid YAML package', () => {
    // Write a temp file with invalid content and load it
    const { writeFileSync, unlinkSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const { join: pathJoin } = require('node:path');
    const tmpPath = pathJoin(tmpdir(), `test-invalid-${Date.now()}.yaml`);
    writeFileSync(
      tmpPath,
      `schema_version: "2.0"\nmanifest:\n  id: "bad id with spaces"\n`,
    );
    try {
      expect(() => loadGamePackage(tmpPath)).toThrow(/Invalid game package/);
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: GamePackageSchema direct usage
// ---------------------------------------------------------------------------

describe('GamePackageSchema', () => {
  it('parses a valid package and infers correct types', () => {
    const parsed = GamePackageSchema.safeParse(VALID_PACKAGE);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schema_version).toBe('2.0');
      expect(typeof parsed.data.manifest.id).toBe('string');
    }
  });

  it('is exported correctly from the public index', async () => {
    const { GamePackageSchema: schema, validateGamePackage: validate } = await import(
      '../index.js'
    );
    expect(schema).toBeDefined();
    expect(typeof validate).toBe('function');
  });
});
