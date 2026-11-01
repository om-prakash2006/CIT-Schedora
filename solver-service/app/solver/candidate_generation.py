"""Candidate placement generation and domain pruning for weekly timetable sessions."""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

LAST_TEACHING_PERIOD = 9


@dataclass(frozen=True)
class CandidatePlacement:
    session_id: str
    day: str
    start_period: int
    room_id: str
    duration: int
    periods: Tuple[int, ...]
    static_soft_cost: int
    s1_cost: int
    s5_cost: int
    s6_cost: int


@dataclass
class CandidateGenerationResult:
    candidates_by_session: Dict[str, List[CandidatePlacement]] = field(default_factory=dict)
    basket_sessions: Dict[str, List[str]] = field(default_factory=dict)
    basket_valid_time_slots: Dict[str, List[Tuple[str, int]]] = field(default_factory=dict)
    infeasible_sessions: List[Dict[str, Any]] = field(default_factory=list)
    total_candidates: int = 0


def get_period_block(start_period: int, duration: int) -> Tuple[int, ...]:
    return tuple(range(start_period, start_period + duration))


def requires_accessible_room(
    session: Dict[str, Any],
    faculty_map: Dict[str, Dict[str, Any]],
    group_map: Dict[str, Dict[str, Any]],
) -> bool:
    if bool(session.get("needs_accessible")):
        return True
    fac = faculty_map.get(session.get("faculty_id", ""), {})
    if bool(fac.get("needs_accessible")):
        return True
    for gid in session.get("groups", []):
        grp = group_map.get(gid, {})
        if bool(grp.get("needs_accessible")):
            return True
    return False


def compute_static_candidate_costs(
    session: Dict[str, Any],
    room: Dict[str, Any],
    day: str,
    periods: Tuple[int, ...],
    faculty_map: Dict[str, Dict[str, Any]],
    all_days: List[str],
) -> Tuple[int, int, int]:
    """Compute S1, S5, and S6 costs for a single candidate placement."""
    s1 = 0
    fac = faculty_map.get(session["faculty_id"], {})
    for pref in fac.get("preferences", []):
        if pref.get("type") == "avoid" and day in pref.get("days", all_days):
            pref_periods = set(pref.get("periods", []))
            s1 += 2 * sum(1 for p in periods if p in pref_periods)

    cap = int(room.get("capacity", 0))
    size = int(session.get("size", 0))
    # Exact check for size / cap < 0.4 -> size * 10 < cap * 4
    s5 = 1 if (cap > 0 and size * 10 < cap * 4) else 0

    s6 = 1 if LAST_TEACHING_PERIOD in periods else 0
    return s1, s5, s6


