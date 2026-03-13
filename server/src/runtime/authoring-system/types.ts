/**
 * types.ts — Type definitions for the AI Authoring Foundation subsystem.
 *
 * These types describe the data structures used for:
 * - Game package introspection (what does this game use?)
 * - Game package validation (is this game package correct?)
 * - Game templates (scaffold new games quickly)
 * - Capability documentation (what can the V2 runtime do?)
 *
 * Subsystem: authoring-system
 * Phase: 4.4
 *
 * DESIGN CONTRACT:
 * - No imports from runtime code — this reads game YAML data only
 * - All types are plain data structures (no classes, no runtime behavior)
 * - Suitable for serialization and LLM consumption
 */

// ---------------------------------------------------------------------------
// Introspection Result
// ---------------------------------------------------------------------------

/**
 * Complete introspection of a game package.
 * Returned by introspect() — summarizes all subsystems used by a game.
 */
export interface GameIntrospection {
  id: string;
  name: string;
  version?: string;
  subsystems: {
    phases: PhaseInfo[];
    interactions: InteractionInfo[];
    contentSources: ContentSourceInfo[];
    scoreTracks: ScoreTrackInfo[];
    rules: RuleInfo[];
    extensions: ExtensionInfo[];
    screens: ScreenInfo[];
    assets: AssetInfo[];
  };
  validation: ValidationResult;
  complexity: ComplexityScore;
}

/** Summary info about a single phase in the game. */
export interface PhaseInfo {
  id: string;
  type: string;
  hasTimer: boolean;
  transitions: string[];
}

/** Summary info about an interaction used in a phase. */
export interface InteractionInfo {
  type: string;
  phase: string;
  surface: string;
}

/** Summary info about a content source/pool. */
export interface ContentSourceInfo {
  type: string;
  count?: number;
}

/** Summary info about a score track. */
export interface ScoreTrackInfo {
  id: string;
  name: string;
  direction: string;
}

/** Summary info about a rule declaration. */
export interface RuleInfo {
  id: string;
  name?: string;
  conditionType: string;
  actionTypes: string[];
}

/** Summary info about a registered extension. */
export interface ExtensionInfo {
  id: string;
  name: string;
  type: string;
}

/** Summary info about a presentation screen. */
export interface ScreenInfo {
  id: string;
  template: string;
  surface: string;
}

/** Summary info about a declared asset. */
export interface AssetInfo {
  id: string;
  type: string;
  preload: boolean;
}

// ---------------------------------------------------------------------------
// Validation Result
// ---------------------------------------------------------------------------

/** Result of deep game package validation. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/** A hard error that makes the package unplayable. */
export interface ValidationError {
  path: string;
  message: string;
  severity: 'error';
}

/** A warning that does not block play but indicates a potential issue. */
export interface ValidationWarning {
  path: string;
  message: string;
  severity: 'warning';
}

// ---------------------------------------------------------------------------
// Complexity Score
// ---------------------------------------------------------------------------

/**
 * A complexity rating for a game package.
 * Helps AI understand how difficult a game is to generate/modify.
 */
export interface ComplexityScore {
  /** Overall complexity tier */
  overall: 'simple' | 'moderate' | 'complex' | 'advanced';
  phaseCount: number;
  ruleCount: number;
  extensionCount: number;
  hasCustomExtensions: boolean;
  hasMultipleScoreTracks: boolean;
  hasTimers: boolean;
  /** Rough estimate in minutes for a developer to set up this game */
  estimatedSetupMinutes: number;
}

// ---------------------------------------------------------------------------
// Game Templates
// ---------------------------------------------------------------------------

/**
 * The supported template types for scaffolding new games.
 */
export type GameTemplateType =
  | 'party'
  | 'trivia'
  | 'card'
  | 'board'
  | 'hidden-role'
  | 'drawing'
  | 'word'
  | 'minimal';

/**
 * A complete game template scaffold — includes the full game.yaml structure
 * plus any supplemental files (README, prompts.json, etc.)
 */
export interface GameTemplate {
  type: GameTemplateType;
  name: string;
  description: string;
  /** Complete game.yaml content as a parsed object */
  schema: Record<string, unknown>;
  /** Additional files to generate alongside game.yaml */
  files: TemplateFile[];
  /** Extension types that would enhance this template */
  suggestedExtensions?: string[];
  complexity: ComplexityScore;
}

/** A supplemental file generated as part of a template. */
export interface TemplateFile {
  path: string;
  content: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Capability Documentation
// ---------------------------------------------------------------------------

/**
 * Documentation for a single runtime capability.
 * Used by generateSchemaReference() and as LLM context for game generation.
 */
export interface CapabilityDoc {
  name: string;
  category:
    | 'interaction'
    | 'phase'
    | 'content'
    | 'scoring'
    | 'rule'
    | 'presentation'
    | 'extension'
    | 'asset';
  description: string;
  /** A working YAML snippet showing how to use this capability */
  yamlExample: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
}
