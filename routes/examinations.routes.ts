import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole,
} from '../middleware/auth.middleware.ts';
import {
  generateExaminationSchedule,
  getExaminationScheduleById,
  getExaminationValidationReport,
  listExaminationSchedules,
  publishExaminationSchedule,
  revalidateExaminationScheduleById,
} from '../services/examination.service.ts';
import { InstitutionalRole } from '../types/domain.types.ts';

export const examinationsRouter = Router();

/**
 * POST /api/v1/examinations/generate
 * Admin-only endpoint invoking Google OR-Tools CP-SAT midsemester examination solver,
 * verifying with official validator.py check_exams, and persisting allocations to Firestore.
 */
examinationsRouter.post(
  '/generate',
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

      const result = await generateExaminationSchedule({
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
 * GET /api/v1/examinations
 * Returns list of persisted examination schedules.
 */
examinationsRouter.get(
  '/',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
      const schedules = await listExaminationSchedules(Number.isFinite(limit) ? limit : 20);
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
 * GET /api/v1/examinations/:examScheduleId
 * Returns metadata, all exam allocations, and validation report.
 */
examinationsRouter.get(
  '/:examScheduleId',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const examScheduleId = String(req.params.examScheduleId ?? '').trim();
      const detail = await getExaminationScheduleById(examScheduleId);
      res.status(200).json({ data: detail });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/examinations/:examScheduleId/validation
 * Returns validation report with parity verification against check_exams.
 */
examinationsRouter.get(
  '/:examScheduleId/validation',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const examScheduleId = String(req.params.examScheduleId ?? '').trim();
      const report = await getExaminationValidationReport(examScheduleId);
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/examinations/:examScheduleId/revalidate
 * Admin-only revalidation against official validator.py check_exams.
 */
examinationsRouter.post(
  '/:examScheduleId/revalidate',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const examScheduleId = String(req.params.examScheduleId ?? '').trim();
      const actor = req.authUser!;
      const report = await revalidateExaminationScheduleById(examScheduleId, {
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
 * POST /api/v1/examinations/:examScheduleId/publish
 * Admin-only endpoint that approves and publishes a validated examination schedule.
 */
examinationsRouter.post(
  '/:examScheduleId/publish',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const examScheduleId = String(req.params.examScheduleId ?? '').trim();
      const actor = req.authUser!;
      const stateParam = req.body?.state === 'validated' ? 'validated' : 'published';
      const schedule = await publishExaminationSchedule(
        examScheduleId,
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