def generate_candidates(data: Dict[str, Any]) -> CandidateGenerationResult:
    """
    Generate feasible (day, start_period, room_id) placements for every session.
    Strictly enforces domain-level hard constraints:
      - H5: room.capacity >= session.size
      - H6: room.type in session.room_types and "class" in room.allowed_uses
      - H7: faculty not unavailable on any covered period
      - H8: room not unavailable on any covered period
      - H9: periods within 1..9, no crossing lunch after P5, lab starts in {2, 6}
      - H10: accessible room when required by session, faculty, or student group
      - H14: fixed_slot exact match on day and start_period
    """
    result = CandidateGenerationResult()
    calendar = data.get("calendar", {})
    days: List[str] = list(calendar.get("days", ["MON", "TUE", "WED", "THU", "FRI"]))
    lab_starts: Set[int] = set(calendar.get("lab_start_periods", [2, 6]))
    lunch_after: int = int(calendar.get("lunch", {}).get("after_period", 5))

    rooms: List[Dict[str, Any]] = data.get("rooms", [])
    faculty_map: Dict[str, Dict[str, Any]] = {f["id"]: f for f in data.get("faculty", [])}
    group_map: Dict[str, Dict[str, Any]] = {g["id"]: g for g in data.get("student_groups", [])}
    sessions: List[Dict[str, Any]] = data.get("sessions", [])

    fac_unavail: Dict[str, Set[Tuple[str, int]]] = {}
    for f in data.get("faculty", []):
        un_set: Set[Tuple[str, int]] = set()
        for u in f.get("unavailable", []):
            for p in u.get("periods", []):
                un_set.add((u["day"], int(p)))
        fac_unavail[f["id"]] = un_set

    room_unavail: Dict[str, Set[Tuple[str, int]]] = {}
    for u in data.get("room_unavailability", []):
        rid = u["room_id"]
        if rid not in room_unavail:
            room_unavail[rid] = set()
        for p in u.get("periods", []):
            room_unavail[rid].add((u["day"], int(p)))

    for s in sessions:
        sid = s["id"]
        dur = int(s["duration"])
        kind = s.get("kind", "lecture")
        fac_id = s["faculty_id"]
        size = int(s["size"])
        allowed_room_types = set(s.get("room_types", []))
        needs_acc = requires_accessible_room(s, faculty_map, group_map)
        fixed_slot = s.get("fixed_slot")
        basket_slot = s.get("basket_slot")

        if basket_slot:
            result.basket_sessions.setdefault(basket_slot, []).append(sid)

        # Pre-filter compatible rooms (H5, H6, H10)
        compatible_rooms: List[Dict[str, Any]] = []
        for r in rooms:
            allowed_uses = set(r.get("allowed_uses", []))
            if kind not in allowed_uses and "class" not in allowed_uses:
                continue
            if r.get("type") not in allowed_room_types:
                continue
            if int(r.get("capacity", 0)) < size:
                continue
            if needs_acc and not bool(r.get("accessible", False)):
                continue
            compatible_rooms.append(r)

        session_candidates: List[CandidatePlacement] = []
        rejection_reasons: List[str] = []

        if not compatible_rooms:
            rejection_reasons.append(
                f"No compatible classroom/lab with capacity >= {size}, types in {sorted(allowed_room_types)}, accessible={needs_acc}"
            )

        fac_max_hours = int(faculty_map.get(fac_id, {}).get("max_hours_per_day", 4))
        if dur > fac_max_hours:
            rejection_reasons.append(
                f"Session duration {dur} exceeds faculty {fac_id} max_hours_per_day {fac_max_hours} (H12)"
            )
        else:
            for day in days:
                if fixed_slot and fixed_slot.get("day") != day:
                    continue
                for start_p in range(1, LAST_TEACHING_PERIOD - dur + 2):
                    if fixed_slot and int(fixed_slot.get("start_period")) != start_p:
                        continue
                    periods = get_period_block(start_p, dur)
                    # H9: Cannot cross lunch boundary after P5
                    if periods[0] <= lunch_after < periods[-1]:
                        continue
                    # H9: Lab start restriction
                    if kind == "lab" and start_p not in lab_starts:
                        continue
                    # H7: Faculty unavailability
                    f_un = fac_unavail.get(fac_id, set())
                    if any((day, p) in f_un for p in periods):
                        continue

                    slot_cands: List[CandidatePlacement] = []
                    for r in compatible_rooms:
                        rid = r["id"]
                        r_un = room_unavail.get(rid, set())
                        # H8: Room unavailability
                        if any((day, p) in r_un for p in periods):
                            continue

                        s1, s5, s6 = compute_static_candidate_costs(
                            s, r, day, periods, faculty_map, days
                        )
                        cand = CandidatePlacement(
                            session_id=sid,
                            day=day,
                            start_period=start_p,
                            room_id=rid,
                            duration=dur,
                            periods=periods,
                            static_soft_cost=s1 + s5 + s6,
                            s1_cost=s1,
                            s5_cost=s5,
                            s6_cost=s6,
                        )
                        slot_cands.append(cand)

                    if len(slot_cands) > 4 and not fixed_slot and not basket_slot:
                        import hashlib

                        slot_cands.sort(
                            key=lambda c: (
                                c.s5_cost,
                                hashlib.md5(f"{sid}:{c.room_id}".encode()).hexdigest(),
                            )
                        )
                        slot_cands = slot_cands[:4]

                    session_candidates.extend(slot_cands)

        result.candidates_by_session[sid] = session_candidates
        result.total_candidates += len(session_candidates)

        if not session_candidates:
            if not rejection_reasons:
                rejection_reasons.append(
                    "All valid time/room slots eliminated by fixed_slot, faculty unavailability, or room unavailability"
                )
            result.infeasible_sessions.append(
                {
                    "session_id": sid,
                    "course_id": s.get("course_id"),
                    "faculty_id": fac_id,
                    "groups": s.get("groups", []),
                    "kind": kind,
                    "size": size,
                    "fixed_slot": fixed_slot,
                    "reasons": rejection_reasons,
                }
            )

    # H11: Intersect valid (day, start_period) slots across all sessions in each elective basket
    for basket_id, sids in result.basket_sessions.items():
        common_slots: Optional[Set[Tuple[str, int]]] = None
        for sid in sids:
            slots = {(c.day, c.start_period) for c in result.candidates_by_session.get(sid, [])}
            if common_slots is None:
                common_slots = slots
            else:
                common_slots &= slots
        valid_slots = sorted(common_slots or set())
        result.basket_valid_time_slots[basket_id] = valid_slots

        # Prune basket session candidates not in common_slots
        valid_slot_set = set(valid_slots)
        for sid in sids:
            filtered = [
                c
                for c in result.candidates_by_session.get(sid, [])
                if (c.day, c.start_period) in valid_slot_set
            ]
            removed = len(result.candidates_by_session.get(sid, [])) - len(filtered)
            result.total_candidates -= removed
            result.candidates_by_session[sid] = filtered
            if not filtered and not any(x["session_id"] == sid for x in result.infeasible_sessions):
                result.infeasible_sessions.append(
                    {
                        "session_id": sid,
                        "basket_slot": basket_id,
                        "reasons": [
                            f"No synchronized time slot available across all sessions in elective basket {basket_id} (H11)"
                        ],
                    }
                )

    return result
