import { Router, type Request, type Response } from 'express';
import { getHealthStatus, getReadinessStatus } from '../services/index.ts';
import type { HealthResponse, ReadinessResponse } from '../types/api.types.ts';

export const healthRouter = Router();

/**
 * GET /api/v1/health
 * Basic service liveness check.
 */
healthRouter.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  res.status(200).json(getHealthStatus());
});

/**
 * GET /api/v1/readiness
 * Actual subsystem readiness check across backend, firebaseProject, firestore, authentication, gemini, and scheduler.
 */
healthRouter.get('/readiness', async (_req: Request, res: Response<ReadinessResponse>) => {
  const status = await getReadinessStatus();
  res.status(200).json(status);
});
