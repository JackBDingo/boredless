/**
 * index.ts — Public API for the Content System subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Content System
 * from other subsystems. Never import directly from internal files.
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  ContentItem,
  ContentSource,
  ContentSourceType,
  SelectionStrategy,
  ContentPoolConfig,
  ContentFilter,
  ContentPack,
} from './types.js';

// ---------------------------------------------------------------------------
// ContentPool
// ---------------------------------------------------------------------------

export { ContentPool } from './content-pool.js';

// ---------------------------------------------------------------------------
// ContentLoader
// ---------------------------------------------------------------------------

export { ContentLoader, defaultContentLoader } from './content-loader.js';

// ---------------------------------------------------------------------------
// ContentRegistry
// ---------------------------------------------------------------------------

export { ContentRegistry } from './content-registry.js';

// ---------------------------------------------------------------------------
// Schema integration (Zod schemas + parsers)
// ---------------------------------------------------------------------------

export {
  // Zod schemas
  ContentItemSchema,
  ContentSourceSchema,
  InlineContentSourceSchema,
  FileContentSourceSchema,
  BundledContentSourceSchema,
  ContentFilterSchema,
  ContentPoolConfigSchema,
  ContentSectionSchema,
  ContentPackSchema,
  SelectionStrategySchema,

  // Parser helpers
  parseContentSection,
  safeParseContentSection,
} from './schema-integration.js';

// Schema types
export type {
  ContentSection,
} from './schema-integration.js';
