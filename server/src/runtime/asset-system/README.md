# Asset System — Phase 3.3

**Status:** ✅ Complete  
**Phase:** 3.3 — Asset References  
**Location:** `server/src/runtime/asset-system/`

---

## Overview

The Asset System lets game schemas declare media assets (images, audio, video, fonts, JSON) with resolution, preloading hints, and fallback support. It bridges game package declarations to runtime-ready URLs without touching file serving or Express routes.

---

## Subsystem Files

| File | Purpose |
|------|---------|
| `types.ts` | Core type definitions |
| `asset-resolver.ts` | `AssetResolver` class — URL resolution, fallback chaining, filtering |
| `schema-integration.ts` | Zod schemas for game YAML validation |
| `index.ts` | Public API (single import point) |
| `__tests__/asset-system.test.ts` | Comprehensive test suite |

---

## Usage

### Declaring Assets in a Game Schema

```yaml
assets:
  baseUrl: "/games/trivia/assets"
  assets:
    - id: logo
      type: image
      src: "images/logo.png"
      alt: "Game Logo"
      preload: true
      variants:
        - src: "images/logo-dark.png"
          condition: dark

    - id: correct_sound
      type: audio
      src: "sounds/correct.mp3"
      preload: true

    - id: bg_music
      type: audio
      src: "sounds/background.mp3"

    - id: intro_video
      type: video
      src: "https://cdn.example.com/videos/intro.mp4"
      fallback: logo

    - id: custom_font
      type: font
      src: "fonts/GameFont.woff2"
      preload: true
```

### Resolving Assets at Runtime

```typescript
import { AssetResolver } from './asset-system/index.js';

const resolver = new AssetResolver(gamePackage.assets, {
  publicUrlBase: `/games/${gamePackage.manifest.id}/assets`,
});

// Resolve a single asset
const logo = resolver.resolve('logo');
// → { id: 'logo', type: 'image', url: '/games/trivia/assets/images/logo.png', preload: true, ... }

// Quick URL lookup
const url = resolver.getAssetUrl('correct_sound');

// Get preload manifest for game start
const preload = resolver.getPreloadManifest();
// → { assets: [{ id: 'logo', type: 'image', url: '...' }, { id: 'correct_sound', ... }] }

// Filter by type
const images = resolver.getAssetsByType('image');
const audio = resolver.getAssetsByType('audio');
```

---

## URL Resolution Logic

| `src` value | Base | Resolved URL |
|-------------|------|-------------|
| `https://cdn.example.com/img.png` | anything | `https://cdn.example.com/img.png` (external, used as-is) |
| `images/logo.png` | `baseUrl: "/assets"` | `/assets/images/logo.png` |
| `logo.png` | `publicUrlBase: "/games/x/assets"` | `/games/x/assets/logo.png` |
| `logo.png` | `gameDir: "/games/x"` | `/games/x/logo.png` |
| `logo.png` | none | `logo.png` (relative, left as-is) |

**Priority:** `manifest.baseUrl` > `options.publicUrlBase` > `options.gameDir`

---

## Fallback Resolution

Fallbacks can reference another asset ID or a direct URL:

```yaml
- id: intro_video
  type: video
  src: "intro.mp4"
  fallback: logo          # resolves to logo's URL
  
- id: poster_image
  type: image
  src: "poster.png"
  fallback: "https://cdn.example.com/fallback.png"   # used as-is
```

Recursive fallback chains (A → B → C) are supported up to depth 3. Circular references are automatically broken.

---

## Asset Types

| Type | Description |
|------|-------------|
| `image` | PNG, JPG, SVG, WebP, etc. |
| `audio` | MP3, OGG, WAV |
| `video` | MP4, WebM |
| `font` | WOFF, WOFF2, TTF |
| `json` | Data files |

---

## Variant Conditions

| Condition | Use case |
|-----------|---------|
| `dark` | Dark mode variant |
| `light` | Light mode variant |
| `mobile` | Mobile-sized screens |
| `desktop` | Desktop-sized screens |
| `small` | Small display |
| `large` | Large display |

---

## What This Subsystem Does NOT Do

- **No file serving** — Does not create Express routes or serve files. That's a runtime integration concern.
- **No file existence checking** — Does not verify that declared local files exist on disk. A future lint step or package validator can add that.
- **No HTTP preloading** — Does not trigger actual HTTP preloads. The `PreloadManifest` is data for clients to act on.

---

## Schema Extension

`schema-engine/schema.ts` now includes an optional `assets:` section in `GamePackageSchema`:

```typescript
assets: AssetsSchema.optional(),
```

This is non-breaking — existing game packages without an `assets:` section continue to work.
