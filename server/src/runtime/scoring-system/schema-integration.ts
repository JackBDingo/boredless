/**
 * schema-integration.ts — Zod schemas for the scoring section in game YAML.
 *
 * These schemas validate the `scoring` block in a V2 game package.
 * They extend the existing GamePackageSchema in schema-engine.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// ScoreTrack schema
// ---------------------------------------------------------------------------

export const ScoreTrackDisplaySchema = z.object({
  format: z.enum(['number', 'currency', 'percentage']).optional(),
  suffix: z.string().optional(),
  icon: z.string().optional(),
});

export const ScoreTrackSchema = z.object({
  id: z.string().min(1, 'Track id must not be empty'),
  name: z.string().min(1, 'Track name must not be empty'),
  initial: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  direction: z.enum(['higher-better', 'lower-better']),
  display: ScoreTrackDisplaySchema.optional(),
});

// ---------------------------------------------------------------------------
// ScoringFormula schemas
// ---------------------------------------------------------------------------

export const FixedFormulaSchema = z.object({
  type: z.literal('fixed'),
  amount: z.number(),
});

export const ExpressionFormulaSchema = z.object({
  type: z.literal('expression'),
  expr: z.string().min(1, 'Expression must not be empty'),
});

export const MultiplierFormulaSchema = z.object({
  type: z.literal('multiplier'),
  base: z.number(),
  multiplier: z.string().min(1, 'Multiplier field name must not be empty'),
});

export const LookupFormulaSchema = z.object({
  type: z.literal('lookup'),
  key: z.string().min(1, 'Lookup key field must not be empty'),
  table: z.record(z.number()),
});

export const ScoringFormulaSchema = z.discriminatedUnion('type', [
  FixedFormulaSchema,
  ExpressionFormulaSchema,
  MultiplierFormulaSchema,
  LookupFormulaSchema,
]);

// ---------------------------------------------------------------------------
// ScoringCondition schema
// ---------------------------------------------------------------------------

export const ScoringConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=']),
  value: z.unknown(),
});

// ---------------------------------------------------------------------------
// ScoringRule schema
// ---------------------------------------------------------------------------

export const ScoringRuleSchema = z.object({
  id: z.string().min(1, 'Rule id must not be empty'),
  name: z.string().optional(),
  track: z.string().min(1, 'Rule must reference a track'),
  trigger: z.enum(['manual', 'event']),
  eventType: z.string().optional(),
  targets: z.enum(['active-player', 'all-players', 'specific']),
  targetPlayerId: z.string().optional(),
  formula: ScoringFormulaSchema,
  conditions: z.array(ScoringConditionSchema).optional(),
});

// ---------------------------------------------------------------------------
// VictoryCondition schemas
// ---------------------------------------------------------------------------

export const HighestScoreVictorySchema = z.object({
  type: z.literal('highest_score'),
  track: z.string().min(1),
});

export const TargetScoreVictorySchema = z.object({
  type: z.literal('target_score'),
  track: z.string().min(1),
  target: z.number(),
});

export const LastStandingVictorySchema = z.object({
  type: z.literal('last_standing'),
  eliminationTrack: z.string().optional(),
});

export const RoundLimitVictorySchema = z.object({
  type: z.literal('round_limit'),
  maxRounds: z.number().int().positive(),
  thenBy: z.enum(['highest_score', 'lowest_score']),
  track: z.string().min(1),
});

export const CustomVictorySchema = z.object({
  type: z.literal('custom'),
  expression: z.string().min(1),
});

export const VictoryConditionSchema = z.discriminatedUnion('type', [
  HighestScoreVictorySchema,
  TargetScoreVictorySchema,
  LastStandingVictorySchema,
  RoundLimitVictorySchema,
  CustomVictorySchema,
]);

// ---------------------------------------------------------------------------
// TiebreakRule schema
// ---------------------------------------------------------------------------

export const TiebreakRuleSchema = z.object({
  method: z.enum(['none', 'secondary_track', 'most_recent_gain', 'sudden_death', 'random']),
  track: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Full ScoringConfig schema
// ---------------------------------------------------------------------------

export const ScoringConfigSchema = z.object({
  tracks: z.array(ScoreTrackSchema).min(1, 'At least one score track is required'),
  rules: z.array(ScoringRuleSchema),
  victory: VictoryConditionSchema,
  tiebreak: TiebreakRuleSchema.optional(),
});

export type ScoringConfigInput = z.input<typeof ScoringConfigSchema>;
export type ScoringConfigOutput = z.output<typeof ScoringConfigSchema>;
