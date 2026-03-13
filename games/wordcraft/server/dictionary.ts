import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const words: string[] = require('an-array-of-english-words');

// Build a Set for O(1) lookup — uppercase for case-insensitive matching
const DICTIONARY = new Set(words.map((w: string) => w.toUpperCase()));

export function isValidWord(word: string): boolean {
  return DICTIONARY.has(word.toUpperCase());
}
