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

/** Server settings */
export const DEFAULT_PORT = 3100;
export const CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:8081'];

/** Timer tick interval */
export const TIMER_TICK_INTERVAL_MS = 1000;

/** Room inactivity timeout */
export const ROOM_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
