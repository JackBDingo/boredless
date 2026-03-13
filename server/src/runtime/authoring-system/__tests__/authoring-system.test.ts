/**
 * authoring-system.test.ts — Tests for Phase 4.4 AI Authoring Foundation.
 *
 * Tests:
 * - Introspector: extract phase, interaction, content, score, rule info
 * - Complexity calculator: tiers, flags, estimatedSetupMinutes
 * - Validator: transitions, orphans, interactions, content refs, score tracks, victory, extensions
 * - Template library: all templates generate valid schemas
 * - Capability docs: complete, formatted, findable
 * - Integration: party → validate → introspect → complexity check
 */

import { describe, it, expect } from 'vitest';

import {
  introspect,
  calculateComplexity,
  validateGamePackage,
  getTemplate,
  getAvailableTemplates,
  getCapabilityDocs,
  getCapabilityDoc,
  generateSchemaReference,
} from '../index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MINIMAL_PACKAGE: Record<string, unknown> = {
  schema_version: '2.0',
  manifest: {
    id: 'test-minimal',
    name: 'Test Minimal',
    version: '1.0.0',
    description: 'Minimal test game',
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
  turn_model: { type: 'simultaneous' },
  phases: {
    lobby: {
      type: 'timed',
      duration: 5,
      on_exit: [{ action: 'advance', to: 'play' }],
    },
    play: {
      type: 'input_gate',
      duration: 30,
      input: {
        primitive: 'text_submit',
        target: 'per_player.answer',
        required: 'all_players',
      },
      on_complete: [{ action: 'advance', to: 'end' }],
    },
    end: {
      type: 'timed',
      duration: 10,
    },
  },
  scoring: { correct_answer: 100 },
  victory: { type: 'highest_score', after: 'all_rounds' },
};

