import { DeviceType, PlayerStatus, RoomStatus } from '../enums.js';

/** A player in a room */
export interface Player {
  id: string;             // nanoid
  name: string;
  color: string;          // hex color from PLAYER_COLORS
  status: PlayerStatus;
  isHost: boolean;
  sessionId: string;      // links to Session
  joinedAt: number;       // timestamp ms
  disconnectedAt: number | null;
}

/** A device session (display or phone) */
export interface Session {
  id: string;              // nanoid
  roomId: string;
  deviceType: DeviceType;
  playerId: string | null; // null for display sessions
  reconnectToken: string;  // nanoid, used for reconnect
  connected: boolean;
  lastSeenAt: number;      // timestamp ms
}

/** A room */
export interface Room {
  id: string;              // nanoid
  code: string;            // 4-char room code
  status: RoomStatus;
  hostPlayerId: string;
  displaySessionId: string | null;
  players: Player[];
  selectedGameId: string | null;
  createdAt: number;       // timestamp ms
  updatedAt: number;       // timestamp ms
}

/** Public room state sent to display */
export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  players: PublicPlayerState[];
  selectedGameId: string | null;
  hostPlayerId: string;
}

/** Public player info (safe to show on display) */
export interface PublicPlayerState {
  id: string;
  name: string;
  color: string;
  status: PlayerStatus;
  isHost: boolean;
}

/** Room creation response */
export interface CreateRoomResponse {
  roomId: string;
  code: string;
  qrDataUrl: string;      // Base64 data URL of QR code
}

/** Room info response (for join page) */
export interface RoomInfoResponse {
  code: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
}

/** Join response sent after successful WebSocket join */
export interface JoinResult {
  sessionId: string;
  playerId: string;
  reconnectToken: string;
  room: PublicRoomState;
}
