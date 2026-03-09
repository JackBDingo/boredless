import { useState, useEffect } from 'react';

interface HomeScreenProps {
  onRoomCreated: (roomId: string, code: string, qrDataUrl: string) => void;
}

export function HomeScreen({ onRoomCreated }: HomeScreenProps) {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const createRoom = async () => {
      try {
        const res = await fetch('/api/rooms', { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          onRoomCreated(data.roomId, data.code, data.qrDataUrl);
        }
      } catch (err) {
        console.error('Failed to create room', err);
        if (!cancelled) {
          setError('Could not create room. Retrying...');
          setTimeout(() => {
            if (!cancelled) {
              setError('');
              createRoom();
            }
          }, 3000);
        }
      }
    };

    createRoom();
    return () => { cancelled = true; };
  }, [onRoomCreated]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <h1 className="text-7xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
        Boredless
      </h1>
      <p className="text-xl text-gray-400">Social games for your TV</p>

      {error ? (
        <p className="text-red-400 text-lg">{error}</p>
      ) : (
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Setting up your room...
        </div>
      )}
    </div>
  );
}
