import type { PublicPlayerState } from '@boredless/shared';
import { PlayerStatus } from '@boredless/shared';

interface PlayerListProps {
  players: PublicPlayerState[];
  hostPlayerId: string;
}

export function PlayerList({ players, hostPlayerId }: PlayerListProps) {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {players.map((player) => (
        <div
          key={player.id}
          className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            player.status === PlayerStatus.DISCONNECTED ? 'opacity-50' : ''
          }`}
          style={{ backgroundColor: player.color + '33', borderColor: player.color, borderWidth: 2 }}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
          <span className="text-white font-medium">{player.name}</span>
          {player.id === hostPlayerId && (
            <span className="text-xs text-yellow-400">👑</span>
          )}
        </div>
      ))}
    </div>
  );
}
