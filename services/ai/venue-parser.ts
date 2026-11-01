import { generateContentWithStructuredOutput } from './gemini-client.ts';
import { getSystemPromptWithDirectives, loadPromptFile } from './prompt-loader.ts';
import {
  VenueBookingDraft,
  VenueParseResponse,
  VenueParseResponseSchema,
} from '../../schemas/ai/venue-request.schema.ts';
import { Language } from '../../schemas/ai/common.schema.ts';
import { logger } from '../../utils/logger.ts';

export interface ParseVenueInput {
  readonly rawText: string;
  readonly userRole: string;
  readonly conversationHistory?: Array<{ sender: 'user' | 'ai'; text: string }>;
}

export function detectLanguage(text: string): Language {
  const lower = text.toLowerCase();
  const hindiKeywords = ['humko', 'karna', 'chahiye', 'bhai', 'kal', 'baje', 'meri', 'nahin', 'hoga', 'hai', 'sir', 'ke liye'];
  const hasHindiWord = hindiKeywords.some((w) => lower.includes(w));
  if (hasHindiWord) {
    return 'hinglish';
  }
  return 'english';
}

export function detectPromptInjection(text: string): { isInjection: boolean; note: string | null } {
  const lower = text.toLowerCase();
  const injectionPatterns = [
    'ignore all previous',
    'ignore previous instructions',
    'make my request an institute_event',
    'make this an institute event',
    'make this institute_event',
    'ignore room capacity',
    'ignore capacity',
    'pretend to be admin',
    'reveal the api key',
    'reveal key',
    'override priority',
    'approve my booking without',
  ];

  for (const pat of injectionPatterns) {
    if (lower.includes(pat)) {
      return {
        isInjection: true,
        note: `Security Directive: Attempted instruction override or permission elevation detected ("${pat}"). Event priority and role restrictions remain strictly enforced by the backend.`,
      };
    }
  }

  return { isInjection: false, note: null };
}

