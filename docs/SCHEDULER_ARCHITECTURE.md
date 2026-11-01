# CIT Schedora — Deterministic Weekly Timetable Scheduler Architecture

## 1. Overview & Infrastructure Boundary

- **Google Cloud / Firebase Project**: `cit-schedora`
- **Named Cloud Firestore Database**: `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9` (`asia-south1`, never `(default)`)
- **Cloud Run Solver Service**: `cit-schedora-solver` (`asia-south1`)
- **Active Dataset**: `cit-public-v1` (version `v1-1a9cf4b23ac3`, 189 teaching sessions, 25 rooms, 28 faculty, 12 student groups, 38 courses)
- **Validation Scope**: `WEEKLY TIMETABLE COMPONENT VALIDATION ONLY` (`scheduleState: "weekly_candidate"`)

## 2. Two-Service Architecture

1. **Node.js + TypeScript Backend (`server.ts`, `services/timetable.service.ts`, `routes/schedules.routes.ts`)**:
   - Enforces Firebase Authentication and Four-Role RBAC (`admin` required for generation and revalidation).
   - Loads the active versioned dataset directly from Firestore (`datasets/cit-public-v1/versions/v1-1a9cf4b23ac3/*`).
   - Invokes the private Python solver service over authenticated service-to-service HTTP (`X-Service-Authorization` / Bearer token).
   - Persists generated weekly candidate schedules into Firestore (`schedules/{scheduleId}`, `schedules/{scheduleId}/sessionAssignments/{sessionId}` in bounded batches `<= 150`, and `schedules/{scheduleId}/validationReports/{reportId}`).
   - Writes internal candidate artifact `artifacts/weekly_timetable_candidate.json`.
   - Records immutable institutional audit logs in `auditLogs/{auditId}`.

2. **Python CP-SAT Scheduling Microservice (`solver-service/`)**:
   - Built with **Python 3**, **Google OR-Tools CP-SAT** (`ortools.sat.python.cp_model`), **FastAPI**, and **Pydantic**.
   - **Domain Pruning (`candidate_generation.py`)**: Pre-filters valid `(day, start_period, room_id)` placements per session, pruning incompatible room types (`H6`), non-teaching rooms such as seminar halls and OAT (`allowed_uses`), insufficient capacity (`H5`), non-accessible rooms when required by session, faculty, or student group (`H10`), invalid periods/lunch crossings/lab start periods (`H9`), faculty unavailability (`H7`), room unavailability (`H8`), `fixed_slot` mismatches (`H14`), and unsynchronized basket slots (`H11`).
   - **CP-SAT Hard Constraints (`hard_constraints.py`)**: Enforces exact single assignment (`H1`), faculty non-overlap (`H2`), student group non-overlap with parallel basket deduplication (`H3`), room non-overlap (`H4`), synchronized elective baskets (`H11`), and faculty daily teaching limits (`H12`).
   - **CP-SAT Soft Objective (`soft_objective.py`)**: Minimizes `S1 + S2 + S3 + S4 + S5 + S6` with 100% mathematical parity with `validator.py`'s `soft_score(ctx, assign)`.
   - **Official Validator Verification (`official_validator.py` & `result_verification.py`)**: Runs the unmodified official `validator.py` (`Ctx`, `check_timetable`, `soft_score`) and verifies `hard_violation_count == 0` and `solver_soft_total == soft_total`.
