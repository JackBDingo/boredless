import { describe, it, expect } from 'vitest';
import { generateRoomCode } from './code';
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@boredless/shared';

describe('generateRoomCode', () => {
  it('generates code of correct length', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('only uses allowed characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ROOM_CODE_CHARS).toContain(char);
      }
    }
  });

  it('generates different codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRoomCode());
    }
    // With 28^4 = 614,656 possibilities, 50 codes should all be unique
    expect(codes.size).toBe(50);
  });
});
