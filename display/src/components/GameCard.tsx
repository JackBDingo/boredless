import type { GameDefinition } from '@boredless/shared';

interface GameCardProps {
  game: GameDefinition;
  isSelected: boolean;
  onSelect: () => void;
}

export function GameCard({ game, isSelected }: GameCardProps) {
  return (
    <div
      className={`p-6 rounded-2xl border-2 text-left ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/20'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <div className="text-4xl mb-2">{game.icon}</div>
      <h3 className="text-xl font-bold text-white">{game.name}</h3>
      <p className="text-gray-400 text-sm mt-1">{game.description}</p>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span>{game.minPlayers}-{game.maxPlayers} players</span>
        <span>~{game.estimatedMinutes} min</span>
      </div>
    </div>
  );
}
