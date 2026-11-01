import { z } from 'zod';

/**
 * ============================================================================
 * CIT SCHEDORA — COMPLETE FIRESTORE DATA MODEL & ZOD VALIDATION SCHEMAS
 * Project: cit-schedora
 * Database: ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9
 * ============================================================================
 */

export const WeekdaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']);
export const ExamDaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
export const ExamSessionSlotSchema = z.enum(['AM', 'PM']);

export const InstitutionalRoleValueSchema = z.enum([
  'admin',
  'department_coordinator',
  'faculty',
  'club',
]);
export type InstitutionalRoleValue = z.infer<typeof InstitutionalRoleValueSchema>;

export const PriorityCategoryValueSchema = z.enum([
  'exam',
  'regular_session',
  'institute_event',
  'guest_lecture',
  'department_event',
  'club_event',
]);
export type PriorityCategoryValue = z.infer<typeof PriorityCategoryValueSchema>;

/**
 * Deterministic role category cap enforcement matching official `validator.py`:
 *
 * def effective_category(data, req):
 *   order = data["priority_order"]
 *   cap = data["role_category_cap"].get(req["role"], "club_event")
 *   a = order.index(req["requested_category"]) if req["requested_category"] in order else len(order) - 1
 *   return order[max(a, order.index(cap))]
 */
export function deriveEffectiveBookingCategory(
  role: string,
  requestedCategory: string,
  priorityOrder: readonly string[],
  roleCategoryCap: Readonly<Record<string, string>>
): string {
  const cap = roleCategoryCap[role] ?? 'club_event';
  const reqIdx = priorityOrder.indexOf(requestedCategory);
  const normalizedReqIdx = reqIdx >= 0 ? reqIdx : priorityOrder.length - 1;
  const capIdx = priorityOrder.indexOf(cap);
  const normalizedCapIdx = capIdx >= 0 ? capIdx : priorityOrder.length - 1;
  return priorityOrder[Math.max(normalizedReqIdx, normalizedCapIdx)] ?? 'club_event';
}

// ============================================================================
// PART 2.A — SYSTEM METADATA (Collection: systemMeta)
// ============================================================================

export const SYSTEM_META_DOCS = Object.freeze({
  projectConfig: 'projectConfig',
  activeDataset: 'activeDataset',
  databaseSchema: 'databaseSchema',
  bookingPriority: 'bookingPriority',
} as const);

export const ProjectConfigDocSchema = z.object({
  projectId: z.string().min(1).max(128),
  databaseType: z.literal('cloud_firestore'),
  application: z.literal('CIT Schedora'),
  schemaVersion: z.number().int().min(1),
  initialized: z.literal(true),
  createdAt: z.string().min(1),
});
export type ProjectConfigDoc = z.infer<typeof ProjectConfigDocSchema>;

export const DatasetEntityCountsSchema = z.object({
  rooms: z.number().int().nonnegative(),
  roomUnavailability: z.number().int().nonnegative(),
  faculty: z.number().int().nonnegative(),
  studentGroups: z.number().int().nonnegative(),
  courses: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  bookingRequests: z.number().int().nonnegative(),
  cancellations: z.number().int().nonnegative(),
  examinations: z.number().int().nonnegative(),
  cancelledBookingRequests: z.number().int().nonnegative(),
});
export type DatasetEntityCounts = z.infer<typeof DatasetEntityCountsSchema>;

export const ActiveDatasetMetaDocSchema = z.object({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
  institute: z.string().min(1).max(200),
  checksum: z.string().min(16).max(128),
  sourceFilename: z.string().min(1).max(256),
  counts: DatasetEntityCountsSchema,
  activatedAt: z.string().min(1),
  activatedBy: z.string().min(1).max(128),
});
export type ActiveDatasetMetaDoc = z.infer<typeof ActiveDatasetMetaDocSchema>;

export const DatabaseSchemaMetaDocSchema = z.object({
  currentSchemaVersion: z.number().int().min(1),
  lastMigration: z.string().min(1).max(160),
  migrationTimestamp: z.string().min(1),
  databaseId: z.string().min(1).max(128),
});
export type DatabaseSchemaMetaDoc = z.infer<typeof DatabaseSchemaMetaDocSchema>;

