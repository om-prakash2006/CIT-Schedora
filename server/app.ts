import express, { type Express } from 'express';
import { env as defaultEnv, type EnvironmentConfig } from '../config/env.ts';
import { apiNotFoundHandler, errorHandler } from '../middleware/error-handler.ts';
import { requestLogger } from '../middleware/request-logger.ts';
import { createSecurityMiddleware } from '../middleware/security.ts';
import { apiV1Router } from '../routes/index.ts';
import { firebaseAuthWireRouter } from '../services/firebase-auth-emulator.service.ts';

export function createApp(config: EnvironmentConfig = defaultEnv): Express {
  const app = express();

  // Trust fronting reverse proxies (Cloud Run / AI Studio preview router)
  app.set('trust proxy', 1);

  app.disable('x-powered-by');

  // Request ID & safe structured request logging
  app.use(requestLogger);

  // Same-origin restrictions & security headers
  app.use(createSecurityMiddleware(config));

  // JSON request parsing with input size limits and URL-encoded support for OAuth2 token endpoint
  app.use(
    express.json({
      limit: config.jsonBodyLimit,
      strict: true,
    })
  );
  app.use(express.urlencoded({ extended: false, limit: config.jsonBodyLimit }));

  // Identity Toolkit / SecureToken wire protocol routes for Firebase Auth SDKs in sandboxed preview
  app.use('/', firebaseAuthWireRouter);

  // Versioned API routing
  app.use('/api/v1', apiV1Router);

  // Controlled 404 for unknown /api routes
  app.use('/api', apiNotFoundHandler);

  // Centralised error handling
  app.use(errorHandler);

  return app;
}

