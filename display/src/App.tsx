import { useState, useEffect } from 'react';
import { useConnectionStore } from './store/connection';
import { useRoomStore } from './store/room';
import { useWebSocketSync } from './hooks/useWebSocket';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { RoomStatus } from '@boredless/shared';

type AppScreen = 'home' | 'lobby' | 'game';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const room = useRoomStore((s) => s.room);
  const connect = useConnectionStore((s) => s.connect);

  useWebSocketSync();

  // Auto-advance screens based on room status
  useEffect(() => {
    if (!room) return;
    if (room.status === RoomStatus.IN_GAME || room.status === RoomStatus.GAME_STARTING) {
      setScreen('game');
    } else if (room.status === RoomStatus.IN_LOBBY || room.status === RoomStatus.WAITING_FOR_PLAYERS) {
      setScreen('lobby');
    } else if (room.status === RoomStatus.GAME_ENDED) {
      setScreen('game'); // Show game over screen
    }
  }, [room?.status]);

  const handleRoomCreated = (roomId: string, _code: string, qrUrl: string) => {
    setQrDataUrl(qrUrl);
    connect(roomId);
    setScreen('lobby');
  };

  return (
    <div className="w-full h-full">
      {screen === 'home' && <HomeScreen onRoomCreated={handleRoomCreated} />}
      {screen === 'lobby' && <LobbyScreen qrDataUrl={qrDataUrl} />}
      {screen === 'game' && <GameScreen />}
    </div>
  );
}
