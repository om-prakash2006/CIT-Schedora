# CIT Schedora — System & Backend Architecture

## 1. Executive Summary

**CIT Schedora** is the institutional campus scheduling, examination allocation, dynamic disruption rescheduling, and venue-management platform for **Chilika Institute of Technology (CIT)**.

All infrastructure and persistent institutional data belong permanently to the existing Google Cloud / Firebase project:
- **Project ID**: `cit-schedora`
- **Firestore Database ID**: `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`
- **Database Region**: `asia-south1` (Mumbai)
- **Cloud Storage Bucket**: `cit-schedora.firebasestorage.app`

The platform enforces a strict architectural separation between:
1. **Presentation Layer**: React 19 + TypeScript + Tailwind CSS frontend (Google Stitch-designed institutional interfaces with a unified top/sidebar navigation bar and official CIT emblem).
2. **Core Application Backend**: Node.js + Express + TypeScript modular API server enforcing authentication, role-based access control (RBAC), request lifecycle state machines, audit logging, and subsystem orchestration.
3. **Persistence Layer (`cit-schedora` Cloud Firestore & Cloud Storage)**: Centralised Cloud Firestore database across 22 normalized collections and Cloud Storage for uploaded dataset files, disruption files, and generated schedule exports (`schedule.json`, `schedule_after.json`), protected by restrictive Firestore Security Rules (`firestore.rules`).
4. **Deterministic Scheduling & Validation Engine**: Dedicated Python service utilizing Google OR-Tools and the organiser-provided `validator.py` as the sole authoritative source of scheduling truth.
5. **Shared AI Orchestration Layer**: Server-side Google Gemini API (`gemini-3.8-flash`) integration via `services/gemini.service.ts` for English/Hindi/Hinglish natural-language extraction, follow-up clarification, and plain-language explanation of verified deterministic outcomes.

---

## 2. High-Level System Architecture Diagram

```text
+-----------------------------------------------------------------------------------+
|                        CLIENT BROWSER (Same-Origin SPA)                           |
|  React 19 + TypeScript + Tailwind CSS (Stitch Design System + Official CIT Logo)  |
|  - Unified Login Screen (No Role Selector)                                        |
|  - Role Workspaces: Admin (15) | Dept Coordinator (3) | Faculty (3) | Club (2)    |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | HTTPS / Same-Origin JSON API (/api/v1/*)
                                          | Secure HTTP-Only Session Cookie
                                          v
+-----------------------------------------------------------------------------------+
|                   NODE.JS + TYPESCRIPT APPLICATION BACKEND                        |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Middleware Pipeline                                                         |  |
|  | [Request ID & Safe Logger] -> [Same-Origin & Security Headers]              |  |
|  | -> [JSON Parser & Size Limit] -> [Session Auth & 4-Role RBAC]               |  |
|  +--------------------------------------+--------------------------------------+  |
|                                         |                                         |
|  +--------------------------------------v--------------------------------------+  |
|  | Versioned API Controllers (/api/v1/*)                                       |  |
|  | - /health, /readiness (Operational — Real Firestore & Gemini Boundary)      |  |
|  | - /auth, /datasets, /timetables, /exams, /bookings, /rescheduling,          |  |
|  |   /assistant, /manual-scheduling, /reports, /users, /audit, /settings       |  |
|  +--------------------------------------+--------------------------------------+  |
|                                         |                                         |
|  +--------------------------------------v--------------------------------------+  |
|  | Modular Application Services (/services/*)                                  |  |
|  | - firebase.service.ts   - gemini.service.ts      - auth.service.ts          |  |
|  | - DatasetService        - BookingService         - ValidationService        |  |
|  | - AuthenticationService - TimetableService       - LLMOrchestratorService   |  |
|  | - AuthorizationService  - ExaminationService     - AuditService             |  |
|  | - ReschedulingService   - ExportService          - NotificationService      |  |
|  +--------+-----------------------------+-----------------------------+--------+  |
+-----------|-----------------------------|-----------------------------|-----------+
            |                             |                             |
            | Firebase Admin SDK          | Controlled Server-to-Server | Server-Side SDK
            v                             v                             v
+-----------------------+   +---------------------------+   +-----------------------+
|   GOOGLE FIREBASE     |   | PYTHON SCHEDULING ENGINE  |   |   GOOGLE GEMINI API   |
|  Project: cit-schedora|   |                           |   |  (gemini-3.8-flash)   |
|  Region: asia-south1  |   | - Google OR-Tools Solver  |   |                       |
|                       |   |   (Timetable, Exam,       |   | - English / Hinglish  |
| - Cloud Firestore     |   |    Minimal-Move Repair)   |   |   Intent Extraction   |
|   (22 Collections)    |   | - Official validator.py   |   | - Structured JSON     |
| - Cloud Storage       |   |   (Final Source of Truth) |   |   Schema Output       |
|   (Datasets, Exports) |   | - Hard Constraints &      |   | - Clarification Qs    |
| - Restrictive Rules   |   |   Soft Penalty Evaluator  |   | - Decision Explainer  |
+-----------------------+   +---------------------------+   +-----------------------+
```

