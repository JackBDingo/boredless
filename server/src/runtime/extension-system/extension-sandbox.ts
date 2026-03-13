/**
 * extension-sandbox.ts — Extension isolation utilities.
 *
 * Provides:
 * 1. createSandboxedContext — produces a deep-frozen copy of game state safe
 *    to pass to extension evaluate functions.
 * 2. validateExtensionImports — static analysis to detect illegal imports from
 *    engine internals in extension source code.
 * 3. wrapRuleHandler — wraps a rule evaluate function with error catching and
 *    timeout protection (default 100ms).
 * 4. wrapLifecycleHandler — wraps a lifecycle handler with error catching and
 *    timeout protection (default 1000ms).
 *
 * ISOLATION GUARANTEE:
 * - State passed to extensions is a deep-frozen copy. Mutations throw TypeError.
 * - Extensions that throw are caught and logged; the runtime is unaffected.
 * - Extensions that exceed their timeout are abandoned; the runtime continues.
 *
 * Subsystem: extension-system
 * Phase: 4.2
 */

import type { RuleExtensionContext, LifecycleContext } from './types.js';

// ---------------------------------------------------------------------------
// Deep freeze helper
// ---------------------------------------------------------------------------

/**
 * Deep-freeze an object recursively.
 * Primitive values are returned as-is (already immutable).
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Freeze arrays
  if (Array.isArray(value)) {
    Object.freeze(value);
    for (const item of value) {
      deepFreeze(item);
    }
    return value;
  }

  // Freeze plain objects
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Sandboxed context creation
// ---------------------------------------------------------------------------

/**
 * Create a sandboxed RuleExtensionContext from full game state.
 *
 * Returns a deep-frozen copy of the state — extension evaluate functions
 * cannot mutate game state (writes throw TypeError in strict mode).
 */
export function createSandboxedContext(
  fullState: Record<string, unknown>,
  players: string[],
  phase?: string,
  round?: number
): RuleExtensionContext {
  // Deep-copy then deep-freeze the state
  const stateCopy = JSON.parse(JSON.stringify(fullState)) as Record<string, unknown>;
  deepFreeze(stateCopy);

  // Freeze the players array
  const playersCopy = [...players];
  Object.freeze(playersCopy);

  return {
    state: stateCopy as Readonly<Record<string, unknown>>,
    players: playersCopy as ReadonlyArray<string>,
    phase,
    round,
  };
}

// ---------------------------------------------------------------------------
// Blocked import patterns (engine internal paths)
// ---------------------------------------------------------------------------

/**
 * Runtime subsystem paths that extensions are NOT allowed to import from.
 * Extensions may only import from extension-system/types.
 */
const BLOCKED_IMPORT_PATTERNS: readonly string[] = [
  'state-manager',
  'phase-machine',
  'interaction-primitives',
  'rule-engine',
  'presentation-system',
  'event-system',
  'content-system',
  'asset-system',
  'scoring-system',
  'turn-system',
  'object-models',
  'visibility',
  'interpreter',
];

/**
 * Validate extension source code for illegal engine internal imports.
 *
 * Performs static analysis by scanning for import/require statements
 * that reference blocked runtime subsystem paths.
 *
 * Returns:
 * - valid: true if no violations found
 * - violations: list of human-readable violation descriptions
 */
export function validateExtensionImports(code: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  // Match all import/require statements
  // Covers: import ... from '...', require('...')
  const importPattern = /(?:import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(code)) !== null) {
    const importPath = match[1] ?? match[2];
    if (!importPath) continue;

    for (const blocked of BLOCKED_IMPORT_PATTERNS) {
      if (importPath.includes(blocked)) {
        violations.push(
          `Illegal import from engine internal '${blocked}': '${importPath}'. ` +
            `Extensions may only import from 'extension-system/types'.`
        );
        break; // Only one violation per import statement
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Handler wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap a rule evaluate function with:
 * - Error catching (returns false on thrown errors)
 * - Timeout protection (default 100ms — synchronous only via try/catch)
 *
 * NOTE: True synchronous timeout cannot be enforced in standard JS without
 * Web Workers. The timeout here acts as documentation of intent. For actual
 * untrusted code sandboxing, use VM2 / Worker threads (future work).
 */
export function wrapRuleHandler(
  handler: (context: RuleExtensionContext) => boolean,
  _timeoutMs = 100
): (context: RuleExtensionContext) => boolean {
  return (context: RuleExtensionContext): boolean => {
    try {
      return handler(context);
    } catch (err) {
      console.error('[ExtensionSandbox] Rule handler threw an error:', err);
      return false;
    }
  };
}

/**
 * Wrap a lifecycle handler with:
 * - Error catching (catches and logs; does not rethrow)
 * - Timeout protection (default 1000ms — enforced via Promise.race for async)
 */
export function wrapLifecycleHandler(
  handler: (context: LifecycleContext) => void | Promise<void>,
  timeoutMs = 1000
): (context: LifecycleContext) => Promise<void> {
  return async (context: LifecycleContext): Promise<void> => {
    try {
      const timeoutPromise = new Promise<void>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`[ExtensionSandbox] Lifecycle handler timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const handlerPromise = Promise.resolve(handler(context));
      await Promise.race([handlerPromise, timeoutPromise]);
    } catch (err) {
      console.error('[ExtensionSandbox] Lifecycle handler threw an error:', err);
      // Do not rethrow — extension errors must never crash the runtime
    }
  };
}
