"""Unit tests for Fixed Slot constraint enforcement (H14)."""
from app.schemas import SolveParameters
from app.solver.timetable_solver import solve_weekly_timetable
from app.tests.test_hard_constraints import make_base_dataset


def test_fixed_slots_preserved_exactly():
    data = make_base_dataset()
    data["sessions"][0]["fixed_slot"] = {"day": "THU", "start_period": 4}
    data["sessions"][1]["fixed_slot"] = {"day": "FRI", "start_period": 6}

    res = solve_weekly_timetable(data, params=SolveParameters(timeout_seconds=5.0))
    assert res.solver_status == "OPTIMAL"
    assert res.validation_report.hard_violation_count == 0

    by_id = {s.session_id: s for s in res.sessions}
    assert (by_id["S01"].day, by_id["S01"].start_period) == ("THU", 4)
    assert (by_id["S02"].day, by_id["S02"].start_period) == ("FRI", 6)
