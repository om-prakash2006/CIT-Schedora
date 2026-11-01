import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import http, { type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Router, type Request, type Response } from 'express';
import { CANONICAL_FIREBASE_PROJECT_ID } from '../config/env.ts';

export interface IdentityToolkitAccountRecord {
  localId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  passwordSalt: string;
  passwordHashHex: string;
  disabled: boolean;
  validSinceSec: number;
  createdAtMs: number;
  lastLoginAtMs: number;
  customClaims: Record<string, unknown>;
}

/**
 * Canonical demo credentials defined in Section 4 of the specification.
 * Used ONLY inside the Firebase Auth Identity Toolkit credential store (never stored in Firestore).
 */
export const CANONICAL_DEMO_IDENTITIES = Object.freeze([
  {
    uid: 'uid-cit-admin-01',
    email: 'dean.admin@cit-schedora.test',
    aliases: ['dean.admin@cit.edu.in', 'admin@cit.edu.in', 'ommbehera46@gmail.com'],
    displayName: "Prof. A. Sharma (Dean's Office)",
    role: 'admin' as const,
    departmentId: null,
    facultyId: null,
    clubId: null,
    initialPassword: 'CITSchedora!Admin2026',
  },
  {
    uid: 'uid-cit-coord-cse',
    email: 'coordinator.cse@cit-schedora.test',
    aliases: ['coordinator.cse@cit.edu.in', 'cse.coordinator@cit.edu.in'],
    displayName: 'Dr. S. Mohanty (CSE Coordinator)',
    role: 'department_coordinator' as const,
    departmentId: 'CSE',
    facultyId: null,
    clubId: null,
    initialPassword: 'CITSchedora!Coord2026',
  },
  {
    uid: 'uid-cit-faculty-f01',
    email: 'faculty.f01@cit-schedora.test',
    aliases: ['faculty.f01@cit.edu.in', 'ananya.mishra@cit.edu.in', 'v.rao@cit.edu.in'],
    displayName: 'Dr. Ananya Mishra',
    role: 'faculty' as const,
    departmentId: 'CSE',
    facultyId: 'F01',
    clubId: null,
    initialPassword: 'CITSchedora!Faculty2026',
  },
  {
    uid: 'uid-cit-club-robotics',
    email: 'robotics.club@cit-schedora.test',
    aliases: ['robotics.club@cit.edu.in', 'club@cit.edu.in'],
    displayName: 'Robotics Club Demo',
    role: 'club' as const,
    departmentId: null,
    facultyId: null,
    clubId: 'robotics_club_demo',
    initialPassword: 'CITSchedora!Club2026',
  },
] as const);

const accountsByUid = new Map<string, IdentityToolkitAccountRecord>();
const uidByEmail = new Map<string, string>();
const uidByRefreshToken = new Map<string, string>();

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function encodeFirebaseEmulatorJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

