"""Comprehensive 33-scenario test suite for Phase 5 Spectra Week booking decision engine."""
import json
import os
import pytest
from app.solver.booking_candidates import (
    generate_alternative_candidates,
    generate_requested_candidates,
    get_eligible_rooms,
    is_room_eligible,
)
from app.solver.booking_constraints import ActiveBookingsState, BookingConflictIndex
from app.solver.booking_decisions import (
    format_enriched_decision,
    format_official_booking_entry,
)
from app.solver.booking_model import (
    BookingDecisionResult,
    BookingPlacement,
    BookingRequestInternal,
    BookingWindow,
)
from app.solver.booking_optimizer import optimize_bookings, parse_booking_requests
from app.solver.booking_priority import (
    CAT_WEIGHT,
    detect_priority_inversions,
    get_effective_category,
    outranks,
    sort_requests_by_priority,
)
from app.validation.booking_verification import verify_spectra_week_bookings


@pytest.fixture
def cit_public_data():
    path = os.path.join(os.path.dirname(__file__), "../../../data/cit_public.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def weekly_candidate_sessions():
    path = os.path.join(os.path.dirname(__file__), "../../../artifacts/weekly_timetable_candidate.json")
    with open(path, "r", encoding="utf-8") as f:
        doc = json.load(f)
        return doc.get("sessions", [])


@pytest.fixture
def exam_candidate_allocations():
    path = os.path.join(os.path.dirname(__file__), "../../../artifacts/examination_timetable_candidate.json")
    with open(path, "r", encoding="utf-8") as f:
        doc = json.load(f)
        return doc.get("allocations", [])


# ============================================================================
# 1-9: PRIORITY, ROLE CAPS & TIE-BREAKING TESTS
# ============================================================================

def test_1_club_role_cap():
    assert get_effective_category("club", "institute_event") == "club_event"
    assert get_effective_category("club", "guest_lecture") == "club_event"
    assert get_effective_category("club", "department_event") == "club_event"
    assert get_effective_category("club", "club_event") == "club_event"


def test_2_faculty_role_cap():
    assert get_effective_category("faculty", "institute_event") == "guest_lecture"
    assert get_effective_category("faculty", "guest_lecture") == "guest_lecture"
    assert get_effective_category("faculty", "department_event") == "department_event"


def test_3_coordinator_role_cap():
    assert get_effective_category("department_coordinator", "institute_event") == "department_event"
    assert get_effective_category("department_coordinator", "department_event") == "department_event"
    assert get_effective_category("coordinator", "institute_event") == "department_event"


def test_4_admin_role_cap():
    assert get_effective_category("admin", "institute_event") == "institute_event"
    assert get_effective_category("admin", "guest_lecture") == "guest_lecture"


def test_5_category_weights():
    assert CAT_WEIGHT["institute_event"] == 5
    assert CAT_WEIGHT["guest_lecture"] == 4
    assert CAT_WEIGHT["department_event"] == 3
    assert CAT_WEIGHT["club_event"] == 2


def test_6_outranks_different_categories():
    r_inst = BookingRequestInternal("R1", "2026-02-01", "A", "admin", "institute_event", "institute_event", "T", 10, 1, [], [], set(), None, [])
    r_guest = BookingRequestInternal("R2", "2026-01-01", "B", "faculty", "guest_lecture", "guest_lecture", "T", 10, 1, [], [], set(), None, [])
    r_dept = BookingRequestInternal("R3", "2026-01-01", "C", "department_coordinator", "department_event", "department_event", "T", 10, 1, [], [], set(), None, [])
    r_club = BookingRequestInternal("R4", "2026-01-01", "D", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])

    assert outranks(r_inst, r_guest) is True
    assert outranks(r_guest, r_dept) is True
    assert outranks(r_dept, r_club) is True


def test_7_outranks_same_category_tiebreak():
    r_early = BookingRequestInternal("R1", "2026-01-10T10:00:00Z", "A", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])
    r_late = BookingRequestInternal("R2", "2026-01-15T10:00:00Z", "B", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])
    assert outranks(r_early, r_late) is True
    assert outranks(r_late, r_early) is False


