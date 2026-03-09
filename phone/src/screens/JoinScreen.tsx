import { useState } from 'react';
import { useConnectionStore } from '../store/connection';

interface Props {
  onJoined: () => void;
}

export function JoinScreen({ onJoined }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const connect = useConnectionStore((s) => s.connect);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim()) {
      setError('Please enter a room code and your name');
      return;
    }
    if (code.trim().length !== 4) {
      setError('Room code must be 4 characters');
      return;
    }

    setError('');
    setJoining(true);
    try {
      await connect(code.toUpperCase(), name.trim());
      onJoined();
    } catch (err) {
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
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 py-8 bg-gray-950">
      <h1 className="text-5xl font-bold text-indigo-400 mb-2">Boredless</h1>
      <p className="text-gray-400 text-lg mb-10">Enter the code from the TV</p>

      {/* Room code input */}
      <input
        type="text"
        value={code}
        onChange={handleCodeChange}
        onKeyDown={handleKeyDown}
        placeholder="ABCD"
        className="
          w-4/5 max-w-xs
          text-4xl font-bold text-white text-center tracking-widest
          bg-gray-800 rounded-2xl
          px-4 py-4
          mb-4
          border-2 border-gray-700 focus:border-indigo-500
          outline-none
          uppercase
        "
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 16))}
        onKeyDown={handleKeyDown}
        placeholder="Your name"
        className="
          w-4/5 max-w-xs
          text-xl text-white text-center
          bg-gray-800 rounded-2xl
          px-4 py-4
          mb-6
          border-2 border-gray-700 focus:border-indigo-500
          outline-none
        "
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {/* Error message */}
      {error && (
        <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
      )}

      {/* Join button */}
      <button
        onClick={handleJoin}
        disabled={joining}
        className="
          w-4/5 max-w-xs
          bg-indigo-600 hover:bg-indigo-500
          disabled:opacity-50 disabled:cursor-not-allowed
          text-white text-xl font-bold
          rounded-2xl
          py-4 px-10
          min-h-[44px]
          transition-colors
        "
      >
        {joining ? 'Joining...' : 'Join Game'}
      </button>
    </div>
  );
}
