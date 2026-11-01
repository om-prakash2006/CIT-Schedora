import dotenv from 'dotenv';
import firebaseAppletConfig from '../firebase-applet-config.json' with { type: 'json' };

dotenv.config();

export const CANONICAL_FIREBASE_PROJECT_ID = 'cit-schedora';
export const CANONICAL_FIRESTORE_DATABASE_ID =
  'ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9';
export const CANONICAL_STORAGE_BUCKET = 'cit-schedora.firebasestorage.app';
export const CANONICAL_FIREBASE_REGION = 'asia-south1';

export const AppEnvironment = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  DEMO: 'demo',
  PRODUCTION: 'production',
} as const;

export type AppEnvironment = (typeof AppEnvironment)[keyof typeof AppEnvironment];

export interface EnvironmentConfig {
  readonly appEnv: AppEnvironment;
  readonly port: number;
  readonly firebaseProjectId: string;
  readonly firestoreDatabaseId: string;
  readonly firebaseRegion: string;
  readonly storageBucket: string;
  readonly sessionSecret: string | null;
  readonly geminiApiKey: string | null;
  readonly geminiModel: string;
  readonly frontendOrigin: string | null;
  readonly jsonBodyLimit: string;
  readonly solverServiceUrl: string;
  readonly solverTimeoutSeconds: number;
  readonly solverInternalToken: string;
}

function parseAppEnv(rawEnv: string | undefined): AppEnvironment {
  const normalized = (rawEnv ?? 'development').trim().toLowerCase();
  switch (normalized) {
    case AppEnvironment.DEVELOPMENT:
      return AppEnvironment.DEVELOPMENT;
    case AppEnvironment.TEST:
      return AppEnvironment.TEST;
    case AppEnvironment.DEMO:
      return AppEnvironment.DEMO;
    case AppEnvironment.PRODUCTION:
      return AppEnvironment.PRODUCTION;
    default:
      return AppEnvironment.DEVELOPMENT;
  }
}

function parseOptionalSecret(raw: string | undefined, placeholderValues: string[] = []): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || placeholderValues.includes(trimmed)) {
    return null;
  }
  return trimmed;
}

function parsePort(rawPort: string | undefined, defaultPort = 3000): number {
  if (!rawPort) {
    return defaultPort;
  }
  const parsed = Number.parseInt(rawPort, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    return defaultPort;
  }
  return parsed;
}

