// ============================================================
// ALL CONSTANTS — Magic numbers, timeouts, limits
// ============================================================

/** Room settings */
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1
export const MAX_PLAYERS_PER_ROOM = 12;
export const MIN_PLAYER_NAME_LENGTH = 1;
export const MAX_PLAYER_NAME_LENGTH = 16;

/** Reconnect settings */
export const RECONNECT_GRACE_PERIOD_MS = 30_000; // 30 seconds
export const HEARTBEAT_INTERVAL_MS = 5_000;      // Client pings every 5s
export const HEARTBEAT_TIMEOUT_MS = 15_000;       // Server drops after 15s no ping

/** Available player colors (hex values) */
export const PLAYER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Sky
  '#F0B27A', // Peach
  '#AED6F1', // Light Blue
] as const;

/** Bluff Battle settings */
export const BB_MIN_PLAYERS = 3;
export const BB_MAX_PLAYERS = 8;
export const BB_ROUNDS_DEFAULT = 3;
export const BB_SUBMIT_TIME_SECONDS = 60;
export const BB_VOTE_TIME_SECONDS = 30;
export const BB_REVEAL_TIME_SECONDS = 10;
export const BB_SCORES_TIME_SECONDS = 8;
export const BB_INSTRUCTIONS_TIME_SECONDS = 10;
export const BB_MAX_ANSWER_LENGTH = 100;
export const BB_POINTS_CORRECT_ANSWER = 1000;    // Voting for the correct answer
export const BB_POINTS_FOOLED_PLAYER = 500;      // Each player fooled by your fake

/** Village of Shadows settings */
export const VOS_MIN_PLAYERS = 5;
export const VOS_MAX_PLAYERS = 10;
export const VOS_ROLE_REVEAL_TIME_SECONDS = 10;
export const VOS_NIGHT_TIME_SECONDS = 30;
export const VOS_NIGHT_RESULT_TIME_SECONDS = 8;
export const VOS_DAY_TIME_SECONDS = 120;         // 2 minutes discussion
export const VOS_VOTE_TIME_SECONDS = 30;
export const VOS_VOTE_RESULT_TIME_SECONDS = 8;

/** Server settings */
export const DEFAULT_PORT = 3100;
export const CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:8081'];

/** Timer tick interval */
export const TIMER_TICK_INTERVAL_MS = 1000;

/** Room inactivity timeout */
export const ROOM_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
