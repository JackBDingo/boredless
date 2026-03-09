import { GameId } from '@boredless/shared';
import { Theater, Moon, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const GAME_ICONS: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  [GameId.BLUFF_BATTLE]: {
    icon: Theater,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/15',
  },
  [GameId.VILLAGE_OF_SHADOWS]: {
    icon: Moon,
    color: 'text-violet-400',
    bg: 'bg-violet-500/15',
  },
};

const DEFAULT_GAME_ICON = {
  icon: HelpCircle,
  color: 'text-gray-400',
  bg: 'bg-white/5',
};

export function getGameIcon(gameId: string) {
  return GAME_ICONS[gameId] ?? DEFAULT_GAME_ICON;
}
