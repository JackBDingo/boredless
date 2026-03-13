import type { ComponentType } from 'react';
import type { DisplayProps } from './types.js';

export type { DisplayProps } from './types.js';

// Explicit imports — globs don't reliably resolve across monorepo boundaries
import BBDisplay from '@game-types/bluff-battle/display/BBDisplay';
import VillageDisplay from '@game-types/village-of-shadows/display/VillageDisplay';
import CAHDisplay from '@game-types/cards-against/display/CAHDisplay';
import BSDisplay from '@game-types/battleship/display/BSDisplay';
import THDisplay from '@game-types/texas-holdem/display/THDisplay';
import BJDisplay from '@game-types/blackjack/display/BJDisplay';
import CRDisplay from '@game-types/cribbage/display/CRDisplay';
import WCDisplay from '@game-types/wordcraft/display/WCDisplay';

export const displayRegistry = new Map<string, ComponentType<DisplayProps>>([
  ['bluff-battle', BBDisplay],
  ['bluff_battle', BBDisplay],
  ['village-of-shadows', VillageDisplay],
  ['village_of_shadows', VillageDisplay],
  ['cards-against', CAHDisplay],
  ['cards_against', CAHDisplay],
  ['battleship', BSDisplay],
  ['texas-holdem', THDisplay],
  ['blackjack', BJDisplay],
  ['cribbage', CRDisplay],
  ['wordcraft', WCDisplay],
]);

export function getDisplayComponent(gameId: string): ComponentType<DisplayProps> | undefined {
  return displayRegistry.get(gameId) ?? displayRegistry.get(gameId.replace(/_/g, '-'));
}
