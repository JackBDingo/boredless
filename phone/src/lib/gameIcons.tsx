import { Swords, Moon, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Maps manifest `icon` field values to Lucide icon components + theme.
 * Add entries here when new games are created with new icon values.
 * Game IDs are never hardcoded here — only icon names from manifests.
 */
const ICON_REGISTRY: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  swords: {
    icon: Swords,
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/15',
  },
  moon: {
    icon: Moon,
    color: 'text-violet-400',
    bg: 'bg-violet-500/15',
  },
};

const DEFAULT_ICON = {
  icon: HelpCircle,
  color: 'text-gray-400',
  bg: 'bg-white/5',
};

/**
 * Get icon config for a game by its manifest `icon` field value.
 * Falls back to a default icon if not found.
 */
export function getIconConfig(iconName: string) {
  return ICON_REGISTRY[iconName] ?? DEFAULT_ICON;
}
