"""Unit tests for Soft Penalties S1-S6 and exact parity with official_validator.py."""
from typing import Any, Dict

from app.schemas import SolveParameters
from app.solver.timetable_solver import solve_weekly_timetable
from app.validation import official_validator
from app.validation.result_verification import verify_weekly_timetable
from app.tests.test_hard_constraints import make_base_dataset


def test_s1_faculty_avoid_preference_penalty_and_avoidance():
    data = make_base_dataset()
    data["faculty"][0]["preferences"] = [
        {"type": "avoid", "days": ["MON", "TUE", "WED", "THU", "FRI"], "periods": [1, 2, 3, 4, 6, 7, 8, 9]}
    ]
    # Only P5 is not avoided -> optimal solver must place S01 at P5 with S1 = 0
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    s01 = next(s for s in res.sessions if s.session_id == "S01")
    assert s01.start_period == 5
    assert res.validation_report.soft_penalties.S1 == 0
    assert res.validation_report.parity_verified is True

    # Verify that placing S01 on an avoided period incurs exactly +2 S1 penalty
    sched = {
        "dataset_id": data["dataset_id"],
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S02", "day": "TUE", "start_period": 2, "room_id": "R-LAB1"},
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.soft_penalties.S1 == 2


def test_s2_student_group_free_periods_and_lunch_boundary():
    data = make_base_dataset()
    data["sessions"] = [
        {
            "id": "S01",
            "course_id": "C01",
            "kind": "lecture",
            "duration": 1,
            "size": 60,
            "faculty_id": "F01",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": None,
            "basket_slot": None,
        },
        {
            "id": "S02",
            "course_id": "C02",
            "kind": "lecture",
            "duration": 1,
            "size": 60,
            "faculty_id": "F02",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": None,
            "basket_slot": None,
        },
    ]
    # Place at P5 and P6 (adjacent across lunch) -> S2 free periods = 0
    sched_no_gap = {
        "dataset_id": data["dataset_id"],
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 5, "room_id": "R-C1"},
            {"session_id": "S02", "day": "MON", "start_period": 6, "room_id": "R-C1"},
        ],
    }
    rep_no_gap = verify_weekly_timetable(data, sched_no_gap)
    assert rep_no_gap.soft_penalties.S2 == 0

    # Place at P2 and P5 (P3, P4 unoccupied) -> S2 free periods = 2
    sched_gap = {
        "dataset_id": data["dataset_id"],
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S02", "day": "MON", "start_period": 5, "room_id": "R-C1"},
        ],
    }
    rep_gap = verify_weekly_timetable(data, sched_gap)
    assert rep_gap.soft_penalties.S2 == 2


def test_s3_daily_hours_exceeding_6_penalty():
    data = make_base_dataset()
    # 7 hours on MON for G1 (two 3-hour labs + one 1-hour lecture) -> S3 = 3 * (7 - 6) = 3
    data["faculty"].append(
        {"id": "F03", "name": "Prof. Gamma", "max_hours_per_day": 4, "unavailable": [], "preferences": []}
    )
    data["sessions"] = [
        {
            "id": "S01",
            "course_id": "C01",
            "kind": "lab",
            "duration": 3,
            "size": 60,
            "faculty_id": "F01",
            "groups": ["G1"],
            "room_types": ["computer_lab"],
            "needs_accessible": False,
            "fixed_slot": {"day": "MON", "start_period": 2},
            "basket_slot": None,
        },
        {
            "id": "S02",
            "course_id": "C02",
            "kind": "lab",
            "duration": 3,
            "size": 60,
            "faculty_id": "F02",
            "groups": ["G1"],
            "room_types": ["computer_lab"],
            "needs_accessible": False,
            "fixed_slot": {"day": "MON", "start_period": 6},
            "basket_slot": None,
        },
        {
            "id": "S03",
            "course_id": "C03",
            "kind": "lecture",
            "duration": 1,
            "size": 60,
            "faculty_id": "F03",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": {"day": "MON", "start_period": 5},
            "basket_slot": None,
        },
    ]
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    assert res.validation_report.soft_penalties.S3 == 3
    assert res.validation_report.parity_verified is True


def test_s4_repeated_course_lectures_same_day_penalty():
    data = make_base_dataset()
    data["sessions"] = [
        {
            "id": "S01",
            "course_id": "C01",
            "kind": "lecture",
            "duration": 1,
            "size": 60,
            "faculty_id": "F01",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": {"day": "WED", "start_period": 2},
            "basket_slot": None,
        },
        {
            "id": "S02",
            "course_id": "C01",
            "kind": "lecture",
            "duration": 1,
            "size": 60,
            "faculty_id": "F01",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": {"day": "WED", "start_period": 3},
            "basket_slot": None,
        },
    ]
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    assert res.validation_report.soft_penalties.S4 == 3
    assert res.validation_report.parity_verified is True


def test_s5_room_underutilisation_and_s6_p9_penalty():
    data = make_base_dataset()
    # Size 20 in capacity 70 -> 20/70 < 0.4 -> S5 = 1; fixed at P9 -> S6 = 1
    data["sessions"] = [
        {
            "id": "S01",
            "course_id": "C01",
            "kind": "lecture",
            "duration": 1,
            "size": 20,
            "faculty_id": "F01",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": {"day": "THU", "start_period": 9},
            "basket_slot": None,
        }
    ]
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    assert res.validation_report.soft_penalties.S5 == 1
    assert res.validation_report.soft_penalties.S6 == 1
    assert res.validation_report.parity_verified is True
