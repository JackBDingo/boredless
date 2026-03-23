/**
 * extensions/scoring.ts — Cribbage scoring re-export.
 *
 * Re-exports the scoring functions from the shared cribbage scoring module.
 * Extensions import from here rather than directly from server/scoring.ts
 * to keep the extension layer self-contained.
 */

export { scoreHand, scorePegging } from '../server/scoring.js';
export type { } from '../types.js';
