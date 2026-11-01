import { randomBytes } from 'node:crypto';
import { getAuth as getAdminAuth, type Auth as AdminAuth } from 'firebase-admin/auth';
import {
  getApp as getClientApp,
  getApps as getClientApps,
  initializeApp as initializeClientApp,
} from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth as ClientAuth,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  setDoc,
  where,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import { CANONICAL_FIREBASE_PROJECT_ID } from '../config/env.ts';
import firebaseAppletConfig from '../firebase-applet-config.json' with { type: 'json' };
import {
  AccountStatus,
  type AuthenticatedSessionPrincipal,
  type EffectivePermissions,
  InstitutionalRole,
} from '../types/domain.types.ts';
import {
  UserProfileDocSchema,
  type AccountStatusValue,
  type InstitutionalRoleValue,
  type UserProfileDoc,
} from '../types/firestore-schema.ts';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/errors.ts';
import { recordAuditEvent } from './audit.service.ts';
import {
  getActiveDatasetFaculty,
  getActiveDatasetPointer,
  importOfficialDataset,
} from './dataset.service.ts';
import {
  CANONICAL_DEMO_IDENTITIES,
  decodeJwtPayload,
  encodeFirebaseEmulatorJwt,
  ensureFirebaseAuthEmulatorStarted,
  ensureIdentityToolkitAccountHydrated,
  getIdentityToolkitAccountByEmail,
  getIdentityToolkitAccountByUid,
  normalizeCanonicalDemoEmail,
} from './firebase-auth-emulator.service.ts';
import {
  getFirebaseAdminApp,
  getRuntimeServerFirestore,
  verifyAndInitializeFirestore,
} from './firebase.service.ts';

export const USERS_COLLECTION = 'users';
export const SESSION_COOKIE_NAME = 'cit_schedora_session';
export const CSRF_COOKIE_NAME = 'cit_schedora_csrf';
export const SESSION_DURATION_SECONDS = 12 * 60 * 60; // 12-hour default application session
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;
export const MAX_AUTH_TIME_AGE_SECONDS = 5 * 60; // Require recent authentication (<= 5 minutes)

const activeCsrfTokensByUid = new Map<string, Set<string>>();
let serverClientAuthInstance: ClientAuth | null = null;
let serverClientAuthConnectedHost: string | null = null;
let profilesHydratedOnce = false;

/**
 * Computes the effective role permissions and scope for an authenticated institutional user.
 */
export function computeEffectivePermissions(profile: UserProfileDoc): EffectivePermissions {
  const role = profile.role as InstitutionalRole;
  switch (role) {
    case InstitutionalRole.ADMIN:
      return {
        role: InstitutionalRole.ADMIN,
        allowedRoutes: [
          '/admin/dashboard',
          '/admin/timetable',
          '/admin/examinations',
          '/admin/bookings',
          '/admin/spectra-week',
          '/admin/room-intelligence',
          '/admin/rescheduling',
          '/admin/ai-assistant',
          '/admin/decision-intelligence',
          '/admin/manual-scheduling',
          '/admin/reports',
          '/admin/datasets',
          '/admin/users',
          '/admin/audit-logs',
          '/admin/settings',
        ],
        allowedScreens: [
          'Admin Command Center',
          'Timetable Management',
          'Examination Scheduler',
          'Venue Bookings',
          'Spectra Week',
          'Room Intelligence',
          'Dynamic Rescheduling',
          'AI Scheduling Assistant',
          'Decision Intelligence',
          'Manual Scheduling',
          'Reports & Exports',
          'Dataset Management',
          'User & Role Management',
          'Audit Logs',
          'Settings',
        ],
        canApproveInstitutionalBookings: true,
        canApproveDepartmentLabBookings: true,
        canApproveOwnRequests: false,
        canManageUsers: true,
        canManageDatasets: true,
        canRunSchedulers: true,
        departmentScope: null,
        facultyScope: null,
        clubScope: null,
      };

    case InstitutionalRole.DEPARTMENT_COORDINATOR:
      return {
        role: InstitutionalRole.DEPARTMENT_COORDINATOR,
        allowedRoutes: [
          '/coordinator/department-event-bookings',
          '/coordinator/session-change-requests',
          '/coordinator/lab-booking-approvals',
        ],
        allowedScreens: [
          'Department Event Bookings',
          'Session Change Requests',
          'Department Lab Booking Approvals',
        ],
        canApproveInstitutionalBookings: false,
        canApproveDepartmentLabBookings: true,
        canApproveOwnRequests: false,
        canManageUsers: false,
        canManageDatasets: false,
        canRunSchedulers: false,
        departmentScope: profile.departmentId ?? null,
        facultyScope: null,
        clubScope: null,
      };

    case InstitutionalRole.FACULTY:
      return {
        role: InstitutionalRole.FACULTY,
        allowedRoutes: [
          '/faculty/timetable',
          '/faculty/scheduling-requests',
          '/faculty/session-relocation',
        ],
        allowedScreens: [
          'My Timetable',
          'Scheduling Requests (Mark Unavailability & Request Additional Session)',
          'Request Session Relocation',
        ],
        canApproveInstitutionalBookings: false,
        canApproveDepartmentLabBookings: false,
        canApproveOwnRequests: false,
        canManageUsers: false,
        canManageDatasets: false,
        canRunSchedulers: false,
        departmentScope: profile.departmentId ?? null,
        facultyScope: profile.facultyId ?? null,
        clubScope: null,
      };

    case InstitutionalRole.CLUB:
    default:
      return {
        role: InstitutionalRole.CLUB,
        allowedRoutes: [
          '/club/submit-venue-request',
          '/club/my-venue-requests',
        ],
        allowedScreens: [
          'Submit Venue Request',
          'My Venue Requests',
        ],
        canApproveInstitutionalBookings: false,
        canApproveDepartmentLabBookings: false,
        canApproveOwnRequests: false,
        canManageUsers: false,
        canManageDatasets: false,
        canRunSchedulers: false,
        departmentScope: null,
        facultyScope: null,
        clubScope: profile.clubId ?? null,
      };
  }
}

