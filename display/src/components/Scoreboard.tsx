import type { ScoreEntry } from '@boredless/shared';

interface ScoreboardProps {
  scores: ScoreEntry[];
  showRoundScore?: boolean;
}

export function Scoreboard({ scores, showRoundScore }: ScoreboardProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      {scores.map((entry, index) => (
        <div
          key={entry.playerId}
          className="flex items-center gap-4 py-3 px-6 border-b border-gray-800"
        >
          <span className="text-2xl font-bold text-gray-500 w-8">
            {index + 1}
          </span>
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: entry.playerColor }} />
          <span className="text-white font-medium flex-1">{entry.playerName}</span>
          {showRoundScore && entry.roundScore > 0 && (
            <span className="text-green-400 text-sm">+{entry.roundScore}</span>
          )}
          <span className="text-2xl font-bold text-white">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}
