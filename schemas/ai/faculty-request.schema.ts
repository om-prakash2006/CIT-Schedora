import { z } from 'zod';
import { LanguageSchema, NextActionSchema } from './common.schema.ts';

export const FacultyIntentSchema = z.enum([
  'mark_unavailability',
  'request_additional_session',
  'relocate_session',
  'general_query',
]);
export type FacultyIntent = z.infer<typeof FacultyIntentSchema>;

export const FacultySchedulingDraftSchema = z.object({
  intent: FacultyIntentSchema,
  course_id: z.string().nullable().default(null),
  session_kind: z.enum(['lecture', 'tutorial', 'lab']).nullable().default(null),
  requested_groups: z.array(z.string()).default([]),
  unavailable_days: z.array(z.string()).default([]),
  unavailable_periods: z.array(z.number().int().min(1).max(13)).default([]),
  preferred_day: z.string().nullable().default(null),
  preferred_time_window: z.string().nullable().default(null),
  duration_periods: z.number().int().positive().nullable().default(null),
  preferred_room: z.string().nullable().default(null),
  target_session_id: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
  affected_sessions: z
    .array(
      z.object({
        sessionId: z.string(),
        courseId: z.string(),
        day: z.string(),
        period: z.number(),
        groups: z.array(z.string()),
        roomId: z.string(),
      })
    )
    .default([]),
});
export type FacultySchedulingDraft = z.infer<typeof FacultySchedulingDraftSchema>;

export const FacultyParseResponseSchema = z.object({
  intent: FacultyIntentSchema,
  language: LanguageSchema.default('english'),
  draft: FacultySchedulingDraftSchema,
  missing_fields: z.array(z.string()).default([]),
  clarifying_question: z.string().nullable().default(null),
  next_action: NextActionSchema.default('review_draft'),
  prompt_injection_detected: z.boolean().default(false),
  safety_note: z.string().nullable().default(null),
});
export type FacultyParseResponse = z.infer<typeof FacultyParseResponseSchema>;
