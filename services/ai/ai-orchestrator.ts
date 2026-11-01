import { checkGeminiStatus } from './gemini-client.ts';
import { parseVenueRequest, type ParseVenueInput } from './venue-parser.ts';
import { parseFacultyRequest, type ParseFacultyInput } from './faculty-request-parser.ts';
import { explainDecision, type ExplainDecisionInput } from './decision-explainer.ts';
import {
  lookupAuthorisedCourses,
  lookupAuthorisedStudentGroups,
  lookupEligibleRoomCatalog,
  lookupMySessions,
  type AuthenticatedUserContext,
} from './ai-tool-registry.ts';
import { VenueParseResponse } from '../../schemas/ai/venue-request.schema.ts';
import { FacultyParseResponse } from '../../schemas/ai/faculty-request.schema.ts';
import { DecisionExplanation } from '../../schemas/ai/decision-explanation.schema.ts';
import { logger } from '../../utils/logger.ts';

export interface ProcessConversationTurnInput {
  readonly userMessage: string;
  readonly currentDraft?: Record<string, unknown> | null;
  readonly context: AuthenticatedUserContext;
  readonly conversationHistory?: Array<{ sender: 'user' | 'ai'; text: string }>;
}

export class AiOrchestrator {
  /**
   * Health & readiness check for AI Orchestrator
   */
  public getStatus() {
    const status = checkGeminiStatus();
    return {
      service: 'cit-schedora-ai-orchestrator',
      model: status.model,
      isConfigured: status.isConfigured,
      status: status.status,
      manualFallbackAvailable: true,
      lastTestedAt: status.lastTestedAt,
    };
  }

  /**
   * Parse natural language venue booking requests (English/Hindi/Hinglish)
   */
  public async parseVenue(input: ParseVenueInput): Promise<VenueParseResponse> {
    logger.info('AI Orchestrator: Parsing venue request', { role: input.userRole });
    return parseVenueRequest(input);
  }

  /**
   * Parse natural language faculty scheduling requests
   */
  public async parseFaculty(input: ParseFacultyInput): Promise<FacultyParseResponse> {
    logger.info('AI Orchestrator: Parsing faculty request', { uid: input.context.uid, role: input.context.role });
    return parseFacultyRequest(input);
  }

  /**
   * Process a multi-turn conversation turn
   */
  public async processTurn(input: ProcessConversationTurnInput): Promise<{
    readonly updatedDraft: Record<string, unknown>;
    readonly language: 'english' | 'hindi' | 'hinglish';
    readonly nextAction: string;
    readonly question: string | null;
    readonly responseText: string;
  }> {
    if (input.context.role === 'faculty') {
      const parsed = await parseFacultyRequest({
        rawText: input.userMessage,
        context: input.context,
      });
      return {
        updatedDraft: parsed.draft as any,
        language: parsed.language,
        nextAction: parsed.next_action,
        question: parsed.clarifying_question,
        responseText: parsed.clarifying_question || 'Parsed scheduling draft prepared for review.',
      };
    }

    const parsed = await parseVenueRequest({
      rawText: input.userMessage,
      userRole: input.context.role,
      conversationHistory: input.conversationHistory,
    });

    return {
      updatedDraft: parsed.draft as any,
      language: parsed.language,
      nextAction: parsed.next_action,
      question: parsed.clarifying_question,
      responseText: parsed.clarifying_question || 'Parsed venue draft prepared for review.',
    };
  }

  /**
   * Generate an evidence-based explanation for a recorded decision
   */
  public async explain(input: ExplainDecisionInput): Promise<DecisionExplanation> {
    logger.info('AI Orchestrator: Generating decision explanation', { entityId: input.entityId });
    return explainDecision(input);
  }

  /**
   * Safe read-only context lookups
   */
  public async getAuthorisedContext(context: AuthenticatedUserContext) {
    const [courses, groups, mySessions, rooms] = await Promise.all([
      lookupAuthorisedCourses(context),
      lookupAuthorisedStudentGroups(context),
      lookupMySessions(context),
      lookupEligibleRoomCatalog(),
    ]);

    return {
      courses,
      groups,
      mySessions,
      roomsCount: rooms.length,
    };
  }
}

export const aiOrchestrator = new AiOrchestrator();
