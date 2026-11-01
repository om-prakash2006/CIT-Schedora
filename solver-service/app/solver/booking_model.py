"""Data models for deterministic Spectra Week booking engine."""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass(frozen=True)
class BookingWindow:
    day: str
    from_period: int
    to_period: int


@dataclass
class BookingRequestInternal:
    id: str
    submitted_at: str
    requester: str
    role: str
    requested_category: str
    effective_category: str
    title: str
    attendance: int
    duration_periods: int
    windows: List[BookingWindow]
    room_types: List[str]
    needs: Set[str]
    requested_room: Optional[str]
    mandatory_for_groups: List[str]
    series_id: Optional[str] = None
    raw_text: Optional[str] = None
    is_cancelled: bool = False
    cancellation_note: Optional[str] = None


@dataclass(frozen=True)
class BookingPlacement:
    room_id: str
    day: str
    start_period: int
    end_period: int


@dataclass
class BookingCandidate:
    placement: BookingPlacement
    is_requested_window: bool
    is_preferred_room: bool
    capacity_waste: int
    reason: str


@dataclass
class BookingDecisionResult:
    request_id: str
    status: str  # "approved", "rejected", "alternative_offered"
    day: Optional[str] = None
    start_period: Optional[int] = None
    end_period: Optional[int] = None
    room_id: Optional[str] = None
    reason: str = ""
    effective_category: str = "club_event"
    score_weight: float = 0.0


@dataclass
class BookingRunStats:
    booking_score: float
    max_booking_score: int
    approved_count: int
    alternative_count: int
    rejected_count: int
    cancelled_count: int
    priority_inversion_count: int
    priority_inversions: List[str] = field(default_factory=list)
