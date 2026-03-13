/**
 * interaction-primitives.test.ts — Tests for the Interaction Primitives subsystem.
 *
 * Tests cover:
 * - choice primitive: validates correct option, rejects invalid
 * - text_submit primitive: validates non-empty string, rejects empty
 * - vote primitive: validates valid target, rejects invalid
 * - confirm primitive: accepts truthy values, rejects falsy
 * - InputCollector: tracks submissions, allRequiredSubmitted, rejects duplicates, reset
 * - Registry: registers and creates primitives
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createChoicePrimitive,
  createTextSubmitPrimitive,
  createVotePrimitive,
  createConfirmPrimitive,
  InputCollector,
  registerPrimitive,
  createPrimitive,
  hasPrimitive,
  getRegisteredTypes,
} from '../index.js';

// ---------------------------------------------------------------------------
// choice primitive
// ---------------------------------------------------------------------------

describe('choice primitive', () => {
  const choice = createChoicePrimitive({ options: ['rock', 'paper', 'scissors'] });

  it('has type "choice"', () => {
    expect(choice.type).toBe('choice');
  });

  it('validates a correct string option', () => {
    expect(choice.validate('rock')).toEqual({ valid: true });
    expect(choice.validate('paper')).toEqual({ valid: true });
    expect(choice.validate('scissors')).toEqual({ valid: true });
  });

  it('validates a correct numeric option', () => {
    const numChoice = createChoicePrimitive({ options: [1, 2, 3] });
    expect(numChoice.validate(1)).toEqual({ valid: true });
    expect(numChoice.validate(2)).toEqual({ valid: true });
  });

  it('rejects an invalid option', () => {
    const result = choice.validate('lizard');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('not a valid option');
  });

  it('rejects non-string/number payload', () => {
    expect(choice.validate(null)).toEqual(expect.objectContaining({ valid: false }));
    expect(choice.validate({})).toEqual(expect.objectContaining({ valid: false }));
    expect(choice.validate([])).toEqual(expect.objectContaining({ valid: false }));
    expect(choice.validate(true)).toEqual(expect.objectContaining({ valid: false }));
  });

  it('handles empty options list (everything is invalid)', () => {
    const emptyChoice = createChoicePrimitive({ options: [] });
    expect(emptyChoice.validate('anything')).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });

  it('handles missing options in config (defaults to empty)', () => {
    const noConfig = createChoicePrimitive({});
    expect(noConfig.validate('anything')).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });
});

// ---------------------------------------------------------------------------
// text_submit primitive
// ---------------------------------------------------------------------------

describe('text_submit primitive', () => {
  const textPrimitive = createTextSubmitPrimitive({});

  it('has type "text_submit"', () => {
    expect(textPrimitive.type).toBe('text_submit');
  });

  it('validates a non-empty string', () => {
    expect(textPrimitive.validate('hello')).toEqual({ valid: true });
    expect(textPrimitive.validate('  some text  ')).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    const result = textPrimitive.validate('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects a whitespace-only string', () => {
    const result = textPrimitive.validate('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-string payload', () => {
    expect(textPrimitive.validate(123)).toEqual(expect.objectContaining({ valid: false }));
    expect(textPrimitive.validate(null)).toEqual(expect.objectContaining({ valid: false }));
    expect(textPrimitive.validate(undefined)).toEqual(expect.objectContaining({ valid: false }));
    expect(textPrimitive.validate({})).toEqual(expect.objectContaining({ valid: false }));
  });

  it('respects maxLength constraint', () => {
    const limited = createTextSubmitPrimitive({ maxLength: 10 });
    expect(limited.validate('short')).toEqual({ valid: true });
    // 'exactly ten' is 11 chars → invalid
    expect(limited.validate('exactly ten')).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });

  it('respects minLength constraint', () => {
    const minFive = createTextSubmitPrimitive({ minLength: 5 });
    expect(minFive.validate('hello')).toEqual({ valid: true });
    expect(minFive.validate('hi')).toEqual(expect.objectContaining({ valid: false }));
  });

  it('validates with both minLength and maxLength', () => {
    const bounded = createTextSubmitPrimitive({ minLength: 3, maxLength: 8 });
    expect(bounded.validate('abc')).toEqual({ valid: true });
    expect(bounded.validate('abcdefgh')).toEqual({ valid: true });
    expect(bounded.validate('ab')).toEqual(expect.objectContaining({ valid: false }));
    expect(bounded.validate('abcdefghi')).toEqual(expect.objectContaining({ valid: false }));
  });
});

// ---------------------------------------------------------------------------
// vote primitive
// ---------------------------------------------------------------------------

describe('vote primitive', () => {
  it('has type "vote"', () => {
    const vote = createVotePrimitive({});
    expect(vote.type).toBe('vote');
  });

  it('accepts any non-empty string when no validTargets specified', () => {
    const vote = createVotePrimitive({});
    expect(vote.validate('player-123')).toEqual({ valid: true });
    expect(vote.validate('option-a')).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const vote = createVotePrimitive({});
    expect(vote.validate('')).toEqual(expect.objectContaining({ valid: false }));
  });

  it('rejects whitespace-only string', () => {
    const vote = createVotePrimitive({});
    expect(vote.validate('   ')).toEqual(expect.objectContaining({ valid: false }));
  });

  it('validates a valid target from validTargets list', () => {
    const vote = createVotePrimitive({ validTargets: ['p1', 'p2', 'p3'] });
    expect(vote.validate('p1')).toEqual({ valid: true });
    expect(vote.validate('p2')).toEqual({ valid: true });
    expect(vote.validate('p3')).toEqual({ valid: true });
  });

  it('rejects a target not in validTargets list', () => {
    const vote = createVotePrimitive({ validTargets: ['p1', 'p2', 'p3'] });
    const result = vote.validate('p4');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-string payload', () => {
    const vote = createVotePrimitive({});
    expect(vote.validate(123)).toEqual(expect.objectContaining({ valid: false }));
    expect(vote.validate(null)).toEqual(expect.objectContaining({ valid: false }));
    expect(vote.validate(undefined)).toEqual(expect.objectContaining({ valid: false }));
  });
});

// ---------------------------------------------------------------------------
// confirm primitive
// ---------------------------------------------------------------------------

describe('confirm primitive', () => {
  const confirm = createConfirmPrimitive({});

  it('has type "confirm"', () => {
    expect(confirm.type).toBe('confirm');
  });

  it('accepts truthy string', () => {
    expect(confirm.validate('yes')).toEqual({ valid: true });
    expect(confirm.validate('true')).toEqual({ valid: true });
  });

  it('accepts truthy number', () => {
    expect(confirm.validate(1)).toEqual({ valid: true });
    expect(confirm.validate(42)).toEqual({ valid: true });
  });

  it('accepts truthy boolean', () => {
    expect(confirm.validate(true)).toEqual({ valid: true });
  });

  it('accepts truthy object', () => {
    expect(confirm.validate({ ok: true })).toEqual({ valid: true });
  });

  it('rejects null', () => {
    expect(confirm.validate(null)).toEqual(expect.objectContaining({ valid: false }));
  });

  it('rejects undefined', () => {
    expect(confirm.validate(undefined)).toEqual(expect.objectContaining({ valid: false }));
  });

  it('rejects false', () => {
    expect(confirm.validate(false)).toEqual(expect.objectContaining({ valid: false }));
  });

  it('rejects 0', () => {
    expect(confirm.validate(0)).toEqual(expect.objectContaining({ valid: false }));
  });

  it('rejects empty string', () => {
    expect(confirm.validate('')).toEqual(expect.objectContaining({ valid: false }));
  });
});

// ---------------------------------------------------------------------------
// InputCollector
// ---------------------------------------------------------------------------

describe('InputCollector', () => {
  let collector: InputCollector;

  beforeEach(() => {
    const primitive = createTextSubmitPrimitive({});
    collector = new InputCollector(['p1', 'p2', 'p3'], primitive);
  });

  it('starts with no submissions', () => {
    expect(collector.getAllSubmissions().size).toBe(0);
    expect(collector.allRequiredSubmitted()).toBe(false);
  });

  it('hasSubmitted returns true after submission', () => {
    expect(collector.hasSubmitted('p1')).toBe(false);
    collector.submit('p1', 'answer');
    expect(collector.hasSubmitted('p1')).toBe(true);
    expect(collector.hasSubmitted('p2')).toBe(false);
  });

  it('getSubmission returns the submitted payload', () => {
    collector.submit('p1', 'my answer');
    expect(collector.getSubmission('p1')).toBe('my answer');
    expect(collector.getSubmission('p2')).toBeUndefined();
  });

  it('accepts valid submission and returns accepted: true', () => {
    const result = collector.submit('p1', 'some text');
    expect(result).toEqual({ accepted: true });
  });

  it('rejects submission from player not in required set', () => {
    const result = collector.submit('unknown-player', 'answer');
    expect(result.accepted).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects duplicate submission from same player', () => {
    collector.submit('p1', 'first answer');
    const result = collector.submit('p1', 'second answer');
    expect(result.accepted).toBe(false);
    expect(result.error).toContain('already submitted');
  });

  it('rejects invalid payload (fails primitive validation)', () => {
    const result = collector.submit('p1', ''); // empty string invalid for text_submit
    expect(result.accepted).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('does not store submission when payload is invalid', () => {
    collector.submit('p1', ''); // invalid
    expect(collector.hasSubmitted('p1')).toBe(false);
    expect(collector.getSubmission('p1')).toBeUndefined();
  });

  it('allRequiredSubmitted returns false when some players havent submitted', () => {
    collector.submit('p1', 'answer');
    collector.submit('p2', 'answer');
    expect(collector.allRequiredSubmitted()).toBe(false); // p3 still needs to submit
  });

  it('allRequiredSubmitted returns true when all required players submitted', () => {
    collector.submit('p1', 'a1');
    collector.submit('p2', 'a2');
    collector.submit('p3', 'a3');
    expect(collector.allRequiredSubmitted()).toBe(true);
  });

  it('getAllSubmissions returns all submitted payloads', () => {
    collector.submit('p1', 'answer1');
    collector.submit('p2', 'answer2');

    const all = collector.getAllSubmissions();
    expect(all.size).toBe(2);
    expect(all.get('p1')).toBe('answer1');
    expect(all.get('p2')).toBe('answer2');
  });

  it('getAllSubmissions returns a copy (not a live reference)', () => {
    collector.submit('p1', 'answer1');
    const snapshot = collector.getAllSubmissions();
    collector.submit('p2', 'answer2');
    // snapshot should not be affected by the new submission
    expect(snapshot.size).toBe(1);
  });

  it('reset clears all submissions', () => {
    collector.submit('p1', 'answer');
    collector.submit('p2', 'answer');
    collector.reset();

    expect(collector.hasSubmitted('p1')).toBe(false);
    expect(collector.hasSubmitted('p2')).toBe(false);
    expect(collector.getAllSubmissions().size).toBe(0);
    expect(collector.allRequiredSubmitted()).toBe(false);
  });

  it('allows submissions again after reset', () => {
    collector.submit('p1', 'first round answer');
    collector.reset();

    const result = collector.submit('p1', 'second round answer');
    expect(result.accepted).toBe(true);
    expect(collector.getSubmission('p1')).toBe('second round answer');
  });

  it('works with empty required player set (allRequiredSubmitted is vacuously true)', () => {
    const primitive = createTextSubmitPrimitive({});
    const emptyCollector = new InputCollector([], primitive);
    expect(emptyCollector.allRequiredSubmitted()).toBe(true);
  });

  it('works with choice primitive', () => {
    const choice = createChoicePrimitive({ options: ['A', 'B', 'C'] });
    const choiceCollector = new InputCollector(['p1', 'p2'], choice);

    expect(choiceCollector.submit('p1', 'A')).toEqual({ accepted: true });
    expect(choiceCollector.submit('p2', 'X')).toEqual(
      expect.objectContaining({ accepted: false }),
    );
  });

  it('works with vote primitive', () => {
    const vote = createVotePrimitive({ validTargets: ['p1', 'p2', 'p3'] });
    const voteCollector = new InputCollector(['p1', 'p2', 'p3'], vote);

    expect(voteCollector.submit('p1', 'p2')).toEqual({ accepted: true });
    expect(voteCollector.submit('p2', 'invalid-id')).toEqual(
      expect.objectContaining({ accepted: false }),
    );
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('Primitive registry', () => {
  it('has built-in primitives pre-registered', () => {
    expect(hasPrimitive('choice')).toBe(true);
    expect(hasPrimitive('text_submit')).toBe(true);
    expect(hasPrimitive('vote')).toBe(true);
    expect(hasPrimitive('confirm')).toBe(true);
  });

  it('createPrimitive returns a choice primitive with correct type', () => {
    const p = createPrimitive('choice', { options: ['a', 'b'] });
    expect(p.type).toBe('choice');
  });

  it('createPrimitive returns a text_submit primitive with correct type', () => {
    const p = createPrimitive('text_submit', {});
    expect(p.type).toBe('text_submit');
  });

  it('createPrimitive returns a vote primitive with correct type', () => {
    const p = createPrimitive('vote', {});
    expect(p.type).toBe('vote');
  });

  it('createPrimitive returns a confirm primitive with correct type', () => {
    const p = createPrimitive('confirm', {});
    expect(p.type).toBe('confirm');
  });

  it('throws when creating unknown primitive type', () => {
    expect(() => createPrimitive('unknown_type', {})).toThrow(
      /Unknown primitive type/,
    );
  });

  it('registerPrimitive registers a custom primitive', () => {
    const customFactory = (_config: unknown) => ({
      type: 'custom_test',
      validate: (_payload: unknown) => ({ valid: true }),
    });

    registerPrimitive('custom_test', customFactory);
    expect(hasPrimitive('custom_test')).toBe(true);

    const p = createPrimitive('custom_test', {});
    expect(p.type).toBe('custom_test');
  });

  it('getRegisteredTypes includes all built-in types', () => {
    const types = getRegisteredTypes();
    expect(types).toContain('choice');
    expect(types).toContain('text_submit');
    expect(types).toContain('vote');
    expect(types).toContain('confirm');
  });
});