def test_8_outranks_same_time_id_tiebreak():
    r_a = BookingRequestInternal("RA", "2026-01-10T10:00:00Z", "A", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])
    r_b = BookingRequestInternal("RB", "2026-01-10T10:00:00Z", "B", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])
    assert outranks(r_a, r_b) is True


def test_9_priority_sorting():
    reqs = [
        BookingRequestInternal("R4", "2026-01-20", "D", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, []),
        BookingRequestInternal("R2", "2026-01-10", "B", "faculty", "guest_lecture", "guest_lecture", "T", 10, 1, [], [], set(), None, []),
        BookingRequestInternal("R1", "2026-01-25", "A", "admin", "institute_event", "institute_event", "T", 10, 1, [], [], set(), None, []),
        BookingRequestInternal("R3", "2026-01-05", "C", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, []),
    ]
    sorted_ids = [r.id for r in sort_requests_by_priority(reqs)]
    assert sorted_ids == ["R1", "R2", "R3", "R4"]


# ============================================================================
# 10-18: VENUE ELIGIBILITY, FEATURES & WINDOW CANDIDATES TESTS
# ============================================================================

def test_10_room_events_allowed_rejection():
    room = {"id": "LAB-1", "type": "lab", "capacity": 50, "events_allowed": False, "features": []}
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 20, 1, [], ["lab"], set(), None, [])
    ok, reason = is_room_eligible(room, req)
    assert ok is False
    assert "Events not allowed" in reason


def test_11_capacity_constraint_rejection():
    room = {"id": "CR-101", "type": "classroom", "capacity": 60, "events_allowed": True, "features": []}
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 80, 1, [], ["classroom"], set(), None, [])
    ok, reason = is_room_eligible(room, req)
    assert ok is False
    assert "capacity" in reason


def test_12_room_type_mismatch_rejection():
    room = {"id": "CR-101", "type": "classroom", "capacity": 100, "events_allowed": True, "features": []}
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 1, [], ["auditorium"], set(), None, [])
    ok, reason = is_room_eligible(room, req)
    assert ok is False
    assert "type" in reason


def test_13_equipment_needs_matching():
    room = {"id": "SH-1", "type": "seminar_hall", "capacity": 150, "events_allowed": True, "features": ["projector", "ac"]}
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 1, [], ["seminar_hall"], {"stage"}, None, [])
    ok, reason = is_room_eligible(room, req)
    assert ok is False
    assert "features" in reason


def test_14_wheelchair_accessible_feature():
    room_acc = {"id": "SH-1", "type": "seminar_hall", "capacity": 150, "events_allowed": True, "features": ["ac"], "accessible": True}
    room_not_acc = {"id": "SH-2", "type": "seminar_hall", "capacity": 100, "events_allowed": True, "features": ["ac"], "accessible": False}
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 1, [], ["seminar_hall"], {"accessible"}, None, [])

    ok1, _ = is_room_eligible(room_acc, req)
    ok2, _ = is_room_eligible(room_not_acc, req)
    assert ok1 is True
    assert ok2 is False


def test_15_requested_room_preference():
    rooms = [
        {"id": "SH-2", "type": "seminar_hall", "capacity": 100, "events_allowed": True, "features": []},
        {"id": "SH-1", "type": "seminar_hall", "capacity": 150, "events_allowed": True, "features": []},
    ]
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 1, [], ["seminar_hall"], set(), "SH-1", [])
    eligible = get_eligible_rooms(rooms, req)
    assert eligible[0]["id"] == "SH-1"


def test_16_nonexistent_requested_room_fallback():
    rooms = [
        {"id": "SH-2", "type": "seminar_hall", "capacity": 100, "events_allowed": True, "features": []},
    ]
    # LHC-5 does not exist (from BR-14)
    req = BookingRequestInternal("R14", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 1, [], ["seminar_hall"], set(), "LHC-5", [])
    eligible = get_eligible_rooms(rooms, req)
    assert len(eligible) == 1
    assert eligible[0]["id"] == "SH-2"


