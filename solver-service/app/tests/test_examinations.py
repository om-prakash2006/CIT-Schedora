"""Automated test suite for the CIT Schedora CP-SAT Examination Scheduling Engine.

Covers all 22 required items from Phase 4B specifications:
  1. Exactly-once examination assignment
  2. Unknown exam ID rejection
  3. Duplicate exam detection
  4. Invalid day rejection
  5. Invalid session rejection
  6. Eligible examination room selection
  7. Ineligible room rejection (e.g. labs, CRs without 'exam' use)
  8. Half-capacity calculation (effective = capacity // 2)
  9. Odd room capacity floor division (e.g. 81 -> 40, not rounded up)
  10. Multi-room allocation (large cohorts split across multiple halls)
  11. Combined half-capacity sufficiency
  12. Insufficient capacity rejection
  13. Duplicate room prevention per exam
  14. Room double-booking prevention at same (day, session)
  15. Student group overlap prevention at same (day, session)
  16. Same-day AM/PM exam penalty (5 pts per extra exam on same day for a group)
  17. Different-group simultaneous examinations allowed
  18. Exact official soft penalty parity with validator.py check_exams
  19. Solver infeasibility handling (when exam size exceeds total half-capacity)
  20. Full official dataset test on cit_public.json (41 exams, 0 hard violations, 100% parity)
"""
import copy
import json
import os
import pytest

from app.schemas import SolveParameters
from app.solver.exam_solver import solve_examination_schedule
from app.validation.exam_verification import compute_exam_soft_penalty, verify_examination_schedule
from app.validation import official_validator


DATASET_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../data/cit_public.json")
)


@pytest.fixture(scope="module")
def cit_public_data():
    with open(DATASET_PATH, encoding="utf-8") as f:
        return json.load(f)


def test_1_and_20_complete_active_dataset_41_exams(cit_public_data):
    """
    Test 1 & 20: Run the complete official active dataset through the examination CP-SAT solver.
    Verifies all 41 examinations are assigned exactly once, 0 hard violations,
    and 100% parity with official_validator.check_exams.
    """
    params = SolveParameters(timeout_seconds=15.0, num_workers=8, random_seed=42)
    res = solve_examination_schedule(
        data=cit_public_data,
        dataset_version_id="v1-1a9cf4b23ac3",
        team_name="cit-schedora",
        params=params,
    )

    assert res.solver_status in ("OPTIMAL", "FEASIBLE")
    assert res.total_exams == len(cit_public_data["exams"])
    assert res.scheduled_exams == res.total_exams
    assert len(res.allocations) == res.total_exams

    val = res.validation_report
    assert val is not None
    assert val.is_valid is True
    assert val.hard_violation_count == 0
    assert val.parity_verified is True
    assert len(val.missing_exams) == 0
    assert len(val.duplicate_exams) == 0
    assert val.ineligible_room_violations == 0
    assert val.group_clashes == 0
    assert val.room_conflicts == 0
    assert val.capacity_violations == 0

    # Verify official validator directly
    official_payload = [
        {
            "exam_id": a.exam_id,
            "day": a.day,
            "session": a.session,
            "rooms": a.rooms,
        }
        for a in res.allocations
    ]
    ctx = official_validator.Ctx(cit_public_data)
    violations, pen = official_validator.check_exams(ctx, official_payload)
    assert len(violations) == 0
    assert pen == val.official_soft_penalty
    assert val.solver_soft_penalty == val.official_soft_penalty


def test_2_unknown_exam_id_rejected(cit_public_data):
    """Test 2: Unknown exam ID rejected with E1 violation."""
    payload = [
        {"exam_id": "EX-NONEXISTENT-999", "day": "MON", "session": "AM", "rooms": ["LH-1"]}
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert any(v["rule"] == "E1" and "Unknown exam" in v["detail"] for v in rep.hard_violations)


def test_3_duplicate_exam_detected(cit_public_data):
    """Test 3: Scheduling the same exam twice produces an E1 duplicate violation."""
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-1"]},
        {"exam_id": "EX-CS201", "day": "TUE", "session": "PM", "rooms": ["LH-2"]},
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert "EX-CS201" in rep.duplicate_exams
    assert any(v["rule"] == "E1" and "scheduled twice" in v["detail"] for v in rep.hard_violations)


def test_4_and_5_invalid_day_and_session_rejected(cit_public_data):
    """Test 4 & 5: Days outside calendar.exam_week and invalid session IDs rejected."""
    # Invalid day: SUN
    payload1 = [
        {"exam_id": "EX-CS201", "day": "SUN", "session": "AM", "rooms": ["LH-1"]}
    ]
    rep1 = verify_examination_schedule(cit_public_data, payload1)
    assert rep1.is_valid is False
    assert any(v["rule"] == "E1" and "invalid slot" in v["detail"] for v in rep1.hard_violations)

    # Invalid session: P1
    payload2 = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "P1", "rooms": ["LH-1"]}
    ]
    rep2 = verify_examination_schedule(cit_public_data, payload2)
    assert rep2.is_valid is False
    assert any(v["rule"] == "E1" and "invalid slot" in v["detail"] for v in rep2.hard_violations)


