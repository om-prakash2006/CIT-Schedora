"""Decision formatting and serialization for Spectra Week booking decisions."""
from typing import Any, Dict, List, Optional
from .booking_model import BookingDecisionResult, BookingRequestInternal


def format_official_booking_entry(decision: BookingDecisionResult) -> Dict[str, Any]:
    """Format decision for fest_week.bookings in schedule.json as required by validator.py."""
    entry: Dict[str, Any] = {
        "request_id": decision.request_id,
        "status": decision.status,
    }
    if decision.status in ("approved", "alternative_offered"):
        entry["day"] = decision.day
        entry["start_period"] = decision.start_period
        entry["end_period"] = decision.end_period
        entry["room_id"] = decision.room_id
    else:
        entry["day"] = None
        entry["start_period"] = None
        entry["end_period"] = None
        entry["room_id"] = None

    if decision.reason:
        entry["reason"] = decision.reason
    return entry


def format_enriched_decision(
    decision: BookingDecisionResult,
    req: BookingRequestInternal
) -> Dict[str, Any]:
    """Format comprehensive decision record for API responses and Firestore storage."""
    return {
        "requestId": decision.request_id,
        "status": decision.status,
        "day": decision.day,
        "startPeriod": decision.start_period,
        "endPeriod": decision.end_period,
        "roomId": decision.room_id,
        "reason": decision.reason,
        "requester": req.requester,
        "role": req.role,
        "requestedCategory": req.requested_category,
        "effectiveCategory": req.effective_category,
        "title": req.title,
        "attendance": req.attendance,
        "durationPeriods": req.duration_periods,
        "requestedRoom": req.requested_room,
        "scoreWeight": decision.score_weight,
    }
