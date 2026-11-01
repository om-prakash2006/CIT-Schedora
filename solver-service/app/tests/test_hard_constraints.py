"""Unit and adversarial tests for Hard Constraints H1-H12 and H14."""
import copy
from typing import Any, Dict

from app.schemas import SolveParameters
from app.solver.timetable_solver import solve_weekly_timetable
from app.validation.result_verification import verify_weekly_timetable


def make_base_dataset() -> Dict[str, Any]:
    return {
        "dataset_id": "test-dataset-v1",
        "calendar": {
            "days": ["MON", "TUE", "WED", "THU", "FRI"],
            "teaching_periods": [1, 2, 3, 4, 5, 6, 7, 8, 9],
            "lab_start_periods": [2, 6],
            "lunch": {"after_period": 5},
        },
        "rooms": [
            {
                "id": "R-C1",
                "type": "classroom",
                "capacity": 70,
                "accessible": True,
                "allowed_uses": ["class", "exam", "event"],
                "features": ["projector"],
            },
            {
                "id": "R-C2",
                "type": "classroom",
                "capacity": 70,
                "accessible": False,
                "allowed_uses": ["class", "exam"],
                "features": ["projector"],
            },
            {
                "id": "R-LAB1",
                "type": "computer_lab",
                "capacity": 70,
                "accessible": True,
                "allowed_uses": ["class"],
                "features": ["computers"],
            },
            {
                "id": "R-SEM1",
                "type": "seminar_hall",
                "capacity": 200,
                "accessible": True,
                "allowed_uses": ["event"],
                "features": ["audio"],
            },
        ],
        "faculty": [
            {
                "id": "F01",
                "name": "Prof. Alpha",
                "max_hours_per_day": 4,
                "needs_accessible": False,
                "unavailable": [{"day": "MON", "periods": [1], "reason": "Committee"}],
                "preferences": [],
            },
            {
                "id": "F02",
                "name": "Prof. Beta",
                "max_hours_per_day": 4,
                "needs_accessible": False,
                "unavailable": [],
                "preferences": [],
            },
        ],
        "student_groups": [
            {"id": "G1", "size": 60, "needs_accessible": False},
            {"id": "G2", "size": 60, "needs_accessible": False},
        ],
        "room_unavailability": [
            {"room_id": "R-C1", "day": "TUE", "periods": [1], "reason": "Maintenance"}
        ],
        "booking_requests": [],
        "cancellations": [],
        "sessions": [
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
                "kind": "lab",
                "duration": 3,
                "size": 60,
                "faculty_id": "F02",
                "groups": ["G1"],
                "room_types": ["computer_lab"],
                "needs_accessible": False,
                "fixed_slot": None,
                "basket_slot": None,
            },
        ],
    }


def test_solver_satisfies_all_hard_constraints_on_synthetic():
    data = make_base_dataset()
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    assert len(res.sessions) == 2
    assert res.validation_report is not None
    assert res.validation_report.hard_violation_count == 0
    assert res.validation_report.is_valid is True


def test_h5_room_capacity_infeasible_detected():
    data = make_base_dataset()
    data["sessions"][0]["size"] = 500  # Exceeds all classroom capacities
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "INFEASIBLE"
    assert len(res.diagnostics.infeasible_sessions) == 1
    assert res.diagnostics.infeasible_sessions[0]["session_id"] == "S01"


def test_h6_seminar_hall_excluded_from_regular_classes():
    data = make_base_dataset()
    # Request seminar_hall which only has allowed_uses=["event"]
    data["sessions"][0]["room_types"] = ["seminar_hall"]
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "INFEASIBLE"


def test_h10_accessibility_enforced_for_session_faculty_and_group():
    data = make_base_dataset()
    # Mark group G1 as needing accessible room; R-C2 is not accessible, so S01 must use R-C1
    data["student_groups"][0]["needs_accessible"] = True
    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    s01 = next(s for s in res.sessions if s.session_id == "S01")
    assert s01.room_id == "R-C1"


