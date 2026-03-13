import type { ComponentType } from 'react';
import type { PhoneProps } from './types.js';

export type { PhoneProps } from './types.js';

// Explicit imports — globs don't reliably resolve across monorepo boundaries
import BBPhone from '@game-types/bluff-battle/phone/BBPhone';
import VillagePhone from '@game-types/village-of-shadows/phone/VillagePhone';
import CAHPhone from '@game-types/cards-against/phone/CAHPhone';
import BSPhone from '@game-types/battleship/phone/BSPhone';
import THPhone from '@game-types/texas-holdem/phone/THPhone';
import BJPhone from '@game-types/blackjack/phone/BJPhone';
import CRPhone from '@game-types/cribbage/phone/CRPhone';
import WCPhone from '@game-types/wordcraft/phone/WCPhone';

export const phoneRegistry = new Map<string, ComponentType<PhoneProps>>([
  ['bluff-battle', BBPhone],
  ['bluff_battle', BBPhone],
  ['village-of-shadows', VillagePhone],
  ['village_of_shadows', VillagePhone],
  ['cards-against', CAHPhone],
  ['cards_against', CAHPhone],
  ['battleship', BSPhone],
  ['texas-holdem', THPhone],
  ['blackjack', BJPhone],
  ['cribbage', CRPhone],
  ['wordcraft', WCPhone],
]);

export function getPhoneComponent(gameId: string): ComponentType<PhoneProps> | undefined {
  return phoneRegistry.get(gameId) ?? phoneRegistry.get(gameId.replace(/_/g, '-'));
}
