import {
  type HealthResponse,
  type ReadinessResponse,
  type ServiceBoundaryMetadata,
  SubsystemStatus,
} from '../types/index.ts';
import { ServiceNotConfiguredError } from '../utils/errors.ts';
import {
  listAuditLogs,
  recordAuditEvent,
  type RecordAuditEventInput,
} from './audit.service.ts';
import {
  computeEffectivePermissions,
  createSessionFromFirebaseIdToken,
  createSyntheticTestSessionCookie,
  CSRF_COOKIE_NAME,
  ensureDemoAccountsAvailableInFirestore,
  ensureServerFirebaseAuthReady,
  getOptionalAuthenticatedPrincipal,
  getUserProfileByUid,
  listUserProfiles,
  logoutAndRevokeSession,
  mapUserProfileToPrincipal,
  MAX_AUTH_TIME_AGE_SECONDS,
  parseCookieHeader,
  refreshApplicationSession,
  revokeUserSessionsByUid,
  seedDemoAccounts,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
  signInWithFirebaseWebSdkAndGetIdToken,
  updateUserAccountStatus,
  updateUserRoleAndScope,
  USERS_COLLECTION,
  verifySessionCookieAndLoadProfile,
  type DemoAccountSeedReport,
  type DemoAccountSeedReportItem,
  type IssuedApplicationSession,
} from './auth.service.ts';
import {
  deriveVersionIdFromChecksum,
  ensureDatabaseSchemaMigration,
  getActiveDatasetBookingRequests,
  getActiveDatasetCancellations,
  getActiveDatasetCourses,
  getActiveDatasetExams,
  getActiveDatasetFaculty,
  getActiveDatasetPointer,
  getActiveDatasetRoomUnavailability,
  getActiveDatasetRooms,
  getActiveDatasetSessions,
  getActiveDatasetStudentGroups,
  getActiveDatasetVersionDoc,
  getDatasetImportJobs,
  importOfficialDataset,
  validateDatasetPayload,
  verifyStoredVersionCounts,
  type DatasetImportExecutionResult,
} from './dataset.service.ts';
import {
  checkFirebaseConnectivity,
  FIRESTORE_COLLECTIONS,
  getFirebaseAdminApp,
  getRuntimeServerFirestore,
  getServerFirestore,
  getServerStorage,
  PROJECT_CONFIG_DOC_ID,
  SYSTEM_META_COLLECTION,
  verifyAndInitializeFirestore,
  type FirestoreCollectionKey,
  type FirestoreVerificationResult,
  type ProjectConfigMetadata,
} from './firebase.service.ts';
import {
  getGeminiBoundaryStatus,
  getSharedGeminiClient,
  type GeminiServiceBoundaryStatus,
} from './gemini.service.ts';
import {
  ensureSolverServiceReady,
  generateWeeklyTimetable,
  getScheduleById,
  getScheduleValidationReport,
  listSchedules,
  loadActiveFirestoreDatasetPayload,
  revalidateScheduleById,
  type GenerateWeeklyTimetableInput,
  publishWeeklySchedule,
  type SolverHealthStatus,
  type WeeklyScheduleDetailResult,
} from './timetable.service.ts';
import {
  generateExaminationSchedule,
  getExaminationScheduleById,
  getExaminationValidationReport,
  listExaminationSchedules,
  publishExaminationSchedule,
  revalidateExaminationScheduleById,
  EXAM_VALIDATION_SCOPE_LABEL,
  type GenerateExaminationScheduleInput,
  type ExaminationScheduleDetailResult,
} from './examination.service.ts';

import {
  CANONICAL_FIREBASE_PROJECT_ID,
  CANONICAL_FIRESTORE_DATABASE_ID,
  CANONICAL_FIREBASE_REGION,
  validateStartupEnvironment,
} from '../config/env.ts';

export {
  CANONICAL_FIREBASE_PROJECT_ID,
  CANONICAL_FIRESTORE_DATABASE_ID,
  CANONICAL_FIREBASE_REGION,
  validateStartupEnvironment,
  checkFirebaseConnectivity,
  computeEffectivePermissions,
  createSessionFromFirebaseIdToken,
  createSyntheticTestSessionCookie,
  CSRF_COOKIE_NAME,
  deriveVersionIdFromChecksum,
  ensureDatabaseSchemaMigration,
  ensureDemoAccountsAvailableInFirestore,
  ensureServerFirebaseAuthReady,
  ensureSolverServiceReady,
  EXAM_VALIDATION_SCOPE_LABEL,
  FIRESTORE_COLLECTIONS,
  generateExaminationSchedule,
  generateWeeklyTimetable,
  getActiveDatasetBookingRequests,
  getActiveDatasetCancellations,
  getActiveDatasetCourses,
  getActiveDatasetExams,
  getActiveDatasetFaculty,
  getActiveDatasetPointer,
  getActiveDatasetRoomUnavailability,
  getActiveDatasetRooms,
  getActiveDatasetSessions,
  getActiveDatasetStudentGroups,
  getActiveDatasetVersionDoc,
  getDatasetImportJobs,
  getExaminationScheduleById,
  getExaminationValidationReport,
  getFirebaseAdminApp,
  getGeminiBoundaryStatus,
  getOptionalAuthenticatedPrincipal,
  getRuntimeServerFirestore,
  getScheduleById,
  getScheduleValidationReport,
  getServerFirestore,
  getServerStorage,
  getSharedGeminiClient,
  getUserProfileByUid,
  importOfficialDataset,
  listAuditLogs,
  listExaminationSchedules,
  listSchedules,
  listUserProfiles,
  loadActiveFirestoreDatasetPayload,
  logoutAndRevokeSession,
  mapUserProfileToPrincipal,
  MAX_AUTH_TIME_AGE_SECONDS,
  parseCookieHeader,
  PROJECT_CONFIG_DOC_ID,
  publishExaminationSchedule,
  publishWeeklySchedule,
  recordAuditEvent,
  refreshApplicationSession,
  revalidateExaminationScheduleById,
  revalidateScheduleById,
  revokeUserSessionsByUid,
  seedDemoAccounts,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_DURATION_SECONDS,
  signInWithFirebaseWebSdkAndGetIdToken,
  SYSTEM_META_COLLECTION,
  updateUserAccountStatus,
  updateUserRoleAndScope,
  USERS_COLLECTION,
  validateDatasetPayload,
  verifyAndInitializeFirestore,
  verifySessionCookieAndLoadProfile,
  verifyStoredVersionCounts,
  type DatasetImportExecutionResult,
  type DemoAccountSeedReport,
  type DemoAccountSeedReportItem,
  type ExaminationScheduleDetailResult,
  type FirestoreCollectionKey,
  type FirestoreVerificationResult,
  type GeminiServiceBoundaryStatus,
  type GenerateExaminationScheduleInput,
  type GenerateWeeklyTimetableInput,
  type IssuedApplicationSession,
  type ProjectConfigMetadata,
  type RecordAuditEventInput,
  type SolverHealthStatus,
  type WeeklyScheduleDetailResult,
};