def test_17_window_period_bounds():
    # Window period 14 is illegal
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 2, [BookingWindow("WED", 13, 14)], ["auditorium"], set(), None, [])
    eligible = [{"id": "AUD", "capacity": 500, "type": "auditorium", "events_allowed": True, "features": []}]
    cands = generate_requested_candidates(req, eligible)
    assert len(cands) == 0


def test_18_window_duration_fit():
    # Window of 1 period cannot fit duration 2
    req = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 50, 2, [BookingWindow("MON", 5, 5)], ["auditorium"], set(), None, [])
    eligible = [{"id": "AUD", "capacity": 500, "type": "auditorium", "events_allowed": True, "features": []}]
    cands = generate_requested_candidates(req, eligible)
    assert len(cands) == 0


# ============================================================================
# 19-23: CONFLICT INDEX & OVERLAP TESTS
# ============================================================================

def test_19_room_unavailability_conflict():
    rooms = [{"id": "AUD", "unavailability": [{"day": "MON", "from_period": 1, "to_period": 3}]}]
    idx = BookingConflictIndex(rooms=rooms, timetable_sessions=[])
    free, msg = idx.is_slot_free_from_sessions("AUD", "MON", 2, 2)
    assert free is False
    assert "unavailable" in msg


def test_20_timetable_session_conflict():
    rooms = [{"id": "LH-1"}]
    sessions = [{"session_id": "CS101", "day": "TUE", "start_period": 4, "room_id": "LH-1"}]
    defs = {"CS101": {"duration": 2, "groups": ["CSE-1"]}}
    idx = BookingConflictIndex(rooms=rooms, timetable_sessions=sessions, session_definitions=defs)

    free, _ = idx.is_slot_free_from_sessions("LH-1", "TUE", 4, 5)
    assert free is False


def test_21_mandatory_group_class_conflict():
    rooms = [{"id": "LH-1"}]
    sessions = [{"session_id": "CS101", "day": "WED", "start_period": 3, "room_id": "CR-101"}]
    defs = {"CS101": {"duration": 1, "groups": ["CSE-2"]}}
    idx = BookingConflictIndex(rooms=rooms, timetable_sessions=sessions, session_definitions=defs)

    g_free, _ = idx.is_group_free("CSE-2", "WED", 3, 3)
    assert g_free is False


def test_22_booking_collision_prevention():
    state = ActiveBookingsState()
    req1 = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])
    req2 = BookingRequestInternal("R2", "2026-01-02", "B", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, [])
    p = BookingPlacement("AUD", "MON", 5, 6)

    state.assign(req1, p)
    free, msg = state.is_placement_free(p, req2)
    assert free is False
    assert "booked" in msg


def test_23_booking_group_collision_prevention():
    state = ActiveBookingsState()
    req1 = BookingRequestInternal("R1", "2026-01-01", "A", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, ["CS-1"])
    req2 = BookingRequestInternal("R2", "2026-01-02", "B", "club", "club_event", "club_event", "T", 10, 1, [], [], set(), None, ["CS-1"])

    state.assign(req1, BookingPlacement("AUD", "MON", 5, 6))
    free, _ = state.is_placement_free(BookingPlacement("SH-1", "MON", 5, 6), req2)
    assert free is False


# ============================================================================
# 24-28: EDGE CASES, CANCELLATION, ALTERNATIVES & ATTENDANCE
# ============================================================================

