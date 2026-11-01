# CIT Schedora — Complete End-to-End Web Application Flow

> **Milestone Context**: This document establishes the authoritative end-to-end functional specification, role workflows, request lifecycles, module navigation map, and judging verification plan for the complete **CIT Schedora** platform at **Chilika Institute of Technology (CIT)**.
>
> In Milestone 1, only the backend server foundation (`/api/v1/health` and `/api/v1/readiness`) is implemented. Subsequent milestones must implement every workflow below strictly according to this specification so that all services, roles, and screens operate as one cohesive institutional platform.

---

## Branding & Unified Navigation Bar Specification

1. **Official Institutional Emblem**:
   - All screens must display the official **Chilika Institute of Technology** crest (`/assets/aistudio/cit_1.jpg_5064815d.png`) in the sidebar/top brand header and on the Unified Login screen.
2. **Consistent Admin Navigation Bar**:
   - Across all Admin screens, the left sidebar and top navigation bar must remain identical to the canonical 1st Admin screen layout:
     - **Brand Header**: Official CIT Logo + `CIT Schedora` (`Campus Scheduling & Venue Management`).
     - **Top Bar**: Breadcrumb (`Home / ...`), global search input (`Search slots, venues, cohort...`), notification bell, and authenticated user badge (`Prof. A. Sharma · Dean's Office (Admin)`).
     - **Sidebar Groups**:
       - `OVERVIEW`: Dashboard
       - `ACADEMIC OPERATIONS`: Timetable Management, Examination Scheduler
       - `VENUE OPERATIONS`: Venue Bookings, Spectra Week, Room Intelligence
       - `INTELLIGENCE`: Dynamic Rescheduling, AI Scheduling Assistant, Decision Intelligence
       - `ADMINISTRATION`: Manual Scheduling, Reports & Exports, Dataset Management, User & Role Management, Audit Logs, Settings

---

## FLOW 01 — Application Entry and Authentication

### End-to-End Sequence

```text
[User Opens CIT Schedora]
           │
           ▼
[GET /api/v1/auth/session] ──(No Valid Session)──► [Unified CIT Schedora Login Page]
           │                                                  │
   (Valid Session)                              [User Enters Email & Password]
           │                                                  │
           │                                                  ▼
           │                                     [Firebase Auth Web SDK Sign-In]
           │                                     - signInWithEmailAndPassword()
           │                                     - Obtain fresh Firebase ID Token
           │                                     - Immediately clear client token (signOut)
           │                                                  │
           │                                                  ▼
           │                                     [POST /api/v1/auth/sessionLogin]
           │                                     - Verify ID Token via Firebase Admin SDK
           │                                     - Verify Project Audience (cit-schedora)
           │                                     - Verify Recent Auth (<= 5 minutes)
           │                                     - Verify Active Firestore users/{uid} Profile
           │                                     - Issue 12h HTTP-Only Session Cookie + CSRF
           ▼                                                  │
[Backend Resolves Authenticated Role & Scope] ◄───────────────┘
           │
           ├──► Role: admin                  ──► Admin Command Center (/admin/dashboard)
           ├──► Role: department_coordinator ──► Department Coordinator Workspace (/coordinator/department-event-bookings)
           ├──► Role: faculty                ──► Faculty Workspace (/faculty/timetable)
           └──► Role: club                   ──► Club Representative Workspace (/club/submit-venue-request)
```

### Mandatory Authentication Rules
1. **Unified Login Screen**: A single institutional login page serves all four roles.
2. **Zero Role Selection at Login**: There is **no** role dropdown, toggle, or selector on the login page. Users cannot choose their own privileges, and demo credentials are never exposed in the browser UI.
3. **Firebase Email/Password Only**: No Google Sign-In, no Gmail OAuth, and no third-party social login.
4. **Backend-Enforced RBAC**: Every route and API controller independently validates the HTTP-only Firebase session cookie (`cit_schedora_session`) and resolves the user's role, `departmentId`, `facultyId`, `clubId`, `accountStatus`, and `authorizationVersion` from the live Firestore `users/{uid}` document in `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`.
5. **Session Invalidation & Revocation**: Logging out (`POST /api/v1/auth/sessionLogout`) or administrative revocation (`POST /api/v1/users/:uid/revoke-sessions`) increments `authorizationVersion`, revokes Firebase refresh tokens, and clears the HTTP-only session cookie so old cookies cannot be replayed (`401 SESSION_REVOKED`).