const COMPLEX_PACKAGE: Record<string, unknown> = {
  schema_version: '2.0',
  manifest: {
    id: 'test-complex',
    name: 'Test Complex',
    version: '1.0.0',
    description: 'Complex test game',
    players: { min: 4, max: 12 },
  },
  state_model: {
    globals: {
      round: { type: 'integer', default: 0 },
      phase_count: { type: 'integer', default: 0 },
    },
    per_player: {
      score: { type: 'integer', default: 0, visibility: 'public' },
      lives: { type: 'integer', default: 3, visibility: 'public' },
      role: { type: 'string', default: null, visibility: 'private' },
    },
  },
  turn_model: { type: 'simultaneous' },
  phases: {
    lobby: { type: 'timed', duration: 5, on_exit: [{ action: 'advance', to: 'setup' }] },
    setup: { type: 'timed', duration: 5, on_exit: [{ action: 'advance', to: 'play' }] },
    play: {
      type: 'input_gate',
      duration: 30,
      input: { primitive: 'text_submit', target: 'per_player.answer', required: 'all_players' },
      on_complete: [{ action: 'advance', to: 'vote' }],
    },
    vote: {
      type: 'input_gate',
      duration: 20,
      input: { primitive: 'vote', target: 'per_player.vote', required: 'all_players' },
      on_complete: [{ action: 'advance', to: 'reveal' }],
    },
    reveal: { type: 'timed', duration: 8, on_exit: [{ action: 'advance', to: 'scores' }] },
    scores: { type: 'timed', duration: 10, on_exit: [{ action: 'advance', to: 'play' }] },
    end: { type: 'timed', duration: 10 },
  },
  scoring: {
    tracks: [
      { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
      { id: 'lives', name: 'Lives', initial: 3, direction: 'lower-better' },
    ],
    rules: [
      { id: 'score_correct', track: 'points', trigger: 'manual', formula: { type: 'fixed', amount: 100 } },
      { id: 'score_speed', track: 'points', trigger: 'manual', formula: { type: 'expression', expr: 'elapsed_ms < 5000 ? 50 : 0' } },
      { id: 'lose_life', track: 'lives', trigger: 'manual', formula: { type: 'fixed', amount: -1 } },
    ],
  },
  rules: [
    { id: 'check_alive', when: { type: 'comparison', left: 'player.lives', operator: '>', right: 0 }, then: [] },
    { id: 'check_winner', when: { type: 'comparison', left: 'player.score', operator: '>=', right: 500 }, then: [] },
    { id: 'comeback', when: { type: 'expression', expr: 'leader.score - player.score > 200' }, then: [] },
    { id: 'rule4', when: { type: 'comparison', left: 'x', operator: '>', right: 0 }, then: [] },
  ],
  extensions: {
    renderers: {
      custom_board: { name: 'Custom Board', display: './display/Board.tsx' },
    },
  },
  victory: { type: 'highest_score', after: 'all_rounds' },
};

// ---------------------------------------------------------------------------
// Introspector tests
// ---------------------------------------------------------------------------

describe('Introspector', () => {
  it('introspects minimal game package', () => {
    const result = introspect(MINIMAL_PACKAGE);
    expect(result.id).toBe('test-minimal');
    expect(result.name).toBe('Test Minimal');
    expect(result.version).toBe('1.0.0');
  });

  it('extracts phase info correctly', () => {
    const result = introspect(MINIMAL_PACKAGE);
    expect(result.subsystems.phases).toHaveLength(3);

    const lobby = result.subsystems.phases.find((p) => p.id === 'lobby');
    expect(lobby).toBeDefined();
    expect(lobby?.type).toBe('timed');
    expect(lobby?.hasTimer).toBe(true);
    expect(lobby?.transitions).toContain('play');
  });

  it('extracts interaction info', () => {
    const result = introspect(MINIMAL_PACKAGE);
    expect(result.subsystems.interactions).toHaveLength(1);

    const interaction = result.subsystems.interactions[0];
    expect(interaction.type).toBe('text_submit');
    expect(interaction.phase).toBe('play');
    expect(interaction.surface).toContain('phone');
  });

  it('extracts content source info (new pool format)', () => {
    const pkg = {
      ...MINIMAL_PACKAGE,
      content: {
        pools: [
          {
            id: 'prompts',
            sources: [{ type: 'file', path: './prompts.json' }],
            selection: 'random',
          },
        ],
      },
    };
    const result = introspect(pkg);
    expect(result.subsystems.contentSources).toHaveLength(1);
    expect(result.subsystems.contentSources[0].type).toBe('file');
  });

  it('extracts score track info from V2 scoring', () => {
    const result = introspect(COMPLEX_PACKAGE);
    expect(result.subsystems.scoreTracks).toHaveLength(2);

    const points = result.subsystems.scoreTracks.find((t) => t.id === 'points');
    expect(points?.name).toBe('Points');
    expect(points?.direction).toBe('higher-better');
  });

  it('extracts score track info from legacy V1 scoring', () => {
    const result = introspect(MINIMAL_PACKAGE);
    // legacy scoring: { correct_answer: 100 } → infer a "score" track
    expect(result.subsystems.scoreTracks).toHaveLength(1);
    expect(result.subsystems.scoreTracks[0].id).toBe('score');
  });

  it('extracts rule info', () => {
    const result = introspect(COMPLEX_PACKAGE);
    expect(result.subsystems.rules.length).toBeGreaterThan(0);

    const r = result.subsystems.rules[0];
    expect(r.id).toBeDefined();
    expect(r.conditionType).toBeDefined();
    expect(Array.isArray(r.actionTypes)).toBe(true);
  });

  it('reports empty subsystems for minimal package', () => {
    const result = introspect(MINIMAL_PACKAGE);
    expect(result.subsystems.contentSources).toHaveLength(0);
    expect(result.subsystems.extensions).toHaveLength(0);
    expect(result.subsystems.screens).toHaveLength(0);
    expect(result.subsystems.assets).toHaveLength(0);
  });

  it('handles missing optional sections gracefully', () => {
    const minimal = {
      manifest: { id: 'bare', name: 'Bare', version: '1.0.0' },
      phases: {},
    };
    expect(() => introspect(minimal as Record<string, unknown>)).not.toThrow();
    const result = introspect(minimal as Record<string, unknown>);
    expect(result.subsystems.phases).toHaveLength(0);
    expect(result.subsystems.rules).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Complexity calculator tests
// ---------------------------------------------------------------------------

describe('Complexity calculator', () => {
  it('scores simple game as simple (≤3 phases, ≤2 rules, no extensions)', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: [
          { id: 'a', type: 'timed', hasTimer: true, transitions: [] },
          { id: 'b', type: 'input_gate', hasTimer: true, transitions: [] },
          { id: 'c', type: 'timed', hasTimer: true, transitions: [] },
        ],
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: [{ id: 'r1', conditionType: 'comparison', actionTypes: [] }],
        extensions: [],
        screens: [],
        assets: [],
      },
    });
    expect(score.overall).toBe('simple');
  });

  it('scores moderate game correctly (≤6 phases, ≤5 rules, ≤1 extension)', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: Array.from({ length: 5 }, (_, i) => ({
          id: `p${i}`,
          type: 'timed',
          hasTimer: true,
          transitions: [],
        })),
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: Array.from({ length: 4 }, (_, i) => ({
          id: `r${i}`,
          conditionType: 'comparison',
          actionTypes: [],
        })),
        extensions: [],
        screens: [],
        assets: [],
      },
    });
    expect(score.overall).toBe('moderate');
  });

  it('scores complex game correctly (≤10 phases, ≤10 rules, ≤3 extensions)', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: Array.from({ length: 8 }, (_, i) => ({
          id: `p${i}`,
          type: 'timed',
          hasTimer: false,
          transitions: [],
        })),
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: Array.from({ length: 7 }, (_, i) => ({
          id: `r${i}`,
          conditionType: 'comparison',
          actionTypes: [],
        })),
        extensions: [
          { id: 'e1', name: 'E1', type: 'renderers' },
          { id: 'e2', name: 'E2', type: 'rules' },
        ],
        screens: [],
        assets: [],
      },
    });
    expect(score.overall).toBe('complex');
  });

  it('scores advanced game correctly (beyond complex thresholds)', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: Array.from({ length: 12 }, (_, i) => ({
          id: `p${i}`,
          type: 'timed',
          hasTimer: true,
          transitions: [],
        })),
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: Array.from({ length: 15 }, (_, i) => ({
          id: `r${i}`,
          conditionType: 'comparison',
          actionTypes: [],
        })),
        extensions: [
          { id: 'e1', name: 'E1', type: 'renderers' },
          { id: 'e2', name: 'E2', type: 'rules' },
          { id: 'e3', name: 'E3', type: 'interactions' },
          { id: 'e4', name: 'E4', type: 'lifecycle' },
        ],
        screens: [],
        assets: [],
      },
    });
    expect(score.overall).toBe('advanced');
  });

  it('detects hasCustomExtensions when extensions present', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: [],
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: [],
        extensions: [{ id: 'e1', name: 'E1', type: 'renderers' }],
        screens: [],
        assets: [],
      },
    });
    expect(score.hasCustomExtensions).toBe(true);
  });

  it('detects hasMultipleScoreTracks', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: [],
        interactions: [],
        contentSources: [],
        scoreTracks: [
          { id: 'points', name: 'Points', direction: 'higher-better' },
          { id: 'lives', name: 'Lives', direction: 'lower-better' },
        ],
        rules: [],
        extensions: [],
        screens: [],
        assets: [],
      },
    });
    expect(score.hasMultipleScoreTracks).toBe(true);
  });

  it('detects hasTimers', () => {
    const score = calculateComplexity({
      subsystems: {
        phases: [{ id: 'play', type: 'input_gate', hasTimer: true, transitions: [] }],
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: [],
        extensions: [],
        screens: [],
        assets: [],
      },
    });
    expect(score.hasTimers).toBe(true);
  });

  it('returns estimatedSetupMinutes in reasonable range (1-30)', () => {
    // Test for both simple and complex games
    const simpleScore = calculateComplexity({
      subsystems: {
        phases: [{ id: 'a', type: 'timed', hasTimer: false, transitions: [] }],
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: [],
        extensions: [],
        screens: [],
        assets: [],
      },
    });
    expect(simpleScore.estimatedSetupMinutes).toBeGreaterThanOrEqual(1);
    expect(simpleScore.estimatedSetupMinutes).toBeLessThanOrEqual(30);

    const complexScore = calculateComplexity({
      subsystems: {
        phases: Array.from({ length: 10 }, (_, i) => ({
          id: `p${i}`,
          type: 'timed',
          hasTimer: true,
          transitions: [],
        })),
        interactions: [],
        contentSources: [],
        scoreTracks: [],
        rules: Array.from({ length: 10 }, (_, i) => ({
          id: `r${i}`,
          conditionType: 'comparison',
          actionTypes: [],
        })),
        extensions: [{ id: 'e1', name: 'E1', type: 'renderers' }],
        screens: [],
        assets: [],
      },
    });
    expect(complexScore.estimatedSetupMinutes).toBeGreaterThanOrEqual(1);
    expect(complexScore.estimatedSetupMinutes).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// Validator tests
// ---------------------------------------------------------------------------

describe('Validator', () => {
  it('valid minimal package passes validation', () => {
    const result = validateGamePackage(MINIMAL_PACKAGE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing initial phase flagged as error', () => {
    const pkg = { ...MINIMAL_PACKAGE, phases: {} };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'phases')).toBe(true);
  });

  it('transition to nonexistent phase flagged as error', () => {
    const pkg = {
      ...MINIMAL_PACKAGE,
      phases: {
        lobby: {
          type: 'timed',
          duration: 5,
          on_exit: [{ action: 'advance', to: 'does_not_exist' }],
        },
        play: {
          type: 'input_gate',
          duration: 30,
          input: { primitive: 'text_submit', target: 'per_player.answer', required: 'all_players' },
          on_complete: [{ action: 'advance', to: 'end' }],
        },
        end: { type: 'timed', duration: 10 },
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const transitionError = result.errors.find((e) => e.message.includes('does_not_exist'));
    expect(transitionError).toBeDefined();
  });

  it('orphaned phase flagged as warning', () => {
    const pkg = {
      ...MINIMAL_PACKAGE,
      phases: {
        lobby: {
          type: 'timed',
          duration: 5,
          on_exit: [{ action: 'advance', to: 'play' }],
        },
        play: {
          type: 'input_gate',
          duration: 30,
          input: { primitive: 'text_submit', target: 'per_player.answer', required: 'all_players' },
          on_complete: [{ action: 'advance', to: 'end' }],
        },
        end: { type: 'timed', duration: 10 },
        orphan: { type: 'timed', duration: 5 }, // not reachable from lobby
      },
    };
    const result = validateGamePackage(pkg);
    const orphanWarning = result.warnings.find((w) => w.message.includes('orphan'));
    expect(orphanWarning).toBeDefined();
    expect(orphanWarning?.severity).toBe('warning');
  });

  it('invalid score track reference in scoring rules flagged', () => {
    const pkg = {
      ...MINIMAL_PACKAGE,
      scoring: {
        tracks: [{ id: 'points', name: 'Points', initial: 0, direction: 'higher-better' }],
        rules: [
          {
            id: 'bad_rule',
            track: 'nonexistent_track',
            trigger: 'manual',
            formula: { type: 'fixed', amount: 100 },
          },
        ],
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const trackError = result.errors.find((e) => e.message.includes('nonexistent_track'));
    expect(trackError).toBeDefined();
  });

  it('no interactions flagged as warning', () => {
    const pkg = {
      ...MINIMAL_PACKAGE,
      phases: {
        lobby: { type: 'timed', duration: 5, on_exit: [{ action: 'advance', to: 'end' }] },
        end: { type: 'timed', duration: 10 },
      },
    };
    const result = validateGamePackage(pkg);
    const interactionWarning = result.warnings.find((w) =>
      w.message.toLowerCase().includes('interaction'),
    );
    expect(interactionWarning).toBeDefined();
  });

  it('valid complex package passes validation', () => {
    const result = validateGamePackage(COMPLEX_PACKAGE);
    // Complex package has valid structure — should pass
    // (orphaned 'end' phase may generate a warning, but not errors)
    expect(result.errors).toHaveLength(0);
  });

  it('unknown extension type flagged as error', () => {
    const pkg = {
      ...MINIMAL_PACKAGE,
      extensions: {
        unknown_type: {
          some_ext: { name: 'Bad Extension' },
        },
      },
    };
    const result = validateGamePackage(pkg);
    expect(result.valid).toBe(false);
    const extError = result.errors.find((e) => e.message.includes('unknown_type'));
    expect(extError).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Template library tests
// ---------------------------------------------------------------------------

describe('Template library', () => {
  it('getAvailableTemplates returns all template types', () => {
    const templates = getAvailableTemplates();
    const types = templates.map((t) => t.type);
    expect(types).toContain('minimal');
    expect(types).toContain('party');
    expect(types).toContain('trivia');
    expect(types).toContain('hidden-role');
    expect(types).toContain('drawing');
    expect(types).toContain('word');
    expect(types).toContain('card');
    expect(types).toContain('board');
    expect(templates).toHaveLength(8);
  });

  it('each template type generates a schema with required fields', () => {
    const types = ['minimal', 'party', 'trivia', 'hidden-role', 'drawing', 'word', 'card', 'board'] as const;
    for (const type of types) {
      const template = getTemplate(type);
      expect(template.schema).toBeDefined();
      expect(template.schema.schema_version).toBe('2.0');
      expect(template.schema.manifest).toBeDefined();
      expect(template.schema.phases).toBeDefined();
      expect(template.schema.victory).toBeDefined();
    }
  });

  it('minimal template has ≤3 phases', () => {
    const template = getTemplate('minimal');
    const phases = template.schema.phases as Record<string, unknown>;
    expect(Object.keys(phases).length).toBeLessThanOrEqual(3);
  });

  it('party template has prompt and vote phases', () => {
    const template = getTemplate('party');
    const phases = template.schema.phases as Record<string, unknown>;
    expect(Object.keys(phases)).toContain('prompt');
    expect(Object.keys(phases)).toContain('vote');
  });

  it('trivia template has timer on answer phase', () => {
    const template = getTemplate('trivia');
    const phases = template.schema.phases as Record<string, unknown>;
    const answerPhase = phases.answer as Record<string, unknown>;
    expect(answerPhase).toBeDefined();
    expect(answerPhase.duration).toBeDefined();
    expect(Number(answerPhase.duration)).toBeGreaterThan(0);
  });

  it('hidden-role template has role assignment', () => {
    const template = getTemplate('hidden-role');
    // Roles section should be present
    expect(template.schema.roles).toBeDefined();
    // Should have role_reveal phase or assign_roles action somewhere
    const phases = template.schema.phases as Record<string, unknown>;
    const phaseValues = Object.values(phases).map((p) => JSON.stringify(p));
    const hasRoleAssignment = phaseValues.some((p) => p.includes('assign_roles') || p.includes('role_reveal'));
    expect(hasRoleAssignment).toBe(true);
  });

  it('templates include game.yaml content (schema is a full object)', () => {
    const types = ['minimal', 'party', 'trivia'] as const;
    for (const type of types) {
      const template = getTemplate(type);
      expect(typeof template.schema).toBe('object');
      expect(Object.keys(template.schema).length).toBeGreaterThan(3);
    }
  });

  it('template files array includes README', () => {
    const types = ['minimal', 'party', 'trivia', 'hidden-role'] as const;
    for (const type of types) {
      const template = getTemplate(type);
      const readme = template.files.find((f) => f.path === 'README.md');
      expect(readme).toBeDefined();
      expect(readme?.content.length).toBeGreaterThan(0);
    }
  });

  it('template complexity scores are reasonable', () => {
    const minimal = getTemplate('minimal');
    expect(minimal.complexity.overall).toBe('simple');

    // Party should have more than 3 phases → not simple
    const party = getTemplate('party');
    expect(['moderate', 'complex', 'advanced']).toContain(party.complexity.overall);
  });
});

// ---------------------------------------------------------------------------
// Capability docs tests
// ---------------------------------------------------------------------------

describe('Capability docs', () => {
  it('getCapabilityDocs returns non-empty array', () => {
    const docs = getCapabilityDocs();
    expect(docs.length).toBeGreaterThan(0);
  });

  it('each doc has required fields (name, category, description, yamlExample)', () => {
    const docs = getCapabilityDocs();
    for (const doc of docs) {
      expect(doc.name).toBeTruthy();
      expect(doc.category).toBeTruthy();
      expect(doc.description).toBeTruthy();
      expect(doc.yamlExample).toBeTruthy();
    }
  });

  it('interaction docs cover all primitive types', () => {
    const docs = getCapabilityDocs();
    const interactionDocs = docs.filter((d) => d.category === 'interaction');
    const interactionNames = interactionDocs.map((d) => d.name);

    // Must document all major primitive types
    expect(interactionNames).toContain('text-input');
    expect(interactionNames).toContain('choice');
    expect(interactionNames).toContain('vote');
    expect(interactionNames).toContain('number-input');
    expect(interactionNames).toContain('toggle');
    expect(interactionNames).toContain('ranking');
    expect(interactionNames).toContain('slider');
  });

  it('generateSchemaReference returns a markdown string', () => {
    const ref = generateSchemaReference();
    expect(typeof ref).toBe('string');
    expect(ref.length).toBeGreaterThan(500);
    expect(ref.startsWith('#')).toBe(true);
  });

  it('schema reference mentions all subsystems', () => {
    const ref = generateSchemaReference();
    // All major subsystems should be mentioned
    expect(ref).toContain('Interaction');
    expect(ref).toContain('Phase');
    expect(ref).toContain('Content');
    expect(ref).toContain('Scoring');
    expect(ref).toContain('Presentation');
    expect(ref).toContain('Extension');
    expect(ref).toContain('Asset');
  });

  it('getCapabilityDoc finds specific capability', () => {
    const doc = getCapabilityDoc('text-input');
    expect(doc).toBeDefined();
    expect(doc?.name).toBe('text-input');
    expect(doc?.category).toBe('interaction');
  });

  it('getCapabilityDoc returns undefined for unknown capability', () => {
    const doc = getCapabilityDoc('does-not-exist');
    expect(doc).toBeUndefined();
  });

  it('docs cover all categories', () => {
    const docs = getCapabilityDocs();
    const categories = new Set(docs.map((d) => d.category));
    expect(categories.has('interaction')).toBe(true);
    expect(categories.has('phase')).toBe(true);
    expect(categories.has('content')).toBe(true);
    expect(categories.has('scoring')).toBe(true);
    expect(categories.has('rule')).toBe(true);
    expect(categories.has('presentation')).toBe(true);
    expect(categories.has('extension')).toBe(true);
    expect(categories.has('asset')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Integration', () => {
  it('generate party template → validate → introspect → verify complexity', () => {
    // 1. Generate party template
    const template = getTemplate('party');
    expect(template.type).toBe('party');

    // 2. Validate it (should pass)
    const validation = validateGamePackage(template.schema);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // 3. Introspect it
    const introspection = introspect(template.schema);
    expect(introspection.id).toBe('my-party-game');

    // 4. Verify complexity is 'moderate' (party has 6 phases, no extensions)
    expect(introspection.complexity.overall).toBe('moderate');

    // 5. Verify phase and interaction counts match
    const phases = template.schema.phases as Record<string, unknown>;
    expect(introspection.subsystems.phases).toHaveLength(Object.keys(phases).length);
    expect(introspection.subsystems.interactions.length).toBeGreaterThanOrEqual(2); // text_submit + choice
  });

  it('generate trivia template → validate → introspect → has timer on answer', () => {
    const template = getTemplate('trivia');
    const validation = validateGamePackage(template.schema);
    expect(validation.valid).toBe(true);

    const introspection = introspect(template.schema);
    const answerPhase = introspection.subsystems.phases.find((p) => p.id === 'answer');
    expect(answerPhase?.hasTimer).toBe(true);
  });

  it('generate minimal template → validate → complexity is simple', () => {
    const template = getTemplate('minimal');
    const validation = validateGamePackage(template.schema);
    expect(validation.valid).toBe(true);

    const introspection = introspect(template.schema);
    expect(introspection.complexity.overall).toBe('simple');
  });

  it('schema reference + docs can guide game generation', () => {
    const ref = generateSchemaReference();
    const docs = getCapabilityDocs();

    // Verify the system provides enough info for an LLM to generate a game
    expect(ref.length).toBeGreaterThan(1000);
    expect(docs.length).toBeGreaterThan(10);

    // All doc YAML examples should be non-empty
    for (const doc of docs) {
      expect(doc.yamlExample.trim().length).toBeGreaterThan(10);
    }
  });
});
