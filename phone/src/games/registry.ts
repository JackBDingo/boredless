import type { ComponentType } from 'react';
import type { PhoneProps } from './types.js';

export type { PhoneProps } from './types.js';

// Explicit imports — globs don't reliably resolve across monorepo boundaries
import BBPhone from '@game-types/bluff-battle/phone/BBPhone';
import VillagePhone from '@game-types/village-of-shadows/phone/VillagePhone';

export const phoneRegistry = new Map<string, ComponentType<PhoneProps>>([
  ['bluff-battle', BBPhone],
  ['bluff_battle', BBPhone],
  ['village-of-shadows', VillagePhone],
  ['village_of_shadows', VillagePhone],
]);

export function getPhoneComponent(gameId: string): ComponentType<PhoneProps> | undefined {
  return phoneRegistry.get(gameId) ?? phoneRegistry.get(gameId.replace(/_/g, '-'));
}
