import { useState, useEffect } from 'react';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { useConnectionStore } from './store/connection';
import { useGameStore } from './store/game';
import { useRoomStore } from './store/room';
import { ServerMessageType } from '@boredless/shared';
import type { PublicRoomState } from '@boredless/shared';

type AppScreen = 'join' | 'lobby' | 'game';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('join');
  const connected = useConnectionStore((s) => s.connected);
  const on = useConnectionStore((s) => s.on);
  const resetGame = useGameStore((s) => s.reset);
  const setRoom = useRoomStore((s) => s.setRoom);
  const resetRoom = useRoomStore((s) => s.reset);

  // Listen for room state updates (player joins/leaves, game selected, etc.)
  useEffect(() => {
    const unsub = on(ServerMessageType.ROOM_STATE, (msg) => {
      const m = msg as { type: string; room: PublicRoomState };
      setRoom(m.room);
    });
    return unsub;
  }, [on, setRoom]);

  // Handle room closure / disconnect — send back to join
  useEffect(() => {
    const unsub = on(ServerMessageType.ROOM_CLOSED, () => {
      resetGame();
      resetRoom();
      setScreen('join');
    });
    return unsub;
  }, [on, resetGame, resetRoom]);

  // If disconnected unexpectedly and not on join screen, go back
  useEffect(() => {
    if (!connected && screen !== 'join') {
      const timeout = setTimeout(() => {
        if (!useConnectionStore.getState().connected) {
          resetRoom();
          setScreen('join');
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [connected, screen, resetRoom]);

  return (
    <div className="w-full min-h-dvh bg-gray-950">
      {screen === 'join' && (
        <JoinScreen onJoined={() => setScreen('lobby')} />
      )}
      {screen === 'lobby' && (
        <LobbyScreen onGameStarted={() => setScreen('game')} />
      )}
      {screen === 'game' && (
        <GameScreen />
      )}
    </div>
  );
}
