# CIT Schedora — Deterministic Weekly Timetable Solver Service (`cit-schedora-solver`)

Private Python scheduling microservice powered by **Google OR-Tools CP-SAT** (`ortools.sat.python.cp_model`), **FastAPI**, and **Pydantic**.

## Infrastructure & Security Boundary

- **Google Cloud Project**: `cit-schedora`
- **Cloud Run Service Name**: `cit-schedora-solver`
- **Region**: `asia-south1` (Mumbai)
- **Ingress Policy**: Private internal service only (`--no-allow-unauthenticated`). Only the CIT Schedora Node.js backend may invoke `/internal/v1/*` endpoints using authenticated service-to-service headers (`X-Service-Authorization` / Google Cloud IAM identity token).

## Hard Constraints Enforced (H1–H12, H14)

- **H1**: All 189 teaching sessions scheduled exactly once; no duplicates, omissions, or unknown IDs.
- **H2**: Faculty non-overlap across full session duration.
- **H3**: Student group non-overlap across full session duration (combined sessions apply to all listed groups; parallel sessions in the same `basket_slot` share one attendance slot).
- **H4**: Room non-overlap across full session duration.
- **H5**: Room capacity `>= session.size` (full room capacity).
- **H6**: Room type in `session.room_types` and `"class" in room.allowed_uses` (excludes seminar halls and OAT from regular classes).
- **H7**: Faculty unavailability windows (`(day, period)`).
- **H8**: Room maintenance / unavailability windows (`(day, period)`).
- **H9**: Teaching periods `P1`..`P9` (`MON`..`FRI`), no session crosses lunch after `P5`, and 3-hour labs (`kind == "lab"`) start only at `P2` or `P6`.
- **H10**: Accessibility (`session.needs_accessible`, faculty `needs_accessible`, or student group `needs_accessible` requires `room.accessible == True`).
- **H11**: Elective basket synchronization (`BASKET-1`, `BASKET-2`): all sessions in a basket share the exact same `(day, start_period)` and use distinct rooms.
- **H12**: Faculty daily teaching limit (`<= max_hours_per_day`, default `4`).
- **H14**: Fixed slot preservation (`session.fixed_slot`).

## Soft Penalties Minimized (S1–S6)

- **S1**: Faculty avoid preferences (`+2` per affected teaching hour).
- **S2**: Student group free periods (`+1` per unoccupied period between first and last class of the day).
- **S3**: More than 6 teaching hours in a day for a student group (`+3` per hour above 6, deduplicating elective baskets).
- **S4**: Repeated lectures of the same course on the same day (`+3 * (c - 1)` for non-basket lectures and basket courses).
- **S5**: Room underutilisation (`+1` per session when `session.size / room.capacity < 0.4`).
- **S6**: Period `P9` usage (`+1` per session occupying `P9`).

## Running Automated Tests

```bash
pytest app/tests -v
```
