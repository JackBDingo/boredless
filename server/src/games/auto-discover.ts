import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ManifestSchema, type GameManifest } from './manifest-schema.js';
import type { GameModule } from './game-module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GameRegistration {
  manifest: GameManifest;
  createModule: () => GameModule;
}

export async function discoverGames(): Promise<GameRegistration[]> {
  // games/ lives at repo root, three levels up from server/src/games/
  const gamesDir = join(__dirname, '../../../games');

  let dirNames: string[];
  try {
    dirNames = readdirSync(gamesDir);
  } catch {
    console.warn(`[auto-discover] games directory not found at ${gamesDir}, falling back to manual registry`);
    return [];
  }

  const games: GameRegistration[] = [];

  for (const dirName of dirNames) {
    const gameDir = join(gamesDir, dirName);

    // Load and validate YAML manifest
    let manifest: GameManifest;
    try {
      const rawYaml = readFileSync(join(gameDir, 'manifest.yaml'), 'utf-8');
      manifest = ManifestSchema.parse(parseYaml(rawYaml));
    } catch (err) {
      // Skip entries without a manifest (e.g., tsconfig.json in games/)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error(`[auto-discover] Failed to load manifest for game "${dirName}": ${String(err)}`);
    }

    // Load code module
    let mod: { createModule?: () => GameModule };
    try {
      mod = await import(join(gameDir, 'index.ts'));
    } catch {
      // Try .js extension for compiled output
      try {
        mod = await import(join(gameDir, 'index.js'));
      } catch (err2) {
        throw new Error(`[auto-discover] Failed to load module for game "${dirName}": ${String(err2)}`);
      }
    }

    if (typeof mod.createModule !== 'function') {
      throw new Error(`[auto-discover] Game "${dirName}" does not export a createModule function`);
    }

    games.push({
      manifest,
      createModule: mod.createModule,
    });
  }

  return games;
}
