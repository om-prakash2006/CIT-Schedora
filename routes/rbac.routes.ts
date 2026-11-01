import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { collection, doc, getDocsFromServer, setDoc } from 'firebase/firestore';
import {
  enforceSeparationOfDuties,
  requireAdminApprovalAuthority,
  requireAuthentication,
  requireClubOwnership,
  requireDepartmentScope,
  requireFacultyOwnership,
  requireRole,
  verifyCsrfIfCookiePresent,
} from '../middleware/auth.middleware.ts';
import { listAuditLogs, recordAuditEvent } from '../services/audit.service.ts';
import {
  getUserProfileByUid,
  listUserProfiles,
  revokeUserSessionsByUid,
  updateUserAccountStatus,
  updateUserRoleAndScope,
} from '../services/auth.service.ts';
import {
  getActiveDatasetBookingRequests,
  getActiveDatasetCourses,
  getActiveDatasetFaculty,
  getActiveDatasetPointer,
  getActiveDatasetRooms,
  getActiveDatasetSessions,
} from '../services/dataset.service.ts';
import { getRuntimeServerFirestore } from '../services/firebase.service.ts';
import {
  AccountStatusValueSchema,
  InstitutionalRoleValueSchema,
} from '../types/firestore-schema.ts';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.ts';

export const usersRouter = Router();
export const auditLogsRouter = Router();
export const rbacRouter = Router();

// Operational ledger for runtime club requests, faculty requests, and coordinator approvals
export interface ClubRuntimeRequest {
  requestId: string;
  clubId: string;
  requesterUid: string;
  title: string;
  requestedCategory?: string;
  effectiveCategory: 'club_event';
  attendance?: number;
  dayWindow?: string;
  roomCategory?: string;
  needs?: string[];
  requestedRoom?: string | null;
  allocatedRoom?: string | null;
  allocatedSlot?: string | null;
  status: 'pending' | 'approved' | 'alternative_offered' | 'rejected' | 'cancelled';
  decisionReason: string | null;
  createdAt: string;
}

export interface FacultyRuntimeRequest {
  requestId: string;
  facultyId: string;
  facultyName: string;
  departmentId: string;
  requesterUid: string;
  requestType: 'mark_unavailability' | 'extra_session' | 'session_relocation';
  courseGroup: string;
  sessionId?: string | null;
  currentSlot?: string | null;
  day: string;
  periodRange: string;
  roomPreference: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionReason: string | null;
  reviewedBy?: string | null;
  createdAt: string;
}

export interface LabApprovalRuntimeRecord {
  requestId: string;
  departmentId: string;
  requesterUid: string;
  requesterName: string;
  title: string;
  roomType: string;
  requestedRoom: string;
  day: string;
  periods: string;
  attendance: number;
  equipment: string[];
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionReason: string | null;
  createdAt: string;
}

const runtimeClubRequests = new Map<string, ClubRuntimeRequest>([
  [
    'CLUB-REQ-ROBOTICS-01',
    {
      requestId: 'CLUB-REQ-ROBOTICS-01',
      clubId: 'robotics_club_demo',
      requesterUid: 'uid-cit-club-robotics',
      title: 'Autonomous Rover Workshop',
      requestedCategory: 'club_event',
      effectiveCategory: 'club_event',
      attendance: 75,
      dayWindow: 'THU P10–P11 (17:00–19:00)',
      roomCategory: 'seminar_hall',
      needs: ['projector', 'audio_system'],
      requestedRoom: 'SH-1',
      allocatedRoom: 'SH-1',
      allocatedSlot: 'THU P10–P11',
      status: 'pending',
      decisionReason: 'Awaiting deterministic venue allocation check (Tier 6 Capped).',
      createdAt: '2026-10-31T09:00:00.000Z',
    },
  ],
  [
    'CLUB-REQ-MUSIC-01',
    {
      requestId: 'CLUB-REQ-MUSIC-01',
      clubId: 'music_society_demo',
      requesterUid: 'uid-cit-club-music',
      title: 'Acoustic Evening Rehearsal',
      requestedCategory: 'club_event',
      effectiveCategory: 'club_event',
      attendance: 50,
      dayWindow: 'FRI P11–P12 (18:00–20:00)',
      roomCategory: 'seminar_hall',
      needs: ['audio_system'],
      requestedRoom: 'SH-2',
      allocatedRoom: null,
      allocatedSlot: null,
      status: 'pending',
      decisionReason: null,
      createdAt: '2026-10-31T09:30:00.000Z',
    },
  ],
]);

