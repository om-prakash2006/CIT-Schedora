import type { NextFunction, Request, Response } from 'express';
import type { EnvironmentConfig } from '../config/env.ts';
import { ForbiddenError } from '../utils/errors.ts';

function isAllowedOrigin(
  originHeader: string,
  req: Request,
  config: EnvironmentConfig
): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(originHeader);
  } catch {
    throw new ForbiddenError('Malformed Origin header.', 'INVALID_ORIGIN');
  }

  const originHost = originUrl.host.toLowerCase();
  const originHostname = originUrl.hostname.toLowerCase();

  // 1. Direct match against Host header
  const hostHeader = req.header('host')?.toLowerCase();
  if (hostHeader && originHost === hostHeader) {
    return true;
  }

  // 2. Match against X-Forwarded-Host header (set by Cloud Run / reverse proxies)
  const forwardedHostHeader = req.header('x-forwarded-host');
  if (forwardedHostHeader) {
    const forwardedHosts = forwardedHostHeader
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (forwardedHosts.includes(originHost) || forwardedHosts.includes(originHostname)) {
      return true;
    }
  }

  // 3. Match against configured FRONTEND_ORIGIN / APP_URL
  if (config.frontendOrigin) {
    try {
      const configuredUrl = new URL(config.frontendOrigin);
      if (
        originHeader === config.frontendOrigin ||
        originHost === configuredUrl.host.toLowerCase()
      ) {
        return true;
      }
    } catch {
      if (originHeader === config.frontendOrigin) {
        return true;
      }
    }
  }

  // 4. Support AI Studio Cloud Run preview URLs (*.run.app) when proxied to local container
  if (
    originUrl.protocol === 'https:' &&
    (originHostname.endsWith('.run.app') || originHostname.endsWith('.googleusercontent.com'))
  ) {
    return true;
  }

  return false;
}

export function createSecurityMiddleware(config: EnvironmentConfig) {
  return function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Enforce same-origin / proxy-aware origin restrictions on API routes
    if (req.path.startsWith('/api')) {
      const originHeader = req.header('origin');

      if (originHeader) {
        try {
          if (!isAllowedOrigin(originHeader, req, config)) {
            next(
              new ForbiddenError(
                'Cross-origin API request denied by same-origin policy.',
                'ORIGIN_DENIED'
              )
            );
            return;
          }
        } catch (err) {
          next(err);
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', originHeader);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, X-Request-Id, X-CSRF-Token, x-session-token'
        );
        res.setHeader('Access-Control-Max-Age', '86400');
        res.status(204).end();
        return;
      }
    }

    next();
  };
}
