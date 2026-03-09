import { useEffect } from 'react';
import { useConnectionStore } from '../store/connection';
import { useRoomStore } from '../store/room';
import { useGameStore } from '../store/game';
import { ServerMessageType, GAME_CATALOG } from '@boredless/shared';
import type { PhaseState } from '@boredless/shared';
import { Crown, Users, Clock, ChevronRight, Check, Loader2 } from 'lucide-react';
import { getGameIcon } from '../lib/gameIcons';
import { PoweredByLogo } from '../components/PoweredByLogo';

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

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [on, setPhase, setPrivateState, onGameStarted]);

  // === NON-HOST: Waiting screen ===
  if (!isHost) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-8 bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-gray-950 to-gray-950" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6">
            <Check size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">You're In!</h1>
          <p className="text-gray-500 text-lg mb-2">
            Waiting for the host to pick a game
          </p>
          {room && (
            <div className="flex items-center gap-2 text-gray-600 text-sm mt-4">
              <Users size={14} />
              <span>{room.players.length} player{room.players.length !== 1 ? 's' : ''} in lobby</span>
            </div>
          )}
          <div className="mt-10">
            <Loader2 size={24} className="text-gray-700 animate-spin" />
          </div>
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // === HOST: Game selection ===
  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-gray-950 to-gray-950" />

      <div className="relative z-10 flex flex-col flex-1 px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown size={18} className="text-amber-400" />
              <span className="text-amber-400 text-sm font-medium">Host</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Pick a game</h1>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
            <Users size={16} className="text-gray-400" />
            <span className="text-white font-medium">{playerCount}</span>
          </div>
        </div>

        {/* Game cards */}
        <div className="flex flex-col gap-3 flex-1">
          {GAME_CATALOG.map((game) => {
            const selected = room.selectedGameId === game.id;
            const enoughPlayers = playerCount >= game.minPlayers;
            const gi = getGameIcon(game.id);
            const IconComponent = gi.icon;

            return (
              <button
                key={game.id}
                onClick={() => send({ type: 'select_game', gameId: game.id })}
                className={`p-5 rounded-2xl border text-left transition-all duration-200 ${
                  selected
                    ? 'border-indigo-500/60 bg-indigo-500/10'
                    : 'border-white/8 bg-white/[0.03] active:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl ${gi.bg} flex items-center justify-center shrink-0`}>
                    <IconComponent size={24} className={gi.color} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-lg font-semibold text-white">{game.name}</h3>
                      {selected && (
                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm leading-relaxed mb-2">{game.description}</p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className={`flex items-center gap-1 ${enoughPlayers ? 'text-gray-500' : 'text-amber-400/80'}`}>
                        <Users size={12} />
                        {game.minPlayers}–{game.maxPlayers}
                      </span>
                      <span className="flex items-center gap-1 text-gray-600">
                        <Clock size={12} />
                        {game.estimatedMinutes} min
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Start button */}
        <div className="mt-6 pb-4">
          {selectedGame ? (
            <button
              onClick={() => send({ type: 'start_game' })}
              disabled={!canStart}
              className={`w-full flex items-center justify-center gap-2
                py-4 rounded-2xl text-lg font-semibold
                transition-all duration-200 ${
                canStart
                  ? 'bg-indigo-600 active:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-white/5 text-gray-600 border border-white/10'
              }`}
            >
              {canStart ? (
                <>
                  Start Game
                  <ChevronRight size={20} />
                </>
              ) : (
                `Need ${selectedGame.minPlayers - playerCount} more player${selectedGame.minPlayers - playerCount === 1 ? '' : 's'}`
              )}
            </button>
          ) : (
            <div className="text-center text-gray-600 text-sm py-4">
              Select a game to continue
            </div>
          )}
        </div>
        <PoweredByLogo />
      </div>
    </div>
  );
}
