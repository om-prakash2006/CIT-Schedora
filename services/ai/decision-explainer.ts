import { generateContentWithStructuredOutput } from './gemini-client.ts';
import { getSystemPromptWithDirectives, loadPromptFile } from './prompt-loader.ts';
import { getVerifiedDecisionEvidence } from './ai-tool-registry.ts';
import {
  DecisionExplanation,
  DecisionExplanationSchema,
} from '../../schemas/ai/decision-explanation.schema.ts';
import { logger } from '../../utils/logger.ts';

export interface ExplainDecisionInput {
  readonly entityId: string;
  readonly entityType?: 'booking_request' | 'timetable_session' | 'exam_allocation' | 'schedule_run';
  readonly language?: 'english' | 'hindi' | 'hinglish';
}

export async function explainDecision(input: ExplainDecisionInput): Promise<DecisionExplanation> {
  const entityType = input.entityType || 'booking_request';
  const language = input.language || 'english';

  // 1. Fetch real recorded backend evidence
  const evidence = await getVerifiedDecisionEvidence(input.entityId);

  if (!evidence) {
    logger.info('No recorded backend evidence found for entity ID', { entityId: input.entityId });
    return DecisionExplanationSchema.parse({
      entity_id: input.entityId,
      entity_type: entityType,
      language,
      explanation: 'Insufficient recorded evidence to explain this decision.',
      verified_claims: [],
      supporting_evidence_ids: [],
      missing_evidence: [`No recorded decision entry found for ID ${input.entityId}`],
      confidence_state: 'insufficient_evidence',
    });
  }

  // Build baseline deterministic explanation from evidence
  const evidenceId = String(evidence.evidence_id || `EVID-${input.entityId}`);
  const status = String(evidence.status || 'evaluated');
  const reason = String(evidence.reason || 'Evaluated against institutional criteria');
  const room = String(evidence.roomId || 'unassigned');
  const day = evidence.day ? String(evidence.day) : null;
  const startP = evidence.startPeriod ? String(evidence.startPeriod) : null;
  const endP = evidence.endPeriod ? String(evidence.endPeriod) : null;

  let baselineExplanation = `Request ${input.entityId} was recorded with status '${status}'. `;
  if (reason) baselineExplanation += `Recorded Reason: "${reason}". `;
  if (room !== 'unassigned') baselineExplanation += `Allocated Room: ${room}. `;
  if (day && startP && endP) baselineExplanation += `Allocated Slot: ${day} Period ${startP} to ${endP}.`;

  // 2. Attempt Gemini explanation with strict prompt
  try {
    const systemPrompt = await getSystemPromptWithDirectives();
    const explainerPrompt = await loadPromptFile('decision-explainer.md');

    const prompt = `${explainerPrompt}\n\nEntity ID: ${input.entityId}\nVerified Evidence Set: ${JSON.stringify(evidence, null, 2)}\nRequested Language: ${language}`;

    const aiResult = await generateContentWithStructuredOutput<Record<string, unknown>>({
      systemInstruction: systemPrompt,
      prompt,
    });

    if (aiResult.parsedJson && aiResult.parsedJson.explanation) {
      const expText = String(aiResult.parsedJson.explanation);
      return DecisionExplanationSchema.parse({
        entity_id: input.entityId,
        entity_type: entityType,
        language,
        explanation: expText,
        verified_claims: Array.isArray(aiResult.parsedJson.verified_claims) ? aiResult.parsedJson.verified_claims : [baselineExplanation],
        supporting_evidence_ids: [evidenceId],
        missing_evidence: [],
        confidence_state: 'high',
      });
    }
  } catch (err) {
    logger.warn('Gemini decision explanation failed, returning baseline evidence explanation', { error: err });
  }

  // Baseline return
  return DecisionExplanationSchema.parse({
    entity_id: input.entityId,
    entity_type: entityType,
    language,
    explanation: baselineExplanation,
    verified_claims: [baselineExplanation],
    supporting_evidence_ids: [evidenceId],
    missing_evidence: [],
    confidence_state: 'high',
  });
}
