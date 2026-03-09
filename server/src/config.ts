import { DEFAULT_PORT, CORS_ORIGINS } from '@boredless/shared';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  baseUrl: string; // For QR code generation
}

export function getConfig(): ServerConfig {
  const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.HOST ?? '0.0.0.0';
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [...CORS_ORIGINS, baseUrl];

  return { port, host, corsOrigins, baseUrl };
}
