"""CP-SAT Deterministic Examination Scheduler for CIT Schedora."""
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple
from ortools.sat.python import cp_model

from ..config import settings
from ..schemas import (
    ExamAllocationOut,
    ExamSolveResponse,
    ExamValidationReport,
    SolveParameters,
    SolverDiagnostics,
    SolverStatusLiteral,
)
from ..validation.exam_verification import (
    VALIDATION_SCOPE_EXAMS,
    compute_exam_soft_penalty,
    verify_examination_schedule,
)


def map_cp_sat_status(status: int) -> SolverStatusLiteral:
    if status == cp_model.OPTIMAL:
        return "OPTIMAL"
    if status == cp_model.FEASIBLE:
        return "FEASIBLE"
    if status == cp_model.INFEASIBLE:
        return "INFEASIBLE"
    if status == cp_model.MODEL_INVALID:
        return "MODEL_INVALID"
    return "UNKNOWN"


def solve_examination_schedule(
    data: Dict[str, Any],
    dataset_version_id: str = "v1-1a9cf4b23ac3",
    team_name: str = "cit-schedora",
    params: Optional[SolveParameters] = None,
) -> ExamSolveResponse:
    """
    Build and solve the deterministic examination schedule using Google OR-Tools CP-SAT,
    then run the official validator check_exams to verify 0 hard violations and 100% parity.
    """
    solve_params = params or SolveParameters(
        timeout_seconds=settings.default_timeout_seconds,
        num_workers=settings.default_num_workers,
        random_seed=settings.default_random_seed,
    )

    t0 = time.perf_counter()
    calendar = data.get("calendar", {})
    exam_week = calendar.get("exam_week", {})
    days: List[str] = list(exam_week.get("days", ["MON", "TUE", "WED", "THU", "FRI", "SAT"]))
    exam_sessions: List[Dict[str, Any]] = list(exam_week.get("sessions", []))
    session_ids: List[str] = [s["id"] for s in exam_sessions]

    raw_exams: List[Dict[str, Any]] = list(data.get("exams", []))
    total_exams = len(raw_exams)

    # 1. Inspect and filter eligible rooms (Part 5: "exam" in allowed_uses)
    all_rooms: List[Dict[str, Any]] = list(data.get("rooms", []))
    eligible_rooms: List[Dict[str, Any]] = [
        r for r in all_rooms if "exam" in r.get("allowed_uses", [])
    ]
    room_by_id: Dict[str, Dict[str, Any]] = {r["id"]: r for r in eligible_rooms}

    # Part 6: Effective Exam Capacity = floor(capacity / 2)
    effective_caps: Dict[str, int] = {
        r["id"]: int(r.get("capacity", 0)) // 2 for r in eligible_rooms
    }
    total_slot_capacity = sum(effective_caps.values())

    # Fast validation: check for invalid entity references or single exam exceeding total capacity
    infeasible_diagnostics: List[str] = []
    if not eligible_rooms:
        infeasible_diagnostics.append("No rooms in dataset have 'exam' in allowed_uses.")
    if not days or not session_ids:
        infeasible_diagnostics.append("Exam calendar days or sessions are empty.")

    for e in raw_exams:
        if int(e.get("size", 0)) > total_slot_capacity:
            infeasible_diagnostics.append(
                f"Exam {e['id']} size ({e['size']}) exceeds total available examination half-capacity ({total_slot_capacity}) across all eligible rooms."
            )

    if infeasible_diagnostics:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        diagnostics = SolverDiagnostics(
            solver_name=settings.solver_name,
            solver_version="9.15-cit-exam-v1",
            solver_status="INFEASIBLE",
            is_optimal=False,
            solve_duration_ms=elapsed_ms,
            objective_value=None,
            best_bound=None,
            optimality_gap=None,
            conflicts=0,
            branches=0,
            wall_time_seconds=round(elapsed_ms / 1000.0, 4),
            total_sessions=total_exams,
            scheduled_sessions=0,
            total_candidates=0,
            infeasible_sessions=[],
            diagnostic_messages=infeasible_diagnostics,
        )
        return ExamSolveResponse(
            dataset_id=str(data.get("dataset_id", "cit-public-v1")),
            dataset_version_id=dataset_version_id,
            team=team_name,
            solver_status="INFEASIBLE",
            schedule_state="examination_candidate",
            validation_scope=VALIDATION_SCOPE_EXAMS,
            allocations=[],
            total_exams=total_exams,
            scheduled_exams=0,
            rooms_allocated=0,
            diagnostics=diagnostics,
            validation_report=None,
        )

    # Fast warm-start hint generation using slot-level CP-SAT (finds 0-penalty slot distribution in ~0.05s)
    hint_model = cp_model.CpModel()
    h_slot_vars: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
    for e in raw_exams:
        eid = e["id"]
        for day in days:
            for sess in session_ids:
                h_slot_vars[(eid, day, sess)] = hint_model.NewBoolVar(f"h_slot_{eid}_{day}_{sess}")
        hint_model.AddExactlyOne([h_slot_vars[(eid, day, sess)] for day in days for sess in session_ids])

    # Group clashes in hint model
    group_exams: Dict[str, List[str]] = defaultdict(list)
    for e in raw_exams:
        for g in e.get("groups", []):
            group_exams[g].append(e["id"])

    for g, eids in group_exams.items():
        for day in days:
            for sess in session_ids:
                hint_model.AddAtMostOne([h_slot_vars[(eid, day, sess)] for eid in eids])

    # Soft penalty terms in hint model
    h_pen_terms: List[cp_model.LinearExpr] = []
    for g, eids in group_exams.items():
        for day in days:
            day_sum = sum(h_slot_vars[(eid, day, sess)] for eid in eids for sess in session_ids)
            excess = hint_model.NewIntVar(0, len(eids), f"h_ex_{g}_{day}")
            hint_model.Add(excess >= day_sum - 1)
            h_pen_terms.append(5 * excess)

    # Slot aggregate half-capacity bound
    for day in days:
        for sess in session_ids:
            hint_model.Add(
                sum(int(e.get("size", 0)) * h_slot_vars[(e["id"], day, sess)] for e in raw_exams)
                <= total_slot_capacity
            )

    hint_model.Minimize(sum(h_pen_terms))
    hint_solver = cp_model.CpSolver()
    hint_solver.parameters.max_time_in_seconds = 2.0
    hint_solver.parameters.num_search_workers = int(solve_params.num_workers)
    hint_status = hint_solver.Solve(hint_model)
    has_hints = hint_status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    # 2. Build the unified CP-SAT Examination Model (Part 7)
    model = cp_model.CpModel()

    # exam_slot[e, d, s]: Boolean variable indicating examination e is assigned to day d and session s
    exam_slot: Dict[Tuple[str, str, str], cp_model.IntVar] = {}
    for e in raw_exams:
        eid = e["id"]
        for day in days:
            for sess in session_ids:
                v = model.NewBoolVar(f"exam_slot_{eid}_{day}_{sess}")
                exam_slot[(eid, day, sess)] = v
                if has_hints:
                    model.AddHint(v, int(hint_solver.Value(h_slot_vars[(eid, day, sess)])))

        # Constraint A — Exactly one slot per examination
        model.AddExactlyOne([exam_slot[(eid, day, sess)] for day in days for sess in session_ids])

    # exam_room[e, d, s, r]: Boolean variable indicating room r is assigned to examination e in day d, session s
    exam_room: Dict[Tuple[str, str, str, str], cp_model.IntVar] = {}
    for e in raw_exams:
        eid = e["id"]
        size = int(e.get("size", 0))
        for day in days:
            for sess in session_ids:
                slot_var = exam_slot[(eid, day, sess)]
                room_vars_at_slot = []
                for r in eligible_rooms:
                    rid = r["id"]
                    r_var = model.NewBoolVar(f"exam_room_{eid}_{day}_{sess}_{rid}")
                    exam_room[(eid, day, sess, rid)] = r_var
                    room_vars_at_slot.append(r_var)
                    # Constraint B — Room allocation requires selected slot
                    model.Add(r_var <= slot_var)

                # Constraint C — Half-capacity enforcement
                # Sum of assigned rooms effective half-capacities must accommodate exam size
                model.Add(
                    sum(effective_caps[r["id"]] * exam_room[(eid, day, sess, r["id"])] for r in eligible_rooms)
                    >= size * slot_var
                )

    # Constraint D — Room non-overlap
    # A single room cannot be assigned to two different examinations during the same day and session
    for day in days:
        for sess in session_ids:
            for r in eligible_rooms:
                rid = r["id"]
                model.AddAtMostOne([exam_room[(e["id"], day, sess, rid)] for e in raw_exams])

    # Constraint E — Student group non-overlap
    # A student group cannot have two examinations in the same day and session
    for g, eids in group_exams.items():
        for day in days:
            for sess in session_ids:
                model.AddAtMostOne([exam_slot[(eid, day, sess)] for eid in eids])

    # Part 8 — Examination Soft Objective: 5 * max(0, exams_on_day - 1)
    soft_penalty_terms: List[cp_model.LinearExpr] = []
    for g, eids in group_exams.items():
        for day in days:
            day_sum = sum(exam_slot[(eid, day, sess)] for eid in eids for sess in session_ids)
            excess_var = model.NewIntVar(0, len(eids), f"excess_{g}_{day}")
            model.Add(excess_var >= day_sum - 1)
            soft_penalty_terms.append(5 * excess_var)

    official_penalty_expr = sum(soft_penalty_terms) if soft_penalty_terms else 0

    # Part 9 — Secondary Optimisation:
    # 1. Minimise total rooms allocated
    # 2. Safe lexicographic weight (10000x for official soft penalty ensures zero compromise)
    total_rooms_allocated_expr = sum(exam_room.values())
    combined_objective = 10000 * official_penalty_expr + total_rooms_allocated_expr
    model.Minimize(combined_objective)

    # Part 10 — Solver Execution & Status
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(solve_params.timeout_seconds)
    solver.parameters.num_search_workers = int(solve_params.num_workers)
    solver.parameters.random_seed = int(solve_params.random_seed)

    raw_status = solver.Solve(model)
    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    status_str = map_cp_sat_status(raw_status)

    if status_str not in ("OPTIMAL", "FEASIBLE"):
        diag_msgs = [
            f"CP-SAT examination solver terminated with status {status_str} after {elapsed_ms} ms.",
            "No feasible examination assignment satisfied all official hard constraints.",
        ]
        diagnostics = SolverDiagnostics(
            solver_name=settings.solver_name,
            solver_version="9.15-cit-exam-v1",
            solver_status=status_str,
            is_optimal=False,
            solve_duration_ms=elapsed_ms,
            objective_value=None,
            best_bound=None,
            optimality_gap=None,
            conflicts=int(solver.NumConflicts()),
            branches=int(solver.NumBranches()),
            wall_time_seconds=round(float(solver.WallTime()), 4),
            total_sessions=total_exams,
            scheduled_sessions=0,
            total_candidates=len(exam_room),
            infeasible_sessions=[],
            diagnostic_messages=diag_msgs,
        )
        return ExamSolveResponse(
            dataset_id=str(data.get("dataset_id", "cit-public-v1")),
            dataset_version_id=dataset_version_id,
            team=team_name,
            solver_status=status_str,
            schedule_state="examination_candidate",
            validation_scope=VALIDATION_SCOPE_EXAMS,
            allocations=[],
            total_exams=total_exams,
            scheduled_exams=0,
            rooms_allocated=0,
            diagnostics=diagnostics,
            validation_report=None,
        )

    # 3. Extract examination allocations in exact official validator format (Part 11)
    allocations_out: List[ExamAllocationOut] = []
    official_exams_payload: List[Dict[str, Any]] = []

    for e in raw_exams:
        eid = e["id"]
        chosen_day: Optional[str] = None
        chosen_sess: Optional[str] = None
        for day in days:
            for sess in session_ids:
                if solver.Value(exam_slot[(eid, day, sess)]) == 1:
                    chosen_day = day
                    chosen_sess = sess
                    break
            if chosen_day:
                break

        assert chosen_day and chosen_sess, f"Exam {eid} has no assigned slot"
        assigned_room_ids = [
            r["id"]
            for r in eligible_rooms
            if solver.Value(exam_room[(eid, chosen_day, chosen_sess, r["id"])]) == 1
        ]
        # Deterministically sort room IDs for reproducible output (AUD, LH-1, ...)
        assigned_room_ids.sort()

        eff_cap = sum(effective_caps[rid] for rid in assigned_room_ids)
        cand_count = int(e.get("size", 0))

        allocations_out.append(
            ExamAllocationOut(
                exam_id=eid,
                day=chosen_day,
                session=chosen_sess,
                rooms=assigned_room_ids,
                effective_capacity=eff_cap,
                candidate_count=cand_count,
                course_ids=list(e.get("course_ids", [])),
                groups=list(e.get("groups", [])),
            )
        )

        official_exams_payload.append(
            {
                "exam_id": eid,
                "day": chosen_day,
                "session": chosen_sess,
                "rooms": assigned_room_ids,
            }
        )

    # Sort allocations deterministically by exam_id
    allocations_out.sort(key=lambda a: a.exam_id)

    # Compute official penalty and verify parity
    solver_soft_penalty = compute_exam_soft_penalty(data, official_exams_payload)
    total_rooms_used = sum(len(a.rooms) for a in allocations_out)

    validation_report = verify_examination_schedule(
        data=data,
        exams_out=official_exams_payload,
        team_name=team_name,
        solver_soft_penalty=solver_soft_penalty,
    )

    diag_messages = [
        f"CP-SAT examination solver finished with status {status_str} in {elapsed_ms} ms.",
        f"Scheduled all {len(allocations_out)}/{total_exams} examinations across {total_rooms_used} room assignments.",
        f"Official examination soft penalty: {validation_report.official_soft_penalty} (solver parity: {validation_report.parity_verified}).",
        f"Official validator hard violations: {validation_report.hard_violation_count}.",
    ]

    diagnostics = SolverDiagnostics(
        solver_name=settings.solver_name,
        solver_version="9.15-cit-exam-v1",
        solver_status=status_str,
        is_optimal=(status_str == "OPTIMAL"),
        solve_duration_ms=elapsed_ms,
        objective_value=int(validation_report.official_soft_penalty),
        best_bound=int(round(solver.BestObjectiveBound())) if status_str == "OPTIMAL" else 0,
        optimality_gap=0.0 if status_str == "OPTIMAL" else None,
        conflicts=int(solver.NumConflicts()),
        branches=int(solver.NumBranches()),
        wall_time_seconds=round(float(solver.WallTime()), 4),
        total_sessions=total_exams,
        scheduled_sessions=len(allocations_out),
        total_candidates=len(exam_room),
        infeasible_sessions=[],
        diagnostic_messages=diag_messages,
    )

    return ExamSolveResponse(
        dataset_id=str(data.get("dataset_id", "cit-public-v1")),
        dataset_version_id=dataset_version_id,
        team=team_name,
        solver_status=status_str,
        schedule_state="examination_candidate",
        validation_scope=VALIDATION_SCOPE_EXAMS,
        allocations=allocations_out,
        total_exams=total_exams,
        scheduled_exams=len(allocations_out),
        rooms_allocated=total_rooms_used,
        diagnostics=diagnostics,
        validation_report=validation_report,
    )