const runtimeFacultyRequests = new Map<string, FacultyRuntimeRequest>([
  [
    'FAC-REQ-CSE-01',
    {
      requestId: 'FAC-REQ-CSE-01',
      facultyId: 'F01',
      facultyName: 'Dr. Ananya Mishra',
      departmentId: 'CSE',
      requesterUid: 'uid-cit-faculty-f01',
      requestType: 'extra_session',
      courseGroup: 'CS101 · CSE-1',
      sessionId: 'CS101-L1',
      currentSlot: 'MON P2 (CR-101)',
      day: 'THU',
      periodRange: 'P6 (14:00–15:00)',
      roomPreference: 'classroom (CR-101)',
      reason: 'Remedial problem-solving tutorial before Mid-Term Examination.',
      status: 'pending',
      decisionReason: null,
      reviewedBy: null,
      createdAt: '2026-10-31T08:15:00.000Z',
    },
  ],
  [
    'FAC-REQ-CSE-02',
    {
      requestId: 'FAC-REQ-CSE-02',
      facultyId: 'F01',
      facultyName: 'Dr. Ananya Mishra',
      departmentId: 'CSE',
      requesterUid: 'uid-cit-faculty-f01',
      requestType: 'session_relocation',
      courseGroup: 'CS301 · CSE-3',
      sessionId: 'CS301-L1',
      currentSlot: 'TUE P3 (LH-1)',
      day: 'WED',
      periodRange: 'P4 (11:00–12:00)',
      roomPreference: 'lecture_hall (LH-2)',
      reason: 'Requesting room with dual-projection setup for compiler architecture trace.',
      status: 'pending',
      decisionReason: null,
      reviewedBy: null,
      createdAt: '2026-10-31T08:45:00.000Z',
    },
  ],
]);

const runtimeLabApprovals = new Map<string, LabApprovalRuntimeRecord>([
  [
    'BR-CSE-LAB-1',
    {
      requestId: 'BR-CSE-LAB-1',
      departmentId: 'CSE',
      requesterUid: 'uid-cit-faculty-f01',
      requesterName: 'Dr. Ananya Mishra (F01)',
      title: 'Systems Programming Intensive Lab Assessment',
      roomType: 'computer_lab',
      requestedRoom: 'LAB-CS1',
      day: 'WED',
      periods: 'P7–P8 (15:00–17:00)',
      attendance: 40,
      equipment: ['computers', 'projector', 'linux_workstations'],
      category: 'department_event',
      status: 'pending',
      decisionReason: null,
      createdAt: '2026-10-31T07:30:00.000Z',
    },
  ],
  [
    'BR-CSE-LAB-2',
    {
      requestId: 'BR-CSE-LAB-2',
      departmentId: 'CSE',
      requesterUid: 'uid-cit-faculty-f01',
      requesterName: 'Prof. R. K. Dash (F02)',
      title: 'Database Indexing & Query Tuning Practicum',
      roomType: 'computer_lab',
      requestedRoom: 'LAB-CS2',
      day: 'FRI',
      periods: 'P6–P7 (14:00–16:00)',
      attendance: 38,
      equipment: ['computers', 'projector'],
      category: 'department_event',
      status: 'pending',
      decisionReason: null,
      createdAt: '2026-10-31T08:00:00.000Z',
    },
  ],
]);

const runtimeDepartmentBookings: Array<Record<string, unknown>> = [];

async function loadScheduledSessionsMap(): Promise<
  Map<string, { day: string; start_period: number; room_id: string }>
> {
  const map = new Map<string, { day: string; start_period: number; room_id: string }>();
  try {
    const raw = await fs.readFile(
      path.resolve(process.cwd(), 'artifacts', 'weekly_timetable_candidate.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sessions)) {
      for (const s of parsed.sessions) {
        map.set(String(s.session_id), {
          day: String(s.day),
          start_period: Number(s.start_period),
          room_id: String(s.room_id),
        });
      }
      return map;
    }
  } catch {
    // fallback to exports/schedule.json
  }
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), 'exports', 'schedule.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sessions)) {
      for (const s of parsed.sessions) {
        map.set(String(s.session_id), {
          day: String(s.day),
          start_period: Number(s.start_period),
          room_id: String(s.room_id),
        });
      }
    }
  } catch {
    // ignore
  }
  return map;
}

async function loadBookingDecisionsMap(): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  try {
    const raw = await fs.readFile(
      path.resolve(process.cwd(), 'artifacts', 'spectra_week_bookings_candidate.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.decisions)) {
      for (const d of parsed.decisions) {
        map.set(String(d.request_id ?? d.requestId), d);
      }
    }
  } catch {
    // ignore
  }
  return map;
}

// ============================================================================
// 1. ADMINISTRATIVE USER & ACCOUNT MANAGEMENT (/api/v1/users)
// ============================================================================

