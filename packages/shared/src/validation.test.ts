import { describe, it, expect } from 'vitest';
import {
  playerNameSchema,
  roomCodeSchema,
  bbSubmitSchema,
  voteSchema,
  nightActionSchema,
} from './validation';
import { InputType } from './enums';

describe('playerNameSchema', () => {
  it('accepts valid names', () => {
    expect(playerNameSchema.parse('Alice')).toBe('Alice');
    expect(playerNameSchema.parse('A')).toBe('A');
    expect(playerNameSchema.parse('Player Name')).toBe('Player Name');
  });

  it('trims whitespace', () => {
    expect(playerNameSchema.parse('  Bob  ')).toBe('Bob');
  });

  it('rejects empty strings', () => {
    expect(() => playerNameSchema.parse('')).toThrow();
  });

  it('rejects names longer than 16 chars', () => {
    expect(() => playerNameSchema.parse('A'.repeat(17))).toThrow();
  });

  it('accepts exactly 16 chars', () => {
    expect(playerNameSchema.parse('A'.repeat(16))).toBe('A'.repeat(16));
  });
});

describe('roomCodeSchema', () => {
  it('accepts valid 4-char codes', () => {
    expect(roomCodeSchema.parse('ABCD')).toBe('ABCD');
    expect(roomCodeSchema.parse('X2Y3')).toBe('X2Y3');
  });

  it('uppercases input', () => {
    expect(roomCodeSchema.parse('abcd')).toBe('ABCD');
  });

  it('rejects wrong length', () => {
    expect(() => roomCodeSchema.parse('ABC')).toThrow();
    expect(() => roomCodeSchema.parse('ABCDE')).toThrow();
  });
});

describe('bbSubmitSchema', () => {
  it('accepts valid text submission', () => {
    const result = bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: 'My fake answer' },
    });
    expect(result.payload.answer).toBe('My fake answer');
  });

  it('trims answer whitespace', () => {
    const result = bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: '  trimmed  ' },
    });
    expect(result.payload.answer).toBe('trimmed');
  });

  it('rejects empty answer', () => {
    expect(() => bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: '' },
    })).toThrow();
  });

  it('rejects answer over 100 chars', () => {
    expect(() => bbSubmitSchema.parse({
      inputType: InputType.TEXT,
      payload: { answer: 'A'.repeat(101) },
    })).toThrow();
  });

  it('rejects wrong input type', () => {
    expect(() => bbSubmitSchema.parse({
      inputType: InputType.VOTE,
      payload: { answer: 'test' },
    })).toThrow();
  });
});

describe('voteSchema', () => {
  it('accepts valid vote', () => {
    const result = voteSchema.parse({
      inputType: InputType.VOTE,
      payload: { answerId: 'abc123' },
    });
    expect(result.payload.answerId).toBe('abc123');
  });

  it('rejects empty answerId', () => {
    expect(() => voteSchema.parse({
      inputType: InputType.VOTE,
      payload: { answerId: '' },
    })).toThrow();
  });
});

describe('nightActionSchema', () => {
  it('accepts valid night action', () => {
    const result = nightActionSchema.parse({
      inputType: InputType.NIGHT_ACTION,
      payload: { targetPlayerId: 'player1' },
    });
    expect(result.payload.targetPlayerId).toBe('player1');
  });
});
