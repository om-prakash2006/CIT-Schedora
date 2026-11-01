import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  extractSessionTokenFromRequest,
  requireAuthentication,
  verifyCsrfIfCookiePresent,
} from '../middleware/auth.middleware.ts';
import {
  createSessionFromFirebaseIdToken,
  CSRF_COOKIE_NAME,
  getOptionalAuthenticatedPrincipal,
  logoutAndRevokeSession,
  refreshApplicationSession,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  signInWithFirebaseWebSdkAndGetIdToken,
} from '../services/auth.service.ts';
import { BadRequestError } from '../utils/errors.ts';

export const authRouter = Router();

function setSessionAndCsrfCookies(
  req: Request,
  res: Response,
  sessionCookie: string,
  csrfToken: string
): void {
  const isSecureRequest =
    req.secure ||
    req.header('x-forwarded-proto') === 'https' ||
    process.env.APP_ENV === 'production' ||
    Boolean(req.header('x-forwarded-host'));

  const sameSiteDirective = isSecureRequest ? 'None; Secure; Partitioned' : 'Lax';

  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionCookie)}; Path=/; HttpOnly; SameSite=${sameSiteDirective}; Max-Age=${SESSION_DURATION_SECONDS}`,
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=${sameSiteDirective}; Max-Age=${SESSION_DURATION_SECONDS}`,
  ]);
}

function clearSessionAndCsrfCookies(req: Request, res: Response): void {
  const isSecureRequest =
    req.secure ||
    req.header('x-forwarded-proto') === 'https' ||
    process.env.APP_ENV === 'production' ||
    Boolean(req.header('x-forwarded-host'));

  const sameSiteDirective = isSecureRequest ? 'None; Secure; Partitioned' : 'Lax';

  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSiteDirective}; Max-Age=0`,
    `${CSRF_COOKIE_NAME}=; Path=/; SameSite=${sameSiteDirective}; Max-Age=0`,
  ]);
}

/**
 * POST /api/v1/auth/sessionLogin
 * Exchanges a verified Firebase Authentication ID token (or Email/Password via Firebase Web SDK)
 * for a 12-hour HTTP-only Firebase Session Cookie after verifying:
 * 1. Firebase Admin SDK ID token signature & revocation status
 * 2. Project audience (`cit-schedora`)
 * 3. Recent authentication (`<= 5 minutes`)
 * 4. Active `users/{uid}` profile in the named Firestore database
 */
async function handleSessionLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = (req.body ?? {}) as {
      idToken?: unknown;
      email?: unknown;
      password?: unknown;
    };

    let resolvedIdToken: string;

    if (typeof body.idToken === 'string' && body.idToken.trim().length > 0) {
      resolvedIdToken = body.idToken.trim();
    } else if (typeof body.email === 'string' || typeof body.password === 'string') {
      if (typeof body.email !== 'string' || body.email.trim().length === 0) {
        throw new BadRequestError(
          'Institutional email address is required.',
          'EMAIL_REQUIRED'
        );
      }
      if (typeof body.password !== 'string' || body.password.length === 0) {
        throw new BadRequestError('Password is required.', 'PASSWORD_REQUIRED');
      }
      const webSignIn = await signInWithFirebaseWebSdkAndGetIdToken(
        body.email,
        body.password
      );
      resolvedIdToken = webSignIn.idToken;
    } else {
      throw new BadRequestError(
        'Firebase ID token (`idToken`) or institutional email/password is required.',
        'ID_TOKEN_REQUIRED'
      );
    }

    const issued = await createSessionFromFirebaseIdToken(resolvedIdToken);
    setSessionAndCsrfCookies(req, res, issued.sessionCookie, issued.csrfToken);

    res.status(200).json({
      authenticated: true,
      sessionToken: issued.sessionCookie,
      sessionCookie: issued.sessionCookie,
      sessionDurationSeconds: SESSION_DURATION_SECONDS,
      csrfToken: issued.csrfToken,
      user: issued.principal,
      profile: issued.profile,
      permissions: issued.principal.permissions,
    });
  } catch (err) {
    next(err);
  }
}

authRouter.post('/sessionLogin', handleSessionLogin);
authRouter.post('/login', handleSessionLogin);

/**
 * POST /api/v1/auth/sessionLogout
 * Clears the HTTP-only session cookie and revokes the Firebase session & refresh tokens.
 */
async function handleSessionLogout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionToken = extractSessionTokenFromRequest(req);
    await logoutAndRevokeSession(sessionToken);
    clearSessionAndCsrfCookies(req, res);

    res.status(200).json({
      authenticated: false,
      user: null,
      revoked: true,
    });
  } catch (err) {
    next(err);
  }
}

authRouter.post('/sessionLogout', verifyCsrfIfCookiePresent, handleSessionLogout);
authRouter.post('/logout', verifyCsrfIfCookiePresent, handleSessionLogout);

/**
 * GET /api/v1/auth/me
 * Verifies the active session cookie against Firebase Admin SDK and live Firestore `users/{uid}`,
 * returning the authenticated user profile and effective permissions.
 */
authRouter.get(
  '/me',
  requireAuthentication,
  (req: Request, res: Response) => {
    res.status(200).json({
      authenticated: true,
      user: req.authUser!,
      profile: req.authProfile!,
      permissions: req.authUser!.permissions,
    });
  }
);

/**
 * POST /api/v1/auth/sessionRefresh
 * Refreshes the application session cookie from the authoritative Firestore `users/{uid}`
 * profile without permitting client-side privilege escalation.
 */
authRouter.post(
  '/sessionRefresh',
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionToken = extractSessionTokenFromRequest(req);
      const issued = await refreshApplicationSession(
        sessionToken,
        (req.body ?? {}) as Record<string, unknown>
      );
      setSessionAndCsrfCookies(req, res, issued.sessionCookie, issued.csrfToken);

      res.status(200).json({
        authenticated: true,
        refreshed: true,
        sessionToken: issued.sessionCookie,
        sessionCookie: issued.sessionCookie,
        csrfToken: issued.csrfToken,
        user: issued.principal,
        profile: issued.profile,
        permissions: issued.principal.permissions,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/auth/session
 * Non-throwing session status check used during initial browser boot.
 */
authRouter.get(
  '/session',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionToken = extractSessionTokenFromRequest(req);
      const principal = await getOptionalAuthenticatedPrincipal(sessionToken);

      res.status(200).json({
        authenticated: Boolean(principal),
        authConfigured: true,
        user: principal ?? null,
        permissions: principal?.permissions ?? null,
      });
    } catch (err) {
      next(err);
    }
  }
);
