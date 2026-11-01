import { z } from 'zod';
import { LanguageSchema, NextActionSchema, TimeWindowSchema } from './common.schema.ts';

export const VenueBookingDraftSchema = z.object({
  title: z.string().nullable().default('Venue Booking Event'),
  attendance: z.number().int().positive().nullable().default(null),
  duration_periods: z.number().int().positive().nullable().default(null),
  windows: z.array(TimeWindowSchema).default([]),
  room_types: z.array(z.string()).default([]),
  needs: z.array(z.string()).default([]),
  requested_room: z.string().nullable().default(null),
  mandatory_for_groups: z.array(z.string()).default([]),
  raw_text: z.string().default(''),
});
export type VenueBookingDraft = z.infer<typeof VenueBookingDraftSchema>;

export const VenueParseResponseSchema = z.object({
  intent: z.literal('venue_booking'),
  language: LanguageSchema.default('english'),
  draft: VenueBookingDraftSchema,
  missing_fields: z.array(z.string()).default([]),
  clarifying_question: z.string().nullable().default(null),
  next_action: NextActionSchema.default('review_draft'),
  prompt_injection_detected: z.boolean().default(false),
  safety_note: z.string().nullable().default(null),
});
export type VenueParseResponse = z.infer<typeof VenueParseResponseSchema>;