/**
 * Architectural Service Boundaries for CIT Schedora.
 *
 * Connected to Google Cloud / Firebase project `cit-schedora` (`asia-south1`)
 * and named database `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`.
 */
export const SERVICE_BOUNDARIES: Readonly<Record<string, ServiceBoundaryMetadata>> = Object.freeze({
  dataset: {
    serviceName: 'DatasetService',
    configured: true,
    targetMilestone: 'Milestone 2 — Cloud Firestore (`cit-schedora`) & Canonical Dataset Ingestion (cit_public.json)',
  },
  authentication: {
    serviceName: 'AuthenticationService',
    configured: true,
    targetMilestone: 'Milestone 3 — Institutional Auth & HTTP-Only Sessions backed by Firestore `users`',
  },
  authorization: {
    serviceName: 'AuthorizationService',
    configured: true,
    targetMilestone: 'Milestone 3 — Four-Role RBAC & Scope Verification',
  },
  booking: {
    serviceName: 'BookingService',
    configured: false,
    targetMilestone: 'Milestone 4 — Deterministic Venue Booking & Priority Engine',
  },
  timetable: {
    serviceName: 'TimetableService',
    configured: true,
    targetMilestone: 'Milestone 4A — Python OR-Tools CP-SAT Weekly Timetable Solver Integration',
  },
  examination: {
    serviceName: 'ExaminationService',
    configured: true,
    targetMilestone: 'Milestone 4B — Python OR-Tools CP-SAT Deterministic Examination Scheduler (50% Room Capacity Rule)',
  },
  rescheduling: {
    serviceName: 'ReschedulingService',
    configured: false,
    targetMilestone: 'Milestone 6 — Dynamic Disruption Repair & Minimum-Movement Solver',
  },
  validation: {
    serviceName: 'ValidationService',
    configured: true,
    targetMilestone: 'Milestone 4A — Official Python validator.py Weekly Component Bridge',
  },
  llmOrchestrator: {
    serviceName: 'LLMOrchestratorService',
    configured: false,
    targetMilestone: 'Milestone 7 — Shared Gemini (gemini-3.8-flash) English/Hinglish Parser',
  },
  audit: {
    serviceName: 'AuditService',
    configured: true,
    targetMilestone: 'Milestone 3 — Immutable Institutional Audit Trail in Firestore `auditLogs`',
  },
  export: {
    serviceName: 'ExportService',
    configured: false,
    targetMilestone: 'Milestone 6 — Canonical schedule.json & schedule_after.json Exporter',
  },
  notification: {
    serviceName: 'NotificationService',
    configured: false,
    targetMilestone: 'Milestone 6 — Request Lifecycle Status Delivery',
  },
});

export function getHealthStatus(): HealthResponse {
  return {
    status: 'ok',
    service: 'cit-schedora-api',
    version: 'v1',
  };
}

/**
 * Reports actual subsystem readiness by verifying the real server-side Firestore
 * connection (`systemMeta/projectConfig` write/read/projectId check), Firebase
 * Authentication + RBAC profile layer, and the private Python CP-SAT solver service.
 */
export async function getReadinessStatus(): Promise<ReadinessResponse> {
  const firestoreVerification = await verifyAndInitializeFirestore();
  await ensureServerFirebaseAuthReady();
  let schedulerStatus = SubsystemStatus.DEGRADED;
  try {
    const solverHealth = await ensureSolverServiceReady();
    if (solverHealth.status === 'ok') {
      schedulerStatus = SubsystemStatus.READY;
    }
  } catch {
    schedulerStatus = SubsystemStatus.DEGRADED;
  }

  return {
    backend: SubsystemStatus.READY,
    firebaseProject: firestoreVerification.firebaseProjectStatus,
    firestore: firestoreVerification.firestoreStatus,
    authentication:
      firestoreVerification.firestoreStatus === SubsystemStatus.READY
        ? SubsystemStatus.READY
        : SubsystemStatus.DEGRADED,
    llm: SubsystemStatus.NOT_CONFIGURED,
    scheduler: schedulerStatus,
  };
}

export function assertServiceConfigured(boundaryKey: keyof typeof SERVICE_BOUNDARIES): void {
  const boundary = SERVICE_BOUNDARIES[boundaryKey];
  if (!boundary || !boundary.configured) {
    throw new ServiceNotConfiguredError(boundary?.serviceName ?? String(boundaryKey));
  }
}

