import type { ComponentType } from 'react';
import type { DisplayProps } from './types.js';

export type { DisplayProps } from './types.js';

// Explicit imports — globs don't reliably resolve across monorepo boundaries
import BBDisplay from '@game-types/bluff-battle/display/BBDisplay';
import VillageDisplay from '@game-types/village-of-shadows/display/VillageDisplay';

export const displayRegistry = new Map<string, ComponentType<DisplayProps>>([
  ['bluff-battle', BBDisplay],
  ['bluff_battle', BBDisplay],
  ['village-of-shadows', VillageDisplay],
  ['village_of_shadows', VillageDisplay],
]);

export function getDisplayComponent(gameId: string): ComponentType<DisplayProps> | undefined {
  return displayRegistry.get(gameId) ?? displayRegistry.get(gameId.replace(/_/g, '-'));
}
