"""Candidate generation and venue eligibility filtering for booking engine."""
from typing import Any, Dict, List, Optional, Set, Tuple
from .booking_model import BookingCandidate, BookingPlacement, BookingRequestInternal

VALID_DAYS = ["MON", "TUE", "WED", "THU", "FRI"]
MAX_PERIOD = 13


def is_room_eligible(room: Dict[str, Any], req: BookingRequestInternal) -> Tuple[bool, str]:
    """Check if a room is eligible for the booking request."""
    # 1. Events allowed
    if not room.get("events_allowed", True):
        return False, "Events not allowed in this room"

    # 2. Capacity constraint
    if room.get("capacity", 0) < req.attendance:
        return False, f"Room capacity ({room.get('capacity', 0)}) less than attendance ({req.attendance})"

    # 3. Room type constraint
    if req.room_types and room.get("type") not in req.room_types:
        return False, f"Room type '{room.get('type')}' not in requested types {req.room_types}"

    # 4. Feature / equipment needs
    room_features = set(room.get("features", [])) | ({"accessible"} if room.get("accessible") else set())
    missing_features = req.needs - room_features
    if missing_features:
        return False, f"Room missing required features: {missing_features}"

    return True, "Eligible"


def get_eligible_rooms(
    rooms: List[Dict[str, Any]],
    req: BookingRequestInternal
) -> List[Dict[str, Any]]:
    """Return list of eligible rooms sorted by preference and minimal capacity waste."""
    eligible = []
    for r in rooms:
        ok, _ = is_room_eligible(r, req)
        if ok:
            is_preferred = (req.requested_room is not None and r["id"] == req.requested_room)
            waste = r.get("capacity", 0) - req.attendance
            eligible.append((r, is_preferred, waste))

    # Sort preferred room first, then by minimal capacity waste, then by room id
    eligible.sort(key=lambda item: (not item[1], item[2], item[0]["id"]))
    return [item[0] for item in eligible]


def generate_requested_candidates(
    req: BookingRequestInternal,
    eligible_rooms: List[Dict[str, Any]]
) -> List[BookingCandidate]:
    """Generate candidate placements matching the requester's requested windows."""
    candidates = []
    for w in req.windows:
        if w.day not in VALID_DAYS:
            continue
        # Hard validity check: periods must be within [1, MAX_PERIOD]
        if w.from_period < 1 or w.to_period > MAX_PERIOD:
            continue
        if w.to_period - w.from_period + 1 < req.duration_periods:
            continue

        for start_p in range(w.from_period, w.to_period - req.duration_periods + 2):
            end_p = start_p + req.duration_periods - 1
            for r in eligible_rooms:
                is_pref = (req.requested_room is not None and r["id"] == req.requested_room)
                waste = r.get("capacity", 0) - req.attendance
                placement = BookingPlacement(
                    room_id=r["id"],
                    day=w.day,
                    start_period=start_p,
                    end_period=end_p,
                )
                candidates.append(BookingCandidate(
                    placement=placement,
                    is_requested_window=True,
                    is_preferred_room=is_pref,
                    capacity_waste=waste,
                    reason="Matched requested window and room criteria"
                ))
    return candidates


def generate_alternative_candidates(
    req: BookingRequestInternal,
    eligible_rooms: List[Dict[str, Any]]
) -> List[BookingCandidate]:
    """Generate candidate placements across the week as alternative offers."""
    candidates = []
    for day in VALID_DAYS:
        for start_p in range(1, MAX_PERIOD - req.duration_periods + 2):
            end_p = start_p + req.duration_periods - 1
            for r in eligible_rooms:
                is_pref = (req.requested_room is not None and r["id"] == req.requested_room)
                waste = r.get("capacity", 0) - req.attendance
                placement = BookingPlacement(
                    room_id=r["id"],
                    day=day,
                    start_period=start_p,
                    end_period=end_p,
                )
                candidates.append(BookingCandidate(
                    placement=placement,
                    is_requested_window=False,
                    is_preferred_room=is_pref,
                    capacity_waste=waste,
                    reason="Alternative offer within official institute timetable periods"
                ))
    return candidates
