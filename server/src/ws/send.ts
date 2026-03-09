import type { WebSocket } from 'ws';
import type { ServerMessage } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';
import { sessionRegistry } from './registry.js';

/** Send a message to a specific session */
export function sendToSession(sessionId: string, message: ServerMessage): void {
  const ws = sessionRegistry.getSocket(sessionId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Send a message to multiple sessions */
export function sendToSessions(sessionIds: string[], message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const sessionId of sessionIds) {
    const ws = sessionRegistry.getSocket(sessionId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

/** Send a message to a raw WebSocket (before session is established) */
export function sendToSocket(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Send an error to a raw WebSocket */
export function sendError(ws: WebSocket, code: string, message: string): void {
  sendToSocket(ws, {
    type: ServerMessageType.ERROR,
    code,
    message,
  });
}