---

## FLOW 02 — Admin Workflow

The **Admin** (Dean's Office) is the primary institutional scheduling authority with access to all 15 modules:
1. Admin Command Center (`Dashboard`)
2. Timetable Management
3. Examination Scheduler
4. Venue Bookings
5. Spectra Week
6. Room Intelligence
7. Dynamic Rescheduling
8. AI Scheduling Assistant
9. Decision Intelligence
10. Manual Scheduling
11. Reports & Exports
12. Dataset Management
13. User & Role Management
14. Audit Logs
15. Settings

### A. Dataset Loading (`Dataset Management`)
1. Admin opens **Dataset Management**.
2. Uploads canonical `cit_public.json`.
3. Backend validates JSON syntax and top-level schema structure.
4. Backend validates all entity identifiers (`rooms`, `faculty`, `student_groups`, `courses`, `sessions`, `exams`, `bookings`) and foreign-key cross-references without hardcoding dataset counts.
5. UI displays actual parsed record counts, structural errors, and warnings alongside an import preview.
6. Admin confirms dataset activation.
7. Backend persists the validated active dataset version in PostgreSQL and records the activation in **Audit Logs**.

### B. Weekly Timetable Generation (`Timetable Management`)
1. Admin opens **Timetable Management** and selects the active dataset.
2. Inspects all required curricular sessions.
3. Triggers the deterministic Python OR-Tools timetable solver.
4. Solver assigns a valid `day`, `start_period`, and `room` to every required session while respecting all hard constraints (room capacity, room allowed uses, faculty non-overlap, student group non-overlap, faculty availability, mandatory 13:00–14:00 lunch break, lab continuity).
5. Solver optimises soft penalty factors.
6. Backend invokes the official Python `validator.py` against the candidate timetable.
7. UI displays the exact validation report (hard violations count, soft penalty score, per-rule breakdown).
8. If and only if validation passes (`0` hard constraint violations), Admin can publish the timetable. **An invalid schedule can never be published.**
9. Published timetables are inspectable by **Student Group**, **Faculty**, and **Room**.

### C. Examination Scheduling (`Examination Scheduler`)
1. Admin opens **Examination Scheduler**.
2. Loads the examination records (e.g., 41 exams from `cit_public.json`) from the active dataset.
3. Runs the deterministic exam solver across the official Monday–Saturday examination calendar using `AM` and `PM` session blocks.
4. Allocates one or multiple eligible rooms per examination while strictly enforcing the **50% effective room-capacity rule** (`allocated_students <= floor(room.capacity * 0.50)`).
5. Verifies zero student group clashes and room eligibility.
6. Validates all allocations via the official validator.
7. Displays the scheduled exam calendar matrix and any unscheduled exams.
8. Publishes only after deterministic validation succeeds.

### D. Venue Booking Decisions (`Venue Bookings` & `Spectra Week`)
1. Admin opens **Venue Bookings** or **Spectra Week**.
2. Backend retrieves all actual booking requests, preserving original `raw_text` where submitted in natural language.
3. For natural-language requests, the shared Gemini orchestrator extracts structured parameters into an editable review view.
4. Backend computes the **effective booking category** deterministically using the requester's authenticated role and dataset `role_category_cap`.
5. Deterministic booking engine evaluates:
   - Venue capacity, room type, features, accessibility, and allowed uses.
   - **Institutional Priority Hierarchy** (strictly ordered highest to lowest):
     1. `Exams`
     2. `Regular classes`
     3. `Institute events`
     4. `Guest lectures`
     5. `Department events`
     6. `Club events`
   - **Earlier-submission timestamp tie-breaking** (`submitted_at` FIFO) for equal-priority competing requests.
   - Room and mandatory student cohort conflicts.
   - Feasible alternative rooms or time slots if the primary request conflicts.
6. Produces `approved`, `rejected`, or `alternative_offered` outcomes with a specific, verifiable decision reason.
7. **Special Invariants**:
   - **Cancelled requests (`status = cancelled`) must never be approved.**
   - **Class Displacement Rule**: Only an approved `institute_event` may displace a `regular_class`, and the displaced class session must be deterministically relocated to a conflict-free slot/room rather than dropped. Explicit **Admin approval** is mandatory before applying any class displacement.
8. Final authorised decisions are persisted in PostgreSQL, logged in **Audit Logs**, and included in `exports/schedule.json`.

### E. Dynamic Rescheduling (`Dynamic Rescheduling`)
1. Admin uploads an official disruption/change JSON file supporting the five canonical change types:
   - `faculty_unavailable`
   - `room_unavailable`
   - `add_faculty`
   - `add_session`
   - `remove_session`
2. Backend validates the disruption JSON structure and identifies directly broken sessions and cascading cohort/room/faculty conflicts.
3. Backend invokes the Python deterministic repair solver configured for **minimum-session-movement optimisation** (moving the fewest existing baseline sessions while satisfying all hard constraints).
4. Backend runs the official `validator.py` against the baseline timetable, disruption payload, and repaired candidate timetable.
5. UI displays the exact **Before vs. After** delta manifest and the deterministic root cause for every moved or newly added session.
6. Admin explicitly **Approves** or **Rejects** the repair proposal.
7. **Only after Admin approval** is the repaired timetable applied and `exports/schedule_after.json` generated from the approved database state, while preserving the original baseline and full audit trail.
8. **Infeasibility Safeguard**: If no valid solution exists, the backend does **not** apply a partial/invalid repair, displays the exact conflicting constraints, and preserves the active baseline timetable untouched.

### F. Manual Scheduling (`Manual Scheduling`)
1. Admin (or authorised role) opens **Manual Scheduling**.
2. Enters event allocation details, selects an eligible room, and specifies date, period window, and duration.
3. Backend runs real-time deterministic hard-constraint checks (room availability, faculty availability, student group clashes, capacity, allowed use, mandatory lunch break).
4. Invalid allocations are deterministically rejected; valid allocations follow the required approval workflow and are recorded in the audit ledger. **Manual scheduling never bypasses hard constraints.**

### G. Reports and Exports (`Reports & Exports`)
1. Admin selects report category, active dataset version, schedule version, and cohort/faculty/room filters.
2. Generates reports directly from actual database records after running validation checks.
3. Previews and downloads reports or generates the official canonical machine-readable exports:
   - `exports/schedule.json`
   - `exports/schedule_after.json`
4. Export files are generated strictly by the backend application matching the organisers' exact JSON schema — never hand-edited.

### H. Institutional Governance (`Dataset Management`, `User & Role Management`, `Audit Logs`, `Settings`)
1. Admin manages dataset versions, user accounts, role assignments, institutional booking priority order, and security settings.
2. **Separation-of-Duties (SoD)**: Nobody (including Admin) can approve their own request.
3. **Demo Sandbox Reset**: Admin can reset demo data to its canonical initial state while preserving the four working demo accounts, institutional configuration, and required audit history.

---

## FLOW 03 — Department Coordinator Workflow

After authentication, the **Department Coordinator** (`coordinator.cse@cit-schedora.test`, Department: `CSE`) is routed to the Department Coordinator Workspace.

The Coordinator workspace has **exactly three independent navigation destinations**, in this strict order:
1. **Department Event Bookings**
2. **Session Change Requests**
3. **Department Lab Booking Approvals**

### A. Department Event Bookings
1. Coordinator opens **Department Event Bookings**.
2. Enters event title, agenda, expected attendance, requested date, start period, duration, and preferred departmental venue.
3. Backend deterministically caps the effective booking category at `department_event` and checks room eligibility and cohort/room conflicts.
4. Coordinator reviews the structured request and submits.
5. Backend persists the request and routes it into the authorised decision workflow (Coordinator cannot self-approve their own booking).

### B. Session Change Requests
1. Coordinator opens **Session Change Requests**.
2. Selects an existing curricular session belonging to their authorised department (`CSE`).
3. Inspects the read-only original assignment and specifies a requested replacement day, period, or room along with an operational reason.
4. Backend checks institutional hard constraints and routes the request to the **Admin** scheduling approval queue.
5. Published timetable changes take effect only after Admin approval.

### C. Department Lab Booking Approvals
1. Coordinator opens **Department Lab Booking Approvals**.
2. Backend retrieves pending booking requests targeting venues strictly within the Coordinator's authorised laboratory scope (e.g., `CSE` labs).
3. Coordinator inspects attendance, capacity margin, room eligibility, and deterministic validation checks.
4. Coordinator **Approves**, **Rejects**, or **Offers an Alternative** (providing a mandatory decision reason).
5. **Enforced Backend Guardrails**:
   - Coordinator **cannot** approve their own request (`requesterId !== approverId`).
   - Coordinator **cannot** approve bookings for rooms outside their authorised department laboratories.
   - Cross-departmental or institute-level escalations are routed to **Admin**.
   - Coordinator has no global Admin privileges.

---

## FLOW 04 — Faculty Workflow

After authentication, **Faculty** (`faculty.f01@cit-schedora.test`, Faculty ID: `F01`) is routed to **My Timetable**.

The Faculty workspace has **exactly three separate navigation destinations**, in this strict order:
1. **My Timetable**
2. **Scheduling Requests**
3. **Request Session Relocation**

### A. My Timetable
1. Faculty opens **My Timetable**.
2. Backend retrieves only the published curricular sessions assigned to the authenticated `facultyId` (`F01`).
3. Frontend displays the personal weekly grid and daily agenda (showing course, student group, room, day, and period).
4. The published timetable is strictly **read-only**.

### B. Scheduling Requests (Single Unified Screen for Two Request Types)
1. Faculty opens **Scheduling Requests**.
2. This single screen provides a mode selector for **two request types** (which must remain on the same screen):
   - **Mode 1 — Mark Unavailability**:
     - Faculty selects unavailable day/date, affected period range, and enters a justification.
     - Backend identifies any existing assigned sessions overlapped by the unavailability window.
     - Faculty reviews the affected sessions and submits the notice, triggering the dynamic repair and Admin approval workflow.
   - **Mode 2 — Request Additional Session**:
     - Faculty selects course, session type (lecture/tutorial/lab), target student group, preferred day/period, duration, and reason.
     - Backend evaluates feasibility using deterministic constraint logic and returns conflict-free candidate slots.
     - Faculty reviews and submits the request for **Admin approval** prior to publication.

### C. Request Session Relocation
1. Faculty opens **Request Session Relocation**.
2. Selects one of their own existing assigned sessions and inspects the current slot and venue.
3. Specifies preferred replacement timing/venue and adds a reason.
4. Backend verifies constraints, uses the deterministic solver to generate candidate conflict-free alternatives, and validates proposals via the official validator.
5. Faculty submits the validated relocation proposal.
6. **Admin** reviews and approves or rejects. The published timetable updates only after Admin approval.

---

## FLOW 05 — Club Representative Workflow

After authentication, the **Club Representative** (`robotics.club@cit-schedora.test`, Organisation: `Robotics Club Demo`) is routed to **Submit Venue Request**.

The Club Representative workspace has **exactly two navigation destinations**, in this strict order:
1. **Submit Venue Request**
2. **My Venue Requests**

### A. Submit Venue Request
1. Club Representative opens **Submit Venue Request**, which offers two input modes:
   - **Mode 1 — Describe Your Event (Natural-Language AI Mode)**:
     - User describes the event in **English, Hindi, or Hinglish** (e.g., *"Bhai Thursday shaam 6 baje coding contest ke liye 60 logon ka computer lab chahiye, projector aur high-speed LAN bhi chahiye"*).
     - Shared Gemini (`gemini-3.8-flash`) orchestrator extracts `event_title`, `attendance`, `time_window`, `duration`, `required_room_type`, and `facilities`.
     - If critical parameters are missing or ambiguous, the assistant prompts a targeted follow-up question before submission.
     - Extracted fields populate an editable structured form for user review and confirmation.
   - **Mode 2 — Manual Booking Form**:
     - Direct structured form input that works 100% independently even when the Gemini API is unavailable or unconfigured.
2. Upon submission, the backend deterministically forces the effective booking category to `club_event` (the Club Representative cannot self-promote priority).
3. Deterministic booking engine evaluates venue eligibility and conflicts, routes the request into the authorised approval queue, and returns the real submission status.

### B. My Venue Requests
1. Club Representative opens **My Venue Requests**.
2. Backend returns **only** requests belonging to the authenticated Club Representative's account/organisation (strict tenant isolation — cannot view other clubs' private requests).
3. Selecting a request displays full event details, current status (`pending`, `approved`, `rejected`, `alternative_offered`, `cancelled`), the recorded decision reason, and any offered alternative venue/slot.
4. If a booking is eligible for cancellation, the user may cancel their own request after explicit confirmation. Backend records the cancellation and ensures cancelled requests are never approved.

