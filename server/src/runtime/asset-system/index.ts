/**
 * index.ts — Public API for the Asset System subsystem.
 *
 * Exports everything consumers need to declare, resolve, and preload
 * game assets. Do not import from internal modules — use this file only.
 *
 * @module asset-system
 */

// Types
export type {
  AssetType,
  AssetDeclaration,
  AssetVariant,
  ResolvedAsset,
  ResolvedAssetVariant,
  AssetManifest,
  PreloadManifest,
} from './types.js';

// Resolver
export { AssetResolver } from './asset-resolver.js';
export type { AssetResolverOptions } from './asset-resolver.js';

// Zod schemas
export {
  AssetVariantSchema,
  AssetDeclarationSchema,
  AssetManifestSchema,
  parseAssetManifest,
  safeParseAssetManifest,
} from './schema-integration.js';
export type { AssetVariantInput, AssetDeclarationInput, AssetManifestInput } from './schema-integration.js';