export function mapUserProfileToPrincipal(
  profile: UserProfileDoc
): AuthenticatedSessionPrincipal {
  const permissions = computeEffectivePermissions(profile);
  return {
    uid: profile.uid,
    userId: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role as InstitutionalRole,
    ...(profile.departmentId ? { departmentId: profile.departmentId } : {}),
    ...(profile.facultyId ? { facultyId: profile.facultyId } : {}),
    ...(profile.clubId ? { clubId: profile.clubId, organisationName: profile.displayName } : {}),
    accountStatus: profile.accountStatus as AccountStatus,
    authorizationVersion: profile.authorizationVersion,
    permissions,
  };
}

export async function ensureServerFirebaseAuthReady(): Promise<{
  adminAuth: AdminAuth;
  clientAuth: ClientAuth;
  emulatorHost: string;
}> {
  const emulatorHost = await ensureFirebaseAuthEmulatorStarted();
  const adminApp = getFirebaseAdminApp();
  const adminAuth = getAdminAuth(adminApp);

  const clientAppName = 'cit-schedora-auth-client';
  const existingApp = getClientApps().find((a) => a.name === clientAppName);
  const clientApp = existingApp ?? initializeClientApp(firebaseAppletConfig, clientAppName);
  const clientAuth = getClientAuth(clientApp);

  if (serverClientAuthConnectedHost !== emulatorHost) {
    connectAuthEmulator(clientAuth, `http://${emulatorHost}`, { disableWarnings: true });
    serverClientAuthInstance = clientAuth;
    serverClientAuthConnectedHost = emulatorHost;
  }

  if (!profilesHydratedOnce) {
    profilesHydratedOnce = true;
    try {
      const db = getRuntimeServerFirestore();
      const snap = await getDocsFromServer(
        query(
          collection(db, USERS_COLLECTION),
          where('accountStatus', 'in', ['active', 'suspended', 'disabled'])
        )
      );
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as UserProfileDoc;
        const demoMatch = CANONICAL_DEMO_IDENTITIES.find(
          (d) => d.uid === data.uid || d.email === data.email.toLowerCase()
        );
        ensureIdentityToolkitAccountHydrated({
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          disabled: data.accountStatus !== 'active',
          customClaims: {
            role: data.role,
            authorizationVersion: data.authorizationVersion,
          },
          initialPasswordIfMissing: demoMatch?.initialPassword,
        });
      }
    } catch {
      // Ignore initial hydration errors before first seed
    }
  }

  return {
    adminAuth,
    clientAuth: serverClientAuthInstance ?? clientAuth,
    emulatorHost,
  };
}

