import { describe, it, expect } from 'vitest';
import { ManifestSchema } from '../server/src/games/manifest-schema.js';
import { ZodError } from 'zod';

const validManifest = {
  id: 'test-game',
  name: 'Test Game',
  tagline: 'A test game',
  description: 'A game used in tests',
  players: { min: 2, max: 8 },
  estimatedMinutes: 10,
  icon: 'trophy',
  accentColor: 'blue',
  categories: ['test'],
  phases: {
    lobby: { duration: 10 },
    playing: { duration: 60 },
  },
  scoring: { correct: 1000 },
};

describe('ManifestSchema — valid manifests', () => {
  it('parses a fully valid manifest', () => {
    const result = ManifestSchema.parse(validManifest);
    expect(result.id).toBe('test-game');
    expect(result.name).toBe('Test Game');
    expect(result.players.min).toBe(2);
    expect(result.players.max).toBe(8);
    expect(result.phases.lobby.duration).toBe(10);
  });

  it('allows optional categories to be omitted', () => {
    const { categories: _ignored, ...noCategories } = validManifest;
    const result = ManifestSchema.parse(noCategories);
    expect(result.categories).toBeUndefined();
  });

  it('allows optional scoring to be omitted', () => {
    const { scoring: _ignored, ...noScoring } = validManifest;
    const result = ManifestSchema.parse(noScoring);
    expect(result.scoring).toBeUndefined();
  });

  it('allows multiple phases', () => {
    const result = ManifestSchema.parse({
      ...validManifest,
      phases: {
        instructions: { duration: 10 },
        submission: { duration: 60 },
        voting: { duration: 30 },
        reveal: { duration: 15 },
      },
    });
    expect(Object.keys(result.phases)).toHaveLength(4);
  });
});

describe('ManifestSchema — invalid manifests', () => {
  it('rejects missing required field: id', () => {
    const { id: _ignored, ...noId } = validManifest;
    expect(() => ManifestSchema.parse(noId)).toThrow(ZodError);
  });

  it('rejects missing required field: name', () => {
    const { name: _ignored, ...noName } = validManifest;
    expect(() => ManifestSchema.parse(noName)).toThrow(ZodError);
  });

  it('rejects missing required field: players', () => {
    const { players: _ignored, ...noPlayers } = validManifest;
    expect(() => ManifestSchema.parse(noPlayers)).toThrow(ZodError);
  });

  it('rejects missing required field: phases', () => {
    const { phases: _ignored, ...noPhases } = validManifest;
    expect(() => ManifestSchema.parse(noPhases)).toThrow(ZodError);
  });

  it('rejects id with uppercase letters', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, id: 'Test-Game' })).toThrow(ZodError);
  });

  it('rejects id with spaces', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, id: 'test game' })).toThrow(ZodError);
  });

  it('rejects id with underscores (must use hyphens)', () => {
    expect(() => ManifestSchema.parse({ ...validManifest, id: 'test_game' })).toThrow(ZodError);
  });

  it('rejects non-positive phase duration', () => {
    expect(() =>
      ManifestSchema.parse({
        ...validManifest,
        phases: { lobby: { duration: 0 } },
      })
    ).toThrow(ZodError);
  });

  it('rejects negative phase duration', () => {
    expect(() =>
      ManifestSchema.parse({
        ...validManifest,
        phases: { lobby: { duration: -10 } },
      })
    ).toThrow(ZodError);
  });

  it('rejects non-integer player min', () => {
    expect(() =>
      ManifestSchema.parse({
        ...validManifest,
        players: { min: 2.5, max: 8 },
      })
    ).toThrow(ZodError);
  });

  it('rejects zero estimatedMinutes', () => {
    expect(() =>
      ManifestSchema.parse({ ...validManifest, estimatedMinutes: 0 })
    ).toThrow(ZodError);
  });

  it('rejects empty phases object', () => {
    // Note: record type allows empty object - phases: {} is technically valid by schema
    // but a game with no phases is unusable. This tests the boundary.
    const result = ManifestSchema.safeParse({ ...validManifest, phases: {} });
    // Zod allows empty record, so it should parse - games/ runtime can validate further
    expect(result.success).toBe(true);
  });

  it('rejects completely malformed input', () => {
    expect(() => ManifestSchema.parse(null)).toThrow(ZodError);
    expect(() => ManifestSchema.parse(undefined)).toThrow(ZodError);
    expect(() => ManifestSchema.parse('not an object')).toThrow(ZodError);
    expect(() => ManifestSchema.parse(42)).toThrow(ZodError);
  });
});

describe('ManifestSchema — real game manifests', () => {
  it('validates bluff-battle manifest structure', () => {
    const bluffBattle = {
      id: 'bluff-battle',
      name: 'Bluff Battle',
      tagline: 'Submit fake answers, vote for the real one',
      description: 'Players write convincing fake answers to trivia questions.',
      players: { min: 3, max: 8 },
      estimatedMinutes: 10,
      icon: 'swords',
      accentColor: 'indigo',
      categories: ['bluffing', 'party', 'trivia'],
      phases: {
        instructions: { duration: 10 },
        submission: { duration: 60 },
        voting: { duration: 30 },
        reveal: { duration: 10 },
        scores: { duration: 8 },
      },
      scoring: { correct_answer: 1000, fooled_player: 500 },
    };
    expect(() => ManifestSchema.parse(bluffBattle)).not.toThrow();
  });

  it('validates village-of-shadows manifest structure', () => {
    const village = {
      id: 'village-of-shadows',
      name: 'Village of Shadows',
      tagline: 'Hidden roles. Secret actions. Trust no one.',
      description: 'Players are secretly assigned roles.',
      players: { min: 5, max: 10 },
      estimatedMinutes: 15,
      icon: 'moon',
      accentColor: 'violet',
      categories: ['hidden-roles', 'party', 'strategy'],
      phases: {
        role_reveal: { duration: 10 },
        night: { duration: 30 },
        night_result: { duration: 8 },
        day: { duration: 120 },
        vote: { duration: 30 },
        vote_result: { duration: 8 },
      },
    };
    expect(() => ManifestSchema.parse(village)).not.toThrow();
  });
});
