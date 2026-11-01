"""Pydantic request/response schemas for the CIT Schedora Weekly Timetable Solver."""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


SolverStatusLiteral = Literal[
    "OPTIMAL",
    "FEASIBLE",
    "INFEASIBLE",
    "UNKNOWN",
    "MODEL_INVALID",
]


class SolveParameters(BaseModel):
    timeout_seconds: float = Field(default=25.0, ge=0.5, le=120.0)
    num_workers: int = Field(default=8, ge=1, le=32)
    random_seed: int = Field(default=42)


class WeeklySolveRequest(BaseModel):
    dataset: Dict[str, Any]
    dataset_version_id: str = "v1-1a9cf4b23ac3"
    dataset_checksum: Optional[str] = None
    team_name: str = "cit-schedora"
    parameters: SolveParameters = Field(default_factory=SolveParameters)


class SessionAssignmentOut(BaseModel):
    session_id: str
    day: str
    start_period: int
    room_id: str
    duration: int
    course_id: Optional[str] = None
    kind: Optional[str] = None
    faculty_id: Optional[str] = None
    groups: List[str] = Field(default_factory=list)
    basket_slot: Optional[str] = None


class SoftPenaltyBreakdown(BaseModel):
    S1: int = 0
    S2: int = 0
    S3: int = 0
    S4: int = 0
    S5: int = 0
    S6: int = 0


class SolverDiagnostics(BaseModel):
    solver_name: str
    solver_version: str
    solver_status: SolverStatusLiteral
    is_optimal: bool
    solve_duration_ms: int
    objective_value: Optional[int] = None
    best_bound: Optional[int] = None
    optimality_gap: Optional[float] = None
    conflicts: int = 0
    branches: int = 0
    wall_time_seconds: float = 0.0
    total_sessions: int = 0
    scheduled_sessions: int = 0
    total_candidates: int = 0
    infeasible_sessions: List[Dict[str, Any]] = Field(default_factory=list)
    diagnostic_messages: List[str] = Field(default_factory=list)


class WeeklyValidationReport(BaseModel):
    validation_scope: str = "WEEKLY TIMETABLE COMPONENT VALIDATION ONLY"
    dataset_id: str
    schedule_dataset_id: str
    team: str
    is_valid: bool
    hard_violation_count: int
    hard_by_rule: Dict[str, int]
    hard_violations: List[Dict[str, Any]]
    soft_penalties: SoftPenaltyBreakdown
    soft_total: int
    solver_soft_penalties: SoftPenaltyBreakdown
    solver_soft_total: int
    parity_verified: bool
    warnings: List[str] = Field(default_factory=list)


class WeeklySolveResponse(BaseModel):
    dataset_id: str
    dataset_version_id: str
    team: str
    solver_status: SolverStatusLiteral
    schedule_state: str = "weekly_candidate"
    validation_scope: str = "WEEKLY TIMETABLE COMPONENT VALIDATION ONLY"
    sessions: List[SessionAssignmentOut]
    diagnostics: SolverDiagnostics
    validation_report: Optional[WeeklyValidationReport] = None


class WeeklyValidateRequest(BaseModel):
    dataset: Dict[str, Any]
    schedule: Dict[str, Any]
    team_name: str = "cit-schedora"


# ============================================================================
# PHASE 4B: DETERMINISTIC EXAMINATION SCHEDULER SCHEMAS
# ============================================================================

class ExamSolveRequest(BaseModel):
    dataset: Dict[str, Any]
    dataset_version_id: str = "v1-1a9cf4b23ac3"
    dataset_checksum: Optional[str] = None
    team_name: str = "cit-schedora"
    parameters: SolveParameters = Field(default_factory=SolveParameters)


class ExamAllocationOut(BaseModel):
    exam_id: str
    day: str
    session: str
    rooms: List[str]
    effective_capacity: int
    candidate_count: int
    course_ids: List[str] = Field(default_factory=list)
    groups: List[str] = Field(default_factory=list)