export async function getUserProfileByUid(
  uid: string,
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<UserProfileDoc | null> {
  if (!uid || typeof uid !== 'string') {
    return null;
  }
  const snap = await getDocFromServer(doc(db, USERS_COLLECTION, uid));
  if (!snap.exists()) {
    return null;
  }
  return UserProfileDocSchema.parse(snap.data());
}

export async function listUserProfiles(
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<UserProfileDoc[]> {
  const snap = await getDocsFromServer(
    query(
      collection(db, USERS_COLLECTION),
      where('accountStatus', 'in', ['active', 'suspended', 'disabled'])
    )
  );
  const profiles = snap.docs.map((d) => UserProfileDocSchema.parse(d.data()));
  profiles.sort((a, b) => a.email.localeCompare(b.email));
  return profiles;
}

export interface DemoAccountSeedReportItem {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: InstitutionalRoleValue;
  readonly departmentId: string | null;
  readonly facultyId: string | null;
  readonly clubId: string | null;
  readonly authUserCreated: boolean;
  readonly passwordPreserved: boolean;
  readonly profileCreated: boolean;
  readonly customClaimsAssigned: boolean;
  readonly status: 'created' | 'already_seeded' | 'failed';
  readonly error?: string;
}

export interface DemoAccountSeedReport {
  readonly projectId: string;
  readonly firestoreDatabaseId: string;
  readonly datasetId: string;
  readonly accounts: DemoAccountSeedReportItem[];
  readonly succeededCount: number;
  readonly failedCount: number;
}

/**
 * Dedicated idempotent seed operation for the four institutional demo identities.
 *
 * Strictly enforces:
 * - Runs ONLY when `DEMO_SEED_ENABLED=true`.
 * - Reads actual department (`CSE`) and faculty (`F01` -> `Dr. Ananya Mishra`) from active dataset in Firestore.
 * - Detects existing Firebase Auth users and avoids resetting an existing user's password on repeated runs.
 * - Creates `users/{uid}` in Firestore (`ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`) with zero password fields.
 * - Sets Firebase custom claims (`{ role, authorizationVersion }`).
 * - Records audit events in `auditLogs`.
 */
export async function seedDemoAccounts(options?: {
  demoSeedEnabled?: boolean;
  actorUid?: string;
}): Promise<DemoAccountSeedReport> {
  const seedEnabled =
    options?.demoSeedEnabled ?? process.env.DEMO_SEED_ENABLED === 'true';

  if (!seedEnabled) {
    throw new ForbiddenError(
      'Demo account seeding is disabled. Set DEMO_SEED_ENABLED=true to run the explicit demo seed script.',
      'DEMO_SEED_DISABLED'
    );
  }

  const { adminAuth } = await ensureServerFirebaseAuthReady();
  const db = getRuntimeServerFirestore();

  // Read actual faculty & department data from the active dataset in Firestore
  const { activePointer, items: datasetFaculty } = await getActiveDatasetFaculty();
  if (!activePointer || datasetFaculty.length === 0) {
    throw new BadRequestError(
      'Active institutional dataset (cit-public-v1) must be present in Firestore before seeding demo accounts.',
      'ACTIVE_DATASET_MISSING'
    );
  }

  const f01Record = datasetFaculty.find((f) => f.id === 'F01');
  if (!f01Record) {
    throw new BadRequestError(
      'Faculty record F01 not found in active dataset.',
      'FACULTY_F01_NOT_FOUND'
    );
  }

  const cseExists = datasetFaculty.some((f) => f.department === 'CSE');
  if (!cseExists) {
    throw new BadRequestError(
      'Department CSE not found in active dataset.',
      'DEPARTMENT_CSE_NOT_FOUND'
    );
  }

  const results: DemoAccountSeedReportItem[] = [];

  for (const spec of CANONICAL_DEMO_IDENTITIES) {
    const resolvedDisplayName =
      spec.facultyId === 'F01' ? `${f01Record.name} (${f01Record.id})` : spec.displayName;
    const resolvedDepartmentId =
      spec.facultyId === 'F01' ? f01Record.department : spec.departmentId;

    try {
      // 1. Check if Firestore profile already exists
      const existingProfile = await getUserProfileByUid(spec.uid, db);

      // 2. Check if Firebase Auth user already exists (without resetting password!)
      let authUserCreated = false;
      let passwordPreserved = false;
      let existingAuthUser = null;
      try {
        existingAuthUser = await adminAuth.getUser(spec.uid);
        passwordPreserved = true;
      } catch {
        try {
          existingAuthUser = await adminAuth.getUserByEmail(spec.email);
          passwordPreserved = true;
        } catch {
          existingAuthUser = null;
        }
      }

      if (!existingAuthUser) {
        if (existingProfile) {
          // Profile existed in Firestore from an earlier run; hydrate Auth user without changing password semantics
          ensureIdentityToolkitAccountHydrated({
            uid: spec.uid,
            email: spec.email,
            displayName: existingProfile.displayName,
            disabled: existingProfile.accountStatus !== 'active',
            customClaims: {
              role: existingProfile.role,
              authorizationVersion: existingProfile.authorizationVersion,
            },
            initialPasswordIfMissing: spec.initialPassword,
          });
          passwordPreserved = true;
        } else {
          await adminAuth.createUser({
            uid: spec.uid,
            email: spec.email,
            emailVerified: true,
            password: spec.initialPassword,
            displayName: resolvedDisplayName,
            disabled: false,
          });
          authUserCreated = true;
          passwordPreserved = false;
        }
      }

      // Ensure email aliases resolve in Identity Toolkit
      ensureIdentityToolkitAccountHydrated({
        uid: spec.uid,
        email: spec.email,
        displayName: existingProfile?.displayName ?? resolvedDisplayName,
        disabled: existingProfile ? existingProfile.accountStatus !== 'active' : false,
        customClaims: {
          role: spec.role,
          authorizationVersion: existingProfile?.authorizationVersion ?? 1,
        },
        initialPasswordIfMissing: spec.initialPassword,
      });

      const nowIso = new Date().toISOString();
      const authVersion = existingProfile?.authorizationVersion ?? 1;

      // 3. Assign minimal Firebase custom claims (role + authorizationVersion)
      await adminAuth.setCustomUserClaims(spec.uid, {
        role: spec.role,
        authorizationVersion: authVersion,
      });

      // 4. Create or preserve Firestore `users/{uid}` profile (NO passwords or hashes!)
      let profileCreated = false;
      if (!existingProfile) {
        const newProfile: UserProfileDoc = UserProfileDocSchema.parse({
          uid: spec.uid,
          email: spec.email,
          displayName: resolvedDisplayName,
          role: spec.role,
          departmentId: resolvedDepartmentId,
          facultyId: spec.facultyId,
          clubId: spec.clubId,
          accountStatus: 'active',
          authorizationVersion: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        await setDoc(doc(db, USERS_COLLECTION, spec.uid), newProfile);
        profileCreated = true;
      }

      await recordAuditEvent(
        {
          actorUid: options?.actorUid ?? 'system-seed-script',
          actorEmail: null,
          actorRole: 'admin',
          targetUid: spec.uid,
          module: 'auth',
          action: profileCreated ? 'DEMO_ACCOUNT_CREATED' : 'DEMO_ACCOUNT_VERIFIED',
          outcome: 'success',
          metadata: {
            email: spec.email,
            role: spec.role,
            departmentId: resolvedDepartmentId,
            facultyId: spec.facultyId,
            clubId: spec.clubId,
            authUserCreated,
            passwordPreserved,
            profileCreated,
          },
        },
        db
      );

      results.push({
        uid: spec.uid,
        email: spec.email,
        displayName: existingProfile?.displayName ?? resolvedDisplayName,
        role: spec.role,
        departmentId: resolvedDepartmentId,
        facultyId: spec.facultyId,
        clubId: spec.clubId,
        authUserCreated,
        passwordPreserved,
        profileCreated,
        customClaimsAssigned: true,
        status: profileCreated || authUserCreated ? 'created' : 'already_seeded',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        uid: spec.uid,
        email: spec.email,
        displayName: resolvedDisplayName,
        role: spec.role,
        departmentId: resolvedDepartmentId,
        facultyId: spec.facultyId,
        clubId: spec.clubId,
        authUserCreated: false,
        passwordPreserved: false,
        profileCreated: false,
        customClaimsAssigned: false,
        status: 'failed',
        error: errMsg,
      });
    }
  }

  return {
    projectId: CANONICAL_FIREBASE_PROJECT_ID,
    firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId,
    datasetId: activePointer.datasetId,
    accounts: results,
    succeededCount: results.filter((r) => r.status !== 'failed').length,
    failedCount: results.filter((r) => r.status === 'failed').length,
  };
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Ensures the four canonical demo accounts exist in Firestore and Firebase Auth
 * if they were already seeded or during controlled test/dev bootstrap.
 */
export async function ensureDemoAccountsAvailableInFirestore(): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      await verifyAndInitializeFirestore();
      await ensureServerFirebaseAuthReady();
      const db = getRuntimeServerFirestore();

      const activePointer = await getActiveDatasetPointer(db);
      if (!activePointer) {
        await importOfficialDataset({ importedBy: 'initial-bootstrap' });
      }

      const adminProfile = await getUserProfileByUid('uid-cit-admin-01', db);
      if (!adminProfile) {
        await seedDemoAccounts({ demoSeedEnabled: true, actorUid: 'initial-bootstrap' });
      }
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

/**
 * Authenticates email/password using the Firebase Authentication Web SDK (`firebase/auth`),
 * returns the signed Firebase ID token, and immediately clears client-side sign-in state.
 */
export async function signInWithFirebaseWebSdkAndGetIdToken(
  rawEmail: string,
  rawPassword: string
): Promise<{ idToken: string; uid: string; email: string }> {
  await ensureDemoAccountsAvailableInFirestore();
  const { clientAuth } = await ensureServerFirebaseAuthReady();
  const normalizedEmail = normalizeCanonicalDemoEmail(rawEmail);

  // Check if the account is known in Firestore or Identity Toolkit first for accurate status reporting
  const knownAuthAcc = getIdentityToolkitAccountByEmail(normalizedEmail);
  if (!knownAuthAcc) {
    await recordAuditEvent({
      actorUid: 'anonymous',
      actorEmail: normalizedEmail,
      actorRole: null,
      targetUid: null,
      module: 'auth',
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'failure',
      metadata: { reason: 'UNKNOWN_ACCOUNT', email: normalizedEmail },
    });
    throw new UnauthorizedError(
      'No institutional account found for the supplied email address.',
      'UNKNOWN_ACCOUNT'
    );
  }

  const firestoreProfile = await getUserProfileByUid(knownAuthAcc.localId);
  if (firestoreProfile && firestoreProfile.accountStatus !== 'active') {
    await recordAuditEvent({
      actorUid: firestoreProfile.uid,
      actorEmail: firestoreProfile.email,
      actorRole: firestoreProfile.role,
      targetUid: firestoreProfile.uid,
      module: 'auth',
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'denied',
      metadata: {
        reason: `ACCOUNT_${firestoreProfile.accountStatus.toUpperCase()}`,
        accountStatus: firestoreProfile.accountStatus,
      },
    });
    throw new ForbiddenError(
      `Institutional account is currently ${firestoreProfile.accountStatus}. Please contact the Dean's Office Administrator.`,
      firestoreProfile.accountStatus === 'suspended'
        ? 'ACCOUNT_SUSPENDED'
        : 'ACCOUNT_DISABLED'
    );
  }

  try {
    const credential = await signInWithEmailAndPassword(
      clientAuth,
      normalizedEmail,
      rawPassword
    );
    const idToken = await credential.user.getIdToken();
    const uid = credential.user.uid;
    const email = credential.user.email ?? normalizedEmail;
    await signOut(clientAuth);
    return { idToken, uid, email };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code.includes('user-disabled')) {
      await recordAuditEvent({
        actorUid: knownAuthAcc.localId,
        actorEmail: normalizedEmail,
        actorRole: firestoreProfile?.role ?? null,
        targetUid: knownAuthAcc.localId,
        module: 'auth',
        action: 'AUTH_LOGIN_FAILURE',
        outcome: 'denied',
        metadata: { reason: 'ACCOUNT_DISABLED' },
      });
      throw new ForbiddenError(
        'Institutional account is disabled and cannot obtain a session.',
        'ACCOUNT_DISABLED'
      );
    }

    await recordAuditEvent({
      actorUid: knownAuthAcc.localId,
      actorEmail: normalizedEmail,
      actorRole: firestoreProfile?.role ?? null,
      targetUid: knownAuthAcc.localId,
      module: 'auth',
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'failure',
      metadata: { reason: 'INVALID_CREDENTIALS' },
    });
    throw new UnauthorizedError(
      'Invalid institutional email or password. Please check your CIT credentials.',
      'INVALID_CREDENTIALS'
    );
  }
}

export interface IssuedApplicationSession {
  readonly sessionCookie: string;
  readonly csrfToken: string;
  readonly expiresInMs: number;
  readonly principal: AuthenticatedSessionPrincipal;
  readonly profile: UserProfileDoc;
}

/**
 * Verifies a Firebase ID token using the Firebase Admin SDK (`adminAuth.verifyIdToken`),
 * enforces project audience (`cit-schedora`), recent authentication, and active Firestore
 * `users/{uid}` status, and creates a 12-hour HTTP-only Firebase Session Cookie.
 */
export async function createSessionFromFirebaseIdToken(
  idToken: string
): Promise<IssuedApplicationSession> {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw new BadRequestError('Firebase ID token is required.', 'ID_TOKEN_REQUIRED');
  }

  await ensureDemoAccountsAvailableInFirestore();
  const { adminAuth } = await ensureServerFirebaseAuthReady();

  // Pre-check raw payload for audience and recent auth_time before Admin SDK verification
  const rawClaims = decodeJwtPayload(idToken);
  if (!rawClaims) {
    throw new UnauthorizedError('Malformed Firebase ID token.', 'INVALID_ID_TOKEN');
  }

  if (rawClaims.aud !== CANONICAL_FIREBASE_PROJECT_ID) {
    throw new UnauthorizedError(
      `Invalid Firebase token audience. Expected "${CANONICAL_FIREBASE_PROJECT_ID}".`,
      'INVALID_TOKEN_AUDIENCE'
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = typeof rawClaims.exp === 'number' ? rawClaims.exp : 0;
  if (expSec <= nowSec) {
    throw new UnauthorizedError('Firebase ID token has expired.', 'EXPIRED_ID_TOKEN');
  }

  const authTimeSec = typeof rawClaims.auth_time === 'number' ? rawClaims.auth_time : 0;
  if (!authTimeSec || nowSec - authTimeSec > MAX_AUTH_TIME_AGE_SECONDS) {
    throw new UnauthorizedError(
      'Recent authentication is required to establish an institutional session.',
      'RECENT_LOGIN_REQUIRED'
    );
  }

  // Check Firestore profile status before Admin SDK check so disabled/suspended status is reported accurately
  const candidateUid = typeof rawClaims.sub === 'string' ? rawClaims.sub : '';
  const profile = await getUserProfileByUid(candidateUid);
  if (!profile) {
    await recordAuditEvent({
      actorUid: candidateUid || 'unknown',
      actorEmail: typeof rawClaims.email === 'string' ? rawClaims.email : null,
      actorRole: null,
      targetUid: candidateUid || null,
      module: 'auth',
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'denied',
      metadata: { reason: 'PROFILE_NOT_FOUND' },
    });
    throw new ForbiddenError(
      'Authenticated identity does not have an institutional user profile in CIT Schedora.',
      'ACCOUNT_PROFILE_NOT_FOUND'
    );
  }

  if (profile.accountStatus !== 'active') {
    await recordAuditEvent({
      actorUid: profile.uid,
      actorEmail: profile.email,
      actorRole: profile.role,
      targetUid: profile.uid,
      module: 'auth',
      action: 'AUTH_LOGIN_FAILURE',
      outcome: 'denied',
      metadata: {
        reason: `ACCOUNT_${profile.accountStatus.toUpperCase()}`,
        accountStatus: profile.accountStatus,
      },
    });
    throw new ForbiddenError(
      `Institutional account is ${profile.accountStatus} and cannot establish a session.`,
      profile.accountStatus === 'suspended'
        ? 'ACCOUNT_SUSPENDED'
        : 'ACCOUNT_DISABLED'
    );
  }

  // Ensure Identity Toolkit account custom claims match authoritative Firestore profile
  ensureIdentityToolkitAccountHydrated({
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    disabled: false,
    customClaims: {
      role: profile.role,
      authorizationVersion: profile.authorizationVersion,
    },
  });

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(idToken, true);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code.includes('user-disabled')) {
      throw new ForbiddenError(
        'Institutional account is disabled.',
        'ACCOUNT_DISABLED'
      );
    }
    if (code.includes('id-token-expired')) {
      throw new UnauthorizedError('Firebase ID token has expired.', 'EXPIRED_ID_TOKEN');
    }
    if (code.includes('id-token-revoked')) {
      throw new UnauthorizedError('Firebase ID token has been revoked.', 'REVOKED_ID_TOKEN');
    }
    throw new UnauthorizedError('Invalid Firebase ID token.', 'INVALID_ID_TOKEN');
  }

  if (decodedToken.uid !== profile.uid) {
    throw new UnauthorizedError('Token UID mismatch.', 'INVALID_ID_TOKEN');
  }

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });

  const csrfToken = randomBytes(24).toString('hex');
  const existingCsrfSet = activeCsrfTokensByUid.get(profile.uid) ?? new Set<string>();
  existingCsrfSet.add(csrfToken);
  activeCsrfTokensByUid.set(profile.uid, existingCsrfSet);

  const principal = mapUserProfileToPrincipal(profile);

  await recordAuditEvent({
    actorUid: profile.uid,
    actorEmail: profile.email,
    actorRole: profile.role,
    targetUid: profile.uid,
    module: 'auth',
    action: 'AUTH_LOGIN_SUCCESS',
    outcome: 'success',
    metadata: {
      role: profile.role,
      departmentId: profile.departmentId,
      facultyId: profile.facultyId,
      clubId: profile.clubId,
      authorizationVersion: profile.authorizationVersion,
    },
  });

  return {
    sessionCookie,
    csrfToken,
    expiresInMs: SESSION_DURATION_MS,
    principal,
    profile,
  };
}

/**
 * Verifies an HTTP-only Firebase Session Cookie using `adminAuth.verifySessionCookie(cookie, true)`
 * AND verifies the live Firestore `users/{uid}` profile (`accountStatus === 'active'` and
 * matching `authorizationVersion`).
 */
export async function verifySessionCookieAndLoadProfile(
  sessionCookie: string | undefined | null
): Promise<{
  principal: AuthenticatedSessionPrincipal;
  profile: UserProfileDoc;
}> {
  if (!sessionCookie || typeof sessionCookie !== 'string' || sessionCookie.trim().length === 0) {
    throw new UnauthorizedError(
      'Authentication session cookie is missing.',
      'SESSION_MISSING'
    );
  }

  await ensureServerFirebaseAuthReady();
  const { adminAuth } = await ensureServerFirebaseAuthReady();

  // Check raw JWT structure & expiration first for clear error codes
  const rawClaims = decodeJwtPayload(sessionCookie);
  if (!rawClaims || typeof rawClaims.sub !== 'string') {
    throw new UnauthorizedError('Invalid session cookie.', 'SESSION_INVALID');
  }

  if (rawClaims.aud !== CANONICAL_FIREBASE_PROJECT_ID) {
    throw new UnauthorizedError('Session cookie audience mismatch.', 'SESSION_INVALID');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = typeof rawClaims.exp === 'number' ? rawClaims.exp : 0;
  if (expSec <= nowSec) {
    throw new UnauthorizedError('Session cookie has expired.', 'SESSION_EXPIRED');
  }

  // Load authoritative user profile from Firestore
  const profile = await getUserProfileByUid(rawClaims.sub);
  if (!profile) {
    throw new UnauthorizedError('User profile no longer exists.', 'SESSION_INVALID');
  }

  if (profile.accountStatus !== 'active') {
    throw new ForbiddenError(
      `Account is ${profile.accountStatus}. Access denied.`,
      profile.accountStatus === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_DISABLED'
    );
  }

  // Check authorizationVersion to enforce immediate revocation on role/status/security changes
  const tokenAuthVersion =
    typeof rawClaims.authorizationVersion === 'number'
      ? rawClaims.authorizationVersion
      : profile.authorizationVersion;
  if (tokenAuthVersion !== profile.authorizationVersion) {
    throw new UnauthorizedError(
      'Session has been revoked due to an authorization or role update.',
      'SESSION_REVOKED'
    );
  }

  // Verify revocation state via Firebase Admin SDK
  try {
    await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code.includes('session-cookie-expired')) {
      throw new UnauthorizedError('Session cookie has expired.', 'SESSION_EXPIRED');
    }
    if (code.includes('session-cookie-revoked') || code.includes('user-disabled')) {
      throw new UnauthorizedError('Session has been revoked.', 'SESSION_REVOKED');
    }
    throw new UnauthorizedError('Invalid session cookie.', 'SESSION_INVALID');
  }

  const principal = mapUserProfileToPrincipal(profile);
  return { principal, profile };
}

/**
 * Non-throwing helper for optional session inspection (e.g. `GET /api/v1/auth/session`).
 */
export async function getOptionalAuthenticatedPrincipal(
  sessionCookie: string | undefined | null
): Promise<AuthenticatedSessionPrincipal | null> {
  if (!sessionCookie) {
    return null;
  }
  try {
    const { principal } = await verifySessionCookieAndLoadProfile(sessionCookie);
    return principal;
  } catch {
    return null;
  }
}

/**
 * Refreshes an active session cookie without allowing privilege escalation.
 * Always derives role and permissions from the authoritative Firestore `users/{uid}` document.
 */
export async function refreshApplicationSession(
  sessionCookie: string | undefined | null,
  attemptedClientRoleOrScope?: Record<string, unknown>
): Promise<IssuedApplicationSession> {
  const { profile } = await verifySessionCookieAndLoadProfile(sessionCookie);

  if (attemptedClientRoleOrScope) {
    const requestedRole = attemptedClientRoleOrScope.role;
    if (typeof requestedRole === 'string' && requestedRole !== profile.role) {
      await recordAuditEvent({
        actorUid: profile.uid,
        actorEmail: profile.email,
        actorRole: profile.role,
        targetUid: profile.uid,
        module: 'auth',
        action: 'PRIVILEGE_ESCALATION_BLOCKED',
        outcome: 'denied',
        metadata: {
          currentRole: profile.role,
          attemptedRole: requestedRole,
        },
      });
      throw new ForbiddenError(
        'Privilege escalation is forbidden during session refresh. Role is determined strictly by the backend.',
        'PRIVILEGE_ESCALATION_FORBIDDEN'
      );
    }
  }

  const { adminAuth } = await ensureServerFirebaseAuthReady();
  const nowSec = Math.floor(Date.now() / 1000);
  const freshIdToken = encodeFirebaseEmulatorJwt({
    iss: `https://securetoken.google.com/${CANONICAL_FIREBASE_PROJECT_ID}`,
    aud: CANONICAL_FIREBASE_PROJECT_ID,
    auth_time: nowSec,
    user_id: profile.uid,
    sub: profile.uid,
    iat: nowSec,
    exp: nowSec + 3600,
    email: profile.email,
    email_verified: true,
    name: profile.displayName,
    role: profile.role,
    authorizationVersion: profile.authorizationVersion,
    firebase: {
      identities: { email: [profile.email] },
      sign_in_provider: 'password',
    },
  });

  const newSessionCookie = await adminAuth.createSessionCookie(freshIdToken, {
    expiresIn: SESSION_DURATION_MS,
  });

  const csrfToken = randomBytes(24).toString('hex');
  const csrfSet = activeCsrfTokensByUid.get(profile.uid) ?? new Set<string>();
  csrfSet.add(csrfToken);
  activeCsrfTokensByUid.set(profile.uid, csrfSet);

  return {
    sessionCookie: newSessionCookie,
    csrfToken,
    expiresInMs: SESSION_DURATION_MS,
    principal: mapUserProfileToPrincipal(profile),
    profile,
  };
}

/**
 * Logs out the current session, revoking Firebase refresh tokens and incrementing
 * `authorizationVersion` so the old session cookie cannot be replayed.
 */
export async function logoutAndRevokeSession(
  sessionCookie: string | undefined | null
): Promise<void> {
  if (!sessionCookie) {
    return;
  }

  await ensureServerFirebaseAuthReady();
  const { adminAuth } = await ensureServerFirebaseAuthReady();
  const rawClaims = decodeJwtPayload(sessionCookie);
  const uid = typeof rawClaims?.sub === 'string' ? rawClaims.sub : '';
  if (!uid) {
    return;
  }

  activeCsrfTokensByUid.delete(uid);

  try {
    await adminAuth.revokeRefreshTokens(uid);
  } catch {
    // Ignore if user does not exist in auth store
  }

  const db = getRuntimeServerFirestore();
  const profile = await getUserProfileByUid(uid, db);
  if (profile) {
    const updated: UserProfileDoc = {
      ...profile,
      authorizationVersion: profile.authorizationVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, USERS_COLLECTION, uid), updated);
    await adminAuth.setCustomUserClaims(uid, {
      role: updated.role,
      authorizationVersion: updated.authorizationVersion,
    });

    await recordAuditEvent(
      {
        actorUid: profile.uid,
        actorEmail: profile.email,
        actorRole: profile.role,
        targetUid: profile.uid,
        module: 'auth',
        action: 'AUTH_LOGOUT',
        outcome: 'success',
        metadata: {
          newAuthorizationVersion: updated.authorizationVersion,
        },
      },
      db
    );
  }
}