export function decodeJwtPayload(jwtToken: string): Record<string, unknown> | null {
  const parts = jwtToken.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function normalizeCanonicalDemoEmail(rawEmail: string): string {
  const trimmed = rawEmail.trim().toLowerCase();
  for (const demo of CANONICAL_DEMO_IDENTITIES) {
    if (demo.email === trimmed || (demo.aliases as readonly string[]).includes(trimmed)) {
      return demo.email;
    }
  }
  return trimmed;
}

function formatAccountForIdentityToolkit(acc: IdentityToolkitAccountRecord) {
  return {
    localId: acc.localId,
    email: acc.email,
    emailVerified: acc.emailVerified,
    displayName: acc.displayName,
    disabled: acc.disabled,
    validSince: String(acc.validSinceSec),
    createdAt: String(acc.createdAtMs),
    lastLoginAt: String(acc.lastLoginAtMs),
    customAttributes: JSON.stringify(acc.customClaims),
    providerUserInfo: [
      {
        providerId: 'password',
        federatedId: acc.email,
        email: acc.email,
        rawId: acc.email,
        displayName: acc.displayName,
      },
    ],
  };
}

/**
 * Registers or synchronizes an account in the Identity Toolkit Auth store when a profile
 * already exists in Firestore (e.g. across server restarts), without overwriting an
 * existing account's password.
 */
export function ensureIdentityToolkitAccountHydrated(params: {
  uid: string;
  email: string;
  displayName: string;
  disabled: boolean;
  customClaims: Record<string, unknown>;
  initialPasswordIfMissing?: string;
}): IdentityToolkitAccountRecord {
  const normalizedEmail = normalizeCanonicalDemoEmail(params.email);
  const existing = accountsByUid.get(params.uid);
  if (existing) {
    existing.displayName = params.displayName;
    existing.disabled = params.disabled;
    existing.customClaims = { ...existing.customClaims, ...params.customClaims };
    uidByEmail.set(normalizedEmail, existing.localId);
    return existing;
  }

  const demoMatch = CANONICAL_DEMO_IDENTITIES.find(
    (d) => d.uid === params.uid || d.email === normalizedEmail
  );
  const passwordToSet =
    params.initialPasswordIfMissing ??
    demoMatch?.initialPassword ??
    randomBytes(24).toString('hex');
  const salt = `salt_${params.uid}`;
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000) - 60;

  const record: IdentityToolkitAccountRecord = {
    localId: params.uid,
    email: normalizedEmail,
    emailVerified: true,
    displayName: params.displayName,
    passwordSalt: salt,
    passwordHashHex: hashPassword(passwordToSet, salt),
    disabled: params.disabled,
    validSinceSec: nowSec,
    createdAtMs: nowMs,
    lastLoginAtMs: nowMs,
    customClaims: { ...params.customClaims },
  };

  accountsByUid.set(record.localId, record);
  uidByEmail.set(record.email, record.localId);
  if (demoMatch) {
    for (const alias of demoMatch.aliases) {
      uidByEmail.set(alias.toLowerCase(), record.localId);
    }
  }
  return record;
}

// Auto-hydrate canonical demo identities so wire endpoints have them available from second 0:
for (const demo of CANONICAL_DEMO_IDENTITIES) {
  ensureIdentityToolkitAccountHydrated({
    uid: demo.uid,
    email: demo.email,
    displayName: demo.displayName,
    disabled: false,
    customClaims: {
      role: demo.role,
      authorizationVersion: 1,
    },
    initialPasswordIfMissing: demo.initialPassword,
  });
}

export function getIdentityToolkitAccountByUid(
  uid: string
): IdentityToolkitAccountRecord | undefined {
  return accountsByUid.get(uid);
}

export function getIdentityToolkitAccountByEmail(
  email: string
): IdentityToolkitAccountRecord | undefined {
  const normalized = normalizeCanonicalDemoEmail(email);
  const uid = uidByEmail.get(normalized);
  if (!uid) {
    return undefined;
  }
  return accountsByUid.get(uid);
}

function createIdTokenForAccount(
  acc: IdentityToolkitAccountRecord,
  authTimeSec = Math.floor(Date.now() / 1000)
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return encodeFirebaseEmulatorJwt({
    iss: `https://securetoken.google.com/${CANONICAL_FIREBASE_PROJECT_ID}`,
    aud: CANONICAL_FIREBASE_PROJECT_ID,
    auth_time: authTimeSec,
    user_id: acc.localId,
    sub: acc.localId,
    iat: nowSec,
    exp: nowSec + 3600,
    email: acc.email,
    email_verified: acc.emailVerified,
    name: acc.displayName,
    ...acc.customClaims,
    firebase: {
      identities: {
        email: [acc.email],
      },
      sign_in_provider: 'password',
    },
  });
}

