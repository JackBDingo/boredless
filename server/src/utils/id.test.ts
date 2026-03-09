import { describe, it, expect } from 'vitest';
import { generateId, generateToken } from './id';

describe('generateId', () => {
  it('generates 21-char string', () => {
    expect(generateId()).toHaveLength(21);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('generateToken', () => {
  it('generates 10-char string', () => {
    expect(generateToken()).toHaveLength(10);
  });
});
