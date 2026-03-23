import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface HomeScreenProps {
  onRoomCreated: (roomId: string, code: string, qrDataUrl: string) => void;
  reconnecting?: boolean;
}

export function HomeScreen({ onRoomCreated, reconnecting }: HomeScreenProps) {
  const [error, setError] = useState('');

  useEffect(() => {
    // Don't auto-create a room while we're trying to reconnect to an existing one
    if (reconnecting) return;

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
          setError('Could not connect. Retrying...');
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
  }, [onRoomCreated, reconnecting]);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <img src="/boredless-logo.png" alt="Boredless" className="w-80" />

        {reconnecting ? (
          <div className="flex items-center gap-3 text-indigo-400/80 text-lg">
            <Loader2 size={20} className="animate-spin" />
            <span>Reconnecting to room...</span>
          </div>
        ) : error ? (
          <p className="text-red-400/80 text-lg">{error}</p>
        ) : (
          <div className="flex items-center gap-3 text-gray-500 text-lg">
            <Loader2 size={20} className="animate-spin" />
            <span>Starting up...</span>
          </div>
        )}
      </div>
    </div>
  );
}
