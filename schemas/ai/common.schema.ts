import { z } from 'zod';

export const LanguageSchema = z.enum(['english', 'hindi', 'hinglish']);
export type Language = z.infer<typeof LanguageSchema>;

export const NextActionSchema = z.enum(['ask_clarification', 'review_draft', 'submit', 'explain']);
export type NextAction = z.infer<typeof NextActionSchema>;

export const TimeWindowSchema = z.object({
  day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']).nullable().optional(),
  from_period: z.number().int().min(1).max(13).nullable().optional(),
  to_period: z.number().int().min(1).max(13).nullable().optional(),
});
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

export const CommonAiErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  manual_fallback_available: z.boolean().default(true),
});
export type CommonAiErrorResponse = z.infer<typeof CommonAiErrorResponseSchema>;
