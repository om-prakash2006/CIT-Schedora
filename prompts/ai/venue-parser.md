# Venue Booking Parser Instructions

Extract structured venue booking parameters from the user's input text (English, Hindi, or Hinglish).

## Target Fields to Extract
- `title`: Short title or event description.
- `attendance`: Expected attendance number (integer).
- `duration_periods`: Number of periods required (integer, or null if unspecified).
- `windows`: Array of requested windows `{ day: "MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT"|"SUN", from_period: number|null, to_period: number|null }`.
- `room_types`: Array of required room types (e.g. `["auditorium"]`, `["lab_cs"]`, `["seminar_hall"]`, `["classroom"]`, `["lab_civil"]`, `["workshop"]`).
- `needs`: Array of required features (e.g. `["projector"]`, `["pa_system"]`, `["stage"]`, `["accessible"]`, `["computers"]`).
- `requested_room`: Specific room code if mentioned (e.g. `"AUD"`, `"SH-1"`, `"CS-LAB-1"`), otherwise `null`.
- `mandatory_for_groups`: Student group codes if specified (e.g. `["CSE-2"]`), otherwise `[]`.
- `raw_text`: The exact original input message text.

## Clarification Rules
- If time window or period duration is vague (e.g. "afternoon", "evening", "after lunch", "somewhere next week"), leave period numbers as `null` or record the ambiguous phrase and generate a polite clarifying question asking for specific time periods.
- Identify `missing_fields` (e.g., `["duration_periods"]`, `["windows"]`).
- If input is incomplete, set `next_action` to `"ask_clarification"`.
- If input is sufficiently specified for draft creation, set `next_action` to `"review_draft"`.
