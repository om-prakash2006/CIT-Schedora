import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  requireAuthentication,
  requireRole,
  verifyCsrfIfCookiePresent,
} from '../middleware/auth.middleware.ts';
import {
  assembleFullScheduleJson,
  generateBookingDecisions,
  getBookingRunById,
  getLatestBookingRun,
  listBookingRuns,
  processBookingAction,
} from '../services/booking.service.ts';
import { InstitutionalRole } from '../types/domain.types.ts';

export const bookingsRouter = Router();

/**
 * POST /api/v1/bookings/generate
 * Admin-only endpoint invoking deterministic Spectra Week booking allocation engine,
 * verifying with official validator.py check_bookings, and persisting decisions to Firestore.
 */
bookingsRouter.post(
  '/generate',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const result = await generateBookingDecisions({
        actorUid: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
      });

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/bookings/latest
 * Returns latest active Spectra Week booking decision run.
 */
bookingsRouter.get(
  '/latest',
  requireAuthentication,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getLatestBookingRun();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/bookings/runs
 * Returns list of persisted booking decision runs.
 */
bookingsRouter.get(
  '/runs',
  requireAuthentication,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const runs = await listBookingRuns();
      res.status(200).json({ data: runs });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/bookings/runs/:runId
 * Returns specific booking decision run by ID.
 */
bookingsRouter.get(
  '/runs/:runId',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getBookingRunById(req.params.runId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/bookings/action
 * Institutional workflow endpoint for booking approval/override actions.
 * Enforces role restrictions (Club cannot approve; self-approval denied).
 */
bookingsRouter.post(
  '/action',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { requestId, runId, action, reason, targetRoomId, targetDay, targetStartPeriod, targetEndPeriod } = req.body ?? {};

      const result = await processBookingAction({
        requestId,
        runId,
        action,
        reason,
        actorUid: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetRoomId,
        targetDay,
        targetStartPeriod,
        targetEndPeriod,
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/bookings/assemble-schedule
 * Assembles and writes complete institutional schedule.json file for submission.
 */
bookingsRouter.post(
  '/assemble-schedule',
  requireAuthentication,
  verifyCsrfIfCookiePresent,
  requireRole(InstitutionalRole.ADMIN),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await assembleFullScheduleJson();
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
