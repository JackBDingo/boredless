/**
 * asset-system.test.ts — Tests for the Asset Reference subsystem.
 *
 * Covers: AssetResolver (basic, URL resolution, fallbacks, variants,
 * filtering, preloading), Zod schema validation, and an integration test.
 */

import { describe, it, expect } from 'vitest';
import { AssetResolver } from '../asset-resolver.js';
import {
  AssetDeclarationSchema,
  AssetManifestSchema,
  AssetVariantSchema,
  parseAssetManifest,
} from '../schema-integration.js';
import type { AssetManifest } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    assets: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// AssetResolver — basic resolution
// ---------------------------------------------------------------------------

describe('AssetResolver - basic resolution', () => {
  it('resolves asset by ID', () => {
    const manifest = makeManifest({
      assets: [{ id: 'logo', type: 'image', src: 'images/logo.png' }],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('logo');
    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe('logo');
    expect(resolved!.type).toBe('image');
  });

  it('returns undefined for unknown ID', () => {
    const manifest = makeManifest({ assets: [] });
    const resolver = new AssetResolver(manifest);
    expect(resolver.resolve('nonexistent')).toBeUndefined();
  });

  it('has() returns true for existing asset', () => {
    const manifest = makeManifest({
      assets: [{ id: 'sfx', type: 'audio', src: 'sounds/hit.mp3' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.has('sfx')).toBe(true);
  });

  it('has() returns false for unknown asset', () => {
    const manifest = makeManifest({ assets: [] });
    const resolver = new AssetResolver(manifest);
    expect(resolver.has('ghost')).toBe(false);
  });

  it('getAssetUrl returns resolved URL', () => {
    const manifest = makeManifest({
      baseUrl: '/games/trivia/assets',
      assets: [{ id: 'logo', type: 'image', src: 'images/logo.png' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getAssetUrl('logo')).toBe('/games/trivia/assets/images/logo.png');
  });
});

// ---------------------------------------------------------------------------
// AssetResolver — URL resolution
// ---------------------------------------------------------------------------

describe('AssetResolver - URL resolution', () => {
  it('external URL (https://) used as-is', () => {
    const manifest = makeManifest({
      assets: [{ id: 'cdn_img', type: 'image', src: 'https://cdn.example.com/img.png' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getAssetUrl('cdn_img')).toBe('https://cdn.example.com/img.png');
  });

  it('external URL (http://) used as-is', () => {
    const manifest = makeManifest({
      assets: [{ id: 'ext', type: 'audio', src: 'http://example.com/sound.mp3' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getAssetUrl('ext')).toBe('http://example.com/sound.mp3');
  });

  it('relative path prepends publicUrlBase', () => {
    const manifest = makeManifest({
      assets: [{ id: 'bg', type: 'image', src: 'bg.png' }],
    });
    const resolver = new AssetResolver(manifest, { publicUrlBase: '/games/trivia/assets' });
    expect(resolver.getAssetUrl('bg')).toBe('/games/trivia/assets/bg.png');
  });

  it('manifest baseUrl takes precedence over publicUrlBase', () => {
    const manifest = makeManifest({
      baseUrl: '/manifest-base',
      assets: [{ id: 'icon', type: 'image', src: 'icon.png' }],
    });
    const resolver = new AssetResolver(manifest, { publicUrlBase: '/options-base' });
    expect(resolver.getAssetUrl('icon')).toBe('/manifest-base/icon.png');
  });

  it('relative path with no publicUrlBase uses gameDir', () => {
    const manifest = makeManifest({
      assets: [{ id: 'snd', type: 'audio', src: 'sounds/ding.mp3' }],
    });
    const resolver = new AssetResolver(manifest, { gameDir: '/games/trivia' });
    expect(resolver.getAssetUrl('snd')).toBe('/games/trivia/sounds/ding.mp3');
  });

  it('no base at all — relative path stays relative', () => {
    const manifest = makeManifest({
      assets: [{ id: 'plain', type: 'image', src: 'icon.png' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getAssetUrl('plain')).toBe('icon.png');
  });

  it('trailing slash on base handled correctly (no double slash)', () => {
    const manifest = makeManifest({
      baseUrl: '/games/trivia/assets/',
      assets: [{ id: 'logo', type: 'image', src: 'logo.png' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getAssetUrl('logo')).toBe('/games/trivia/assets/logo.png');
  });

  it('leading slash on src handled correctly', () => {
    const manifest = makeManifest({
      baseUrl: '/games/trivia/assets',
      assets: [{ id: 'logo', type: 'image', src: '/logo.png' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getAssetUrl('logo')).toBe('/games/trivia/assets/logo.png');
  });
});

// ---------------------------------------------------------------------------
// AssetResolver — fallbacks
// ---------------------------------------------------------------------------

describe('AssetResolver - fallbacks', () => {
  it('fallback URL resolved directly', () => {
    const manifest = makeManifest({
      assets: [
        {
          id: 'video',
          type: 'video',
          src: 'intro.mp4',
          fallback: 'https://cdn.example.com/fallback.mp4',
        },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('video');
    expect(resolved!.fallbackUrl).toBe('https://cdn.example.com/fallback.mp4');
  });

  it('fallback asset ID resolves to that asset URL', () => {
    const manifest = makeManifest({
      baseUrl: '/assets',
      assets: [
        { id: 'logo', type: 'image', src: 'logo.png' },
        { id: 'banner', type: 'image', src: 'banner.png', fallback: 'logo' },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('banner');
    expect(resolved!.fallbackUrl).toBe('/assets/logo.png');
  });

  it('recursive fallback (A → B → C) resolves correctly', () => {
    const manifest = makeManifest({
      baseUrl: '/assets',
      assets: [
        { id: 'c', type: 'image', src: 'c.png' },
        { id: 'b', type: 'image', src: 'b.png', fallback: 'c' },
        { id: 'a', type: 'image', src: 'a.png', fallback: 'b' },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const resolvedA = resolver.resolve('a');
    // a's fallback → b's URL
    expect(resolvedA!.fallbackUrl).toBe('/assets/b.png');
    const resolvedB = resolver.resolve('b');
    // b's fallback → c's URL
    expect(resolvedB!.fallbackUrl).toBe('/assets/c.png');
  });

  it('circular fallback does not infinite loop (max depth 3)', () => {
    const manifest = makeManifest({
      assets: [
        { id: 'x', type: 'image', src: 'x.png', fallback: 'y' },
        { id: 'y', type: 'image', src: 'y.png', fallback: 'x' },
      ],
    });
    const resolver = new AssetResolver(manifest);
    // Should not throw or hang; just return whatever it resolved within depth limit
    expect(() => resolver.resolve('x')).not.toThrow();
    const resolved = resolver.resolve('x');
    expect(resolved).toBeDefined();
    // fallbackUrl should be some valid string (y.png), not undefined
    expect(typeof resolved!.fallbackUrl).toBe('string');
  });

  it('preload defaults to false when not specified', () => {
    const manifest = makeManifest({
      assets: [{ id: 'img', type: 'image', src: 'img.png' }],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.resolve('img')!.preload).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AssetResolver — variants
// ---------------------------------------------------------------------------

describe('AssetResolver - variants', () => {
  it('variants resolved with same base URL logic', () => {
    const manifest = makeManifest({
      baseUrl: '/assets',
      assets: [
        {
          id: 'logo',
          type: 'image',
          src: 'logo.png',
          variants: [{ src: 'logo-dark.png', condition: 'dark' }],
        },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('logo');
    expect(resolved!.variants).toHaveLength(1);
    expect(resolved!.variants![0].url).toBe('/assets/logo-dark.png');
    expect(resolved!.variants![0].condition).toBe('dark');
  });

  it('multiple variants preserved', () => {
    const manifest = makeManifest({
      baseUrl: '/assets',
      assets: [
        {
          id: 'logo',
          type: 'image',
          src: 'logo.png',
          variants: [
            { src: 'logo-dark.png', condition: 'dark' },
            { src: 'logo-mobile.png', condition: 'mobile' },
            { src: 'logo-small.png', condition: 'small' },
          ],
        },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('logo');
    expect(resolved!.variants).toHaveLength(3);
    expect(resolved!.variants!.map((v) => v.condition)).toEqual(['dark', 'mobile', 'small']);
  });

  it('external URL variants used as-is', () => {
    const manifest = makeManifest({
      baseUrl: '/assets',
      assets: [
        {
          id: 'logo',
          type: 'image',
          src: 'logo.png',
          variants: [
            { src: 'https://cdn.example.com/logo-dark.png', condition: 'dark' },
          ],
        },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('logo');
    expect(resolved!.variants![0].url).toBe('https://cdn.example.com/logo-dark.png');
  });

  it('no variants field when declaration has no variants', () => {
    const manifest = makeManifest({
      assets: [{ id: 'snd', type: 'audio', src: 'ding.mp3' }],
    });
    const resolver = new AssetResolver(manifest);
    const resolved = resolver.resolve('snd');
    expect(resolved!.variants).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AssetResolver — filtering
// ---------------------------------------------------------------------------

describe('AssetResolver - filtering', () => {
  const manifest = makeManifest({
    baseUrl: '/assets',
    assets: [
      { id: 'logo', type: 'image', src: 'logo.png' },
      { id: 'banner', type: 'image', src: 'banner.png' },
      { id: 'correct', type: 'audio', src: 'correct.mp3' },
      { id: 'wrong', type: 'audio', src: 'wrong.mp3' },
      { id: 'intro', type: 'video', src: 'intro.mp4' },
      { id: 'font', type: 'font', src: 'font.woff2' },
      { id: 'data', type: 'json', src: 'data.json' },
    ],
  });

  it('getAssetsByType("image") returns only images', () => {
    const resolver = new AssetResolver(manifest);
    const images = resolver.getAssetsByType('image');
    expect(images).toHaveLength(2);
    expect(images.every((a) => a.type === 'image')).toBe(true);
  });

  it('getAssetsByType("audio") returns only audio', () => {
    const resolver = new AssetResolver(manifest);
    const audio = resolver.getAssetsByType('audio');
    expect(audio).toHaveLength(2);
    expect(audio.every((a) => a.type === 'audio')).toBe(true);
  });

  it('getAssetsByType("video") returns only video', () => {
    const resolver = new AssetResolver(manifest);
    const video = resolver.getAssetsByType('video');
    expect(video).toHaveLength(1);
    expect(video[0].id).toBe('intro');
  });

  it('getAssetsByType returns empty array for type with no assets', () => {
    const emptyManifest = makeManifest({ assets: [] });
    const resolver = new AssetResolver(emptyManifest);
    expect(resolver.getAssetsByType('image')).toHaveLength(0);
  });

  it('resolveAll() returns all assets', () => {
    const resolver = new AssetResolver(manifest);
    const all = resolver.resolveAll();
    expect(all).toHaveLength(7);
  });

  it('resolveAll() returns assets in declaration order', () => {
    const resolver = new AssetResolver(manifest);
    const ids = resolver.resolveAll().map((a) => a.id);
    expect(ids).toEqual(['logo', 'banner', 'correct', 'wrong', 'intro', 'font', 'data']);
  });
});

// ---------------------------------------------------------------------------
// AssetResolver — preloading
// ---------------------------------------------------------------------------

describe('AssetResolver - preloading', () => {
  it('getPreloadManifest includes only preload:true assets', () => {
    const manifest = makeManifest({
      baseUrl: '/assets',
      assets: [
        { id: 'logo', type: 'image', src: 'logo.png', preload: true },
        { id: 'bg', type: 'image', src: 'bg.png', preload: false },
        { id: 'sfx', type: 'audio', src: 'sfx.mp3', preload: true },
        { id: 'music', type: 'audio', src: 'music.mp3' },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const preload = resolver.getPreloadManifest();
    expect(preload.assets).toHaveLength(2);
    expect(preload.assets.map((a) => a.id)).toEqual(['logo', 'sfx']);
  });

  it('getPreloadManifest returns empty when nothing marked', () => {
    const manifest = makeManifest({
      assets: [
        { id: 'img', type: 'image', src: 'img.png' },
        { id: 'snd', type: 'audio', src: 'snd.mp3' },
      ],
    });
    const resolver = new AssetResolver(manifest);
    expect(resolver.getPreloadManifest().assets).toHaveLength(0);
  });

  it('getPreloadManifest returns empty for empty manifest', () => {
    const resolver = new AssetResolver(makeManifest());
    expect(resolver.getPreloadManifest().assets).toHaveLength(0);
  });

  it('preload manifest has correct URLs', () => {
    const manifest = makeManifest({
      baseUrl: '/games/quiz/assets',
      assets: [
        { id: 'logo', type: 'image', src: 'logo.png', preload: true },
        { id: 'font', type: 'font', src: 'font.woff2', preload: true },
      ],
    });
    const resolver = new AssetResolver(manifest);
    const preload = resolver.getPreloadManifest();
    expect(preload.assets[0]).toMatchObject({
      id: 'logo',
      type: 'image',
      url: '/games/quiz/assets/logo.png',
    });
    expect(preload.assets[1]).toMatchObject({
      id: 'font',
      type: 'font',
      url: '/games/quiz/assets/font.woff2',
    });
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('Schema validation', () => {
  it('valid asset manifest parses', () => {
    const result = AssetManifestSchema.safeParse({
      baseUrl: '/assets',
      assets: [
        { id: 'logo', type: 'image', src: 'logo.png', alt: 'Game Logo', preload: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('valid asset with variants parses', () => {
    const result = AssetDeclarationSchema.safeParse({
      id: 'logo',
      type: 'image',
      src: 'logo.png',
      variants: [{ src: 'logo-dark.png', condition: 'dark' }],
    });
    expect(result.success).toBe(true);
  });

  it('invalid asset type rejected', () => {
    const result = AssetDeclarationSchema.safeParse({
      id: 'thing',
      type: 'svg',          // not a valid AssetType
      src: 'thing.svg',
    });
    expect(result.success).toBe(false);
  });

  it('missing src rejected', () => {
    const result = AssetDeclarationSchema.safeParse({
      id: 'logo',
      type: 'image',
      // src missing
    });
    expect(result.success).toBe(false);
  });

  it('missing id rejected', () => {
    const result = AssetDeclarationSchema.safeParse({
      // id missing
      type: 'image',
      src: 'logo.png',
    });
    expect(result.success).toBe(false);
  });

  it('valid variant conditions accepted', () => {
    const conditions = ['dark', 'light', 'mobile', 'desktop', 'small', 'large'] as const;
    for (const condition of conditions) {
      const result = AssetVariantSchema.safeParse({ src: 'img.png', condition });
      expect(result.success).toBe(true);
    }
  });

  it('invalid variant condition rejected', () => {
    const result = AssetVariantSchema.safeParse({ src: 'img.png', condition: 'retina' });
    expect(result.success).toBe(false);
  });

  it('manifest with no baseUrl is valid', () => {
    const result = AssetManifestSchema.safeParse({
      assets: [{ id: 'x', type: 'json', src: 'data.json' }],
    });
    expect(result.success).toBe(true);
  });

  it('empty assets array is valid', () => {
    const result = AssetManifestSchema.safeParse({ assets: [] });
    expect(result.success).toBe(true);
  });

  it('asset with metadata parses', () => {
    const result = AssetDeclarationSchema.safeParse({
      id: 'data',
      type: 'json',
      src: 'data.json',
      metadata: { version: 2, compressed: true },
    });
    expect(result.success).toBe(true);
  });

  it('preload defaults to false via Zod default', () => {
    const result = AssetDeclarationSchema.parse({
      id: 'img',
      type: 'image',
      src: 'img.png',
    });
    expect(result.preload).toBe(false);
  });

  it('parseAssetManifest throws on invalid data', () => {
    expect(() =>
      parseAssetManifest({ assets: [{ id: 'bad', type: 'invalid_type', src: 'x' }] }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration test
// ---------------------------------------------------------------------------

describe('Integration test', () => {
  it('full scenario: 5 assets, 2 preloads, 1 fallback, by-type filtering', () => {
    const manifest: AssetManifest = {
      baseUrl: '/games/trivia/assets',
      assets: [
        // image — preload
        { id: 'logo', type: 'image', src: 'images/logo.png', alt: 'Logo', preload: true },
        // audio — preload
        { id: 'correct_sfx', type: 'audio', src: 'sounds/correct.mp3', preload: true },
        // audio — no preload
        { id: 'bg_music', type: 'audio', src: 'sounds/background.mp3' },
        // video — fallback to logo (asset ID)
        {
          id: 'intro_video',
          type: 'video',
          src: 'https://cdn.example.com/intro.mp4',
          fallback: 'logo',
        },
        // font — no preload
        { id: 'game_font', type: 'font', src: 'fonts/GameFont.woff2' },
      ],
    };

    const resolver = new AssetResolver(manifest);

    // Resolve all — verify URLs
    const all = resolver.resolveAll();
    expect(all).toHaveLength(5);

    // External URL stays as-is
    const introVideo = all.find((a) => a.id === 'intro_video')!;
    expect(introVideo.url).toBe('https://cdn.example.com/intro.mp4');

    // Relative paths get baseUrl prepended
    const logo = all.find((a) => a.id === 'logo')!;
    expect(logo.url).toBe('/games/trivia/assets/images/logo.png');

    const bgMusic = all.find((a) => a.id === 'bg_music')!;
    expect(bgMusic.url).toBe('/games/trivia/assets/sounds/background.mp3');

    // Fallback: intro_video's fallback → logo's resolved URL
    expect(introVideo.fallbackUrl).toBe('/games/trivia/assets/images/logo.png');

    // Preload manifest — only 2 assets
    const preload = resolver.getPreloadManifest();
    expect(preload.assets).toHaveLength(2);
    expect(preload.assets.map((a) => a.id)).toEqual(['logo', 'correct_sfx']);

    // Filter by type
    const images = resolver.getAssetsByType('image');
    expect(images).toHaveLength(1);
    expect(images[0].id).toBe('logo');

    const audio = resolver.getAssetsByType('audio');
    expect(audio).toHaveLength(2);

    const video = resolver.getAssetsByType('video');
    expect(video).toHaveLength(1);

    const fonts = resolver.getAssetsByType('font');
    expect(fonts).toHaveLength(1);

    // has() checks
    expect(resolver.has('logo')).toBe(true);
    expect(resolver.has('nonexistent')).toBe(false);
  });
});
