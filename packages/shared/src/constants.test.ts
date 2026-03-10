import { describe, it, expect } from 'vitest';
import {
  PLAYER_COLORS,
  ROOM_CODE_CHARS,
} from './constants';

describe('constants integrity', () => {
  it('has exactly 12 player colors', () => {
    expect(PLAYER_COLORS).toHaveLength(12);
  });

  it('all player colors are valid hex', () => {
    for (const color of PLAYER_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('room code chars exclude ambiguous characters', () => {
    expect(ROOM_CODE_CHARS).not.toContain('I');
    expect(ROOM_CODE_CHARS).not.toContain('O');
    expect(ROOM_CODE_CHARS).not.toContain('0');
    expect(ROOM_CODE_CHARS).not.toContain('1');
  });
});
