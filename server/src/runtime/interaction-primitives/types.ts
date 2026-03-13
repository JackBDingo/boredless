/**
 * types.ts — Core type definitions for the Interaction Primitives subsystem.
 *
 * Interaction Primitives are reusable, validated player input types.
 * They replace the ad-hoc input handling in V1 game modules.
 *
 * DESIGN CONTRACT:
 * - Primitives are stateless — they don't track submissions.
 * - InputCollector is stateful — it tracks who has submitted for a given phase.
 * - No game-specific logic. All primitives are generic.
 */

/**
 * An InteractionPrimitive validates a player's input payload.
 * Each primitive type (choice, text_submit, vote, confirm) has its own implementation.
 */
export interface InteractionPrimitive {
  /** Unique type identifier (e.g. "text_submit", "choice") */
  type: string;

  /**
   * Validate a player's submitted payload.
   * Returns { valid: true } on success or { valid: false, error: string } on failure.
   */
  validate(payload: unknown): { valid: boolean; error?: string };
}

/**
 * A record of a single player's input submission.
 * Stored by InputCollector for tracking and retrieval.
 */
export interface InputSubmission {
  playerId: string;
  primitiveType: string;
  payload: unknown;
  timestamp: number;
}

/**
 * InputCollector tracks player submissions for a single input_gate phase.
 * Constructed with the required player IDs and an InteractionPrimitive for validation.
 *
 * Usage:
 *   const collector = new InputCollector(['p1', 'p2', 'p3'], textPrimitive);
 *   collector.submit('p1', 'hello'); // { accepted: true }
 *   collector.allRequiredSubmitted(); // false (p2, p3 still needed)
 *   collector.reset(); // Clear for next round
 */
export interface InputCollector {
  /**
   * Submit a player's input payload.
   * Validates against the primitive. Rejects duplicates.
   */
  submit(playerId: string, payload: unknown): { accepted: boolean; error?: string };

  /** True if the given player has already submitted. */
  hasSubmitted(playerId: string): boolean;

  /** Get the submitted payload for a player, or undefined if not submitted. */
  getSubmission(playerId: string): unknown | undefined;

  /** Get all submissions as a Map<playerId, payload>. */
  getAllSubmissions(): Map<string, unknown>;

  /** True when all required players have submitted. */
  allRequiredSubmitted(): boolean;

  /** Clear all submissions. Call before a new round/phase. */
  reset(): void;
}

/**
 * Factory function signature for creating an InteractionPrimitive from schema config.
 * Registered in the primitive registry.
 */
export type PrimitiveFactory = (config: unknown) => InteractionPrimitive;
