"""Constraint validation and conflict checking for Spectra Week booking engine."""
from typing import Any, Dict, List, Optional, Set, Tuple
from .booking_model import BookingPlacement, BookingRequestInternal


class BookingConflictIndex:
    """Index of occupied slots from base weekly timetable and room unavailabilities."""

    def __init__(
        self,
        rooms: List[Dict[str, Any]],
        timetable_sessions: List[Dict[str, Any]],
        overridden_session_ids: Optional[Set[str]] = None,
        session_definitions: Optional[Dict[str, Any]] = None,
    ):
        self.overridden_ids = overridden_session_ids or set()
        self.room_unavailability: Set[Tuple[str, str, int]] = set()
        self.session_room_occupancy: Dict[Tuple[str, str, int], str] = {}
        self.group_occupancy: Dict[Tuple[str, str, int], str] = {}
        self.rooms_by_id = {r["id"]: r for r in rooms}
        session_defs = session_definitions or {}

        # Index room unavailabilities
        for r in rooms:
            rid = r["id"]
            for u in r.get("unavailability", []):
                day = u.get("day")
                f_p = u.get("from_period", 1)
                t_p = u.get("to_period", 13)
                for p in range(f_p, t_p + 1):
                    self.room_unavailability.add((rid, day, p))

        # Index weekly timetable sessions (excluding overridden sessions)
        for s in timetable_sessions:
            sid = s.get("id") or s.get("session_id")
            if sid in self.overridden_ids:
                continue

            day = s.get("day")
            rid = s.get("room_id")
            start_p = s.get("start_period")
            if not day or not start_p:
                continue

            defn = session_defs.get(sid, {})
            duration = defn.get("duration") or defn.get("duration_periods") or s.get("duration") or 1
            end_p = s.get("end_period", start_p + duration - 1)
            groups = defn.get("groups") or defn.get("student_groups") or s.get("student_groups") or []

            for p in range(start_p, end_p + 1):
                if rid:
                    self.session_room_occupancy[(rid, day, p)] = sid or "session"
                for g in groups:
                    self.group_occupancy[(g, day, p)] = sid or "session"

    def is_slot_free_from_sessions(self, room_id: str, day: str, start_p: int, end_p: int) -> Tuple[bool, str]:
        """Verify room is not occupied by room unavailability or regular class sessions."""
        for p in range(start_p, end_p + 1):
            if (room_id, day, p) in self.room_unavailability:
                return False, f"Room {room_id} is unavailable on {day} period {p}"
            if (room_id, day, p) in self.session_room_occupancy:
                sess_id = self.session_room_occupancy[(room_id, day, p)]
                return False, f"Room {room_id} has scheduled class session {sess_id} on {day} period {p}"
        return True, "Free"

    def is_group_free(self, group: str, day: str, start_p: int, end_p: int) -> Tuple[bool, str]:
        """Verify student group does not have scheduled classes during periods."""
        for p in range(start_p, end_p + 1):
            if (group, day, p) in self.group_occupancy:
                sess_id = self.group_occupancy[(group, day, p)]
                return False, f"Student group {group} has class {sess_id} on {day} period {p}"
        return True, "Free"


class ActiveBookingsState:
    """Maintains active accepted/offered bookings and detects overlaps."""

    def __init__(self):
        # (room_id, day, period) -> request_id
        self.room_bookings: Dict[Tuple[str, str, int], str] = {}
        # (group, day, period) -> request_id
        self.group_bookings: Dict[Tuple[str, str, int], str] = {}
        # request_id -> placement
        self.placements: Dict[str, BookingPlacement] = {}

    def is_placement_free(
        self,
        placement: BookingPlacement,
        req: BookingRequestInternal
    ) -> Tuple[bool, str]:
        """Check if placement conflicts with already assigned bookings."""
        for p in range(placement.start_period, placement.end_period + 1):
            key = (placement.room_id, placement.day, p)
            if key in self.room_bookings:
                other_req = self.room_bookings[key]
                return False, f"Room {placement.room_id} already booked by {other_req} on {placement.day} P{p}"

            for g in req.mandatory_for_groups:
                g_key = (g, placement.day, p)
                if g_key in self.group_bookings:
                    other_req = self.group_bookings[g_key]
                    return False, f"Group {g} already booked for {other_req} on {placement.day} P{p}"

        return True, "Free"

    def assign(self, req: BookingRequestInternal, placement: BookingPlacement) -> None:
        """Record an approved or offered booking."""
        self.placements[req.id] = placement
        for p in range(placement.start_period, placement.end_period + 1):
            self.room_bookings[(placement.room_id, placement.day, p)] = req.id
            for g in req.mandatory_for_groups:
                self.group_bookings[(g, placement.day, p)] = req.id

    def remove(self, request_id: str) -> None:
        """Remove a booking if backtracking or releasing."""
        if request_id not in self.placements:
            return
        pl = self.placements.pop(request_id)
        for p in range(pl.start_period, pl.end_period + 1):
            key = (pl.room_id, pl.day, p)
            if self.room_bookings.get(key) == request_id:
                del self.room_bookings[key]
            # Remove group bookings
            to_del_groups = [gk for gk, v in self.group_bookings.items() if v == request_id]
            for gk in to_del_groups:
                del self.group_bookings[gk]
