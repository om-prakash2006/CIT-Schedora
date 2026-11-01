import json
import os
import time
from typing import Any, Dict, List, Tuple
from ortools.sat.python import cp_model

from validator import apply_disruption, run as run_validator
from .candidate_generation import generate_candidates
from .hard_constraints import add_hard_constraints
from .soft_objective import add_soft_objective

def solve_rescheduling(
    raw_dataset: Dict[str, Any],
    disruption: Dict[str, Any],
    baseline_sessions: List[Dict[str, Any]],
    solver_timeout_seconds: float = 15.0
) -> Dict[str, Any]:
    # 1. Apply disruption to baseline dataset
    disrupted_data = apply_disruption(raw_dataset, disruption)

    # 2. Build candidate placements for disrupted dataset
    cand_result = generate_candidates(disrupted_data)

    if cand_result.infeasible_sessions:
        return {
            "status": "INFEASIBLE",
            "is_valid": False,
            "sessions": [],
            "error": f"Infeasible candidate domains for sessions: {cand_result.infeasible_sessions}",
            "stability": {"sessions_moved": 0, "time_changed": 0, "room_only_changed": 0, "moved_ids": []},
            "validation_report": None,
        }

    # 3. Create CP-SAT model and add all hard constraints
    model = cp_model.CpModel()
    artifacts = add_hard_constraints(model, disrupted_data, cand_result)

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    bookings_cand_path = os.path.join(repo_root, "artifacts/spectra_week_bookings_candidate.json")
    sched_export_path = os.path.join(repo_root, "exports/schedule.json")
    weekly_cand_path = os.path.join(repo_root, "artifacts/weekly_timetable_candidate.json")
    exam_cand_path = os.path.join(repo_root, "artifacts/examination_timetable_candidate.json")

    # Load fest week bookings if candidate file exists to prevent H13 (booking vs session collision)
    fest_week_bookings = []
    if os.path.exists(bookings_cand_path):
        try:
            with open(bookings_cand_path, "r") as f:
                cand = json.load(f)
                raw_b = cand.get("official_fest_week", {}).get("bookings", cand.get("decisions", []))
                for b in raw_b:
                    if isinstance(b, dict):
                        b_dict = dict(b)
                        if "request_id" not in b_dict and "requestId" in b_dict:
                            b_dict["request_id"] = b_dict["requestId"]
                        if "request_id" in b_dict:
                            fest_week_bookings.append(b_dict)
        except Exception:
            pass

    forbidden_booking_slots = set()
    for b in fest_week_bookings:
        if b.get("status") == "approved":
            b_day = b.get("day")
            b_room = b.get("room_id")
            sp = int(b.get("start_period", 1))
            ep = int(b.get("end_period", sp))
            for p in range(sp, ep + 1):
                forbidden_booking_slots.add((b_day, p, b_room))

    if forbidden_booking_slots:
        for sid, cand_pairs in artifacts.session_vars.items():
            for cand, var in cand_pairs:
                overlaps = False
                for p in range(cand.start_period, cand.start_period + cand.duration):
                    if (cand.day, p, cand.room_id) in forbidden_booking_slots:
                        overlaps = True
                        break
                if overlaps:
                    model.Add(var == 0)

    # 4. Map baseline assignments
    valid_baseline = any(s.get("day") and s.get("room_id") for s in baseline_sessions)
    if not valid_baseline:
        if os.path.exists(sched_export_path):
            try:
                with open(sched_export_path, "r") as f:
                    baseline_sessions = json.load(f).get("sessions", [])
            except Exception:
                pass
        elif os.path.exists(weekly_cand_path):
            try:
                with open(weekly_cand_path, "r") as f:
                    baseline_sessions = json.load(f).get("sessions", [])
            except Exception:
                pass

    baseline_map: Dict[str, Tuple[str, int, str]] = {}
    for s in baseline_sessions:
        sid = s.get("session_id") or s.get("id")
        if sid and s.get("day") and s.get("start_period") and s.get("room_id"):
            baseline_map[sid] = (s.get("day"), s.get("start_period"), s.get("room_id"))

    # 5. Build minimum-movement objective terms & pin undisturbed sessions to valid baseline slots
    movement_terms = []

    for sid, cand_pairs in artifacts.session_vars.items():
        baseline = baseline_map.get(sid)
        if baseline:
            b_day, b_start, b_room = baseline
            exact_valid_vars = [
                var
                for cand, var in cand_pairs
                if cand.day == b_day
                and cand.start_period == b_start
                and cand.room_id == b_room
                and not any(
                    (cand.day, p, cand.room_id) in forbidden_booking_slots
                    for p in range(cand.start_period, cand.start_period + cand.duration)
                )
            ]
            if exact_valid_vars:
                model.Add(exact_valid_vars[0] == 1)
            else:
                for cand, var in cand_pairs:
                    if cand.day != b_day or cand.start_period != b_start:
                        movement_terms.append(100 * var)
                    elif cand.room_id != b_room:
                        movement_terms.append(25 * var)

    # Add soft constraint objective with low weight
    soft_artifacts = add_soft_objective(model, disrupted_data, artifacts)

    # Combined objective: minimize movement (high weight) + soft penalty (low weight)
    model.Minimize(cp_model.LinearExpr.Sum(movement_terms) + soft_artifacts.total_expr)

    # 6. Solve model
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_timeout_seconds
    solver.parameters.num_search_workers = 8

    t0 = time.perf_counter()
    raw_status = solver.Solve(model)
    status_str = solver.StatusName(raw_status)

    if raw_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": status_str,
            "is_valid": False,
            "sessions": [],
            "error": f"Rescheduling CP-SAT solver returned {status_str}",
            "stability": {"sessions_moved": 0, "time_changed": 0, "room_only_changed": 0, "moved_ids": []},
            "validation_report": None,
        }

    # 7. Extract solution
    assigned_sessions = []
    moved_ids = []
    time_changed_count = 0
    room_only_changed_count = 0

    sessions_by_id = {s["id"]: s for s in disrupted_data.get("sessions", [])}

    for sid, cand_pairs in artifacts.session_vars.items():
        s_meta = sessions_by_id.get(sid, {})
        for cand, var in cand_pairs:
            if solver.BooleanValue(var):
                assigned_sessions.append({
                    "session_id": sid,
                    "day": cand.day,
                    "start_period": cand.start_period,
                    "room_id": cand.room_id,
                    "duration": cand.duration,
                    "course_id": s_meta.get("course_id"),
                    "kind": s_meta.get("kind"),
                    "faculty_id": s_meta.get("faculty_id"),
                    "groups": list(s_meta.get("groups", [])),
                    "basket_slot": s_meta.get("basket_slot"),
                })

                baseline = baseline_map.get(sid)
                if baseline:
                    b_day, b_start, b_room = baseline
                    if cand.day != b_day or cand.start_period != b_start:
                        moved_ids.append(sid)
                        time_changed_count += 1
                    elif cand.room_id != b_room:
                        moved_ids.append(sid)
                        room_only_changed_count += 1
                break

    # Load exam allocations if candidate file exists
    exam_allocations = []
    if os.path.exists(exam_cand_path):
        try:
            with open(exam_cand_path, "r") as f:
                exam_allocations = json.load(f).get("allocations", [])
        except Exception:
            pass

    # Load fest week bookings if candidate file exists
    fest_week_bookings = []
    if os.path.exists(bookings_cand_path):
        try:
            with open(bookings_cand_path, "r") as f:
                cand = json.load(f)
                raw_b = cand.get("official_fest_week", {}).get("bookings", cand.get("decisions", []))
                fest_week_bookings = []
                for b in raw_b:
                    if isinstance(b, dict):
                        b_dict = dict(b)
                        if "request_id" not in b_dict and "requestId" in b_dict:
                            b_dict["request_id"] = b_dict["requestId"]
                        if "request_id" in b_dict:
                            fest_week_bookings.append(b_dict)
        except Exception:
            pass

    # Build schedule object for validator
    sched_obj = {
        "dataset_id": disrupted_data.get("dataset_id", "cit-public-v1"),
        "team": "cit-schedora",
        "sessions": assigned_sessions,
        "exams": exam_allocations,
        "fest_week": {
            "session_overrides": [],
            "bookings": fest_week_bookings,
        },
    }

    # Validate with official validator.py against disrupted dataset & baseline schedule
    val_report = run_validator(
        disrupted_data,
        sched_obj,
        baseline={
            "sessions": baseline_sessions,
            "exams": exam_allocations,
            "fest_week": {
                "session_overrides": [],
                "bookings": fest_week_bookings,
            },
            "dataset_id": "cit-public-v1",
            "team": "cit-schedora",
        }
    )

    return {
        "status": status_str,
        "is_valid": val_report.get("hard_violation_count", 0) == 0,
        "sessions": assigned_sessions,
        "schedule": sched_obj,
        "stability": {
            "sessions_moved": len(moved_ids),
            "time_changed": time_changed_count,
            "room_only_changed": room_only_changed_count,
            "moved_ids": sorted(moved_ids),
        },
        "validation_report": val_report,
    }
