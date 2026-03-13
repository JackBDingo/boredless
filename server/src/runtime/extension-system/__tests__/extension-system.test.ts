/**
 * extension-system.test.ts — Comprehensive tests for the Extension System.
 *
 * Test sections:
 * 1. ExtensionRegistry — registration (id, getAll, duplicates, unregister, clear)
 * 2. ExtensionRegistry — renderers
 * 3. ExtensionRegistry — rules
 * 4. ExtensionRegistry — interactions
 * 5. ExtensionRegistry — lifecycle hooks
 * 6. Extension sandbox — createSandboxedContext (frozen state)
 * 7. Extension sandbox — import validation
 * 8. Extension sandbox — handler wrapping
 * 9. Schema validation
 * 10. Integration test — WordCraft extensions scenario
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ExtensionRegistry } from '../extension-registry.js';
import {
  createSandboxedContext,
  validateExtensionImports,
  wrapRuleHandler,
  wrapLifecycleHandler,
} from '../extension-sandbox.js';
import {
  ExtensionDeclarationSchema,
  ExtensionsArraySchema,
  parseExtensions,
  safeParseExtensions,
} from '../schema-integration.js';
import type {
  ExtensionDeclaration,
  RuleExtension,
  RendererExtension,
  InteractionExtension,
  LifecycleHookExtension,
  RuleExtensionContext,
  LifecycleContext,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeclaration(overrides: Partial<ExtensionDeclaration> = {}): ExtensionDeclaration {
  return {
    id: 'test-extension',
    name: 'Test Extension',
    type: 'composite',
    ...overrides,
  };
}

function makeRuleExtension(overrides: Partial<RuleExtension> = {}): RuleExtension {
  return {
    id: 'rule-ext',
    name: 'Rule Extension',
    ruleType: 'my_custom_rule',
    evaluate: () => true,
    ...overrides,
  };
}

function makeRendererExtension(overrides: Partial<RendererExtension> = {}): RendererExtension {
  return {
    id: 'renderer-ext',
    name: 'Renderer Extension',
    componentType: 'MyCustomBoard',
    surfaces: ['display'],
    ...overrides,
  };
}

function makeInteractionExtension(overrides: Partial<InteractionExtension> = {}): InteractionExtension {
  return {
    id: 'interaction-ext',
    name: 'Interaction Extension',
    widgetType: 'my_custom_widget',
    ...overrides,
  };
}

function makeLifecycleHook(overrides: Partial<LifecycleHookExtension> = {}): LifecycleHookExtension {
  return {
    id: 'lifecycle-hook',
    hook: 'onGameStart',
    handler: async () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. ExtensionRegistry — registration
// ---------------------------------------------------------------------------

describe('ExtensionRegistry — registration', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  it('registers an extension successfully', () => {
    const decl = makeDeclaration();
    registry.register(decl, {});
    expect(registry.get('test-extension')).toBeDefined();
  });

  it('returns undefined for unknown extension ID', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('get returns the registered extension', () => {
    const decl = makeDeclaration({ id: 'my-ext', name: 'My Extension' });
    registry.register(decl, {});
    const loaded = registry.get('my-ext');
    expect(loaded).toBeDefined();
    expect(loaded!.declaration.id).toBe('my-ext');
    expect(loaded!.declaration.name).toBe('My Extension');
    expect(loaded!.status).toBe('loaded');
  });

  it('getAll returns all registered extensions', () => {
    registry.register(makeDeclaration({ id: 'ext-1' }), {});
    registry.register(makeDeclaration({ id: 'ext-2' }), {});
    registry.register(makeDeclaration({ id: 'ext-3' }), {});
    const all = registry.getAll();
    expect(all).toHaveLength(3);
    const ids = all.map((e) => e.declaration.id);
    expect(ids).toContain('ext-1');
    expect(ids).toContain('ext-2');
    expect(ids).toContain('ext-3');
  });

  it('getAll returns empty array when no extensions registered', () => {
    expect(registry.getAll()).toHaveLength(0);
  });

  it('rejects duplicate extension IDs', () => {
    registry.register(makeDeclaration({ id: 'dup-ext' }), {});
    expect(() => registry.register(makeDeclaration({ id: 'dup-ext' }), {})).toThrow(
      /already registered/i
    );
  });

  it('unregister removes the extension', () => {
    registry.register(makeDeclaration({ id: 'removable' }), {});
    expect(registry.get('removable')).toBeDefined();
    registry.unregister('removable');
    expect(registry.get('removable')).toBeUndefined();
  });

  it('unregister on unknown ID does not throw', () => {
    expect(() => registry.unregister('does-not-exist')).not.toThrow();
  });

  it('clear removes all extensions', () => {
    registry.register(makeDeclaration({ id: 'ext-1' }), {});
    registry.register(makeDeclaration({ id: 'ext-2' }), {});
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('clear makes registry reusable', () => {
    registry.register(makeDeclaration({ id: 'ext-1' }), {});
    registry.clear();
    // Should not throw — ID was cleared
    expect(() => registry.register(makeDeclaration({ id: 'ext-1' }), {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. ExtensionRegistry — renderers
// ---------------------------------------------------------------------------

describe('ExtensionRegistry — renderers', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  it('registers a renderer extension', () => {
    const renderer = makeRendererExtension();
    registry.register(makeDeclaration({ type: 'renderer' }), { renderers: [renderer] });
    expect(registry.getRenderer('MyCustomBoard')).toBeDefined();
  });

  it('getRenderer finds by componentType', () => {
    const renderer = makeRendererExtension({ componentType: 'WordCraftBoard' });
    registry.register(makeDeclaration(), { renderers: [renderer] });
    const found = registry.getRenderer('WordCraftBoard');
    expect(found).toBeDefined();
    expect(found!.componentType).toBe('WordCraftBoard');
  });

  it('getRenderer returns undefined for unknown componentType', () => {
    expect(registry.getRenderer('NonExistentBoard')).toBeUndefined();
  });

  it('hasRenderer returns true for registered componentType', () => {
    const renderer = makeRendererExtension({ componentType: 'ScoreBoard' });
    registry.register(makeDeclaration(), { renderers: [renderer] });
    expect(registry.hasRenderer('ScoreBoard')).toBe(true);
  });

  it('hasRenderer returns false for unknown componentType', () => {
    expect(registry.hasRenderer('Nonexistent')).toBe(false);
  });

  it('rejects duplicate componentType across extensions', () => {
    const renderer1 = makeRendererExtension({ componentType: 'SharedType' });
    const renderer2 = makeRendererExtension({ id: 'renderer-2', componentType: 'SharedType' });
    registry.register(makeDeclaration({ id: 'ext-1' }), { renderers: [renderer1] });
    expect(() =>
      registry.register(makeDeclaration({ id: 'ext-2' }), { renderers: [renderer2] })
    ).toThrow(/already registered/i);
  });

  it('listRenderers returns all registered renderers', () => {
    const r1 = makeRendererExtension({ componentType: 'Board1' });
    const r2 = makeRendererExtension({ id: 'r2', componentType: 'Board2' });
    registry.register(makeDeclaration({ id: 'ext-1' }), { renderers: [r1, r2] });
    const list = registry.listRenderers();
    expect(list).toHaveLength(2);
    const types = list.map((r) => r.componentType);
    expect(types).toContain('Board1');
    expect(types).toContain('Board2');
  });

  it('listRenderers returns empty array when none registered', () => {
    expect(registry.listRenderers()).toHaveLength(0);
  });

  it('unregister removes renderer from index', () => {
    const renderer = makeRendererExtension({ componentType: 'TempBoard' });
    registry.register(makeDeclaration(), { renderers: [renderer] });
    expect(registry.hasRenderer('TempBoard')).toBe(true);
    registry.unregister('test-extension');
    expect(registry.hasRenderer('TempBoard')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. ExtensionRegistry — rules
// ---------------------------------------------------------------------------

describe('ExtensionRegistry — rules', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  it('registers a rule extension', () => {
    const rule = makeRuleExtension({ ruleType: 'is_valid_word' });
    registry.register(makeDeclaration({ type: 'rule' }), { rules: [rule] });
    expect(registry.getRule('is_valid_word')).toBeDefined();
  });

  it('getRule finds by ruleType', () => {
    const rule = makeRuleExtension({ ruleType: 'dictionary_check' });
    registry.register(makeDeclaration(), { rules: [rule] });
    const found = registry.getRule('dictionary_check');
    expect(found).toBeDefined();
    expect(found!.ruleType).toBe('dictionary_check');
  });

  it('getRule returns undefined for unknown ruleType', () => {
    expect(registry.getRule('unknown_rule')).toBeUndefined();
  });

  it('hasRule returns true for registered ruleType', () => {
    const rule = makeRuleExtension({ ruleType: 'poker_hand_rank' });
    registry.register(makeDeclaration(), { rules: [rule] });
    expect(registry.hasRule('poker_hand_rank')).toBe(true);
  });

  it('rejects duplicate ruleType across extensions', () => {
    const rule1 = makeRuleExtension({ ruleType: 'shared_rule' });
    const rule2 = makeRuleExtension({ id: 'r2', ruleType: 'shared_rule' });
    registry.register(makeDeclaration({ id: 'ext-1' }), { rules: [rule1] });
    expect(() =>
      registry.register(makeDeclaration({ id: 'ext-2' }), { rules: [rule2] })
    ).toThrow(/already registered/i);
  });

  it('listRules returns all registered rules', () => {
    const r1 = makeRuleExtension({ ruleType: 'rule_a' });
    const r2 = makeRuleExtension({ id: 'r2', ruleType: 'rule_b' });
    registry.register(makeDeclaration(), { rules: [r1, r2] });
    const list = registry.listRules();
    expect(list).toHaveLength(2);
    const types = list.map((r) => r.ruleType);
    expect(types).toContain('rule_a');
    expect(types).toContain('rule_b');
  });

  it('listRules returns empty array when none registered', () => {
    expect(registry.listRules()).toHaveLength(0);
  });

  it('rule evaluate function is callable', () => {
    const rule = makeRuleExtension({
      ruleType: 'always_true',
      evaluate: () => true,
    });
    registry.register(makeDeclaration(), { rules: [rule] });
    const found = registry.getRule('always_true');
    const ctx: RuleExtensionContext = {
      state: {},
      players: [],
    };
    expect(found!.evaluate(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. ExtensionRegistry — interactions
// ---------------------------------------------------------------------------

describe('ExtensionRegistry — interactions', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  it('registers an interaction extension', () => {
    const interaction = makeInteractionExtension({ widgetType: 'tile_placer' });
    registry.register(makeDeclaration({ type: 'interaction' }), { interactions: [interaction] });
    expect(registry.getInteraction('tile_placer')).toBeDefined();
  });

  it('getInteraction finds by widgetType', () => {
    const interaction = makeInteractionExtension({ widgetType: 'drawing_canvas' });
    registry.register(makeDeclaration(), { interactions: [interaction] });
    const found = registry.getInteraction('drawing_canvas');
    expect(found).toBeDefined();
    expect(found!.widgetType).toBe('drawing_canvas');
  });

  it('getInteraction returns undefined for unknown widgetType', () => {
    expect(registry.getInteraction('unknown_widget')).toBeUndefined();
  });

  it('hasInteraction returns true for registered widgetType', () => {
    const interaction = makeInteractionExtension({ widgetType: 'bet_slider' });
    registry.register(makeDeclaration(), { interactions: [interaction] });
    expect(registry.hasInteraction('bet_slider')).toBe(true);
  });

  it('rejects duplicate widgetType across extensions', () => {
    const i1 = makeInteractionExtension({ widgetType: 'shared_widget' });
    const i2 = makeInteractionExtension({ id: 'i2', widgetType: 'shared_widget' });
    registry.register(makeDeclaration({ id: 'ext-1' }), { interactions: [i1] });
    expect(() =>
      registry.register(makeDeclaration({ id: 'ext-2' }), { interactions: [i2] })
    ).toThrow(/already registered/i);
  });

  it('listInteractions returns all registered interactions', () => {
    const i1 = makeInteractionExtension({ widgetType: 'widget_a' });
    const i2 = makeInteractionExtension({ id: 'i2', widgetType: 'widget_b' });
    registry.register(makeDeclaration(), { interactions: [i1, i2] });
    const list = registry.listInteractions();
    expect(list).toHaveLength(2);
    const types = list.map((i) => i.widgetType);
    expect(types).toContain('widget_a');
    expect(types).toContain('widget_b');
  });

  it('listInteractions returns empty array when none registered', () => {
    expect(registry.listInteractions()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. ExtensionRegistry — lifecycle hooks
// ---------------------------------------------------------------------------

describe('ExtensionRegistry — lifecycle hooks', () => {
  let registry: ExtensionRegistry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  it('registers a lifecycle hook', () => {
    const hook = makeLifecycleHook({ hook: 'onGameStart' });
    registry.register(makeDeclaration(), { lifecycleHooks: [hook] });
    const hooks = registry.getLifecycleHooks('onGameStart');
    expect(hooks).toHaveLength(1);
  });

  it('getLifecycleHooks returns hooks for the event', () => {
    const hook = makeLifecycleHook({ hook: 'onPhaseEnter' });
    registry.register(makeDeclaration(), { lifecycleHooks: [hook] });
    const hooks = registry.getLifecycleHooks('onPhaseEnter');
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hook).toBe('onPhaseEnter');
  });

  it('multiple hooks for same event are all returned', () => {
    const hook1 = makeLifecycleHook({ id: 'hook-1', hook: 'onRoundStart' });
    const hook2 = makeLifecycleHook({ id: 'hook-2', hook: 'onRoundStart' });
    registry.register(makeDeclaration({ id: 'ext-1' }), { lifecycleHooks: [hook1] });
    registry.register(makeDeclaration({ id: 'ext-2' }), { lifecycleHooks: [hook2] });
    const hooks = registry.getLifecycleHooks('onRoundStart');
    expect(hooks).toHaveLength(2);
  });

  it('no hooks returns empty array', () => {
    const hooks = registry.getLifecycleHooks('onGameEnd');
    expect(hooks).toHaveLength(0);
  });

  it('hooks for different events are isolated', () => {
    const hook1 = makeLifecycleHook({ hook: 'onGameStart' });
    const hook2 = makeLifecycleHook({ id: 'h2', hook: 'onGameEnd' });
    registry.register(makeDeclaration(), { lifecycleHooks: [hook1, hook2] });
    expect(registry.getLifecycleHooks('onGameStart')).toHaveLength(1);
    expect(registry.getLifecycleHooks('onGameEnd')).toHaveLength(1);
    expect(registry.getLifecycleHooks('onPhaseEnter')).toHaveLength(0);
  });

  it('unregister removes lifecycle hooks from index', () => {
    const hook = makeLifecycleHook({ hook: 'onGameStart' });
    registry.register(makeDeclaration(), { lifecycleHooks: [hook] });
    expect(registry.getLifecycleHooks('onGameStart')).toHaveLength(1);
    registry.unregister('test-extension');
    expect(registry.getLifecycleHooks('onGameStart')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Extension sandbox — createSandboxedContext
// ---------------------------------------------------------------------------

describe('Extension sandbox — createSandboxedContext', () => {
  it('returns a context with the provided state', () => {
    const ctx = createSandboxedContext({ round: 3, score: 100 }, ['player-1', 'player-2']);
    expect(ctx.state['round']).toBe(3);
    expect(ctx.state['score']).toBe(100);
  });

  it('returns a context with the provided players', () => {
    const ctx = createSandboxedContext({}, ['alice', 'bob', 'charlie']);
    expect(ctx.players).toHaveLength(3);
    expect(ctx.players[0]).toBe('alice');
  });

  it('returns a context with phase and round when provided', () => {
    const ctx = createSandboxedContext({}, [], 'voting', 4);
    expect(ctx.phase).toBe('voting');
    expect(ctx.round).toBe(4);
  });

  it('phase and round are undefined when not provided', () => {
    const ctx = createSandboxedContext({}, []);
    expect(ctx.phase).toBeUndefined();
    expect(ctx.round).toBeUndefined();
  });

  it('state is frozen — cannot mutate top-level fields', () => {
    const ctx = createSandboxedContext({ counter: 0 }, []);
    expect(() => {
      (ctx.state as Record<string, unknown>)['counter'] = 999;
    }).toThrow();
  });

  it('state is frozen — cannot add new fields', () => {
    const ctx = createSandboxedContext({ existing: 1 }, []);
    expect(() => {
      (ctx.state as Record<string, unknown>)['newField'] = 'surprise';
    }).toThrow();
  });

  it('deep nested objects are also frozen', () => {
    const ctx = createSandboxedContext({ nested: { value: 42 } }, []);
    expect(() => {
      ((ctx.state as Record<string, unknown>)['nested'] as Record<string, unknown>)['value'] = 99;
    }).toThrow();
  });

  it('players array is frozen — cannot push', () => {
    const ctx = createSandboxedContext({}, ['alice']);
    expect(() => {
      (ctx.players as string[]).push('new-player');
    }).toThrow();
  });

  it('mutations to original state do not affect sandboxed context', () => {
    const originalState: Record<string, unknown> = { round: 1 };
    const ctx = createSandboxedContext(originalState, []);
    originalState['round'] = 999;
    // Sandboxed context should still have round=1
    expect(ctx.state['round']).toBe(1);
  });

  it('mutations to original players do not affect sandboxed context', () => {
    const originalPlayers = ['alice'];
    const ctx = createSandboxedContext({}, originalPlayers);
    originalPlayers.push('bob');
    expect(ctx.players).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Extension sandbox — import validation
// ---------------------------------------------------------------------------

describe('Extension sandbox — import validation', () => {
  it('valid extension code (only imports from types) passes', () => {
    const code = `import type { RuleExtensionContext } from 'extension-system/types';
const evaluate = (ctx: RuleExtensionContext) => true;
export { evaluate };`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('import from state-manager is flagged as violation', () => {
    const code = `import { StateManager } from '../state-manager/index.js';`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatch(/state-manager/);
  });

  it('import from phase-machine is flagged as violation', () => {
    const code = `import { PhaseMachine } from '../phase-machine/index.js';`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toMatch(/phase-machine/);
  });

  it('import from rule-engine is flagged as violation', () => {
    const code = `import { RuleEngine } from '../rule-engine/index.js';`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toMatch(/rule-engine/);
  });

  it('import from presentation-system is flagged as violation', () => {
    const code = `import { ThemeEngine } from '../presentation-system/index.js';`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toMatch(/presentation-system/);
  });

  it('multiple violations are all reported', () => {
    const code = `
import { StateManager } from '../state-manager/index.js';
import { PhaseMachine } from '../phase-machine/index.js';
import { RuleEngine } from '../rule-engine/index.js';
`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(3);
  });

  it('code with no imports passes validation', () => {
    const code = `const evaluate = (ctx) => true; export { evaluate };`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('require() style imports from blocked paths are also flagged', () => {
    const code = `const sm = require('../state-manager/state-manager.js');`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toMatch(/state-manager/);
  });

  it('import from interaction-primitives is flagged', () => {
    const code = `import { InputCollector } from '../interaction-primitives/index.js';`;
    const result = validateExtensionImports(code);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toMatch(/interaction-primitives/);
  });
});

// ---------------------------------------------------------------------------
// 8. Extension sandbox — handler wrapping
// ---------------------------------------------------------------------------

describe('Extension sandbox — handler wrapping', () => {
  it('wrapRuleHandler passes through normal return value (true)', () => {
    const handler = (_ctx: RuleExtensionContext) => true;
    const wrapped = wrapRuleHandler(handler);
    const ctx: RuleExtensionContext = { state: {}, players: [] };
    expect(wrapped(ctx)).toBe(true);
  });

  it('wrapRuleHandler passes through normal return value (false)', () => {
    const handler = (_ctx: RuleExtensionContext) => false;
    const wrapped = wrapRuleHandler(handler);
    const ctx: RuleExtensionContext = { state: {}, players: [] };
    expect(wrapped(ctx)).toBe(false);
  });

  it('wrapRuleHandler catches thrown errors and returns false', () => {
    const handler = (_ctx: RuleExtensionContext): boolean => {
      throw new Error('Simulated extension error');
    };
    const wrapped = wrapRuleHandler(handler);
    const ctx: RuleExtensionContext = { state: {}, players: [] };
    // Should not rethrow — returns false
    expect(wrapped(ctx)).toBe(false);
  });

  it('wrapRuleHandler does not rethrow on error', () => {
    const handler = (_ctx: RuleExtensionContext): boolean => {
      throw new TypeError('Type mismatch in extension');
    };
    const wrapped = wrapRuleHandler(handler);
    const ctx: RuleExtensionContext = { state: {}, players: [] };
    expect(() => wrapped(ctx)).not.toThrow();
  });

  it('wrapRuleHandler passes context to the underlying handler', () => {
    const spy = vi.fn().mockReturnValue(true);
    const wrapped = wrapRuleHandler(spy);
    const ctx: RuleExtensionContext = {
      state: { round: 3 },
      players: ['alice'],
      phase: 'voting',
    };
    wrapped(ctx);
    expect(spy).toHaveBeenCalledWith(ctx);
  });

  it('wrapLifecycleHandler catches thrown errors', async () => {
    const handler = (_ctx: LifecycleContext): void => {
      throw new Error('Lifecycle handler crashed');
    };
    const wrapped = wrapLifecycleHandler(handler);
    const ctx: LifecycleContext = {
      state: {},
      players: [],
      gameId: 'test-game',
    };
    // Should not rethrow
    await expect(wrapped(ctx)).resolves.toBeUndefined();
  });

  it('wrapLifecycleHandler does not rethrow errors', async () => {
    const handler = async (_ctx: LifecycleContext): Promise<void> => {
      throw new Error('Async handler error');
    };
    const wrapped = wrapLifecycleHandler(handler);
    const ctx: LifecycleContext = { state: {}, players: [], gameId: 'g1' };
    await expect(wrapped(ctx)).resolves.not.toThrow();
  });

  it('wrapLifecycleHandler handles async errors', async () => {
    const handler = async (_ctx: LifecycleContext): Promise<void> => {
      await Promise.resolve(); // yield
      throw new Error('Async rejection');
    };
    const wrapped = wrapLifecycleHandler(handler);
    const ctx: LifecycleContext = { state: {}, players: [], gameId: 'g1' };
    await expect(wrapped(ctx)).resolves.toBeUndefined();
  });

  it('wrapLifecycleHandler runs successful handler normally', async () => {
    const calls: string[] = [];
    const handler = async (_ctx: LifecycleContext): Promise<void> => {
      calls.push('executed');
    };
    const wrapped = wrapLifecycleHandler(handler);
    const ctx: LifecycleContext = { state: {}, players: [], gameId: 'g1' };
    await wrapped(ctx);
    expect(calls).toContain('executed');
  });
});

// ---------------------------------------------------------------------------
// 9. Schema validation
// ---------------------------------------------------------------------------

describe('Schema validation', () => {
  it('valid extension declaration parses successfully', () => {
    const data = { id: 'my-ext', name: 'My Extension', type: 'rule' };
    expect(() => ExtensionDeclarationSchema.parse(data)).not.toThrow();
  });

  it('extension with all fields parses successfully', () => {
    const data = {
      id: 'full-ext',
      name: 'Full Extension',
      type: 'composite',
      version: '1.2.3',
      description: 'A fully-specified extension',
      entryPoint: './extensions/full.ts',
    };
    const parsed = ExtensionDeclarationSchema.parse(data);
    expect(parsed.id).toBe('full-ext');
    expect(parsed.version).toBe('1.2.3');
    expect(parsed.entryPoint).toBe('./extensions/full.ts');
  });

  it('missing id is rejected', () => {
    const data = { name: 'No ID Extension', type: 'rule' };
    const result = ExtensionDeclarationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('missing name is rejected', () => {
    const data = { id: 'no-name', type: 'rule' };
    const result = ExtensionDeclarationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('missing type is rejected', () => {
    const data = { id: 'no-type', name: 'No Type Extension' };
    const result = ExtensionDeclarationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('invalid type is rejected', () => {
    const data = { id: 'bad-type', name: 'Bad Type', type: 'invalid-type' };
    const result = ExtensionDeclarationSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('all valid extension types are accepted', () => {
    const types = ['renderer', 'rule', 'interaction', 'lifecycle', 'composite'] as const;
    for (const type of types) {
      const data = { id: `ext-${type}`, name: `Ext ${type}`, type };
      expect(() => ExtensionDeclarationSchema.parse(data)).not.toThrow();
    }
  });

  it('array of extensions parses with ExtensionsArraySchema', () => {
    const data = [
      { id: 'ext-1', name: 'Extension 1', type: 'rule' },
      { id: 'ext-2', name: 'Extension 2', type: 'renderer' },
      { id: 'ext-3', name: 'Extension 3', type: 'interaction' },
    ];
    const parsed = ExtensionsArraySchema.parse(data);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].id).toBe('ext-1');
    expect(parsed[2].type).toBe('interaction');
  });

  it('parseExtensions helper returns parsed array', () => {
    const data = [{ id: 'e1', name: 'E1', type: 'rule' }];
    const result = parseExtensions(data);
    expect(result).toHaveLength(1);
  });

  it('safeParseExtensions returns success:true on valid input', () => {
    const data = [{ id: 'e1', name: 'E1', type: 'lifecycle' }];
    const result = safeParseExtensions(data);
    expect(result.success).toBe(true);
  });

  it('safeParseExtensions returns success:false on invalid input', () => {
    const data = [{ id: 'bad', type: 'invalid' }]; // missing name + bad type
    const result = safeParseExtensions(data);
    expect(result.success).toBe(false);
  });

  it('empty array parses successfully', () => {
    const result = ExtensionsArraySchema.parse([]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Integration test — WordCraft extensions
// ---------------------------------------------------------------------------

describe('Integration — WordCraft extensions', () => {
  it('full WordCraft extension scenario works end to end', async () => {
    const registry = new ExtensionRegistry();

    // ---- Dictionary validator (rule extension) ----
    const validWords = new Set(['HELLO', 'WORLD', 'CRAFT', 'WORD']);

    const dictionaryRule: RuleExtension = {
      id: 'dictionary-rule',
      name: 'Dictionary Rule',
      ruleType: 'dictionary_validate',
      description: 'Validates words against the WordCraft dictionary',
      paramSchema: {
        type: 'object',
        properties: { word: { type: 'string' } },
      },
      evaluate: (ctx: RuleExtensionContext) => {
        const word = ctx.params?.['word'];
        if (typeof word !== 'string') return false;
        return validWords.has(word.toUpperCase());
      },
    };

    registry.register(
      { id: 'dictionary-validator', name: 'Dictionary Validator', type: 'rule' },
      { rules: [dictionaryRule] }
    );

    // ---- Word board (renderer extension) ----
    const wordBoardRenderer: RendererExtension = {
      id: 'word-board-renderer',
      name: 'Word Board',
      componentType: 'WordCraftBoard',
      surfaces: ['display', 'phone'],
      propsSchema: {
        type: 'object',
        properties: {
          board: { type: 'array' },
          rack: { type: 'array' },
        },
      },
    };

    registry.register(
      { id: 'word-board', name: 'Word Board Renderer', type: 'renderer' },
      { renderers: [wordBoardRenderer] }
    );

    // ---- Drawing canvas (interaction extension) ----
    const drawingCanvas: InteractionExtension = {
      id: 'drawing-canvas-widget',
      name: 'Drawing Canvas',
      widgetType: 'drawing_canvas',
      description: 'Freeform drawing widget for phone',
      inputSchema: {
        type: 'object',
        properties: { strokes: { type: 'array' } },
      },
      outputSchema: {
        type: 'object',
        properties: { imageData: { type: 'string' } },
      },
    };

    registry.register(
      { id: 'drawing-canvas', name: 'Drawing Canvas', type: 'interaction' },
      { interactions: [drawingCanvas] }
    );

    // ---- OnGameStart lifecycle hook ----
    const hookCalls: string[] = [];
    const gameStartHook: LifecycleHookExtension = {
      id: 'wordcraft-game-start',
      hook: 'onGameStart',
      handler: async (ctx: LifecycleContext) => {
        hookCalls.push(`game-started:${ctx.gameId}`);
      },
    };

    registry.register(
      { id: 'wordcraft-lifecycle', name: 'WordCraft Lifecycle', type: 'lifecycle' },
      { lifecycleHooks: [gameStartHook] }
    );

    // ---- Verify all findable by type ----
    expect(registry.getAll()).toHaveLength(4);

    // Renderers
    expect(registry.hasRenderer('WordCraftBoard')).toBe(true);
    expect(registry.getRenderer('WordCraftBoard')!.surfaces).toContain('display');
    expect(registry.getRenderer('WordCraftBoard')!.surfaces).toContain('phone');

    // Rules
    expect(registry.hasRule('dictionary_validate')).toBe(true);

    // Interactions
    expect(registry.hasInteraction('drawing_canvas')).toBe(true);

    // Lifecycle
    expect(registry.getLifecycleHooks('onGameStart')).toHaveLength(1);

    // ---- Create sandboxed context and call dictionary rule ----
    const gameState = {
      board: [['H', 'E', 'L', 'L', 'O']],
      currentPlayer: 'player-1',
      scores: { 'player-1': 50, 'player-2': 30 },
    };

    const ctx = createSandboxedContext(
      gameState,
      ['player-1', 'player-2'],
      'submit_word',
      2
    );

    const dictionaryEvaluator = registry.getRule('dictionary_validate')!;

    // Valid word
    const validCtx: RuleExtensionContext = { ...ctx, params: { word: 'HELLO' } };
    expect(dictionaryEvaluator.evaluate(validCtx)).toBe(true);

    // Invalid word
    const invalidCtx: RuleExtensionContext = { ...ctx, params: { word: 'XYZZY' } };
    expect(dictionaryEvaluator.evaluate(invalidCtx)).toBe(false);

    // ---- Verify state was NOT mutated ----
    expect(gameState.scores['player-1']).toBe(50);
    expect(gameState.scores['player-2']).toBe(30);
    expect(gameState.board[0]).toHaveLength(5);

    // ---- Invoke the lifecycle hook ----
    const hooks = registry.getLifecycleHooks('onGameStart');
    const lifecycleCtx: LifecycleContext = {
      state: {},
      players: ['player-1', 'player-2'],
      gameId: 'wordcraft-room-123',
    };
    for (const hook of hooks) {
      await hook.handler(lifecycleCtx);
    }
    expect(hookCalls).toContain('game-started:wordcraft-room-123');

    // ---- Verify sandboxed context state is frozen ----
    expect(() => {
      (ctx.state as Record<string, unknown>)['board'] = [];
    }).toThrow();
  });
});
