/**
 * content-registry.ts — Per-game registry of content pools.
 *
 * ContentRegistry holds all content pools for a single game room.
 * It orchestrates loading (via ContentLoader) and pool creation.
 * One registry per game room; never shared globally.
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

import type { ContentPoolConfig } from './types.js';
import { ContentPool } from './content-pool.js';
import { ContentLoader } from './content-loader.js';

// ---------------------------------------------------------------------------
// ContentRegistry
// ---------------------------------------------------------------------------

export class ContentRegistry {
  private readonly _pools: Map<string, ContentPool> = new Map();
  private readonly _loader: ContentLoader;

  /**
   * Create a new ContentRegistry.
   *
   * @param loader Optional ContentLoader instance. Defaults to a new instance.
   *   Pass a shared loader if you have pre-registered content packs.
   */
  constructor(loader?: ContentLoader) {
    this._loader = loader ?? new ContentLoader();
  }

  // ---------------------------------------------------------------------------
  // Pool management
  // ---------------------------------------------------------------------------

  /**
   * Create a content pool from a config declaration and register it.
   *
   * @param config The pool configuration (from game schema).
   * @param gameDir Optional path to the game's directory (for resolving file sources).
   * @returns The created ContentPool.
   * @throws If a pool with the same ID already exists.
   */
  createPool(config: ContentPoolConfig, gameDir?: string): ContentPool {
    if (this._pools.has(config.id)) {
      throw new Error(`Content pool "${config.id}" already exists in this registry.`);
    }

    const items = this._loader.loadContentItems(config.sources, gameDir);
    const pool = new ContentPool(config, items);
    this._pools.set(config.id, pool);
    return pool;
  }

  /**
   * Retrieve a pool by ID.
   *
   * @param id The pool ID.
   * @returns The ContentPool.
   * @throws If no pool with that ID exists.
   */
  getPool(id: string): ContentPool {
    const pool = this._pools.get(id);
    if (!pool) {
      throw new Error(
        `Content pool "${id}" not found. Available pools: [${[...this._pools.keys()].join(', ')}]`,
      );
    }
    return pool;
  }

  /**
   * Check if a pool exists without throwing.
   *
   * @param id The pool ID.
   */
  hasPool(id: string): boolean {
    return this._pools.has(id);
  }

  /**
   * Get all registered pools.
   *
   * @returns A copy of the internal pools map (mutation-safe).
   */
  getAllPools(): Map<string, ContentPool> {
    return new Map(this._pools);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Reset all pools to their initial state.
   * Useful at the start of a new game round without recreating the registry.
   */
  reset(): void {
    for (const pool of this._pools.values()) {
      pool.reset();
    }
  }

  /**
   * Destroy the registry: clear all pools and internal state.
   * Call this when the game room is torn down.
   */
  destroy(): void {
    this._pools.clear();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** The ContentLoader used by this registry (for pack registration). */
  get loader(): ContentLoader {
    return this._loader;
  }

  /** Number of registered pools. */
  get size(): number {
    return this._pools.size;
  }
}