---

## FLOW 06 — Shared AI Workflow (`LLMOrchestratorService`)

All four roles share a single, centralised backend Gemini integration (`gemini-3.8-flash`) whenever AI assistance is invoked:

| Capability | Allowed (Shared Gemini Orchestrator) | Strictly Forbidden (Deterministic Engine Only) |
| :--- | :--- | :--- |
| **Language Understanding** | Parse English, Hindi, and Hinglish natural-language requests | Decide whether a booking or timetable is valid |
| **Information Extraction** | Extract structured JSON fields (`title`, `headcount`, `day`, `periods`, `room_type`, `equipment`) | Override `role_category_cap` or promote user priority |
| **Ambiguity Resolution** | Ask follow-up clarification questions for vague/incomplete inputs | Modify institutional booking priority hierarchy |
| **Form Assistance** | Prefill editable structured frontend forms | Ignore room capacity, 50% exam rule, or lunch break |
| **Decision Intelligence** | Explain already-verified solver/validator outcomes in plain language | Approve requests, publish schedules, or apply repairs |

---

## FLOW 07 — Shared Request and Approval Lifecycle

Every operational request (Venue Booking, Lab Booking, Session Relocation, Additional Session, Faculty Unavailability, Dynamic Disruption Repair, Manual Allocation) traverses a deterministic, auditable 10-stage lifecycle:

```text
1. Request Created (Natural Language + Structured Confirmation OR Manual Form)
        │
        ▼
2. Authenticated User Verified (Session Cookie -> Database User, Role & Scope)
        │
        ▼
3. Structured Request Validation (Schema, Types, Time Bounds, Required Fields)
        │
        ▼
4. Institutional Rule Checks (Role Category Cap, Priority Weight, Scope, SoD)
        │
        ▼
5. Deterministic Feasibility Evaluation (OR-Tools / Constraint Engine / validator.py)
        │
        ▼
6. Authorised Approval Routing (Dept Lab -> Dept Coordinator; Curricular/Global -> Admin)
        │
        ▼
7. Approval / Rejection / Alternative Offered (Enforcing Requester != Approver)
        │
        ▼
8. Backend Persistence (Transactional Update in PostgreSQL)
        │
        ▼
9. Audit Record Written (Immutable Entry with Actor, Role, Timestamp, State Diff, Reason)
        │
        ▼
10. User Status Update (Reflected in Role Workspace & Canonical JSON Exports)
```

---

## Complete Website Module Map (Part 13)

| Role | Navigation Order | Module Name | Primary Backend Service Boundary |
| :--- | :---: | :--- | :--- |
| **Admin** | 1 | Dashboard (Admin Command Center) | `Readiness`, `Dataset`, `Timetable`, `Booking`, `Audit` |
| **Admin** | 2 | Timetable Management | `TimetableService`, `ValidationService` |
| **Admin** | 3 | Examination Scheduler | `ExaminationService`, `ValidationService` |
| **Admin** | 4 | Venue Bookings | `BookingService`, `LLMOrchestratorService` |
| **Admin** | 5 | Spectra Week | `BookingService`, `ReschedulingService` |
| **Admin** | 6 | Room Intelligence | `DatasetService`, `TimetableService`, `BookingService` |
| **Admin** | 7 | Dynamic Rescheduling | `ReschedulingService`, `ValidationService` |
| **Admin** | 8 | AI Scheduling Assistant | `LLMOrchestratorService`, `TimetableService` |
| **Admin** | 9 | Decision Intelligence | `AuditService`, `ValidationService`, `LLMOrchestratorService` |
| **Admin** | 10 | Manual Scheduling | `BookingService`, `ValidationService` |
| **Admin** | 11 | Reports & Exports | `ExportService`, `ValidationService` |
| **Admin** | 12 | Dataset Management | `DatasetService`, `AuditService` |
| **Admin** | 13 | User & Role Management | `AuthenticationService`, `AuthorizationService` |
| **Admin** | 14 | Audit Logs | `AuditService` |
| **Admin** | 15 | Settings | `AuthorizationService`, `AuditService` |
| **Dept Coordinator** | 1 | Department Event Bookings | `BookingService`, `AuthorizationService` |
| **Dept Coordinator** | 2 | Session Change Requests | `ReschedulingService`, `AuthorizationService` |
| **Dept Coordinator** | 3 | Department Lab Booking Approvals | `BookingService`, `AuthorizationService`, `AuditService` |
| **Faculty** | 1 | My Timetable | `TimetableService`, `AuthorizationService` |
| **Faculty** | 2 | Scheduling Requests (Unavailability + Extra Session) | `ReschedulingService`, `TimetableService` |
| **Faculty** | 3 | Request Session Relocation | `ReschedulingService`, `ValidationService` |
| **Club Representative** | 1 | Submit Venue Request (AI + Manual Modes) | `LLMOrchestratorService`, `BookingService` |
| **Club Representative** | 2 | My Venue Requests | `BookingService`, `AuthorizationService` |

