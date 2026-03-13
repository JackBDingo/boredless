/**
 * schema.ts — Zod schema definition for a V2 Game Package.
 *
 * This defines the full GamePackageSchema, which evolves from the existing
 * ManifestSchema in server/src/games/manifest-schema.ts. V1 games continue
 * to use ManifestSchema unchanged; V2 games use GamePackageSchema.
 */

import { z } from 'zod';
import { EventRulesArraySchema } from '../event-system/schema-integration.js';
import { ContentSectionSchema } from '../content-system/schema-integration.js';
import { AssetManifestSchema } from '../asset-system/schema-integration.js';
import { PresentationConfigSchema } from '../presentation-system/schema-integration.js';
import { RulesArraySchema } from '../rule-engine/schema-integration.js';
import { ExtensionsArraySchema } from '../extension-system/schema-integration.js';

// ---------------------------------------------------------------------------
// schema_version
// ---------------------------------------------------------------------------

export const SchemaVersionSchema = z.literal('2.0');

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

export const ManifestV2Schema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be lowercase alphanumeric with hyphens'),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  players: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
  }),
  estimated_minutes: z
    .object({
      min: z.number().positive(),
      max: z.number().positive(),
    })
    .optional(),
  icon: z.string().optional(),
  accent_color: z.string().optional(),
  categories: z.array(z.string()).optional(),
});

export type ManifestV2 = z.infer<typeof ManifestV2Schema>;

// ---------------------------------------------------------------------------
// state_model
// ---------------------------------------------------------------------------

export const StateFieldTypeSchema = z.enum([
  'integer',
  'float',
  'string',
  'boolean',
  'content_ref',
  'array',
  'object',
  'null',
]);

export const VisibilityScopeSchema = z.enum([
  'public',
  'private',
  'team',
  'host',
  'spectator',
]);

export const RedactionStrategySchema = z.enum([
  'omit',
  'null',
  'placeholder',
  'count',
]);

export const StateFieldSchema = z.object({
  type: StateFieldTypeSchema,
  default: z.unknown(),
  visibility: VisibilityScopeSchema.optional(),
  /** How the field should appear when redacted (default: omit). */
  redaction: RedactionStrategySchema.optional(),
  /** Placeholder value shown when redaction === 'placeholder'. */
  placeholder: z.unknown().optional(),
});

export type StateField = z.infer<typeof StateFieldSchema>;

export const StateModelSchema = z.object({
  globals: z.record(StateFieldSchema).optional(),
  per_player: z.record(StateFieldSchema).optional(),
  per_team: z.record(StateFieldSchema).optional(),
});

export type StateModel = z.infer<typeof StateModelSchema>;

// ---------------------------------------------------------------------------
// phases
// ---------------------------------------------------------------------------

export const PhaseTypeSchema = z.enum([
  'timed',
  'input_gate',
  'conditional',
  'loop',
]);

export const PhaseActionSchema = z
  .object({
    action: z.string(),
    to: z.string().optional(),
  })
  .catchall(z.unknown());

export type PhaseAction = z.infer<typeof PhaseActionSchema>;

export const PhaseInputSchema = z.object({
  primitive: z.string(),
  target: z.string().optional(),
  required: z.union([z.string(), z.array(z.string())]).optional(),
  options: z.unknown().optional(),
});

export type PhaseInput = z.infer<typeof PhaseInputSchema>;

export const PhaseScreensSchema = z.object({
  display: z.string().optional(),
  phone: z.string().optional(),
  spectator: z.string().optional(),
});

export type PhaseScreens = z.infer<typeof PhaseScreensSchema>;

export const PhaseNodeSchema = z.object({
  type: PhaseTypeSchema,
  duration: z.union([z.number().positive(), z.string()]).optional(),
  on_enter: z.array(PhaseActionSchema).optional(),
  on_exit: z.array(PhaseActionSchema).optional(),
  on_complete: z.array(PhaseActionSchema).optional(),
  input: PhaseInputSchema.optional(),
  screen: PhaseScreensSchema.optional(),
  condition: z.string().optional(),
});

