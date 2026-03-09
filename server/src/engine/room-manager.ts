import type { Room, Player, Session } from '@boredless/shared';
import {
  RoomStatus,
  PlayerStatus,
  DeviceType,
  ServerMessageType,
  MAX_PLAYERS_PER_ROOM,
  PLAYER_COLORS,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_INACTIVITY_TIMEOUT_MS,
} from '@boredless/shared';
import { generateId, generateToken } from '../utils/id.js';
import { generateRoomCode } from '../utils/code.js';
import { sessionRegistry } from '../ws/registry.js';
import { sendToSession, sendToSessions } from '../ws/send.js';
import { logger } from '../utils/logger.js';
import QRCode from 'qrcode';
import type { ServerConfig } from '../config.js';

class RoomManager {
  /** roomId → Room */
  private rooms = new Map<string, Room>();
  /** roomCode → roomId */
  private codeToRoom = new Map<string, string>();
  /** sessionId → Session */
  private sessions = new Map<string, Session>();
  /** roomId → game state (opaque, managed by game modules) */
  private gameStates = new Map<string, unknown>();
  /** Cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;

  private config: ServerConfig | null = null;

  init(config: ServerConfig) {
    this.config = config;
    // Clear any existing cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  /** Create a new room. Returns room ID, code, and QR data URL. */
  async createRoom(): Promise<{ roomId: string; code: string; qrDataUrl: string }> {
    // Generate unique code
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.codeToRoom.has(code));

    const roomId = generateId();
    const now = Date.now();

