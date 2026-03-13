/**
 * index.ts — Public API for the Authoring System subsystem.
 *
 * The Authoring System is the Phase 4.4 AI Authoring Foundation.
 * It provides:
 * - Game package introspection (what does this game use?)
 * - Deep validation (is this game correct?)
 * - Template scaffolding (start a new game quickly)
 * - Capability documentation (what can the runtime do?)
 *
 * Design constraints:
 * - NO imports from runtime subsystems (pure data layer)
 * - All functions are pure — no side effects
 * - Suitable for use in CLI tools, LLM pipelines, and developer tooling
 *
 * Subsystem: authoring-system
 * Phase: 4.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  GameIntrospection,
  PhaseInfo,
  InteractionInfo,
  ContentSourceInfo,
  ScoreTrackInfo,
  RuleInfo,
  ExtensionInfo,
  ScreenInfo,
  AssetInfo,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ComplexityScore,
  GameTemplateType,
  GameTemplate,
  TemplateFile,
  CapabilityDoc,
} from './types.js';

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

export { introspect, calculateComplexity } from './introspector.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export { validateGamePackage } from './validator.js';

// ---------------------------------------------------------------------------
// Template library
// ---------------------------------------------------------------------------

export { getTemplate, getAvailableTemplates } from './template-library.js';

// ---------------------------------------------------------------------------
// Capability documentation
// ---------------------------------------------------------------------------

export {
  getCapabilityDocs,
  getCapabilityDoc,
  generateSchemaReference,
} from './capability-docs.js';
