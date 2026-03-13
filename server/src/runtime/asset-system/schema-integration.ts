/**
 * schema-integration.ts — Zod schemas for asset declarations in game YAML.
 *
 * Defines the Zod schemas that validate the `assets:` section of a game
 * package. These are imported by schema-engine to extend GamePackageSchema.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// AssetVariantSchema
// ---------------------------------------------------------------------------

export const AssetVariantSchema = z.object({
  src: z.string().min(1, 'variant src must not be empty'),
  condition: z.enum(['dark', 'light', 'mobile', 'desktop', 'small', 'large']),
});

export type AssetVariantInput = z.infer<typeof AssetVariantSchema>;

// ---------------------------------------------------------------------------
// AssetDeclarationSchema
// ---------------------------------------------------------------------------

export const AssetDeclarationSchema = z.object({
  id: z.string().min(1, 'asset id must not be empty'),
  type: z.enum(['image', 'audio', 'video', 'font', 'json']),
  src: z.string().min(1, 'asset src must not be empty'),
  alt: z.string().optional(),
  preload: z.boolean().optional().default(false),
  fallback: z.string().optional(),
  variants: z.array(AssetVariantSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AssetDeclarationInput = z.infer<typeof AssetDeclarationSchema>;

// ---------------------------------------------------------------------------
// AssetManifestSchema
// ---------------------------------------------------------------------------

export const AssetManifestSchema = z.object({
  assets: z.array(AssetDeclarationSchema),
  baseUrl: z.string().optional(),
});

export type AssetManifestInput = z.infer<typeof AssetManifestSchema>;

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate an asset manifest from game YAML.
 * Throws a ZodError if validation fails.
 */
export function parseAssetManifest(data: unknown): AssetManifestInput {
  return AssetManifestSchema.parse(data);
}

/**
 * Safe parse — returns { success, data } / { success: false, error }.
 */
export function safeParseAssetManifest(
  data: unknown,
): z.SafeParseReturnType<unknown, AssetManifestInput> {
  return AssetManifestSchema.safeParse(data);
}
