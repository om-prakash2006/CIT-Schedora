import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuthentication } from '../middleware/auth.middleware.ts';
import {
  applyManualAssignment,
  validateManualAssignment,
} from '../services/manual_scheduling.service.ts';

export const manualSchedulingRouter = Router();

/**
 * POST /api/v1/manual-scheduling/validate
 * Validates a manual session assignment against all official hard constraints in validator.py.
 */
manualSchedulingRouter.post(
  '/validate',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { sessionId, day, startPeriod, roomId } = req.body ?? {};

      if (!sessionId || !day || !startPeriod || !roomId) {
        return res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Fields sessionId, day, startPeriod, and roomId are required.',
          },
        });
      }

      const result = await validateManualAssignment({
        sessionId,
        day,
        startPeriod: Number(startPeriod),
        roomId,
        actorUid: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/manual-scheduling/apply
 * Applies a manual session assignment after verifying all official hard constraints.
 */
manualSchedulingRouter.post(
  '/apply',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { sessionId, day, startPeriod, roomId } = req.body ?? {};

      if (!sessionId || !day || !startPeriod || !roomId) {
        return res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Fields sessionId, day, startPeriod, and roomId are required.',
          },
        });
      }

      const result = await applyManualAssignment({
        sessionId,
        day,
        startPeriod: Number(startPeriod),
        roomId,
        actorUid: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
