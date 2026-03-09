import { useState } from 'react';
import { useConnectionStore } from '../store/connection';
import { useRoomStore } from '../store/room';
import type { ServerMessage, PublicRoomState } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';
import { ArrowRight, Loader2 } from 'lucide-react';

interface Props {
  onJoined: () => void;
}

export function JoinScreen({ onJoined }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const connect = useConnectionStore((s) => s.connect);
  const on = useConnectionStore((s) => s.on);
  const setRoom = useRoomStore((s) => s.setRoom);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim()) {
      setError('Enter a room code and your name');
      return;
    }
    if (code.trim().length !== 4) {
      setError('Room code is 4 characters');
      return;
    }

    setError('');
    setJoining(true);

    const unsub = on(ServerMessageType.JOINED, (msg: ServerMessage) => {
      const m = msg as { type: string; result: { room: PublicRoomState } };
      setRoom(m.result.room);
      unsub();
    });

    try {
      await connect(code.toUpperCase(), name.trim());
      onJoined();
    } catch (err) {
      unsub();
      setError(err instanceof Error ? err.message : 'Could not join room');
      setJoining(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase().slice(0, 4));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-gray-950 to-gray-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-indigo-500/8 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-8 py-12">
        {/* Brand */}
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-1">
          Boredless
        </h1>
        <p className="text-gray-500 text-sm mb-12">Enter the code from the TV</p>

        {/* Code input */}
        <div className="w-full max-w-xs mb-4">
          <label className="text-xs text-gray-500 uppercase tracking-wider ml-1 mb-1.5 block">Room Code</label>
          <input
            type="text"
            value={code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            placeholder="ABCD"
            className="w-full text-3xl font-bold text-white text-center tracking-[0.3em]
              bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-4
              border border-white/10 focus:border-indigo-500/50
              outline-none uppercase
              placeholder:text-gray-700 placeholder:tracking-[0.3em]
              transition-colors"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {/* Name input */}
        <div className="w-full max-w-xs mb-8">
          <label className="text-xs text-gray-500 uppercase tracking-wider ml-1 mb-1.5 block">Your Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            onKeyDown={handleKeyDown}
            placeholder="Enter your name"
            className="w-full text-lg text-white text-center
              bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-4
              border border-white/10 focus:border-indigo-500/50
              outline-none
              placeholder:text-gray-700
              transition-colors"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-red-400/80 text-sm mb-4 text-center">{error}</p>
        )}

        {/* Join button */}
        <button
          onClick={handleJoin}
          disabled={joining || !code.trim() || !name.trim()}
          className="w-full max-w-xs flex items-center justify-center gap-3
            bg-indigo-600 hover:bg-indigo-500
            disabled:bg-white/5 disabled:text-gray-600
            text-white text-lg font-semibold
            rounded-2xl py-4
            min-h-[56px]
            transition-all duration-200"
        >
          {joining ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Joining...
            </>
          ) : (
            <>
              Join Game
              <ArrowRight size={20} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
