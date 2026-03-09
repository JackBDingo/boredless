import { useRoomStore } from '../store/room';
import { GameId, PhaseType } from '@boredless/shared';
import { BBDisplay } from '../games/bluff-battle/BBDisplay';
import { VillageDisplay } from '../games/village/VillageDisplay';
import { Scoreboard } from '../components/Scoreboard';

export function GameScreen() {
  const room = useRoomStore((s) => s.room);
  const phase = useRoomStore((s) => s.phase);
  const gamePublicState = useRoomStore((s) => s.gamePublicState);
  const scores = useRoomStore((s) => s.scores);
  const gameOverResult = useRoomStore((s) => s.gameOverResult);

  if (!room || !phase || !gamePublicState) {
    return <div className="text-white p-8">Loading game...</div>;
  }

  // Game over screen
  if (phase.phaseType === PhaseType.GAME_OVER && gameOverResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
        <h1 className="text-5xl font-bold text-yellow-400">🎉 Game Over!</h1>
        {gameOverResult.winnerName && (
          <h2 className="text-3xl text-white">{gameOverResult.winnerName} wins!</h2>
        )}
        {gameOverResult.winnerTeam && (
          <h2 className="text-3xl text-white">
            {gameOverResult.winnerTeam === 'villagers' ? '🏘️ Village wins!' : '🐺 Werewolves win!'}
          </h2>
        )}
        <Scoreboard scores={gameOverResult.finalScores} />
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
      return <div className="text-white p-8">Unknown game</div>;
  }
}
