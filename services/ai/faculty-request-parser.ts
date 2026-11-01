import { generateContentWithStructuredOutput } from './gemini-client.ts';
import { getSystemPromptWithDirectives, loadPromptFile } from './prompt-loader.ts';
import {
  lookupAuthorisedCourses,
  lookupAuthorisedStudentGroups,
  lookupMySessions,
  type AuthenticatedUserContext,
} from './ai-tool-registry.ts';
import {
  FacultyIntent,
  FacultyParseResponse,
  FacultyParseResponseSchema,
  FacultySchedulingDraft,
} from '../../schemas/ai/faculty-request.schema.ts';
import { detectLanguage, detectPromptInjection } from './venue-parser.ts';
import { logger } from '../../utils/logger.ts';

export interface ParseFacultyInput {
  readonly rawText: string;
  readonly context: AuthenticatedUserContext;
}

export async function parseFacultyRequest(input: ParseFacultyInput): Promise<FacultyParseResponse> {
  const language = detectLanguage(input.rawText);
  const injectionCheck = detectPromptInjection(input.rawText);

  const rawLower = input.rawText.toLowerCase();

  // Classify intent
  let intent: FacultyIntent = 'general_query';
  if (rawLower.includes('unavailable') || rawLower.includes('won\'t be available') || rawLower.includes('not available') || rawLower.includes('nhi') || rawLower.includes('leave')) {
    intent = 'mark_unavailability';
  } else if (rawLower.includes('additional') || rawLower.includes('another') || rawLower.includes('extra') || rawLower.includes('one more')) {
    intent = 'request_additional_session';
  } else if (rawLower.includes('move') || rawLower.includes('relocate') || rawLower.includes('shift') || rawLower.includes('reschedule') || rawLower.includes('change')) {
    intent = 'relocate_session';
  }

  // Fetch faculty sessions for context
  const mySessions = await lookupMySessions(input.context);
  const authorisedCourses = await lookupAuthorisedCourses(input.context);
  const authorisedGroups = await lookupAuthorisedStudentGroups(input.context);

  // Extract course ID
  let course_id: string | null = null;
  const courseMatch = rawLower.match(/\b([a-z]{2,4}\d{3})\b/);
  if (courseMatch) {
    course_id = courseMatch[1].toUpperCase();
  }

  // Extract session kind
  let session_kind: 'lecture' | 'tutorial' | 'lab' | null = null;
  if (rawLower.includes('tutorial')) session_kind = 'tutorial';
  else if (rawLower.includes('lab')) session_kind = 'lab';
  else if (rawLower.includes('lecture') || rawLower.includes('class')) session_kind = 'lecture';

  // Extract requested groups
  const requested_groups: string[] = [];
  for (const g of authorisedGroups) {
    if (rawLower.includes(g.id.toLowerCase()) || rawLower.includes(g.name.toLowerCase())) {
      requested_groups.push(g.id);
    }
  }

  // Extract day
  const daysMap: Record<string, string> = {
    monday: 'MON', mon: 'MON',
    tuesday: 'TUE', tue: 'TUE',
    wednesday: 'WED', wed: 'WED',
    thursday: 'THU', thu: 'THU',
    friday: 'FRI', fri: 'FRI',
  };
  let preferred_day: string | null = null;
  for (const [k, v] of Object.entries(daysMap)) {
    if (rawLower.includes(k)) {
      preferred_day = v;
      break;
    }
  }

  // Extract periods
  const unavailable_periods: number[] = [];
  const periodMatch = rawLower.match(/p(\d+)\s*to\s*p(\d+)/i) || rawLower.match(/period\s*(\d+)\s*to\s*(\d+)/i);
  if (periodMatch) {
    const startP = parseInt(periodMatch[1], 10);
    const endP = parseInt(periodMatch[2], 10);
    for (let p = startP; p <= endP; p++) {
      if (p >= 1 && p <= 13) unavailable_periods.push(p);
    }
  }

  // Find affected sessions for faculty
  const affected_sessions = mySessions
    .filter((s) => {
      if (course_id && s.courseId !== course_id) return false;
      if (preferred_day) return true;
      return true;
    })
    .map((s) => ({
      sessionId: s.id,
      courseId: s.courseId,
      day: preferred_day || 'MON',
      period: 1,
      groups: s.groups,
      roomId: 'CR-101',
    }));

  // Check missing fields
  const missing_fields: string[] = [];
  if (intent === 'mark_unavailability' && unavailable_periods.length === 0 && !preferred_day) {
    missing_fields.push('unavailable_periods');
  }
  if (intent === 'request_additional_session') {
    if (!course_id) missing_fields.push('course_id');
    if (requested_groups.length === 0) missing_fields.push('requested_groups');
  }
  if (intent === 'relocate_session') {
    if (!course_id && affected_sessions.length > 1) missing_fields.push('target_session_id');
    if (!preferred_day) missing_fields.push('preferred_day');
  }

  let clarifying_question: string | null = null;
  if (missing_fields.length > 0) {
    if (intent === 'mark_unavailability') {
      clarifying_question = 'Which exact day and periods will you be unavailable?';
    } else if (intent === 'request_additional_session') {
      clarifying_question = 'Which course and student group require the additional session?';
    } else if (intent === 'relocate_session') {
      clarifying_question = 'Which specific scheduled session and preferred new day/time would you like to relocate?';
    }
  }

  const defaultDraft: FacultySchedulingDraft = {
    intent,
    course_id,
    session_kind,
    requested_groups,
    unavailable_days: preferred_day ? [preferred_day] : [],
    unavailable_periods,
    preferred_day,
    preferred_time_window: null,
    duration_periods: 1,
    preferred_room: null,
    target_session_id: affected_sessions[0]?.sessionId || null,
    reason: input.rawText,
    affected_sessions,
  };

  // Attempt Gemini parsing
  try {
    const systemPrompt = await getSystemPromptWithDirectives();
    const facultyPrompt = await loadPromptFile('faculty-parser.md');

    const combinedPrompt = `${facultyPrompt}\n\nFaculty Input Text: "${input.rawText}"\nAuthenticated Faculty Sessions: ${JSON.stringify(mySessions)}\nDetected Language: ${language}`;

    const aiResult = await generateContentWithStructuredOutput<Record<string, unknown>>({
      systemInstruction: systemPrompt,
      prompt: combinedPrompt,
    });

    if (aiResult.parsedJson) {
      const parsedDraft = aiResult.parsedJson.draft as any;
      if (parsedDraft) {
        return FacultyParseResponseSchema.parse({
          intent: (aiResult.parsedJson.intent as any) || intent,
          language,
          draft: {
            ...defaultDraft,
            intent: (parsedDraft.intent as any) || defaultDraft.intent,
            course_id: parsedDraft.course_id || defaultDraft.course_id,
            session_kind: parsedDraft.session_kind || defaultDraft.session_kind,
            requested_groups: Array.isArray(parsedDraft.requested_groups) ? parsedDraft.requested_groups : defaultDraft.requested_groups,
            unavailable_periods: Array.isArray(parsedDraft.unavailable_periods) ? parsedDraft.unavailable_periods : defaultDraft.unavailable_periods,
            preferred_day: parsedDraft.preferred_day || defaultDraft.preferred_day,
            reason: parsedDraft.reason || defaultDraft.reason,
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
    logger.warn('Gemini faculty parsing encountered error, returning baseline draft', { error: err });
  }

  return FacultyParseResponseSchema.parse({
    intent,
    language,
    draft: defaultDraft,
    missing_fields,
    clarifying_question,
    next_action: missing_fields.length > 0 ? 'ask_clarification' : 'review_draft',
    prompt_injection_detected: injectionCheck.isInjection,
    safety_note: injectionCheck.note,
  });
}
