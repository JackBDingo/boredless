/**
 * schema-integration.ts — Zod schemas for presentation declarations.
 *
 * Defines the Zod schema for the `presentation:` section of a game package.
 * Integrates with GamePackageSchema in schema-engine/schema.ts.
 *
 * Design: partial theme fields are allowed at parse time; mergeTheme() fills
 * defaults at runtime. This prevents schema rejection of common partial themes.
 */

import { z } from 'zod';
import type {
  ScreenTemplateType,
  ScreenLayout,
  ScreenComponent,
  AnimationConfig,
  ScreenDeclaration,
  GameTheme,
  PresentationConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// ScreenTemplateType
// ---------------------------------------------------------------------------

export const ScreenTemplateTypeSchema = z.enum([
  'lobby',
  'prompt',
  'vote',
  'reveal',
  'scoreboard',
  'results',
  'timer',
  'info',
  'media',
  'custom',
]) satisfies z.ZodType<ScreenTemplateType>;

// ---------------------------------------------------------------------------
// ScreenLayout
// ---------------------------------------------------------------------------

export const ScreenLayoutSchema = z.object({
  type: z.enum(['centered', 'split', 'grid', 'list', 'stack', 'fullscreen']),
  columns: z.number().int().positive().optional(),
  gap: z.string().optional(),
  padding: z.string().optional(),
}) satisfies z.ZodType<ScreenLayout>;

// ---------------------------------------------------------------------------
// ScreenComponent
// ---------------------------------------------------------------------------

export const ScreenComponentSchema = z.object({
  type: z.enum([
    'text',
    'timer',
    'player-list',
    'input',
    'image',
    'video',
    'audio',
    'score-table',
    'progress-bar',
    'button-group',
    'card',
    'grid',
  ]),
  id: z.string().optional(),
  props: z.record(z.unknown()).optional(),
  binding: z.string().optional(),
  visibility: z.enum(['all', 'active-player', 'spectators']).optional(),
  style: z.record(z.string()).optional(),
}) satisfies z.ZodType<ScreenComponent>;

// ---------------------------------------------------------------------------
// AnimationConfig
// ---------------------------------------------------------------------------

export const AnimationConfigSchema = z.object({
  enter: z.enum(['fade', 'slide-up', 'slide-left', 'zoom', 'none']).optional(),
  exit: z.enum(['fade', 'slide-down', 'slide-right', 'zoom', 'none']).optional(),
  duration: z.number().positive().optional(),
}) satisfies z.ZodType<AnimationConfig>;

// ---------------------------------------------------------------------------
// ScreenDeclaration
// ---------------------------------------------------------------------------

export const ScreenDeclarationSchema = z.object({
  id: z.string().min(1, 'Screen id must not be empty'),
  template: ScreenTemplateTypeSchema,
  surface: z.enum(['display', 'phone', 'both']),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  layout: ScreenLayoutSchema.optional(),
  components: z.array(ScreenComponentSchema).optional(),
  animations: AnimationConfigSchema.optional(),
}) satisfies z.ZodType<ScreenDeclaration>;

// ---------------------------------------------------------------------------
// GameTheme
// ---------------------------------------------------------------------------

/**
 * Theme colors schema — all required colors must be present.
 * Optional colors can be omitted.
 */
export const ThemeColorsSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  accent: z.string(),
  background: z.string(),
  surface: z.string(),
  text: z.string(),
  textSecondary: z.string().optional(),
  error: z.string().optional(),
  success: z.string().optional(),
});

export const ThemeTypographySchema = z.object({
  fontFamily: z.string().optional(),
  headingFont: z.string().optional(),
  fontSize: z.enum(['small', 'medium', 'large']).optional(),
});

export const GameThemeSchema = z.object({
  name: z.string().optional(),
  colors: ThemeColorsSchema,
  typography: ThemeTypographySchema.optional(),
  borderRadius: z.string().optional(),
  spacing: z.enum(['compact', 'normal', 'relaxed']).optional(),
  darkMode: z.boolean().optional(),
}) satisfies z.ZodType<GameTheme>;

/**
 * Partial theme schema — allows any subset of theme fields.
 * Used when parsing from game YAML where partial themes are common.
 * mergeTheme() fills in defaults at runtime.
 */
export const PartialGameThemeSchema = z.object({
  name: z.string().optional(),
  colors: ThemeColorsSchema.partial().optional(),
  typography: ThemeTypographySchema.optional(),
  borderRadius: z.string().optional(),
  spacing: z.enum(['compact', 'normal', 'relaxed']).optional(),
  darkMode: z.boolean().optional(),
});

export type PartialGameTheme = z.infer<typeof PartialGameThemeSchema>;

// ---------------------------------------------------------------------------
// PresentationConfig
// ---------------------------------------------------------------------------

export const PresentationConfigSchema = z.object({
  theme: PartialGameThemeSchema.optional(),
  screens: z.array(ScreenDeclarationSchema),
  defaultAnimations: AnimationConfigSchema.optional(),
}) satisfies z.ZodType<
  // PresentationConfig with partial theme (valid at schema layer)
  Omit<PresentationConfig, 'theme'> & { theme?: PartialGameTheme }
>;

export type PresentationConfigInput = z.infer<typeof PresentationConfigSchema>;

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

/**
 * Parses a raw presentation config from game YAML.
 *
 * Returns the parsed config or throws a ZodError with field-path details.
 */
export function parsePresentationConfig(raw: unknown): PresentationConfigInput {
  return PresentationConfigSchema.parse(raw);
}

/**
 * Safe-parses a raw presentation config from game YAML.
 *
 * Returns `{ success: true, data }` or `{ success: false, error }`.
 */
export function safeParsePresentationConfig(
  raw: unknown,
): z.SafeParseReturnType<unknown, PresentationConfigInput> {
  return PresentationConfigSchema.safeParse(raw);
}
