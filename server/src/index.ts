import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { logger } from './utils/logger.js';

async function main() {
  const config = getConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Boredless server running`, {
      port: config.port,
      host: config.host,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    logger.error('Failed to start server', { error: String(err) });
    process.exit(1);
  }
}

main();
