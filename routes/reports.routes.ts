import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAdmin, requireAuthentication } from '../middleware/auth.middleware.ts';
import {
  getFacultyWorkloadReport,
  getRoomUtilizationReport,
  runOfficialValidator,
} from '../services/reports.service.ts';

export const reportsRouter = Router();

/**
 * GET /api/v1/reports/room-utilization
 * Returns room utilization report calculated from active dataset assignments.
 */
reportsRouter.get(
  '/room-utilization',
  requireAuthentication,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getRoomUtilizationReport();
      res.status(200).json({ data: stats });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/reports/faculty-workload
 * Returns faculty workload report calculated from active dataset assignments.
 */
reportsRouter.get(
  '/faculty-workload',
  requireAuthentication,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getFacultyWorkloadReport();
      res.status(200).json({ data: stats });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/reports/validate-official
 * Admin endpoint: Executes official validator.py against exports/schedule.json or exports/schedule_after.json.
 */
reportsRouter.post(
  '/validate-official',
  requireAuthentication,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schedulePath, baselinePath, disruptionPath } = req.body ?? {};
      const targetSchedule = schedulePath || 'exports/schedule.json';

      const valResult = await runOfficialValidator(targetSchedule, baselinePath, disruptionPath);

      res.status(200).json({ data: valResult });
    } catch (err) {
      next(err);
    }
  }
);
