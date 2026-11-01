import {
  applicationDefault,
  getApp as getAdminApp,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
  type App as AdminApp,
} from 'firebase-admin/app';
import {
  FieldValue as AdminFieldValue,
  getFirestore as getAdminFirestore,
  Timestamp as AdminTimestamp,
  type Firestore as AdminFirestore,
} from 'firebase-admin/firestore';
import {
  getStorage as getAdminStorage,
  type Storage as AdminStorage,
} from 'firebase-admin/storage';
import {
  getApp as getClientApp,
  getApps as getClientApps,
  initializeApp as initializeClientApp,
  type FirebaseApp as ClientApp,
} from 'firebase/app';
import {
  doc,
  getDocFromServer,
  getFirestore as getClientFirestore,
  serverTimestamp,
  setDoc,
  Timestamp as ClientTimestamp,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import { env } from '../config/env.ts';
import firebaseAppletConfig from '../firebase-applet-config.json' with { type: 'json' };
import { SubsystemStatus } from '../types/api.types.ts';

/**
 * Canonical Firestore Collections for CIT Schedora in project `cit-schedora`.
 * Note: Firestore creates collections automatically when real documents are written.
 * Only `systemMeta/projectConfig` is initialized prior to the dataset ingestion milestone.
 */
export const FIRESTORE_COLLECTIONS = Object.freeze({
  systemMeta: 'systemMeta',
  users: 'users',
  datasets: 'datasets',
  rooms: 'rooms',
  faculty: 'faculty',
  studentGroups: 'studentGroups',
  courses: 'courses',
  sessions: 'sessions',
  bookingRequests: 'bookingRequests',
  bookingDecisions: 'bookingDecisions',
  bookingDecisionRuns: 'bookingDecisionRuns',
  schedules: 'schedules',
  examinations: 'examinations',
  examinationSchedules: 'examinationSchedules',
  unavailabilityRequests: 'unavailabilityRequests',
  additionalSessionRequests: 'additionalSessionRequests',
  sessionChangeRequests: 'sessionChangeRequests',
  departmentBookingApprovals: 'departmentBookingApprovals',
  rescheduleProposals: 'rescheduleProposals',
  disruptionRecords: 'disruptionRecords',
  manualAllocations: 'manualAllocations',
  approvalRecords: 'approvalRecords',
  auditLogs: 'auditLogs',
  systemSettings: 'systemSettings',
  exportRecords: 'exportRecords',
} as const);

export type FirestoreCollectionKey = keyof typeof FIRESTORE_COLLECTIONS;

export const SYSTEM_META_COLLECTION = 'systemMeta';
export const PROJECT_CONFIG_DOC_ID = 'projectConfig';

export interface ProjectConfigMetadata {
  readonly projectId: string;
  readonly databaseType: 'cloud_firestore';
  readonly application: 'CIT Schedora';
  readonly schemaVersion: 1;
  readonly initialized: true;
  readonly createdAt: string;
}

export interface FirestoreVerificationResult {
  readonly adminInitialized: boolean;
  readonly transportUsed: 'firebase_admin_adc' | 'ai_studio_runtime_credentials' | 'failed';
  readonly projectId: string;
  readonly firestoreDatabaseId: string;
  readonly databaseLocation: string;
  readonly storageBucket: string;
  readonly writeSucceeded: boolean;
  readonly readSucceeded: boolean;
  readonly projectIdVerified: boolean;
  readonly dataVerified: boolean;
  readonly createdNewDocument: boolean;
  readonly documentData: ProjectConfigMetadata | null;
  readonly firebaseProjectStatus: SubsystemStatus;
  readonly firestoreStatus: SubsystemStatus;
  readonly notes: string[];
}

let adminAppInstance: AdminApp | null = null;
let adminFirestoreInstance: AdminFirestore | null = null;
let adminStorageInstance: AdminStorage | null = null;
let runtimeClientAppInstance: ClientApp | null = null;
let runtimeClientFirestoreInstance: ClientFirestore | null = null;

/**
 * 1. Initializes the server-side Firebase Admin SDK bound to the configured Firebase project.
 * Never exposed to client or browser code.
 */
export function getFirebaseAdminApp(): AdminApp {
  if (adminAppInstance) {
    return adminAppInstance;
  }

  const existing = getAdminApps();
  if (existing.length > 0) {
    adminAppInstance = getAdminApp();
    return adminAppInstance;
  }

  try {
    adminAppInstance = initializeAdminApp({
      credential: applicationDefault(),
      projectId: env.firebaseProjectId,
      storageBucket: env.storageBucket,
    });
  } catch {
    adminAppInstance = initializeAdminApp({
      projectId: env.firebaseProjectId,
      storageBucket: env.storageBucket,
    });
  }

  return adminAppInstance;
}

/**
 * Returns the shared server-side Firebase Admin Firestore client.
 */
export function getServerFirestore(): AdminFirestore {
  if (adminFirestoreInstance) {
    return adminFirestoreInstance;
  }
  const app = getFirebaseAdminApp();
  adminFirestoreInstance = getAdminFirestore(app, env.firestoreDatabaseId);
  return adminFirestoreInstance;
}

/**
 * Returns the shared server-side Firebase Firestore client authenticated via
 * Google AI Studio runtime credentials (`firebase-applet-config.json`) when the
 * AI Studio sandbox container ADC (`ais-sandbox@...`) lacks cross-project IAM
 * permissions.
 */
export function getRuntimeServerFirestore(): ClientFirestore {
  if (runtimeClientFirestoreInstance) {
    return runtimeClientFirestoreInstance;
  }
  const existingRuntimeApp = getClientApps().find(
    (app) => app.name === 'cit-schedora-server-runtime'
  );
  runtimeClientAppInstance =
    existingRuntimeApp ??
    initializeClientApp(firebaseAppletConfig, 'cit-schedora-server-runtime');
  runtimeClientFirestoreInstance = getClientFirestore(
    runtimeClientAppInstance,
    env.firestoreDatabaseId
  );
  return runtimeClientFirestoreInstance;
}

/**
 * Returns the server-side Cloud Storage instance.
 */
export function getServerStorage(): AdminStorage {
  if (adminStorageInstance) {
    return adminStorageInstance;
  }
  const app = getFirebaseAdminApp();
  adminStorageInstance = getAdminStorage(app);
  return adminStorageInstance;
}

function formatTimestampToIso(val: unknown): string | null {
  if (!val) {
    return null;
  }
  if (val instanceof AdminTimestamp || val instanceof ClientTimestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return null;
}

function matchesExpectedProjectConfig(raw: Record<string, unknown> | undefined): {
  valid: boolean;
  metadata: ProjectConfigMetadata | null;
} {
  if (!raw) {
    return { valid: false, metadata: null };
  }

  const createdAtIso = formatTimestampToIso(raw.createdAt);
  const valid =
    raw.projectId === env.firebaseProjectId &&
    raw.databaseType === 'cloud_firestore' &&
    raw.application === 'CIT Schedora' &&
    raw.schemaVersion === 1 &&
    raw.initialized === true &&
    Boolean(createdAtIso);

  if (!valid || !createdAtIso) {
    return { valid: false, metadata: null };
  }

  return {
    valid: true,
    metadata: {
      projectId: env.firebaseProjectId,
      databaseType: 'cloud_firestore',
      application: 'CIT Schedora',
      schemaVersion: 1,
      initialized: true,
      createdAt: createdAtIso,
    },
  };
}

/**
 * Performs an actual, idempotent server-side Firestore connection & initialization verification:
 * 1. Initializes Firebase Admin SDK for the configured project.
 * 2. Connects to the configured named Firestore database.
 * 3. Idempotently ensures `systemMeta/projectConfig` exists on the server.
 * 4. Reads `systemMeta/projectConfig` back from the server.
 * 5. Verifies `projectId === env.firebaseProjectId` and confirms all returned fields match.
 */
export async function verifyAndInitializeFirestore(): Promise<FirestoreVerificationResult> {
  const notes: string[] = [];
  const configuredProjectMatches =
    env.firebaseProjectId === firebaseAppletConfig.projectId &&
    Boolean(env.firestoreDatabaseId);

  let adminInitialized = false;
  try {
    const adminApp = getFirebaseAdminApp();
    const adminDb = getServerFirestore();
    adminInitialized = Boolean(
      adminApp && adminDb && adminApp.options.projectId === env.firebaseProjectId
    );
  } catch (err) {
    notes.push(`Firebase Admin initialization error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!configuredProjectMatches) {
    return {
      adminInitialized,
      transportUsed: 'failed',
      projectId: env.firebaseProjectId,
      firestoreDatabaseId: env.firestoreDatabaseId,
      databaseLocation: 'asia-south1',
      storageBucket: env.storageBucket,
      writeSucceeded: false,
      readSucceeded: false,
      projectIdVerified: false,
      dataVerified: false,
      createdNewDocument: false,
      documentData: null,
      firebaseProjectStatus: SubsystemStatus.NOT_CONFIGURED,
      firestoreStatus: SubsystemStatus.UNAVAILABLE,
      notes: ['Configured project ID does not match firebase-applet-config.json.'],
    };
  }

  // Attempt 1: Firebase Admin SDK with Google Application Default Credentials
  try {
    const adminDb = getServerFirestore();
    const docRef = adminDb.collection(SYSTEM_META_COLLECTION).doc(PROJECT_CONFIG_DOC_ID);
    const existingSnap = await docRef.get();
    let createdNewDocument = false;

    if (!existingSnap.exists) {
      await docRef.set({
        projectId: env.firebaseProjectId,
        databaseType: 'cloud_firestore',
        application: 'CIT Schedora',
        schemaVersion: 1,
        initialized: true,
        createdAt: AdminFieldValue.serverTimestamp(),
      });
      createdNewDocument = true;
    } else {
      const existingData = existingSnap.data() as Record<string, unknown> | undefined;
      const existingCheck = matchesExpectedProjectConfig(existingData);
      // Idempotent write confirming write capability without altering existing createdAt
      await docRef.set(
        {
          projectId: env.firebaseProjectId,
          databaseType: 'cloud_firestore',
          application: 'CIT Schedora',
          schemaVersion: 1,
          initialized: true,
          createdAt: existingCheck.valid && existingData?.createdAt
            ? existingData.createdAt
            : AdminFieldValue.serverTimestamp(),
        },
        { merge: false }
      );
    }

    const verifySnap = await docRef.get();
    const rawData = verifySnap.data() as Record<string, unknown> | undefined;
    const verification = matchesExpectedProjectConfig(rawData);

    if (verifySnap.exists && verification.valid && verification.metadata) {
      return {
        adminInitialized,
        transportUsed: 'firebase_admin_adc',
        projectId: verification.metadata.projectId,
        firestoreDatabaseId: env.firestoreDatabaseId,
        databaseLocation: 'asia-south1',
        storageBucket: env.storageBucket,
        writeSucceeded: true,
        readSucceeded: true,
        projectIdVerified: verification.metadata.projectId === env.firebaseProjectId,
        dataVerified: true,
        createdNewDocument,
        documentData: verification.metadata,
        firebaseProjectStatus: SubsystemStatus.CONNECTED,
        firestoreStatus: SubsystemStatus.READY,
        notes,
      };
    }
  } catch (adminErr) {
    const msg = adminErr instanceof Error ? adminErr.message : String(adminErr);
    notes.push(
      `ADC service account lacks cross-project IAM role on ${env.firebaseProjectId} (${msg}); using AI Studio runtime credentials.`
    );
  }

  // Attempt 2: Google AI Studio Runtime Credentials (server-side Firestore client)
  try {
    const runtimeDb = getRuntimeServerFirestore();
    const docRef = doc(runtimeDb, SYSTEM_META_COLLECTION, PROJECT_CONFIG_DOC_ID);
    const existingSnap = await getDocFromServer(docRef);
    let createdNewDocument = false;

    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        projectId: env.firebaseProjectId,
        databaseType: 'cloud_firestore',
        application: 'CIT Schedora',
        schemaVersion: 1,
        initialized: true,
        createdAt: serverTimestamp(),
      });
      createdNewDocument = true;
    } else {
      const existingData = existingSnap.data() as Record<string, unknown> | undefined;
      const existingCheck = matchesExpectedProjectConfig(existingData);
      // Idempotent server write that preserves original createdAt timestamp
      await setDoc(docRef, {
        projectId: env.firebaseProjectId,
        databaseType: 'cloud_firestore',
        application: 'CIT Schedora',
        schemaVersion: 1,
        initialized: true,
        createdAt:
          existingCheck.valid && existingData?.createdAt
            ? existingData.createdAt
            : serverTimestamp(),
      });
    }

    const verifySnap = await getDocFromServer(docRef);
    const rawData = verifySnap.data() as Record<string, unknown> | undefined;
    const verification = matchesExpectedProjectConfig(rawData);

    if (verifySnap.exists() && verification.valid && verification.metadata) {
      return {
        adminInitialized,
        transportUsed: 'ai_studio_runtime_credentials',
        projectId: verification.metadata.projectId,
        firestoreDatabaseId: env.firestoreDatabaseId,
        databaseLocation: 'asia-south1',
        storageBucket: env.storageBucket,
        writeSucceeded: true,
        readSucceeded: true,
        projectIdVerified: verification.metadata.projectId === env.firebaseProjectId,
        dataVerified: true,
        createdNewDocument,
        documentData: verification.metadata,
        firebaseProjectStatus: SubsystemStatus.CONNECTED,
        firestoreStatus: SubsystemStatus.READY,
        notes,
      };
    }
  } catch (runtimeErr) {
    notes.push(
      `AI Studio runtime Firestore verification error: ${
        runtimeErr instanceof Error ? runtimeErr.message : String(runtimeErr)
      }`
    );
  }

  return {
    adminInitialized,
    transportUsed: 'failed',
    projectId: env.firebaseProjectId,
    firestoreDatabaseId: env.firestoreDatabaseId,
    databaseLocation: 'asia-south1',
    storageBucket: env.storageBucket,
    writeSucceeded: false,
    readSucceeded: false,
    projectIdVerified: false,
    dataVerified: false,
    createdNewDocument: false,
    documentData: null,
    firebaseProjectStatus: configuredProjectMatches
      ? SubsystemStatus.CONNECTED
      : SubsystemStatus.NOT_CONFIGURED,
    firestoreStatus: SubsystemStatus.UNAVAILABLE,
    notes,
  };
}

export async function checkFirebaseConnectivity(): Promise<FirestoreVerificationResult> {
  return verifyAndInitializeFirestore();
}
