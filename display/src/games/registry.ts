import type { ComponentType } from 'react';
import type { PhaseState, ScoreEntry } from '@boredless/shared';

/** Signature for the useGameEvent hook */
type GameEventHook = (event: string, handler: (data: unknown) => void) => void;

export interface DisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  scores: ScoreEntry[];
  useGameEvent: GameEventHook;
}

// Auto-import all game entry points via glob
// Each game's index.ts must export DisplayComponent
const gameModules = import.meta.glob<{ DisplayComponent?: ComponentType<DisplayProps> }>(
  '/games/*/index.ts',
  { eager: true },
);

export const displayRegistry = new Map<string, ComponentType<DisplayProps>>();

for (const [path, mod] of Object.entries(gameModules)) {
  // Extract game directory name from path: /games/bluff-battle/index.ts → bluff-battle
  const match = path.match(/^\/games\/([^/]+)\/index\.ts$/);
  if (!match) continue;

  const gameDirName = match[1]; // e.g. "bluff-battle"

  if (mod.DisplayComponent) {
    // Register by directory name (hyphen) and underscore variant
    displayRegistry.set(gameDirName, mod.DisplayComponent);
    displayRegistry.set(gameDirName.replace(/-/g, '_'), mod.DisplayComponent);
  }
}

export function getDisplayComponent(gameId: string): ComponentType<DisplayProps> | undefined {
  return displayRegistry.get(gameId) ?? displayRegistry.get(gameId.replace(/_/g, '-'));
}
