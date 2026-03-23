import { useState, useEffect, useCallback, useRef } from 'react';
import { useConnectionStore } from './store/connection';
import { useRoomStore } from './store/room';
import { useWebSocketSync } from './hooks/useWebSocket';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { RoomStatus } from '@boredless/shared';

type AppScreen = 'home' | 'lobby' | 'game';

const STORAGE_KEY = 'boredless_display_room';

interface SavedRoom {
  roomId: string;
  code: string;
  qrDataUrl: string;
  savedAt: number;
}

function saveRoom(roomId: string, code: string, qrDataUrl: string) {
  const data: SavedRoom = { roomId, code, qrDataUrl, savedAt: Date.now() };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* noop */ }
}

function loadRoom(): SavedRoom | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedRoom;
    // Expire after 4 hours — no room lives forever
    if (Date.now() - data.savedAt > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearRoom() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const room = useRoomStore((s) => s.room);
  const connect = useConnectionStore((s) => s.connect);
  const initDone = useRef(false);

  useWebSocketSync();

  // On mount: try to reconnect to a saved room before creating a new one
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const saved = loadRoom();
    if (!saved) return; // No saved room — HomeScreen will create one

    setReconnecting(true);

    // Validate the room is still alive
    fetch(`/api/rooms/${saved.code}`)
      .then((res) => {
        if (!res.ok) throw new Error('Room gone');
        return res.json();
      })
      .then(() => {
        // Room still exists — reconnect the display
        setQrDataUrl(saved.qrDataUrl);
        connect(saved.roomId);
        // Screen will auto-advance via room status effect below
        setScreen('lobby');
        setReconnecting(false);
      })
      .catch(() => {
        // Room is dead — clear and let HomeScreen create a fresh one
        clearRoom();
        setReconnecting(false);
      });
  }, [connect]);

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

  // When room is closed/cleaned up, clear localStorage and go home
  useEffect(() => {
    if (room?.status === RoomStatus.CLOSED) {
      clearRoom();
      useRoomStore.getState().reset();
      setScreen('home');
    }
  }, [room?.status]);

  const handleRoomCreated = useCallback((roomId: string, code: string, qrUrl: string) => {
    saveRoom(roomId, code, qrUrl);
    setQrDataUrl(qrUrl);
    connect(roomId);
    setScreen('lobby');
  }, [connect]);

  return (
    <div className="w-full h-full">
      {screen === 'home' && <HomeScreen onRoomCreated={handleRoomCreated} reconnecting={reconnecting} />}
      {screen === 'lobby' && <LobbyScreen qrDataUrl={qrDataUrl} />}
      {screen === 'game' && <GameScreen />}
    </div>
  );
}
