import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadActiveFirestoreDatasetPayload } from './timetable.service.ts';
import { getLatestBookingRun } from './booking.service.ts';
import { recordAuditEvent } from './audit.service.ts';
import { logger } from '../utils/logger.ts';

const execFileAsync = promisify(execFile);

export async function getRoomUtilizationReport() {
  const datasetResult = await loadActiveFirestoreDatasetPayload();
  const rooms = (datasetResult.payload.rooms as any[]) || [];
  const sessions = (datasetResult.payload.sessions as any[]) || [];
  const sessionMap = new Map<string, any>();
  for (const s of sessions) {
    sessionMap.set(String(s.id ?? s.sessionId), s);
  }

  let scheduledSessions: Array<{ session_id: string; day: string; start_period: number; room_id: string }> = [];
  try {
    const candidateRaw = await fs.readFile(
      path.resolve(process.cwd(), 'artifacts', 'weekly_timetable_candidate.json'),
      'utf8'
    );
    const parsed = JSON.parse(candidateRaw);
    if (Array.isArray(parsed.sessions)) {
      scheduledSessions = parsed.sessions;
    }
  } catch {
    try {
      const exportRaw = await fs.readFile(
        path.resolve(process.cwd(), 'exports', 'schedule.json'),
        'utf8'
      );
      const parsed = JSON.parse(exportRaw);
      if (Array.isArray(parsed.sessions)) {
        scheduledSessions = parsed.sessions;
      }
    } catch {
      // fallback if no schedule file is present
    }
  }

  const maxTeachingSlotsPerWeek = 40; // 5 days * 8 teaching periods (excluding P5 lunch)

  const roomStats = rooms.map((room) => {
    const assigned = scheduledSessions.filter((a) => a.room_id === room.id);
    let totalTeachingHours = 0;
    let totalSeatHours = 0;
    const occupiedSlots: Array<{ day: string; period: number; sessionId: string; courseId: string }> = [];

    for (const a of assigned) {
      const sDef = sessionMap.get(a.session_id);
      const duration = Number(sDef?.duration ?? 1);
      const size = Number(sDef?.size ?? 0);
      const courseId = String(sDef?.course_id ?? a.session_id.split('-')[0] ?? a.session_id);
      totalTeachingHours += duration;
      totalSeatHours += size * duration;
      for (let offset = 0; offset < duration; offset += 1) {
        occupiedSlots.push({
          day: a.day,
          period: a.start_period + offset,
          sessionId: a.session_id,
          courseId,
        });
      }
    }

    const slotUtilization = Math.min(100, Math.round((totalTeachingHours / maxTeachingSlotsPerWeek) * 100));
    const seatUtilization =
      totalTeachingHours > 0
        ? Math.min(100, Math.round((totalSeatHours / (totalTeachingHours * Math.max(1, room.capacity))) * 100))
        : 0;
    const rType = String(room.type ?? 'classroom');
    const buildingBlock =
      rType === 'computer_lab' || rType === 'electronics_lab'
        ? 'Laboratory Complex'
        : rType === 'auditorium' || rType === 'seminar_hall'
        ? 'Auditorium & Seminar Wing'
        : 'Main Academic Block';

    return {
      roomId: room.id,
      name: room.name || room.id,
      type: rType,
      capacity: room.capacity,
      effectiveExamCapacity: Math.floor(Number(room.capacity || 0) * 0.5),
      accessible: Boolean(room.accessible ?? room.ground_floor ?? false),
      examEligible: Array.isArray(room.allowed_uses)
        ? room.allowed_uses.includes('exam')
        : rType !== 'computer_lab' && rType !== 'electronics_lab',
      buildingBlock,
      equipment: Array.isArray(room.has) ? room.has.map(String) : [],
      sessionsScheduled: assigned.length,
      weeklyHours: totalTeachingHours,
      slotUtilizationPercentage: slotUtilization,
      capacityUtilizationPercentage: slotUtilization > 0 ? slotUtilization : seatUtilization,
      eventsAllowed: Array.isArray(room.allowed_uses) ? room.allowed_uses.includes('event') : true,
      occupiedSlots,
    };
  });

  return roomStats;
}

export async function getFacultyWorkloadReport() {
  const datasetResult = await loadActiveFirestoreDatasetPayload();
  const faculty = (datasetResult.payload.faculty as any[]) || [];
  const sessions = (datasetResult.payload.sessions as any[]) || [];

  return faculty.map((f) => {
    const facSessions = sessions.filter((s) => s.faculty_id === f.id);
    const totalHours = facSessions.reduce((acc, s) => acc + (s.duration || 1), 0);

    return {
      facultyId: f.id,
      name: f.name,
      department: f.department,
      dailyLimitHours: f.daily_limit_hours || 4,
      assignedSessionsCount: facSessions.length,
      weeklyHoursAssigned: totalHours,
      coursesCount: new Set(facSessions.map((s) => s.course_id)).size,
    };
  });
}

export async function runOfficialValidator(schedulePath: string, baselinePath?: string, disruptionPath?: string) {
  const dataPath = path.resolve(process.cwd(), 'data', 'cit_public.json');
  const fullSchedPath = path.resolve(process.cwd(), schedulePath);

  const args = ['validator.py', '--data', dataPath, '--schedule', fullSchedPath, '--json', 'report_temp.json'];

  if (disruptionPath) {
    args.push('--disruption', path.resolve(process.cwd(), disruptionPath));
  }
  if (baselinePath) {
    args.push('--baseline', path.resolve(process.cwd(), baselinePath));
  }

  try {
    const { stdout, stderr } = await execFileAsync('python3', args);
    const reportRaw = await fs.readFile(path.resolve(process.cwd(), 'report_temp.json'), 'utf-8');
    const reportJson = JSON.parse(reportRaw);
    try { await fs.unlink('report_temp.json'); } catch {}

    return {
      stdout,
      stderr,
      report: reportJson,
    };
  } catch (err: any) {
    logger.warn('Official validator execution completed with warnings/errors', { error: err.message });
    try {
      const reportRaw = await fs.readFile(path.resolve(process.cwd(), 'report_temp.json'), 'utf-8');
      const reportJson = JSON.parse(reportRaw);
      try { await fs.unlink('report_temp.json'); } catch {}
      return { stdout: err.stdout || '', stderr: err.stderr || '', report: reportJson };
    } catch {
      return { stdout: err.stdout || '', stderr: err.stderr || '', report: null, error: err.message };
    }
  }
}
