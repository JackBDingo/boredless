/**
 * primitives.ts — Built-in interaction primitive implementations.
 *
 * Each primitive is a factory function that returns an InteractionPrimitive
 * given config from the game schema.
 *
 * Built-in primitives:
 * - choice       — Pick one option from a declared list
 * - text_submit  — Free text entry (with optional length constraints)
 * - vote         — Select a player ID or option from a valid set
 * - confirm      — Simple acknowledgment (any truthy value accepted)
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. All primitives are generic.
 * - Primitives are stateless — validation only, no tracking.
 * - Factories receive config as unknown; they cast and validate internally.
 */

import type { InteractionPrimitive } from './types.js';

// ---------------------------------------------------------------------------
// choice — Pick one from a declared options list
// ---------------------------------------------------------------------------

export interface ChoiceConfig {
  options: (string | number)[];
}

/**
 * Create a choice primitive.
 * Payload must be a string or number that exists in the options array.
 */
export function createChoicePrimitive(config: unknown): InteractionPrimitive {
  const cfg = config as Partial<ChoiceConfig>;
  const options: (string | number)[] = Array.isArray(cfg?.options) ? cfg.options : [];

  return {
    type: 'choice',
    validate(payload: unknown): { valid: boolean; error?: string } {
      if (typeof payload !== 'string' && typeof payload !== 'number') {
        return { valid: false, error: 'Payload must be a string or number' };
      }
      if (!options.includes(payload)) {
        return {
          valid: false,
          error: `"${payload}" is not a valid option. Valid options: ${options.join(', ')}`,
        };
      }
      return { valid: true };
    },
  };
}

// ---------------------------------------------------------------------------
// text_submit — Free text entry
// ---------------------------------------------------------------------------

export interface TextSubmitConfig {
  minLength?: number;
  maxLength?: number;
}

/**
 * Create a text_submit primitive.
 * Payload must be a non-empty string. Optional length constraints.
 */
export function createTextSubmitPrimitive(config: unknown): InteractionPrimitive {
  const cfg = config as Partial<TextSubmitConfig>;
  const minLength = typeof cfg?.minLength === 'number' ? cfg.minLength : 1;
  const maxLength = typeof cfg?.maxLength === 'number' ? cfg.maxLength : Infinity;

  return {
    type: 'text_submit',
    validate(payload: unknown): { valid: boolean; error?: string } {
      if (typeof payload !== 'string') {
        return { valid: false, error: 'Payload must be a string' };
      }
      const trimmed = payload.trim();
      if (trimmed.length < minLength) {
        return {
          valid: false,
          error: minLength === 1
            ? 'Text cannot be empty'
            : `Text must be at least ${minLength} characters`,
        };
      }
      if (trimmed.length > maxLength) {
        return {
          valid: false,
          error: `Text cannot exceed ${maxLength} characters`,
        };
      }
      return { valid: true };
    },
  };
}

// ---------------------------------------------------------------------------
// vote — Select a player ID or option from a valid set
// ---------------------------------------------------------------------------

export interface VoteConfig {
  validTargets?: string[];
}

/**
 * Create a vote primitive.
 * Payload must be a non-empty string. If validTargets is provided, payload
 * must be one of those targets (e.g. player IDs or named options).
 * If validTargets is not provided, any non-empty string is accepted.
 */
export function createVotePrimitive(config: unknown): InteractionPrimitive {
  const cfg = config as Partial<VoteConfig>;
  const validTargets: string[] | null = Array.isArray(cfg?.validTargets)
    ? (cfg.validTargets as string[])
    : null;

  return {
    type: 'vote',
    validate(payload: unknown): { valid: boolean; error?: string } {
      if (typeof payload !== 'string') {
        return { valid: false, error: 'Vote payload must be a string' };
      }
      const trimmed = payload.trim();
      if (!trimmed) {
        return { valid: false, error: 'Vote target cannot be empty' };
      }
      if (validTargets !== null && !validTargets.includes(trimmed)) {
        return {
          valid: false,
          error: `"${trimmed}" is not a valid vote target`,
        };
      }
      return { valid: true };
    },
  };
}

// ---------------------------------------------------------------------------
// confirm — Simple acknowledgment
// ---------------------------------------------------------------------------

/**
 * Create a confirm primitive.
 * Accepts any truthy value. Used for acknowledgments, "ready up", etc.
 */
export function createConfirmPrimitive(_config: unknown): InteractionPrimitive {
  return {
    type: 'confirm',
    validate(payload: unknown): { valid: boolean; error?: string } {
      if (!payload) {
        return { valid: false, error: 'Confirmation payload must be truthy' };
      }
      return { valid: true };
    },
  };
}