export const BookingPriorityMetaDocSchema = z.object({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
  priorityOrder: z.array(z.string().min(1).max(64)).min(1),
  roleCategoryCap: z.record(z.string(), z.string()),
  updatedAt: z.string().min(1),
});
export type BookingPriorityMetaDoc = z.infer<typeof BookingPriorityMetaDocSchema>;

// ============================================================================
// PART 2.B — OFFICIAL CIT DATASET & VERSIONED ENTITIES
// ============================================================================

export const CalendarPeriodSchema = z.object({
  id: z.number().int().min(1).max(24),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  teaching: z.boolean(),
});

export const CalendarConfigSchema = z.object({
  days: z.array(WeekdaySchema).min(1),
  periods: z.array(CalendarPeriodSchema).min(1),
  lunch: z.object({
    after_period: z.number().int().min(1),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  lab_start_periods: z.array(z.number().int().min(1)),
  event_only_periods: z.array(z.number().int().min(1)),
  fest_week: z.string().min(1).max(160),
  exam_week: z.object({
    days: z.array(ExamDaySchema).min(1),
    sessions: z
      .array(
        z.object({
          id: ExamSessionSlotSchema,
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
        })
      )
      .min(1),
  }),
});
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;

export const SourceRoomSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  building: z.string().min(1).max(200),
  type: z.string().min(1).max(64),
  capacity: z.number().int().positive(),
  features: z.array(z.string().min(1).max(64)),
  accessible: z.boolean(),
  allowed_uses: z.array(z.string().min(1).max(64)).min(1),
});
export type SourceRoom = z.infer<typeof SourceRoomSchema>;

export const SourceRoomUnavailabilitySchema = z.object({
  room_id: z.string().min(1).max(128),
  day: WeekdaySchema,
  periods: z.array(z.number().int().min(1).max(24)).min(1),
  reason: z.string().max(500),
});
export type SourceRoomUnavailability = z.infer<typeof SourceRoomUnavailabilitySchema>;

export const FacultyUnavailabilitySlotSchema = z.object({
  day: WeekdaySchema,
  periods: z.array(z.number().int().min(1).max(24)).min(1),
  reason: z.string().max(500).optional(),
});

export const FacultyPreferenceSchema = z.object({
  type: z.string().min(1).max(64),
  days: z.array(WeekdaySchema).optional(),
  periods: z.array(z.number().int().min(1).max(24)).optional(),
  note: z.string().max(500).optional(),
});

export const SourceFacultySchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  department: z.string().min(1).max(64),
  max_hours_per_day: z.number().int().positive(),
  needs_accessible: z.boolean(),
  unavailable: z.array(FacultyUnavailabilitySlotSchema),
  preferences: z.array(FacultyPreferenceSchema),
});
export type SourceFaculty = z.infer<typeof SourceFacultySchema>;

export const SourceStudentGroupSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  year: z.number().int().min(1).max(10),
  department: z.string().min(1).max(64),
  size: z.number().int().positive(),
  needs_accessible: z.boolean(),
});
export type SourceStudentGroup = z.infer<typeof SourceStudentGroupSchema>;

export const SourceCourseSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  department: z.string().min(1).max(64),
  year: z.number().int().min(1).max(10),
  lecture_hours: z.number().int().nonnegative(),
  tutorial_hours: z.number().int().nonnegative(),
  lab_blocks: z.number().int().nonnegative(),
});
export type SourceCourse = z.infer<typeof SourceCourseSchema>;

export const FixedSlotSchema = z.object({
  day: WeekdaySchema,
  start_period: z.number().int().min(1).max(24),
});

export const SourceSessionSchema = z.object({
  id: z.string().min(1).max(128),
  course_id: z.string().min(1).max(128),
  kind: z.enum(['lecture', 'tutorial', 'lab']),
  groups: z.array(z.string().min(1).max(128)).min(1),
  faculty_id: z.string().min(1).max(128),
  size: z.number().int().positive(),
  duration: z.number().int().positive(),
  room_types: z.array(z.string().min(1).max(64)).min(1),
  needs_accessible: z.boolean(),
  basket_slot: z.string().min(1).max(64).nullable(),
  fixed_slot: FixedSlotSchema.nullable(),
});
export type SourceSession = z.infer<typeof SourceSessionSchema>;

