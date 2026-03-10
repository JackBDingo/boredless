import {
  ClientMessageType,
  ServerMessageType,
} from '../enums.js';
import { PublicRoomState, JoinResult } from './room.js';
import { PhaseState, ScoreEntry, GameOverState } from './game.js';

// ============================================================
// CLIENT → SERVER MESSAGES
// ============================================================

export interface JoinRoomMessage {
  type: ClientMessageType.JOIN_ROOM;
  roomCode: string;
  playerName: string;
  preferredColor: string | null;
}

export interface RejoinMessage {
  type: ClientMessageType.REJOIN;
  sessionId: string;
  reconnectToken: string;
}

export interface JoinDisplayMessage {
  type: ClientMessageType.JOIN_DISPLAY;
  roomId: string;
}

export interface SelectGameMessage {
  type: ClientMessageType.SELECT_GAME;
  gameId: string;
}

export interface StartGameMessage {
  type: ClientMessageType.START_GAME;
}

export interface SubmitInputMessage {
  type: ClientMessageType.SUBMIT_INPUT;
  inputType: string;
  payload: Record<string, unknown>;
}

export interface KickPlayerMessage {
  type: ClientMessageType.KICK_PLAYER;
  playerId: string;
}

export interface ReturnToLobbyMessage {
  type: ClientMessageType.RETURN_TO_LOBBY;
}

export interface CloseRoomMessage {
  type: ClientMessageType.CLOSE_ROOM;
}

export interface PingMessage {
  type: ClientMessageType.PING;
  timestamp: number;
}

/** Union of all client messages */
export type ClientMessage =
  | JoinRoomMessage
  | RejoinMessage
  | JoinDisplayMessage
  | SelectGameMessage
  | StartGameMessage
  | SubmitInputMessage
  | KickPlayerMessage
  | ReturnToLobbyMessage
  | CloseRoomMessage
  | PingMessage;

// ============================================================
// SERVER → CLIENT MESSAGES
// ============================================================

export interface RoomStateMessage {
  type: ServerMessageType.ROOM_STATE;
  room: PublicRoomState;
  phase: PhaseState | null;
  gamePublicState: Record<string, unknown> | null;
}

export interface PlayerJoinedMessage {
  type: ServerMessageType.PLAYER_JOINED;
  playerId: string;
  playerName: string;
  playerColor: string;
  playerCount: number;
}

export interface PlayerLeftMessage {
  type: ServerMessageType.PLAYER_LEFT;
  playerId: string;
  playerName: string;
  playerCount: number;
}

export interface PlayerKickedMessage {
  type: ServerMessageType.PLAYER_KICKED;
  playerId: string;
  playerName: string;
}

export interface GameSelectedMessage {
  type: ServerMessageType.GAME_SELECTED;
  gameId: string;
  gameName: string;
}

export interface GameStartedMessage {
  type: ServerMessageType.GAME_STARTED;
  gameId: string;
  phase: PhaseState;
  gamePublicState: Record<string, unknown>;
}

export interface PhaseChangedMessage {
  type: ServerMessageType.PHASE_CHANGED;
  phase: PhaseState;
  gamePublicState: Record<string, unknown>;
}

export interface TimerTickMessage {
  type: ServerMessageType.TIMER_TICK;
  remainingMs: number;
}

export interface TimerExpiredMessage {
  type: ServerMessageType.TIMER_EXPIRED;
  phaseType: string;
}

export interface InputAcceptedMessage {
  type: ServerMessageType.INPUT_ACCEPTED;
  inputType: string;
}

export interface InputRejectedMessage {
  type: ServerMessageType.INPUT_REJECTED;
  inputType: string;
  reason: string;
}

export interface PrivateStateMessage {
  type: ServerMessageType.PRIVATE_STATE;
  state: Record<string, unknown>;
}

export interface ScoreUpdateMessage {
  type: ServerMessageType.SCORE_UPDATE;
  scores: ScoreEntry[];
}

export interface GameOverMessage {
  type: ServerMessageType.GAME_OVER;
  result: GameOverState;
}

export interface RoomClosedMessage {
  type: ServerMessageType.ROOM_CLOSED;
  reason: string;
}

export interface ErrorMessage {
  type: ServerMessageType.ERROR;
  code: string;
  message: string;
}

export interface PongMessage {
  type: ServerMessageType.PONG;
  timestamp: number;
  serverTime: number;
}

export interface JoinedMessage {
  type: ServerMessageType.JOINED;
  result: JoinResult;
}

export interface GameEventMessage {
  type: ServerMessageType.GAME_EVENT;
  /** The custom event name — e.g. 'bluff:reveal', 'village:vote-cast' */
  event: string;
  /** Arbitrary payload — platform passes through unmodified */
  data: unknown;
}

/** Union of all server messages */
export type ServerMessage =
  | RoomStateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerKickedMessage
  | GameSelectedMessage
  | GameStartedMessage
  | PhaseChangedMessage
  | TimerTickMessage
  | TimerExpiredMessage
  | InputAcceptedMessage
  | InputRejectedMessage
  | PrivateStateMessage
  | ScoreUpdateMessage
  | GameOverMessage
  | RoomClosedMessage
  | ErrorMessage
  | PongMessage
  | JoinedMessage
  | GameEventMessage;
