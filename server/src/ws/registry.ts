import type { WebSocket } from 'ws';

/**
 * SessionRegistry maps session IDs to WebSocket connections.
 * This is the ONLY place that knows which socket belongs to which session.
 */
class SessionRegistry {
  /** sessionId → WebSocket */
  private sessions = new Map<string, WebSocket>();
  /** WebSocket → sessionId (reverse lookup) */
  private sockets = new Map<WebSocket, string>();

  /** Register a session-to-socket mapping */
  register(sessionId: string, ws: WebSocket): void {
    // Clean up old socket if session already had one
    const oldWs = this.sessions.get(sessionId);
    if (oldWs && oldWs !== ws) {
      this.sockets.delete(oldWs);
      if (oldWs.readyState === oldWs.OPEN) {
        oldWs.close();
      }
    }
    this.sessions.set(sessionId, ws);
    this.sockets.set(ws, sessionId);
  }

  /** Remove a session */
  unregister(ws: WebSocket): string | undefined {
    const sessionId = this.sockets.get(ws);
    if (sessionId) {
      this.sessions.delete(sessionId);
      this.sockets.delete(ws);
    }
    return sessionId;
  }

  /** Get socket for session */
  getSocket(sessionId: string): WebSocket | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get session ID for socket */
  getSessionId(ws: WebSocket): string | undefined {
    return this.sockets.get(ws);
  }

  /** Check if session has active connection */
  isConnected(sessionId: string): boolean {
    const ws = this.sessions.get(sessionId);
    return ws !== undefined && ws.readyState === ws.OPEN;
  }
}

export const sessionRegistry = new SessionRegistry();
