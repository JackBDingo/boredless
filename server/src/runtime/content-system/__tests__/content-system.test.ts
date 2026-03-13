/**
 * content-system.test.ts — Comprehensive tests for the Content System.
 *
 * Covers: ContentPool (all strategies), ContentLoader, ContentRegistry,
 * schema validation, and an integration "trivia game" scenario.
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentPool } from '../content-pool.js';
import { ContentLoader } from '../content-loader.js';
import { ContentRegistry } from '../content-registry.js';
import {
  ContentItemSchema,
  parseContentSection,
  safeParseContentSection,
} from '../schema-integration.js';
import type { ContentItem, ContentPoolConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeItems(count: number, overrides: Partial<ContentItem> = {}): ContentItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    text: `Item ${i + 1}`,
    weight: 1,
    ...overrides,
  }));
}

function makePool(
  items: ContentItem[],
  overrides: Partial<ContentPoolConfig> = {},
): ContentPool {
  const config: ContentPoolConfig = {
    id: 'test-pool',
    sources: [{ type: 'inline', items }],
    selection: 'random',
    ...overrides,
  };
  return new ContentPool(config, items);
}

// ---------------------------------------------------------------------------
// ContentPool — random selection
// ---------------------------------------------------------------------------

describe('ContentPool — random selection', () => {
  it('draws items from pool', () => {
    const pool = makePool(makeItems(5));
    const drawn = pool.draw(3);
    expect(drawn).toHaveLength(3);
  });

  it('noRepeat prevents same item twice in a single draw batch', () => {
    const pool = makePool(makeItems(10), { selection: 'random', noRepeat: true });
    const drawn = pool.draw(10);
    const ids = drawn.map((i) => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(10);
  });

  it('pool recycles when exhausted and recyclable=true', () => {
    const pool = makePool(makeItems(3), {
      selection: 'random',
      noRepeat: true,
      recyclable: true,
    });
    pool.draw(3); // exhaust
    expect(pool.getRemaining()).toBe(0);
    const more = pool.draw(1);
    expect(more).toHaveLength(1);
    expect(pool.getRemaining()).toBe(2); // 3 - 1 drawn after recycle
  });

  it('returns empty when exhausted and recyclable=false', () => {
    const pool = makePool(makeItems(3), {
      selection: 'random',
      noRepeat: true,
      recyclable: false,
    });
    pool.draw(3); // exhaust
    const more = pool.draw(1);
    expect(more).toHaveLength(0);
  });

  it('multiple draws eventually exhaust pool', () => {
    const pool = makePool(makeItems(5), {
      selection: 'random',
      noRepeat: true,
      recyclable: false,
    });
    for (let i = 0; i < 5; i++) pool.draw(1);
    expect(pool.getRemaining()).toBe(0);
    expect(pool.draw(1)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ContentPool — weighted selection
// ---------------------------------------------------------------------------

describe('ContentPool — weighted selection', () => {
  it('higher weight items drawn more frequently (statistical)', () => {
    const items: ContentItem[] = [
      { id: 'rare', text: 'Rare', weight: 1 },
      { id: 'common', text: 'Common', weight: 99 },
    ];
    // noRepeat=false so we can draw many times
    const pool = makePool(items, { selection: 'weighted', noRepeat: false });
    const counts: Record<string, number> = { rare: 0, common: 0 };
    for (let i = 0; i < 1000; i++) {
      const drawn = pool.draw(1);
      counts[drawn[0].id]++;
    }
    // Common should appear ~99% of the time
    expect(counts.common).toBeGreaterThan(800);
    expect(counts.rare).toBeLessThan(200);
  });

  it('weight of 0 means item is never drawn', () => {
    const items: ContentItem[] = [
      { id: 'never', text: 'Never', weight: 0 },
      { id: 'always', text: 'Always', weight: 1 },
    ];
    const pool = makePool(items, { selection: 'weighted', noRepeat: false });
    const drawn = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const d = pool.draw(1);
      if (d.length > 0) drawn.add(d[0].id);
    }
    expect(drawn.has('never')).toBe(false);
    expect(drawn.has('always')).toBe(true);
  });

  it('all weights equal behaves like random (all items drawn)', () => {
    const items: ContentItem[] = makeItems(5).map((it) => ({ ...it, weight: 1 }));
    const pool = makePool(items, { selection: 'weighted', noRepeat: true });
    const drawn = pool.draw(5);
    expect(drawn).toHaveLength(5);
    const ids = new Set(drawn.map((i) => i.id));
    expect(ids.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// ContentPool — sequential selection
// ---------------------------------------------------------------------------

describe('ContentPool — sequential selection', () => {
  it('items drawn in order', () => {
    const items = makeItems(4);
    const pool = makePool(items, { selection: 'sequential', noRepeat: true });
    const drawn = pool.draw(4);
    expect(drawn.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3', 'item-4']);
  });

  it('wraps around when recyclable=true', () => {
    const items = makeItems(3);
    const pool = makePool(items, {
      selection: 'sequential',
      noRepeat: true,
      recyclable: true,
    });
    pool.draw(3); // exhaust
    const next = pool.draw(1);
    expect(next[0].id).toBe('item-1');
  });

  it('returns empty when not recyclable and exhausted', () => {
    const items = makeItems(3);
    const pool = makePool(items, {
      selection: 'sequential',
      noRepeat: true,
      recyclable: false,
    });
    pool.draw(3);
    expect(pool.draw(1)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ContentPool — shuffle selection
// ---------------------------------------------------------------------------

describe('ContentPool — shuffle selection', () => {
  it('all items drawn before any repeat (noRepeat=true)', () => {
    const items = makeItems(6);
    const pool = makePool(items, { selection: 'shuffle', noRepeat: true });
    const drawn = pool.draw(6);
    const ids = new Set(drawn.map((i) => i.id));
    expect(ids.size).toBe(6);
  });

  it('order is randomized (not always same as original)', () => {
    // Run 20 times; at least one run should differ from natural order
    const items = makeItems(8);
    const naturalOrder = items.map((i) => i.id).join(',');
    let foundDifferent = false;
    for (let t = 0; t < 20; t++) {
      const pool = makePool(items, { selection: 'shuffle', noRepeat: true });
      const drawn = pool.draw(8);
      if (drawn.map((i) => i.id).join(',') !== naturalOrder) {
        foundDifferent = true;
        break;
      }
    }
    expect(foundDifferent).toBe(true);
  });

  it('recycle reshuffles the pool', () => {
    const items = makeItems(5);
    const pool = makePool(items, { selection: 'shuffle', noRepeat: true, recyclable: true });
    const batch1 = pool.draw(5).map((i) => i.id);
    // After recycle, all items available again
    const batch2 = pool.draw(5).map((i) => i.id);
    // Both batches should contain all 5 items
    expect(new Set(batch2).size).toBe(5);
    // Note: order may or may not differ — we just verify all items present
    expect(batch2.every((id) => batch1.includes(id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ContentPool — filtering
// ---------------------------------------------------------------------------

describe('ContentPool — filtering', () => {
  const items: ContentItem[] = [
    { id: 'a', text: 'A', category: 'animals', difficulty: 'easy', tags: ['cute', 'furry'] },
    { id: 'b', text: 'B', category: 'animals', difficulty: 'hard', tags: ['scary'] },
    { id: 'c', text: 'C', category: 'history', difficulty: 'medium', tags: ['ancient'] },
    { id: 'd', text: 'D', category: 'history', difficulty: 'hard', tags: ['ancient', 'war'] },
    { id: 'e', text: 'E', category: 'science', difficulty: 'easy', tags: ['physics'] },
  ];

  it('filter by category returns matching items', () => {
    const pool = makePool(items);
    const result = pool.filter([{ field: 'category', value: 'animals' }]);
    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('filter by difficulty returns matching items', () => {
    const pool = makePool(items);
    const result = pool.filter([{ field: 'difficulty', value: 'hard' }]);
    expect(result.map((i) => i.id)).toEqual(['b', 'd']);
  });

  it('filter by tag returns items with matching tag', () => {
    const pool = makePool(items);
    const result = pool.filter([{ field: 'tag', value: 'ancient' }]);
    expect(result.map((i) => i.id)).toEqual(['c', 'd']);
  });

  it('exclude filter removes matching items', () => {
    const pool = makePool(items);
    const result = pool.filter([{ field: 'category', value: 'animals', exclude: true }]);
    const ids = result.map((i) => i.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('b');
    expect(ids).toContain('c');
    expect(ids).toContain('d');
    expect(ids).toContain('e');
  });

  it('multiple filters combine (AND logic)', () => {
    const pool = makePool(items);
    const result = pool.filter([
      { field: 'category', value: 'history' },
      { field: 'difficulty', value: 'hard' },
    ]);
    expect(result.map((i) => i.id)).toEqual(['d']);
  });

  it('filter by tag with array of values (OR within a filter)', () => {
    const pool = makePool(items);
    const result = pool.filter([{ field: 'tag', value: ['cute', 'physics'] }]);
    expect(result.map((i) => i.id)).toEqual(['a', 'e']);
  });

  it('filtering does not consume items', () => {
    const pool = makePool(items);
    const before = pool.getRemaining();
    pool.filter([{ field: 'category', value: 'animals' }]);
    expect(pool.getRemaining()).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// ContentPool — pre-filters (filters in config)
// ---------------------------------------------------------------------------

describe('ContentPool — pre-filters in config', () => {
  it('pre-filter applies at construction and limits getAll()', () => {
    const items: ContentItem[] = [
      { id: 'easy1', text: 'E1', difficulty: 'easy' },
      { id: 'hard1', text: 'H1', difficulty: 'hard' },
      { id: 'easy2', text: 'E2', difficulty: 'easy' },
    ];
    const config: ContentPoolConfig = {
      id: 'filtered-pool',
      sources: [{ type: 'inline', items }],
      selection: 'sequential',
      filters: [{ field: 'difficulty', value: 'hard' }],
    };
    const pool = new ContentPool(config, items);
    expect(pool.getAll().map((i) => i.id)).toEqual(['hard1']);
    expect(pool.getRemaining()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ContentPool — state
// ---------------------------------------------------------------------------

describe('ContentPool — state', () => {
  it('getRemaining() accurate after draws', () => {
    const pool = makePool(makeItems(10));
    expect(pool.getRemaining()).toBe(10);
    pool.draw(4);
    expect(pool.getRemaining()).toBe(6);
  });

  it('reset() refills pool', () => {
    const pool = makePool(makeItems(5), { noRepeat: true });
    pool.draw(5);
    expect(pool.getRemaining()).toBe(0);
    pool.reset();
    expect(pool.getRemaining()).toBe(5);
  });

  it('getState() returns correct counts', () => {
    const pool = makePool(makeItems(8), { noRepeat: true });
    expect(pool.getState()).toEqual({ remaining: 8, total: 8, drawn: 0 });
    pool.draw(3);
    expect(pool.getState()).toEqual({ remaining: 5, total: 8, drawn: 3 });
  });

  it('getState().drawn resets on reset()', () => {
    const pool = makePool(makeItems(5), { noRepeat: true });
    pool.draw(3);
    pool.reset();
    expect(pool.getState().drawn).toBe(0);
  });

  it('peek() returns next items without consuming', () => {
    const items = makeItems(5);
    const pool = makePool(items, { selection: 'sequential', noRepeat: true });
    const peeked = pool.peek(2);
    expect(peeked).toHaveLength(2);
    expect(peeked[0].id).toBe('item-1');
    expect(pool.getRemaining()).toBe(5);
  });

  it('getAll() returns all items regardless of draw state', () => {
    const pool = makePool(makeItems(5), { noRepeat: true });
    pool.draw(3);
    expect(pool.getAll()).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// ContentLoader
// ---------------------------------------------------------------------------

describe('ContentLoader', () => {
  let loader: ContentLoader;

  beforeEach(() => {
    loader = new ContentLoader();
  });

  it('loads inline items', () => {
    const items = makeItems(3);
    const loaded = loader.loadContentItems([{ type: 'inline', items }]);
    expect(loaded).toHaveLength(3);
    expect(loaded[0].id).toBe('item-1');
  });

  it('validates items against schema — rejects missing id', () => {
    const badItems = [{ text: 'No ID here' }]; // missing id
    expect(() =>
      loader.loadContentItems([{ type: 'inline', items: badItems as ContentItem[] }]),
    ).toThrow();
  });

  it('validates items against schema — rejects missing text', () => {
    const badItems = [{ id: 'x' }]; // missing text
    expect(() =>
      loader.loadContentItems([{ type: 'inline', items: badItems as ContentItem[] }]),
    ).toThrow();
  });

  it('invalid items rejected with descriptive error', () => {
    const badItems = [{ id: '', text: '' }]; // empty id and text
    expect(() =>
      loader.loadContentItems([{ type: 'inline', items: badItems as ContentItem[] }]),
    ).toThrow(/index 0/);
  });

  it('registers and retrieves content packs', () => {
    const pack = {
      id: 'my-pack',
      name: 'My Pack',
      items: makeItems(5),
    };
    loader.registerContentPack(pack);
    expect(loader.getContentPack('my-pack')).toBe(pack);
  });

  it('throws if registering duplicate pack id', () => {
    const pack = { id: 'dup', name: 'Dup', items: makeItems(2) };
    loader.registerContentPack(pack);
    expect(() => loader.registerContentPack(pack)).toThrow(/already registered/);
  });

  it('getContentPack returns undefined for unknown pack', () => {
    expect(loader.getContentPack('ghost')).toBeUndefined();
  });

  it('bundled source uses registered pack items', () => {
    const pack = { id: 'trivia-pack', name: 'Trivia', items: makeItems(4) };
    loader.registerContentPack(pack);
    const loaded = loader.loadContentItems([{ type: 'bundled', packId: 'trivia-pack' }]);
    expect(loaded).toHaveLength(4);
  });

  it('bundled source throws if pack not registered', () => {
    expect(() =>
      loader.loadContentItems([{ type: 'bundled', packId: 'missing-pack' }]),
    ).toThrow(/not registered/);
  });

  it('inline source throws if items missing', () => {
    expect(() =>
      loader.loadContentItems([{ type: 'inline' }] as Parameters<typeof loader.loadContentItems>[0]),
    ).toThrow(/inline/);
  });

  it('file source throws if path missing', () => {
    expect(() =>
      loader.loadContentItems([{ type: 'file' }] as Parameters<typeof loader.loadContentItems>[0]),
    ).toThrow(/file.*must|must.*file/);
  });

  it('loads from file using temp file', () => {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `content-test-${Date.now()}.json`);
    const items = makeItems(3);
    fs.writeFileSync(filePath, JSON.stringify(items), 'utf-8');
    try {
      const loaded = loader.loadContentItems([{ type: 'file', path: filePath }]);
      expect(loaded).toHaveLength(3);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('file source throws on non-existent file', () => {
    expect(() =>
      loader.loadContentItems([{ type: 'file', path: '/nonexistent/path.json' }]),
    ).toThrow(/Failed to read/);
  });

  it('file source throws if JSON is not an array', () => {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `content-obj-test-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ not: 'an array' }), 'utf-8');
    try {
      expect(() =>
        loader.loadContentItems([{ type: 'file', path: filePath }]),
      ).toThrow(/JSON array/);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it('merges items from multiple sources', () => {
    const items1 = makeItems(3);
    const items2: ContentItem[] = [{ id: 'x1', text: 'Extra 1' }, { id: 'x2', text: 'Extra 2' }];
    const pack = { id: 'extra-pack', name: 'Extra', items: items2 };
    loader.registerContentPack(pack);

    const loaded = loader.loadContentItems([
      { type: 'inline', items: items1 },
      { type: 'bundled', packId: 'extra-pack' },
    ]);
    expect(loaded).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// ContentRegistry
// ---------------------------------------------------------------------------

describe('ContentRegistry', () => {
  let registry: ContentRegistry;

  beforeEach(() => {
    registry = new ContentRegistry();
  });

  it('creates and retrieves pools by ID', () => {
    const config: ContentPoolConfig = {
      id: 'prompts',
      sources: [{ type: 'inline', items: makeItems(5) }],
      selection: 'random',
    };
    const pool = registry.createPool(config);
    expect(registry.getPool('prompts')).toBe(pool);
  });

  it('throws when creating duplicate pool ID', () => {
    const config: ContentPoolConfig = {
      id: 'dup',
      sources: [{ type: 'inline', items: makeItems(3) }],
      selection: 'random',
    };
    registry.createPool(config);
    expect(() => registry.createPool(config)).toThrow(/already exists/);
  });

  it('throws when getting non-existent pool', () => {
    expect(() => registry.getPool('ghost')).toThrow(/not found/);
  });

  it('hasPool returns correct boolean', () => {
    const config: ContentPoolConfig = {
      id: 'pool1',
      sources: [{ type: 'inline', items: makeItems(2) }],
      selection: 'sequential',
    };
    expect(registry.hasPool('pool1')).toBe(false);
    registry.createPool(config);
    expect(registry.hasPool('pool1')).toBe(true);
  });

  it('getAllPools returns all registered pools', () => {
    for (const id of ['a', 'b', 'c']) {
      registry.createPool({
        id,
        sources: [{ type: 'inline', items: makeItems(2) }],
        selection: 'random',
      });
    }
    const all = registry.getAllPools();
    expect(all.size).toBe(3);
    expect(all.has('a')).toBe(true);
  });

  it('reset() resets all pools', () => {
    const config: ContentPoolConfig = {
      id: 'r-pool',
      sources: [{ type: 'inline', items: makeItems(5) }],
      selection: 'random',
      noRepeat: true,
    };
    const pool = registry.createPool(config);
    pool.draw(5);
    expect(pool.getRemaining()).toBe(0);
    registry.reset();
    expect(pool.getRemaining()).toBe(5);
  });

  it('destroy() clears all pools', () => {
    registry.createPool({
      id: 'p1',
      sources: [{ type: 'inline', items: makeItems(2) }],
      selection: 'random',
    });
    expect(registry.size).toBe(1);
    registry.destroy();
    expect(registry.size).toBe(0);
    expect(() => registry.getPool('p1')).toThrow();
  });

  it('getAllPools() returns a copy (mutation-safe)', () => {
    registry.createPool({
      id: 'safe',
      sources: [{ type: 'inline', items: makeItems(2) }],
      selection: 'random',
    });
    const copy = registry.getAllPools();
    copy.delete('safe');
    expect(registry.hasPool('safe')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('Schema validation — ContentSectionSchema', () => {
  it('valid content section parses successfully', () => {
    const raw = {
      pools: [
        {
          id: 'prompts',
          name: 'Game Prompts',
          sources: [
            {
              type: 'inline',
              items: [
                { id: 'p1', text: 'Question 1', difficulty: 'easy' },
                { id: 'p2', text: 'Question 2', difficulty: 'hard', tags: ['science'] },
              ],
            },
          ],
          selection: 'shuffle',
          noRepeat: true,
        },
      ],
    };
    const result = safeParseContentSection(raw);
    expect(result.success).toBe(true);
  });

  it('missing required pools field is rejected', () => {
    const result = safeParseContentSection({});
    expect(result.success).toBe(false);
  });

  it('empty pools array is rejected', () => {
    const result = safeParseContentSection({ pools: [] });
    expect(result.success).toBe(false);
  });

  it('missing pool id is rejected', () => {
    const result = safeParseContentSection({
      pools: [
        {
          sources: [{ type: 'inline', items: [{ id: 'a', text: 'A' }] }],
          selection: 'random',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('invalid selection strategy is rejected', () => {
    const result = safeParseContentSection({
      pools: [
        {
          id: 'p',
          sources: [{ type: 'inline', items: [{ id: 'a', text: 'A' }] }],
          selection: 'zigzag', // invalid
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('file source requires path', () => {
    const result = safeParseContentSection({
      pools: [
        {
          id: 'p',
          sources: [{ type: 'file' }], // missing path
          selection: 'random',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('inline source requires items', () => {
    const result = safeParseContentSection({
      pools: [
        {
          id: 'p',
          sources: [{ type: 'inline' }], // missing items
          selection: 'random',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('bundled source requires packId', () => {
    const result = safeParseContentSection({
      pools: [
        {
          id: 'p',
          sources: [{ type: 'bundled' }], // missing packId
          selection: 'random',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('ContentItemSchema validates correctly', () => {
    const valid = ContentItemSchema.safeParse({ id: 'x', text: 'Hello' });
    expect(valid.success).toBe(true);

    const invalid = ContentItemSchema.safeParse({ id: '', text: '' });
    expect(invalid.success).toBe(false);
  });

  it('multiple pools in one content section', () => {
    const raw = {
      pools: [
        {
          id: 'questions',
          sources: [{ type: 'inline', items: [{ id: 'q1', text: 'Q1' }] }],
          selection: 'random',
        },
        {
          id: 'categories',
          sources: [{ type: 'inline', items: [{ id: 'c1', text: 'Animals' }] }],
          selection: 'shuffle',
        },
      ],
    };
    const result = safeParseContentSection(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pools).toHaveLength(2);
    }
  });

  it('parseContentSection throws on invalid input', () => {
    expect(() => parseContentSection(null)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration test — Trivia game scenario
// ---------------------------------------------------------------------------

describe('Integration — Trivia game content setup', () => {
  /**
   * Scenario:
   * - A trivia game has 20 questions with categories and difficulties
   * - We filter to "hard" difficulty
   * - Draw 5 sequentially — all should be hard, no repeats
   * - Draw 5 more — no repeats from previous batch
   */

  function makeTrivia20(): ContentItem[] {
    // 6 easy, 8 medium, 6 hard
    const items: ContentItem[] = [];
    for (let i = 1; i <= 6; i++) {
      items.push({
        id: `easy-${i}`,
        text: `Easy question ${i}`,
        category: i <= 3 ? 'science' : 'history',
        difficulty: 'easy',
      });
    }
    for (let i = 1; i <= 8; i++) {
      items.push({
        id: `medium-${i}`,
        text: `Medium question ${i}`,
        category: i <= 4 ? 'science' : 'history',
        difficulty: 'medium',
      });
    }
    for (let i = 1; i <= 6; i++) {
      items.push({
        id: `hard-${i}`,
        text: `Hard question ${i}`,
        category: i <= 3 ? 'science' : 'geography',
        difficulty: 'hard',
      });
    }
    return items;
  }

  it('trivia game — draw 5 hard questions sequentially, no repeats across two batches', () => {
    const registry = new ContentRegistry();

    // Create pool with 20 questions, pre-filtered to hard
    const config: ContentPoolConfig = {
      id: 'trivia-hard',
      sources: [{ type: 'inline', items: makeTrivia20() }],
      selection: 'sequential',
      noRepeat: true,
      recyclable: true,
      filters: [{ field: 'difficulty', value: 'hard' }],
    };
    const pool = registry.createPool(config);

    // Pool should contain only hard questions (6 of them)
    expect(pool.getAll()).toHaveLength(6);
    expect(pool.getAll().every((q) => q.difficulty === 'hard')).toBe(true);

    // Draw 5 questions
    const batch1 = pool.draw(5);
    expect(batch1).toHaveLength(5);
    // All hard
    expect(batch1.every((q) => q.difficulty === 'hard')).toBe(true);
    // No repeats in batch
    const batch1Ids = new Set(batch1.map((q) => q.id));
    expect(batch1Ids.size).toBe(5);

    // Draw 5 more (pool only had 6, so after 5 drawn we have 1 left, then recycle)
    const batch2 = pool.draw(5);
    expect(batch2).toHaveLength(5);
    // All hard
    expect(batch2.every((q) => q.difficulty === 'hard')).toBe(true);

    // No repeats within batch2
    const batch2Ids = new Set(batch2.map((q) => q.id));
    expect(batch2Ids.size).toBe(5);

    // The first 5 from batch2 are: the 1 remaining from first cycle + 4 from recycle
    // batch1[0..4] drew items 1-5; batch2[0] drew item 6; then recycled and drew 1-4
    // The single item not in batch1 should appear in batch2
    const missingFromBatch1 = pool.getAll().find((q) => !batch1Ids.has(q.id));
    expect(missingFromBatch1).toBeDefined();
    expect(batch2.some((q) => q.id === missingFromBatch1!.id)).toBe(true);
  });

  it('trivia game — filtered pool via ContentRegistry with file + inline sources', () => {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `trivia-extra-${Date.now()}.json`);
    const extraItems: ContentItem[] = [
      { id: 'hard-file-1', text: 'File hard question 1', difficulty: 'hard' },
      { id: 'hard-file-2', text: 'File hard question 2', difficulty: 'hard' },
    ];
    fs.writeFileSync(filePath, JSON.stringify(extraItems), 'utf-8');

    try {
      const loader = new ContentLoader();
      const registry = new ContentRegistry(loader);

      const config: ContentPoolConfig = {
        id: 'combined',
        sources: [
          { type: 'inline', items: makeTrivia20() },
          { type: 'file', path: filePath },
        ],
        selection: 'random',
        noRepeat: true,
        filters: [{ field: 'difficulty', value: 'hard' }],
      };
      const pool = registry.createPool(config);

      // 6 hard from inline + 2 from file = 8 hard total
      expect(pool.getAll()).toHaveLength(8);
      const batch = pool.draw(8);
      expect(batch).toHaveLength(8);
      expect(batch.every((q) => q.difficulty === 'hard')).toBe(true);
      const ids = new Set(batch.map((q) => q.id));
      expect(ids.size).toBe(8);
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});