    const room: Room = {
      id: roomId,
      code,
      status: RoomStatus.WAITING_FOR_PLAYERS,
      hostPlayerId: '', // Set when first player joins
      displaySessionId: null,
      players: [],
      selectedGameId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(roomId, room);
    this.codeToRoom.set(code, roomId);

    // Generate QR code
    const joinUrl = `${this.config!.baseUrl}/join/${code}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    logger.info('Room created', { roomId, code });
    return { roomId, code, qrDataUrl };
  }

  /** Register a display session for a room */
  registerDisplay(roomId: string): Session | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const session: Session = {
      id: generateId(),
      roomId,
      deviceType: DeviceType.DISPLAY,
      playerId: null,
      reconnectToken: generateToken(),
      connected: true,
      lastSeenAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    room.displaySessionId = session.id;

    // If room was waiting, move to lobby
    if (room.status === RoomStatus.WAITING_FOR_PLAYERS) {
      room.status = RoomStatus.IN_LOBBY;
    }

    room.updatedAt = Date.now();
    logger.info('Display registered', { roomId, sessionId: session.id });
    return session;
  }

  /** Add a player to a room */
  joinRoom(
    roomCode: string,
    playerName: string,
    preferredColor: string | null,
  ): { session: Session; player: Player; room: Room } | { error: string } {
    const roomId = this.codeToRoom.get(roomCode.toUpperCase());
    if (!roomId) return { error: 'Room not found' };

    const room = this.rooms.get(roomId)!;

    // Check room status
    if (room.status === RoomStatus.CLOSED) {
      return { error: 'Room is closed' };
    }
    if (room.status === RoomStatus.IN_GAME) {
      return { error: 'Game already in progress' };
    }

    // Check player count
    const activePlayers = room.players.filter(p => p.status !== PlayerStatus.REMOVED);
    if (activePlayers.length >= MAX_PLAYERS_PER_ROOM) {
      return { error: 'Room is full' };
    }

    // Assign color
    const usedColors = new Set(activePlayers.map(p => p.color));
    const color = (preferredColor && !usedColors.has(preferredColor))
      ? preferredColor
      : (PLAYER_COLORS.find(c => !usedColors.has(c)) ?? PLAYER_COLORS[0]);

    const playerId = generateId();
    const sessionId = generateId();
    const now = Date.now();

    const player: Player = {
      id: playerId,
      name: playerName,
      color,
      status: PlayerStatus.CONNECTED,
      isHost: room.players.length === 0, // First player is host
      sessionId,
      joinedAt: now,
      disconnectedAt: null,
    };

    const session: Session = {
      id: sessionId,
      roomId,
      deviceType: DeviceType.PHONE,
      playerId,
      reconnectToken: generateToken(),
      connected: true,
      lastSeenAt: now,
    };

    room.players.push(player);
    this.sessions.set(sessionId, session);

    if (!room.hostPlayerId) {
      room.hostPlayerId = playerId;
    }

    // Ensure room is in lobby status
    if (room.status === RoomStatus.WAITING_FOR_PLAYERS) {
      room.status = RoomStatus.IN_LOBBY;
    }

    room.updatedAt = now;

    // Notify display and other players
    const otherSessionIds = this.getPlayerSessionIds(room, playerId);
    if (room.displaySessionId) {
      otherSessionIds.push(room.displaySessionId);
    }

    sendToSessions(otherSessionIds, {
      type: ServerMessageType.PLAYER_JOINED,
      playerId,
      playerName,
      playerColor: color,
      playerCount: activePlayers.length + 1,
    });

    logger.info('Player joined', { roomId, playerId, playerName });
    return { session, player, room };
  }

  /** Handle player disconnect */
  handleDisconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.connected = false;
    const room = this.rooms.get(session.roomId);
    if (!room) return;

    if (session.deviceType === DeviceType.DISPLAY) {
      logger.info('Display disconnected', { roomId: room.id, sessionId });
      return;
    }

    const player = room.players.find(p => p.sessionId === sessionId);
    if (!player) return;

    player.status = PlayerStatus.DISCONNECTED;
    player.disconnectedAt = Date.now();

    // Notify others
    const otherSessionIds = this.getPlayerSessionIds(room, player.id);
    if (room.displaySessionId) {
      otherSessionIds.push(room.displaySessionId);
    }

    sendToSessions(otherSessionIds, {
      type: ServerMessageType.PLAYER_LEFT,
      playerId: player.id,
      playerName: player.name,
      playerCount: room.players.filter(p => p.status === PlayerStatus.CONNECTED).length,
    });

    room.updatedAt = Date.now();
    logger.info('Player disconnected', { roomId: room.id, playerId: player.id });
  }

  /** Handle player reconnect */
  rejoin(
    sessionId: string,
    reconnectToken: string,
  ): { session: Session; player: Player; room: Room } | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'Session not found' };
    if (session.reconnectToken !== reconnectToken) return { error: 'Invalid token' };

    const room = this.rooms.get(session.roomId);
    if (!room) return { error: 'Room no longer exists' };

    // Check grace period
    const player = room.players.find(p => p.sessionId === sessionId);
    if (!player) return { error: 'Player not found' };

    if (player.disconnectedAt) {
      const elapsed = Date.now() - player.disconnectedAt;
      if (elapsed > RECONNECT_GRACE_PERIOD_MS) {
        return { error: 'Reconnect grace period expired' };
      }
    }

    // Restore connection
    session.connected = true;
    session.lastSeenAt = Date.now();
    player.status = PlayerStatus.CONNECTED;
    player.disconnectedAt = null;

    // Notify others
    const otherSessionIds = this.getPlayerSessionIds(room, player.id);
    if (room.displaySessionId) {
      otherSessionIds.push(room.displaySessionId);
    }

    sendToSessions(otherSessionIds, {
      type: ServerMessageType.PLAYER_JOINED,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      playerCount: room.players.filter(p => p.status === PlayerStatus.CONNECTED).length,
    });

    room.updatedAt = Date.now();
    logger.info('Player reconnected', { roomId: room.id, playerId: player.id });
    return { session, player, room };
  }

  /** Kick a player (host only) */
  kickPlayer(roomId: string, requestingPlayerId: string, targetPlayerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostPlayerId !== requestingPlayerId) return false;

    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return false;

    target.status = PlayerStatus.REMOVED;

    // Close their WebSocket
    const ws = sessionRegistry.getSocket(target.sessionId);
    if (ws) {
      sendToSession(target.sessionId, {
        type: ServerMessageType.PLAYER_KICKED,
        playerId: target.id,
        playerName: target.name,
      });
      ws.close(4001, 'Kicked by host');
    }

    // Notify others
    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, {
      type: ServerMessageType.PLAYER_KICKED,
      playerId: target.id,
      playerName: target.name,
    });

    room.updatedAt = Date.now();
    return true;
  }

  /** Select a game */
  selectGame(roomId: string, requestingPlayerId: string, gameId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostPlayerId !== requestingPlayerId) return false;
    if (room.status !== RoomStatus.IN_LOBBY) return false;

    room.selectedGameId = gameId;
    room.updatedAt = Date.now();

    // Notify all
    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, {
      type: ServerMessageType.GAME_SELECTED,
      gameId: gameId as any,
      gameName: gameId, // Game registry will provide proper name
    });

    return true;
  }

  /** Close a room */
  closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = RoomStatus.CLOSED;

    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, {
      type: ServerMessageType.ROOM_CLOSED,
      reason: 'Room closed by host',
    });

    // Clean up
    this.codeToRoom.delete(room.code);
    this.rooms.delete(roomId);
    this.gameStates.delete(roomId);

    for (const player of room.players) {
      this.sessions.delete(player.sessionId);
    }
    if (room.displaySessionId) {
      this.sessions.delete(room.displaySessionId);
    }

    logger.info('Room closed', { roomId });
  }

  /** Return to lobby */
  returnToLobby(roomId: string, requestingPlayerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostPlayerId !== requestingPlayerId) return false;

    room.status = RoomStatus.IN_LOBBY;
    room.selectedGameId = null;
    this.gameStates.delete(roomId);
    room.updatedAt = Date.now();

    // Broadcast full state
    this.broadcastRoomState(roomId);
    return true;
  }

  // === Getters ===

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): Room | undefined {
    const roomId = this.codeToRoom.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getPlayerBySessionId(sessionId: string): Player | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const room = this.rooms.get(session.roomId);
    if (!room) return undefined;
    return room.players.find(p => p.sessionId === sessionId);
  }

  /** Get game state for a room */
  getGameState<T>(roomId: string): T | undefined {
    return this.gameStates.get(roomId) as T | undefined;
  }

  /** Set game state for a room */
  setGameState(roomId: string, state: unknown): void {
    this.gameStates.set(roomId, state);
  }

  /** Update room status */
  setRoomStatus(roomId: string, status: RoomStatus): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = status;
      room.updatedAt = Date.now();
    }
  }

  /** Get active (non-removed) players in a room */
  getActivePlayers(roomId: string): Player[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.players.filter(p => p.status !== PlayerStatus.REMOVED);
  }

  /** Get connected players in a room */
  getConnectedPlayers(roomId: string): Player[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.players.filter(p => p.status === PlayerStatus.CONNECTED);
  }

  /** Broadcast full room state to all sessions in a room */
  broadcastRoomState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const publicRoom = this.getPublicRoomState(room);
    const message = {
      type: ServerMessageType.ROOM_STATE as const,
      room: publicRoom,
      phase: null,
      gamePublicState: null,
    };

    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, message);
  }

  /** Get public room state (safe for display) */
  getPublicRoomState(room: Room) {
    return {
      code: room.code,
      status: room.status,
      players: room.players
        .filter(p => p.status !== PlayerStatus.REMOVED)
        .map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          status: p.status,
          isHost: p.isHost,
        })),
      selectedGameId: room.selectedGameId,
      hostPlayerId: room.hostPlayerId,
    };
  }

  // === Private helpers ===

  private getPlayerSessionIds(room: Room, excludePlayerId?: string): string[] {
    return room.players
      .filter(p => p.status === PlayerStatus.CONNECTED && p.id !== excludePlayerId)
      .map(p => p.sessionId);
  }

  private getAllSessionIds(room: Room): string[] {
    const ids = room.players
      .filter(p => p.status !== PlayerStatus.REMOVED)
      .map(p => p.sessionId);
    if (room.displaySessionId) {
      ids.push(room.displaySessionId);
    }
    return ids;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      // Check for inactive rooms
      if (now - room.updatedAt > ROOM_INACTIVITY_TIMEOUT_MS) {
        logger.info('Cleaning up inactive room', { roomId });
        this.closeRoom(roomId);
        continue;
      }

      // Check for expired disconnected players
      for (const player of room.players) {
        if (
          player.status === PlayerStatus.DISCONNECTED &&
          player.disconnectedAt &&
          now - player.disconnectedAt > RECONNECT_GRACE_PERIOD_MS
        ) {
          player.status = PlayerStatus.REMOVED;
          logger.info('Removed expired player', { roomId, playerId: player.id });
        }
      }
    }
  }
}

export const roomManager = new RoomManager();
