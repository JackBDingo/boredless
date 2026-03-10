import type { FastifyInstance } from 'fastify';
import { roomManager } from '../engine/room-manager.js';
import { gameRegistry } from '../games/registry.js';

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  /** Create a new room. Returns roomId, code, and QR code. */
  app.post('/api/rooms', async (_request, reply) => {
    const result = await roomManager.createRoom();
    return reply.status(201).send(result);
  });

  /** Get room info by code (for join page to validate before WebSocket) */
  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const room = roomManager.getRoomByCode(request.params.code);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    const activePlayers = room.players.filter(p => p.status !== 'removed');
    const host = room.players.find(p => p.id === room.hostPlayerId);

    return {
      code: room.code,
      status: room.status,
      playerCount: activePlayers.length,
      maxPlayers: 12,
      hostName: host?.name ?? 'Unknown',
    };
  });

  /** Get available games catalog from the auto-discovered registry */
  app.get('/api/games', async (_request, reply) => {
    const games = gameRegistry.getAll().map(mod => mod.definition);
    return reply.send(games);
  });
}
