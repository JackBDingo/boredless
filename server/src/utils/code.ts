import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@boredless/shared';

/** Generate a random room code (4 uppercase chars/digits, no ambiguous chars) */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}