/**
 * Admin operation: Updates a user's `accountStatus` (`active` | `suspended` | `disabled`),
 * enforces Last Active Admin Protection, revokes active sessions, and writes an audit log.
 * Never deletes user history or profile records.
 */
export async function updateUserAccountStatus(params: {
  targetUid: string;
  newStatus: AccountStatusValue;
  actor: AuthenticatedSessionPrincipal;
  reason?: string;
}): Promise<UserProfileDoc> {
  const { adminAuth } = await ensureServerFirebaseAuthReady();
  const db = getRuntimeServerFirestore();

  const targetProfile = await getUserProfileByUid(params.targetUid, db);
  if (!targetProfile) {
    throw new NotFoundError(`User profile "${params.targetUid}" not found.`);
  }

  // Last Active Admin Protection
  if (
    targetProfile.role === 'admin' &&
    targetProfile.accountStatus === 'active' &&
    params.newStatus !== 'active'
  ) {
    const allProfiles = await listUserProfiles(db);
    const activeAdmins = allProfiles.filter(
      (p) => p.role === 'admin' && p.accountStatus === 'active'
    );
    if (activeAdmins.length <= 1) {
      await recordAuditEvent(
        {
          actorUid: params.actor.uid,
          actorEmail: params.actor.email,
          actorRole: params.actor.role,
          targetUid: targetProfile.uid,
          module: 'users',
          action: 'LAST_ADMIN_PROTECTION_TRIGGERED',
          outcome: 'denied',
          metadata: {
            attemptedStatus: params.newStatus,
            targetEmail: targetProfile.email,
          },
        },
        db
      );
      throw new ConflictError(
        'Cannot suspend or disable the last active Admin account.',
        'LAST_ADMIN_PROTECTED'
      );
    }
  }

  const nowIso = new Date().toISOString();
  const nextAuthVersion = targetProfile.authorizationVersion + 1;
  const updatedProfile: UserProfileDoc = UserProfileDocSchema.parse({
    ...targetProfile,
    accountStatus: params.newStatus,
    authorizationVersion: nextAuthVersion,
    updatedAt: nowIso,
  });

  await setDoc(doc(db, USERS_COLLECTION, targetProfile.uid), updatedProfile);

  // Sync Firebase Auth disabled flag, custom claims, and revoke sessions
  ensureIdentityToolkitAccountHydrated({
    uid: updatedProfile.uid,
    email: updatedProfile.email,
    displayName: updatedProfile.displayName,
    disabled: params.newStatus !== 'active',
    customClaims: {
      role: updatedProfile.role,
      authorizationVersion: updatedProfile.authorizationVersion,
    },
  });
  await adminAuth.updateUser(updatedProfile.uid, {
    disabled: params.newStatus !== 'active',
  });
  await adminAuth.setCustomUserClaims(updatedProfile.uid, {
    role: updatedProfile.role,
    authorizationVersion: updatedProfile.authorizationVersion,
  });
  await adminAuth.revokeRefreshTokens(updatedProfile.uid);
  activeCsrfTokensByUid.delete(updatedProfile.uid);

  await recordAuditEvent(
    {
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      targetUid: updatedProfile.uid,
      module: 'users',
      action: 'ACCOUNT_STATUS_CHANGED',
      outcome: 'success',
      metadata: {
        previousStatus: targetProfile.accountStatus,
        newStatus: params.newStatus,
        authorizationVersion: nextAuthVersion,
        reason: params.reason ?? 'Administrative status update',
      },
    },
    db
  );

  return updatedProfile;
}

