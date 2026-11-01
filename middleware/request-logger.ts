import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.ts';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const SAFE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header('x-request-id');
  const requestId =
    incomingRequestId && SAFE_REQUEST_ID_PATTERN.test(incomingRequestId)
      ? incomingRequestId
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    // Only log API traffic to avoid noisy static asset logs
    if (req.originalUrl.startsWith('/api')) {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      logger.info(
        'API request completed',
        {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
        },
        requestId
      );
    }
  });

  next();
}
