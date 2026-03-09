import { z } from 'zod';
import {
  MIN_PLAYER_NAME_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  BB_MAX_ANSWER_LENGTH,
} from './constants.js';
import { InputType, ClientMessageType, GameId } from './enums.js';

/** Validate player name */
export const playerNameSchema = z
  .string()
  .min(MIN_PLAYER_NAME_LENGTH)
  .max(MAX_PLAYER_NAME_LENGTH)
  .trim();

/** Validate room code */
export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .toUpperCase();

/** Validate Bluff Battle text submission */
export const bbSubmitSchema = z.object({
  inputType: z.literal(InputType.TEXT),
  payload: z.object({
    answer: z.string().min(1).max(BB_MAX_ANSWER_LENGTH).trim(),
  }),
});

/** Validate vote submission */
export const voteSchema = z.object({
  inputType: z.literal(InputType.VOTE),
  payload: z.object({
    answerId: z.string().min(1), // BB: answerId, VOS: playerId
  }),
});

/** Validate night action submission */
export const nightActionSchema = z.object({
  inputType: z.literal(InputType.NIGHT_ACTION),
  payload: z.object({
    targetPlayerId: z.string().min(1),
  }),
});

/** Validate confirm submission */
export const confirmSchema = z.object({
  inputType: z.literal(InputType.CONFIRM),
  payload: z.object({}),
});

/** Validate any player input */
export const playerInputSchema = z.discriminatedUnion('inputType', [
  bbSubmitSchema,
  voteSchema,
  nightActionSchema,
  confirmSchema,
]);

/** Client message validation schemas */
export const joinRoomSchema = z.object({
  type: z.literal(ClientMessageType.JOIN_ROOM),
  roomCode: roomCodeSchema,
  playerName: playerNameSchema,
  preferredColor: z.string().nullable(),
});

export const rejoinSchema = z.object({
  type: z.literal(ClientMessageType.REJOIN),
  sessionId: z.string().min(1),
  reconnectToken: z.string().min(1),
});

export const joinDisplaySchema = z.object({
  type: z.literal(ClientMessageType.JOIN_DISPLAY),
  roomId: z.string().min(1),
});

export const selectGameSchema = z.object({
  type: z.literal(ClientMessageType.SELECT_GAME),
  gameId: z.nativeEnum(GameId),
});

export const submitInputSchema = z.object({
  type: z.literal(ClientMessageType.SUBMIT_INPUT),
  inputType: z.nativeEnum(InputType),
  payload: z.record(z.unknown()),
});