---

## Judging and Evaluation Verification Plan (Part 14 — 100 Marks Rubric)

> **Note**: This section defines the future verification test plan aligned with the official 100-mark judging rubric. No marks or judging outcomes are claimed in this milestone.

| # | Criterion | Weight | Verification & Acceptance Test Plan |
| :-: | :--- | :---: | :--- |
| **1** | **Scheduling Correctness** | **25 Marks** | - Run deterministic solver on `cit_public.json`.<br>- Execute official `validator.py` on generated `exports/schedule.json`.<br>- Verify **0 hard-constraint violations** across curricular timetable, examination schedule (50% room capacity rule), and approved bookings. |
| **2** | **Rescheduling** | **15 Marks** | - Ingest `sample_disruption.json` (`faculty_unavailable`, `room_unavailable`, `add_faculty`, `add_session`, `remove_session`).<br>- Verify `0` hard violations after repair.<br>- Verify minimum-session-movement objective.<br>- Verify exact Before vs. After delta view and mandatory Admin approval before `exports/schedule_after.json` generation. |
| **3** | **Optimisation** | **10 Marks** | - Inspect actual soft-penalty score computed by `validator.py`.<br>- Confirm soft-penalty minimisation never compromises any hard constraint. |
| **4** | **Use of AI** | **15 Marks** | - Evaluate `sample_requests.md` against `LLMOrchestratorService` (`gemini-3.8-flash`):<br>  1. **Vague timings** (triggers follow-up clarification).<br>  2. **Conditional requirements** (accurately extracts constraints).<br>  3. **Priority abuse** (user claims "highest priority institute event" from a Club account -> backend enforces `club_event` cap).<br>  4. **English & Hinglish** (fluent entity extraction).<br>  5. **Rule-bypass attempts** (prompt injection asking AI to ignore capacity or approve directly -> blocked by deterministic engine). |
| **5** | **Booking Decisions** | **10 Marks** | - Verify `role_category_cap` enforcement per role.<br>- Verify strict 6-tier priority ordering (`Exams > Regular classes > Institute events > Guest lectures > Department events > Club events`).<br>- Verify earlier-submission (`submitted_at`) tie-breaking.<br>- Verify cancelled requests are never approved.<br>- Verify accurate rejection reasons and feasible alternative suggestions. |
| **6** | **Usability and Dashboard** | **10 Marks** | - Verify fast room search and filtering in Room Intelligence.<br>- Verify readable cohort, faculty, and room timetable matrices.<br>- Verify discoverable approval queues for Admin and Dept Coordinator.<br>- Verify strict role-scoped navigation upon login. |
| **7** | **UI and Design** | **10 Marks** | - Verify official CIT crest (`/assets/aistudio/cit_1.jpg_5064815d.png`) and unified Admin navigation bar consistency.<br>- Verify responsive desktop and mobile layouts.<br>- Verify proper loading, empty, validation, and controlled error states. |
| **8** | **Code and Documentation** | **5 Marks** | - Verify clean TypeScript/Node.js + Python modular repository setup.<br>- Verify `README.md`, `docs/ARCHITECTURE.md`, `docs/WEB_FLOW.md`, `docs/DEMO_ACCOUNTS.md`, plus `AI_USAGE.md` and `THIRD_PARTY.md` in final submission. |