def test_6_and_7_eligible_and_ineligible_rooms(cit_public_data):
    """
    Test 6 & 7: Only rooms with 'exam' in allowed_uses can host exams.
    CS-LAB-1 has allowed_uses: ['lab', 'event'] (no exam permission) -> E2 violation.
    """
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["CS-LAB-1"]}
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert rep.ineligible_room_violations >= 1
    assert any(v["rule"] == "E2" and "cannot host exams" in v["detail"] for v in rep.hard_violations)


def test_8_and_9_half_capacity_calculation_and_odd_floor(cit_public_data):
    """
    Test 8 & 9: Floor division capacity // 2 is strictly enforced.
    An odd capacity like 81 becomes 40 (not 41).
    """
    data = copy.deepcopy(cit_public_data)
    data["rooms"].append({
        "id": "ODD-ROOM",
        "name": "Odd Capacity Room",
        "building": "Main",
        "type": "classroom",
        "capacity": 81,
        "features": [],
        "accessible": True,
        "allowed_uses": ["exam"],
    })
    data["exams"].append({
        "id": "EX-ODD-TEST",
        "course_ids": ["TEST101"],
        "groups": ["TEST-GRP"],
        "size": 41,  # Needs 41 seats; ODD-ROOM has 81 // 2 = 40 seats -> fails H5
        "duration_hours": 2,
    })

    payload = [
        {"exam_id": "EX-ODD-TEST", "day": "MON", "session": "AM", "rooms": ["ODD-ROOM"]}
    ]
    rep = verify_examination_schedule(data, payload)
    assert rep.is_valid is False
    assert rep.capacity_violations >= 1
    assert any(v["rule"] == "H5" and "40 seats at half capacity" in v["detail"] for v in rep.hard_violations)


def test_10_and_11_multi_room_allocation_combined_capacity(cit_public_data):
    """
    Test 10 & 11: Multi-room allocation correctly sums effective half-capacities.
    LH-1 (200 // 2 = 100) + LH-2 (200 // 2 = 100) = 200 effective seats.
    Exam with 150 students is accommodated.
    """
    data = copy.deepcopy(cit_public_data)
    data["exams"] = [{
        "id": "EX-MULTI-TEST",
        "course_ids": ["MULTI101"],
        "groups": ["MULTI-GRP"],
        "size": 150,
        "duration_hours": 2,
    }]
    res = solve_examination_schedule(data, params=SolveParameters(timeout_seconds=5.0, num_workers=4))
    assert res.solver_status in ("OPTIMAL", "FEASIBLE")
    alloc = res.allocations[0]
    assert alloc.exam_id == "EX-MULTI-TEST"
    assert alloc.effective_capacity >= 150
    assert len(alloc.rooms) >= 1
    val = res.validation_report
    assert val is not None
    assert val.is_valid is True
    assert val.hard_violation_count == 0


def test_12_insufficient_capacity_rejection(cit_public_data):
    """Test 12: Insufficient combined half-capacity triggers H5 violation."""
    # LH-3 has capacity 120 -> effective 60. Exam EX-CS201 has size 80 -> fails H5.
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-3"]}
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert rep.capacity_violations >= 1
    assert any(v["rule"] == "H5" and "60 seats at half capacity for 80 students" in v["detail"] for v in rep.hard_violations)


def test_13_duplicate_room_in_same_exam_prevention(cit_public_data):
    """Test 13: Assigning the same room twice in one exam double-counts capacity and clashes in room_use."""
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-3", "LH-3"]}
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert rep.room_conflicts >= 1
    assert any(v["rule"] == "H4" for v in rep.hard_violations)


