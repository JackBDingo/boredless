import { useEffect, useState } from 'react';
import { usePlatform } from '../platform/BoredlessClient';
import type { GameDefinition } from '@boredless/shared';
import { Crown, Users, Clock, ChevronRight, Check, Loader2 } from 'lucide-react';
import { getIconConfig } from '../lib/gameIcons';
import { PoweredByLogo } from '../components/PoweredByLogo';

/**
 * LobbyScreen — host selects a game, non-hosts wait.
 *
 * NO lifecycle listeners. The platform SDK handles GAME_STARTED/PHASE_CHANGED
 * and transitions the screen automatically. This component just renders UI.
 */
export function LobbyScreen() {
  const send = usePlatform((s) => s.send);
  const room = usePlatform((s) => s.room);
  const playerId = usePlatform((s) => s.playerId);
  const isHost = !!(room && playerId === room.hostPlayerId);

  const [gameCatalog, setGameCatalog] = useState<GameDefinition[]>([]);

  useEffect(() => {
    fetch('/api/games')
      .then((res) => res.json())
      .then((data: GameDefinition[]) => setGameCatalog(data))
      .catch((err) => console.error('Failed to load game catalog:', err));
  }, []);

  const selectedGame = room ? gameCatalog.find((g) => g.id === room.selectedGameId) : null;
  const playerCount = room?.players.length ?? 0;
  const canStart = selectedGame && playerCount >= selectedGame.minPlayers;

  // === NON-HOST: Waiting screen ===
  if (!isHost) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-8 bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-gray-950 to-gray-950" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6">
            <Check size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">You&apos;re In!</h1>
          <p className="text-gray-500 text-lg mb-2">Waiting for the host to pick a game</p>
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

        <div className="flex-1">
          {gameCatalog.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <Loader2 size={24} className="animate-spin mr-2" />Loading games…
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {gameCatalog.map((game) => {
                const selected = room!.selectedGameId === game.id;
                const gi = getIconConfig(game.icon);
                const IconComponent = gi.icon;
                return (
                  <button key={game.id} type="button"
                    onClick={() => send({ type: 'select_game', gameId: game.id })}
                    className={`relative w-[264px] h-[264px] flex flex-col items-center justify-center p-4 rounded-[20px] border text-center transition-all duration-200 backdrop-blur-sm ${
                      selected ? 'border-indigo-500 bg-indigo-500/15 shadow-lg shadow-indigo-500/20'
                        : 'border-white/[0.08] bg-white/[0.03] active:scale-95 active:bg-white/[0.06]'
                    }`}>
                    {!selected && (
                      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/[0.15] px-2 py-0.5 rounded-full border border-emerald-500/30">Free</span>
                    )}
                    {selected && (
                      <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
                        <Check size={13} className="text-white" />
                      </div>
                    )}
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/[0.12] border border-indigo-500/25 flex items-center justify-center mb-3">
                      <IconComponent size={28} className="text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-extrabold text-white mb-2">{game.name}</h3>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="flex items-center gap-1 text-xs text-indigo-300 bg-indigo-500/[0.15] px-2 py-0.5 rounded-full border border-indigo-500/25">
                        <Users size={11} />{game.minPlayers}–{game.maxPlayers}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/10">
                        <Clock size={11} />~{game.estimatedMinutes}m
                      </span>
                    </div>
                    <p className="text-xs text-white/40 leading-snug line-clamp-2">{game.description}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 pb-4">
          {selectedGame ? (
            <button onClick={() => send({ type: 'start_game' })} disabled={!canStart}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-semibold transition-all duration-200 ${
                canStart ? 'bg-indigo-600 active:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                  : 'bg-white/5 text-gray-600 border border-white/10'
              }`}>
              {canStart ? <>Start Game<ChevronRight size={20} /></>
                : `Need ${selectedGame.minPlayers - playerCount} more player${selectedGame.minPlayers - playerCount === 1 ? '' : 's'}`}
            </button>
          ) : (
            <div className="text-center text-gray-600 text-sm py-4">Select a game to continue</div>
          )}
        </div>
        <PoweredByLogo />
      </div>
    </div>
  );
}
