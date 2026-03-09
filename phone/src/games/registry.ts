import type { ComponentType } from 'react';
import type { PhaseState } from '@boredless/shared';

/** Signature for the useGameEvent hook */
type GameEventHook = (event: string, handler: (data: unknown) => void) => void;

export interface PhoneProps {
  phase: PhaseState;
  privateState: Record<string, unknown>;
  useGameEvent: GameEventHook;
}

// Auto-import all game entry points via glob
// Each game's index.ts must export PhoneComponent
const gameModules = import.meta.glob<{ PhoneComponent?: ComponentType<PhoneProps> }>(
  '/games/*/index.ts',
  { eager: true },
);

export const phoneRegistry = new Map<string, ComponentType<PhoneProps>>();

for (const [path, mod] of Object.entries(gameModules)) {
  // Extract game directory name from path: /games/bluff-battle/index.ts → bluff-battle
  const match = path.match(/^\/games\/([^/]+)\/index\.ts$/);
  if (!match) continue;

  const gameDirName = match[1]; // e.g. "bluff-battle"

  if (mod.PhoneComponent) {
    // Register by directory name (hyphen) and underscore variant
    phoneRegistry.set(gameDirName, mod.PhoneComponent);
    phoneRegistry.set(gameDirName.replace(/-/g, '_'), mod.PhoneComponent);
  }
}

export function getPhoneComponent(gameId: string): ComponentType<PhoneProps> | undefined {
  return phoneRegistry.get(gameId) ?? phoneRegistry.get(gameId.replace(/_/g, '-'));
}
