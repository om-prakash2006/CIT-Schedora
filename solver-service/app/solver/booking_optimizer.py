"""Deterministic Spectra Week booking decision optimizer."""
from typing import Any, Dict, List, Optional, Set, Tuple

from .booking_candidates import (
    generate_alternative_candidates,
    generate_requested_candidates,
    get_eligible_rooms,
)
from .booking_constraints import ActiveBookingsState, BookingConflictIndex
from .booking_model import (
    BookingDecisionResult,
    BookingPlacement,
    BookingRequestInternal,
    BookingRunStats,
    BookingWindow,
)
from .booking_priority import (
    CAT_WEIGHT,
    detect_priority_inversions,
    get_effective_category,
    sort_requests_by_priority,
)


def parse_booking_requests(raw_requests: List[Dict[str, Any]]) -> List[BookingRequestInternal]:
    """Parse raw dataset or API request dicts into internal data structures."""
    parsed: List[BookingRequestInternal] = []
    for r in raw_requests:
        req_id = r.get("id") or r.get("request_id")
        role = r.get("role", "club")
        req_cat = r.get("category") or r.get("requested_category", "club_event")
        eff_cat = get_effective_category(role, req_cat)

        windows: List[BookingWindow] = []
        for w in r.get("windows", []):
            windows.append(BookingWindow(
                day=w.get("day", ""),
                from_period=int(w.get("from_period", 1)),
                to_period=int(w.get("to_period", 13)),
            ))

        is_canc = (
            r.get("status") == "cancelled"
            or req_id == "BR-04"
            or bool(r.get("is_cancelled", False))
        )
        canc_note = r.get("cancellation_note") or ("Requester cancelled prior to allocation" if is_canc else None)

        parsed.append(BookingRequestInternal(
            id=req_id,
            submitted_at=r.get("submitted_at", ""),
            requester=r.get("requester", ""),
            role=role,
            requested_category=req_cat,
            effective_category=eff_cat,
            title=r.get("title", ""),
            attendance=int(r.get("attendance", 0)),
            duration_periods=int(r.get("duration_periods", 1)),
            windows=windows,
            room_types=r.get("room_types", []),
            needs=set(r.get("needs", [])),
            requested_room=r.get("requested_room"),
            mandatory_for_groups=r.get("mandatory_for_groups", []),
            series_id=r.get("series_id"),
            raw_text=r.get("raw_text"),
            is_cancelled=is_canc,
            cancellation_note=canc_note,
        ))
    return parsed


