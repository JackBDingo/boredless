/**
 * presentation-system.test.ts — Comprehensive tests for the Presentation System.
 *
 * Coverage:
 * - Theme engine (defaultTheme, mergeTheme, validateTheme, resolveThemeCSS)
 * - Screen resolver (resolveScreen, getScreensForSurface, getScreenForPhase)
 * - Template library (getDefaultTemplate, all template types)
 * - Schema validation (Zod schemas for all types)
 * - Integration (full config → resolve → filter pipeline)
 */

import { describe, it, expect } from 'vitest';

import {
  defaultTheme,
  mergeTheme,
  validateTheme,
  resolveThemeCSS,
} from '../theme-engine.js';

import {
  resolveScreen,
  getScreensForSurface,
  getScreenForPhase,
} from '../screen-resolver.js';

import {
  getDefaultTemplate,
  getTemplateTypes,
} from '../template-library.js';

import {
  PresentationConfigSchema,
  GameThemeSchema,
  PartialGameThemeSchema,
  ScreenDeclarationSchema,
  AnimationConfigSchema,
  parsePresentationConfig,
  safeParsePresentationConfig,
} from '../schema-integration.js';

import type {
  ScreenDeclaration,
  GameTheme,
  PresentationConfig,
} from '../types.js';

// ---------------------------------------------------------------------------
// Theme Tests
// ---------------------------------------------------------------------------

