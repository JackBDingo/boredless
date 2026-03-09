import { describe, it, expect } from 'vitest';
import { PROMPTS, getRandomPrompts } from './prompts';

describe('PROMPTS', () => {
  it('has at least 50 prompts', () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(50);
  });

  it('every prompt has id, question, and correctAnswer', () => {
    for (const prompt of PROMPTS) {
      expect(prompt.id).toBeDefined();
      expect(typeof prompt.question).toBe('string');
      expect(prompt.question.length).toBeGreaterThan(0);
      expect(typeof prompt.correctAnswer).toBe('string');
      expect(prompt.correctAnswer.length).toBeGreaterThan(0);
    }
  });

  it('all prompt IDs are unique', () => {
    const ids = new Set(PROMPTS.map(p => p.id));
    expect(ids.size).toBe(PROMPTS.length);
  });
});

describe('getRandomPrompts', () => {
  it('returns requested number of prompts', () => {
    expect(getRandomPrompts(3)).toHaveLength(3);
    expect(getRandomPrompts(5)).toHaveLength(5);
  });

  it('excludes specified IDs', () => {
    const result = getRandomPrompts(10, [1, 2, 3]);
    for (const prompt of result) {
      expect([1, 2, 3]).not.toContain(prompt.id);
    }
  });

  it('returns different prompts on repeated calls (probabilistic)', () => {
    // Very unlikely to be identical with 50+ prompts
    const attempts = Array.from({ length: 10 }, () =>
      getRandomPrompts(5).map(p => p.id).sort().join(',')
    );
    const unique = new Set(attempts);
    expect(unique.size).toBeGreaterThan(1);
  });
});