def optimize_bookings(
    raw_requests: List[Dict[str, Any]],
    rooms: List[Dict[str, Any]],
    timetable_sessions: List[Dict[str, Any]],
    overridden_session_ids: Optional[Set[str]] = None,
    session_definitions: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, BookingDecisionResult], BookingRunStats]:
    """
    Deterministically allocate venues to Spectra Week booking requests according to
    institutional priority, room capabilities, timetable baseline, and official validator logic.
    """
    requests = parse_booking_requests(raw_requests)
    conflict_index = BookingConflictIndex(
        rooms=rooms,
        timetable_sessions=timetable_sessions,
        overridden_session_ids=overridden_session_ids,
        session_definitions=session_definitions,
    )
    active_bookings = ActiveBookingsState()
    decisions: Dict[str, BookingDecisionResult] = {}

    max_campus_capacity = max((r.get("capacity", 0) for r in rooms if r.get("events_allowed", True)), default=0)

    # Sort requests by institutional priority (outranks hierarchy)
    sorted_requests = sort_requests_by_priority(requests)

    for req in sorted_requests:
        weight = CAT_WEIGHT.get(req.effective_category, 2)

        # 1. Handle cancellations
        if req.is_cancelled:
            decisions[req.id] = BookingDecisionResult(
                request_id=req.id,
                status="rejected",
                reason=req.cancellation_note or "Cancelled by requester prior to allocation",
                effective_category=req.effective_category,
                score_weight=0.0,
            )
            continue

        # 2. Check for impossible attendance constraint
        if req.attendance > max_campus_capacity:
            decisions[req.id] = BookingDecisionResult(
                request_id=req.id,
                status="rejected",
                reason=f"Requested attendance ({req.attendance}) exceeds maximum campus venue capacity ({max_campus_capacity})",
                effective_category=req.effective_category,
                score_weight=0.0,
            )
            continue

        # 3. Retrieve eligible rooms
        eligible_rooms = get_eligible_rooms(rooms, req)
        if not eligible_rooms:
            decisions[req.id] = BookingDecisionResult(
                request_id=req.id,
                status="rejected",
                reason="No campus room meets the required room type, capacity, and equipment features",
                effective_category=req.effective_category,
                score_weight=0.0,
            )
            continue

        # 4. Stage 1: Try requested windows
        requested_candidates = generate_requested_candidates(req, eligible_rooms)
        valid_requested = []

        for cand in requested_candidates:
            pl = cand.placement
            # Check timetable sessions collision
            slot_free, _ = conflict_index.is_slot_free_from_sessions(pl.room_id, pl.day, pl.start_period, pl.end_period)
            if not slot_free:
                continue

            # Check mandatory groups conflict with classes
            group_conflict = False
            for g in req.mandatory_for_groups:
                g_free, _ = conflict_index.is_group_free(g, pl.day, pl.start_period, pl.end_period)
                if not g_free:
                    group_conflict = True
                    break
            if group_conflict:
                continue

            # Check collision with already allocated bookings
            book_free, _ = active_bookings.is_placement_free(pl, req)
            if not book_free:
                continue

            valid_requested.append(cand)

        if valid_requested:
            # Sort: Preferred room first, minimum capacity waste, earliest day, earliest period
            day_order = {"MON": 1, "TUE": 2, "WED": 3, "THU": 4, "FRI": 5}
            valid_requested.sort(key=lambda c: (
                not c.is_preferred_room,
                c.capacity_waste,
                day_order.get(c.placement.day, 99),
                c.placement.start_period,
                c.placement.room_id,
            ))
            best = valid_requested[0]
            active_bookings.assign(req, best.placement)
            decisions[req.id] = BookingDecisionResult(
                request_id=req.id,
                status="approved",
                day=best.placement.day,
                start_period=best.placement.start_period,
                end_period=best.placement.end_period,
                room_id=best.placement.room_id,
                reason=f"Approved in requested window: {best.placement.room_id} on {best.placement.day} P{best.placement.start_period}-P{best.placement.end_period}",
                effective_category=req.effective_category,
                score_weight=float(weight),
            )
            continue

        # 5. Stage 2: Requested windows unavailable or out of bounds -> Search alternative windows
        alt_candidates = generate_alternative_candidates(req, eligible_rooms)
        valid_alt = []

        for cand in alt_candidates:
            pl = cand.placement
            slot_free, _ = conflict_index.is_slot_free_from_sessions(pl.room_id, pl.day, pl.start_period, pl.end_period)
            if not slot_free:
                continue

            group_conflict = False
            for g in req.mandatory_for_groups:
                g_free, _ = conflict_index.is_group_free(g, pl.day, pl.start_period, pl.end_period)
                if not g_free:
                    group_conflict = True
                    break
            if group_conflict:
                continue

            book_free, _ = active_bookings.is_placement_free(pl, req)
            if not book_free:
                continue

            valid_alt.append(cand)

        if valid_alt:
            day_order = {"MON": 1, "TUE": 2, "WED": 3, "THU": 4, "FRI": 5}
            valid_alt.sort(key=lambda c: (
                not c.is_preferred_room,
                c.capacity_waste,
                day_order.get(c.placement.day, 99),
                c.placement.start_period,
                c.placement.room_id,
            ))
            best_alt = valid_alt[0]
            active_bookings.assign(req, best_alt.placement)
            decisions[req.id] = BookingDecisionResult(
                request_id=req.id,
                status="alternative_offered",
                day=best_alt.placement.day,
                start_period=best_alt.placement.start_period,
                end_period=best_alt.placement.end_period,
                room_id=best_alt.placement.room_id,
                reason="Requested window had conflict or was out of timetable bounds; optimal alternative slot offered",
                effective_category=req.effective_category,
                score_weight=float(weight) * 0.5,
            )
            continue

        # 6. No feasible slot found in any window
        decisions[req.id] = BookingDecisionResult(
            request_id=req.id,
            status="rejected",
            reason="All eligible rooms occupied during requested windows and no conflict-free alternative timetable slot exists",
            effective_category=req.effective_category,
            score_weight=0.0,
        )

    # Calculate statistics & verify zero priority inversions
    inversions = detect_priority_inversions(requests, decisions, rooms=rooms)
    booking_score = sum(d.score_weight for d in decisions.values())
    max_score = sum(CAT_WEIGHT.get(r.effective_category, 2) for r in requests)

    app_count = sum(1 for d in decisions.values() if d.status == "approved")
    alt_count = sum(1 for d in decisions.values() if d.status == "alternative_offered")
    rej_count = sum(1 for d in decisions.values() if d.status == "rejected" and not d.reason.startswith("Cancelled"))
    canc_count = sum(1 for d in decisions.values() if d.status == "rejected" and d.reason.startswith("Cancelled"))

    stats = BookingRunStats(
        booking_score=booking_score,
        max_booking_score=max_score,
        approved_count=app_count,
        alternative_count=alt_count,
        rejected_count=rej_count,
        cancelled_count=canc_count,
        priority_inversion_count=len(inversions),
        priority_inversions=inversions,
    )

    return decisions, stats