export type PhaseNode = z.infer<typeof PhaseNodeSchema>;

export const PhasesSchema = z.record(PhaseNodeSchema);

export type Phases = z.infer<typeof PhasesSchema>;

// ---------------------------------------------------------------------------
// turn_model
// ---------------------------------------------------------------------------

export const TurnModelTypeSchema = z.enum([
  'simultaneous',
  'round_robin',
  'priority_queue',
]);

export const TurnModelSchema = z.object({
  type: TurnModelTypeSchema,
  config: z.record(z.unknown()).optional(),
});

export type TurnModel = z.infer<typeof TurnModelSchema>;

// ---------------------------------------------------------------------------
// presentation
// ---------------------------------------------------------------------------

// PresentationSchema is now provided by the presentation-system subsystem.
// It supports full screen declarations, per-game themes, and animations.
// The old ThemeSchema stub is preserved as an alias for backward compatibility.
export const PresentationSchema = PresentationConfigSchema;

export type Presentation = z.infer<typeof PresentationSchema>;

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------

/**
 * Legacy V1 scoring schema: simple key → points map.
 * Kept for backward compat with existing V1 game packages.
 */
export const ScoringSchema = z.record(z.number());

export type Scoring = z.infer<typeof ScoringSchema>;

/**
 * V2 declarative scoring schema — imported from scoring-system subsystem.
 * Supports multiple score tracks, formula-based rules, and victory conditions.
 * Game packages can use either the V1 legacy format or the V2 declarative format.
 */
export { ScoringConfigSchema } from '../scoring-system/schema-integration.js';

// ---------------------------------------------------------------------------
// victory
// ---------------------------------------------------------------------------

export const VictoryTypeSchema = z.enum([
  'highest_score',
  'target_score',
  'last_standing',
  'team_objective',
  'faction_parity',
  'board_objective',
  'narrative_endpoint',
  'multi_condition',
]);

export const VictorySchema = z.object({
  type: VictoryTypeSchema,
  after: z.union([z.number().int().positive(), z.literal('all_rounds')]).optional(),
  target: z.number().optional(),
  tiebreak: z.string().optional(),
});

export type Victory = z.infer<typeof VictorySchema>;

// ---------------------------------------------------------------------------
// Optional domain stubs
// ---------------------------------------------------------------------------

export const ContentSchema = ContentSectionSchema;
export const EventsSchema = EventRulesArraySchema;
export const RolesSchema = z.record(z.any());
export const TeamsSchema = z.record(z.any());
export const ObjectsSchema = z.record(z.any());
export const RulesSchema = RulesArraySchema;
/**
 * V2 extensions schema — array of extension declarations.
 * Replaces the old stub with the typed ExtensionsArraySchema from extension-system.
 */
export const ExtensionsSchema = ExtensionsArraySchema.optional();
export const AuthoringSchema = z.record(z.any());
export const AssetsSchema = AssetManifestSchema;

// ---------------------------------------------------------------------------
// GamePackageSchema — top-level V2 game package
// ---------------------------------------------------------------------------

export const GamePackageSchema = z.object({
  // --- Required ---
  schema_version: SchemaVersionSchema,
  manifest: ManifestV2Schema,
  state_model: StateModelSchema,
  phases: PhasesSchema,
  turn_model: TurnModelSchema,
  presentation: PresentationSchema.optional(),
  // Legacy V1 format: { correct_answer: 100 } OR V2 format: { tracks: [...], rules: [...], ... }
  // Using z.unknown() here to accept both formats; consumers should validate with ScoringConfigSchema
  scoring: z.unknown().optional(),
  victory: VictorySchema,

  // --- Optional (stubs) ---
  content: ContentSchema.optional(),
  events: EventsSchema.optional(),
  roles: RolesSchema.optional(),
  teams: TeamsSchema.optional(),
  objects: ObjectsSchema.optional(),
  rules: RulesSchema.optional(),
  extensions: ExtensionsSchema.optional(),
  assets: AssetsSchema.optional(),
  authoring: AuthoringSchema.optional(),
});

export type GamePackage = z.infer<typeof GamePackageSchema>;
