/**
 * asset-resolver.ts — Asset resolution for game media assets.
 *
 * Resolves asset declarations (relative paths or external URLs) to
 * fully-qualified URLs that can be served to clients.
 */

import type {
  AssetDeclaration,
  AssetManifest,
  AssetType,
  PreloadManifest,
  ResolvedAsset,
  ResolvedAssetVariant,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum recursion depth when resolving fallback asset IDs. */
const MAX_FALLBACK_DEPTH = 3;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface AssetResolverOptions {
  /** The game's directory on disk (used when no publicUrlBase is set). */
  gameDir?: string;
  /** URL prefix for serving game assets, e.g. `/games/trivia/assets/`. */
  publicUrlBase?: string;
}

// ---------------------------------------------------------------------------
// AssetResolver
// ---------------------------------------------------------------------------

/**
 * Resolves asset declarations from a game manifest to concrete URLs.
 *
 * Resolution logic:
 * - External URLs (http:// or https://) are used as-is.
 * - Relative paths are prefixed with `publicUrlBase` when provided,
 *   then `gameDir`, then left relative if neither is set.
 * - Fallback fields may reference another asset ID or an external URL.
 *   Fallback asset IDs are resolved recursively (max depth 3).
 */
export class AssetResolver {
  private readonly _manifest: AssetManifest;
  private readonly _options: AssetResolverOptions;
  /** Map from asset ID → declaration, built once at construction. */
  private readonly _index: Map<string, AssetDeclaration>;

  constructor(manifest: AssetManifest, options: AssetResolverOptions = {}) {
    this._manifest = manifest;
    this._options = options;
    this._index = new Map(manifest.assets.map((a) => [a.id, a]));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Returns true if an asset with the given ID exists in the manifest. */
  has(assetId: string): boolean {
    return this._index.has(assetId);
  }

  /**
   * Resolve a single asset by ID.
   * Returns `undefined` if the asset is not found.
   */
  resolve(assetId: string): ResolvedAsset | undefined {
    const declaration = this._index.get(assetId);
    if (!declaration) return undefined;
    return this._resolveDeclaration(declaration, 0);
  }

  /** Resolve all assets in the manifest. */
  resolveAll(): ResolvedAsset[] {
    return this._manifest.assets.map((d) => this._resolveDeclaration(d, 0));
  }

  /**
   * Returns a preload manifest containing only assets marked `preload: true`.
   * This is sent to the client on game start to kick off early loading.
   */
  getPreloadManifest(): PreloadManifest {
    const preloadable = this._manifest.assets.filter((a) => a.preload === true);
    return {
      assets: preloadable.map((a) => {
        const resolved = this._resolveDeclaration(a, 0);
        return { id: resolved.id, type: resolved.type, url: resolved.url };
      }),
    };
  }

  /**
   * Quick URL lookup for an asset by ID.
   * Returns `undefined` if the asset is not found.
   */
  getAssetUrl(assetId: string): string | undefined {
    return this.resolve(assetId)?.url;
  }

  /** Returns all resolved assets of a given type. */
  getAssetsByType(type: AssetType): ResolvedAsset[] {
    return this.resolveAll().filter((a) => a.type === type);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _resolveDeclaration(
    declaration: AssetDeclaration,
    depth: number,
  ): ResolvedAsset {
    const url = this._resolveUrl(declaration.src);

    const fallbackUrl = declaration.fallback
      ? this._resolveFallback(declaration.fallback, depth)
      : undefined;

    const variants: ResolvedAssetVariant[] | undefined =
      declaration.variants && declaration.variants.length > 0
        ? declaration.variants.map((v) => ({
            url: this._resolveUrl(v.src),
            condition: v.condition,
          }))
        : undefined;

    return {
      id: declaration.id,
      type: declaration.type,
      url,
      preload: declaration.preload ?? false,
      ...(declaration.alt !== undefined ? { alt: declaration.alt } : {}),
      ...(fallbackUrl !== undefined ? { fallbackUrl } : {}),
      ...(variants !== undefined ? { variants } : {}),
    };
  }

  /**
   * Resolve a src string to a URL:
   * - External URLs (http/https) → used as-is
   * - Relative paths → prepend publicUrlBase, gameDir, or leave relative
   */
  private _resolveUrl(src: string): string {
    if (this._isExternalUrl(src)) {
      return src;
    }

    const base = this._getBase();
    if (!base) return src;

    // Ensure exactly one slash between base and src
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedSrc = src.startsWith('/') ? src.slice(1) : src;
    return `${normalizedBase}${normalizedSrc}`;
  }

  /**
   * Resolve a fallback value:
   * - If it's an external URL → use directly
   * - If it matches a known asset ID → resolve that asset recursively (max depth)
   * - Otherwise → treat as a URL/path and resolve it
   */
  private _resolveFallback(fallback: string, currentDepth: number): string | undefined {
    if (this._isExternalUrl(fallback)) {
      return fallback;
    }

    // Check if it's an asset ID reference
    if (this._index.has(fallback)) {
      if (currentDepth >= MAX_FALLBACK_DEPTH) {
        // Depth exceeded — stop recursion, return the raw src for this asset
        const declaration = this._index.get(fallback)!;
        return this._resolveUrl(declaration.src);
      }
      const resolved = this._resolveDeclaration(this._index.get(fallback)!, currentDepth + 1);
      return resolved.url;
    }

    // Neither external URL nor known asset ID — treat as a path/URL
    return this._resolveUrl(fallback);
  }

  private _isExternalUrl(src: string): boolean {
    return src.startsWith('http://') || src.startsWith('https://');
  }

  private _getBase(): string | undefined {
    // Prefer manifest-level baseUrl if set
    if (this._manifest.baseUrl) return this._manifest.baseUrl;
    // Then options-level publicUrlBase
    if (this._options.publicUrlBase) return this._options.publicUrlBase;
    // Then gameDir
    if (this._options.gameDir) return this._options.gameDir;
    return undefined;
  }
}