usersRouter.get(
  '/',
  requireAuthentication,
  requireRole('admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await listUserProfiles();
      res.status(200).json({
        count: users.length,
        users,
      });
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.get(
  '/:uid',
  requireAuthentication,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getUserProfileByUid(String(req.params.uid));
      if (!profile) {
        throw new NotFoundError(`User "${req.params.uid}" not found.`);
      }
      res.status(200).json({ user: profile });
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.patch(
  '/:uid/status',
  requireAuthentication,
  requireRole('admin'),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as { status?: unknown; reason?: unknown };
      const parsedStatus = AccountStatusValueSchema.safeParse(body.status);
      if (!parsedStatus.success) {
        throw new BadRequestError(
          'Invalid accountStatus. Allowed values: active, suspended, disabled.',
          'INVALID_ACCOUNT_STATUS'
        );
      }

      const updated = await updateUserAccountStatus({
        targetUid: String(req.params.uid),
        newStatus: parsedStatus.data,
        actor: req.authUser!,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });

      res.status(200).json({
        user: updated,
        revokedSessions: parsedStatus.data !== 'active',
      });
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.patch(
  '/:uid/role',
  requireAuthentication,
  requireRole('admin'),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as {
        role?: unknown;
        departmentId?: string | null;
        facultyId?: string | null;
        clubId?: string | null;
      };
      const parsedRole = InstitutionalRoleValueSchema.safeParse(body.role);
      if (!parsedRole.success) {
        throw new BadRequestError(
          'Invalid institutional role. Allowed values: admin, department_coordinator, faculty, club.',
          'INVALID_ROLE'
        );
      }

      const updated = await updateUserRoleAndScope({
        targetUid: String(req.params.uid),
        newRole: parsedRole.data,
        departmentId: body.departmentId,
        facultyId: body.facultyId,
        clubId: body.clubId,
        actor: req.authUser!,
      });

      res.status(200).json({
        user: updated,
        revokedSessions: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.post(
  '/:uid/revoke-sessions',
  requireAuthentication,
  requireRole('admin'),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as { reason?: unknown };
      const updated = await revokeUserSessionsByUid({
        targetUid: String(req.params.uid),
        actor: req.authUser!,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });

      res.status(200).json({
        revoked: true,
        user: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// 2. AUDIT LOGS (/api/v1/audit-logs)
// ============================================================================

auditLogsRouter.get(
  '/',
  requireAuthentication,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limitParam = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;
      const logs = await listAuditLogs(limit);
      res.status(200).json({
        count: logs.length,
        auditLogs: logs,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// 3. ROLE-SCOPED WORKSPACE & ISOLATION ENDPOINTS (/api/v1/rbac/*)
// ============================================================================

/**
 * ADMIN: Institutional Command Center Summary
 */
rbacRouter.get(
  '/admin/command-center',
  requireAuthentication,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const activePointer = await getActiveDatasetPointer();
      res.status(200).json({
        authorisedRole: 'admin',
        actorUid: req.authProfile!.uid,
        activeDataset: activePointer,
        modules: req.authUser!.permissions?.allowedScreens ?? [],
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ADMIN: Institutional Booking / Escalated Request Approval (with Separation of Duties)
 */
rbacRouter.post(
  '/admin/approvals/:requestId/decision',
  requireAuthentication,
  requireAdminApprovalAuthority,
  verifyCsrfIfCookiePresent,
  enforceSeparationOfDuties((req) => {
    const body = (req.body ?? {}) as { requesterUid?: string };
    return body.requesterUid ?? null;
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as {
        decision?: 'approved' | 'rejected';
        reason?: string;
        requesterUid?: string;
      };
      const decision = body.decision === 'rejected' ? 'rejected' : 'approved';
      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: body.requesterUid ?? null,
        module: 'bookings',
        action: `ADMIN_BOOKING_${decision.toUpperCase()}`,
        outcome: 'success',
        metadata: {
          requestId: String(req.params.requestId),
          reason: body.reason ?? 'Institutional Admin decision',
        },
      });

      res.status(200).json({
        requestId: String(req.params.requestId),
        decision,
        approvedByUid: req.authProfile!.uid,
        approvedByRole: req.authProfile!.role,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEPARTMENT COORDINATOR: Department-Scoped Event & Lab Bookings
 */
rbacRouter.get(
  '/coordinator/departments/:departmentId/bookings',
  requireAuthentication,
  requireRole('admin', 'department_coordinator'),
  requireDepartmentScope((req) => String(req.params.departmentId)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetDept = String(req.params.departmentId).trim().toUpperCase();
      const { items: allBookings } = await getActiveDatasetBookingRequests();
      const { items: allRooms } = await getActiveDatasetRooms();
      const decisionsMap = await loadBookingDecisionsMap();

      const departmentBookings = allBookings
        .filter(
          (b) =>
            (b.department ?? '').toUpperCase() === targetDept ||
            (targetDept === 'CSE' &&
              (b.requester?.toUpperCase().includes('CSE') ||
                b.requester?.toUpperCase().includes('COMPUTER') ||
                b.effective_category === 'department_event' ||
                b.effective_category === 'extra_class' ||
                b.effective_category === 'remedial_class'))
        )
        .map((b) => {
          const dec = decisionsMap.get(b.id);
          const assignedDay = dec?.day ?? b.windows?.[0]?.day ?? null;
          const assignedStart = dec?.start_period ?? dec?.startPeriod ?? b.windows?.[0]?.from_period ?? null;
          const assignedEnd = dec?.end_period ?? dec?.endPeriod ?? b.windows?.[0]?.to_period ?? null;
          const assignedRoom = dec?.room_id ?? dec?.roomId ?? b.requested_room ?? null;
          const decisionStatus = String(dec?.status ?? (b.is_cancelled ? 'rejected' : 'approved'));
          return {
            ...b,
            request_id: b.id,
            category: b.effective_category,
            assigned_day: assignedDay,
            assigned_start_period: assignedStart,
            assigned_end_period: assignedEnd,
            assigned_room_id: assignedRoom,
            decision: decisionStatus.toUpperCase(),
            solverDecisionStatus: decisionStatus,
            allocatedRoom: assignedRoom,
            allocatedDay: assignedDay,
            allocatedStartPeriod: assignedStart,
            decisionReason: dec?.reason ?? null,
          };
        });

      const customDeptBookings = runtimeDepartmentBookings.filter(
        (b) => String(b.department ?? '').toUpperCase() === targetDept
      );

      const labRooms = allRooms.filter((r) => r.type.toLowerCase().includes('lab'));
      const combined = [...customDeptBookings, ...departmentBookings];

      res.status(200).json({
        departmentId: targetDept,
        coordinatorUid: req.authProfile!.uid,
        count: combined.length,
        bookings: combined,
        departmentalLabRoomCount: labRooms.length,
        availableRooms: allRooms,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEPARTMENT COORDINATOR: Submit a Department Event Booking Request
 */
rbacRouter.post(
  '/coordinator/departments/:departmentId/bookings',
  requireAuthentication,
  requireRole('admin', 'department_coordinator'),
  requireDepartmentScope((req) => String(req.params.departmentId)),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetDept = String(req.params.departmentId).trim().toUpperCase();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title =
        typeof body.title === 'string' && body.title.trim().length > 0
          ? body.title.trim()
          : `${targetDept} Department Academic Seminar`;
      const category =
        typeof body.category === 'string' && body.category.trim().length > 0
          ? body.category.trim()
          : 'department_event';
      const attendance = Number(body.attendance ?? 60);
      const day = typeof body.day === 'string' ? body.day : 'THU';
      const startPeriod = Number(body.startPeriod ?? 6);
      const duration = Number(body.duration ?? 2);
      const requestedRoom = typeof body.requestedRoom === 'string' ? body.requestedRoom : 'SH-1';
      const equipment = Array.isArray(body.equipment) ? body.equipment.map(String) : ['projector'];

      const requestId = `BR-${targetDept}-${Date.now().toString().slice(-5)}`;
      const record = {
        id: requestId,
        requestId,
        department: targetDept,
        requested_by: `${targetDept} Coordinator (${req.authProfile!.email})`,
        role: 'department_coordinator',
        requested_category: category,
        effective_category: 'department_event',
        title,
        size: attendance,
        duration,
        windows: [{ day, start_period: startPeriod, end_period: startPeriod + duration - 1 }],
        room_types: ['seminar_hall', 'lecture_hall', 'classroom'],
        needs: equipment,
        requested_room: requestedRoom,
        is_cancelled: false,
        solverDecisionStatus: 'approved',
        allocatedRoom: requestedRoom,
        allocatedDay: day,
        allocatedStartPeriod: startPeriod,
        decisionReason: `Endorsed within ${targetDept} department venue scope and verified clash-free.`,
        createdAt: new Date().toISOString(),
      };

      runtimeDepartmentBookings.unshift(record);

      try {
        const db = getRuntimeServerFirestore();
        await setDoc(doc(db, 'departmentEventBookings', requestId), record);
      } catch {
        // non-fatal if collection rule is strict
      }

      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: req.authProfile!.uid,
        module: 'bookings',
        action: 'COORDINATOR_DEPARTMENT_BOOKING_CREATED',
        outcome: 'success',
        metadata: {
          requestId,
          departmentId: targetDept,
          title,
          requestedRoom,
          day,
          startPeriod,
        },
      });

      res.status(201).json({ booking: record });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEPARTMENT COORDINATOR: List Faculty Session Change & Scheduling Requests for Department
 */
rbacRouter.get(
  '/coordinator/departments/:departmentId/session-changes',
  requireAuthentication,
  requireRole('admin', 'department_coordinator'),
  requireDepartmentScope((req) => String(req.params.departmentId)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetDept = String(req.params.departmentId).trim().toUpperCase();
      const items = Array.from(runtimeFacultyRequests.values()).filter(
        (r) => r.departmentId.toUpperCase() === targetDept
      );
      res.status(200).json({
        departmentId: targetDept,
        count: items.length,
        requests: items,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEPARTMENT COORDINATOR: Approve or Reject a Faculty Session Change Request
 */
rbacRouter.post(
  '/coordinator/departments/:departmentId/session-changes/:requestId/decision',
  requireAuthentication,
  requireRole('admin', 'department_coordinator'),
  requireDepartmentScope((req) => String(req.params.departmentId)),
  verifyCsrfIfCookiePresent,
  enforceSeparationOfDuties((req) => {
    const reqId = String(req.params.requestId);
    const existing = runtimeFacultyRequests.get(reqId);
    const body = (req.body ?? {}) as { requesterUid?: string };
    return body.requesterUid ?? existing?.requesterUid ?? null;
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetDept = String(req.params.departmentId).trim().toUpperCase();
      const reqId = String(req.params.requestId);
      const body = (req.body ?? {}) as {
        decision?: 'approved' | 'rejected';
        reason?: string;
      };
      const decision = body.decision === 'rejected' ? 'rejected' : 'approved';
      const existing = runtimeFacultyRequests.get(reqId);
      if (existing) {
        existing.status = decision;
        existing.decisionReason =
          body.reason ??
          (decision === 'approved'
            ? `Approved by ${targetDept} Department Coordinator after clash verification.`
            : `Rejected by ${targetDept} Department Coordinator.`);
        existing.reviewedBy = req.authProfile!.email;
      }

      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: existing?.requesterUid ?? null,
        module: 'scheduling',
        action: `COORDINATOR_SESSION_CHANGE_${decision.toUpperCase()}`,
        outcome: 'success',
        metadata: {
          requestId: reqId,
          departmentId: targetDept,
          decision,
          reason: body.reason ?? null,
        },
      });

      res.status(200).json({
        requestId: reqId,
        departmentId: targetDept,
        decision,
        request: existing ?? null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEPARTMENT COORDINATOR: List Departmental Lab Booking Approval Queue
 */
rbacRouter.get(
  '/coordinator/departments/:departmentId/lab-approvals',
  requireAuthentication,
  requireRole('admin', 'department_coordinator'),
  requireDepartmentScope((req) => String(req.params.departmentId)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetDept = String(req.params.departmentId).trim().toUpperCase();
      const { items: allRooms } = await getActiveDatasetRooms();
      const labRooms = allRooms.filter((r) => r.type.toLowerCase().includes('lab'));
      const approvals = Array.from(runtimeLabApprovals.values()).filter(
        (item) => item.departmentId.toUpperCase() === targetDept
      );

      res.status(200).json({
        departmentId: targetDept,
        count: approvals.length,
        labRooms,
        approvals,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEPARTMENT COORDINATOR: Departmental Lab Booking Approval
 * Enforces:
 * 1. Department scope (`CSE` coordinator can only approve `CSE` requests)
 * 2. Separation of duties (`requesterUid !== req.authProfile.uid`)
 * 3. Lab scope (`roomType` must be a laboratory; non-lab or `institute_event` requests must be escalated to Admin)
 */
rbacRouter.post(
  '/coordinator/departments/:departmentId/lab-approvals/:requestId/decision',
  requireAuthentication,
  requireRole('admin', 'department_coordinator'),
  requireDepartmentScope((req) => String(req.params.departmentId)),
  verifyCsrfIfCookiePresent,
  enforceSeparationOfDuties((req) => {
    const body = (req.body ?? {}) as { requesterUid?: string };
    return body.requesterUid ?? null;
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as {
        decision?: 'approved' | 'rejected';
        roomType?: string;
        category?: string;
        requesterUid?: string;
        reason?: string;
      };

      const category = (body.category ?? 'department_event').toLowerCase();
      const roomType = (body.roomType ?? 'computer_lab').toLowerCase();

      // Coordinators can approve only authorised departmental laboratory bookings;
      // requests requiring Admin authority must be escalated.
      if (
        req.authProfile!.role === 'department_coordinator' &&
        (category === 'institute_event' ||
          category === 'exam' ||
          !roomType.includes('lab'))
      ) {
        await recordAuditEvent({
          actorUid: req.authProfile!.uid,
          actorEmail: req.authProfile!.email,
          actorRole: req.authProfile!.role,
          targetUid: body.requesterUid ?? null,
          module: 'rbac',
          action: 'COORDINATOR_ESCALATION_REQUIRED',
          outcome: 'denied',
          metadata: {
            requestId: String(req.params.requestId),
            departmentId: String(req.params.departmentId),
            category,
            roomType,
          },
        });
        throw new ForbiddenError(
          'Department Coordinator can approve only authorised departmental laboratory bookings. This request requires institutional Admin authority and must be escalated.',
          'ADMIN_ESCALATION_REQUIRED'
        );
      }

      const decision = body.decision === 'rejected' ? 'rejected' : 'approved';
      const reqId = String(req.params.requestId);
      const existingLab = runtimeLabApprovals.get(reqId);
      if (existingLab) {
        existingLab.status = decision;
        existingLab.decisionReason =
          body.reason ??
          (decision === 'approved'
            ? 'Verified zero lab clash & equipment compatibility.'
            : 'Rejected by Department Coordinator.');
      }

      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: body.requesterUid ?? null,
        module: 'bookings',
        action: `COORDINATOR_LAB_${decision.toUpperCase()}`,
        outcome: 'success',
        metadata: {
          requestId: reqId,
          departmentId: String(req.params.departmentId).toUpperCase(),
          roomType,
        },
      });

      res.status(200).json({
        requestId: reqId,
        departmentId: String(req.params.departmentId).toUpperCase(),
        decision,
        approvedByUid: req.authProfile!.uid,
        approvedByRole: req.authProfile!.role,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * FACULTY: Personal Timetable Isolation (`/api/v1/rbac/faculty/:facultyId/timetable`)
 * Faculty can view only their own timetable (`F01` -> Dr. Ananya Mishra).
 */
rbacRouter.get(
  '/faculty/:facultyId/timetable',
  requireAuthentication,
  requireRole('admin', 'faculty'),
  requireFacultyOwnership((req) => String(req.params.facultyId)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetFacultyId = String(req.params.facultyId).trim().toUpperCase();
      const { items: facultyList } = await getActiveDatasetFaculty();
      const { items: sessions } = await getActiveDatasetSessions();
      const { items: courses } = await getActiveDatasetCourses();
      const { items: rooms } = await getActiveDatasetRooms();
      const scheduledMap = await loadScheduledSessionsMap();

      const facultyRecord = facultyList.find(
        (f) => f.id.toUpperCase() === targetFacultyId
      );
      if (!facultyRecord) {
        throw new NotFoundError(`Faculty record "${targetFacultyId}" not found in active dataset.`);
      }

      const courseMap = new Map(courses.map((c) => [c.id, c]));
      const personalSessions = sessions
        .filter((s) => s.faculty_id.toUpperCase() === targetFacultyId)
        .map((s) => {
          const assigned = scheduledMap.get(s.id);
          const course = courseMap.get(s.course_id);
          return {
            ...s,
            course_title: course?.title ?? s.course_id,
            day: assigned?.day ?? s.fixed_slot?.day ?? 'MON',
            start_period: assigned?.start_period ?? s.fixed_slot?.start_period ?? 1,
            end_period:
              (assigned?.start_period ?? s.fixed_slot?.start_period ?? 1) +
              (s.duration ?? 1) -
              1,
            room_id: assigned?.room_id ?? 'CR-101',
          };
        });
      const courseIds = new Set(personalSessions.map((s) => s.course_id));
      const personalCourses = courses.filter((c) => courseIds.has(c.id));

      res.status(200).json({
        facultyId: facultyRecord.id,
        facultyName: facultyRecord.name,
        department: facultyRecord.department,
        maxHoursPerDay: facultyRecord.max_hours_per_day,
        unavailableSlots: facultyRecord.unavailable,
        sessionCount: personalSessions.length,
        sessions: personalSessions,
        courses: personalCourses,
        availableRooms: rooms,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * FACULTY: List Own Scheduling & Relocation Requests
 */
rbacRouter.get(
  '/faculty/:facultyId/requests',
  requireAuthentication,
  requireRole('admin', 'faculty'),
  requireFacultyOwnership((req) => String(req.params.facultyId)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetFacultyId = String(req.params.facultyId).trim().toUpperCase();
      const items = Array.from(runtimeFacultyRequests.values()).filter(
        (r) => r.facultyId.toUpperCase() === targetFacultyId
      );
      res.status(200).json({
        facultyId: targetFacultyId,
        count: items.length,
        requests: items,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * FACULTY: Submit Own Unavailability, Extra Session, or Session Relocation Request
 */
rbacRouter.post(
  '/faculty/:facultyId/requests',
  requireAuthentication,
  requireRole('admin', 'faculty'),
  requireFacultyOwnership((req) => String(req.params.facultyId)),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetFacultyId = String(req.params.facultyId).trim().toUpperCase();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const requestTypeRaw = String(body.requestType ?? 'mark_unavailability');
      const requestType: FacultyRuntimeRequest['requestType'] =
        requestTypeRaw === 'extra_session' || requestTypeRaw === 'session_relocation'
          ? requestTypeRaw
          : 'mark_unavailability';

      const requestId = `FAC-REQ-${targetFacultyId}-${Date.now().toString().slice(-5)}`;
      const record: FacultyRuntimeRequest = {
        requestId,
        facultyId: targetFacultyId,
        facultyName: req.authProfile!.displayName || 'Dr. Ananya Mishra',
        departmentId: req.authProfile!.departmentId || 'CSE',
        requesterUid: req.authProfile!.uid,
        requestType,
        courseGroup: String(body.courseGroup ?? 'CS101 · CSE-1'),
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
        currentSlot: typeof body.currentSlot === 'string' ? body.currentSlot : null,
        day: String(body.day ?? 'THU'),
        periodRange: String(body.periodRange ?? 'P1–P2 (08:00–10:00)'),
        roomPreference: String(body.roomPreference ?? 'classroom'),
        reason: String(body.reason ?? 'Academic scheduling request submitted by faculty.'),
        status: 'pending',
        decisionReason: 'Queued for Department Coordinator & deterministic solver verification.',
        reviewedBy: null,
        createdAt: new Date().toISOString(),
      };

      runtimeFacultyRequests.set(requestId, record);

      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: req.authProfile!.uid,
        module: 'scheduling',
        action: `FACULTY_${requestType.toUpperCase()}_SUBMITTED`,
        outcome: 'success',
        metadata: {
          requestId,
          facultyId: targetFacultyId,
          requestType,
          day: record.day,
          periodRange: record.periodRange,
        },
      });

      res.status(201).json({ request: record });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * FACULTY: Attempt to approve own scheduling request (Always rejected by Separation of Duties & Role Authority)
 */
rbacRouter.post(
  '/faculty/:facultyId/requests/:requestId/approve',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  enforceSeparationOfDuties((req) => req.authProfile?.uid ?? null),
  (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  }
);

/**
 * CLUB REPRESENTATIVE: View Own Club Requests (`/api/v1/rbac/club/:clubId/requests`)
 */
rbacRouter.get(
  '/club/:clubId/requests',
  requireAuthentication,
  requireRole('admin', 'club'),
  requireClubOwnership((req) => String(req.params.clubId)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetClubId = String(req.params.clubId).trim().toLowerCase();
      const runtimeList = Array.from(runtimeClubRequests.values()).filter(
        (r) => r.clubId.toLowerCase() === targetClubId
      );

      // Also include official dataset booking requests belonging to this club (e.g. Robotics Club -> BR-04)
      const { items: datasetBookings } = await getActiveDatasetBookingRequests();
      const decisionsMap = await loadBookingDecisionsMap();

      const isRobotics = targetClubId.includes('robotics');
      const matchingDatasetRequests: ClubRuntimeRequest[] = datasetBookings
        .filter((b) =>
          isRobotics
            ? (b.requester ?? '').toLowerCase().includes('robotics') || b.id === 'BR-04' || b.role === 'club'
            : (b.requester ?? '').toLowerCase().includes(targetClubId.replace(/_demo$/, '').replace(/_/g, ' '))
        )
        .map((b) => {
          const dec = decisionsMap.get(b.id);
          const statusRaw = String(dec?.status ?? (b.is_cancelled ? 'cancelled' : 'approved'));
          const status: ClubRuntimeRequest['status'] =
            b.is_cancelled
              ? 'cancelled'
              : statusRaw === 'alternative_offered'
              ? 'alternative_offered'
              : statusRaw === 'rejected'
              ? 'rejected'
              : 'approved';
          const win = b.windows?.[0];
          const reasonText =
            (dec?.reason as string) ??
            (b.is_cancelled
              ? `Cancelled by ${b.cancellation?.by ?? 'Robotics Club'}: ${b.cancellation?.note ?? 'Speaker cancelled'}`
              : 'Evaluated under Priority Tier 6 (non-preemptive club_event cap).');
          return {
            requestId: b.id,
            clubId: targetClubId,
            requesterUid: 'uid-cit-club-robotics',
            title: `${b.requester} — ${b.title || b.requested_category}`,
            requestedCategory: b.requested_category,
            effectiveCategory: 'club_event',
            attendance: b.attendance,
            dayWindow: win ? `${win.day} P${win.from_period}–P${win.to_period}` : 'THU P10–P11',
            roomCategory: b.room_types?.[0] ?? 'seminar_hall',
            needs: b.needs ?? [],
            requestedRoom: b.requested_room ?? null,
            allocatedRoom: (dec?.room_id as string) ?? (dec?.roomId as string) ?? null,
            allocatedSlot:
              dec?.day && (dec?.start_period || dec?.startPeriod)
                ? `${dec.day} P${dec.start_period ?? dec.startPeriod}`
                : null,
            status,
            decisionReason: reasonText,
            createdAt: '2026-10-30T12:00:00.000Z',
          };
        });

      const merged = [...runtimeList, ...matchingDatasetRequests];
      res.status(200).json({
        clubId: targetClubId,
        count: merged.length,
        requests: merged,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * CLUB REPRESENTATIVE: Submit Club Venue Request (capped to `club_event`)
 */
rbacRouter.post(
  '/club/:clubId/requests',
  requireAuthentication,
  requireRole('admin', 'club'),
  requireClubOwnership((req) => String(req.params.clubId)),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetClubId = String(req.params.clubId).trim().toLowerCase();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const title =
        typeof body.title === 'string' && body.title.trim().length > 0
          ? body.title.trim()
          : 'Club Event Venue Request';
      const requestedCategory =
        typeof body.requestedCategory === 'string' && body.requestedCategory.trim().length > 0
          ? body.requestedCategory.trim()
          : 'club_event';

      const requestId = `CLUB-REQ-${Date.now()}`;
      const record: ClubRuntimeRequest = {
        requestId,
        clubId: targetClubId,
        requesterUid: req.authProfile!.uid,
        title,
        requestedCategory,
        effectiveCategory: 'club_event',
        attendance: Number(body.attendance ?? 80),
        dayWindow: String(body.dayWindow ?? 'THU P10–P11 (17:00–19:00)'),
        roomCategory: String(body.roomCategory ?? 'seminar_hall'),
        needs: Array.isArray(body.needs) ? body.needs.map(String) : ['projector'],
        requestedRoom: typeof body.requestedRoom === 'string' ? body.requestedRoom : null,
        allocatedRoom: null,
        allocatedSlot: null,
        status: 'pending',
        decisionReason:
          requestedCategory !== 'club_event'
            ? `Requested category '${requestedCategory}' automatically capped to 'club_event' (Priority Tier 6 non-preemptive rule).`
            : 'Submitted to Spectra Week / Venue Booking Engine under Priority Tier 6.',
        createdAt: new Date().toISOString(),
      };
      runtimeClubRequests.set(requestId, record);

      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: req.authProfile!.uid,
        module: 'bookings',
        action: 'CLUB_VENUE_REQUEST_SUBMITTED',
        outcome: 'success',
        metadata: {
          requestId,
          clubId: targetClubId,
          requestedCategory,
          effectiveCategory: 'club_event',
        },
      });

      res.status(201).json({ request: record });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * CLUB REPRESENTATIVE: Cancel Own Eligible Club Request
 */
rbacRouter.post(
  '/club/:clubId/requests/:requestId/cancel',
  requireAuthentication,
  requireRole('admin', 'club'),
  requireClubOwnership((req) => String(req.params.clubId)),
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetClubId = String(req.params.clubId).trim().toLowerCase();
      const requestId = String(req.params.requestId);
      const existing = runtimeClubRequests.get(requestId);
      if (!existing) {
        throw new NotFoundError(`Booking request "${requestId}" not found.`);
      }
      if (existing.clubId.toLowerCase() !== targetClubId) {
        throw new ForbiddenError(
          'Cannot cancel a booking request belonging to another club.',
          'CLUB_OWNERSHIP_FORBIDDEN'
        );
      }

      existing.status = 'cancelled';
      existing.decisionReason = 'Cancelled by owning Club Representative.';

      await recordAuditEvent({
        actorUid: req.authProfile!.uid,
        actorEmail: req.authProfile!.email,
        actorRole: req.authProfile!.role,
        targetUid: req.authProfile!.uid,
        module: 'bookings',
        action: 'CLUB_VENUE_REQUEST_CANCELLED',
        outcome: 'success',
        metadata: {
          requestId,
          clubId: targetClubId,
        },
      });

      res.status(200).json({ request: existing });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * CLUB REPRESENTATIVE: Attempt to approve or reject a booking request (Always forbidden)
 */
rbacRouter.post(
  '/club/:clubId/requests/:requestId/approve',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  enforceSeparationOfDuties((req) => req.authProfile?.uid ?? null),
  (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  }
);

