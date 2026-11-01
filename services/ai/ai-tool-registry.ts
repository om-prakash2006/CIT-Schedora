import {
  getActiveDatasetCourses,
  getActiveDatasetRooms,
  getActiveDatasetSessions,
  getActiveDatasetStudentGroups,
} from '../dataset.service.ts';
import { getLatestBookingRun } from '../booking.service.ts';
import { logger } from '../../utils/logger.ts';

export interface AuthenticatedUserContext {
  readonly uid: string;
  readonly role: string;
  readonly departmentId?: string | null;
  readonly facultyId?: string | null;
  readonly clubId?: string | null;
}

export async function lookupAuthorisedCourses(context: AuthenticatedUserContext): Promise<Array<{ id: string; title: string; department: string }>> {
  const coursesRes = await getActiveDatasetCourses();
  if (context.role === 'department_coordinator' && context.departmentId) {
    return coursesRes.items
      .filter((c) => c.department === context.departmentId)
      .map((c) => ({ id: c.id, title: c.title, department: c.department }));
  }
  return coursesRes.items.map((c) => ({ id: c.id, title: c.title, department: c.department }));
}

export async function lookupAuthorisedStudentGroups(context: AuthenticatedUserContext): Promise<Array<{ id: string; name: string; department: string; size: number }>> {
  const groupsRes = await getActiveDatasetStudentGroups();
  if (context.role === 'department_coordinator' && context.departmentId) {
    return groupsRes.items
      .filter((g) => g.department === context.departmentId)
      .map((g) => ({ id: g.id, name: g.name, department: g.department, size: g.size }));
  }
  return groupsRes.items.map((g) => ({ id: g.id, name: g.name, department: g.department, size: g.size }));
}

export async function lookupMySessions(context: AuthenticatedUserContext): Promise<Array<{ id: string; courseId: string; kind: string; groups: string[]; facultyId: string }>> {
  const sessionsRes = await getActiveDatasetSessions();
  if (context.facultyId) {
    return sessionsRes.items
      .filter((s) => s.faculty_id === context.facultyId)
      .map((s) => ({
        id: s.id,
        courseId: s.course_id,
        kind: s.kind,
        groups: s.groups,
        facultyId: s.faculty_id,
      }));
  }
  return sessionsRes.items.slice(0, 30).map((s) => ({
    id: s.id,
    courseId: s.course_id,
    kind: s.kind,
    groups: s.groups,
    facultyId: s.faculty_id,
  }));
}

export async function lookupEligibleRoomCatalog(): Promise<Array<{ id: string; name: string; type: string; capacity: number; features: string[]; eventsAllowed: boolean }>> {
  const roomsRes = await getActiveDatasetRooms();
  return roomsRes.items.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    capacity: r.capacity,
    features: r.features,
    eventsAllowed: r.allowed_uses.includes('event'),
  }));
}

export async function getVerifiedDecisionEvidence(requestId: string): Promise<Record<string, unknown> | null> {
  try {
    const latest = await getLatestBookingRun();
    const dec = latest.decisions.find((d) => d.requestId === requestId);
    if (!dec) return null;

    return {
      evidence_id: `EVID-${dec.requestId}`,
      requestId: dec.requestId,
      runId: dec.runId,
      status: dec.status,
      title: dec.title,
      requester: dec.requester,
      role: dec.role,
      requestedCategory: dec.requestedCategory,
      effectiveCategory: dec.effectiveCategory,
      attendance: dec.attendance,
      roomId: dec.roomId,
      day: dec.day,
      startPeriod: dec.startPeriod,
      endPeriod: dec.endPeriod,
      scoreWeight: dec.scoreWeight,
      reason: dec.reason,
      allocatedAt: dec.allocatedAt,
    };
  } catch (err) {
    logger.warn('Failed to retrieve decision evidence', { requestId, error: err });
    return null;
  }
}
