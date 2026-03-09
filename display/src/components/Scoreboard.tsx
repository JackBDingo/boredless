import type { ScoreEntry } from '@boredless/shared';
import { Trophy } from 'lucide-react';

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
          className="flex items-center gap-4 py-4 px-6 border-b border-white/5"
        >
          <span className={`text-2xl font-bold w-8 ${
            index === 0 ? 'text-amber-400' : 'text-gray-600'
          }`}>
            {index === 0 ? <Trophy size={24} className="text-amber-400" /> : index + 1}
          </span>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: entry.playerColor }}
          >
            {entry.playerName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white font-medium flex-1 text-lg">{entry.playerName}</span>
          {showRoundScore && entry.roundScore > 0 && (
            <span className="text-emerald-400 text-sm font-medium">+{entry.roundScore}</span>
          )}
          <span className="text-2xl font-bold text-white">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}