---

## 3. Firebase Infrastructure (`cit-schedora`) & 22 Firestore Collections

### 3.1 Central Project Ownership
All structured application data and file artifacts reside inside the permanent project `cit-schedora`. No external PostgreSQL, Supabase, or MongoDB instances are used, and the obsolete `DATABASE_URL` variable has been removed.

### 3.2 Canonical 22 Firestore Collections
Prepared and governed by `/firebase-blueprint.json`, `/firestore.rules`, and `FIRESTORE_COLLECTIONS` in `/services/firebase.service.ts`:
1. `users` — Institutional user accounts, roles (`admin`, `department_coordinator`, `faculty`, `club`), and scope bindings (`departmentId`, `facultyId`, `organisationName`).
2. `datasets` — Canonical dataset version metadata and Cloud Storage object references.
3. `rooms` — Campus rooms, laboratories, capacities, and maintenance schedules.
4. `faculty` — Institutional faculty inventory and teaching constraints.
5. `studentGroups` — Academic student cohorts and group sizes.
6. `courses` — Curricular courses and session requirements.
7. `sessions` — Curricular lecture/tutorial/lab sessions.
8. `bookingRequests` — Venue booking requests, raw natural-language text, priority category caps, and lifecycle status.
9. `bookingDecisions` — Deterministic venue booking decisions, explanations, and offered alternatives.
10. `schedules` — Weekly timetable versions and validation metrics.
11. `examinations` — Examination definitions, 50% capacity allocations, and Mon–Sat AM/PM slots.
12. `unavailabilityRequests` — Faculty unavailability windows.
13. `additionalSessionRequests` — Faculty requests for extra tutorial/lecture sessions.
14. `sessionChangeRequests` — Faculty/Coordinator session relocation requests.
15. `departmentBookingApprovals` — Department Coordinator laboratory booking approvals.
16. `rescheduleProposals` — Minimum-movement disruption repair proposals.
17. `disruptionRecords` — Uploaded operational disruption descriptors and metadata.
18. `manualAllocations` — Admin-authored manual slot overrides validated by `validator.py`.
19. `approvalRecords` — Separation-of-Duties (`requesterUserId !== approverUserId`) approval records.
20. `auditLogs` — Immutable institutional audit trail.
21. `systemSettings` — Institutional governance settings and booking priority hierarchy.
22. `exportRecords` — Metadata and Cloud Storage pointers for `schedule.json` and `schedule_after.json`.

### 3.3 Cloud Storage (`cit-schedora.firebasestorage.app`)
Used for large raw artifacts while keeping metadata indexed in Firestore:
- Uploaded canonical dataset files (`cit_public.json`).
- Uploaded disruption scenario files (`disruption_sample.json`).
- Generated `exports/schedule.json` and `exports/schedule_after.json`.
- Audit/report export packages.

### 3.4 Restrictive Firestore Security Rules (`firestore.rules`)
- Default deny (`match /{document=**} { allow read, write: if false; }`).
- Zero public read/write access; unauthenticated access is completely blocked.
- Strict schema, type, string-length, and immutability validation on every collection.
- Separation-of-Duties (`requesterUserId != approverUserId`) enforced on `approvalRecords` and `departmentBookingApprovals`.
- Validated with `@firebase/eslint-plugin-security-rules` (0 errors, 0 warnings) and deployed to `cit-schedora`.

---

## 4. Shared Gemini LLM Orchestration Boundary (`services/gemini.service.ts`)

- **Model**: `gemini-3.8-flash` (configured via `GEMINI_MODEL`).
- **Secret Management**:
  - Read exclusively on the server from `process.env.GEMINI_API_KEY` (injected via AI Studio Secrets).
  - Never exposed to React components, browser bundles, `.env.example`, or logs.
- **Permitted Responsibilities**:
  - Parse English, Hindi, and Hinglish natural-language venue booking or session change requests into strict JSON schemas.
  - Identify missing required fields and generate targeted clarification questions.
  - Generate plain-language explanations of already-verified deterministic solver decisions.
- **Strict Prohibitions**:
  - Gemini never determines scheduling validity, never approves or rejects requests, and never bypasses `validator.py` or hard constraints.

---

## 5. Phase 3 Authentication, Session Handling & Four-Role RBAC Architecture

