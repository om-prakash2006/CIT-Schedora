import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { AppEnvironment, env, validateStartupEnvironment } from '../config/env.ts';
import { errorHandler } from '../middleware/error-handler.ts';
import { ensureDemoAccountsAvailableInFirestore } from '../services/auth.service.ts';
import { logger } from '../utils/logger.ts';
import { createApp } from './app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');

export async function startServer() {
  // Enforce startup environment guard
  validateStartupEnvironment(env);

  // Proactively ensure demo accounts are hydrated in Firestore & Identity Toolkit
  try {
    await ensureDemoAccountsAvailableInFirestore();
  } catch (err) {
    logger.warn('Initial demo accounts check completed with warning', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const app = createApp(env);

  if (env.appEnv !== AppEnvironment.PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: workspaceRoot,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(workspaceRoot, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Re-attach global error handler after SPA middleware
  app.use(errorHandler);

  const server = app.listen(env.port, '0.0.0.0', () => {
    logger.info('CIT Schedora backend server started', {
      port: env.port,
      appEnv: env.appEnv,
      version: 'v1',
    });
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((err) => {
    logger.error('Fatal server startup failure', {
      errorName: err instanceof Error ? err.name : 'UnknownStartupError',
    });
    process.exit(1);
  });
}