function handleIdentityToolkitRequest(
  method: string,
  urlPath: string,
  body: Record<string, unknown>
): { status: number; payload: Record<string, unknown> } {
  // 1. Admin createUser: POST /identitytoolkit.googleapis.com/v1/projects/:projectId/accounts
  if (
    method === 'POST' &&
    /\/identitytoolkit\.googleapis\.com\/v1\/projects\/[^/]+\/accounts$/.test(urlPath)
  ) {
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!rawEmail) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'MISSING_EMAIL' } },
      };
    }
    const normalizedEmail = normalizeCanonicalDemoEmail(rawEmail);
    if (uidByEmail.has(normalizedEmail)) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'EMAIL_EXISTS' } },
      };
    }
    const localId =
      typeof body.localId === 'string' && body.localId.trim().length > 0
        ? body.localId.trim()
        : `uid_${randomBytes(8).toString('hex')}`;
    if (accountsByUid.has(localId)) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'DUPLICATE_LOCAL_ID' } },
      };
    }

    const password =
      typeof body.password === 'string' && body.password.length > 0
        ? body.password
        : randomBytes(16).toString('hex');
    const displayName =
      typeof body.displayName === 'string' && body.displayName.trim().length > 0
        ? body.displayName.trim()
        : normalizedEmail;
    const disabled = Boolean(body.disabled);

    const record = ensureIdentityToolkitAccountHydrated({
      uid: localId,
      email: normalizedEmail,
      displayName,
      disabled,
      customClaims: {},
      initialPasswordIfMissing: password,
    });

    return {
      status: 200,
      payload: {
        kind: 'identitytoolkit#SignupNewUserResponse',
        localId: record.localId,
        email: record.email,
        displayName: record.displayName,
      },
    };
  }

  // 2. Admin / Client accounts:lookup
  if (method === 'POST' && urlPath.includes('accounts:lookup')) {
    const users: ReturnType<typeof formatAccountForIdentityToolkit>[] = [];

    if (Array.isArray(body.localId)) {
      for (const id of body.localId) {
        const acc = accountsByUid.get(String(id));
        if (acc) {
          users.push(formatAccountForIdentityToolkit(acc));
        }
      }
    } else if (Array.isArray(body.email)) {
      for (const em of body.email) {
        const acc = getIdentityToolkitAccountByEmail(String(em));
        if (acc) {
          users.push(formatAccountForIdentityToolkit(acc));
        }
      }
    } else if (typeof body.idToken === 'string') {
      const decoded = decodeJwtPayload(body.idToken);
      const sub = typeof decoded?.sub === 'string' ? decoded.sub : '';
      const acc = accountsByUid.get(sub);
      if (acc) {
        users.push(formatAccountForIdentityToolkit(acc));
      }
    }

    return {
      status: 200,
      payload: {
        kind: 'identitytoolkit#GetAccountInfoResponse',
        users,
      },
    };
  }

  // 3. Admin accounts:update (updateUser, setCustomUserClaims, revokeRefreshTokens)
  if (method === 'POST' && urlPath.includes('accounts:update')) {
    const localId = typeof body.localId === 'string' ? body.localId : '';
    const acc = accountsByUid.get(localId);
    if (!acc) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'USER_NOT_FOUND' } },
      };
    }

    if (typeof body.displayName === 'string') {
      acc.displayName = body.displayName;
    }
    if (typeof body.email === 'string' && body.email.trim().length > 0) {
      uidByEmail.delete(acc.email);
      acc.email = body.email.trim().toLowerCase();
      uidByEmail.set(acc.email, acc.localId);
    }
    if (typeof body.password === 'string' && body.password.length > 0) {
      acc.passwordHashHex = hashPassword(body.password, acc.passwordSalt);
    }
    if (typeof body.disableUser === 'boolean') {
      acc.disabled = body.disableUser;
    }
    if (typeof body.disabled === 'boolean') {
      acc.disabled = body.disabled;
    }
    if (typeof body.customAttributes === 'string') {
      try {
        acc.customClaims = JSON.parse(body.customAttributes) as Record<string, unknown>;
      } catch {
        return {
          status: 400,
          payload: { error: { code: 400, message: 'INVALID_CUSTOM_ATTRIBUTES' } },
        };
      }
    }
    if (body.validSince !== undefined) {
      const parsedValidSince = Number(body.validSince);
      if (Number.isFinite(parsedValidSince)) {
        acc.validSinceSec = Math.max(acc.validSinceSec + 1, Math.floor(parsedValidSince));
      }
    }

    return {
      status: 200,
      payload: formatAccountForIdentityToolkit(acc),
    };
  }

  // 4. Admin accounts:batchGet (listUsers)
  if (method === 'GET' && urlPath.includes('accounts:batchGet')) {
    return {
      status: 200,
      payload: {
        kind: 'identitytoolkit#DownloadAccountResponse',
        users: Array.from(accountsByUid.values()).map(formatAccountForIdentityToolkit),
      },
    };
  }

  // 5. Client accounts:signInWithPassword
  if (method === 'POST' && urlPath.includes('accounts:signInWithPassword')) {
    const rawEmail = typeof body.email === 'string' ? body.email : '';
    const rawPassword = typeof body.password === 'string' ? body.password : '';

    if (!rawEmail) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'MISSING_EMAIL' } },
      };
    }
    if (!rawPassword) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'MISSING_PASSWORD' } },
      };
    }

    let acc = getIdentityToolkitAccountByEmail(rawEmail);
    if (!acc) {
      const normalizedEmail = normalizeCanonicalDemoEmail(rawEmail);
      const demoMatch = CANONICAL_DEMO_IDENTITIES.find(
        (d) => d.email === normalizedEmail || (d.aliases as readonly string[]).includes(normalizedEmail)
      );
      if (demoMatch) {
        acc = ensureIdentityToolkitAccountHydrated({
          uid: demoMatch.uid,
          email: demoMatch.email,
          displayName: demoMatch.displayName,
          disabled: false,
          customClaims: {
            role: demoMatch.role,
            authorizationVersion: 1,
          },
          initialPasswordIfMissing: demoMatch.initialPassword,
        });
      }
    }

    if (!acc) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'EMAIL_NOT_FOUND' } },
      };
    }

    if (!verifyPassword(rawPassword, acc.passwordSalt, acc.passwordHashHex)) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'INVALID_PASSWORD' } },
      };
    }

    if (acc.disabled) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'USER_DISABLED' } },
      };
    }

    acc.lastLoginAtMs = Date.now();
    const idToken = createIdTokenForAccount(acc);
    const refreshToken = `rt_${acc.localId}_${randomBytes(12).toString('hex')}`;
    uidByRefreshToken.set(refreshToken, acc.localId);

    return {
      status: 200,
      payload: {
        kind: 'identitytoolkit#VerifyPasswordResponse',
        localId: acc.localId,
        email: acc.email,
        displayName: acc.displayName,
        idToken,
        registered: true,
        refreshToken,
        expiresIn: '3600',
      },
    };
  }

  // 6. Admin createSessionCookie: POST /identitytoolkit.googleapis.com/v1/projects/:projectId:createSessionCookie
  if (method === 'POST' && urlPath.includes(':createSessionCookie')) {
    const idToken = typeof body.idToken === 'string' ? body.idToken : '';
    const validDurationSec =
      typeof body.validDuration === 'number' && body.validDuration > 0
        ? Math.floor(body.validDuration)
        : 43200;

    const decoded = decodeJwtPayload(idToken);
    if (!decoded || typeof decoded.sub !== 'string') {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'INVALID_ID_TOKEN' } },
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = typeof decoded.exp === 'number' ? decoded.exp : 0;
    if (expSec <= nowSec) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'EXPIRED_ID_TOKEN' } },
      };
    }

    const acc = accountsByUid.get(decoded.sub);
    if (!acc) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'USER_NOT_FOUND' } },
      };
    }

    if (acc.disabled) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'USER_DISABLED' } },
      };
    }

    const authTimeSec = typeof decoded.auth_time === 'number' ? decoded.auth_time : nowSec;
    if (authTimeSec < acc.validSinceSec) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'TOKEN_EXPIRED' } },
      };
    }

    const sessionCookieJwt = encodeFirebaseEmulatorJwt({
      iss: `https://session.firebase.google.com/${CANONICAL_FIREBASE_PROJECT_ID}`,
      aud: CANONICAL_FIREBASE_PROJECT_ID,
      auth_time: authTimeSec,
      user_id: acc.localId,
      sub: acc.localId,
      iat: nowSec,
      exp: nowSec + validDurationSec,
      email: acc.email,
      email_verified: acc.emailVerified,
      name: acc.displayName,
      ...acc.customClaims,
      firebase: {
        identities: {
          email: [acc.email],
        },
        sign_in_provider: 'password',
      },
    });

    return {
      status: 200,
      payload: {
        sessionCookie: sessionCookieJwt,
      },
    };
  }

  // 7. Client token refresh: POST /securetoken.googleapis.com/v1/token
  if (method === 'POST' && urlPath.includes('/securetoken.googleapis.com/v1/token')) {
    const refreshToken =
      typeof body.refresh_token === 'string'
        ? body.refresh_token
        : typeof body.refreshToken === 'string'
          ? body.refreshToken
          : '';
    const uid = uidByRefreshToken.get(refreshToken);
    const acc = uid ? accountsByUid.get(uid) : undefined;
    if (!acc || acc.disabled) {
      return {
        status: 400,
        payload: { error: { code: 400, message: 'INVALID_REFRESH_TOKEN' } },
      };
    }
    const idToken = createIdTokenForAccount(acc);
    return {
      status: 200,
      payload: {
        access_token: idToken,
        id_token: idToken,
        refresh_token: refreshToken,
        user_id: acc.localId,
        project_id: CANONICAL_FIREBASE_PROJECT_ID,
        expires_in: '3600',
        token_type: 'Bearer',
      },
    };
  }

  return {
    status: 404,
    payload: { error: { code: 404, message: `UNSUPPORTED_AUTH_ENDPOINT:${method}:${urlPath}` } },
  };
}

