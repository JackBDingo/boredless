import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { healthRoutes } from './routes/health.js';
import { roomRoutes } from './routes/room.js';
import { handleConnection } from './ws/handler.js';
import { roomManager } from './engine/room-manager.js';
import { gameRegistry } from './games/registry.js';
import { discoverGames, manifestToDefinition } from './games/auto-discover.js';
import type { ServerConfig } from './config.js';

export async function buildApp(config: ServerConfig) {
  const app = Fastify({ logger: false });

  // Register plugins
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
  });

  await app.register(websocket);

  // Auto-discovery from games/ directory
  try {
    const discovered = await discoverGames();
    if (discovered.length > 0) {
      for (const game of discovered) {
        // Build GameDefinition from manifest so games don't need GAME_CATALOG
        const definition = manifestToDefinition(game.manifest);
        const mod = game.createModule(definition);
        gameRegistry.register(mod);
      }
      console.log(`[auto-discover] Loaded ${discovered.length} game(s): ${discovered.map(g => g.manifest.id).join(', ')}`);
    } else {
      console.warn('[auto-discover] No games discovered — game registry is empty');
    }
  } catch (err) {
    console.error('[auto-discover] Auto-discovery failed:', String(err));
    throw err; // Fail fast: no silent fallback to stale duplicated code
  }

  // Initialize room manager
  roomManager.init(config);

  // Register REST routes
  await app.register(healthRoutes);
  await app.register(roomRoutes);

  // Register WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    handleConnection(socket);
  });

  return app;
}
