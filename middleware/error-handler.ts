import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorResponse } from '../types/api.types.ts';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

export function apiNotFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`API route '${req.method} ${req.originalUrl}' does not exist.`));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'unknown-request-id';

  if (err instanceof AppError) {
    logger.info(
      'Handled API response',
      {
        code: err.code,
        statusCode: err.statusCode,
        path: req.originalUrl,
      },
      requestId
    );

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    });
    return;
  }

  const parserError = err as BodyParserError | undefined;

  if (parserError?.type === 'entity.too.large' || parserError?.status === 413) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the configured input size limit.',
        requestId,
      },
    });
    return;
  }

  if (
    err instanceof SyntaxError &&
    (parserError?.status === 400 || parserError?.statusCode === 400 || parserError?.type === 'entity.parse.failed')
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON in request body.',
        requestId,
      },
    });
    return;
  }

  // Never leak internal stack traces or environment variables in API responses
  logger.error(
    'Unhandled backend exception',
    {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      path: req.originalUrl,
      method: req.method,
    },
    requestId
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
      requestId,
    },
  });
}
