/**
 * schema-integration.ts — Zod schemas for content declarations in game YAML.
 *
 * Defines the schema for the 'content:' section of game packages.
 * Also updates GamePackageSchema to use typed content instead of z.record(z.any()).
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// ContentItem schema
// ---------------------------------------------------------------------------

export const ContentItemSchema = z.object({
  id: z.string().min(1, 'ContentItem id must not be empty'),
  text: z.string().min(1, 'ContentItem text must not be empty'),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  weight: z.number().min(0, 'weight must be >= 0').optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ContentItemSchemaType = z.infer<typeof ContentItemSchema>;

// ---------------------------------------------------------------------------
// ContentSource schema
// ---------------------------------------------------------------------------

/**
 * Three discriminated variants of content source:
 * - inline: must have items
 * - file:   must have path
 * - bundled: must have packId
 */
export const InlineContentSourceSchema = z.object({
  type: z.literal('inline'),
  items: z.array(ContentItemSchema).min(1, 'inline source must have at least one item'),
});

export const FileContentSourceSchema = z.object({
  type: z.literal('file'),
  path: z.string().min(1, 'file source must have a non-empty path'),
});

export const BundledContentSourceSchema = z.object({
  type: z.literal('bundled'),
  packId: z.string().min(1, 'bundled source must have a non-empty packId'),
});

export const ContentSourceSchema = z.discriminatedUnion('type', [
  InlineContentSourceSchema,
  FileContentSourceSchema,
  BundledContentSourceSchema,
]);

export type ContentSourceSchemaType = z.infer<typeof ContentSourceSchema>;

// ---------------------------------------------------------------------------
// ContentPoolConfig schema
// ---------------------------------------------------------------------------

export const ContentFilterSchema = z.object({
  field: z.enum(['category', 'difficulty', 'tag']),
  value: z.union([z.string(), z.array(z.string())]),
  exclude: z.boolean().optional(),
});

export const SelectionStrategySchema = z.enum(['random', 'weighted', 'sequential', 'shuffle']);

export const ContentPoolConfigSchema = z.object({
  id: z.string().min(1, 'content pool id must not be empty'),
  name: z.string().optional(),
  sources: z.array(ContentSourceSchema).min(1, 'content pool must have at least one source'),
  selection: SelectionStrategySchema,
  noRepeat: z.boolean().optional(),
  filters: z.array(ContentFilterSchema).optional(),
  recyclable: z.boolean().optional(),
});

export type ContentPoolConfigSchemaType = z.infer<typeof ContentPoolConfigSchema>;

// ---------------------------------------------------------------------------
// ContentSection schema (top-level 'content:' block in game YAML)
// ---------------------------------------------------------------------------

export const ContentSectionSchema = z.object({
  pools: z.array(ContentPoolConfigSchema).min(1, 'content section must have at least one pool'),
});

export type ContentSection = z.infer<typeof ContentSectionSchema>;

// ---------------------------------------------------------------------------
// ContentPack schema
// ---------------------------------------------------------------------------

export const ContentPackSchema = z.object({
  id: z.string().min(1, 'ContentPack id must not be empty'),
  name: z.string().min(1, 'ContentPack name must not be empty'),
  description: z.string().optional(),
  items: z.array(ContentItemSchema).min(1, 'ContentPack must have at least one item'),
  tags: z.array(z.string()).optional(),
});

export type ContentPackSchemaType = z.infer<typeof ContentPackSchema>;

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw content section (from YAML) into a typed ContentSection.
 * Throws a ZodError on validation failure.
 */
export function parseContentSection(raw: unknown): ContentSection {
  return ContentSectionSchema.parse(raw);
}

/**
 * Safe parse — returns success/failure without throwing.
 */
export function safeParseContentSection(
  raw: unknown,
): { success: true; data: ContentSection } | { success: false; error: z.ZodError } {
  const result = ContentSectionSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
