# CIT Schedora — Gemini AI Workflows

## Workflow A: Natural Language Venue Booking Parser
- **Target Users**: Club Representatives, Department Coordinators, Admin.
- **Screen**: Submit Venue Request ("Describe Your Event" tab).
- **Supported Languages**: English, Hindi, Hinglish.
- **Functionality**:
  1. User inputs natural language event requirements (e.g. `"Humko Friday ko robotics workshop karna hai, 80 students honge aur projector chahiye"`).
  2. Frontend sends request to `POST /api/v1/ai/venue-requests/parse`.
  3. AI Orchestrator extracts title, attendance (`80`), duration, requested window (`FRI`), room types (`lab_cs`), and required features (`projector`).
  4. Backend checks for missing fields or vague timing (e.g., "afternoon") and generates a polite follow-up question.
  5. The extracted draft populates the editable request form.
  6. User reviews, edits any parameter, and explicitly submits the request to the deterministic booking optimizer queue.

## Workflow B: Faculty Scheduling Assistant
- **Target Users**: Authenticated Faculty members.
- **Screens**: Scheduling Requests ("Mark Unavailability", "Request Additional Session") and Session Relocation.
- **Intents Handled**:
  - `mark_unavailability`: Extracts unavailable days/periods and reason; identifies affected sessions from authenticated faculty context (`F01`).
  - `request_additional_session`: Extracts course code (`CS202`), session kind (`tutorial`), groups (`CSE-2`), and preferred window.
  - `relocate_session`: Extracts target course, current schedule, and preferred new day/time window.
- **Functionality**:
  1. Faculty inputs request in English or Hinglish.
  2. Orchestrator calls `POST /api/v1/ai/faculty-requests/parse` using authenticated faculty ID.
  3. Returns editable draft populated in the request form.
  4. Requires explicit submission; Admin approval is mandatory before any change affects the published timetable.

## Workflow C: Evidence-Based Decision Explanations
- **Target Users**: Administrators, Department Coordinators.
- **Screen**: Decision Intelligence & Venue Allocation Register.
- **Functionality**:
  1. User queries a decision ID (e.g. `BR-04`, `BR-09`, `BR-17`).
  2. Orchestrator fetches verified backend evidence records (decision status, validator rule logs, room capacities, priority caps).
  3. Calls `POST /api/v1/ai/decisions/explain`.
  4. Gemini generates a plain-language explanation referencing verified evidence IDs (`[EVID-BR-04]`).
  5. If evidence is missing, returns `"Insufficient recorded evidence to explain this decision."`
