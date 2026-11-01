import { z } from 'zod';
import { LanguageSchema } from './common.schema.ts';

export const DecisionExplanationSchema = z.object({
  entity_id: z.string(),
  entity_type: z.enum(['booking_request', 'timetable_session', 'exam_allocation', 'schedule_run']),
  language: LanguageSchema.default('english'),
  explanation: z.string(),
  verified_claims: z.array(z.string()).default([]),
  supporting_evidence_ids: z.array(z.string()).default([]),
  missing_evidence: z.array(z.string()).default([]),
  confidence_state: z.enum(['high', 'medium', 'insufficient_evidence']).default('high'),
});
export type DecisionExplanation = z.infer<typeof DecisionExplanationSchema>;
