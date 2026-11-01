import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import { CANONICAL_FIREBASE_PROJECT_ID, CANONICAL_FIRESTORE_DATABASE_ID, env } from '../config/env.ts';
import {
  type ActiveDatasetMetaDoc,
  type DatabaseSchemaMetaDoc,
  type DatasetBookingRequestDoc,
  type DatasetCancellationDoc,
  type DatasetCourseDoc,
  type DatasetEntityCounts,
  type DatasetExaminationDoc,
  type DatasetFacultyDoc,
  type DatasetImportJobDoc,
  type DatasetRoomDoc,
  type DatasetRoomUnavailabilityDoc,
  type DatasetSessionDoc,
  type DatasetStudentGroupDoc,
  type DatasetValidationResult,
  type DatasetVersionDoc,
  deriveEffectiveBookingCategory,
  OfficialCitPublicDatasetSchema,
  type OfficialCitPublicDataset,
  type ReferentialIntegrityReport,
  SYSTEM_META_DOCS,
} from '../types/firestore-schema.ts';
import { BadRequestError } from '../utils/errors.ts';
import {
  getRuntimeServerFirestore,
  SYSTEM_META_COLLECTION,
  verifyAndInitializeFirestore,
} from './firebase.service.ts';

export const DEFAULT_OFFICIAL_DATASET_PATH = path.resolve(process.cwd(), 'data/cit_public.json');

const EXPECTED_REFERENCE_COUNTS: Readonly<DatasetEntityCounts> = Object.freeze({
  rooms: 27,
  roomUnavailability: 2,
  faculty: 40,
  studentGroups: 14,
  courses: 62,
  sessions: 189,
  bookingRequests: 25,
  cancellations: 1,
  examinations: 41,
  cancelledBookingRequests: 1,
});

const BATCH_CHUNK_SIZE = 150;

function computeDeterministicChecksum(dataset: OfficialCitPublicDataset): string {
  const canonicalJson = JSON.stringify({
    dataset_id: dataset.dataset_id,
    institute: dataset.institute,
    calendar: dataset.calendar,
    priority_order: dataset.priority_order,
    role_category_cap: dataset.role_category_cap,
    rooms: dataset.rooms,
    room_unavailability: dataset.room_unavailability,
    faculty: dataset.faculty,
    student_groups: dataset.student_groups,
    courses: dataset.courses,
    sessions: dataset.sessions,
    booking_requests: dataset.booking_requests,
    cancellations: dataset.cancellations,
    exams: dataset.exams,
  });
  return `sha256-${createHash('sha256').update(canonicalJson, 'utf8').digest('hex')}`;
}

export function deriveVersionIdFromChecksum(checksum: string): string {
  const cleanHex = checksum.replace(/^sha256-/, '').slice(0, 12);
  return `v1-${cleanHex}`;
}

function findDuplicateIds(items: ReadonlyArray<{ id: string }>, label: string): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.push(`${label}:${item.id}`);
    }
    seen.add(item.id);
  }
  return duplicates;
}

/**
 * Validates raw JSON string or parsed object against the official CIT dataset schema,
 * checks unique identifiers, computes dynamic entity counts, and verifies referential integrity.
 */
