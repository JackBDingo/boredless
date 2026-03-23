/**
 * dictionary.ts — WordCraft word validation.
 *
 * Re-exports isValidWord from the existing V1 server/dictionary.ts so that
 * extension code can import from the extensions/ directory only.
 *
 * No runtime subsystem imports.
 */

export { isValidWord } from '../server/dictionary.js';