export const BookingTimeWindowSchema = z.object({
  day: WeekdaySchema,
  from_period: z.number().int().min(1),
  to_period: z.number().int().min(1),
});

export const SourceBookingRequestSchema = z.object({
  id: z.string().min(1).max(128),
  submitted_at: z.string().min(1).max(64),
  requester: z.string().min(1).max(200),
  role: InstitutionalRoleValueSchema,
  department: z.string().min(1).max(64).nullable(),
  requested_category: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  attendance: z.number().int().positive(),
  duration_periods: z.number().int().positive(),
  windows: z.array(BookingTimeWindowSchema).min(1),
  room_types: z.array(z.string().min(1).max(64)).min(1),
  needs: z.array(z.string().min(1).max(64)),
  requested_room: z.string().min(1).max(128).nullable(),
  mandatory_for_groups: z.array(z.string().min(1).max(128)),
  series_id: z.string().min(1).max(128).nullable(),
  raw_text: z.string().min(1).max(2000),
});
export type SourceBookingRequest = z.infer<typeof SourceBookingRequestSchema>;

export const SourceCancellationSchema = z.object({
  request_id: z.string().min(1).max(128),
  cancelled_at: z.string().min(1).max(64),
  by: z.string().min(1).max(200),
  note: z.string().max(500),
});
export type SourceCancellation = z.infer<typeof SourceCancellationSchema>;

export const SourceExaminationSchema = z.object({
  id: z.string().min(1).max(128),
  course_ids: z.array(z.string().min(1).max(128)).min(1),
  groups: z.array(z.string().min(1).max(128)).min(1),
  size: z.number().int().positive(),
  duration_hours: z.number().int().positive(),
});
export type SourceExamination = z.infer<typeof SourceExaminationSchema>;

export const OfficialCitPublicDatasetSchema = z.object({
  dataset_id: z.string().min(1).max(128),
  institute: z.string().min(1).max(200),
  calendar: CalendarConfigSchema,
  priority_order: z.array(z.string().min(1).max(64)).min(1),
  role_category_cap: z.record(z.string(), z.string()),
  rooms: z.array(SourceRoomSchema).min(1),
  room_unavailability: z.array(SourceRoomUnavailabilitySchema),
  faculty: z.array(SourceFacultySchema).min(1),
  student_groups: z.array(SourceStudentGroupSchema).min(1),
  courses: z.array(SourceCourseSchema).min(1),
  sessions: z.array(SourceSessionSchema).min(1),
  booking_requests: z.array(SourceBookingRequestSchema),
  cancellations: z.array(SourceCancellationSchema),
  exams: z.array(SourceExaminationSchema),
});
export type OfficialCitPublicDataset = z.infer<typeof OfficialCitPublicDatasetSchema>;

