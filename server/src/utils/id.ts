import { nanoid } from 'nanoid';

/** Generate a unique ID (21 chars) */
export function generateId(): string {
  return nanoid();
}

/** Generate a short ID (10 chars) for reconnect tokens */
export function generateToken(): string {
  return nanoid(10);
}