def test_24_cancelled_booking_rejected(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    assert decisions["BR-04"].status == "rejected"
    assert "cancelled" in decisions["BR-04"].reason.lower()


def test_25_cancelled_booking_never_offered_alternative(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    assert decisions["BR-04"].status != "alternative_offered"
    assert decisions["BR-04"].day is None
    assert decisions["BR-04"].room_id is None


def test_26_excessive_attendance_rejection(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    assert decisions["BR-09"].status == "rejected"
    assert "attendance" in decisions["BR-09"].reason.lower()


def test_27_alternative_offer_on_window_conflict(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    assert decisions["BR-17"].status == "alternative_offered"
    assert decisions["BR-17"].score_weight == 1.0  # half weight of club_event (2 * 0.5)


def test_28_alternative_offer_valid_periods(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    d17 = decisions["BR-17"]
    assert 1 <= d17.start_period <= 13
    assert 1 <= d17.end_period <= 13
    assert d17.day in ["MON", "TUE", "WED", "THU", "FRI"]


# ============================================================================
# 29-33: INVERSION DETECTION, OFFICIAL VALIDATOR & SCHEDULE ASSEMBLY
# ============================================================================

def test_29_priority_inversion_detection():
    rooms = [{"id": "AUD", "type": "auditorium", "capacity": 500, "events_allowed": True, "features": ["stage"], "accessible": True}]
    r_high = BookingRequestInternal("R_HIGH", "2026-01-01", "A", "admin", "institute_event", "institute_event", "T", 100, 2, [BookingWindow("MON", 5, 6)], ["auditorium"], set(), None, [])
    r_low = BookingRequestInternal("R_LOW", "2026-01-02", "B", "club", "club_event", "club_event", "T", 100, 2, [BookingWindow("MON", 5, 6)], ["auditorium"], set(), None, [])

    # Artificial inversion: low approved in slot, high rejected
    decisions = {
        "R_HIGH": BookingDecisionResult("R_HIGH", "rejected"),
        "R_LOW": BookingDecisionResult("R_LOW", "approved", day="MON", start_period=5, end_period=6, room_id="AUD"),
    }
    inversions = detect_priority_inversions([r_high, r_low], decisions, rooms=rooms)
    assert len(inversions) == 1
    assert "Priority inversion" in inversions[0]


def test_30_zero_priority_inversions_official(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    _, stats = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)
    assert stats.priority_inversion_count == 0
    assert stats.priority_inversions == []


def test_31_zero_hard_violations_official(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    official_bookings = [format_official_booking_entry(d) for d in decisions.values()]
    fest_week = {"session_overrides": [], "bookings": official_bookings}
    sched = {"dataset_id": cit_public_data["dataset_id"], "team": "cit-schedora", "sessions": weekly_candidate_sessions, "fest_week": fest_week}

    rep = verify_spectra_week_bookings(cit_public_data, sched, fest_week)
    assert rep["valid"] is True
    assert rep["hard_violation_count"] == 0
    assert rep["hard_violations"] == []


def test_32_official_booking_score(cit_public_data, weekly_candidate_sessions):
    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    official_bookings = [format_official_booking_entry(d) for d in decisions.values()]
    fest_week = {"session_overrides": [], "bookings": official_bookings}
    sched = {"dataset_id": cit_public_data["dataset_id"], "team": "cit-schedora", "sessions": weekly_candidate_sessions, "fest_week": fest_week}

    rep = verify_spectra_week_bookings(cit_public_data, sched, fest_week)
    assert rep["stats"]["booking_score"] == 67.0
    assert rep["stats"]["booking_score_max_if_all_approved"] == 70
    assert rep["stats"]["approved"] == 22
    assert rep["stats"]["alternatives"] == 1
    assert rep["stats"]["rejected"] == 2


def test_33_full_schedule_assembly_validation(cit_public_data, weekly_candidate_sessions, exam_candidate_allocations):
    from validator import run

    raw = cit_public_data["booking_requests"]
    defs = {s["id"]: s for s in cit_public_data["sessions"]}
    decisions, _ = optimize_bookings(raw, cit_public_data["rooms"], weekly_candidate_sessions, session_definitions=defs)

    official_bookings = [format_official_booking_entry(d) for d in decisions.values()]
    fest_week = {"session_overrides": [], "bookings": official_bookings}

    full_schedule = {
        "dataset_id": cit_public_data["dataset_id"],
        "team": "cit-schedora",
        "sessions": weekly_candidate_sessions,
        "exams": exam_candidate_allocations,
        "fest_week": fest_week,
    }

    full_report = run(cit_public_data, full_schedule)
    assert full_report["hard_violation_count"] == 0
    assert full_report["hard_violations"] == []
    assert full_report["bookings"]["booking_score"] == 67.0
    assert full_report["bookings"]["priority_inversions"] == []