/**
 * Express router mounting the Google Identity Toolkit / SecureToken endpoints
 * so browser and server Firebase Auth SDKs can communicate over HTTP/HTTPS.
 */
export const firebaseAuthWireRouter = Router();

firebaseAuthWireRouter.use((req: Request, res: Response, next) => {
  const urlPath = req.originalUrl.split('?')[0] ?? req.path;
  if (
    !urlPath.startsWith('/identitytoolkit.googleapis.com/') &&
    !urlPath.startsWith('/securetoken.googleapis.com/')
  ) {
    next();
    return;
  }
  const result = handleIdentityToolkitRequest(
    req.method,
    urlPath,
    (req.body ?? {}) as Record<string, unknown>
  );
  res.status(result.status).json(result.payload);
});

let loopbackAuthServer: HttpServer | null = null;
let loopbackHostPort: string | null = null;

/**
 * Ensures the local loopback Firebase Auth Identity Toolkit wire server is running
 * and sets `process.env.FIREBASE_AUTH_EMULATOR_HOST` so `firebase-admin/auth` and
 * `firebase/auth` execute real SDK protocol verification against `cit-schedora`.
 */
export async function ensureFirebaseAuthEmulatorStarted(): Promise<string> {
  if (loopbackHostPort && loopbackAuthServer?.listening) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = loopbackHostPort;
    return loopbackHostPort;
  }

  await new Promise<void>((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let rawBody = '';
      req.on('data', (chunk) => {
        rawBody += String(chunk);
      });
      req.on('end', () => {
        let parsedBody: Record<string, unknown> = {};
        if (rawBody.trim().length > 0) {
          try {
            parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
          } catch {
            parsedBody = {};
          }
        }
        const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
        const result = handleIdentityToolkitRequest(req.method ?? 'GET', urlPath, parsedBody);
        res.writeHead(result.status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        });
        res.end(JSON.stringify(result.payload));
      });
    });

    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address() as AddressInfo;
      loopbackAuthServer = srv;
      loopbackHostPort = `127.0.0.1:${address.port}`;
      process.env.FIREBASE_AUTH_EMULATOR_HOST = loopbackHostPort;
      resolve();
    });
  });

  return loopbackHostPort!;
}
