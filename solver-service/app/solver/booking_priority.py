"""Priority ranking and category calculation matching official CIT validator."""
from typing import Any, Dict, List, Optional, Tuple
from .booking_model import BookingDecisionResult, BookingRequestInternal

# Official validator weights
CAT_WEIGHT: Dict[str, int] = {
    "institute_event": 5,
    "guest_lecture": 4,
    "department_event": 3,
    "club_event": 2,
}

# Role category caps
ROLE_CAPS: Dict[str, str] = {
    "club": "club_event",
    "faculty": "guest_lecture",
    "department_coordinator": "department_event",
    "coordinator": "department_event",
    "admin": "institute_event",
}

CATEGORY_ORDER: List[str] = [
    "institute_event",
    "guest_lecture",
    "department_event",
    "club_event",
]


def get_effective_category(role: str, requested_category: str) -> str:
    """Calculate effective category enforcing role category caps."""
    cap = ROLE_CAPS.get(role, "club_event")
    req_cat = requested_category if requested_category in CAT_WEIGHT else "club_event"

    cap_weight = CAT_WEIGHT.get(cap, 2)
    req_weight = CAT_WEIGHT.get(req_cat, 2)

    if req_weight > cap_weight:
        return cap
    return req_cat


def outranks(r1: BookingRequestInternal, r2: BookingRequestInternal) -> bool:
    """Returns True if r1 strictly outranks r2 in booking priority."""
    w1 = CAT_WEIGHT.get(r1.effective_category, 0)
    w2 = CAT_WEIGHT.get(r2.effective_category, 0)
    if w1 != w2:
        return w1 > w2
    # Earlier submitted_at wins tie
    if r1.submitted_at != r2.submitted_at:
        return r1.submitted_at < r2.submitted_at
    return r1.id < r2.id


def sort_requests_by_priority(requests: List[BookingRequestInternal]) -> List[BookingRequestInternal]:
    """Sort requests deterministically by priority."""
    def sort_key(r: BookingRequestInternal) -> Tuple[int, str, str]:
        # Negative weight for descending order
        weight = CAT_WEIGHT.get(r.effective_category, 0)
        return (-weight, r.submitted_at, r.id)

    return sorted(requests, key=sort_key)


def detect_priority_inversions(
    requests: List[BookingRequestInternal],
    decisions: Dict[str, BookingDecisionResult],
    rooms: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    """
    Detect priority inversions where a higher priority request was rejected or given
    alternative while a lower priority request was approved in a room/slot the higher priority could have used.
    """
    inversions: List[str] = []
    req_by_id = {r.id: r for r in requests}
    rooms_by_id = {r["id"]: r for r in rooms} if rooms else {}

    for id1, d1 in decisions.items():
        r1 = req_by_id.get(id1)
        if not r1 or d1.status != "approved" or not d1.room_id:
            continue

        room = rooms_by_id.get(d1.room_id)

        for id2, d2 in decisions.items():
            if id1 == id2:
                continue
            r2 = req_by_id.get(id2)
            if not r2:
                continue

            # Check if r2 strictly outranks r1
            if outranks(r2, r1):
                # If r2 was rejected
                if d2.status == "rejected" and not r2.is_cancelled:
                    # Check if r2 could have used this room
                    if room:
                        feats = set(room.get("features", [])) | ({"accessible"} if room.get("accessible") else set())
                        if r2.room_types and room.get("type") not in r2.room_types:
                            continue
                        if room.get("capacity", 0) < r2.attendance:
                            continue
                        if r2.needs - feats:
                            continue

                    # Check if r2 requested a window covering this slot
                    for w in r2.windows:
                        if w.day == d1.day and w.from_period <= (d1.start_period or 0) and (d1.end_period or 0) <= w.to_period:
                            inversions.append(
                                f"Priority inversion: {r2.id} ({r2.effective_category}, submitted {r2.submitted_at}) "
                                f"outranks {r1.id} ({r1.effective_category}), but {r2.id} is rejected while {r1.id} got {d1.room_id} on {d1.day} P{d1.start_period}-P{d1.end_period}"
                            )
                            break
    return inversions
