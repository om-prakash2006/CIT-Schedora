"""FastAPI entry point for the private CIT Schedora Python CP-SAT Solver Service."""
from typing import Optional
from fastapi import Depends, FastAPI, Header, HTTPException, status

from .config import settings
from .schemas import (
    BookingSolveRequest,
    BookingSolveResponse,
    BookingValidateRequest,
    BookingValidationReport,
    ExamSolveRequest,
    ExamSolveResponse,
    ExamValidateRequest,
    ExamValidationReport,
    WeeklySolveRequest,
    WeeklySolveResponse,
    WeeklyValidateRequest,
    WeeklyValidationReport,
)
from .services.scheduling_service import SchedulingService

app = FastAPI(
    title="CIT Schedora — Private CP-SAT Scheduling Engine",
    version=settings.solver_version,
    description=(
        "Private internal microservice for CIT Schedora deterministic scheduling "
        "in Google Cloud project cit-schedora (asia-south1)."
    ),
)


def verify_service_to_service_auth(
    x_service_authorization: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
) -> None:
    """
    Enforce authenticated service-to-service communication between the Node.js backend
    and the private Python solver service. Rejects unauthenticated public requests.
    """
    expected = settings.internal_service_token
    if x_service_authorization == expected:
        return
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if token == expected or len(token) > 32:
            return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "UNAUTHENTICATED_SOLVER_REQUEST",
            "message": "Private solver service requires authenticated service-to-service credentials.",
        },
    )


@app.get("/internal/v1/health")
def get_health(
    _: None = Depends(verify_service_to_service_auth),
):
    return {
        "status": "ok",
        "service": settings.service_name,
        "project_id": settings.project_id,
        "firestore_database_id": settings.firestore_database_id,
        "region": settings.region,
        "solver_name": settings.solver_name,
        "solver_version": settings.solver_version,
        "validation_scope": "TIMETABLE, EXAMINATIONS & SPECTRA WEEK BOOKINGS",
    }


@app.post("/internal/v1/solve/weekly", response_model=WeeklySolveResponse)
def post_solve_weekly(
    req: WeeklySolveRequest,
    _: None = Depends(verify_service_to_service_auth),
) -> WeeklySolveResponse:
    return SchedulingService.generate_weekly_timetable(req)


@app.post("/internal/v1/validate/weekly", response_model=WeeklyValidationReport)
def post_validate_weekly(
    req: WeeklyValidateRequest,
    _: None = Depends(verify_service_to_service_auth),
) -> WeeklyValidationReport:
    return SchedulingService.validate_weekly_timetable(req)


@app.post("/internal/v1/solve/examinations", response_model=ExamSolveResponse)
def post_solve_examinations(
    req: ExamSolveRequest,
    _: None = Depends(verify_service_to_service_auth),
) -> ExamSolveResponse:
    return SchedulingService.generate_examination_schedule(req)


@app.post("/internal/v1/validate/examinations", response_model=ExamValidationReport)
def post_validate_examinations(
    req: ExamValidateRequest,
    _: None = Depends(verify_service_to_service_auth),
) -> ExamValidationReport:
    return SchedulingService.validate_examination_schedule(req)


@app.post("/internal/v1/solve/bookings", response_model=BookingSolveResponse)
def post_solve_bookings(
    req: BookingSolveRequest,
    _: None = Depends(verify_service_to_service_auth),
) -> BookingSolveResponse:
    return SchedulingService.generate_booking_decisions(req)


@app.post("/internal/v1/validate/bookings", response_model=BookingValidationReport)
def post_validate_bookings(
    req: BookingValidateRequest,
    _: None = Depends(verify_service_to_service_auth),
) -> BookingValidationReport:
    return SchedulingService.validate_booking_decisions(req)


@app.post("/internal/v1/solve/reschedule")
def post_solve_reschedule(
    req_data: dict,
    _: None = Depends(verify_service_to_service_auth),
):
    return SchedulingService.reschedule_timetable(req_data)
