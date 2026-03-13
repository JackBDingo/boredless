/**
 * input-collector.ts — InputCollector implementation.
 *
 * InputCollector tracks player submissions for a single input_gate phase.
 * It validates each submission against an InteractionPrimitive, prevents
 * duplicates, and reports when all required players have submitted.
 *
 * DESIGN CONTRACT:
 * - One InputCollector per input_gate phase per room.
 * - Call reset() to reuse the collector across rounds.
 * - No game-specific logic. The collector is generic across all games.
 */

import type { InteractionPrimitive, InputCollector as InputCollectorInterface } from './types.js';

export class InputCollector implements InputCollectorInterface {
  private readonly requiredPlayerIds: ReadonlySet<string>;
  private readonly primitive: InteractionPrimitive;

  /** Map from playerId → submitted payload. */
  private submissions: Map<string, unknown> = new Map();

  /**
   * @param requiredPlayerIds - The player IDs that must submit before allRequiredSubmitted() is true
   * @param primitive         - The primitive used to validate each submission
   */
  constructor(requiredPlayerIds: string[], primitive: InteractionPrimitive) {
    this.requiredPlayerIds = new Set(requiredPlayerIds);
    this.primitive = primitive;
  }

  /**
   * Submit a player's payload.
   *
   * - Rejects if player is not in the required set
   * - Rejects if player has already submitted
   * - Validates payload against the primitive
   * - Stores on success
   */
  submit(playerId: string, payload: unknown): { accepted: boolean; error?: string } {
    // Reject unknown players
    if (!this.requiredPlayerIds.has(playerId)) {
      return { accepted: false, error: `Player "${playerId}" is not in the required player set` };
    }

    // Reject duplicates
    if (this.submissions.has(playerId)) {
      return { accepted: false, error: `Player "${playerId}" has already submitted` };
    }

    // Validate payload
    const result = this.primitive.validate(payload);
    if (!result.valid) {
      return { accepted: false, error: result.error ?? 'Invalid payload' };
    }

    // Store submission
    this.submissions.set(playerId, payload);
    return { accepted: true };
  }

  /** True if the given player has already submitted. */
  hasSubmitted(playerId: string): boolean {
    return this.submissions.has(playerId);
  }

  /** Get the submitted payload for a player, or undefined if not submitted. */
  getSubmission(playerId: string): unknown | undefined {
    return this.submissions.get(playerId);
  }

  /** Get all submissions as a Map<playerId, payload>. */
  getAllSubmissions(): Map<string, unknown> {
    return new Map(this.submissions);
  }

  /**
   * True when all required players have submitted.
   * Returns true immediately if the required set is empty.
   */
  allRequiredSubmitted(): boolean {
    for (const playerId of this.requiredPlayerIds) {
      if (!this.submissions.has(playerId)) {
        return false;
      }
    }
    return true;
  }

  /** Clear all submissions. Call before a new round or phase. */
  reset(): void {
    this.submissions.clear();
  }
}
