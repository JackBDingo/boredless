import { useEffect } from 'react';
import { useConnectionStore } from '../store/connection';
import { useRoomStore } from '../store/room';
import { ServerMessageType, RoomStatus } from '@boredless/shared';
import type { ServerMessage } from '@boredless/shared';

/**
 * Wires incoming WebSocket messages to the room store.
 * Must be called once at the App level.
 */
export function useWebSocketSync(): void {
  const on = useConnectionStore((s) => s.on);
  const store = useRoomStore;

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(on(ServerMessageType.ROOM_STATE, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'room_state' }>;
      store.getState().setRoom(m.room);
      if (m.phase) store.getState().setPhase(m.phase);
      if (m.gamePublicState) store.getState().setGamePublicState(m.gamePublicState);
    }));

    unsubs.push(on(ServerMessageType.PLAYER_JOINED, (_msg) => {
      // Refetch full state isn't needed — room_state is sent on join
      // But we can update player count optimistically
    }));

    unsubs.push(on(ServerMessageType.PHASE_CHANGED, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'phase_changed' }>;
      store.getState().setPhase(m.phase);
      store.getState().setGamePublicState(m.gamePublicState);
    }));

    unsubs.push(on(ServerMessageType.GAME_STARTED, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'game_started' }>;
      store.getState().setPhase(m.phase);
      store.getState().setGamePublicState(m.gamePublicState);
      // Update room status so App switches to game screen
      const room = store.getState().room;
      if (room) {
        store.getState().setRoom({ ...room, status: RoomStatus.IN_GAME });
      }
    }));

    unsubs.push(on(ServerMessageType.TIMER_TICK, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'timer_tick' }>;
      store.getState().setTimer(m.remainingMs);
    }));

    unsubs.push(on(ServerMessageType.SCORE_UPDATE, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'score_update' }>;
      store.getState().setScores(m.scores);
    }));

    unsubs.push(on(ServerMessageType.GAME_OVER, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'game_over' }>;
      store.getState().setGameOver(m.result);
      const room = store.getState().room;
      if (room) {
        store.getState().setRoom({ ...room, status: RoomStatus.GAME_ENDED });
      }
    }));

    return () => unsubs.forEach(fn => fn());
  }, [on]);
}