export function validateDatasetPayload(rawInput: unknown): {
  validation: DatasetValidationResult;
  parsedDataset: OfficialCitPublicDataset | null;
} {
  let rawObj: unknown = rawInput;
  if (typeof rawInput === 'string') {
    try {
      rawObj = JSON.parse(rawInput);
    } catch (err) {
      const emptyCounts: DatasetEntityCounts = {
        rooms: 0,
        roomUnavailability: 0,
        faculty: 0,
        studentGroups: 0,
        courses: 0,
        sessions: 0,
        bookingRequests: 0,
        cancellations: 0,
        examinations: 0,
        cancelledBookingRequests: 0,
      };
      return {
        parsedDataset: null,
        validation: {
          valid: false,
          datasetId: 'unknown',
          institute: 'unknown',
          checksum: '',
          counts: emptyCounts,
          referenceCountComparison: {
            matchesExpectedCounts: false,
            discrepancies: ['JSON syntax parse failure'],
          },
          referentialIntegrity: {
            passed: false,
            checkedLinks: {
              roomUnavailabilityToRooms: 0,
              sessionsToCourses: 0,
              sessionsToFaculty: 0,
              sessionsToStudentGroups: 0,
              sessionsToRoomTypes: 0,
              examsToCourses: 0,
              examsToStudentGroups: 0,
              bookingsToMandatoryGroups: 0,
              bookingsToRoomTypes: 0,
              cancellationsToBookings: 0,
            },
            errors: [`Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`],
            advisories: [],
          },
          duplicateIds: [],
          errors: [`Invalid JSON syntax: ${err instanceof Error ? err.message : String(err)}`],
        },
      };
    }
  }

  const parseResult = OfficialCitPublicDatasetSchema.safeParse(rawObj);
  if (!parseResult.success) {
    const schemaErrors = parseResult.error.issues.map(
      (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`
    );
    const emptyCounts: DatasetEntityCounts = {
      rooms: 0,
      roomUnavailability: 0,
      faculty: 0,
      studentGroups: 0,
      courses: 0,
      sessions: 0,
      bookingRequests: 0,
      cancellations: 0,
      examinations: 0,
      cancelledBookingRequests: 0,
    };
    return {
      parsedDataset: null,
      validation: {
        valid: false,
        datasetId:
          typeof rawObj === 'object' && rawObj !== null && 'dataset_id' in rawObj
            ? String((rawObj as Record<string, unknown>).dataset_id)
            : 'unknown',
        institute: 'unknown',
        checksum: '',
        counts: emptyCounts,
        referenceCountComparison: {
          matchesExpectedCounts: false,
          discrepancies: ['Schema validation failed'],
        },
        referentialIntegrity: {
          passed: false,
          checkedLinks: {
            roomUnavailabilityToRooms: 0,
            sessionsToCourses: 0,
            sessionsToFaculty: 0,
            sessionsToStudentGroups: 0,
            sessionsToRoomTypes: 0,
            examsToCourses: 0,
            examsToStudentGroups: 0,
            bookingsToMandatoryGroups: 0,
            bookingsToRoomTypes: 0,
            cancellationsToBookings: 0,
          },
          errors: schemaErrors,
          advisories: [],
        },
        duplicateIds: [],
        errors: schemaErrors,
      },
    };
  }

  const dataset = parseResult.data;
  const checksum = computeDeterministicChecksum(dataset);

  // 1. Unique Identifier Check
  const duplicateIds: string[] = [
    ...findDuplicateIds(dataset.rooms, 'rooms'),
    ...findDuplicateIds(dataset.faculty, 'faculty'),
    ...findDuplicateIds(dataset.student_groups, 'student_groups'),
    ...findDuplicateIds(dataset.courses, 'courses'),
    ...findDuplicateIds(dataset.sessions, 'sessions'),
    ...findDuplicateIds(dataset.booking_requests, 'booking_requests'),
    ...findDuplicateIds(
      dataset.cancellations.map((c) => ({ id: c.request_id })),
      'cancellations'
    ),
    ...findDuplicateIds(dataset.exams, 'exams'),
  ];

  // 2. Referential Integrity Check
  const roomIds = new Set(dataset.rooms.map((r) => r.id));
  const roomTypes = new Set(dataset.rooms.map((r) => r.type));
  const facultyIds = new Set(dataset.faculty.map((f) => f.id));
  const groupIds = new Set(dataset.student_groups.map((g) => g.id));
  const courseIds = new Set(dataset.courses.map((c) => c.id));
  const bookingIds = new Set(dataset.booking_requests.map((b) => b.id));
  const calendarDays = new Set(dataset.calendar.days);
  const calendarPeriodIds = new Set(dataset.calendar.periods.map((p) => p.id));

  const refErrors: string[] = [];
  const refAdvisories: string[] = [];

  let roomUnavailabilityToRooms = 0;
  for (const ru of dataset.room_unavailability) {
    roomUnavailabilityToRooms += 1;
    if (!roomIds.has(ru.room_id)) {
      refErrors.push(`room_unavailability references unknown room_id "${ru.room_id}"`);
    }
    if (!calendarDays.has(ru.day)) {
      refErrors.push(`room_unavailability (${ru.room_id}) references invalid day "${ru.day}"`);
    }
  }

  let sessionsToCourses = 0;
  let sessionsToFaculty = 0;
  let sessionsToStudentGroups = 0;
  let sessionsToRoomTypes = 0;

  for (const s of dataset.sessions) {
    sessionsToCourses += 1;
    if (!courseIds.has(s.course_id)) {
      refErrors.push(`session "${s.id}" references unknown course_id "${s.course_id}"`);
    }

    sessionsToFaculty += 1;
    if (!facultyIds.has(s.faculty_id)) {
      refErrors.push(`session "${s.id}" references unknown faculty_id "${s.faculty_id}"`);
    }

    for (const grp of s.groups) {
      sessionsToStudentGroups += 1;
      if (!groupIds.has(grp)) {
        refErrors.push(`session "${s.id}" references unknown student_group "${grp}"`);
      }
    }

    for (const rt of s.room_types) {
      sessionsToRoomTypes += 1;
      if (!roomTypes.has(rt)) {
        refErrors.push(`session "${s.id}" references unknown room_type "${rt}"`);
      }
    }
  }

  let examsToCourses = 0;
  let examsToStudentGroups = 0;
  for (const ex of dataset.exams) {
    for (const cid of ex.course_ids) {
      examsToCourses += 1;
      if (!courseIds.has(cid)) {
        refErrors.push(`exam "${ex.id}" references unknown course_id "${cid}"`);
      }
    }
    for (const grp of ex.groups) {
      examsToStudentGroups += 1;
      if (!groupIds.has(grp)) {
        refErrors.push(`exam "${ex.id}" references unknown student_group "${grp}"`);
      }
    }
  }

  let bookingsToMandatoryGroups = 0;
  let bookingsToRoomTypes = 0;
  for (const br of dataset.booking_requests) {
    for (const grp of br.mandatory_for_groups) {
      bookingsToMandatoryGroups += 1;
      if (!groupIds.has(grp)) {
        refErrors.push(
          `booking_request "${br.id}" references unknown mandatory_for_groups "${grp}"`
        );
      }
    }
    for (const rt of br.room_types) {
      bookingsToRoomTypes += 1;
      if (!roomTypes.has(rt)) {
        refErrors.push(`booking_request "${br.id}" references unknown room_type "${rt}"`);
      }
    }
    if (br.requested_room && !roomIds.has(br.requested_room)) {
      refAdvisories.push(
        `booking_request "${br.id}" specifies user-entered requested_room "${br.requested_room}" not in canonical room IDs (preserved verbatim for solver rejection/alternative handling).`
      );
    }
    for (const w of br.windows) {
      if (!calendarPeriodIds.has(w.from_period) || !calendarPeriodIds.has(w.to_period)) {
        refAdvisories.push(
          `booking_request "${br.id}" window ${w.day} P${w.from_period}-P${w.to_period} extends outside canonical calendar periods 1..13 (preserved verbatim for solver evaluation).`
        );
      }
    }
    const effectiveCat = deriveEffectiveBookingCategory(
      br.role,
      br.requested_category,
      dataset.priority_order,
      dataset.role_category_cap
    );
    if (effectiveCat !== br.requested_category) {
      refAdvisories.push(
        `booking_request "${br.id}" role "${br.role}" requested "${br.requested_category}", capped deterministically to "${effectiveCat}".`
      );
    }
  }

  let cancellationsToBookings = 0;
  const cancelledSet = new Set<string>();
  for (const cancel of dataset.cancellations) {
    cancellationsToBookings += 1;
    if (!bookingIds.has(cancel.request_id)) {
      refErrors.push(
        `cancellation references unknown booking_request "${cancel.request_id}"`
      );
    } else {
      cancelledSet.add(cancel.request_id);
    }
  }

  // 3. Dynamic Entity Counts & Comparison against Expected Reference Counts
  const counts: DatasetEntityCounts = {
    rooms: dataset.rooms.length,
    roomUnavailability: dataset.room_unavailability.length,
    faculty: dataset.faculty.length,
    studentGroups: dataset.student_groups.length,
    courses: dataset.courses.length,
    sessions: dataset.sessions.length,
    bookingRequests: dataset.booking_requests.length,
    cancellations: dataset.cancellations.length,
    examinations: dataset.exams.length,
    cancelledBookingRequests: cancelledSet.size,
  };

  const discrepancies: string[] = [];
  (Object.keys(EXPECTED_REFERENCE_COUNTS) as Array<keyof DatasetEntityCounts>).forEach(
    (key) => {
      if (counts[key] !== EXPECTED_REFERENCE_COUNTS[key]) {
        discrepancies.push(
          `Count mismatch for ${key}: expected ${EXPECTED_REFERENCE_COUNTS[key]}, actual ${counts[key]}`
        );
      }
    }
  );

  const referentialIntegrity: ReferentialIntegrityReport = {
    passed: refErrors.length === 0,
    checkedLinks: {
      roomUnavailabilityToRooms,
      sessionsToCourses,
      sessionsToFaculty,
      sessionsToStudentGroups,
      sessionsToRoomTypes,
      examsToCourses,
      examsToStudentGroups,
      bookingsToMandatoryGroups,
      bookingsToRoomTypes,
      cancellationsToBookings,
    },
    errors: refErrors,
    advisories: refAdvisories,
  };

  const allErrors = [
    ...duplicateIds.map((d) => `Duplicate entity identifier: ${d}`),
    ...refErrors,
  ];

  return {
    parsedDataset: allErrors.length === 0 ? dataset : null,
    validation: {
      valid: allErrors.length === 0,
      datasetId: dataset.dataset_id,
      institute: dataset.institute,
      checksum,
      counts,
      referenceCountComparison: {
        matchesExpectedCounts: discrepancies.length === 0,
        discrepancies,
      },
      referentialIntegrity,
      duplicateIds,
      errors: allErrors,
    },
  };
}

/**
 * Part 8: Idempotent Database Schema Migration Registry (`systemMeta/databaseSchema`).
 * Preserves `systemMeta/projectConfig` untouched and updates `systemMeta/databaseSchema`.
 */
export async function ensureDatabaseSchemaMigration(
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<DatabaseSchemaMetaDoc> {
  // 1. Ensure systemMeta/projectConfig exists and is preserved
  const verification = await verifyAndInitializeFirestore();
  if (!verification.writeSucceeded || !verification.readSucceeded) {
    throw new Error('Failed to verify or preserve systemMeta/projectConfig prior to migration.');
  }

  const schemaDocRef = doc(db, SYSTEM_META_COLLECTION, SYSTEM_META_DOCS.databaseSchema);
  const existingSnap = await getDocFromServer(schemaDocRef);

  const nowIso = new Date().toISOString();
  const targetSchemaVersion = 2;
  const targetMigrationName = '002_phase2_versioned_dataset_and_operational_collections';

  if (existingSnap.exists()) {
    const data = existingSnap.data() as Record<string, unknown>;
    if (
      data.currentSchemaVersion === targetSchemaVersion &&
      data.lastMigration === targetMigrationName &&
      data.databaseId === CANONICAL_FIRESTORE_DATABASE_ID
    ) {
      return {
        currentSchemaVersion: targetSchemaVersion,
        lastMigration: targetMigrationName,
        migrationTimestamp: String(data.migrationTimestamp ?? nowIso),
        databaseId: CANONICAL_FIRESTORE_DATABASE_ID,
      };
    }
  }

  const payload = {
    projectId: CANONICAL_FIREBASE_PROJECT_ID,
    currentSchemaVersion: targetSchemaVersion,
    lastMigration: targetMigrationName,
    migrationTimestamp: nowIso,
    databaseId: CANONICAL_FIRESTORE_DATABASE_ID,
  };

  await setDoc(schemaDocRef, payload);

  return {
    currentSchemaVersion: payload.currentSchemaVersion,
    lastMigration: payload.lastMigration,
    migrationTimestamp: payload.migrationTimestamp,
    databaseId: payload.databaseId,
  };
}

interface BatchWriteOperation {
  readonly ref: ReturnType<typeof doc>;
  readonly data: Record<string, unknown>;
}

async function commitOperationsInSafeBatches(
  db: ClientFirestore,
  operations: readonly BatchWriteOperation[]
): Promise<number> {
  let committedCount = 0;
  for (let i = 0; i < operations.length; i += BATCH_CHUNK_SIZE) {
    const slice = operations.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of slice) {
      batch.set(op.ref, op.data);
    }
    await batch.commit();
    committedCount += slice.length;
  }
  return committedCount;
}

export interface DatasetImportExecutionResult {
  readonly alreadyImported: boolean;
  readonly datasetId: string;
  readonly versionId: string;
  readonly checksum: string;
  readonly importJob: DatasetImportJobDoc;
  readonly validation: DatasetValidationResult;
  readonly verifiedFirestoreCounts: DatasetEntityCounts;
}

/**
 * Executes the complete 10-step staged, versioned, idempotent import of `cit_public.json`
 * into the existing named Firestore database `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`.
 */
export async function importOfficialDataset(options?: {
  rawJsonOrObject?: unknown;
  sourceFilename?: string;
  importedBy?: string;
  forceReverify?: boolean;
}): Promise<DatasetImportExecutionResult> {
  const db = getRuntimeServerFirestore();
  await ensureDatabaseSchemaMigration(db);

  const sourceFilename = options?.sourceFilename ?? 'data/cit_public.json';
  const importedBy = options?.importedBy ?? 'system-provisioning-cli';
  const startedAt = new Date().toISOString();

  // Step 1: Read the canonical dataset from disk (`data/cit_public.json`) to preserve exact array order and SHA-256 checksum (`v1-1a9cf4b23ac3`), falling back to Firestore reconstruction if needed
  let rawPayload: unknown = options?.rawJsonOrObject;
  if (rawPayload === undefined) {
    try {
      rawPayload = await fs.readFile(DEFAULT_OFFICIAL_DATASET_PATH, 'utf8');
    } catch {
      const existingActiveInDb = await getActiveDatasetVersionDoc(db);
      if (existingActiveInDb) {
        const [
          roomsRes,
          roomUnavailRes,
          facultyRes,
          groupsRes,
          coursesRes,
          sessionsRes,
          bookingsRes,
          cancellationsRes,
          examsRes,
        ] = await Promise.all([
          getActiveDatasetRooms(),
          getActiveDatasetRoomUnavailability(),
          getActiveDatasetFaculty(),
          getActiveDatasetStudentGroups(),
          getActiveDatasetCourses(),
          getActiveDatasetSessions(),
          getActiveDatasetBookingRequests(),
          getActiveDatasetCancellations(),
          getActiveDatasetExams(),
        ]);

        rawPayload = {
          dataset_id: existingActiveInDb.activePointer.datasetId,
          institute: existingActiveInDb.activePointer.institute,
          calendar: existingActiveInDb.versionDoc.calendar,
          priority_order: existingActiveInDb.versionDoc.priority_order,
          role_category_cap: existingActiveInDb.versionDoc.role_category_cap,
          rooms: roomsRes.items.map(({ datasetId: _d, versionId: _v, ...rest }) => rest),
          room_unavailability: roomUnavailRes.items.map(
            ({ id: _id, datasetId: _d, versionId: _v, ...rest }) => rest
          ),
          faculty: facultyRes.items.map(({ datasetId: _d, versionId: _v, ...rest }) => rest),
          student_groups: groupsRes.items.map(({ datasetId: _d, versionId: _v, ...rest }) => rest),
          courses: coursesRes.items.map(({ datasetId: _d, versionId: _v, ...rest }) => rest),
          sessions: sessionsRes.items.map(({ datasetId: _d, versionId: _v, ...rest }) => rest),
          booking_requests: bookingsRes.items.map(
            ({
              datasetId: _d,
              versionId: _v,
              effective_category: _ec,
              is_cancelled: _ic,
              cancellation: _c,
              ...rest
            }) => rest
          ),
          cancellations: cancellationsRes.items.map(
            ({ datasetId: _d, versionId: _v, ...rest }) => rest
          ),
          exams: examsRes.items.map(({ datasetId: _d, versionId: _v, ...rest }) => rest),
        };
      }
    }
  }

  // Step 2: Validate the entire dataset before import
  const { validation, parsedDataset } = validateDatasetPayload(rawPayload);

  if (!validation.valid || !parsedDataset) {
    const failedJobId = `job_failed_${Date.now()}`;
    const failedJob: DatasetImportJobDoc = {
      importJobId: failedJobId,
      datasetId: validation.datasetId || 'unknown',
      versionId: 'unversioned-invalid',
      sourceFilename,
      sourceChecksum: validation.checksum || 'invalid-payload-checksum-0000',
      startedAt,
      completedAt: new Date().toISOString(),
      counts: validation.counts,
      validationPassed: false,
      referentialIntegrityPassed: validation.referentialIntegrity.passed,
      status: 'failed',
      importedBy,
      errorMessage: validation.errors.slice(0, 5).join('; ').slice(0, 950) || 'Dataset validation failed',
    };
    await setDoc(doc(db, 'datasetImportJobs', failedJobId), failedJob);
    throw new BadRequestError(
      `Dataset validation failed: ${failedJob.errorMessage}`,
      'DATASET_VALIDATION_FAILED'
    );
  }

  // Step 3: Generate a unique version identifier and source-content hash
  const datasetId = parsedDataset.dataset_id;
  const checksum = validation.checksum;
  const versionId = deriveVersionIdFromChecksum(checksum);

  // Check Idempotency: If this exact dataset version is already active and verified
  const activeDatasetMetaRef = doc(db, SYSTEM_META_COLLECTION, SYSTEM_META_DOCS.activeDataset);
  const activeMetaSnap = await getDocFromServer(activeDatasetMetaRef);
  const versionDocRef = doc(db, 'datasets', datasetId, 'versions', versionId);
  const existingVersionSnap = await getDocFromServer(versionDocRef);

  if (
    activeMetaSnap.exists() &&
    existingVersionSnap.exists() &&
    activeMetaSnap.data()?.datasetId === datasetId &&
    activeMetaSnap.data()?.versionId === versionId &&
    activeMetaSnap.data()?.checksum === checksum &&
    existingVersionSnap.data()?.status === 'active'
  ) {
    const verifiedCounts = await verifyStoredVersionCounts(db, datasetId, versionId);
    const countsMatch =
      JSON.stringify(verifiedCounts) === JSON.stringify(validation.counts);

    if (countsMatch) {
      const idempotentJobId = `job_${datasetId}_${versionId}_idempotent`;
      const completedAt = new Date().toISOString();
      const jobDoc: DatasetImportJobDoc = {
        importJobId: idempotentJobId,
        datasetId,
        versionId,
        sourceFilename,
        sourceChecksum: checksum,
        startedAt,
        completedAt,
        counts: verifiedCounts,
        validationPassed: true,
        referentialIntegrityPassed: true,
        status: 'already_imported',
        importedBy,
        errorMessage: null,
      };
      await setDoc(doc(db, 'datasetImportJobs', idempotentJobId), jobDoc);

      return {
        alreadyImported: true,
        datasetId,
        versionId,
        checksum,
        importJob: jobDoc,
        validation,
        verifiedFirestoreCounts: verifiedCounts,
      };
    }
  }

  // Step 4: Create a running import job manifest and stage the new version document
  const importJobId = `job_${datasetId}_${versionId}`;
  const runningJobDoc: DatasetImportJobDoc = {
    importJobId,
    datasetId,
    versionId,
    sourceFilename,
    sourceChecksum: checksum,
    startedAt,
    completedAt: null,
    counts: validation.counts,
    validationPassed: true,
    referentialIntegrityPassed: true,
    status: 'running',
    importedBy,
    errorMessage: null,
  };
  await setDoc(doc(db, 'datasetImportJobs', importJobId), runningJobDoc);

  // Ensure root datasets/{datasetId} document exists before writing versioned subcollections
  const datasetRootRef = doc(db, 'datasets', datasetId);
  const existingRootSnap = await getDocFromServer(datasetRootRef);
  const rootCreatedAt = existingRootSnap.exists()
    ? String(existingRootSnap.data()?.createdAt ?? startedAt)
    : startedAt;

  await setDoc(datasetRootRef, {
    datasetId,
    institute: parsedDataset.institute,
    activeVersionId: existingRootSnap.exists()
      ? String(existingRootSnap.data()?.activeVersionId ?? versionId)
      : versionId,
    latestVersionId: versionId,
    createdAt: rootCreatedAt,
    updatedAt: startedAt,
  });

  const stagedVersionDoc: DatasetVersionDoc = {
    datasetId,
    versionId,
    institute: parsedDataset.institute,
    checksum,
    sourceFilename,
    calendar: parsedDataset.calendar,
    priority_order: parsedDataset.priority_order,
    role_category_cap: parsedDataset.role_category_cap,
    counts: validation.counts,
    status: 'staged',
    importedAt: startedAt,
    importedBy,
  };
  await setDoc(versionDocRef, stagedVersionDoc);

  // Step 5 & Step 6: Prepare all entity documents with exact official identifiers and batch write safely
  const cancellationMap = new Map(
    parsedDataset.cancellations.map((c) => [c.request_id, c])
  );

  const operations: BatchWriteOperation[] = [];

  for (const room of parsedDataset.rooms) {
    const roomDoc: DatasetRoomDoc = {
      ...room,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(db, 'datasets', datasetId, 'versions', versionId, 'rooms', room.id),
      data: roomDoc,
    });
  }

  for (const ru of parsedDataset.room_unavailability) {
    const unavailabilityId = `${ru.room_id}_${ru.day}_P${ru.periods.join('-')}`;
    const ruDoc: DatasetRoomUnavailabilityDoc = {
      id: unavailabilityId,
      ...ru,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(
        db,
        'datasets',
        datasetId,
        'versions',
        versionId,
        'roomUnavailability',
        unavailabilityId
      ),
      data: ruDoc,
    });
  }

  for (const fac of parsedDataset.faculty) {
    const facDoc: DatasetFacultyDoc = {
      ...fac,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(db, 'datasets', datasetId, 'versions', versionId, 'faculty', fac.id),
      data: facDoc,
    });
  }

  for (const grp of parsedDataset.student_groups) {
    const grpDoc: DatasetStudentGroupDoc = {
      ...grp,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(
        db,
        'datasets',
        datasetId,
        'versions',
        versionId,
        'studentGroups',
        grp.id
      ),
      data: grpDoc,
    });
  }

  for (const crs of parsedDataset.courses) {
    const crsDoc: DatasetCourseDoc = {
      ...crs,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(db, 'datasets', datasetId, 'versions', versionId, 'courses', crs.id),
      data: crsDoc,
    });
  }

  for (const ses of parsedDataset.sessions) {
    const sesDoc: DatasetSessionDoc = {
      ...ses,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(db, 'datasets', datasetId, 'versions', versionId, 'sessions', ses.id),
      data: sesDoc,
    });
  }

  for (const br of parsedDataset.booking_requests) {
    const cancelRecord = cancellationMap.get(br.id) ?? null;
    const effectiveCategory = deriveEffectiveBookingCategory(
      br.role,
      br.requested_category,
      parsedDataset.priority_order,
      parsedDataset.role_category_cap
    );
    const brDoc: DatasetBookingRequestDoc = {
      ...br,
      datasetId,
      versionId,
      effective_category: effectiveCategory,
      is_cancelled: Boolean(cancelRecord),
      cancellation: cancelRecord,
    };
    operations.push({
      ref: doc(
        db,
        'datasets',
        datasetId,
        'versions',
        versionId,
        'bookingRequests',
        br.id
      ),
      data: brDoc,
    });
  }

  for (const cancel of parsedDataset.cancellations) {
    const cancelDoc: DatasetCancellationDoc = {
      ...cancel,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(
        db,
        'datasets',
        datasetId,
        'versions',
        versionId,
        'cancellations',
        cancel.request_id
      ),
      data: cancelDoc,
    });
  }

  for (const ex of parsedDataset.exams) {
    const exDoc: DatasetExaminationDoc = {
      ...ex,
      datasetId,
      versionId,
    };
    operations.push({
      ref: doc(
        db,
        'datasets',
        datasetId,
        'versions',
        versionId,
        'examinations',
        ex.id
      ),
      data: exDoc,
    });
  }

  await commitOperationsInSafeBatches(db, operations);

  // Step 7, Step 8 & Step 9: Verify stored document counts and cancellation linkage in Firestore
  const verifiedCounts = await verifyStoredVersionCounts(db, datasetId, versionId);

  const countMismatches: string[] = [];
  (Object.keys(validation.counts) as Array<keyof DatasetEntityCounts>).forEach((key) => {
    if (verifiedCounts[key] !== validation.counts[key]) {
      countMismatches.push(
        `Firestore count mismatch for ${key}: expected ${validation.counts[key]}, stored ${verifiedCounts[key]}`
      );
    }
  });

  if (countMismatches.length > 0) {
    const errText = countMismatches.join('; ');
    await setDoc(doc(db, 'datasetImportJobs', importJobId), {
      ...runningJobDoc,
      completedAt: new Date().toISOString(),
      status: 'failed',
      errorMessage: errText,
    });
    throw new Error(`Post-import Firestore verification failed: ${errText}`);
  }

  // Step 10: Activate dataset version and update systemMeta/activeDataset & systemMeta/bookingPriority
  const completedAt = new Date().toISOString();

  await setDoc(versionDocRef, {
    ...stagedVersionDoc,
    status: 'active',
  });

  await setDoc(datasetRootRef, {
    datasetId,
    institute: parsedDataset.institute,
    activeVersionId: versionId,
    latestVersionId: versionId,
    createdAt: rootCreatedAt,
    updatedAt: completedAt,
  });

  await setDoc(activeDatasetMetaRef, {
    projectId: CANONICAL_FIREBASE_PROJECT_ID,
    datasetId,
    versionId,
    institute: parsedDataset.institute,
    checksum,
    sourceFilename,
    counts: verifiedCounts,
    activatedAt: completedAt,
    activatedBy: importedBy,
  });

  await setDoc(doc(db, SYSTEM_META_COLLECTION, SYSTEM_META_DOCS.bookingPriority), {
    projectId: CANONICAL_FIREBASE_PROJECT_ID,
    datasetId,
    versionId,
    priorityOrder: parsedDataset.priority_order,
    roleCategoryCap: parsedDataset.role_category_cap,
    updatedAt: completedAt,
  });

  const completedJobDoc: DatasetImportJobDoc = {
    ...runningJobDoc,
    completedAt,
    counts: verifiedCounts,
    status: 'completed',
    errorMessage: null,
  };
  await setDoc(doc(db, 'datasetImportJobs', importJobId), completedJobDoc);

  // Append-only audit trail entry
  const auditId = `aud_import_${datasetId}_${versionId}`;
  await setDoc(doc(db, 'auditLogs', auditId), {
    auditId,
    actorUid: importedBy,
    actorEmail: null,
    actorRole: 'admin',
    targetUid: null,
    module: 'datasets',
    action: `IMPORT_AND_ACTIVATE_${datasetId}_${versionId}`,
    outcome: 'success',
    metadata: {
      datasetId,
      versionId,
      checksum,
    },
    createdAt: completedAt,
  });

  return {
    alreadyImported: false,
    datasetId,
    versionId,
    checksum,
    importJob: completedJobDoc,
    validation,
    verifiedFirestoreCounts: verifiedCounts,
  };
}

/**
 * Queries the live Firestore subcollections under `datasets/{datasetId}/versions/{versionId}`
 * to verify exact stored document counts and cancelled booking preservation.
 */
export async function verifyStoredVersionCounts(
  db: ClientFirestore,
  datasetId: string,
  versionId: string
): Promise<DatasetEntityCounts> {
  const basePath = ['datasets', datasetId, 'versions', versionId] as const;

  const [
    roomsSnap,
    roomUnavailSnap,
    facultySnap,
    groupsSnap,
    coursesSnap,
    sessionsSnap,
    bookingsSnap,
    cancellationsSnap,
    examsSnap,
  ] = await Promise.all([
    getDocsFromServer(
      query(collection(db, ...basePath, 'rooms'), where('datasetId', '==', datasetId))
    ),
    getDocsFromServer(
      query(
        collection(db, ...basePath, 'roomUnavailability'),
        where('datasetId', '==', datasetId)
      )
    ),
    getDocsFromServer(
      query(collection(db, ...basePath, 'faculty'), where('datasetId', '==', datasetId))
    ),
    getDocsFromServer(
      query(
        collection(db, ...basePath, 'studentGroups'),
        where('datasetId', '==', datasetId)
      )
    ),
    getDocsFromServer(
      query(collection(db, ...basePath, 'courses'), where('datasetId', '==', datasetId))
    ),
    getDocsFromServer(
      query(collection(db, ...basePath, 'sessions'), where('datasetId', '==', datasetId))
    ),
    getDocsFromServer(
      query(
        collection(db, ...basePath, 'bookingRequests'),
        where('datasetId', '==', datasetId)
      )
    ),
    getDocsFromServer(
      query(
        collection(db, ...basePath, 'cancellations'),
        where('datasetId', '==', datasetId)
      )
    ),
    getDocsFromServer(
      query(
        collection(db, ...basePath, 'examinations'),
        where('datasetId', '==', datasetId)
      )
    ),
  ]);

  let cancelledBookingRequests = 0;
  for (const docSnap of bookingsSnap.docs) {
    if (docSnap.data().is_cancelled === true) {
      cancelledBookingRequests += 1;
    }
  }

  return {
    rooms: roomsSnap.size,
    roomUnavailability: roomUnavailSnap.size,
    faculty: facultySnap.size,
    studentGroups: groupsSnap.size,
    courses: coursesSnap.size,
    sessions: sessionsSnap.size,
    bookingRequests: bookingsSnap.size,
    cancellations: cancellationsSnap.size,
    examinations: examsSnap.size,
    cancelledBookingRequests,
  };
}

// ============================================================================
// PART 7 — REAL FIRESTORE QUERY FUNCTIONS FOR API ENDPOINTS
// ============================================================================

export async function getActiveDatasetPointer(
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<ActiveDatasetMetaDoc | null> {
  const snap = await getDocFromServer(
    doc(db, SYSTEM_META_COLLECTION, SYSTEM_META_DOCS.activeDataset)
  );
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data() as Record<string, unknown>;
  return {
    datasetId: String(data.datasetId),
    versionId: String(data.versionId),
    institute: String(data.institute),
    checksum: String(data.checksum),
    sourceFilename: String(data.sourceFilename),
    counts: data.counts as DatasetEntityCounts,
    activatedAt: String(data.activatedAt),
    activatedBy: String(data.activatedBy),
  };
}

export async function getActiveDatasetVersionDoc(
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<{
  activePointer: ActiveDatasetMetaDoc;
  versionDoc: DatasetVersionDoc;
} | null> {
  const activePointer = await getActiveDatasetPointer(db);
  if (!activePointer) {
    return null;
  }
  const vSnap = await getDocFromServer(
    doc(db, 'datasets', activePointer.datasetId, 'versions', activePointer.versionId)
  );
  if (!vSnap.exists()) {
    return null;
  }
  return {
    activePointer,
    versionDoc: vSnap.data() as DatasetVersionDoc,
  };
}

async function getActiveVersionSubcollectionDocs<T>(
  subcollectionName: string,
  sortKey: keyof T,
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<{ activePointer: ActiveDatasetMetaDoc | null; items: T[] }> {
  const activePointer = await getActiveDatasetPointer(db);
  if (!activePointer) {
    return { activePointer: null, items: [] };
  }
  const snap = await getDocsFromServer(
    query(
      collection(
        db,
        'datasets',
        activePointer.datasetId,
        'versions',
        activePointer.versionId,
        subcollectionName
      ),
      where('datasetId', '==', activePointer.datasetId)
    )
  );
  const items = snap.docs.map((d) => d.data() as T);
  items.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
  return { activePointer, items };
}

export async function getActiveDatasetRooms() {
  return getActiveVersionSubcollectionDocs<DatasetRoomDoc>('rooms', 'id');
}

export async function getActiveDatasetRoomUnavailability() {
  return getActiveVersionSubcollectionDocs<DatasetRoomUnavailabilityDoc>(
    'roomUnavailability',
    'id'
  );
}

export async function getActiveDatasetFaculty() {
  return getActiveVersionSubcollectionDocs<DatasetFacultyDoc>('faculty', 'id');
}

export async function getActiveDatasetStudentGroups() {
  return getActiveVersionSubcollectionDocs<DatasetStudentGroupDoc>('studentGroups', 'id');
}

export async function getActiveDatasetCourses() {
  return getActiveVersionSubcollectionDocs<DatasetCourseDoc>('courses', 'id');
}

export async function getActiveDatasetSessions() {
  return getActiveVersionSubcollectionDocs<DatasetSessionDoc>('sessions', 'id');
}

export async function getActiveDatasetExams() {
  return getActiveVersionSubcollectionDocs<DatasetExaminationDoc>('examinations', 'id');
}

export async function getActiveDatasetBookingRequests() {
  return getActiveVersionSubcollectionDocs<DatasetBookingRequestDoc>('bookingRequests', 'id');
}

export async function getActiveDatasetCancellations() {
  return getActiveVersionSubcollectionDocs<DatasetCancellationDoc>(
    'cancellations',
    'request_id'
  );
}

export async function getDatasetImportJobs(
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<DatasetImportJobDoc[]> {
  const snap = await getDocsFromServer(
    query(
      collection(db, 'datasetImportJobs'),
      where('status', 'in', ['running', 'completed', 'already_imported', 'failed'])
    )
  );
  const jobs = snap.docs.map((d) => d.data() as DatasetImportJobDoc);
  jobs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return jobs;
}

export function getDatabaseMetadataSummary() {
  return {
    firebaseProjectId: env.firebaseProjectId,
    firestoreDatabaseId: env.firestoreDatabaseId,
  };
}
