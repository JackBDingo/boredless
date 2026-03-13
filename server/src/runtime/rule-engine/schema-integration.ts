/**
 * schema-integration.ts — Zod schemas for rule declarations in game YAML packages.
 *
 * These schemas validate the `rules` section of a V2 game package.
 * The GamePackageSchema in schema-engine/schema.ts imports RulesArraySchema
 * to replace the `z.array(z.any())` stub.
 *
 * Usage:
 *   import { RulesArraySchema, parseRules } from '../rule-engine/index.js';
 *   const rules = parseRules(rawYamlData.rules);
 */

import { z } from 'zod';
import type { RuleDeclaration } from './types.js';

// ---------------------------------------------------------------------------
// Condition schemas
// ---------------------------------------------------------------------------

const ComparisonOperatorSchema = z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains', 'in']);

const ComparisonConditionSchema = z.object({
  type: z.literal('comparison'),
  left: z.union([z.string(), z.number()]),
  operator: ComparisonOperatorSchema,
  right: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});

// Forward-declare for recursive type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RuleConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion('type', [
    ComparisonConditionSchema,
    z.object({
      type: z.enum(['and', 'or', 'not']),
      conditions: z.array(RuleConditionSchema).min(1),
    }),
    z.object({
      type: z.literal('expression'),
      expr: z.string().min(1, 'Expression must not be empty'),
    }),
    z.object({
      type: z.literal('builtin'),
      rule: z.string().min(1, 'Built-in rule name must not be empty'),
      params: z.record(z.unknown()).optional(),
    }),
  ]),
);

export { RuleConditionSchema };

// ---------------------------------------------------------------------------
// Action schemas
// ---------------------------------------------------------------------------

const SetStateActionSchema = z.object({
  type: z.literal('set'),
  path: z.string().min(1),
  value: z.unknown(),
});

const EmitEventActionSchema = z.object({
  type: z.literal('emit'),
  event: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

const TransitionActionSchema = z.object({
  type: z.literal('transition'),
  to: z.string().min(1),
});

const IncrementActionSchema = z.object({
  type: z.literal('increment'),
  path: z.string().min(1),
  amount: z.union([z.number(), z.string()]).optional(),
});

const CustomActionSchema = z.object({
  type: z.literal('custom'),
  handler: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export const RuleActionSchema = z.discriminatedUnion('type', [
  SetStateActionSchema,
  EmitEventActionSchema,
  TransitionActionSchema,
  IncrementActionSchema,
  CustomActionSchema,
]);

// ---------------------------------------------------------------------------
// RuleDeclarationSchema
// ---------------------------------------------------------------------------

export const RuleDeclarationSchema = z.object({
  id: z.string().min(1, 'Rule id must not be empty'),
  name: z.string().optional(),
  description: z.string().optional(),
  when: RuleConditionSchema,
  then: z.array(RuleActionSchema).min(1, 'At least one "then" action is required'),
  else: z.array(RuleActionSchema).optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// RulesArraySchema
// ---------------------------------------------------------------------------

export const RulesArraySchema = z.array(RuleDeclarationSchema);

// ---------------------------------------------------------------------------
// Parse utilities
// ---------------------------------------------------------------------------

/**
 * Parse and validate an array of raw rule declarations from game YAML.
 *
 * @param data - Raw (unknown) data from YAML parsing
 * @returns Array of validated RuleDeclaration objects
 * @throws ZodError if validation fails
 */
export function parseRules(data: unknown): RuleDeclaration[] {
  return RulesArraySchema.parse(data) as RuleDeclaration[];
}

/**
 * Safely parse rule declarations — returns success/failure without throwing.
 *
 * @param data - Raw (unknown) data from YAML parsing
 * @returns Zod SafeParseReturnType
 */
export function safeParseRules(data: unknown) {
  return RulesArraySchema.safeParse(data);
}
