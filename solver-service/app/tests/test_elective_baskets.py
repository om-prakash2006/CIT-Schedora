"""Unit tests for Elective Basket synchronization (H11) and group non-overlap (H3)."""
from app.schemas import SolveParameters
from app.solver.timetable_solver import solve_weekly_timetable
from app.tests.test_hard_constraints import make_base_dataset


def test_elective_baskets_synchronized_same_day_period_distinct_rooms():
    data = make_base_dataset()
    data["rooms"].append(
        {
            "id": "R-C3",
            "type": "classroom",
            "capacity": 70,
            "accessible": True,
            "allowed_uses": ["class", "exam"],
            "features": ["projector"],
        }
    )
    data["faculty"].append(
        {"id": "F03", "name": "Prof. Gamma", "max_hours_per_day": 4, "unavailable": [], "preferences": []}
    )
    data["sessions"] = [
        {
            "id": "B1-S1",
            "course_id": "EL01",
            "kind": "lecture",
            "duration": 1,
            "size": 45,
            "faculty_id": "F01",
            "groups": ["G1", "G2"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": None,
            "basket_slot": "BASKET-1",
        },
        {
            "id": "B1-S2",
            "course_id": "EL02",
            "kind": "lecture",
            "duration": 1,
            "size": 45,
            "faculty_id": "F02",
            "groups": ["G1", "G2"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": None,
            "basket_slot": "BASKET-1",
        },
        {
            "id": "B1-S3",
            "course_id": "EL03",
            "kind": "lecture",
            "duration": 1,
            "size": 45,
            "faculty_id": "F03",
            "groups": ["G1", "G2"],
            "room_types": ["classroom"],
            "needs_accessible": False,
            "fixed_slot": None,
            "basket_slot": "BASKET-1",
        },
    ]

    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    assert res.validation_report.hard_violation_count == 0
    assert res.validation_report.parity_verified is True

    slots = {(s.day, s.start_period) for s in res.sessions}
    rooms = {s.room_id for s in res.sessions}
    assert len(slots) == 1, "All sessions in BASKET-1 must share the exact same (day, start_period)"
    assert len(rooms) == 3, "Each session in BASKET-1 must be placed in a separate room"
