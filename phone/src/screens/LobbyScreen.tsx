import { useEffect } from 'react';
import { useConnectionStore } from '../store/connection';
import { useRoomStore } from '../store/room';
import { useGameStore } from '../store/game';
import { ServerMessageType, GAME_CATALOG } from '@boredless/shared';
import type { PhaseState } from '@boredless/shared';

interface Props {
  onGameStarted: () => void;
}

export function LobbyScreen({ onGameStarted }: Props) {
  const on = useConnectionStore((s) => s.on);
  const send = useConnectionStore((s) => s.send);
  const playerId = useConnectionStore((s) => s.playerId);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPrivateState = useGameStore((s) => s.setPrivateState);
  const room = useRoomStore((s) => s.room);

  const isHost = room && playerId === room.hostPlayerId;
  const selectedGame = room ? GAME_CATALOG.find((g) => g.id === room.selectedGameId) : null;
  const playerCount = room?.players.length ?? 0;
  const canStart = selectedGame && playerCount >= selectedGame.minPlayers;

  useEffect(() => {
    const unsub1 = on(ServerMessageType.GAME_STARTED, (msg) => {
      const m = msg as { type: string; phase: PhaseState; gamePublicState: Record<string, unknown> };
      setPhase(m.phase);
      onGameStarted();
    });

    const unsub2 = on(ServerMessageType.PRIVATE_STATE, (msg) => {
      const m = msg as { type: string; state: Record<string, unknown> };
      setPrivateState(m.state);
    });

    const unsub3 = on(ServerMessageType.PHASE_CHANGED, (msg) => {
      const m = msg as { type: string; phase: PhaseState };
      setPhase(m.phase);
      onGameStarted();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [on, setPhase, setPrivateState, onGameStarted]);

  // Non-host: waiting screen
  if (!isHost) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-gray-950">
        <div className="text-6xl mb-6">🎮</div>
        <h1 className="text-4xl font-bold text-emerald-400 mb-3">You're In!</h1>
        <p className="text-gray-400 text-lg text-center mb-4">
          Waiting for the host to start a game...
        </p>
        {room && (
          <p className="text-gray-600 text-sm">
            {room.players.length} player{room.players.length !== 1 ? 's' : ''} in lobby
          </p>
        )}
        <div className="mt-10 flex gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  // Host: game selection + start
  return (
    <div className="flex flex-col min-h-dvh px-6 py-8 bg-gray-950">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-emerald-400">You're the Host! 👑</h1>
        <p className="text-gray-400 mt-1">
          {playerCount} player{playerCount !== 1 ? 's' : ''} in lobby
        </p>
      </div>

      {/* Game Selection */}
      <h2 className="text-lg font-bold text-white mb-3">Pick a game:</h2>
      <div className="flex flex-col gap-3 flex-1">
        {GAME_CATALOG.map((game) => {
          const selected = room.selectedGameId === game.id;
          const enoughPlayers = playerCount >= game.minPlayers;
          return (
            <button
              key={game.id}
              onClick={() => send({ type: 'select_game', gameId: game.id })}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-500/20'
                  : 'border-gray-700 bg-gray-800/50 active:border-gray-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{game.icon}</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{game.name}</h3>
                  <p className="text-gray-400 text-sm">{game.description}</p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span className={enoughPlayers ? 'text-emerald-400' : 'text-amber-400'}>
                      {game.minPlayers}-{game.maxPlayers} players
                    </span>
                    <span>~{game.estimatedMinutes} min</span>
                  </div>
                </div>
                {selected && <span className="text-indigo-400 text-xl">✓</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Start Button */}
      <div className="mt-6 pb-4">
        {selectedGame ? (
          <button
            onClick={() => send({ type: 'start_game' })}
            disabled={!canStart}
            className={`w-full py-4 rounded-2xl text-xl font-bold transition-all ${
              canStart
                ? 'bg-emerald-500 active:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-gray-700 text-gray-500'
            }`}
          >
            {canStart
              ? `Start ${selectedGame.name} 🚀`
              : `Need ${selectedGame.minPlayers - playerCount} more player${selectedGame.minPlayers - playerCount === 1 ? '' : 's'}`
            }
          </button>
        ) : (
          <p className="text-gray-500 text-center text-lg">Select a game above</p>
        )}
      </div>
    </div>
  );
}
