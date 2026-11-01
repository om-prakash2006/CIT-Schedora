import { startServer } from './server/index.ts';
import { logger } from './utils/logger.ts';

startServer().catch((err) => {
  logger.error('Fatal server startup failure', {
    errorName: err instanceof Error ? err.name : 'UnknownStartupError',
  });
  process.exit(1);
});
