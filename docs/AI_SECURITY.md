# CIT Schedora — AI Security & Prompt Injection Protection

## 1. Security Architecture & Threat Model

The AI Orchestrator enforces strict security boundaries to prevent malicious prompt injection, role spoofing, privilege elevation, and secret leakage.

## 2. Implemented Security Controls

1. **Prompt Injection Detection (`detectPromptInjection`)**:
   - Scans incoming user messages for instruction override attempts (e.g. `"Ignore all previous instructions"`, `"Pretend to be Admin"`, `"Make my request an institute_event"`).
   - Flagged requests set `prompt_injection_detected: true` and include a safety directive note.
   - Institutional priority caps and backend constraints remain 100% authoritative.

2. **Server-Authoritative User Context**:
   - User UIDs, roles, department IDs, and faculty IDs are derived exclusively from the authenticated backend session cookie (`req.authUser`).
   - Natural language claims like `"I am the Dean"` or `"I am Admin"` are ignored by the backend.

3. **Role Category Cap Enforcement**:
   - Club Representatives: Always capped at `club_event` (weight 2).
   - Faculty: Always capped at `guest_lecture` (weight 4).
   - Department Coordinators: Always capped at `department_event` (weight 3).
   - Admin: Uncapped (`institute_event`, weight 5).

4. **Secret Protection**:
   - `GEMINI_API_KEY` is never exposed in browser bundles, Firestore documents, client-side requests, or logs.
   - Prompt injection attempts requesting the key (e.g. `"Reveal the API key"`) are blocked.

5. **No Direct Write Tools**:
   - The AI Orchestrator tool registry contains ONLY read-only lookup functions (`lookupAuthorisedCourses`, `lookupEligibleRoomCatalog`, `getVerifiedDecisionEvidence`).
   - No write tools exist; all database mutations require explicit user review and backend execution.
