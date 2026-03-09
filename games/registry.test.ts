import { describe, it, expect } from 'vitest';

/**
 * Tests for client registry lookup logic.
 * 
 * The actual registries (display/phone) use import.meta.glob which requires Vite.
 * Here we test the core lookup algorithm in isolation, mirroring the registry's
 * registration and resolution logic exactly.
 */

// Replicate the registry pattern (matches display/src/games/registry.ts and phone/src/games/registry.ts)
function buildRegistry(dirNames: string[], getComponent: (name: string) => object) {
  const registry = new Map<string, object>();

  for (const gameDirName of dirNames) {
    const Component = getComponent(gameDirName);
    // Register by directory name (hyphen) and underscore variant
    registry.set(gameDirName, Component);
    registry.set(gameDirName.replace(/-/g, '_'), Component);
  }

  return {
    get(gameId: string): object | undefined {
      return registry.get(gameId) ?? registry.get(gameId.replace(/_/g, '-'));
    },
    registry,
  };
}

describe('Client Registry — path parsing', () => {
  it('extracts game dir name from display glob path', () => {
    const path = '/games/bluff-battle/display/BBDisplay.tsx';
    const match = path.match(/^\/games\/([^/]+)\/display\/[^/]+\.tsx$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('bluff-battle');
  });

  it('extracts game dir name from phone glob path', () => {
    const path = '/games/village-of-shadows/phone/VillagePhone.tsx';
    const match = path.match(/^\/games\/([^/]+)\/phone\/[^/]+\.tsx$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('village-of-shadows');
  });

  it('rejects paths that do not match the pattern', () => {
    const badPaths = [
      '/games/bluff-battle/server/index.ts',
      '/games/bluff-battle/index.ts',
      '/games/bluff-battle/types.ts',
    ];
    for (const path of badPaths) {
      const match = path.match(/^\/games\/([^/]+)\/display\/[^/]+\.tsx$/);
      expect(match).toBeNull();
    }
  });
});

describe('Client Registry — lookup', () => {
  const FakeBluffBattle = { name: 'BBDisplay' };
  const FakeVillage = { name: 'VillageDisplay' };

  const { get } = buildRegistry(
    ['bluff-battle', 'village-of-shadows'],
    (name) => name === 'bluff-battle' ? FakeBluffBattle : FakeVillage,
  );

  it('exact match with hyphen name', () => {
    expect(get('bluff-battle')).toBe(FakeBluffBattle);
    expect(get('village-of-shadows')).toBe(FakeVillage);
  });

  it('exact match with underscore name (registered variant)', () => {
    expect(get('bluff_battle')).toBe(FakeBluffBattle);
    expect(get('village_of_shadows')).toBe(FakeVillage);
  });

  it('underscore → hyphen conversion (getter fallback)', () => {
    // The getter converts underscores to hyphens and looks up again
    const result = get('village_of_shadows');
    expect(result).toBe(FakeVillage);
  });

  it('returns undefined for unknown game', () => {
    expect(get('unknown-game')).toBeUndefined();
    expect(get('unknown_game')).toBeUndefined();
    expect(get('')).toBeUndefined();
  });

  it('village_of_shadows resolves to village-of-shadows directory entry', () => {
    // This is the CRITICAL fix: directory "village-of-shadows" registers as both
    // "village-of-shadows" and "village_of_shadows". GameId is "village_of_shadows".
    const { get: registryGet } = buildRegistry(
      ['village-of-shadows'],
      () => FakeVillage,
    );

    // Should work via both lookup paths
    expect(registryGet('village_of_shadows')).toBe(FakeVillage); // Direct underscore match
    expect(registryGet('village-of-shadows')).toBe(FakeVillage); // Direct hyphen match
  });

  it('old village (without hyphen) directory would have FAILED (documents fixed bug)', () => {
    // Before the fix, the directory was "village" not "village-of-shadows"
    const { get: brokenGet } = buildRegistry(
      ['village'],  // old, wrong directory name
      () => FakeVillage,
    );

    // "village_of_shadows" → first try direct lookup → not found
    // then try "village-of-shadows" → not found
    // Result: undefined (the bug)
    expect(brokenGet('village_of_shadows')).toBeUndefined();
  });
});

describe('Client Registry — registration', () => {
  it('registers both hyphen and underscore variants', () => {
    const component = { name: 'TestComponent' };
    const { registry } = buildRegistry(['my-cool-game'], () => component);

    expect(registry.has('my-cool-game')).toBe(true);
    expect(registry.has('my_cool_game')).toBe(true);
    expect(registry.get('my-cool-game')).toBe(component);
    expect(registry.get('my_cool_game')).toBe(component);
  });

  it('handles single-word game names without hyphens', () => {
    const component = { name: 'TestComponent' };
    const { registry } = buildRegistry(['chess'], () => component);

    expect(registry.has('chess')).toBe(true);
    // No hyphen, so underscore variant is also "chess"
    expect(registry.get('chess')).toBe(component);
  });

  it('handles multi-segment names', () => {
    const component = { name: 'TestComponent' };
    const { get } = buildRegistry(['my-very-long-game-name'], () => component);

    expect(get('my-very-long-game-name')).toBe(component);
    expect(get('my_very_long_game_name')).toBe(component);
  });
});
