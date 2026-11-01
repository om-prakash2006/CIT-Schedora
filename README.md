# CIT Schedora — Institutional Campus Scheduling & Venue Management

**CIT Schedora** is the institutional academic scheduling, examination allocation, dynamic disruption rescheduling, and venue-management platform for **Chilika Institute of Technology (CIT)**.

All persistent data, collections, security rules, and file storage belong to the permanent Google Cloud / Firebase project **`cit-schedora`**.

---

## 1. Infrastructure & Architecture Summary

- **Firebase / Google Cloud Project ID**: `cit-schedora`
- **Cloud Firestore Database ID**: `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`
- **Database Region**: `asia-south1` (Mumbai)
- **Cloud Storage Bucket**: `cit-schedora.firebasestorage.app`
- **Active Dataset**: `cit-public-v1` (version `v1-1a9cf4b23ac3`)
- **Deterministic Weekly Timetable Engine (Phase 4A)**:
  - **Private Solver Service**: `solver-service/` (`cit-schedora-solver`, `asia-south1`) powered by **Python 3**, **Google OR-Tools CP-SAT**, **FastAPI**, and **Pydantic**.
  - **Hard Constraints Enforced**: `H1`–`H12` and `H14` (189 sessions scheduled, zero clashes, room capacity/type/allowed-use compliance, `P1`–`P9` teaching periods, protected `13:00–14:00` lunch after `P5`, labs starting only at `P2`/`P6`, accessibility, elective basket synchronization, max 4 faculty hours/day, and fixed slots).
  - **Soft Objective Minimized**: `S1`–`S6` with 100% parity verified against the unmodified official `validator.py`.
  - **Validation Scope**: Stored as `scheduleState: "weekly_candidate"` (`WEEKLY TIMETABLE COMPONENT VALIDATION ONLY`).
- **Deterministic Examination Scheduling Engine (Phase 4B)**:
  - **Solver Extension**: CP-SAT model in `solver-service/app/solver/exam_solver.py` scheduling all 41 midsemester examinations across 6 days (`MON`–`SAT`) and 2 sessions (`AM`/`PM`).
  - **Hard Constraints Enforced**: Exact slot assignment (Constraint A), room-slot coupling (Constraint B), integer floor 50% room capacity with multi-room splitting for cohorts exceeding single-room capacity (Constraint C), room non-overlap (Constraint D), student cohort non-overlap (Constraint E), calendar domain (Constraint F), eligible examination rooms with `"exam"` in `allowed_uses` only (Constraint G).
  - **Soft Objective Minimized**: Student groups with >1 exam per day penalty ($5 \times \max(0, \text{exams} - 1)$) achieving **0 soft penalty** with 100% parity verified against official `validator.py check_exams`.
  - **Validation Scope**: Stored as `scheduleState: "examination_candidate"` (`EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY`).
- **Authentication & Four-Role RBAC (Phase 3)**:
  - **Provider**: Firebase Authentication with Email/Password (`firebase/auth` Web SDK + `firebase-admin/auth` Admin SDK).
  - **Session Handling**: 12-hour HTTP-only Firebase Session Cookie (`cit_schedora_session`) paired with CSRF protection (`cit_schedora_csrf`) and live Firestore `users/{uid}` status + `authorizationVersion` validation.
  - **Roles**: `admin`, `department_coordinator`, `faculty`, and `club`.
- **Firestore Security Rules (`firestore.rules`)**:
  Restrictive, role-scoped rules with default deny, zero public access, and Separation-of-Duties enforcement, validated via `@firebase/eslint-plugin-security-rules` and deployed to `cit-schedora`.

---

## 2. Environment Variables

Copy `.env.example` to `.env` for local development. Never commit real secrets to source control. Real secrets (`GEMINI_API_KEY`, `SESSION_SECRET`) must be configured in **AI Studio Secrets**.

```env
APP_ENV=development
FIREBASE_PROJECT_ID=cit-schedora
FIRESTORE_DATABASE_ID=ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9
GEMINI_MODEL=gemini-3.8-flash
DEMO_SEED_ENABLED=false
GEMINI_API_KEY=
SOLVER_SERVICE_URL=http://127.0.0.1:8001
SOLVER_TIMEOUT_SECONDS=30
```