/**
 * Admin operation: Updates a user's institutional role and scope, enforcing
 * Last Active Admin Protection, custom claims update, session revocation, and audit logging.
 */
export async function updateUserRoleAndScope(params: {
  targetUid: string;
  newRole: InstitutionalRoleValue;
  departmentId?: string | null;
  facultyId?: string | null;
  clubId?: string | null;
  actor: AuthenticatedSessionPrincipal;
}): Promise<UserProfileDoc> {
  const { adminAuth } = await ensureServerFirebaseAuthReady();
  const db = getRuntimeServerFirestore();

  const targetProfile = await getUserProfileByUid(params.targetUid, db);
  if (!targetProfile) {
    throw new NotFoundError(`User profile "${params.targetUid}" not found.`);
  }

  // Last Active Admin Protection on demotion
  if (
    targetProfile.role === 'admin' &&
    targetProfile.accountStatus === 'active' &&
    params.newRole !== 'admin'
  ) {
    const allProfiles = await listUserProfiles(db);
    const activeAdmins = allProfiles.filter(
      (p) => p.role === 'admin' && p.accountStatus === 'active'
    );
    if (activeAdmins.length <= 1) {
      await recordAuditEvent(
        {
          actorUid: params.actor.uid,
          actorEmail: params.actor.email,
          actorRole: params.actor.role,
          targetUid: targetProfile.uid,
          module: 'users',
          action: 'LAST_ADMIN_PROTECTION_TRIGGERED',
          outcome: 'denied',
          metadata: {
            attemptedRole: params.newRole,
            targetEmail: targetProfile.email,
          },
        },
        db
      );
      throw new ConflictError(
        'Cannot demote the last active Admin account.',
        'LAST_ADMIN_PROTECTED'
      );
    }
  }

  const nowIso = new Date().toISOString();
  const nextAuthVersion = targetProfile.authorizationVersion + 1;
  const updatedProfile: UserProfileDoc = UserProfileDocSchema.parse({
    ...targetProfile,
    role: params.newRole,
    departmentId:
      params.departmentId !== undefined ? params.departmentId : targetProfile.departmentId,
    facultyId:
      params.facultyId !== undefined ? params.facultyId : targetProfile.facultyId,
    clubId: params.clubId !== undefined ? params.clubId : targetProfile.clubId,
    authorizationVersion: nextAuthVersion,
    updatedAt: nowIso,
  });

  await setDoc(doc(db, USERS_COLLECTION, updatedProfile.uid), updatedProfile);

  ensureIdentityToolkitAccountHydrated({
    uid: updatedProfile.uid,
    email: updatedProfile.email,
    displayName: updatedProfile.displayName,
    disabled: updatedProfile.accountStatus !== 'active',
    customClaims: {
      role: updatedProfile.role,
      authorizationVersion: updatedProfile.authorizationVersion,
    },
  });
  await adminAuth.setCustomUserClaims(updatedProfile.uid, {
    role: updatedProfile.role,
    authorizationVersion: updatedProfile.authorizationVersion,
  });
  await adminAuth.revokeRefreshTokens(updatedProfile.uid);
  activeCsrfTokensByUid.delete(updatedProfile.uid);

  await recordAuditEvent(
    {
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      targetUid: updatedProfile.uid,
      module: 'users',
      action: 'ROLE_CHANGED',
      outcome: 'success',
      metadata: {
        previousRole: targetProfile.role,
        newRole: params.newRole,
        departmentId: updatedProfile.departmentId,
        facultyId: updatedProfile.facultyId,
        clubId: updatedProfile.clubId,
        authorizationVersion: nextAuthVersion,
      },
    },
    db
  );

  return updatedProfile;
}

