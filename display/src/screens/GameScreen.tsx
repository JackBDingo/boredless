import { useRoomStore } from '../store/room';
import { PhaseType } from '@boredless/shared';
import type { PlayerInfo } from '@boredless/shared';
import type { PublicPlayerState } from '@boredless/shared';
import { Scoreboard } from '../components/Scoreboard';
import { PoweredByLogo } from '../components/PoweredByLogo';
import { useGameEvent } from '../hooks/useGameEvent';
import { Trophy, Loader2 } from 'lucide-react';
import { getDisplayComponent } from '../games/registry';

export function GameScreen() {
  const room = useRoomStore((s) => s.room);
  const phase = useRoomStore((s) => s.phase);
  const gamePublicState = useRoomStore((s) => s.gamePublicState);
  const scores = useRoomStore((s) => s.scores);
  const gameOverResult = useRoomStore((s) => s.gameOverResult);
  const timerMs = useRoomStore((s) => s.timerRemainingMs);

  if (!room || !phase || !gamePublicState) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
        <div className="relative z-10 flex items-center gap-3 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-lg">Loading game...</span>
        </div>
        <PoweredByLogo />
      </div>
    );
  }

  // Build players list from room's public player list
  const players: PlayerInfo[] = room.players.map((p: PublicPlayerState) => ({
    playerId: p.id,
    playerName: p.name,
    playerColor: p.color,
    isAlive: p.status === 'connected' || p.status === 'disconnected',
  }));

  // Game over screen — generic, no game-specific code
  if (phase.phaseType === PhaseType.GAME_OVER && gameOverResult) {
    const teamLabel = gameOverResult.winnerTeamDisplay
      ?? (gameOverResult.winnerTeam
        ? gameOverResult.winnerTeam.charAt(0).toUpperCase() + gameOverResult.winnerTeam.slice(1)
        : null);

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
          {teamLabel && (
            <h2 className="text-3xl text-white font-semibold">{teamLabel} wins!</h2>
          )}
          <Scoreboard scores={gameOverResult.finalScores} />
        </div>
        <PoweredByLogo />
      </div>
    );
  }

  // Delegate to game-specific display via auto-discovered registry
  const gameId = room.selectedGameId;
  const DisplayComponent = gameId ? getDisplayComponent(gameId) : undefined;

  if (DisplayComponent) {
    return (
      <div className="relative h-full">
        <DisplayComponent
          phase={phase}
          publicState={gamePublicState}
          players={players}
          scores={scores}
          timerMs={timerMs}
          useGameEvent={useGameEvent}
        />
        <PoweredByLogo />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <p className="relative z-10 text-gray-500 text-lg">
        {gameId ? `Unknown game: ${gameId}` : 'No game selected'}
      </p>
      <PoweredByLogo />
    </div>
  );
}
