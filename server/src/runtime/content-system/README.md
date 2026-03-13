# Content System

**Phase:** 3.1  
**Status:** Complete  
**Location:** `server/src/runtime/content-system/`

## Purpose

The Content System separates game content (prompts, questions, cards, categories) from game logic. Content is declared as typed pools in the game schema; the runtime loads and serves items according to the pool's selection strategy.

This implements the principle: **game content is data, not code**.

## Architecture

```
ContentSection (game YAML)
        │
        ▼
ContentLoader          ← loads from inline / file / bundled sources
        │
        ▼
ContentPool            ← manages selection strategy, draw state, filtering
        │
        ▼
ContentRegistry        ← per-game-room pool registry
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | Core TypeScript interfaces (`ContentItem`, `ContentSource`, `ContentPoolConfig`, `ContentFilter`, `ContentPack`) |
| `content-pool.ts` | `ContentPool` class — manages item drawing with strategy, repeat prevention, recycling |
| `content-loader.ts` | `ContentLoader` class — loads items from inline, file, and bundled sources |
| `content-registry.ts` | `ContentRegistry` class — per-room pool management |
| `schema-integration.ts` | Zod schemas for content declarations in game YAML + parse helpers |
| `index.ts` | Public API (single import point) |
| `__tests__/content-system.test.ts` | 64 comprehensive tests |

## Game Schema Usage

```yaml
content:
  pools:
    - id: prompts
      name: "Game Prompts"
      sources:
        - type: inline
          items:
            - id: p1
              text: "What's the most embarrassing thing you've done?"
              category: embarrassing
              difficulty: easy
            - id: p2
              text: "Describe your worst date"
              category: dating
              difficulty: medium
              tags: [adult, dating]
        - type: file
          path: "content/extra-prompts.json"
      selection: shuffle
      noRepeat: true

    - id: categories
      name: "Category Pool"
      sources:
        - type: inline
          items:
            - id: c1
              text: "Animals"
              metadata: { icon: "🐾" }
            - id: c2
              text: "History"
              metadata: { icon: "📜" }
      selection: random
```

## Content Sources

| Type | Required Fields | Description |
|------|----------------|-------------|
| `inline` | `items` | Items embedded directly in the game schema |
| `file` | `path` | JSON file relative to the game directory |
| `bundled` | `packId` | Items from a registered `ContentPack` (expansion packs) |

Multiple sources are merged: items from all sources are combined into a single pool.

## Selection Strategies

| Strategy | Behavior |
|----------|---------|
| `random` | Uniform random selection from available items |
| `weighted` | Weighted random — higher `weight` = more likely |
| `sequential` | Items drawn in insertion order |
| `shuffle` | Pool shuffled once at init; then drawn sequentially |

## Key Behaviors

- **`noRepeat: true` (default)** — drawn items removed from pool until exhausted
- **`recyclable: true` (default)** — pool refills when exhausted
- **Pre-filters** — applied at construction; permanently limit pool contents
- **Runtime filtering** — `pool.filter(filters)` for ad-hoc queries without consuming items

## ContentItem Fields

```ts
interface ContentItem {
  id: string;
  text: string;
  category?: string;
  tags?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  weight?: number;          // default: 1, use 0 to exclude from weighted draws
  metadata?: Record<string, unknown>;  // game-specific data
}
```

## Usage Example

```ts
import { ContentRegistry, ContentLoader } from '../content-system/index.js';

// Per game room
const loader = new ContentLoader();
const registry = new ContentRegistry(loader);

// Optional: register expansion packs
loader.registerContentPack({
  id: 'adult-pack',
  name: 'Adult Edition',
  items: [ /* ... */ ]
});

// Create pools from schema config
registry.createPool(config, gameDir);

// Draw items
const pool = registry.getPool('prompts');
const [nextPrompt] = pool.draw(1);

// Filter without consuming
const hardQuestions = pool.filter([{ field: 'difficulty', value: 'hard' }]);

// Reset at end of round
registry.reset();

// Teardown
registry.destroy();
```

## Tests

64 tests covering all selection strategies, filtering, state management, loader, registry, schema validation, and an integration trivia game scenario.

Run: `npx vitest run src/runtime/content-system`
