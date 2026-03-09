import { useRoomStore } from '../store/room';
import { PlayerStatus } from '@boredless/shared';
import { Smartphone, Users, Crown } from 'lucide-react';

interface LobbyScreenProps {
  qrDataUrl: string;
}

export function LobbyScreen({ qrDataUrl }: LobbyScreenProps) {
  const room = useRoomStore((s) => s.room);

  if (!room) return null;

  const connectedPlayers = room.players.filter(p => p.status !== PlayerStatus.REMOVED);
  const hasPlayers = connectedPlayers.length > 0;

  return (
    <div className="flex flex-col h-full bg-gray-950 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col h-full px-16 py-12">
        {/* Header — brand + room code */}
        <div className="flex items-center justify-between">
          <div>
            <img src="/boredless-logo.png" alt="Boredless" className="w-56" />
          </div>
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-sm rounded-2xl px-6 py-3 border border-white/10">
            <Users size={20} className="text-gray-400" />
            <span className="text-gray-400 text-sm">Room</span>
            <span className="text-2xl font-bold tracking-widest text-white">{room.code}</span>
          </div>
        </div>

        {/* Main content — centered */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-24">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-6">
              <div className="bg-white p-4 rounded-3xl shadow-2xl shadow-indigo-500/10">
                <img src={qrDataUrl} alt="Scan to join" className="w-64 h-64 rounded-xl" />
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Smartphone size={18} />
                <span className="text-lg">Scan with your phone to join</span>
              </div>
            </div>

            {/* Divider */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
              <span className="text-gray-600 text-sm uppercase tracking-widest">or</span>
              <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            </div>

            {/* Code entry */}
            <div className="flex flex-col items-center gap-4">
              <p className="text-gray-400 text-lg">Go to</p>
              <p className="text-indigo-400 text-xl font-medium tracking-wide">boredless.live</p>
              <p className="text-gray-500 text-sm">and enter code</p>
              <div className="flex gap-3">
                {room.code.split('').map((char, i) => (
                  <div
                    key={i}
                    className="w-16 h-20 flex items-center justify-center bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl"
                  >
                    <span className="text-4xl font-bold text-white">{char}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Player area — bottom */}
        <div className="pt-6 border-t border-white/5">
          {hasPlayers ? (
            <div className="flex items-center justify-center gap-5">
              {connectedPlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 transition-all duration-300"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-medium text-lg">{player.name}</span>
                  {player.id === room.hostPlayerId && (
                    <Crown size={16} className="text-amber-400" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-gray-600">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-lg">Waiting for players to join</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
