import { QRCode } from '../components/QRCode';
import { PlayerList } from '../components/PlayerList';
import { GameCard } from '../components/GameCard';
import { useRoomStore } from '../store/room';
import { GAME_CATALOG } from '@boredless/shared';

interface LobbyScreenProps {
  qrDataUrl: string;
}

export function LobbyScreen({ qrDataUrl }: LobbyScreenProps) {
  const room = useRoomStore((s) => s.room);

  if (!room) return <div className="text-white p-8">Loading...</div>;

  const selectedGame = GAME_CATALOG.find((g) => g.id === room.selectedGameId);

  return (
    <div className="flex flex-col h-full p-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-white">Lobby</h2>
          <p className="text-gray-400">Scan to join</p>
        </div>
        <QRCode dataUrl={qrDataUrl} roomCode={room.code} />
      </div>

      {/* Players */}
      <div className="mt-8">
        <PlayerList players={room.players} hostPlayerId={room.hostPlayerId} />
      </div>

      {/* Game Display */}
      <div className="mt-8 flex-1">
        {selectedGame ? (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-2">Selected Game</p>
            <div className="inline-block p-6 rounded-2xl border-2 border-indigo-500 bg-indigo-500/20">
              <div className="text-5xl mb-2">{selectedGame.icon}</div>
              <h3 className="text-2xl font-bold text-white">{selectedGame.name}</h3>
              <p className="text-gray-400 text-sm mt-1">{selectedGame.description}</p>
            </div>
            <p className="text-emerald-400 text-lg mt-4 animate-pulse">
              Host is starting the game...
            </p>
          </div>
        ) : (
          <div className="text-center">
            <h3 className="text-xl font-bold text-white mb-4">Games</h3>
            <div className="grid grid-cols-2 gap-4">
              {GAME_CATALOG.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isSelected={false}
                  onSelect={() => {}}
                />
              ))}
            </div>
            <p className="text-gray-500 mt-4">The host picks the game from their phone</p>
          </div>
        )}
      </div>
    </div>
  );
}
