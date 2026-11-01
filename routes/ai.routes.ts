import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuthentication } from '../middleware/auth.middleware.ts';
import { aiOrchestrator } from '../services/ai/ai-orchestrator.ts';
import { CommonAiErrorResponseSchema } from '../schemas/ai/common.schema.ts';

export const aiRouter = Router();

/**
 * GET /api/v1/ai/status
 * AI readiness check endpoint. Reports configured model and fallback status without leaking secrets.
 */
aiRouter.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = aiOrchestrator.getStatus();
    res.status(200).json({ data: status });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/ai/venue-requests/parse
 * Natural language venue booking request parser (English / Hindi / Hinglish).
 * Returns structured draft and clarification questions without database mutation.
 */
aiRouter.post(
  '/venue-requests/parse',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { rawText, conversationHistory } = req.body ?? {};

      if (!rawText || typeof rawText !== 'string') {
        return res.status(400).json({
          error: CommonAiErrorResponseSchema.parse({
            code: 'INVALID_INPUT',
            message: 'Field "rawText" string is required for venue parsing.',
            manual_fallback_available: true,
          }),
        });
      }

      const result = await aiOrchestrator.parseVenue({
        rawText,
        userRole: actor.role,
        conversationHistory,
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/ai/faculty-requests/parse
 * Natural language faculty scheduling request parser.
 * Supports mark_unavailability, request_additional_session, and relocate_session.
 */
aiRouter.post(
  '/faculty-requests/parse',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { rawText } = req.body ?? {};

      if (!rawText || typeof rawText !== 'string') {
        return res.status(400).json({
          error: CommonAiErrorResponseSchema.parse({
            code: 'INVALID_INPUT',
            message: 'Field "rawText" string is required for faculty parsing.',
            manual_fallback_available: true,
          }),
        });
      }

      const result = await aiOrchestrator.parseFaculty({
        rawText,
        context: {
          uid: actor.userId,
          role: actor.role,
          departmentId: actor.departmentId,
          facultyId: actor.facultyId,
        },
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/ai/conversations/turn
 * Conversational clarification turn with bounded history and draft preservation.
 */
aiRouter.post(
  '/conversations/turn',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.authUser!;
      const { userMessage, currentDraft, conversationHistory } = req.body ?? {};

      if (!userMessage || typeof userMessage !== 'string') {
        return res.status(400).json({
          error: CommonAiErrorResponseSchema.parse({
            code: 'INVALID_INPUT',
            message: 'Field "userMessage" string is required.',
            manual_fallback_available: true,
          }),
        });
      }

      const result = await aiOrchestrator.processTurn({
        userMessage,
        currentDraft,
        conversationHistory,
        context: {
          uid: actor.userId,
          role: actor.role,
          departmentId: actor.departmentId,
          facultyId: actor.facultyId,
        },
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/ai/decisions/explain
 * Evidence-based explanation service for recorded institutional decisions.
 */
aiRouter.post(
  '/decisions/explain',
  requireAuthentication,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityId, entityType, language } = req.body ?? {};

      if (!entityId || typeof entityId !== 'string') {
        return res.status(400).json({
          error: CommonAiErrorResponseSchema.parse({
            code: 'INVALID_INPUT',
            message: 'Field "entityId" string is required.',
            manual_fallback_available: true,
          }),
        });
      }

      const result = await aiOrchestrator.explain({
        entityId,
        entityType,
        language,
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
