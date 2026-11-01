import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAdmin, requireAuthentication } from '../middleware/auth.middleware.ts';
import { resetDemoOperationalState } from '../services/reset.service.ts';

export const adminRouter = Router();

/**
 * POST /api/v1/admin/demo-reset
 * Admin-only endpoint: Safely resets dynamic operational collections (reschedulingProposals, bookingDecisionRuns, examinationSchedules).
 * Preserves systemMeta/projectConfig, exact named Firestore database, active official dataset, and the 4 demo accounts.
 */
adminRouter.post(
  '/demo-reset',
  requireAuthentication,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;

      const result = await resetDemoOperationalState({
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
