// ============================================================
// ALL ENUMS — Used across the entire system
// ============================================================

/** Room lifecycle status */
export enum RoomStatus {
  WAITING_FOR_PLAYERS = 'waiting_for_players',
  IN_LOBBY = 'in_lobby',
  GAME_STARTING = 'game_starting',
  IN_GAME = 'in_game',
  GAME_ENDED = 'game_ended',
  CLOSED = 'closed',
}

/** Player connection status */
export enum PlayerStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  REMOVED = 'removed',
}

/** Device type for sessions */
export enum DeviceType {
  DISPLAY = 'display',
  PHONE = 'phone',
}

/** Who can see a piece of state */
export enum Visibility {
  PUBLIC = 'public',           // Display + all players
  ALL_PLAYERS = 'all_players', // All players but NOT display
  PLAYER = 'player',           // Single specific player
  HOST = 'host',               // Host only
}

/** Game IDs — one per game module */
export enum GameId {
  BLUFF_BATTLE = 'bluff_battle',
  VILLAGE_OF_SHADOWS = 'village_of_shadows',
}

/** Generic phase types used across games */
export enum PhaseType {
  // Shared phases
  LOBBY = 'lobby',
  INSTRUCTIONS = 'instructions',
  GAME_OVER = 'game_over',

  // Bluff Battle phases
  BB_PROMPT = 'bb_prompt',
  BB_SUBMIT = 'bb_submit',
  BB_VOTING = 'bb_voting',
  BB_REVEAL = 'bb_reveal',
  BB_SCORES = 'bb_scores',

  // Village of Shadows phases
  VOS_ROLE_REVEAL = 'vos_role_reveal',
  VOS_NIGHT = 'vos_night',
  VOS_NIGHT_RESULT = 'vos_night_result',
  VOS_DAY = 'vos_day',
  VOS_VOTE = 'vos_vote',
  VOS_VOTE_RESULT = 'vos_vote_result',
}

/** Input types that players can submit */
export enum InputType {
  TEXT = 'text',
  VOTE = 'vote',
  CONFIRM = 'confirm',
  NIGHT_ACTION = 'night_action',
}

/** Village of Shadows roles */
export enum VillageRole {
  VILLAGER = 'villager',
  WEREWOLF = 'werewolf',
  SEER = 'seer',
  DOCTOR = 'doctor',
}

/** WebSocket close codes */
export enum CloseCode {
  NORMAL = 1000,
  GOING_AWAY = 1001,
  ROOM_CLOSED = 4000,
  KICKED = 4001,
  INVALID_SESSION = 4002,
  ROOM_FULL = 4003,
}

/** Client-to-server message types */
export enum ClientMessageType {
  JOIN_ROOM = 'join_room',
  REJOIN = 'rejoin',
  JOIN_DISPLAY = 'join_display',
  SELECT_GAME = 'select_game',
  START_GAME = 'start_game',
  SUBMIT_INPUT = 'submit_input',
  KICK_PLAYER = 'kick_player',
  RETURN_TO_LOBBY = 'return_to_lobby',
  CLOSE_ROOM = 'close_room',
  PING = 'ping',
}

/** Server-to-client message types */
export enum ServerMessageType {
  ROOM_STATE = 'room_state',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  PLAYER_KICKED = 'player_kicked',
  GAME_SELECTED = 'game_selected',
  GAME_STARTED = 'game_started',
  PHASE_CHANGED = 'phase_changed',
  TIMER_TICK = 'timer_tick',
  TIMER_EXPIRED = 'timer_expired',
  INPUT_ACCEPTED = 'input_accepted',
  INPUT_REJECTED = 'input_rejected',
  PRIVATE_STATE = 'private_state',
  SCORE_UPDATE = 'score_update',
  GAME_OVER = 'game_over',
  ROOM_CLOSED = 'room_closed',
  ERROR = 'error',
  PONG = 'pong',
  JOINED = 'joined',
  /** Custom game event — platform routes without interpreting (Tier 2 event bus) */
  GAME_EVENT = 'game_event',
}

// ── Tier 1 platform event names ────────────────────────────────────────────
// These are the standard events the platform handles automatically.
// Defined here so games can reference them without magic strings.
export const PlatformEvent = {
  PHASE_CHANGED:      'phase:changed',
  SCORE_UPDATED:      'score:updated',
  GAME_OVER:          'game:over',
  PLAYER_ELIMINATED:  'player:eliminated',
  TIMER_EXPIRED:      'timer:expired',
} as const;

export type PlatformEventName = typeof PlatformEvent[keyof typeof PlatformEvent];

