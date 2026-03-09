import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServerMessageType } from '@boredless/shared';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Must be defined BEFORE the module under test is imported so that vi.mock
// hoisting picks them up correctly.

vi.mock('../ws/send.js', () => ({
  sendToSession: vi.fn(),
  sendToSessions: vi.fn(),
}));

vi.mock('../engine/room-manager.js', () => ({
  roomManager: {
    getRoom: vi.fn(),
  },
}));

vi.mock('../engine/timer-engine.js', () => ({
  timerEngine: {
    start: vi.fn(),
    stop: vi.fn(),
    getRemaining: vi.fn(),
  },
}));

vi.mock('../engine/score-engine.js', () => ({
  scoreEngine: {
    init: vi.fn(),
    addPoints: vi.fn(),
    getScore: vi.fn(),
    getScores: vi.fn(),
    broadcastScores: vi.fn(),
    clear: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────
import { createGameContext } from './create-game-context.js';
import { sendToSession, sendToSessions } from '../ws/send.js';
import { roomManager } from '../engine/room-manager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Room-like object with the shape createGameContext expects. */
function makeRoom(opts: {
  playerIds?: string[];
  sessionIds?: string[];
  displaySessionId?: string | null;
  removedPlayerIds?: string[];
} = {}) {
  const {
    playerIds = ['p1', 'p2'],
    sessionIds = ['s1', 's2'],
    displaySessionId = 'display-sess',
    removedPlayerIds = [],
  } = opts;

  return {
    id: 'room-1',
    code: 'ABCD',
    displaySessionId,
    players: playerIds.map((id, i) => ({
      id,
      name: `Player ${i + 1}`,
      sessionId: sessionIds[i] ?? `s${i + 1}`,
      status: removedPlayerIds.includes(id) ? 'removed' : 'connected',
    })),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createGameContext — Event Bus', () => {
  const roomId = 'room-1';
  let ctx: ReturnType<typeof createGameContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(roomManager.getRoom).mockReturnValue(makeRoom() as any);
    ctx = createGameContext(roomId);
  });

  // ── emit ─────────────────────────────────────────────────────────────────

  describe('emit(event, data)', () => {
    it('calls sendToSessions with all session IDs (players + display)', () => {
      ctx.emit('test:event', { foo: 'bar' });

      expect(sendToSessions).toHaveBeenCalledOnce();
      const [sessionIds, msg] = vi.mocked(sendToSessions).mock.calls[0];
      // s1, s2 (players) + display-sess
      expect(sessionIds).toEqual(expect.arrayContaining(['s1', 's2', 'display-sess']));
      expect(sessionIds).toHaveLength(3);
      expect(msg).toEqual({
        type: ServerMessageType.GAME_EVENT,
        event: 'test:event',
        data: { foo: 'bar' },
      });
    });

    it('passes data as null when omitted', () => {
      ctx.emit('test:event');

      const [, msg] = vi.mocked(sendToSessions).mock.calls[0];
      expect(msg).toMatchObject({ data: null });
    });

    it('excludes removed players', () => {
      vi.mocked(roomManager.getRoom).mockReturnValue(
        makeRoom({ playerIds: ['p1', 'p2'], sessionIds: ['s1', 's2'], removedPlayerIds: ['p2'] }) as any,
      );
      ctx = createGameContext(roomId);

      ctx.emit('test:event');

      const [sessionIds] = vi.mocked(sendToSessions).mock.calls[0];
      expect(sessionIds).not.toContain('s2');
      expect(sessionIds).toContain('s1');
    });

    it('sends to all when there is no display session', () => {
      vi.mocked(roomManager.getRoom).mockReturnValue(
        makeRoom({ displaySessionId: null }) as any,
      );
      ctx = createGameContext(roomId);

      ctx.emit('no-display');

      const [sessionIds] = vi.mocked(sendToSessions).mock.calls[0];
      expect(sessionIds).toEqual(expect.arrayContaining(['s1', 's2']));
      expect(sessionIds).not.toContain('display-sess');
    });
  });

  // ── emitTo ───────────────────────────────────────────────────────────────

  describe('emitTo(playerId, event, data)', () => {
    it('calls sendToSession with the correct session ID', () => {
      ctx.emitTo('p1', 'private:event', { secret: 42 });

      expect(sendToSession).toHaveBeenCalledOnce();
      const [sessionId, msg] = vi.mocked(sendToSession).mock.calls[0];
      expect(sessionId).toBe('s1');
      expect(msg).toEqual({
        type: ServerMessageType.GAME_EVENT,
        event: 'private:event',
        data: { secret: 42 },
      });
    });

    it('targets the correct player when multiple players exist', () => {
      ctx.emitTo('p2', 'private:event', { secret: 99 });

      const [sessionId] = vi.mocked(sendToSession).mock.calls[0];
      expect(sessionId).toBe('s2');
    });

    it('does not send to display or other players', () => {
      ctx.emitTo('p1', 'private:event');

      expect(sendToSession).toHaveBeenCalledOnce();
      expect(sendToSessions).not.toHaveBeenCalled();
    });

    it('does nothing when the player is not found', () => {
      ctx.emitTo('unknown-player', 'some:event');

      expect(sendToSession).not.toHaveBeenCalled();
    });

    it('does nothing when the player is removed', () => {
      vi.mocked(roomManager.getRoom).mockReturnValue(
        makeRoom({ playerIds: ['p1', 'p2'], sessionIds: ['s1', 's2'], removedPlayerIds: ['p1'] }) as any,
      );
      ctx = createGameContext(roomId);

      ctx.emitTo('p1', 'some:event');

      expect(sendToSession).not.toHaveBeenCalled();
    });

    it('passes data as null when omitted', () => {
      ctx.emitTo('p1', 'no-data');

      const [, msg] = vi.mocked(sendToSession).mock.calls[0];
      expect(msg).toMatchObject({ data: null });
    });
  });

  // ── emitToDisplay ────────────────────────────────────────────────────────

  describe('emitToDisplay(event, data)', () => {
    it('calls sendToSession with the display session ID', () => {
      ctx.emitToDisplay('display:event', { screen: true });

      expect(sendToSession).toHaveBeenCalledOnce();
      const [sessionId, msg] = vi.mocked(sendToSession).mock.calls[0];
      expect(sessionId).toBe('display-sess');
      expect(msg).toEqual({
        type: ServerMessageType.GAME_EVENT,
        event: 'display:event',
        data: { screen: true },
      });
    });

    it('does not send to player sessions', () => {
      ctx.emitToDisplay('display:event');

      expect(sendToSessions).not.toHaveBeenCalled();
      expect(sendToSession).toHaveBeenCalledOnce();
      const [sessionId] = vi.mocked(sendToSession).mock.calls[0];
      expect(sessionId).toBe('display-sess');
    });

    it('does nothing when there is no display session', () => {
      vi.mocked(roomManager.getRoom).mockReturnValue(
        makeRoom({ displaySessionId: null }) as any,
      );
      ctx = createGameContext(roomId);

      ctx.emitToDisplay('display:event');

      expect(sendToSession).not.toHaveBeenCalled();
    });

    it('passes data as null when omitted', () => {
      ctx.emitToDisplay('display:event');

      const [, msg] = vi.mocked(sendToSession).mock.calls[0];
      expect(msg).toMatchObject({ data: null });
    });
  });

  // ── message shape ────────────────────────────────────────────────────────

  describe('message shape', () => {
    it('all three methods produce type: ServerMessageType.GAME_EVENT', () => {
      ctx.emit('e1');
      ctx.emitTo('p1', 'e2');
      ctx.emitToDisplay('e3');

      const sentViaAll = vi.mocked(sendToSessions).mock.calls[0][1];
      const sentToPlayer = vi.mocked(sendToSession).mock.calls[0][1];
      const sentToDisplay = vi.mocked(sendToSession).mock.calls[1][1];

      expect(sentViaAll.type).toBe(ServerMessageType.GAME_EVENT);
      expect(sentToPlayer.type).toBe(ServerMessageType.GAME_EVENT);
      expect(sentToDisplay.type).toBe(ServerMessageType.GAME_EVENT);
    });

    it('event name is preserved verbatim', () => {
      const eventName = 'bluff:reveal';
      ctx.emit(eventName, {});

      const [, msg] = vi.mocked(sendToSessions).mock.calls[0];
      expect((msg as { event: string }).event).toBe(eventName);
    });

    it('arbitrary data payload is passed through unchanged', () => {
      const payload = { deep: { nested: [1, 2, 3] }, flag: true };
      ctx.emit('complex:event', payload);

      const [, msg] = vi.mocked(sendToSessions).mock.calls[0];
      expect((msg as { data: unknown }).data).toEqual(payload);
    });
  });

  // ── room not found edge case ──────────────────────────────────────────────

  describe('when room is not found', () => {
    beforeEach(() => {
      vi.mocked(roomManager.getRoom).mockReturnValue(undefined as any);
      ctx = createGameContext(roomId);
    });

    it('emit does not throw and sends to empty list', () => {
      expect(() => ctx.emit('safe')).not.toThrow();
      const [sessionIds] = vi.mocked(sendToSessions).mock.calls[0];
      expect(sessionIds).toHaveLength(0);
    });

    it('emitTo does not throw', () => {
      expect(() => ctx.emitTo('p1', 'safe')).not.toThrow();
      expect(sendToSession).not.toHaveBeenCalled();
    });

    it('emitToDisplay does not throw', () => {
      expect(() => ctx.emitToDisplay('safe')).not.toThrow();
      expect(sendToSession).not.toHaveBeenCalled();
    });
  });
});