// Versioned Firestore Document Schemas under datasets/{datasetId} and datasets/{datasetId}/versions/{versionId}
export const DatasetMetadataDocSchema = z.object({
  datasetId: z.string().min(1).max(128),
  institute: z.string().min(1).max(200),
  activeVersionId: z.string().min(1).max(128),
  latestVersionId: z.string().min(1).max(128),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type DatasetMetadataDoc = z.infer<typeof DatasetMetadataDocSchema>;

export const DatasetVersionDocSchema = z.object({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
  institute: z.string().min(1).max(200),
  checksum: z.string().min(16).max(128),
  sourceFilename: z.string().min(1).max(256),
  calendar: CalendarConfigSchema,
  priority_order: z.array(z.string().min(1).max(64)).min(1),
  role_category_cap: z.record(z.string(), z.string()),
  counts: DatasetEntityCountsSchema,
  status: z.enum(['staged', 'validated', 'active', 'archived']),
  importedAt: z.string().min(1),
  importedBy: z.string().min(1).max(128),
});
export type DatasetVersionDoc = z.infer<typeof DatasetVersionDocSchema>;

export const DatasetRoomDocSchema = SourceRoomSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetRoomDoc = z.infer<typeof DatasetRoomDocSchema>;

export const DatasetRoomUnavailabilityDocSchema = SourceRoomUnavailabilitySchema.extend({
  id: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetRoomUnavailabilityDoc = z.infer<typeof DatasetRoomUnavailabilityDocSchema>;

export const DatasetFacultyDocSchema = SourceFacultySchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetFacultyDoc = z.infer<typeof DatasetFacultyDocSchema>;

export const DatasetStudentGroupDocSchema = SourceStudentGroupSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetStudentGroupDoc = z.infer<typeof DatasetStudentGroupDocSchema>;

export const DatasetCourseDocSchema = SourceCourseSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetCourseDoc = z.infer<typeof DatasetCourseDocSchema>;

export const DatasetSessionDocSchema = SourceSessionSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetSessionDoc = z.infer<typeof DatasetSessionDocSchema>;

export const DatasetBookingRequestDocSchema = SourceBookingRequestSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
  effective_category: z.string().min(1).max(64),
  is_cancelled: z.boolean(),
  cancellation: SourceCancellationSchema.nullable(),
});
export type DatasetBookingRequestDoc = z.infer<typeof DatasetBookingRequestDocSchema>;

export const DatasetCancellationDocSchema = SourceCancellationSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetCancellationDoc = z.infer<typeof DatasetCancellationDocSchema>;

export const DatasetExaminationDocSchema = SourceExaminationSchema.extend({
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
});
export type DatasetExaminationDoc = z.infer<typeof DatasetExaminationDocSchema>;

// ============================================================================
// PART 2.C — USER PROFILES (Collection: users — No Passwords Stored)
// ============================================================================

export const AccountStatusValueSchema = z.enum(['active', 'suspended', 'disabled']);
export type AccountStatusValue = z.infer<typeof AccountStatusValueSchema>;

export const UserProfileDocSchema = z
  .object({
    uid: z.string().min(1).max(128),
    email: z.string().email().max(254),
    displayName: z.string().min(1).max(160),
    role: InstitutionalRoleValueSchema,
    departmentId: z.string().min(1).max(64).nullable(),
    facultyId: z.string().min(1).max(64).nullable(),
    clubId: z.string().min(1).max(128).nullable(),
    accountStatus: AccountStatusValueSchema,
    authorizationVersion: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
export type UserProfileDoc = z.infer<typeof UserProfileDocSchema>;

// ============================================================================
// PART 2.D — SCHEDULING OPERATIONS
// ============================================================================

export const SoftPenaltyBreakdownDocSchema = z.object({
  S1: z.number().int().nonnegative(),
  S2: z.number().int().nonnegative(),
  S3: z.number().int().nonnegative(),
  S4: z.number().int().nonnegative(),
  S5: z.number().int().nonnegative(),
  S6: z.number().int().nonnegative(),
});
export type SoftPenaltyBreakdownDoc = z.infer<typeof SoftPenaltyBreakdownDocSchema>;

export const SolverStatusValueSchema = z.enum([
  'OPTIMAL',
  'FEASIBLE',
  'INFEASIBLE',
  'UNKNOWN',
  'MODEL_INVALID',
]);
export type SolverStatusValue = z.infer<typeof SolverStatusValueSchema>;

export const ScheduleDocSchema = z.object({
  scheduleId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  datasetVersionId: z.string().min(1).max(128),
  sourceDatasetChecksum: z.string().min(16).max(128),
  scheduleType: z.enum(['weekly', 'spectra', 'examination', 'repaired']),
  solverName: z.string().min(1).max(128),
  solverVersion: z.string().min(1).max(128),
  solverStatus: SolverStatusValueSchema,
  validationStatus: z.enum(['valid', 'invalid', 'pending']),
  validationScope: z.string().min(1).max(160),
  hardViolationCount: z.number().int().nonnegative(),
  softPenaltyTotal: z.number().int().nonnegative(),
  softPenaltyBreakdown: SoftPenaltyBreakdownDocSchema,
  generatedAt: z.string().min(1).max(64),
  generatedBy: z.string().min(1).max(128),
  numberOfSessions: z.number().int().nonnegative(),
  scheduleState: z.enum(['weekly_candidate', 'validated', 'published', 'superseded']),
  solveDurationMs: z.number().int().nonnegative(),
  objectiveValue: z.number().int().nullable(),
  bestBound: z.number().int().nullable(),
  optimalityGap: z.number().nullable(),
  conflicts: z.number().int().nonnegative(),
  branches: z.number().int().nonnegative(),
});
export type ScheduleDoc = z.infer<typeof ScheduleDocSchema>;

export const SessionAssignmentDocSchema = z.object({
  sessionId: z.string().min(1).max(128),
  scheduleId: z.string().min(1).max(128),
  day: WeekdaySchema,
  startPeriod: z.number().int().min(1).max(9),
  roomId: z.string().min(1).max(128),
  duration: z.number().int().min(1).max(4),
  courseId: z.string().min(1).max(128),
  kind: z.enum(['lecture', 'tutorial', 'lab']),
  facultyId: z.string().min(1).max(128),
  groups: z.array(z.string().min(1).max(128)).min(1),
  basketSlot: z.string().max(64).nullable(),
});
export type SessionAssignmentDoc = z.infer<typeof SessionAssignmentDocSchema>;

export const ScheduleValidationReportDocSchema = z.object({
  reportId: z.string().min(1).max(128),
  scheduleId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  scheduleDatasetId: z.string().min(1).max(128),
  validationScope: z.string().min(1).max(160),
  isValid: z.boolean(),
  hardViolationCount: z.number().int().nonnegative(),
  hardByRule: z.record(z.string(), z.number().int().nonnegative()),
  hardViolations: z.array(
    z.object({
      rule: z.string(),
      where: z.string(),
      detail: z.string(),
    })
  ),
  softPenalties: SoftPenaltyBreakdownDocSchema,
  softTotal: z.number().int().nonnegative(),
  solverSoftPenalties: SoftPenaltyBreakdownDocSchema,
  solverSoftTotal: z.number().int().nonnegative(),
  parityVerified: z.boolean(),
  warnings: z.array(z.string()),
  validatedAt: z.string().min(1).max(64),
  validatedBy: z.string().min(1).max(128),
});
export type ScheduleValidationReportDoc = z.infer<typeof ScheduleValidationReportDocSchema>;

export const ExaminationScheduleDocSchema = z.object({
  examScheduleId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  datasetVersionId: z.string().min(1).max(128),
  sourceDatasetChecksum: z.string().min(16).max(128),
  solverName: z.string().min(1).max(128),
  solverVersion: z.string().min(1).max(128),
  solverStatus: SolverStatusValueSchema,
  validationStatus: z.enum(['valid', 'invalid', 'pending']),
  validationScope: z.string().min(1).max(160),
  officialSoftPenalty: z.number().int().nonnegative(),
  generationTimestamp: z.string().min(1).max(64),
  generatedBy: z.string().min(1).max(128),
  totalExams: z.number().int().nonnegative(),
  scheduledExams: z.number().int().nonnegative(),
  roomsAllocated: z.number().int().nonnegative(),
  scheduleState: z.enum(['examination_candidate', 'validated', 'published', 'superseded']),
  solveDurationMs: z.number().int().nonnegative(),
  objectiveValue: z.number().int().nullable().optional(),
  bestBound: z.number().int().nullable().optional(),
  optimalityGap: z.number().nullable().optional(),
  conflicts: z.number().int().nonnegative().default(0),
  branches: z.number().int().nonnegative().default(0),
});
export type ExaminationScheduleDoc = z.infer<typeof ExaminationScheduleDocSchema>;

export const ExamAllocationDocSchema = z.object({
  examId: z.string().min(1).max(128),
  examScheduleId: z.string().min(1).max(128),
  day: ExamDaySchema,
  session: ExamSessionSlotSchema,
  rooms: z.array(z.string().min(1).max(128)).min(1),
  effectiveCapacity: z.number().int().positive(),
  candidateCount: z.number().int().positive(),
  courseIds: z.array(z.string().min(1).max(128)).default([]),
  groups: z.array(z.string().min(1).max(128)).default([]),
});
export type ExamAllocationDoc = z.infer<typeof ExamAllocationDocSchema>;

export const ExamValidationReportDocSchema = z.object({
  reportId: z.string().min(1).max(128),
  examScheduleId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  validationScope: z.string().min(1).max(160),
  isValid: z.boolean(),
  hardViolationCount: z.number().int().nonnegative(),
  hardByRule: z.record(z.string(), z.number().int()),
  hardViolations: z.array(
    z.object({
      rule: z.string(),
      where: z.string(),
      detail: z.string(),
    })
  ),
  officialSoftPenalty: z.number().int().nonnegative(),
  solverSoftPenalty: z.number().int().nonnegative(),
  parityVerified: z.boolean(),
  totalExams: z.number().int().nonnegative(),
  scheduledExams: z.number().int().nonnegative(),
  missingExams: z.array(z.string()),
  duplicateExams: z.array(z.string()),
  ineligibleRoomViolations: z.number().int().nonnegative(),
  groupClashes: z.number().int().nonnegative(),
  roomConflicts: z.number().int().nonnegative(),
  capacityViolations: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([]),
  validatedAt: z.string().min(1).max(64),
  validatedBy: z.string().min(1).max(128),
});
export type ExamValidationReportDoc = z.infer<typeof ExamValidationReportDocSchema>;


// ============================================================================
// PART 2.E — VENUE BOOKING OPERATIONS
// ============================================================================

export const OperationalBookingRequestDocSchema = z.object({
  requestId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
  requesterUid: z.string().min(1).max(128),
  authenticatedRole: InstitutionalRoleValueSchema,
  departmentId: z.string().min(1).max(64).nullable(),
  clubId: z.string().min(1).max(128).nullable(),
  requestedCategory: z.string().min(1).max(64),
  effectiveCategory: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  attendance: z.number().int().positive(),
  durationPeriods: z.number().int().positive(),
  windows: z.array(BookingTimeWindowSchema).min(1),
  roomTypes: z.array(z.string().min(1).max(64)).min(1),
  needs: z.array(z.string().min(1).max(64)),
  requestedRoom: z.string().min(1).max(128).nullable(),
  mandatoryForGroups: z.array(z.string().min(1).max(128)),
  rawText: z.string().max(2000).nullable(),
  validationStatus: z.enum(['pending', 'valid', 'invalid']),
  approvalStatus: z.enum([
    'pending',
    'approved',
    'rejected',
    'alternative_offered',
    'cancelled',
  ]),
  decisionReason: z.string().max(1000).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type OperationalBookingRequestDoc = z.infer<typeof OperationalBookingRequestDocSchema>;

export const DepartmentEventBookingDocSchema = z.object({
  bookingId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128),
  departmentId: z.string().min(1).max(64),
  coordinatorUid: z.string().min(1).max(128),
  effectiveCategory: z.literal('department_event'),
  status: z.enum(['pending', 'approved', 'rejected', 'escalated']),
  createdAt: z.string().min(1),
});
export type DepartmentEventBookingDoc = z.infer<typeof DepartmentEventBookingDocSchema>;

export const BookingDecisionRunDocSchema = z.object({
  runId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  datasetVersionId: z.string().min(1).max(128),
  solverName: z.string().min(1).max(128),
  solverVersion: z.string().min(1).max(128),
  validationScope: z.string().min(1).max(160),
  bookingScore: z.number().nonnegative(),
  maxBookingScore: z.number().int().positive(),
  scorePercentage: z.number().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  alternativesCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  sessionOverridesCount: z.number().int().nonnegative(),
  priorityInversionCount: z.number().int().nonnegative(),
  hardViolationCount: z.number().int().nonnegative(),
  isValid: z.boolean(),
  parityVerified: z.boolean(),
  priorityInversions: z.array(z.string()).default([]),
  scheduleState: z.enum([
    'booking_candidate',
    'validated',
    'published',
    'superseded',
  ]),
  generatedBy: z.string().min(1).max(128),
  generatedAt: z.string().min(1).max(64),
});
export type BookingDecisionRunDoc = z.infer<typeof BookingDecisionRunDocSchema>;

export const BookingDecisionDocSchema = z.object({
  requestId: z.string().min(1).max(128),
  runId: z.string().min(1).max(128),
  status: z.enum(['approved', 'alternative_offered', 'rejected']),
  day: WeekdaySchema.nullable().optional(),
  startPeriod: z.number().int().min(1).max(13).nullable().optional(),
  endPeriod: z.number().int().min(1).max(13).nullable().optional(),
  roomId: z.string().min(1).max(128).nullable().optional(),
  reason: z.string().nullable().optional(),
  requester: z.string().min(1).max(256),
  role: z.string().min(1).max(64),
  requestedCategory: z.string().min(1).max(64),
  effectiveCategory: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  attendance: z.number().int().nonnegative(),
  durationPeriods: z.number().int().positive(),
  requestedRoom: z.string().min(1).max(128).nullable().optional(),
  scoreWeight: z.number().nonnegative(),
  allocatedAt: z.string().min(1).max(64),
});
export type BookingDecisionDoc = z.infer<typeof BookingDecisionDocSchema>;

// ============================================================================
// PART 2.F — RESCHEDULING OPERATIONS
// ============================================================================

export const RepairResultDocSchema = z.object({
  repairId: z.string().min(1).max(128),
  baselineScheduleId: z.string().min(1).max(128),
  disruptionId: z.string().min(1).max(128),
  directlyAffectedSessionIds: z.array(z.string().min(1).max(128)),
  sessionsMovedCount: z.number().int().nonnegative(),
  validatorPassed: z.boolean(),
  approvalDecision: z.enum(['pending', 'approved', 'rejected']),
  appliedAt: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type RepairResultDoc = z.infer<typeof RepairResultDocSchema>;

export const AppliedChangeDocSchema = z.object({
  changeId: z.string().min(1).max(128),
  repairId: z.string().min(1).max(128),
  baselineScheduleId: z.string().min(1).max(128),
  disruptionId: z.string().min(1).max(128),
  approvedByUid: z.string().min(1).max(128),
  appliedAt: z.string().min(1),
});
export type AppliedChangeDoc = z.infer<typeof AppliedChangeDocSchema>;

// ============================================================================
// PART 2.G — ADMINISTRATION & DATASET IMPORT MANIFEST
// ============================================================================

export const ReferentialIntegrityReportSchema = z.object({
  passed: z.boolean(),
  checkedLinks: z.object({
    roomUnavailabilityToRooms: z.number().int().nonnegative(),
    sessionsToCourses: z.number().int().nonnegative(),
    sessionsToFaculty: z.number().int().nonnegative(),
    sessionsToStudentGroups: z.number().int().nonnegative(),
    sessionsToRoomTypes: z.number().int().nonnegative(),
    examsToCourses: z.number().int().nonnegative(),
    examsToStudentGroups: z.number().int().nonnegative(),
    bookingsToMandatoryGroups: z.number().int().nonnegative(),
    bookingsToRoomTypes: z.number().int().nonnegative(),
    cancellationsToBookings: z.number().int().nonnegative(),
  }),
  errors: z.array(z.string()),
  advisories: z.array(z.string()),
});
export type ReferentialIntegrityReport = z.infer<typeof ReferentialIntegrityReportSchema>;

export const DatasetValidationResultSchema = z.object({
  valid: z.boolean(),
  datasetId: z.string(),
  institute: z.string(),
  checksum: z.string(),
  counts: DatasetEntityCountsSchema,
  referenceCountComparison: z.object({
    matchesExpectedCounts: z.boolean(),
    discrepancies: z.array(z.string()),
  }),
  referentialIntegrity: ReferentialIntegrityReportSchema,
  duplicateIds: z.array(z.string()),
  errors: z.array(z.string()),
});
export type DatasetValidationResult = z.infer<typeof DatasetValidationResultSchema>;

export const DatasetImportJobDocSchema = z.object({
  importJobId: z.string().min(1).max(128),
  datasetId: z.string().min(1).max(128),
  versionId: z.string().min(1).max(128),
  sourceFilename: z.string().min(1).max(256),
  sourceChecksum: z.string().min(16).max(128),
  startedAt: z.string().min(1),
  completedAt: z.string().nullable(),
  counts: DatasetEntityCountsSchema,
  validationPassed: z.boolean(),
  referentialIntegrityPassed: z.boolean(),
  status: z.enum(['running', 'completed', 'already_imported', 'failed']),
  importedBy: z.string().min(1).max(128),
  errorMessage: z.string().max(1000).nullable(),
});
export type DatasetImportJobDoc = z.infer<typeof DatasetImportJobDocSchema>;

export const AuditLogDocSchema = z
  .object({
    auditId: z.string().min(1).max(128),
    actorUid: z.string().min(1).max(128),
    actorEmail: z.string().max(254).nullable(),
    actorRole: z.string().max(64).nullable(),
    targetUid: z.string().max(128).nullable(),
    module: z.string().min(1).max(64),
    action: z.string().min(1).max(128),
    outcome: z.enum(['success', 'failure', 'denied']),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string().min(1).max(64),
  })
  .strict();
export type AuditLogDoc = z.infer<typeof AuditLogDocSchema>;