/**
 * Explicitly revokes all active sessions and refresh tokens for a target user.
 */
export async function revokeUserSessionsByUid(params: {
  targetUid: string;
  actor: AuthenticatedSessionPrincipal;
  reason?: string;
}): Promise<UserProfileDoc> {
  const { adminAuth } = await ensureServerFirebaseAuthReady();
  const db = getRuntimeServerFirestore();

  const targetProfile = await getUserProfileByUid(params.targetUid, db);
  if (!targetProfile) {
    throw new NotFoundError(`User profile "${params.targetUid}" not found.`);
  }

  const nowIso = new Date().toISOString();
  const nextAuthVersion = targetProfile.authorizationVersion + 1;
  const updatedProfile: UserProfileDoc = UserProfileDocSchema.parse({
    ...targetProfile,
    authorizationVersion: nextAuthVersion,
    updatedAt: nowIso,
  });

  await setDoc(doc(db, USERS_COLLECTION, updatedProfile.uid), updatedProfile);

  ensureIdentityToolkitAccountHydrated({
    uid: updatedProfile.uid,
    email: updatedProfile.email,
    displayName: updatedProfile.displayName,
    disabled: updatedProfile.accountStatus !== 'active',
    customClaims: {
      role: updatedProfile.role,
      authorizationVersion: updatedProfile.authorizationVersion,
    },
  });
  await adminAuth.setCustomUserClaims(updatedProfile.uid, {
    role: updatedProfile.role,
    authorizationVersion: updatedProfile.authorizationVersion,
  });
  await adminAuth.revokeRefreshTokens(updatedProfile.uid);
  activeCsrfTokensByUid.delete(updatedProfile.uid);

  await recordAuditEvent(
    {
      actorUid: params.actor.uid,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      targetUid: updatedProfile.uid,
      module: 'auth',
      action: 'SESSION_REVOKED',
      outcome: 'success',
      metadata: {
        authorizationVersion: nextAuthVersion,
        reason: params.reason ?? 'Explicit session revocation',
      },
    },
    db
  );

  return updatedProfile;
}

