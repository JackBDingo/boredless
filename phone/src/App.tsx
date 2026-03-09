import { useState } from 'react';
import { JoinScreen } from './screens/JoinScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { useConnectionStore } from './store/connection';
import { useGameStore } from './store/game';
import { ServerMessageType } from '@boredless/shared';
import { useEffect } from 'react';

type AppScreen = 'join' | 'lobby' | 'game';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('join');
  const connected = useConnectionStore((s) => s.connected);
  const on = useConnectionStore((s) => s.on);
  const reset = useGameStore((s) => s.reset);

  // Handle room closure / disconnect — send back to join
  useEffect(() => {
    const unsub = on(ServerMessageType.ROOM_CLOSED, () => {
      reset();
      setScreen('join');
    });
    return unsub;
  }, [on, reset]);

  // If disconnected unexpectedly and not on join screen, go back
  useEffect(() => {
    if (!connected && screen !== 'join') {
      // Small delay — might be a brief disconnect during transition
      const timeout = setTimeout(() => {
        if (!useConnectionStore.getState().connected) {
          setScreen('join');
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [connected, screen]);

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
