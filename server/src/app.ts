import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { healthRoutes } from './routes/health.js';
import { roomRoutes } from './routes/room.js';
import { handleConnection } from './ws/handler.js';
import { roomManager } from './engine/room-manager.js';
import { gameRegistry } from './games/registry.js';
import { bluffBattleModule } from './games/bluff-battle/index.js';
import { villageModule } from './games/village/index.js';
import { discoverGames } from './games/auto-discover.js';
import type { ServerConfig } from './config.js';

export async function buildApp(config: ServerConfig) {
  const app = Fastify({ logger: false });

  // Register plugins
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
  });

  await app.register(websocket);

  // Try auto-discovery from games/ directory
  let autoDiscovered = false;
  try {
    const discovered = await discoverGames();
    if (discovered.length > 0) {
      for (const game of discovered) {
        // createModule() instantiates a fresh module per discovery
        const mod = game.createModule();
        gameRegistry.register(mod);
      }
      autoDiscovered = true;
      console.log(`[auto-discover] Loaded ${discovered.length} game(s): ${discovered.map(g => g.manifest.id).join(', ')}`);
    }
  } catch (err) {
    console.warn('[auto-discover] Auto-discovery failed, using manual registry:', String(err));
  }

  // Fallback: manual registration (always done so existing tests keep working)
  if (!autoDiscovered) {
    gameRegistry.register(bluffBattleModule);
    gameRegistry.register(villageModule);
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
