import { useState } from 'react';

interface HomeScreenProps {
  onRoomCreated: (roomId: string, code: string, qrDataUrl: string) => void;
}

export function HomeScreen({ onRoomCreated }: HomeScreenProps) {
  const [creating, setCreating] = useState(false);

  const createRoom = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const data = await res.json();
      onRoomCreated(data.roomId, data.code, data.qrDataUrl);
    } catch (err) {
      console.error('Failed to create room', err);
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <h1 className="text-7xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
        Boredless
      </h1>
      <p className="text-xl text-gray-400">Social games for your TV</p>
      <button
        onClick={createRoom}
        disabled={creating}
        className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-xl font-bold transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create Room'}
      </button>
    </div>
  );
}