# ============================================================================
# 10 ADVERSARIAL INVALID ASSIGNMENT TESTS (Part 15.3)
# ============================================================================

def test_adversarial_1_missing_session_detected():
    data = make_base_dataset()
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"}
            # S02 omitted!
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H1", 0) >= 1


def test_adversarial_2_duplicate_session_detected():
    data = make_base_dataset()
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S01", "day": "TUE", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S02", "day": "WED", "start_period": 2, "room_id": "R-LAB1"},
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H1", 0) >= 1


def test_adversarial_3_faculty_double_booking_detected():
    data = make_base_dataset()
    data["sessions"][1]["faculty_id"] = "F01"
    data["sessions"][1]["groups"] = ["G2"]
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 3, "room_id": "R-C1"},
            {"session_id": "S02", "day": "MON", "start_period": 2, "room_id": "R-LAB1"},  # Covers P2,P3,P4
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H2", 0) >= 1


def test_adversarial_4_student_group_double_booking_detected():
    data = make_base_dataset()
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S02", "day": "MON", "start_period": 2, "room_id": "R-LAB1"},  # Both G1 at MON P2
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H3", 0) >= 1


def test_adversarial_5_room_double_booking_detected():
    data = make_base_dataset()
    data["sessions"][1] = {
        "id": "S02",
        "course_id": "C02",
        "kind": "lecture",
        "duration": 1,
        "size": 60,
        "faculty_id": "F02",
        "groups": ["G2"],
        "room_types": ["classroom"],
        "needs_accessible": False,
        "fixed_slot": None,
        "basket_slot": None,
    }
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S02", "day": "MON", "start_period": 2, "room_id": "R-C1"},
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H4", 0) >= 1


def test_adversarial_6_lab_starting_at_p1_detected():
    data = make_base_dataset()
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 5, "room_id": "R-C1"},
            {"session_id": "S02", "day": "TUE", "start_period": 1, "room_id": "R-LAB1"},  # Lab at P1 invalid
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H9", 0) >= 1


def test_adversarial_7_session_crossing_lunch_detected():
    data = make_base_dataset()
    data["sessions"][0]["duration"] = 2
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 5, "room_id": "R-C1"},  # P5-P6 crosses lunch after P5
            {"session_id": "S02", "day": "TUE", "start_period": 2, "room_id": "R-LAB1"},
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H9", 0) >= 1


def test_adversarial_8_elective_basket_desynchronization_detected():
    data = make_base_dataset()
    data["sessions"][0]["basket_slot"] = "BASKET-1"
    data["sessions"][1] = {
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
        "basket_slot": "BASKET-1",
    }
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},
            {"session_id": "S02", "day": "MON", "start_period": 3, "room_id": "R-C2"},  # Different period!
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H11", 0) >= 1


def test_adversarial_9_faculty_exceeding_4_hours_in_day_detected():
    data = make_base_dataset()
    data["sessions"] = [
        {
            "id": f"S0{i}",
            "course_id": f"C0{i}",
            "kind": "lecture",
            "duration": 1,
            "size": 60,
            "faculty_id": "F01",
            "groups": ["G1"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": None,
            "basket_slot": None,
        }
        for i in range(1, 6)
    ]
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": f"S0{i}", "day": "TUE", "start_period": i, "room_id": "R-C2"}
            for i in range(1, 6)  # 5 hours on TUE for F01 (max 4)
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H12", 0) >= 1


def test_adversarial_10_fixed_slot_moved_detected():
    data = make_base_dataset()
    data["sessions"][0]["fixed_slot"] = {"day": "WED", "start_period": 4}
    sched = {
        "dataset_id": "test-dataset-v1",
        "team": "cit-schedora",
        "sessions": [
            {"session_id": "S01", "day": "MON", "start_period": 2, "room_id": "R-C1"},  # Moved from WED P4!
            {"session_id": "S02", "day": "TUE", "start_period": 2, "room_id": "R-LAB1"},
        ],
    }
    rep = verify_weekly_timetable(data, sched)
    assert rep.is_valid is False
    assert rep.hard_by_rule.get("H14", 0) >= 1
