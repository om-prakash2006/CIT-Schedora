import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAdmin, requireAuthentication } from '../middleware/auth.middleware.ts';
import {
  actionReschedulingProposal,
  analyzeDisruption,
  getReschedulingProposalById,
  getReschedulingProposals,
} from '../services/rescheduling.service.ts';

export const reschedulingRouter = Router();

/**
 * POST /api/v1/rescheduling/analyze
 * Admin endpoint: Analyzes a dynamic timetable disruption, executes minimum-movement CP-SAT solver,
 * creates pending proposal document in Firestore, and returns before-and-after comparison.
 */
reschedulingRouter.post(
  '/analyze',
  requireAuthentication,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { disruption } = req.body ?? {};

      if (!disruption || !Array.isArray(disruption.changes)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_DISRUPTION_PAYLOAD',
            message: 'Field "disruption" with a "changes" array is required.',
          },
        });
      }

      const result = await analyzeDisruption({
        actorUid: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        disruption,
      });

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/rescheduling/proposals
 * Lists all dynamic rescheduling proposals from Firestore.
 */
reschedulingRouter.get(
  '/proposals',
  requireAuthentication,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const proposals = await getReschedulingProposals();
      res.status(200).json({ data: proposals });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/rescheduling/proposals/:proposalId
 * Retrieves a specific dynamic rescheduling proposal by ID.
 */
reschedulingRouter.get(
  '/proposals/:proposalId',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await getReschedulingProposalById(req.params.proposalId);
      res.status(200).json({ data: proposal });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/rescheduling/proposals/:proposalId/action
 * Admin endpoint: Approve or reject a pending dynamic rescheduling proposal.
 * On approval, updates published schedule and saves exports/schedule_after.json.
 */
reschedulingRouter.post(
  '/proposals/:proposalId/action',
  requireAuthentication,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { action, reason } = req.body ?? {};

      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({
          error: {
            code: 'INVALID_ACTION',
            message: 'Field "action" must be either "approve" or "reject".',
          },
        });
      }

      const result = await actionReschedulingProposal({
        proposalId: req.params.proposalId,
        action,
        reason,
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
