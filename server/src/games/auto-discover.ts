import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ManifestSchema, type GameManifest } from './manifest-schema.js';
import type { GameModule } from './game-module.js';
import type { GameDefinition } from '@boredless/shared';
import { GameId } from '@boredless/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GameRegistration {
  manifest: GameManifest;
  createModule: (definition: GameDefinition) => GameModule;
}

/**
 * Convert a validated YAML manifest into a GameDefinition (as required by GameModule).
 * The manifest id (hyphen format: "bluff-battle") is mapped to the GameId enum
 * by normalising hyphens to underscores.
 */
function manifestToDefinition(manifest: GameManifest): GameDefinition {
  // Manifest ids use hyphens ("bluff-battle"), GameId enum uses underscores ("bluff_battle")
  const enumKey = manifest.id.replace(/-/g, '_').toUpperCase() as keyof typeof GameId;
  const gameId = GameId[enumKey];
  if (!gameId) {
    throw new Error(`[auto-discover] Manifest id "${manifest.id}" does not map to a known GameId enum value`);
  }

  return {
    id: gameId,
    name: manifest.name,
    description: manifest.description,
    minPlayers: manifest.players.min,
    maxPlayers: manifest.players.max,
    estimatedMinutes: manifest.estimatedMinutes,
    icon: manifest.icon,
  };
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

    // Skip non-directories (e.g. tsconfig.json in games/)
    try {
      if (!statSync(gameDir).isDirectory()) continue;
    } catch {
      continue;
    }

    // Load and validate YAML manifest
    let manifest: GameManifest;
    try {
      const rawYaml = readFileSync(join(gameDir, 'manifest.yaml'), 'utf-8');
      manifest = ManifestSchema.parse(parseYaml(rawYaml));
    } catch (err) {
      // Skip entries without a manifest
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error(`[auto-discover] Failed to load manifest for game "${dirName}": ${String(err)}`);
    }

    // Load code module
    let mod: { createModule?: (definition: GameDefinition) => GameModule };
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
      createModule: (definition: GameDefinition) => mod.createModule!(definition),
    });
  }

  return games;
}

// Re-export so callers can build GameDefinition from manifest without reimporting
export { manifestToDefinition };
