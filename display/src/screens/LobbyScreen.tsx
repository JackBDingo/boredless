import { QRCode } from '../components/QRCode';
import { PlayerList } from '../components/PlayerList';
import { GameCard } from '../components/GameCard';
import { useRoomStore } from '../store/room';
import { useConnectionStore } from '../store/connection';
import { GAME_CATALOG } from '@boredless/shared';

interface LobbyScreenProps {
  qrDataUrl: string;
}

export function LobbyScreen({ qrDataUrl }: LobbyScreenProps) {
  const room = useRoomStore((s) => s.room);
  const send = useConnectionStore((s) => s.send);

  if (!room) return <div className="text-white p-8">Loading...</div>;

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

      {/* Game Selection */}
      <div className="mt-8 flex-1">
        <h3 className="text-xl font-bold text-white mb-4">Choose a Game</h3>
        <div className="grid grid-cols-2 gap-4">
          {GAME_CATALOG.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isSelected={room.selectedGameId === game.id}
              onSelect={() => send({ type: 'select_game', gameId: game.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
