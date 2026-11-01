import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole,
} from '../middleware/auth.middleware.ts';
import {
  ensureSolverServiceReady,
  generateWeeklyTimetable,
  getScheduleById,
  getScheduleValidationReport,
  listSchedules,
  publishWeeklySchedule,
  revalidateScheduleById,
} from '../services/timetable.service.ts';
import { InstitutionalRole } from '../types/domain.types.ts';

export const schedulesRouter = Router();

/**
 * GET /api/v1/schedules/solver-health
 * Returns live status of the Python OR-Tools CP-SAT solver service.
 */
schedulesRouter.get(
  '/solver-health',
  requireAuthentication,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const status = await ensureSolverServiceReady();
      res.status(200).json({ data: status });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/schedules/weekly/generate
 * Admin-only endpoint that invokes the private Python OR-Tools CP-SAT solver service,
 * verifies the output with the official validator.py, and persists the versioned weekly
 * candidate schedule to Firestore (`schedules/{scheduleId}`).
 */
schedulesRouter.post(
  '/weekly/generate',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const timeoutSeconds =
        typeof req.body?.timeoutSeconds === 'number' ? req.body.timeoutSeconds : undefined;
      const randomSeed =
        typeof req.body?.randomSeed === 'number' ? req.body.randomSeed : undefined;

      const result = await generateWeeklyTimetable({
        actorUid: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        timeoutSeconds,
        randomSeed,
      });

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/schedules
 * Returns all persisted schedules ordered by generation timestamp descending.
 */
schedulesRouter.get(
  '/',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scheduleType =
        typeof req.query.type === 'string' && req.query.type.trim().length > 0
          ? req.query.type.trim()
          : undefined;
      const schedules = await listSchedules(scheduleType);
      res.status(200).json({
        data: {
          count: schedules.length,
          schedules,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/schedules/:scheduleId
 * Returns schedule metadata, all 189 sessionAssignments, and latest validationReport.
 */
schedulesRouter.get(
  '/:scheduleId',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scheduleId = String(req.params.scheduleId ?? '').trim();
      const detail = await getScheduleById(scheduleId);
      res.status(200).json({ data: detail });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/schedules/:scheduleId/validation
 * Returns the latest weekly validator report (`WEEKLY TIMETABLE COMPONENT VALIDATION ONLY`).
 */
schedulesRouter.get(
  '/:scheduleId/validation',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scheduleId = String(req.params.scheduleId ?? '').trim();
      const report = await getScheduleValidationReport(scheduleId);
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/schedules/:scheduleId/revalidate
 * Admin-only endpoint that re-runs the official validator.py against the stored
 * sessionAssignments in Firestore and persists a new validationReport.
 */
schedulesRouter.post(
  '/:scheduleId/revalidate',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scheduleId = String(req.params.scheduleId ?? '').trim();
      const actor = req.authUser!;
      const report = await revalidateScheduleById(scheduleId, {
        uid: actor.userId,
        email: actor.email,
        role: actor.role,
      });
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/schedules/:scheduleId/publish
 * Admin-only endpoint that approves and publishes a validated weekly schedule.
 */
schedulesRouter.post(
  '/:scheduleId/publish',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scheduleId = String(req.params.scheduleId ?? '').trim();
      const actor = req.authUser!;
      const stateParam = req.body?.state === 'validated' ? 'validated' : 'published';
      const schedule = await publishWeeklySchedule(
        scheduleId,
        {
          uid: actor.userId,
          email: actor.email,
          role: actor.role,
        },
        stateParam
      );
      res.status(200).json({ data: schedule });
    } catch (err) {
      next(err);
    }
  }
);

