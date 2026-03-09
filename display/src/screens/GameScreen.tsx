import { useRoomStore } from '../store/room';
import { GameId, PhaseType } from '@boredless/shared';
import { BBDisplay } from '../games/bluff-battle/BBDisplay';
import { VillageDisplay } from '../games/village/VillageDisplay';
import { Scoreboard } from '../components/Scoreboard';
import { Trophy, Moon, Users, Loader2 } from 'lucide-react';

export function GameScreen() {
  const room = useRoomStore((s) => s.room);
  const phase = useRoomStore((s) => s.phase);
  const gamePublicState = useRoomStore((s) => s.gamePublicState);
  const scores = useRoomStore((s) => s.scores);
  const gameOverResult = useRoomStore((s) => s.gameOverResult);

  if (!room || !phase || !gamePublicState) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
        <div className="relative z-10 flex items-center gap-3 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-lg">Loading game...</span>
        </div>
      </div>
    );
  }

  // Game over screen
  if (phase.phaseType === PhaseType.GAME_OVER && gameOverResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 p-8 bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-500/5 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col items-center gap-8">
          <div className="w-24 h-24 rounded-3xl bg-amber-500/15 flex items-center justify-center">
            <Trophy size={48} className="text-amber-400" />
          </div>
          <h1 className="text-5xl font-bold text-white">Game Over</h1>
          {gameOverResult.winnerName && (
            <h2 className="text-3xl text-indigo-400 font-semibold">{gameOverResult.winnerName} wins!</h2>
          )}
          {gameOverResult.winnerTeam && (
            <div className="flex items-center gap-3">
              {gameOverResult.winnerTeam === 'villagers' ? (
                <Users size={28} className="text-emerald-400" />
              ) : (
                <Moon size={28} className="text-red-400" />
              )}
              <h2 className="text-3xl text-white font-semibold">
                {gameOverResult.winnerTeam === 'villagers' ? 'Village wins!' : 'Werewolves win!'}
              </h2>
            </div>
          )}
          <Scoreboard scores={gameOverResult.finalScores} />
        </div>
      </div>
    );
  }

  // Delegate to game-specific display
  switch (room.selectedGameId) {
    case GameId.BLUFF_BATTLE:
      return <BBDisplay phase={phase} publicState={gamePublicState} scores={scores} />;
    case GameId.VILLAGE_OF_SHADOWS:
      return <VillageDisplay phase={phase} publicState={gamePublicState} />;
    default:
      return (
        <div className="flex items-center justify-center h-full bg-gray-950 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
          <p className="relative z-10 text-gray-500 text-lg">Unknown game</p>
        </div>
      );
  }
}