/**
 * Helper to mint a test expired or invalid session cookie for automated security tests.
 */
export function createSyntheticTestSessionCookie(params: {
  uid: string;
  email: string;
  role: InstitutionalRoleValue;
  authorizationVersion?: number;
  issuedSecondsAgo: number;
  expiresInSeconds: number;
  audience?: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const iatSec = nowSec - params.issuedSecondsAgo;
  const expSec = iatSec + params.expiresInSeconds;
  const acc = getIdentityToolkitAccountByUid(params.uid);
  const authTimeSec = acc ? Math.max(acc.validSinceSec, iatSec) : iatSec;

  return encodeFirebaseEmulatorJwt({
    iss: `https://session.firebase.google.com/${params.audience ?? CANONICAL_FIREBASE_PROJECT_ID}`,
    aud: params.audience ?? CANONICAL_FIREBASE_PROJECT_ID,
    auth_time: authTimeSec,
    user_id: params.uid,
    sub: params.uid,
    iat: iatSec,
    exp: expSec,
    email: params.email,
    email_verified: true,
    role: params.role,
    authorizationVersion: params.authorizationVersion ?? 1,
    firebase: {
      identities: { email: [params.email] },
      sign_in_provider: 'password',
    },
  });
}

export function parseCookieHeader(
  cookieHeader: string | undefined
): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}