class ExamValidationReport(BaseModel):
    validation_scope: str = "EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY"
    dataset_id: str
    schedule_dataset_id: str
    team: str
    is_valid: bool
    hard_violation_count: int
    hard_by_rule: Dict[str, int]
    hard_violations: List[Dict[str, Any]]
    official_soft_penalty: int
    solver_soft_penalty: int
    parity_verified: bool
    total_exams: int
    scheduled_exams: int
    missing_exams: List[str] = Field(default_factory=list)
    duplicate_exams: List[str] = Field(default_factory=list)
    ineligible_room_violations: int = 0
    group_clashes: int = 0
    room_conflicts: int = 0
    capacity_violations: int = 0
    warnings: List[str] = Field(default_factory=list)


class ExamSolveResponse(BaseModel):
    dataset_id: str
    dataset_version_id: str
    team: str
    solver_status: SolverStatusLiteral
    schedule_state: str = "examination_candidate"
    validation_scope: str = "EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY"
    allocations: List[ExamAllocationOut]
    total_exams: int
    scheduled_exams: int
    rooms_allocated: int
    diagnostics: SolverDiagnostics
    validation_report: Optional[ExamValidationReport] = None


class ExamValidateRequest(BaseModel):
    dataset: Dict[str, Any]
    exams: Optional[List[Dict[str, Any]]] = None
    allocations: Optional[List[Dict[str, Any]]] = None
    team_name: str = "cit-schedora"

    def get_exams(self) -> List[Dict[str, Any]]:
        return self.exams or self.allocations or []


# ============================================================================
# PHASE 5: DETERMINISTIC SPECTRA WEEK BOOKING SCHEDULER SCHEMAS
# ============================================================================

class BookingDecisionOut(BaseModel):
    request_id: str
    status: str  # "approved", "alternative_offered", "rejected"
    day: Optional[str] = None
    start_period: Optional[int] = None
    end_period: Optional[int] = None
    room_id: Optional[str] = None
    reason: Optional[str] = None
    effective_category: str = "club_event"
    score_weight: float = 0.0
    requester: Optional[str] = None
    role: Optional[str] = None
    requested_category: Optional[str] = None
    attendance: Optional[int] = None
    title: Optional[str] = None
    requested_room: Optional[str] = None


class BookingStatsOut(BaseModel):
    booking_score: float
    max_booking_score: int
    score_percentage: float
    approved: int
    alternatives: int
    rejected: int
    cancelled: int
    session_overrides: int
    priority_inversion_count: int
    priority_inversions: List[str] = Field(default_factory=list)


class BookingValidationReport(BaseModel):
    validation_scope: str = "SPECTRA WEEK BOOKING COMPONENT VALIDATION ONLY"
    dataset_id: str
    team: str
    is_valid: bool
    hard_violation_count: int
    hard_violations: List[Dict[str, Any]] = Field(default_factory=list)
    warning_count: int = 0
    warnings: List[Dict[str, Any]] = Field(default_factory=list)
    booking_score: float
    max_booking_score: int
    approved: int
    alternatives: int
    rejected: int
    session_overrides: int
    priority_inversions: List[str] = Field(default_factory=list)
    parity_verified: bool = True


class BookingSolveRequest(BaseModel):
    dataset: Dict[str, Any]
    timetable_sessions: Optional[List[Dict[str, Any]]] = None
    booking_requests: Optional[List[Dict[str, Any]]] = None
    overridden_sessions: Optional[List[Dict[str, Any]]] = None
    dataset_version_id: str = "v1-1a9cf4b23ac3"
    team_name: str = "cit-schedora"


class BookingSolveResponse(BaseModel):
    dataset_id: str
    dataset_version_id: str
    team: str
    solver_status: str = "optimal"
    validation_scope: str = "SPECTRA WEEK BOOKING DECISION ENGINE"
    decisions: List[BookingDecisionOut]
    stats: BookingStatsOut
    official_fest_week: Dict[str, Any]
    validation_report: Optional[BookingValidationReport] = None


class BookingValidateRequest(BaseModel):
    dataset: Dict[str, Any]
    timetable_schedule: Dict[str, Any]
    fest_week: Dict[str, Any]
    team_name: str = "cit-schedora"