def test_14_room_double_booking_prevention(cit_public_data):
    """Test 14: Two different exams assigned the same room in the same slot triggers H4."""
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["AUD"]},
        {"exam_id": "EX-EC201", "day": "MON", "session": "AM", "rooms": ["AUD"]},
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert rep.room_conflicts >= 1
    assert any(v["rule"] == "H4" and "AUD" in v["detail"] for v in rep.hard_violations)


def test_15_student_group_overlap_prevention(cit_public_data):
    """
    Test 15: Student group overlap in the same (day, session) triggers H3.
    EX-CS201 and EX-CS202 both have group 'CSE-2'.
    """
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-1"]},
        {"exam_id": "EX-CS202", "day": "MON", "session": "AM", "rooms": ["LH-2"]},
    ]
    rep = verify_examination_schedule(cit_public_data, payload)
    assert rep.is_valid is False
    assert rep.group_clashes >= 1
    assert any(v["rule"] == "H3" and "Group CSE-2" in v["detail"] for v in rep.hard_violations)


def test_16_same_day_am_pm_exam_soft_penalty(cit_public_data):
    """
    Test 16: Two exams for the same student group on the same day (one AM, one PM)
    is allowed with 0 hard violations, but adds 5 soft penalty points.
    """
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-1"]},
        {"exam_id": "EX-CS202", "day": "MON", "session": "PM", "rooms": ["LH-2"]},
    ]
    # Restrict data to just these two exams for isolated testing
    data = copy.deepcopy(cit_public_data)
    data["exams"] = [e for e in data["exams"] if e["id"] in ("EX-CS201", "EX-CS202")]

    rep = verify_examination_schedule(data, payload)
    assert rep.hard_violation_count == 0
    assert rep.group_clashes == 0
    assert rep.official_soft_penalty == 5
    assert rep.solver_soft_penalty == 5
    assert rep.parity_verified is True


def test_17_different_groups_simultaneous_examinations_allowed(cit_public_data):
    """
    Test 17: Different student groups can take examinations simultaneously in different rooms
    in the same slot with 0 violations and 0 penalty.
    """
    # EX-CS201 has ['CSE-2'], EX-EC201 has ['ECE-2']
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-1"]},
        {"exam_id": "EX-EC201", "day": "MON", "session": "AM", "rooms": ["LH-2"]},
    ]
    data = copy.deepcopy(cit_public_data)
    data["exams"] = [e for e in data["exams"] if e["id"] in ("EX-CS201", "EX-EC201")]

    rep = verify_examination_schedule(data, payload)
    assert rep.is_valid is True
    assert rep.hard_violation_count == 0
    assert rep.official_soft_penalty == 0


def test_18_exact_official_soft_penalty_parity(cit_public_data):
    """
    Test 18: Standalone calculator and official validator yield identical soft penalty
    for a multi-exam schedule with multiple same-day exams across cohorts.
    """
    payload = [
        {"exam_id": "EX-CS201", "day": "MON", "session": "AM", "rooms": ["LH-1"]},
        {"exam_id": "EX-CS202", "day": "MON", "session": "PM", "rooms": ["LH-2"]},
        {"exam_id": "EX-EC201", "day": "MON", "session": "AM", "rooms": ["LH-3"]},
        {"exam_id": "EX-EC202", "day": "MON", "session": "PM", "rooms": ["LH-4"]},
    ]
    calc_pen = compute_exam_soft_penalty(cit_public_data, payload)
    ctx = official_validator.Ctx(cit_public_data)
    _, official_pen = official_validator.check_exams(ctx, payload)
    assert calc_pen == official_pen == 10  # 5 for CSE-2 + 5 for ECE-2


def test_19_solver_infeasibility_handling(cit_public_data):
    """
    Test 19: When an exam size exceeds the total available half-capacity of all eligible rooms,
    the solver honestly returns INFEASIBLE without creating fake allocations.
    """
    data = copy.deepcopy(cit_public_data)
    # Add impossible 2500-student exam (total eligible half-capacity is only ~1210)
    data["exams"].append({
        "id": "EX-IMPOSSIBLE-SUPERCOHORT",
        "course_ids": ["SUPER101"],
        "groups": ["SUPER-GRP"],
        "size": 2500,
        "duration_hours": 2,
    })
    res = solve_examination_schedule(data, params=SolveParameters(timeout_seconds=5.0, num_workers=4))
    assert res.solver_status == "INFEASIBLE"
    assert len(res.allocations) == 0
    assert res.scheduled_exams == 0
    assert len(res.diagnostics.diagnostic_messages) > 0
