/**
 * content-loader.ts — Load content items from inline, file, and bundled sources.
 *
 * ContentLoader is stateful — it holds a registry of ContentPacks that can be
 * referenced by 'bundled' sources. A single loader instance can be shared across
 * games in a process (packs are global), or a per-game instance can be used.
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContentItem, ContentSource, ContentPack } from './types.js';
import { ContentItemSchema } from './schema-integration.js';

// ---------------------------------------------------------------------------
// ContentLoader
// ---------------------------------------------------------------------------

export class ContentLoader {
  /** Registered content packs, keyed by pack ID. */
  private readonly _packs: Map<string, ContentPack> = new Map();

  // ---------------------------------------------------------------------------
  // Content Pack Registry
  // ---------------------------------------------------------------------------

  /**
   * Register a content pack so it can be referenced by 'bundled' sources.
   *
   * @param pack The content pack to register.
   * @throws If a pack with the same ID is already registered.
   */
  registerContentPack(pack: ContentPack): void {
    if (this._packs.has(pack.id)) {
      throw new Error(`Content pack "${pack.id}" is already registered.`);
    }
    this._packs.set(pack.id, pack);
  }

  /**
   * Retrieve a registered content pack by ID.
   *
   * @param packId The ID of the pack.
   * @returns The pack, or undefined if not found.
   */
  getContentPack(packId: string): ContentPack | undefined {
    return this._packs.get(packId);
  }

  /**
   * Unregister a content pack (useful in tests or dynamic scenarios).
   *
   * @param packId The ID of the pack to remove.
   */
  unregisterContentPack(packId: string): void {
    this._packs.delete(packId);
  }

  // ---------------------------------------------------------------------------
  // Item Loading
  // ---------------------------------------------------------------------------

  /**
   * Load and merge content items from one or more sources.
   *
   * Items from all sources are concatenated. Duplicate IDs across sources
   * are allowed — deduplication is the caller's responsibility.
   *
   * @param sources The content sources to load from.
   * @param gameDir Optional directory for resolving 'file' source paths.
   * @returns Merged array of validated ContentItem objects.
   */
  loadContentItems(sources: ContentSource[], gameDir?: string): ContentItem[] {
    const allItems: ContentItem[] = [];

    for (const source of sources) {
      const items = this._loadSource(source, gameDir);
      allItems.push(...items);
    }

    return allItems;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _loadSource(source: ContentSource, gameDir?: string): ContentItem[] {
    switch (source.type) {
      case 'inline':
        return this._loadInline(source);
      case 'file':
        return this._loadFile(source, gameDir);
      case 'bundled':
        return this._loadBundled(source);
      default: {
        const _exhaustive: never = source.type;
        throw new Error(`Unknown content source type: ${String(_exhaustive)}`);
      }
    }
  }

  private _loadInline(source: ContentSource): ContentItem[] {
    if (!source.items || source.items.length === 0) {
      throw new Error(
        `ContentSource with type "inline" must include a non-empty "items" array.`,
      );
    }
    return this._validateItems(source.items, 'inline source');
  }

  private _loadFile(source: ContentSource, gameDir?: string): ContentItem[] {
    if (!source.path) {
      throw new Error(`ContentSource with type "file" must include a "path" field.`);
    }

    const resolvedPath = gameDir ? path.resolve(gameDir, source.path) : path.resolve(source.path);

    let raw: string;
    try {
      raw = fs.readFileSync(resolvedPath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read content file "${resolvedPath}": ${msg}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Content file "${resolvedPath}" contains invalid JSON.`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `Content file "${resolvedPath}" must export a JSON array of ContentItem objects.`,
      );
    }

    return this._validateItems(parsed, `file "${source.path}"`);
  }

  private _loadBundled(source: ContentSource): ContentItem[] {
    if (!source.packId) {
      throw new Error(`ContentSource with type "bundled" must include a "packId" field.`);
    }

    const pack = this._packs.get(source.packId);
    if (!pack) {
      throw new Error(
        `Content pack "${source.packId}" is not registered. Call registerContentPack() before loading.`,
      );
    }

    return this._validateItems(pack.items, `content pack "${source.packId}"`);
  }

  /**
   * Validate an array of unknown objects against ContentItemSchema.
   * Throws a descriptive error for the first invalid item found.
   */
  private _validateItems(rawItems: unknown[], sourceDescription: string): ContentItem[] {
    const validated: ContentItem[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const result = ContentItemSchema.safeParse(rawItems[i]);
      if (!result.success) {
        const issues = result.error.issues
          .map((issue) => `  [${issue.path.join('.')}] ${issue.message}`)
          .join('\n');
        throw new Error(
          `Invalid ContentItem at index ${i} in ${sourceDescription}:\n${issues}`,
        );
      }
      validated.push(result.data);
    }

    return validated;
  }
}

// ---------------------------------------------------------------------------
// Default singleton loader
// ---------------------------------------------------------------------------

/**
 * A default ContentLoader instance suitable for most use cases.
 * Games and tests can import this directly, or create their own instances.
 */
export const defaultContentLoader = new ContentLoader();
