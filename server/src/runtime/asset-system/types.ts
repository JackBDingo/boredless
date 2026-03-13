/**
 * types.ts — Type definitions for the Asset Reference subsystem.
 *
 * Provides types for declaring, resolving, and preloading game media assets
 * (images, audio, video, fonts, JSON). Assets are declared in game schemas
 * and resolved at runtime to absolute or server-relative URLs.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type AssetType = 'image' | 'audio' | 'video' | 'font' | 'json';

/**
 * A single asset declaration as written in the game schema.
 * `src` may be a relative path (resolved via baseUrl/gameDir) or an external URL.
 */
export interface AssetDeclaration {
  id: string;
  type: AssetType;
  src: string;                          // relative path or external URL
  alt?: string;                         // alt text (images)
  preload?: boolean;                    // hint to preload on game start (default: false)
  fallback?: string;                    // fallback asset id or external URL
  variants?: AssetVariant[];            // responsive/themed variants
  metadata?: Record<string, unknown>;
}

/**
 * A responsive or themed variant of an asset.
 */
export interface AssetVariant {
  src: string;
  condition: 'dark' | 'light' | 'mobile' | 'desktop' | 'small' | 'large';
}

// ---------------------------------------------------------------------------
// Resolved types (after URL resolution)
// ---------------------------------------------------------------------------

/**
 * A resolved asset — all paths have been converted to URLs.
 */
export interface ResolvedAsset {
  id: string;
  type: AssetType;
  url: string;                          // resolved URL (absolute or server-relative)
  preload: boolean;
  alt?: string;
  fallbackUrl?: string;
  variants?: ResolvedAssetVariant[];
}

export interface ResolvedAssetVariant {
  url: string;
  condition: string;
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

/**
 * Asset manifest for a game — declared in the game schema under `assets:`.
 */
export interface AssetManifest {
  assets: AssetDeclaration[];
  baseUrl?: string;                     // base URL prefix for relative asset paths
}

/**
 * Preload manifest sent to the client on game start.
 * Only includes assets marked with `preload: true`.
 */
export interface PreloadManifest {
  assets: Array<{
    id: string;
    type: AssetType;
    url: string;
  }>;
}
