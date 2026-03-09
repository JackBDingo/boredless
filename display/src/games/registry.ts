import type { ComponentType } from 'react';
import type { DisplayProps } from './types.js';

export type { DisplayProps } from './types.js';

// Auto-import ONLY display components to avoid pulling in @phone/* imports at build time.
// Glob the display folder directly instead of the barrel index.ts.
const displayModules = import.meta.glob<{ default?: ComponentType<DisplayProps> }>(
  '/games/*/display/*.tsx',
  { eager: true },
);

export const displayRegistry = new Map<string, ComponentType<DisplayProps>>();

for (const [path, mod] of Object.entries(displayModules)) {
  // Extract game directory name: /games/bluff-battle/display/BBDisplay.tsx → bluff-battle
  const match = path.match(/^\/games\/([^/]+)\/display\/[^/]+\.tsx$/);
  if (!match) continue;

  const gameDirName = match[1]; // e.g. "bluff-battle"

  // Each display file's default export is the component
  const Component = mod.default;
  if (Component) {
    // Register by directory name (hyphen) and underscore variant
    displayRegistry.set(gameDirName, Component);
    displayRegistry.set(gameDirName.replace(/-/g, '_'), Component);
  }
}

export function getDisplayComponent(gameId: string): ComponentType<DisplayProps> | undefined {
  return displayRegistry.get(gameId) ?? displayRegistry.get(gameId.replace(/_/g, '-'));
}
