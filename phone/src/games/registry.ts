import type { ComponentType } from 'react';
import type { PhoneProps } from './types.js';

export type { PhoneProps } from './types.js';

// Auto-import ONLY phone components to avoid pulling in @display/* imports at build time.
// Glob the phone folder directly instead of the barrel index.ts.
const phoneModules = import.meta.glob<{ default?: ComponentType<PhoneProps> }>(
  '/games/*/phone/*.tsx',
  { eager: true },
);

export const phoneRegistry = new Map<string, ComponentType<PhoneProps>>();

for (const [path, mod] of Object.entries(phoneModules)) {
  // Extract game directory name: /games/bluff-battle/phone/BBPhone.tsx → bluff-battle
  const match = path.match(/^\/games\/([^/]+)\/phone\/[^/]+\.tsx$/);
  if (!match) continue;

  const gameDirName = match[1]; // e.g. "bluff-battle"

  // Each phone file's default export is the component
  const Component = mod.default;
  if (Component) {
    // Register by directory name (hyphen) and underscore variant
    phoneRegistry.set(gameDirName, Component);
    phoneRegistry.set(gameDirName.replace(/-/g, '_'), Component);
  }
}

export function getPhoneComponent(gameId: string): ComponentType<PhoneProps> | undefined {
  return phoneRegistry.get(gameId) ?? phoneRegistry.get(gameId.replace(/_/g, '-'));
}
