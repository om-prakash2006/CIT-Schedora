import { loadActiveFirestoreDatasetPayload } from './timetable.service.ts';
import { recordAuditEvent } from './audit.service.ts';
import { AppError, BadRequestError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

export interface ManualScheduleInput {
  sessionId: string;
  day: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
  startPeriod: number;
  roomId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
}

export async function validateManualAssignment(input: ManualScheduleInput) {
  const datasetResult = await loadActiveFirestoreDatasetPayload();
  const payload = datasetResult.payload;

  const rooms = (payload.rooms as any[]) || [];
  const faculty = (payload.faculty as any[]) || [];
  const sessions = (payload.sessions as any[]) || [];

  const session = sessions.find((s) => s.id === input.sessionId);
  if (!session) {
    throw new BadRequestError(`Session ${input.sessionId} not found in active dataset.`);
  }

  const room = rooms.find((r) => r.id === input.roomId);
  if (!room) {
    throw new BadRequestError(`Room ${input.roomId} not found in active dataset.`);
  }

  const violations: string[] = [];
  const duration = session.duration || 1;
  const endPeriod = input.startPeriod + duration - 1;

  // H1: Valid teaching period range (1..9) and no lunch overlap (P5 -> P6)
  if (input.startPeriod < 1 || endPeriod > 9) {
    violations.push(`H1: Teaching sessions must fall within periods P1–P9. Requested P${input.startPeriod}–P${endPeriod}.`);
  }
  if (input.startPeriod <= 5 && endPeriod >= 6) {
    violations.push('H1: Sessions cannot span across lunch break (P5–P6).');
  }

  // H5: Room capacity check
  if (room.capacity < session.size) {
    violations.push(`H5: Room ${room.name} capacity (${room.capacity}) is smaller than session size (${session.size}).`);
  }

  // H6: Room type compatibility check
  const requiredTypes = session.room_types || ['classroom'];
  if (!requiredTypes.includes(room.type)) {
    violations.push(`H6: Room ${room.name} type '${room.type}' does not match required session room types [${requiredTypes.join(', ')}].`);
  }

  // H7: Faculty unavailability check
  const fac = faculty.find((f) => f.id === session.faculty_id);
  if (fac) {
    for (const un of fac.unavailable || []) {
      if (un.day === input.day) {
        const unPeriods = new Set(un.periods || []);
        for (let p = input.startPeriod; p <= endPeriod; p++) {
          if (unPeriods.has(p)) {
            violations.push(`H7: Faculty ${fac.name} (${fac.id}) is marked unavailable on ${input.day} P${p}.`);
          }
        }
      }
    }
  }

  // H8: Room unavailability check
  const roomUnavail = (payload.room_unavailability as any[]) || [];
  for (const un of roomUnavail) {
    if (un.room_id === input.roomId && un.day === input.day) {
      const unPeriods = new Set(un.periods || []);
      for (let p = input.startPeriod; p <= endPeriod; p++) {
        if (unPeriods.has(p)) {
          violations.push(`H8: Room ${room.name} is marked unavailable on ${input.day} P${p}.`);
        }
      }
    }
  }

  // H10: Accessibility check
  if (session.needs_accessible && !room.accessible) {
    violations.push(`H10: Session ${session.id} requires an accessible room, but room ${room.name} is not wheelchair accessible.`);
  }

  // H14: Fixed slot check
  if (session.fixed_slot) {
    if (session.fixed_slot.day !== input.day || session.fixed_slot.start_period !== input.startPeriod) {
      violations.push(`H14: Session ${session.id} has a fixed slot requirement at ${session.fixed_slot.day} P${session.fixed_slot.start_period}.`);
    }
  }

  const isValid = violations.length === 0;

  return {
    isValid,
    sessionId: input.sessionId,
    day: input.day,
    startPeriod: input.startPeriod,
    endPeriod,
    roomId: input.roomId,
    violations,
  };
}

export async function applyManualAssignment(input: ManualScheduleInput) {
  const validation = await validateManualAssignment(input);

  if (!validation.isValid) {
    throw new AppError(
      `Manual schedule assignment failed hard constraints: ${validation.violations.join(' ')}`,
      400,
      'MANUAL_ASSIGNMENT_INVALID'
    );
  }

  await recordAuditEvent({
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    module: 'scheduling',
    action: 'apply_manual_assignment',
    outcome: 'success',
    metadata: {
      sessionId: input.sessionId,
      day: input.day,
      startPeriod: input.startPeriod,
      roomId: input.roomId,
    },
  });

  return validation;
}
