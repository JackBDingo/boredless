/**
 * registry.ts — Primitive registry for Interaction Primitives.
 *
 * The registry maps primitive type names to factory functions.
 * Pre-registered primitives: choice, text_submit, vote, confirm.
 *
 * Games can register custom primitives via registerPrimitive().
 *
 * DESIGN CONTRACT:
 * - Registry is a singleton (module-level state).
 * - Factory functions receive raw schema config as unknown.
 * - Factory functions are responsible for casting and validating their config.
 * - No game-specific logic in the registry itself.
 */

import type { InteractionPrimitive, PrimitiveFactory } from './types.js';
import {
  createChoicePrimitive,
  createTextSubmitPrimitive,
  createVotePrimitive,
  createConfirmPrimitive,
} from './primitives.js';

// ---------------------------------------------------------------------------
// Registry state
// ---------------------------------------------------------------------------

const factories = new Map<string, PrimitiveFactory>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a primitive factory under a type name.
 * Overwrites any existing registration for that type.
 *
 * @param type    - The primitive type string (e.g. "text_submit")
 * @param factory - Factory function that creates the primitive from schema config
 */
export function registerPrimitive(type: string, factory: PrimitiveFactory): void {
  factories.set(type, factory);
}

/**
 * Create an InteractionPrimitive from a registered type and config.
 * Throws if the type is not registered.
 *
 * @param type   - The primitive type string
 * @param config - Raw config from the game schema (passed to factory as-is)
 */
export function createPrimitive(type: string, config: unknown): InteractionPrimitive {
  const factory = factories.get(type);
  if (!factory) {
    throw new Error(
      `[interaction-primitives] Unknown primitive type: "${type}". ` +
      `Registered types: ${[...factories.keys()].join(', ') || '(none)'}`,
    );
  }
  return factory(config);
}

/**
 * Check if a primitive type is registered.
 */
export function hasPrimitive(type: string): boolean {
  return factories.has(type);
}

/**
 * Get all registered primitive type names.
 */
export function getRegisteredTypes(): string[] {
  return [...factories.keys()];
}

// ---------------------------------------------------------------------------
// Pre-register built-in primitives
// ---------------------------------------------------------------------------

registerPrimitive('choice', createChoicePrimitive);
registerPrimitive('text_submit', createTextSubmitPrimitive);
registerPrimitive('vote', createVotePrimitive);
registerPrimitive('confirm', createConfirmPrimitive);
