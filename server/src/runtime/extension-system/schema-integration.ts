/**
 * schema-integration.ts — Zod schemas for extension declarations in game YAML.
 *
 * Defines the `extensions:` section of a V2 game package schema.
 * Extensions declare their identity and type in the YAML; the actual
 * capability implementations (evaluate functions, etc.) are registered
 * separately at runtime.
 *
 * Example game.yaml:
 * ```yaml
 * extensions:
 *   - id: dictionary-validator
 *     name: "Dictionary Validator"
 *     type: rule
 *     description: "Validates words against a dictionary"
 *
 *   - id: word-board
 *     name: "Word Board Renderer"
 *     type: renderer
 *     description: "Custom board renderer for word games"
 *
 *   - id: drawing-canvas
 *     name: "Drawing Canvas"
 *     type: interaction
 *     description: "Freeform drawing widget for phone"
 * ```
 *
 * Subsystem: extension-system
 * Phase: 4.2
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Extension Declaration Schema
// ---------------------------------------------------------------------------

/** Valid extension types. */
export const ExtensionTypeSchema = z.enum([
  'renderer',
  'rule',
  'interaction',
  'lifecycle',
  'composite',
]);

/**
 * Zod schema for a single extension declaration in game YAML.
 */
export const ExtensionDeclarationSchema = z.object({
  id: z.string().min(1, 'Extension id must not be empty'),
  name: z.string().min(1, 'Extension name must not be empty'),
  version: z.string().optional(),
  description: z.string().optional(),
  type: ExtensionTypeSchema,
  entryPoint: z.string().optional(),
});

export type ExtensionDeclarationInput = z.input<typeof ExtensionDeclarationSchema>;
export type ExtensionDeclarationOutput = z.output<typeof ExtensionDeclarationSchema>;

/**
 * Zod schema for an array of extension declarations (the `extensions:` section).
 */
export const ExtensionsArraySchema = z.array(ExtensionDeclarationSchema);

export type ExtensionsArrayInput = z.input<typeof ExtensionsArraySchema>;
export type ExtensionsArrayOutput = z.output<typeof ExtensionsArraySchema>;

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parse an extensions array from game YAML.
 * Throws ZodError on validation failure.
 */
export function parseExtensions(data: unknown): ExtensionsArrayOutput {
  return ExtensionsArraySchema.parse(data);
}

/**
 * Safely parse an extensions array from game YAML.
 * Returns { success: true, data } or { success: false, error }.
 */
export function safeParseExtensions(data: unknown): z.SafeParseReturnType<
  ExtensionsArrayInput,
  ExtensionsArrayOutput
> {
  return ExtensionsArraySchema.safeParse(data);
}
