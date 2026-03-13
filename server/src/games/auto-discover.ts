import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ManifestSchema, type GameManifest } from './manifest-schema.js';
import type { GameModule } from './game-module.js';
import type { GameDefinition } from '@boredless/shared';
import { loadGamePackage } from '../runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../runtime/interpreter/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GameRegistration {
  manifest: GameManifest;
  createModule: (definition: GameDefinition) => GameModule;
}

/**
 * Convert a validated YAML manifest into a GameDefinition.
 * The manifest id (hyphen format: "bluff-battle") is used directly as the game id string.
 */
export function manifestToDefinition(manifest: GameManifest): GameDefinition {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    minPlayers: manifest.players.min,
    maxPlayers: manifest.players.max,
    estimatedMinutes: manifest.estimatedMinutes,
    icon: manifest.icon,
  };
}

/**
 * Convert a V2 ManifestV2 into a V1-compatible GameManifest.
 * Required because the rest of the kernel works with GameManifest objects.
 */
function v2ManifestToV1(v2Manifest: import('../runtime/schema-engine/index.js').ManifestV2): GameManifest {
  return {
    id: v2Manifest.id,
    name: v2Manifest.name,
    tagline: v2Manifest.description, // V2 has no tagline — use description
    description: v2Manifest.description,
    players: {
      min: v2Manifest.players.min,
      max: v2Manifest.players.max,
    },
    estimatedMinutes: v2Manifest.estimated_minutes?.min ?? 10,
    icon: v2Manifest.icon ?? '🎮',
    accentColor: v2Manifest.accent_color ?? '#6366f1',
    categories: v2Manifest.categories,
    phases: {}, // V2 phases are in the full game package, not manifest
  };
}

/**
 * Check if a game directory contains a V2 game package (game.yaml with schema_version).
 * Returns the schema_version string if detected, null otherwise.
 */
function detectV2Package(gameDir: string): string | null {
  const gameYamlPath = join(gameDir, 'game.yaml');
  if (!existsSync(gameYamlPath)) return null;

  try {
    const rawYaml = readFileSync(gameYamlPath, 'utf-8');
    const parsed = parseYaml(rawYaml) as Record<string, unknown>;
    if (parsed && typeof parsed['schema_version'] === 'string') {
      return parsed['schema_version'];
    }
  } catch {
    // Not a valid YAML file or doesn't have schema_version — treat as V1
  }
  return null;
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

    // --- V2 detection: check for game.yaml with schema_version ---
    const v2Version = detectV2Package(gameDir);
    if (v2Version !== null) {
      // Skip test fixture directories (prefixed with _)
      if (dirName.startsWith('_')) {
        console.log(`[auto-discover] Skipping V2 test fixture: ${dirName}`);
        continue;
      }

      console.log(`[auto-discover] Loading V2 package: ${dirName} (schema_version: ${v2Version})`);

      try {
        const gameYamlPath = join(gameDir, 'game.yaml');
        const gamePackage = loadGamePackage(gameYamlPath);
        const v1Manifest = v2ManifestToV1(gamePackage.manifest);

        games.push({
          manifest: v1Manifest,
          createModule: (definition: GameDefinition) =>
            new DeclarativeGameModule(definition, gamePackage),
        });
      } catch (err) {
        console.error(`[auto-discover] Failed to load V2 package "${dirName}": ${String(err)}`);
        // Don't throw — skip this game and continue
      }

      continue;
    }

    // --- V1 path: load manifest.yaml + index module ---

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
