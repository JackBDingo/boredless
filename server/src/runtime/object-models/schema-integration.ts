/**
 * schema-integration.ts — Zod schemas for declaring game objects in game YAML.
 *
 * These schemas validate the `objects:` section of a game package.
 * They are purely structural — the runtime creates actual manager instances
 * from the parsed declarations.
 *
 * Example YAML:
 *
 *   objects:
 *     - id: main_deck
 *       type: deck
 *       items:
 *         - { id: "ace_spades", type: "card", value: { suit: "spades", rank: "A" } }
 *     - id: discard
 *       type: pool
 *     - id: game_board
 *       type: board
 *       width: 8
 *       height: 8
 */

import { z } from 'zod';
import type { GameObject } from './types.js';

// ---------------------------------------------------------------------------
// GameItem schema
// ---------------------------------------------------------------------------

export const GameItemSchema = z.object({
  id: z.string().min(1, 'item id must not be empty'),
  type: z.string().optional(),
  value: z.unknown().optional(),
  faceUp: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Object declaration schemas (per type)
// ---------------------------------------------------------------------------

export const DeckDeclarationSchema = z.object({
  id: z.string().min(1, 'deck id must not be empty'),
  type: z.literal('deck'),
  items: z.array(GameItemSchema).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const HandDeclarationSchema = z.object({
  id: z.string().min(1, 'hand id must not be empty'),
  type: z.literal('hand'),
  playerId: z.string().min(1, 'hand playerId must not be empty').optional(),
  maxSize: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const BoardDeclarationSchema = z.object({
  id: z.string().min(1, 'board id must not be empty'),
  type: z.literal('board'),
  width: z.number().int().min(1, 'board width must be at least 1'),
  height: z.number().int().min(1, 'board height must be at least 1'),
  metadata: z.record(z.unknown()).optional(),
});

export const PoolDeclarationSchema = z.object({
  id: z.string().min(1, 'pool id must not be empty'),
  type: z.literal('pool'),
  items: z.array(GameItemSchema).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const TileDeclarationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('tile'),
  metadata: z.record(z.unknown()).optional(),
});

export const TokenDeclarationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('token'),
  metadata: z.record(z.unknown()).optional(),
});

export const CustomDeclarationSchema = z.object({
  id: z.string().min(1),
  type: z.literal('custom'),
  metadata: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Union schema for any object declaration
// ---------------------------------------------------------------------------

export const ObjectDeclarationSchema = z.discriminatedUnion('type', [
  DeckDeclarationSchema,
  HandDeclarationSchema,
  BoardDeclarationSchema,
  PoolDeclarationSchema,
  TileDeclarationSchema,
  TokenDeclarationSchema,
  CustomDeclarationSchema,
]);

export type ObjectDeclaration = z.infer<typeof ObjectDeclarationSchema>;

// ---------------------------------------------------------------------------
// Array schema — for the full objects: section
// ---------------------------------------------------------------------------

export const ObjectsArraySchema = z.array(ObjectDeclarationSchema);

// ---------------------------------------------------------------------------
// parseGameObjects — validate and parse the objects: section from a game YAML
// ---------------------------------------------------------------------------

/**
 * Parse and validate an array of object declarations from a game package.
 *
 * @param raw - The raw `objects:` array from a parsed YAML/JSON game package
 * @returns Array of validated object declarations
 * @throws ZodError if any declaration is invalid
 */
export function parseGameObjects(raw: unknown[]): GameObject[] {
  const parsed = ObjectsArraySchema.parse(raw);
  // Zod output matches the GameObject interface (id + type + optional metadata)
  return parsed as unknown as GameObject[];
}

/**
 * Safely parse object declarations, returning success/error result.
 * Does not throw — suitable for validation reporting.
 */
export function safeParseGameObjects(raw: unknown): z.SafeParseReturnType<unknown, ObjectDeclaration[]> {
  return ObjectsArraySchema.safeParse(raw);
}