export function loadEnvConfig(source: NodeJS.ProcessEnv = process.env): EnvironmentConfig {
  const appEnv = parseAppEnv(source.APP_ENV || source.NODE_ENV);
  const port = parsePort(source.PORT, 3000);

  // Mandatory project check
  const rawProjectId = (
    source.FIREBASE_PROJECT_ID ??
    source.GOOGLE_CLOUD_PROJECT ??
    firebaseAppletConfig.projectId ??
    CANONICAL_FIREBASE_PROJECT_ID
  ).trim();

  if (rawProjectId && rawProjectId !== CANONICAL_FIREBASE_PROJECT_ID) {
    throw new Error(
      `Invalid FIREBASE_PROJECT_ID "${rawProjectId}". CIT Schedora must use the existing Google Cloud / Firebase project "${CANONICAL_FIREBASE_PROJECT_ID}".`
    );
  }

  const firebaseProjectId = CANONICAL_FIREBASE_PROJECT_ID;

  // Mandatory database check
  const rawDbId = (
    source.FIRESTORE_DATABASE_ID ??
    firebaseAppletConfig.firestoreDatabaseId ??
    CANONICAL_FIRESTORE_DATABASE_ID
  ).trim();

  if (rawDbId === '(default)' || rawDbId.length === 0 || rawDbId !== CANONICAL_FIRESTORE_DATABASE_ID) {
    throw new Error(
      `Invalid FIRESTORE_DATABASE_ID "${rawDbId}". CIT Schedora must use the named database "${CANONICAL_FIRESTORE_DATABASE_ID}", never "(default)".`
    );
  }

  const firestoreDatabaseId = CANONICAL_FIRESTORE_DATABASE_ID;

  // Mandatory region check
  const rawRegion = (
    source.FIREBASE_REGION ??
    CANONICAL_FIREBASE_REGION
  ).trim();

  if (rawRegion && rawRegion !== CANONICAL_FIREBASE_REGION) {
    throw new Error(
      `Invalid FIREBASE_REGION "${rawRegion}". CIT Schedora must use region "${CANONICAL_FIREBASE_REGION}".`
    );
  }

  const firebaseRegion = CANONICAL_FIREBASE_REGION;

  const storageBucket =
    (source.FIREBASE_STORAGE_BUCKET ?? firebaseAppletConfig.storageBucket ?? CANONICAL_STORAGE_BUCKET).trim();
  const sessionSecret = parseOptionalSecret(source.SESSION_SECRET);
  const geminiApiKey = parseOptionalSecret(source.GEMINI_API_KEY, ['MY_GEMINI_API_KEY']);
  const geminiModel = (source.GEMINI_MODEL ?? 'gemini-3.8-flash').trim() || 'gemini-3.8-flash';
  const frontendOrigin =
    parseOptionalSecret(source.FRONTEND_ORIGIN, ['MY_APP_URL']) ??
    parseOptionalSecret(source.APP_URL, ['MY_APP_URL']);
  const jsonBodyLimit = (source.JSON_BODY_LIMIT ?? '256kb').trim() || '256kb';
  const solverServiceUrl =
    (source.SOLVER_SERVICE_URL ?? 'http://127.0.0.1:8001').trim() || 'http://127.0.0.1:8001';
  const rawSolverTimeout = Number.parseFloat(source.SOLVER_TIMEOUT_SECONDS ?? '30');
  const solverTimeoutSeconds =
    Number.isFinite(rawSolverTimeout) && rawSolverTimeout >= 1 && rawSolverTimeout <= 120
      ? rawSolverTimeout
      : 30;
  const solverInternalToken =
    (source.SOLVER_INTERNAL_TOKEN ?? 'cit-schedora-internal-s2s-cit-public-v1').trim() ||
    'cit-schedora-internal-s2s-cit-public-v1';

  return Object.freeze({
    appEnv,
    port,
    firebaseProjectId,
    firestoreDatabaseId,
    firebaseRegion,
    storageBucket,
    sessionSecret,
    geminiApiKey,
    geminiModel,
    frontendOrigin,
    jsonBodyLimit,
    solverServiceUrl,
    solverTimeoutSeconds,
    solverInternalToken,
  });
}

export function validateStartupEnvironment(config: EnvironmentConfig = env): {
  valid: boolean;
  projectId: string;
  databaseId: string;
  region: string;
} {
  if (config.firebaseProjectId !== CANONICAL_FIREBASE_PROJECT_ID) {
    throw new Error(
      `Startup environment guard failed: Invalid Firebase project ID "${config.firebaseProjectId}". CIT Schedora must use "${CANONICAL_FIREBASE_PROJECT_ID}".`
    );
  }
  if (config.firestoreDatabaseId !== CANONICAL_FIRESTORE_DATABASE_ID) {
    throw new Error(
      `Startup environment guard failed: Invalid Firestore database ID "${config.firestoreDatabaseId}". CIT Schedora must use "${CANONICAL_FIRESTORE_DATABASE_ID}".`
    );
  }
  if (config.firebaseRegion !== CANONICAL_FIREBASE_REGION) {
    throw new Error(
      `Startup environment guard failed: Invalid Firebase region "${config.firebaseRegion}". Expected "${CANONICAL_FIREBASE_REGION}".`
    );
  }

  return {
    valid: true,
    projectId: config.firebaseProjectId,
    databaseId: config.firestoreDatabaseId,
    region: config.firebaseRegion,
  };
}

export const env: EnvironmentConfig = loadEnvConfig();