---

## 3. Core API Endpoints

### Weekly Timetable Scheduling (`/api/v1/schedules`)
- `POST /api/v1/schedules/weekly/generate` (Admin only) — Invokes the private Python OR-Tools CP-SAT solver on the active Firestore dataset (`cit-public-v1`), verifies 0 hard violations and 100% soft-penalty parity with `validator.py`, and persists `schedules/{scheduleId}`, `sessionAssignments`, and `validationReports`.
- `GET /api/v1/schedules` — Lists persisted schedules ordered by `generatedAt` descending.
- `GET /api/v1/schedules/:scheduleId` — Returns schedule metadata, all 189 `sessionAssignments`, and the latest `validationReport`.
- `GET /api/v1/schedules/:scheduleId/validation` — Returns the latest weekly validator report (`WEEKLY TIMETABLE COMPONENT VALIDATION ONLY`).
- `POST /api/v1/schedules/:scheduleId/revalidate` (Admin only) — Re-runs the official `validator.py` on the stored `sessionAssignments` and persists a new validation report.

### Examination Scheduling (`/api/v1/examinations`)
- `POST /api/v1/examinations/generate` (Admin only) — Invokes the private Python OR-Tools CP-SAT midsemester examination solver, enforces 50% floor capacity and multi-room splitting, verifies 0 hard violations and parity with `validator.py check_exams`, and persists to `examinationSchedules/{examScheduleId}`, subcollections `examAllocations` and `validationReports`, and candidate artifact `artifacts/examination_timetable_candidate.json`.
- `GET /api/v1/examinations` — Lists persisted examination schedules ordered by `generationTimestamp` descending.
- `GET /api/v1/examinations/:examScheduleId` — Returns schedule metadata, all 41 `examAllocations`, and the latest `validationReport`.
- `GET /api/v1/examinations/:examScheduleId/validation` — Returns the latest examination validation report (`EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY`).
- `POST /api/v1/examinations/:examScheduleId/revalidate` (Admin only) — Re-executes official `validator.py check_exams` and stores a new validation report.

### Gemini AI Orchestrator (`/api/v1/ai`)
- `GET /api/v1/ai/status` — Returns AI service readiness status, active model (`gemini-3.8-flash`), and manual fallback availability without exposing secrets.
- `POST /api/v1/ai/venue-requests/parse` — Multilingual (English/Hindi/Hinglish) venue booking request parser. Extracts event title, attendance, time windows, room types, and equipment needs into editable Zod-validated drafts. Detects prompt injections and asks polite clarification questions.
- `POST /api/v1/ai/faculty-requests/parse` — Natural-language faculty scheduling assistant supporting `mark_unavailability`, `request_additional_session`, and `relocate_session`. Identifies affected sessions using authenticated faculty context.
- `POST /api/v1/ai/conversations/turn` — Multi-turn conversational clarification API maintaining bounded turn history and draft updates.
- `POST /api/v1/ai/decisions/explain` — Evidence-grounded explanation service generating plain-language explanations strictly from recorded backend decision docs and validator logs.

### Authentication & RBAC (`/api/v1/auth`, `/api/v1/users`, `/api/v1/rbac`, `/api/v1/audit-logs`)
- `POST /api/v1/auth/sessionLogin`, `POST /api/v1/auth/sessionLogout`, `GET /api/v1/auth/me`, `POST /api/v1/auth/sessionRefresh`
- `GET /api/v1/users`, `PATCH /api/v1/users/:uid/status`, `PATCH /api/v1/users/:uid/role`, `POST /api/v1/users/:uid/revoke-sessions`
- `GET /api/v1/audit-logs`

---

## 4. Development, Testing & Verification Commands

```bash
# Run Python CP-SAT solver unit, adversarial & 189-session dataset test suite
PYTHONPATH=solver-service python3 -m pytest solver-service/app/tests -v

# Run Node.js backend, Firestore, dataset, 20-case RBAC & live solver integration test suite
npm test

# Validate Firestore Security Rules
npx eslint firestore.rules

# Typecheck & build
npm run lint
npm run build
```