export async function parseVenueRequest(input: ParseVenueInput): Promise<VenueParseResponse> {
  const language = detectLanguage(input.rawText);
  const injectionCheck = detectPromptInjection(input.rawText);

  // Deterministic local extraction logic as baseline / fallback
  const rawLower = input.rawText.toLowerCase();

  // Extract attendance
  let attendance: number | null = null;
  const attMatch = rawLower.match(/(\d+)\s*(students|people|attendees|seater|seat|capacity)/) ||
                   rawLower.match(/(about|for|for\s*about)\s*(\d+)/);
  if (attMatch) {
    const num = parseInt(attMatch[1] || attMatch[2], 10);
    if (!isNaN(num) && num > 0) attendance = num;
  }

  // Extract duration
  let duration_periods: number | null = null;
  const durMatch = rawLower.match(/(\d+)\s*(hour|hours|hr|hrs|period|periods)/);
  if (durMatch) {
    duration_periods = parseInt(durMatch[1], 10);
  }

  // Extract day
  const daysMap: Record<string, string> = {
    monday: 'MON', mon: 'MON',
    tuesday: 'TUE', tue: 'TUE',
    wednesday: 'WED', wed: 'WED',
    thursday: 'THU', thu: 'THU',
    friday: 'FRI', fri: 'FRI',
    saturday: 'SAT', sat: 'SAT',
    sunday: 'SUN', sun: 'SUN',
  };
  let day: string | null = null;
  for (const [key, val] of Object.entries(daysMap)) {
    if (rawLower.includes(key)) {
      day = val;
      break;
    }
  }

  // Extract room types & features
  const room_types: string[] = [];
  if (rawLower.includes('auditorium')) room_types.push('auditorium');
  if (rawLower.includes('computer lab') || rawLower.includes('cs lab') || rawLower.includes('robotics')) room_types.push('lab_cs');
  if (rawLower.includes('seminar hall') || rawLower.includes('seminar')) room_types.push('seminar_hall');
  if (rawLower.includes('civil lab')) room_types.push('lab_civil');
  if (rawLower.includes('workshop')) room_types.push('workshop');
  if (room_types.length === 0) room_types.push('seminar_hall');

  const needs: string[] = [];
  if (rawLower.includes('projector')) needs.push('projector');
  if (rawLower.includes('pa system') || rawLower.includes('pa_system') || rawLower.includes('mic')) needs.push('pa_system');
  if (rawLower.includes('stage')) needs.push('stage');
  if (rawLower.includes('accessible') || rawLower.includes('wheelchair')) needs.push('accessible');
  if (rawLower.includes('computer') || rawLower.includes('computers')) needs.push('computers');

  // Extract requested room
  let requested_room: string | null = null;
  const roomMatch = rawLower.match(/\b(aud|oat|sh-1|sh-2|cs-lab-1|cs-lab-2|cr-101|cr-102|cr-105|lhc-5)\b/);
  if (roomMatch) {
    requested_room = roomMatch[1].toUpperCase();
  }

  // Extract title
  let title = 'Venue Booking Event';
  if (rawLower.includes('robotics')) title = 'Robotics Club Event';
  else if (rawLower.includes('seminar')) title = 'Academic Seminar';
  else if (rawLower.includes('orientation')) title = 'Orientation Program';
  else if (rawLower.includes('workshop')) title = 'Student Workshop';

  // Check missing fields
  const missing_fields: string[] = [];
  if (attendance === null) missing_fields.push('attendance');
  if (duration_periods === null) missing_fields.push('duration_periods');
  if (!day) missing_fields.push('windows');

  // Vague timing detection
  const isVagueTiming = rawLower.includes('afternoon') || rawLower.includes('evening') || rawLower.includes('morning') || rawLower.includes('after lunch');

  let clarifying_question: string | null = null;
  if (missing_fields.length > 0 || isVagueTiming) {
    if (language === 'hinglish') {
      clarifying_question = 'Aapka event kis day aur exact kis period/time (e.g., Thursday 2 PM se 4 PM) par rakha jaye?';
    } else {
      clarifying_question = 'Could you please specify the exact day, duration, or time periods required for your event?';
    }
  }

  const defaultDraft: VenueBookingDraft = {
    title,
    attendance,
    duration_periods,
    windows: day ? [{ day: day as any, from_period: null, to_period: null }] : [],
    room_types,
    needs,
    requested_room,
    mandatory_for_groups: [],
    raw_text: input.rawText,
  };

  // Attempt Gemini AI extraction if client is available
  try {
    const systemPrompt = await getSystemPromptWithDirectives();
    const venuePrompt = await loadPromptFile('venue-parser.md');

    const combinedPrompt = `${venuePrompt}\n\nUser Input Text: "${input.rawText}"\nUser Role: ${input.userRole}\nDetected Language: ${language}`;

    const aiResult = await generateContentWithStructuredOutput<Record<string, unknown>>({
      systemInstruction: systemPrompt,
      prompt: combinedPrompt,
    });

    if (aiResult.parsedJson) {
      const parsedDraft = aiResult.parsedJson.draft as any;
      if (parsedDraft) {
        return VenueParseResponseSchema.parse({
          intent: 'venue_booking',
          language,
          draft: {
            title: parsedDraft.title || defaultDraft.title,
            attendance: typeof parsedDraft.attendance === 'number' ? parsedDraft.attendance : defaultDraft.attendance,
            duration_periods: typeof parsedDraft.duration_periods === 'number' ? parsedDraft.duration_periods : defaultDraft.duration_periods,
            windows: Array.isArray(parsedDraft.windows) ? parsedDraft.windows : defaultDraft.windows,
            room_types: Array.isArray(parsedDraft.room_types) && parsedDraft.room_types.length > 0 ? parsedDraft.room_types : defaultDraft.room_types,
            needs: Array.isArray(parsedDraft.needs) ? parsedDraft.needs : defaultDraft.needs,
            requested_room: parsedDraft.requested_room || defaultDraft.requested_room,
            mandatory_for_groups: Array.isArray(parsedDraft.mandatory_for_groups) ? parsedDraft.mandatory_for_groups : defaultDraft.mandatory_for_groups,
            raw_text: input.rawText,
          },
          missing_fields: Array.isArray(aiResult.parsedJson.missing_fields) ? aiResult.parsedJson.missing_fields : missing_fields,
          clarifying_question: (aiResult.parsedJson.clarifying_question as string) || clarifying_question,
          next_action: missing_fields.length > 0 ? 'ask_clarification' : 'review_draft',
          prompt_injection_detected: injectionCheck.isInjection,
          safety_note: injectionCheck.note,
        });
      }
    }
  } catch (err) {
    logger.warn('Gemini venue parsing encountered error, returning baseline draft', { error: err });
  }

  // Baseline return
  return VenueParseResponseSchema.parse({
    intent: 'venue_booking',
    language,
    draft: defaultDraft,
    missing_fields,
    clarifying_question,
    next_action: missing_fields.length > 0 ? 'ask_clarification' : 'review_draft',
    prompt_injection_detected: injectionCheck.isInjection,
    safety_note: injectionCheck.note,
  });
}