- **Firebase Authentication (`cit-schedora`)**:
  - Uses Email/Password authentication exclusively (`firebase/auth` Web SDK + `firebase-admin/auth` Admin SDK).
  - Never stores passwords, password hashes, tokens, or session cookies in Cloud Firestore.
- **Firestore Profile Separation (`users/{uid}`)**:
  - Authoritative institutional profile stored in `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`:
    `uid`, `email`, `displayName`, `role` (`admin` | `department_coordinator` | `faculty` | `club`), `departmentId`, `facultyId`, `clubId`, `accountStatus` (`active` | `suspended` | `disabled`), `authorizationVersion`, `createdAt`, `updatedAt`.
- **12-Hour HTTP-Only Session Cookie & CSRF Protection**:
  - `POST /api/v1/auth/sessionLogin` verifies the Firebase ID token via Admin SDK (`verifyIdToken`), checks `cit-schedora` project audience, recent login (`<= 5 minutes`), and active Firestore `users/{uid}` status, then issues an HTTP-only `cit_schedora_session` cookie (12-hour TTL) and `cit_schedora_csrf` token.
  - Client-side Firebase tokens are cleared immediately after session cookie creation (`signOut` + `inMemoryPersistence`).
- **Reusable RBAC Middleware (`middleware/auth.middleware.ts`)**:
  - `requireAuthentication`: Verifies session cookie, active `accountStatus`, and matching `authorizationVersion`.
  - `requireRole(...roles)`: Enforces role-level route access.
  - `requireDepartmentScope`: Enforces department isolation (`CSE` Coordinator cannot access `ECE`).
  - `requireFacultyOwnership`: Enforces personal faculty isolation (`F01` Faculty cannot access `F02`).
  - `requireClubOwnership`: Enforces club request ownership (`robotics_club_demo` cannot access `music_society_demo`).
  - `requireAdminApprovalAuthority` & `enforceSeparationOfDuties`: Prevents self-approval (`requesterUid !== approverUid`) across all roles, including Admin.
- **Last Active Admin Protection**:
  - Prevents suspending, disabling, or demoting the last active `admin` account (`409 LAST_ADMIN_PROTECTED`).

---

## 6. Main Directory Structure

```text
/
├── firebase-applet-config.json        # Provisioned cit-schedora client config
├── firebase-blueprint.json            # Schema blueprint for all Firestore collections
├── firestore.rules                    # Deployed restrictive Firestore Security Rules
├── server.ts                          # Root runtime delegator for AI Studio dev/start scripts
├── scripts/
│   ├── import-official-dataset.ts     # Idempotent official dataset importer (cit_public.json)
│   └── seed-demo-accounts.ts          # Explicit idempotent demo account seeder (DEMO_SEED_ENABLED=true)
├── server/
│   ├── index.ts                       # Server bootstrap (Express + Vite middleware integration)
│   └── app.ts                         # Express application factory
├── config/
│   └── env.ts                         # Centralised environment config (cit-schedora & named DB)
├── middleware/
│   ├── auth.middleware.ts             # Reusable Phase 3 authentication, RBAC & SoD middleware
│   ├── security.ts                    # Same-origin & security headers middleware
│   └── error-handler.ts               # Centralised error handler
├── routes/
│   ├── index.ts                       # Versioned /api/v1 router aggregator
│   ├── health.routes.ts               # GET /api/v1/health and GET /api/v1/readiness
│   ├── auth.routes.ts                 # sessionLogin, sessionLogout, me, sessionRefresh
│   ├── rbac.routes.ts                 # Users, audit-logs, and role/scope-isolated RBAC routes
│   └── datasets.routes.ts             # Active dataset & protected Admin validation/import routes
├── services/
│   ├── index.ts                       # Subsystem readiness inspector & service boundaries
│   ├── firebase.service.ts            # Firebase Admin & runtime Firestore connection
│   ├── firebase-auth-emulator.service.ts # Identity Toolkit / SecureToken wire protocol service
│   ├── auth.service.ts                # Firebase Auth + Firestore users/{uid} & session management
│   ├── audit.service.ts               # Immutable Firestore auditLogs service with redaction
│   ├── dataset.service.ts             # Canonical dataset validation & Firestore batch ingestion
│   └── gemini.service.ts              # Shared server-side Gemini (gemini-3.8-flash) boundary
├── src/
│   ├── context/AuthContext.tsx        # Firebase Auth Email/Password + HTTP-only session context
│   └── pages/auth/LoginPage.tsx       # Unified CIT Schedora Sign In page
└── tests/
    └── health.test.ts                 # Automated Phase 1, Phase 2 & 20-case Phase 3 security tests
```

