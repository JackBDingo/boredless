/**
 * types.ts — Core type definitions for the Content System.
 *
 * These types define the shape of content pools, items, sources, filters,
 * and selection strategies. Game content is data, not code.
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

// ---------------------------------------------------------------------------
// Content Item
// ---------------------------------------------------------------------------

/**
 * A single unit of content — a prompt, question, card, category, etc.
 * This is the fundamental building block of all content pools.
 */
export interface ContentItem {
  /** Unique identifier within the pool (must be unique across all sources in a pool). */
  id: string;
  /** The primary content text. */
  text: string;
  /** Semantic grouping — used for filtering. */
  category?: string;
  /** Arbitrary string labels — used for multi-dimensional filtering. */
  tags?: string[];
  /** Difficulty classification. */
  difficulty?: 'easy' | 'medium' | 'hard';
  /**
   * Weight for weighted selection (default: 1).
   * Higher values increase probability of selection.
   * Weight of 0 means the item is never drawn.
   */
  weight?: number;
  /**
   * Game-specific extra data (answers, point values, hints, image refs, etc.).
   * The runtime treats this as opaque — game schemas and extensions interpret it.
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Content Source
// ---------------------------------------------------------------------------

/** Where content items come from. */
export type ContentSourceType = 'inline' | 'file' | 'bundled';

/**
 * A single source of content items.
 *
 * - 'inline'  — items embedded directly in the game schema
 * - 'file'    — items loaded from a JSON file on disk (relative to game directory)
 * - 'bundled' — items from a registered ContentPack (expansion packs)
 */
export interface ContentSource {
  type: ContentSourceType;
  /** For 'inline' sources: items defined directly in the schema. */
  items?: ContentItem[];
  /** For 'file' sources: path to JSON file, relative to the game directory. */
  path?: string;
  /** For 'bundled' sources: identifier of a registered ContentPack. */
  packId?: string;
}

// ---------------------------------------------------------------------------
// Selection Strategy
// ---------------------------------------------------------------------------

/**
 * How items are drawn from the pool.
 *
 * - 'random'     — uniform random selection
 * - 'weighted'   — probability proportional to item.weight
 * - 'sequential' — in order of insertion (first in, first out)
 * - 'shuffle'    — pool shuffled once; then drawn sequentially from shuffled order
 */
export type SelectionStrategy = 'random' | 'weighted' | 'sequential' | 'shuffle';

// ---------------------------------------------------------------------------
// Content Filter
// ---------------------------------------------------------------------------

/**
 * Criteria for filtering a pool's items.
 * Multiple filters combine with AND logic (all must match for inclusion).
 */
export interface ContentFilter {
  /** Which field to evaluate. */
  field: 'category' | 'difficulty' | 'tag';
  /**
   * Accepted value(s). For 'tag' field, item must have at least one matching tag.
   * For 'category'/'difficulty', item's field must equal one of these values.
   */
  value: string | string[];
  /** If true, items matching the filter are EXCLUDED (inverts the logic). */
  exclude?: boolean;
}

// ---------------------------------------------------------------------------
// Content Pool Config
// ---------------------------------------------------------------------------

/**
 * Declaration of a content pool in the game schema.
 * A pool combines one or more sources and applies a selection strategy.
 */
export interface ContentPoolConfig {
  /** Unique identifier for this pool within the game. */
  id: string;
  /** Human-readable name (for tooling and authoring). */
  name?: string;
  /** One or more content sources. Items from all sources are merged. */
  sources: ContentSource[];
  /** How items are drawn from this pool. */
  selection: SelectionStrategy;
  /**
   * Prevent repeating items until the pool is exhausted.
   * Default: true.
   */
  noRepeat?: boolean;
  /**
   * Pre-filters applied when the pool is initialized.
   * Items not matching filters are permanently excluded from the pool.
   */
  filters?: ContentFilter[];
  /**
   * When the pool is exhausted, automatically refill from original items.
   * Default: true.
   */
  recyclable?: boolean;
}

// ---------------------------------------------------------------------------
// Content Pack (Expansion Pack)
// ---------------------------------------------------------------------------

/**
 * A named bundle of content items that can be registered with the loader
 * and referenced by game schemas using 'type: bundled' sources.
 *
 * This is the expansion pack interface — future DLC, themed content sets, etc.
 */
export interface ContentPack {
  /** Unique identifier for this pack (referenced by ContentSource.packId). */
  id: string;
  /** Display name for the pack. */
  name: string;
  /** Optional description for authoring tools. */
  description?: string;
  /** The content items in this pack. */
  items: ContentItem[];
  /** Optional tags describing the pack's content type or theme. */
  tags?: string[];
}
