/**
 * introspector.ts — Game package introspection for the Authoring System.
 *
 * Analyzes a parsed game.yaml and extracts structured information about
 * all subsystems used by the game package.
 *
 * Design:
 * - Pure functions — no side effects
 * - No imports from runtime subsystems (reads raw YAML data only)
 * - Returns structured data suitable for LLM consumption
 *
 * Subsystem: authoring-system
 * Phase: 4.4
 */

import type {
  GameIntrospection,
  PhaseInfo,
  InteractionInfo,
  ContentSourceInfo,
  ScoreTrackInfo,
  RuleInfo,
  ExtensionInfo,
  ScreenInfo,
  AssetInfo,
  ComplexityScore,
  ValidationResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Main introspection entry point
// ---------------------------------------------------------------------------

/**
 * Introspect a parsed game.yaml and return structured metadata about the game.
 * The gamePackage should be a raw parsed object (e.g. from js-yaml / yaml npm package).
 */
export function introspect(gamePackage: Record<string, unknown>): GameIntrospection {
  const manifest = (gamePackage.manifest ?? {}) as Record<string, unknown>;
  const id = typeof manifest.id === 'string' ? manifest.id : 'unknown';
  const name = typeof manifest.name === 'string' ? manifest.name : 'Unknown Game';
  const version = typeof manifest.version === 'string' ? manifest.version : undefined;

  const phases = extractPhases(gamePackage);
  const interactions = extractInteractions(gamePackage);
  const contentSources = extractContentSources(gamePackage);
  const scoreTracks = extractScoreTracks(gamePackage);
  const rules = extractRules(gamePackage);
  const extensions = extractExtensions(gamePackage);
  const screens = extractScreens(gamePackage);
  const assets = extractAssets(gamePackage);

  const partialIntrospection = {
    id,
    name,
    version,
    subsystems: {
      phases,
      interactions,
      contentSources,
      scoreTracks,
      rules,
      extensions,
      screens,
      assets,
    },
  };

  const complexity = calculateComplexity(partialIntrospection);

  // Run inline validation for the introspection result
  // (full deep validation is in validator.ts)
  const validation: ValidationResult = { valid: true, errors: [], warnings: [] };

  return {
    ...partialIntrospection,
    validation,
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Phase extraction
// ---------------------------------------------------------------------------

function extractPhases(pkg: Record<string, unknown>): PhaseInfo[] {
  const phases = pkg.phases as Record<string, unknown> | undefined;
  if (!phases || typeof phases !== 'object') return [];

  return Object.entries(phases).map(([id, node]) => {
    const phase = (node ?? {}) as Record<string, unknown>;
    const type = typeof phase.type === 'string' ? phase.type : 'timed';
    const hasTimer = phase.duration != null;

    // Collect transition targets from on_exit and on_complete actions
    const transitions = new Set<string>();
    for (const hookKey of ['on_exit', 'on_complete', 'on_enter'] as const) {
      const actions = phase[hookKey];
      if (Array.isArray(actions)) {
        for (const action of actions) {
          const a = action as Record<string, unknown>;
          if (typeof a.to === 'string') transitions.add(a.to);
          if (typeof a.advance_to === 'string') transitions.add(a.advance_to);
          // Handle conditional then/else
          const then_ = a.then as Record<string, unknown> | undefined;
          const else_ = a.else as Record<string, unknown> | undefined;
          if (then_ && typeof then_.advance_to === 'string') transitions.add(then_.advance_to);
          if (else_ && typeof else_.advance_to === 'string') transitions.add(else_.advance_to);
        }
      }
    }

    return { id, type, hasTimer, transitions: Array.from(transitions) };
  });
}

// ---------------------------------------------------------------------------
// Interaction extraction
// ---------------------------------------------------------------------------

function extractInteractions(pkg: Record<string, unknown>): InteractionInfo[] {
  const phases = pkg.phases as Record<string, unknown> | undefined;
  if (!phases || typeof phases !== 'object') return [];

  const interactions: InteractionInfo[] = [];

  for (const [phaseId, node] of Object.entries(phases)) {
    const phase = (node ?? {}) as Record<string, unknown>;
    const input = phase.input as Record<string, unknown> | undefined;
    if (!input) continue;

    const type = typeof input.primitive === 'string' ? input.primitive : 'unknown';
    const screen = phase.screen as Record<string, unknown> | undefined;

    // Determine which surfaces this interaction appears on
    const surfaces: string[] = [];
    if (screen?.phone) surfaces.push('phone');
    if (screen?.display) surfaces.push('display');
    if (surfaces.length === 0) surfaces.push('phone'); // default

    interactions.push({
      type,
      phase: phaseId,
      surface: surfaces.join(','),
    });
  }

  return interactions;
}

// ---------------------------------------------------------------------------
// Content source extraction
// ---------------------------------------------------------------------------

function extractContentSources(pkg: Record<string, unknown>): ContentSourceInfo[] {
  const content = pkg.content as Record<string, unknown> | undefined;
  if (!content) return [];

  // New content format: { pools: [...] }
  if (Array.isArray(content.pools)) {
    return content.pools.map((pool: unknown) => {
      const p = (pool ?? {}) as Record<string, unknown>;
      const sources = Array.isArray(p.sources) ? p.sources : [];
      // Pick the type from the first source, or use 'pool'
      const firstSource = sources[0] as Record<string, unknown> | undefined;
      const type =
        typeof firstSource?.type === 'string' ? firstSource.type : 'pool';
      const inlineItems = sources
        .flatMap((s: unknown) => {
          const src = s as Record<string, unknown>;
          return Array.isArray(src.items) ? src.items : [];
        });
      return { type, count: inlineItems.length || undefined };
    });
  }

  // Legacy content format: { prompts: { type: 'prompt_pool', ... } }
  const sources: ContentSourceInfo[] = [];
  for (const [, value] of Object.entries(content)) {
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      const type = typeof v.type === 'string' ? v.type : 'unknown';
      sources.push({ type });
    }
  }
  return sources;
}

// ---------------------------------------------------------------------------
// Score track extraction
// ---------------------------------------------------------------------------

function extractScoreTracks(pkg: Record<string, unknown>): ScoreTrackInfo[] {
  const scoring = pkg.scoring as Record<string, unknown> | undefined;
  if (!scoring) return [];

  // V2 declarative scoring with tracks
  if (Array.isArray(scoring.tracks)) {
    return scoring.tracks.map((track: unknown) => {
      const t = (track ?? {}) as Record<string, unknown>;
      return {
        id: typeof t.id === 'string' ? t.id : 'unknown',
        name: typeof t.name === 'string' ? t.name : '',
        direction: typeof t.direction === 'string' ? t.direction : 'higher-better',
      };
    });
  }

  // Legacy V1 scoring format: { correct_answer: 100 } — infer a single "score" track
  const hasLegacyScoring = Object.keys(scoring).some(
    (k) => typeof scoring[k] === 'number',
  );
  if (hasLegacyScoring) {
    return [{ id: 'score', name: 'Score', direction: 'higher-better' }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Rule extraction
// ---------------------------------------------------------------------------

function extractRules(pkg: Record<string, unknown>): RuleInfo[] {
  const rules = pkg.rules;
  if (!Array.isArray(rules)) return [];

  return rules.map((rule: unknown) => {
    const r = (rule ?? {}) as Record<string, unknown>;
    const when = (r.when ?? {}) as Record<string, unknown>;
    const conditionType = typeof when.type === 'string' ? when.type : 'unknown';
    const then = Array.isArray(r.then) ? r.then : [];
    const actionTypes = then
      .map((a: unknown) => {
        const action = a as Record<string, unknown>;
        return typeof action.type === 'string' ? action.type : 'unknown';
      })
      .filter((t): t is string => t !== 'unknown' || true);

    return {
      id: typeof r.id === 'string' ? r.id : 'unknown',
      name: typeof r.name === 'string' ? r.name : undefined,
      conditionType,
      actionTypes,
    };
  });
}

// ---------------------------------------------------------------------------
// Extension extraction
// ---------------------------------------------------------------------------

function extractExtensions(pkg: Record<string, unknown>): ExtensionInfo[] {
  const extensions = pkg.extensions as Record<string, unknown> | undefined;
  if (!extensions) return [];

  const result: ExtensionInfo[] = [];

  for (const [extType, extGroup] of Object.entries(extensions)) {
    if (typeof extGroup === 'object' && extGroup !== null) {
      for (const [extId, extDef] of Object.entries(extGroup as Record<string, unknown>)) {
        const def = (extDef ?? {}) as Record<string, unknown>;
        result.push({
          id: extId,
          name: typeof def.name === 'string' ? def.name : extId,
          type: extType,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Screen extraction
// ---------------------------------------------------------------------------

function extractScreens(pkg: Record<string, unknown>): ScreenInfo[] {
  const presentation = pkg.presentation as Record<string, unknown> | undefined;
  if (!presentation) return [];

  const screens = presentation.screens;
  if (!Array.isArray(screens)) return [];

  return screens.map((screen: unknown) => {
    const s = (screen ?? {}) as Record<string, unknown>;
    return {
      id: typeof s.id === 'string' ? s.id : 'unknown',
      template: typeof s.template === 'string' ? s.template : 'unknown',
      surface: typeof s.surface === 'string' ? s.surface : 'both',
    };
  });
}

// ---------------------------------------------------------------------------
// Asset extraction
// ---------------------------------------------------------------------------

function extractAssets(pkg: Record<string, unknown>): AssetInfo[] {
  const assets = pkg.assets as Record<string, unknown> | undefined;
  if (!assets) return [];

  const declarations = Array.isArray(assets.declarations)
    ? assets.declarations
    : Array.isArray(assets)
    ? assets
    : [];

  return declarations.map((asset: unknown) => {
    const a = (asset ?? {}) as Record<string, unknown>;
    return {
      id: typeof a.id === 'string' ? a.id : 'unknown',
      type: typeof a.type === 'string' ? a.type : 'unknown',
      preload: a.preload === true,
    };
  });
}

// ---------------------------------------------------------------------------
// Complexity calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a complexity score for a game from its partial introspection data.
 *
 * Tiers:
 *   simple:   ≤3 phases, ≤2 rules, no extensions
 *   moderate: ≤6 phases, ≤5 rules, ≤1 extension
 *   complex:  ≤10 phases, ≤10 rules, ≤3 extensions
 *   advanced: anything beyond complex
 */
export function calculateComplexity(
  introspection: Partial<GameIntrospection>,
): ComplexityScore {
  const subsystems = introspection.subsystems ?? {
    phases: [],
    interactions: [],
    contentSources: [],
    scoreTracks: [],
    rules: [],
    extensions: [],
    screens: [],
    assets: [],
  };

  const phaseCount = subsystems.phases?.length ?? 0;
  const ruleCount = subsystems.rules?.length ?? 0;
  const extensionCount = subsystems.extensions?.length ?? 0;
  const scoreTrackCount = subsystems.scoreTracks?.length ?? 0;

  const hasCustomExtensions =
    (subsystems.extensions?.some((e) => e.type === 'renderers') ?? false) ||
    extensionCount > 0;

  const hasMultipleScoreTracks = scoreTrackCount > 1;

  const hasTimers =
    subsystems.phases?.some((p) => p.hasTimer) ?? false;

  // Determine overall tier
  let overall: ComplexityScore['overall'];
  if (phaseCount <= 3 && ruleCount <= 2 && extensionCount === 0) {
    overall = 'simple';
  } else if (phaseCount <= 6 && ruleCount <= 5 && extensionCount <= 1) {
    overall = 'moderate';
  } else if (phaseCount <= 10 && ruleCount <= 10 && extensionCount <= 3) {
    overall = 'complex';
  } else {
    overall = 'advanced';
  }

  // Estimate setup minutes based on complexity
  const estimatedSetupMinutes = Math.min(
    30,
    Math.max(
      1,
      Math.round(
        phaseCount * 1.5 +
          ruleCount * 2 +
          extensionCount * 5 +
          (hasCustomExtensions ? 10 : 0),
      ),
    ),
  );

  return {
    overall,
    phaseCount,
    ruleCount,
    extensionCount,
    hasCustomExtensions,
    hasMultipleScoreTracks,
    hasTimers,
    estimatedSetupMinutes,
  };
}
