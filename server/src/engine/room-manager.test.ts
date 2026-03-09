import { describe, it, expect, beforeEach } from 'vitest';
import { roomManager } from './room-manager';

// NOTE: roomManager is a singleton. Tests must account for shared state.
// In a real setup, you'd refactor to allow isolated instances.
// For MVP, these tests verify the public API contract.

describe('RoomManager', () => {
  beforeEach(() => {
    // roomManager.init() needs a config — provide minimal
    roomManager.init({
      port: 3100,
      host: '0.0.0.0',
      corsOrigins: [],
      baseUrl: 'http://localhost:3100',
    });
  });

  describe('createRoom', () => {
    it('returns roomId, code, and qrDataUrl', async () => {
      const result = await roomManager.createRoom();
      expect(result.roomId).toBeTruthy();
      expect(result.code).toHaveLength(4);
      expect(result.qrDataUrl).toContain('data:image/png');
    });

    it('generates unique codes', async () => {
      const r1 = await roomManager.createRoom();
      const r2 = await roomManager.createRoom();
      expect(r1.code).not.toBe(r2.code);
    });
  });

  describe('joinRoom', () => {
    it('adds player to room', async () => {
      const { code } = await roomManager.createRoom();
      const result = roomManager.joinRoom(code, 'Alice', null);
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.player.name).toBe('Alice');
        expect(result.player.isHost).toBe(true); // First player is host
        expect(result.session.reconnectToken).toBeTruthy();
      }
    });

    it('first player becomes host', async () => {
      const { code } = await roomManager.createRoom();
      const r1 = roomManager.joinRoom(code, 'Alice', null);
      const r2 = roomManager.joinRoom(code, 'Bob', null);
      if (!('error' in r1)) expect(r1.player.isHost).toBe(true);
      if (!('error' in r2)) expect(r2.player.isHost).toBe(false);
    });

    it('rejects invalid room code', () => {
      const result = roomManager.joinRoom('ZZZZ', 'Alice', null);
      expect('error' in result).toBe(true);
    });

    it('assigns different colors to players', async () => {
      const { code } = await roomManager.createRoom();
      const r1 = roomManager.joinRoom(code, 'Alice', null);
      const r2 = roomManager.joinRoom(code, 'Bob', null);
      if (!('error' in r1) && !('error' in r2)) {
        expect(r1.player.color).not.toBe(r2.player.color);
      }
    });
  });

  describe('getRoomByCode', () => {
    it('finds room by code', async () => {
      const { code, roomId } = await roomManager.createRoom();
      const room = roomManager.getRoomByCode(code);
      expect(room).toBeDefined();
      expect(room!.id).toBe(roomId);
    });

    it('is case-insensitive', async () => {
      const { code } = await roomManager.createRoom();
      const room = roomManager.getRoomByCode(code.toLowerCase());
      expect(room).toBeDefined();
    });

    it('returns undefined for unknown code', () => {
      expect(roomManager.getRoomByCode('NOPE')).toBeUndefined();
    });
  });
});