describe('Theme Engine', () => {
  describe('defaultTheme', () => {
    it('has all required color fields', () => {
      expect(defaultTheme.colors.primary).toBeDefined();
      expect(defaultTheme.colors.secondary).toBeDefined();
      expect(defaultTheme.colors.accent).toBeDefined();
      expect(defaultTheme.colors.background).toBeDefined();
      expect(defaultTheme.colors.surface).toBeDefined();
      expect(defaultTheme.colors.text).toBeDefined();
    });

    it('has valid hex color values', () => {
      const hexPattern = /^#[0-9a-fA-F]{3,8}$/;
      expect(defaultTheme.colors.primary).toMatch(hexPattern);
      expect(defaultTheme.colors.background).toMatch(hexPattern);
      expect(defaultTheme.colors.text).toMatch(hexPattern);
    });

    it('has typography settings', () => {
      expect(defaultTheme.typography).toBeDefined();
      expect(defaultTheme.typography?.fontFamily).toBeDefined();
    });

    it('has darkMode enabled by default', () => {
      expect(defaultTheme.darkMode).toBe(true);
    });

    it('passes validateTheme', () => {
      const result = validateTheme(defaultTheme);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('mergeTheme', () => {
    it('fills missing fields from defaults', () => {
      const partial = {};
      const merged = mergeTheme(partial);
      expect(merged.colors.primary).toBe(defaultTheme.colors.primary);
      expect(merged.colors.background).toBe(defaultTheme.colors.background);
    });

    it('preserves user color overrides', () => {
      const partial = {
        colors: { primary: '#FF5722' },
      };
      const merged = mergeTheme(partial);
      expect(merged.colors.primary).toBe('#FF5722');
      // Other colors still from defaults
      expect(merged.colors.secondary).toBe(defaultTheme.colors.secondary);
    });

    it('deep-merges colors — partial colors fill from defaults', () => {
      const partial = {
        colors: { primary: '#FF0000', secondary: '#00FF00' },
      };
      const merged = mergeTheme(partial);
      expect(merged.colors.primary).toBe('#FF0000');
      expect(merged.colors.secondary).toBe('#00FF00');
      expect(merged.colors.accent).toBe(defaultTheme.colors.accent);
    });

    it('deep-merges typography', () => {
      const partial = {
        typography: { fontFamily: 'Poppins, sans-serif' },
      };
      const merged = mergeTheme(partial);
      expect(merged.typography?.fontFamily).toBe('Poppins, sans-serif');
      // headingFont not overridden — comes from defaults
      expect(merged.typography?.headingFont).toBe(defaultTheme.typography?.headingFont);
    });

    it('replaces scalar fields', () => {
      const partial = {
        borderRadius: '16px',
        spacing: 'relaxed' as const,
        darkMode: false,
      };
      const merged = mergeTheme(partial);
      expect(merged.borderRadius).toBe('16px');
      expect(merged.spacing).toBe('relaxed');
      expect(merged.darkMode).toBe(false);
    });

    it('returns a valid theme', () => {
      const merged = mergeTheme({ colors: { primary: '#ABC123' } });
      const result = validateTheme(merged);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTheme', () => {
    it('accepts valid hex colors', () => {
      const theme = mergeTheme({
        colors: { primary: '#FF5722', text: '#ffffff', background: '#000' },
      });
      const result = validateTheme(theme);
      expect(result.valid).toBe(true);
    });

    it('accepts 3-digit hex colors', () => {
      const theme = mergeTheme({ colors: { primary: '#f00' } });
      const result = validateTheme(theme);
      expect(result.valid).toBe(true);
    });

    it('accepts rgb() colors', () => {
      const theme = mergeTheme({ colors: { primary: 'rgb(255, 0, 0)' } });
      const result = validateTheme(theme);
      expect(result.valid).toBe(true);
    });

    it('accepts rgba() colors', () => {
      const theme = mergeTheme({ colors: { primary: 'rgba(255, 0, 0, 0.5)' } });
      const result = validateTheme(theme);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid color format', () => {
      const theme = mergeTheme({ colors: { primary: 'not-a-color' } });
      const result = validateTheme(theme);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('colors.primary'))).toBe(true);
    });

    it('rejects missing required color field', () => {
      const invalidTheme = {
        colors: {
          primary: '#FF5722',
          // secondary, accent, background, surface, text missing
        },
      } as unknown as GameTheme;
      const result = validateTheme(invalidTheme);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('reports all invalid color fields in errors array', () => {
      const theme: GameTheme = {
        colors: {
          primary: 'bad',
          secondary: 'also-bad',
          accent: '#valid',
          background: '#valid',
          surface: '#valid',
          text: '#valid',
        },
      };
      const result = validateTheme(theme);
      expect(result.valid).toBe(false);
      const errorFields = result.errors.map((e) => e.split(' ')[0]);
      expect(errorFields).toContain('colors.primary');
      expect(errorFields).toContain('colors.secondary');
    });
  });

  describe('resolveThemeCSS', () => {
    it('produces correct CSS properties for required colors', () => {
      const css = resolveThemeCSS(defaultTheme);
      expect(css['--color-primary']).toBe(defaultTheme.colors.primary);
      expect(css['--color-secondary']).toBe(defaultTheme.colors.secondary);
      expect(css['--color-accent']).toBe(defaultTheme.colors.accent);
      expect(css['--color-background']).toBe(defaultTheme.colors.background);
      expect(css['--color-surface']).toBe(defaultTheme.colors.surface);
      expect(css['--color-text']).toBe(defaultTheme.colors.text);
    });

    it('produces CSS properties for optional colors when present', () => {
      const theme = mergeTheme({});
      const css = resolveThemeCSS(theme);
      // defaultTheme has textSecondary, error, success
      expect(css['--color-text-secondary']).toBeDefined();
      expect(css['--color-error']).toBeDefined();
      expect(css['--color-success']).toBeDefined();
    });

    it('omits optional color properties when absent', () => {
      const theme: GameTheme = {
        colors: {
          primary: '#FF5722',
          secondary: '#2196F3',
          accent: '#FFC107',
          background: '#1a1a2e',
          surface: '#16213e',
          text: '#ffffff',
          // textSecondary, error, success omitted
        },
      };
      const css = resolveThemeCSS(theme);
      expect(css['--color-text-secondary']).toBeUndefined();
      expect(css['--color-error']).toBeUndefined();
      expect(css['--color-success']).toBeUndefined();
    });

    it('produces typography CSS properties', () => {
      const theme = mergeTheme({
        typography: { fontFamily: 'Poppins, sans-serif', fontSize: 'large' },
      });
      const css = resolveThemeCSS(theme);
      expect(css['--font-family']).toBe('Poppins, sans-serif');
      expect(css['--font-size-base']).toBe('18px');
    });

    it('produces border-radius CSS property', () => {
      const theme = mergeTheme({ borderRadius: '12px' });
      const css = resolveThemeCSS(theme);
      expect(css['--border-radius']).toBe('12px');
    });

    it('produces spacing CSS property', () => {
      const compactTheme = mergeTheme({ spacing: 'compact' });
      expect(resolveThemeCSS(compactTheme)['--spacing-unit']).toBe('8px');

      const normalTheme = mergeTheme({ spacing: 'normal' });
      expect(resolveThemeCSS(normalTheme)['--spacing-unit']).toBe('16px');

      const relaxedTheme = mergeTheme({ spacing: 'relaxed' });
      expect(resolveThemeCSS(relaxedTheme)['--spacing-unit']).toBe('24px');
    });

    it('all keys start with --', () => {
      const css = resolveThemeCSS(defaultTheme);
      for (const key of Object.keys(css)) {
        expect(key.startsWith('--')).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Screen Resolver Tests
// ---------------------------------------------------------------------------

describe('Screen Resolver', () => {
  const theme = mergeTheme({});

  describe('resolveScreen', () => {
    it('attaches the theme to resolved screen', () => {
      const decl: ScreenDeclaration = {
        id: 'lobby',
        template: 'lobby',
        surface: 'both',
      };
      const resolved = resolveScreen(decl, {}, theme);
      expect(resolved.theme).toBe(theme);
    });

    it('preserves the original declaration', () => {
      const decl: ScreenDeclaration = {
        id: 'lobby',
        template: 'lobby',
        surface: 'both',
        title: 'Welcome',
      };
      const resolved = resolveScreen(decl, {}, theme);
      expect(resolved.declaration).toBe(decl);
    });

    it('resolves binding fields from state', () => {
      const decl: ScreenDeclaration = {
        id: 'play',
        template: 'prompt',
        surface: 'display',
        components: [
          { type: 'text', binding: 'globals.round' },
          { type: 'timer', binding: 'phase.timeRemaining' },
        ],
      };
      const state = {
        globals: { round: 3 },
        phase: { timeRemaining: 15000 },
      };
      const resolved = resolveScreen(decl, state, theme);
      expect(resolved.bindings['globals.round']).toBe(3);
      expect(resolved.bindings['phase.timeRemaining']).toBe(15000);
    });

    it('resolves nested binding paths', () => {
      const decl: ScreenDeclaration = {
        id: 'vote',
        template: 'vote',
        surface: 'display',
        components: [{ type: 'text', binding: 'globals.prompt.text' }],
      };
      const state = {
        globals: { prompt: { text: 'What is the capital of France?' } },
      };
      const resolved = resolveScreen(decl, state, theme);
      expect(resolved.bindings['globals.prompt.text']).toBe('What is the capital of France?');
    });

    it('resolves to undefined for missing binding paths (does not throw)', () => {
      const decl: ScreenDeclaration = {
        id: 'info',
        template: 'info',
        surface: 'both',
        components: [{ type: 'text', binding: 'globals.nonExistent.deep' }],
      };
      const state = {};
      expect(() => resolveScreen(decl, state, theme)).not.toThrow();
      const resolved = resolveScreen(decl, state, theme);
      expect(resolved.bindings['globals.nonExistent.deep']).toBeUndefined();
    });

    it('returns empty bindings when no components have bindings', () => {
      const decl: ScreenDeclaration = {
        id: 'info',
        template: 'info',
        surface: 'both',
        components: [
          { type: 'text', props: { text: 'Hello' } },
        ],
      };
      const resolved = resolveScreen(decl, { globals: { foo: 'bar' } }, theme);
      expect(Object.keys(resolved.bindings)).toHaveLength(0);
    });

    it('returns empty bindings when no components defined', () => {
      const decl: ScreenDeclaration = {
        id: 'info',
        template: 'info',
        surface: 'both',
      };
      const resolved = resolveScreen(decl, {}, theme);
      expect(resolved.bindings).toEqual({});
    });
  });

  describe('getScreensForSurface', () => {
    const screens: ScreenDeclaration[] = [
      { id: 'lobby', template: 'lobby', surface: 'both' },
      { id: 'play_display', template: 'prompt', surface: 'display' },
      { id: 'play_phone', template: 'prompt', surface: 'phone' },
      { id: 'scoreboard', template: 'scoreboard', surface: 'both' },
    ];

    it('filters display-only screens', () => {
      const result = getScreensForSurface(screens, 'display');
      const ids = result.map((s) => s.id);
      expect(ids).toContain('play_display');
      expect(ids).not.toContain('play_phone');
    });

    it('filters phone-only screens', () => {
      const result = getScreensForSurface(screens, 'phone');
      const ids = result.map((s) => s.id);
      expect(ids).toContain('play_phone');
      expect(ids).not.toContain('play_display');
    });

    it('includes "both" surfaces for display', () => {
      const result = getScreensForSurface(screens, 'display');
      const ids = result.map((s) => s.id);
      expect(ids).toContain('lobby');
      expect(ids).toContain('scoreboard');
    });

    it('includes "both" surfaces for phone', () => {
      const result = getScreensForSurface(screens, 'phone');
      const ids = result.map((s) => s.id);
      expect(ids).toContain('lobby');
      expect(ids).toContain('scoreboard');
    });

    it('returns empty array when no screens match', () => {
      const phoneOnly: ScreenDeclaration[] = [
        { id: 'x', template: 'info', surface: 'phone' },
      ];
      expect(getScreensForSurface(phoneOnly, 'display')).toHaveLength(0);
    });
  });

  describe('getScreenForPhase', () => {
    const screens: ScreenDeclaration[] = [
      { id: 'lobby', template: 'lobby', surface: 'both' },
      { id: 'play_display', template: 'prompt', surface: 'display' },
      { id: 'play_phone', template: 'prompt', surface: 'phone' },
      { id: 'reveal', template: 'reveal', surface: 'display' },
      { id: 'final', template: 'results', surface: 'both' },
    ];

    it('finds exact surface-specific screen (play_display for "play" + "display")', () => {
      const result = getScreenForPhase(screens, 'play', 'display');
      expect(result?.id).toBe('play_display');
    });

    it('finds exact surface-specific screen (play_phone for "play" + "phone")', () => {
      const result = getScreenForPhase(screens, 'play', 'phone');
      expect(result?.id).toBe('play_phone');
    });

    it('finds exact phase id match (lobby)', () => {
      const result = getScreenForPhase(screens, 'lobby', 'display');
      expect(result?.id).toBe('lobby');
    });

    it('finds "both" surface via phase id match (final)', () => {
      const result = getScreenForPhase(screens, 'final', 'phone');
      expect(result?.id).toBe('final');
    });

    it('finds display-only screen via phase id when only display exists', () => {
      const result = getScreenForPhase(screens, 'reveal', 'display');
      expect(result?.id).toBe('reveal');
    });

    it('returns undefined when no screen matches the phase', () => {
      const result = getScreenForPhase(screens, 'nonexistent', 'display');
      expect(result).toBeUndefined();
    });

    it('returns undefined when screen exists for display but not phone', () => {
      const result = getScreenForPhase(screens, 'reveal', 'phone');
      expect(result).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Template Library Tests
// ---------------------------------------------------------------------------

describe('Template Library', () => {
  describe('getDefaultTemplate', () => {
    it('returns a partial screen declaration', () => {
      const tmpl = getDefaultTemplate('lobby');
      expect(tmpl).toBeDefined();
      expect(tmpl.template).toBe('lobby');
    });

    it('each standard template type returns valid defaults', () => {
      const types = getTemplateTypes();
      for (const type of types) {
        const tmpl = getDefaultTemplate(type);
        expect(tmpl.template).toBe(type);
        expect(Array.isArray(tmpl.components)).toBe(true);
        expect(tmpl.layout).toBeDefined();
      }
    });

    it('lobby template has player-list component', () => {
      const tmpl = getDefaultTemplate('lobby');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('player-list');
    });

    it('prompt template has input component', () => {
      const tmpl = getDefaultTemplate('prompt');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('input');
    });

    it('prompt template has timer component', () => {
      const tmpl = getDefaultTemplate('prompt');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('timer');
    });

    it('vote template has button-group component', () => {
      const tmpl = getDefaultTemplate('vote');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('button-group');
    });

    it('vote template has timer component', () => {
      const tmpl = getDefaultTemplate('vote');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('timer');
    });

    it('reveal template includes player-list for correct answers', () => {
      const tmpl = getDefaultTemplate('reveal');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('player-list');
    });

    it('scoreboard template has score-table component', () => {
      const tmpl = getDefaultTemplate('scoreboard');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('score-table');
    });

    it('results template has score-table component', () => {
      const tmpl = getDefaultTemplate('results');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('score-table');
    });

    it('results template has button-group for play again', () => {
      const tmpl = getDefaultTemplate('results');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('button-group');
    });

    it('timer template has timer component', () => {
      const tmpl = getDefaultTemplate('timer');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('timer');
    });

    it('info template has text components', () => {
      const tmpl = getDefaultTemplate('info');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types.filter((t) => t === 'text').length).toBeGreaterThanOrEqual(1);
    });

    it('media template has image component', () => {
      const tmpl = getDefaultTemplate('media');
      const types = (tmpl.components ?? []).map((c) => c.type);
      expect(types).toContain('image');
    });

    it('custom template returns empty components', () => {
      const tmpl = getDefaultTemplate('custom');
      expect(tmpl.components).toHaveLength(0);
    });

    it('returns a copy — mutations do not affect the library', () => {
      const tmpl1 = getDefaultTemplate('lobby');
      const tmpl2 = getDefaultTemplate('lobby');
      // Should be structurally equal but different references
      expect(tmpl1.components).not.toBe(tmpl2.components);
    });
  });

  describe('getTemplateTypes', () => {
    it('returns all 10 template types', () => {
      const types = getTemplateTypes();
      expect(types.length).toBe(10);
      expect(types).toContain('lobby');
      expect(types).toContain('custom');
      expect(types).toContain('results');
    });
  });
});

// ---------------------------------------------------------------------------
// Schema Validation Tests
// ---------------------------------------------------------------------------

describe('Schema Validation', () => {
  describe('AnimationConfig', () => {
    it('parses a valid animation config', () => {
      const result = AnimationConfigSchema.safeParse({
        enter: 'fade',
        exit: 'slide-down',
        duration: 300,
      });
      expect(result.success).toBe(true);
    });

    it('parses partial animation config', () => {
      const result = AnimationConfigSchema.safeParse({ enter: 'zoom' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid enter value', () => {
      const result = AnimationConfigSchema.safeParse({ enter: 'invalid-animation' });
      expect(result.success).toBe(false);
    });
  });

  describe('GameTheme schema', () => {
    it('accepts a theme with all required fields', () => {
      const result = GameThemeSchema.safeParse({
        colors: {
          primary: '#FF5722',
          secondary: '#2196F3',
          accent: '#FFC107',
          background: '#1a1a2e',
          surface: '#16213e',
          text: '#ffffff',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts theme with optional fields', () => {
      const result = GameThemeSchema.safeParse({
        name: 'My Theme',
        colors: {
          primary: '#FF5722',
          secondary: '#2196F3',
          accent: '#FFC107',
          background: '#1a1a2e',
          surface: '#16213e',
          text: '#ffffff',
          textSecondary: '#aaa',
          error: '#f00',
          success: '#0f0',
        },
        typography: {
          fontFamily: 'Inter',
          headingFont: 'Poppins',
          fontSize: 'large',
        },
        borderRadius: '12px',
        spacing: 'relaxed',
        darkMode: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects theme missing required color fields', () => {
      const result = GameThemeSchema.safeParse({
        colors: { primary: '#FF5722' }, // missing secondary, accent, etc.
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PartialGameTheme schema', () => {
    it('accepts partial theme (fills defaults at runtime)', () => {
      const result = PartialGameThemeSchema.safeParse({
        colors: { primary: '#FF5722' },
        darkMode: true,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty object', () => {
      const result = PartialGameThemeSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('ScreenDeclaration schema', () => {
    it('parses a minimal valid screen declaration', () => {
      const result = ScreenDeclarationSchema.safeParse({
        id: 'lobby',
        template: 'lobby',
        surface: 'both',
      });
      expect(result.success).toBe(true);
    });

    it('parses a screen with components', () => {
      const result = ScreenDeclarationSchema.safeParse({
        id: 'play',
        template: 'prompt',
        surface: 'display',
        title: 'Round {{globals.round}}',
        components: [
          {
            type: 'text',
            props: { text: '{{content.currentPrompt}}' },
            style: { fontSize: '2rem' },
          },
          {
            type: 'timer',
            binding: 'phase.timeRemaining',
          },
          {
            type: 'player-list',
            props: { showScores: true },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('parses a screen with animations', () => {
      const result = ScreenDeclarationSchema.safeParse({
        id: 'lobby',
        template: 'lobby',
        surface: 'both',
        animations: { enter: 'fade', duration: 300 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid template type', () => {
      const result = ScreenDeclarationSchema.safeParse({
        id: 'lobby',
        template: 'invalid-template-type',
        surface: 'both',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid surface', () => {
      const result = ScreenDeclarationSchema.safeParse({
        id: 'lobby',
        template: 'lobby',
        surface: 'tablet', // invalid
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty id', () => {
      const result = ScreenDeclarationSchema.safeParse({
        id: '',
        template: 'lobby',
        surface: 'both',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PresentationConfig schema', () => {
    it('parses a valid presentation config', () => {
      const result = PresentationConfigSchema.safeParse({
        screens: [
          { id: 'lobby', template: 'lobby', surface: 'both' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('parses a config with theme and animations', () => {
      const result = PresentationConfigSchema.safeParse({
        theme: {
          colors: {
            primary: '#FF5722',
          },
          darkMode: true,
        },
        screens: [
          { id: 'lobby', template: 'lobby', surface: 'both' },
          { id: 'play_display', template: 'prompt', surface: 'display' },
        ],
        defaultAnimations: { enter: 'fade', duration: 400 },
      });
      expect(result.success).toBe(true);
    });

    it('requires screens array', () => {
      const result = PresentationConfigSchema.safeParse({
        theme: { colors: { primary: '#FF5722' } },
        // screens missing
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty screens array', () => {
      const result = PresentationConfigSchema.safeParse({ screens: [] });
      expect(result.success).toBe(true);
    });

    it('rejects invalid template type in screens', () => {
      const result = PresentationConfigSchema.safeParse({
        screens: [
          { id: 'lobby', template: 'nonexistent-type', surface: 'both' },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid surface in screens', () => {
      const result = PresentationConfigSchema.safeParse({
        screens: [
          { id: 'lobby', template: 'lobby', surface: 'projector' },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('parsePresentationConfig', () => {
    it('parses valid config and returns typed result', () => {
      const config = parsePresentationConfig({
        screens: [{ id: 'lobby', template: 'lobby', surface: 'both' }],
      });
      expect(config.screens).toHaveLength(1);
      expect(config.screens[0]!.id).toBe('lobby');
    });

    it('throws on invalid config', () => {
      expect(() =>
        parsePresentationConfig({ screens: [{ id: '', template: 'bad', surface: 'both' }] }),
      ).toThrow();
    });
  });

  describe('safeParsePresentationConfig', () => {
    it('returns success for valid config', () => {
      const result = safeParsePresentationConfig({
        screens: [{ id: 'lobby', template: 'lobby', surface: 'both' }],
      });
      expect(result.success).toBe(true);
    });

    it('returns error for invalid config', () => {
      const result = safeParsePresentationConfig({ bad: true });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration Test
// ---------------------------------------------------------------------------

describe('Integration', () => {
  it('full pipeline: define config → resolve display screen → verify bindings', () => {
    // 1. Define a full presentation config (theme + 3 screens)
    const config: PresentationConfig = {
      theme: mergeTheme({
        colors: {
          primary: '#FF5722',
          secondary: '#2196F3',
          accent: '#FFC107',
          background: '#1a1a2e',
          surface: '#16213e',
          text: '#ffffff',
        },
        typography: { fontFamily: 'Inter, sans-serif' },
        darkMode: true,
      }),
      screens: [
        {
          id: 'lobby',
          template: 'lobby',
          surface: 'both',
          title: 'Welcome!',
          animations: { enter: 'fade', duration: 300 },
        },
        {
          id: 'play_display',
          template: 'prompt',
          surface: 'display',
          title: 'Round {{globals.round}}',
          components: [
            {
              type: 'text',
              props: { text: '{{content.currentPrompt}}' },
              style: { fontSize: '2rem' },
              binding: 'globals.currentPrompt',
            },
            {
              type: 'timer',
              binding: 'phase.timeRemaining',
            },
            {
              type: 'player-list',
              props: { showScores: true },
            },
          ],
        },
        {
          id: 'play_phone',
          template: 'prompt',
          surface: 'phone',
          components: [
            { type: 'text', binding: 'globals.currentPrompt' },
            { type: 'input', props: { placeholder: 'Type your answer...' } },
          ],
        },
      ],
    };

    // 2. Mock game state
    const mockState = {
      globals: {
        round: 2,
        currentPrompt: 'What is the most useless superpower?',
      },
      phase: {
        timeRemaining: 18000,
      },
    };

    // 3. Resolve display screen for "play" phase
    const displayScreen = getScreenForPhase(config.screens, 'play', 'display');
    expect(displayScreen).toBeDefined();
    expect(displayScreen!.id).toBe('play_display');

    const resolved = resolveScreen(displayScreen!, mockState, config.theme!);

    // 4. Verify bindings resolved correctly
    expect(resolved.bindings['globals.currentPrompt']).toBe(
      'What is the most useless superpower?',
    );
    expect(resolved.bindings['phase.timeRemaining']).toBe(18000);

    // 5. Verify theme attached
    expect(resolved.theme.colors.primary).toBe('#FF5722');
    expect(resolved.theme.colors.secondary).toBe('#2196F3');

    // 6. Get phone screens, verify correct filtering
    const phoneScreens = getScreensForSurface(config.screens, 'phone');
    const phoneIds = phoneScreens.map((s) => s.id);
    expect(phoneIds).toContain('lobby');       // surface: 'both'
    expect(phoneIds).toContain('play_phone');  // surface: 'phone'
    expect(phoneIds).not.toContain('play_display'); // surface: 'display' only
  });

  it('full pipeline: resolve phone screen with bindings', () => {
    const screens: ScreenDeclaration[] = [
      {
        id: 'play_phone',
        template: 'prompt',
        surface: 'phone',
        components: [
          { type: 'text', binding: 'globals.currentPrompt' },
          { type: 'input', props: { placeholder: 'Type your answer...' } },
        ],
      },
    ];

    const state = {
      globals: { currentPrompt: 'Best cheese?' },
    };

    const phoneScreen = getScreenForPhase(screens, 'play', 'phone');
    expect(phoneScreen?.id).toBe('play_phone');

    const resolved = resolveScreen(phoneScreen!, state, defaultTheme);
    expect(resolved.bindings['globals.currentPrompt']).toBe('Best cheese?');
    expect(resolved.theme).toBe(defaultTheme);
  });

  it('schema validation → parse → mergeTheme → resolveThemeCSS pipeline', () => {
    // Simulate parsing a partial theme from YAML
    const rawConfig = {
      theme: {
        colors: { primary: '#9C27B0', accent: '#E91E63' },
        darkMode: true,
        borderRadius: '12px',
      },
      screens: [
        { id: 'lobby', template: 'lobby', surface: 'both' },
      ],
    };

    const parsed = parsePresentationConfig(rawConfig);
    expect(parsed.theme?.colors?.primary).toBe('#9C27B0');

    // Merge with defaults
    const theme = mergeTheme(parsed.theme ?? {});
    expect(theme.colors.primary).toBe('#9C27B0');
    expect(theme.colors.accent).toBe('#E91E63');
    // Defaults filled in
    expect(theme.colors.secondary).toBe(defaultTheme.colors.secondary);

    // Resolve to CSS
    const css = resolveThemeCSS(theme);
    expect(css['--color-primary']).toBe('#9C27B0');
    expect(css['--border-radius']).toBe('12px');
  });
});
