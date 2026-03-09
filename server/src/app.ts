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
import type { ServerConfig } from './config.js';

export async function buildApp(config: ServerConfig) {
  const app = Fastify({ logger: false });

  // Register plugins
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
  });

  await app.register(websocket);

  // Register game modules
  gameRegistry.register(bluffBattleModule);
  gameRegistry.register(villageModule);

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
