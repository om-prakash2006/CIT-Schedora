import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  requireAuthentication,
  requireRole,
} from '../middleware/auth.middleware.ts';
import {
  getActiveDatasetBookingRequests,
  getActiveDatasetCancellations,
  getActiveDatasetCourses,
  getActiveDatasetExams,
  getActiveDatasetFaculty,
  getActiveDatasetRoomUnavailability,
  getActiveDatasetRooms,
  getActiveDatasetSessions,
  getActiveDatasetStudentGroups,
  getActiveDatasetVersionDoc,
  getDatabaseMetadataSummary,
  getDatasetImportJobs,
  importOfficialDataset,
  validateDatasetPayload,
} from '../services/dataset.service.ts';
import { InstitutionalRole } from '../types/domain.types.ts';
import { BadRequestError } from '../utils/errors.ts';

export const datasetsRouter = Router();

const requireAdminForPrivilegedDatasetMutation = [
  requireAuthentication,
  requireRole(InstitutionalRole.ADMIN),
];

/**
 * GET /api/v1/datasets/active
 * Returns the active dataset version metadata from the named Firestore database.
 */
datasetsRouter.get(
  '/active',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const active = await getActiveDatasetVersionDoc();
      const dbMeta = getDatabaseMetadataSummary();
      if (!active) {
        res.status(200).json({
          active: false,
          ...dbMeta,
          dataset: null,
        });
        return;
      }

      res.status(200).json({
        active: true,
        ...dbMeta,
        activeDataset: active.activePointer,
        version: active.versionDoc,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/summary
 * Returns dynamic record counts, calendar configuration, priority hierarchy, and role category caps.
 */
datasetsRouter.get(
  '/active/summary',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const active = await getActiveDatasetVersionDoc();
      const dbMeta = getDatabaseMetadataSummary();
      if (!active) {
        res.status(200).json({
          active: false,
          ...dbMeta,
          summary: null,
        });
        return;
      }

      res.status(200).json({
        active: true,
        ...dbMeta,
        datasetId: active.activePointer.datasetId,
        versionId: active.activePointer.versionId,
        institute: active.versionDoc.institute,
        checksum: active.versionDoc.checksum,
        counts: active.versionDoc.counts,
        priorityOrder: active.versionDoc.priority_order,
        roleCategoryCap: active.versionDoc.role_category_cap,
        calendar: active.versionDoc.calendar,
        activatedAt: active.activePointer.activatedAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/rooms
 */
datasetsRouter.get(
  '/active/rooms',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [{ activePointer, items: rooms }, { items: roomUnavailability }] =
        await Promise.all([
          getActiveDatasetRooms(),
          getActiveDatasetRoomUnavailability(),
        ]);
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        active: Boolean(activePointer),
        ...dbMeta,
        datasetId: activePointer?.datasetId ?? null,
        versionId: activePointer?.versionId ?? null,
        count: rooms.length,
        rooms,
        roomUnavailabilityCount: roomUnavailability.length,
        roomUnavailability,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/faculty
 */
datasetsRouter.get(
  '/active/faculty',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { activePointer, items: faculty } = await getActiveDatasetFaculty();
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        active: Boolean(activePointer),
        ...dbMeta,
        datasetId: activePointer?.datasetId ?? null,
        versionId: activePointer?.versionId ?? null,
        count: faculty.length,
        faculty,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/student-groups
 */
datasetsRouter.get(
  '/active/student-groups',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { activePointer, items: studentGroups } =
        await getActiveDatasetStudentGroups();
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        active: Boolean(activePointer),
        ...dbMeta,
        datasetId: activePointer?.datasetId ?? null,
        versionId: activePointer?.versionId ?? null,
        count: studentGroups.length,
        studentGroups,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/courses
 */
datasetsRouter.get(
  '/active/courses',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { activePointer, items: courses } = await getActiveDatasetCourses();
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        active: Boolean(activePointer),
        ...dbMeta,
        datasetId: activePointer?.datasetId ?? null,
        versionId: activePointer?.versionId ?? null,
        count: courses.length,
        courses,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/sessions
 */
datasetsRouter.get(
  '/active/sessions',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        { activePointer, items: sessions },
        { items: bookingRequests },
        { items: cancellations },
      ] = await Promise.all([
        getActiveDatasetSessions(),
        getActiveDatasetBookingRequests(),
        getActiveDatasetCancellations(),
      ]);
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        active: Boolean(activePointer),
        ...dbMeta,
        datasetId: activePointer?.datasetId ?? null,
        versionId: activePointer?.versionId ?? null,
        count: sessions.length,
        sessions,
        bookingRequestsCount: bookingRequests.length,
        bookingRequests,
        cancellationsCount: cancellations.length,
        cancellations,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/active/exams
 */
datasetsRouter.get(
  '/active/exams',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { activePointer, items: exams } = await getActiveDatasetExams();
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        active: Boolean(activePointer),
        ...dbMeta,
        datasetId: activePointer?.datasetId ?? null,
        versionId: activePointer?.versionId ?? null,
        count: exams.length,
        exams,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/datasets/imports
 */
datasetsRouter.get(
  '/imports',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const imports = await getDatasetImportJobs();
      const dbMeta = getDatabaseMetadataSummary();

      res.status(200).json({
        ...dbMeta,
        count: imports.length,
        imports,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/datasets/validate
 * Protected endpoint: Validates a candidate dataset JSON payload without importing it.
 */
datasetsRouter.post(
  '/validate',
  ...requireAdminForPrivilegedDatasetMutation,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload =
        req.body && typeof req.body === 'object' && 'dataset' in req.body
          ? (req.body as { dataset: unknown }).dataset
          : req.body;

      if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
        throw new BadRequestError('Dataset payload is required for validation.', 'DATASET_PAYLOAD_REQUIRED');
      }

      const { validation } = validateDatasetPayload(payload);
      res.status(validation.valid ? 200 : 422).json(validation);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/datasets/import
 * Protected endpoint: Validates and imports an official dataset into the named Firestore database.
 */
datasetsRouter.post(
  '/import',
  ...requireAdminForPrivilegedDatasetMutation,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as {
        dataset?: unknown;
        sourceFilename?: string;
      };

      const result = await importOfficialDataset({
        rawJsonOrObject: body.dataset,
        sourceFilename: body.sourceFilename ?? 'data/cit_public.json',
        importedBy: req.authProfile?.uid ?? 'admin-api',
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
