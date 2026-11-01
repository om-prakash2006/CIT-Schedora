from typing import Any, Dict, List, Optional, Set
from ..schemas import (
    BookingDecisionOut,
    BookingSolveRequest,
    BookingSolveResponse,
    BookingStatsOut,
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
from ..solver.booking_decisions import (
    format_enriched_decision,
    format_official_booking_entry,
)
from ..solver.booking_optimizer import optimize_bookings, parse_booking_requests
from ..solver.exam_solver import solve_examination_schedule
from ..solver.timetable_solver import solve_weekly_timetable
from ..validation.booking_verification import verify_spectra_week_bookings
from ..validation.exam_verification import verify_examination_schedule
from ..validation.result_verification import verify_weekly_timetable


class SchedulingService:
    """Service layer for weekly timetable, examinations, and Spectra Week booking decision engine."""

    @staticmethod
    def generate_weekly_timetable(req: WeeklySolveRequest) -> WeeklySolveResponse:
        return solve_weekly_timetable(
            data=req.dataset,
            dataset_version_id=req.dataset_version_id,
            team_name=req.team_name,
            params=req.parameters,
        )

    @staticmethod
    def validate_weekly_timetable(req: WeeklyValidateRequest) -> WeeklyValidationReport:
        return verify_weekly_timetable(
            data=req.dataset,
            schedule=req.schedule,
            team_name=req.team_name,
        )

    @staticmethod
    def generate_examination_schedule(req: ExamSolveRequest) -> ExamSolveResponse:
        return solve_examination_schedule(
            data=req.dataset,
            dataset_version_id=req.dataset_version_id,
            team_name=req.team_name,
            params=req.parameters,
        )

    @staticmethod
    def validate_examination_schedule(req: ExamValidateRequest) -> ExamValidationReport:
        return verify_examination_schedule(
            data=req.dataset,
            exams_out=req.get_exams(),
            team_name=req.team_name,
        )

    @staticmethod
    def generate_booking_decisions(req: BookingSolveRequest) -> BookingSolveResponse:
        dataset = req.dataset
        dataset_id = dataset.get("dataset_id", "cit-public-v1")
        rooms = dataset.get("rooms", [])

        # Get booking requests: from request override or dataset booking_requests
        raw_requests = req.booking_requests
        if raw_requests is None:
            raw_requests = dataset.get("booking_requests") or dataset.get("fest_week", {}).get("booking_requests", [])

        # Get timetable sessions: from request override or dataset sessions
        timetable_sessions = req.timetable_sessions
        if timetable_sessions is None:
            timetable_sessions = dataset.get("sessions", [])

        overridden_sessions = req.overridden_sessions or []
        overridden_ids = {s.get("session_id") or s.get("id") for s in overridden_sessions}
        session_defs = {s["id"]: s for s in dataset.get("sessions", [])}

        # Run deterministic optimization
        decisions_map, stats = optimize_bookings(
            raw_requests=raw_requests,
            rooms=rooms,
            timetable_sessions=timetable_sessions,
            overridden_session_ids=overridden_ids,
            session_definitions=session_defs,
        )

        # Parse requests for metadata enrichment
        parsed_requests = parse_booking_requests(raw_requests)
        parsed_by_id = {r.id: r for r in parsed_requests}

        official_bookings = []
        enriched_decisions = []
        for req_id, dec in decisions_map.items():
            official_bookings.append(format_official_booking_entry(dec))
            parsed_r = parsed_by_id.get(req_id)
            if parsed_r:
                enr = format_enriched_decision(dec, parsed_r)
                enriched_decisions.append(BookingDecisionOut(
                    request_id=enr["requestId"],
                    status=enr["status"],
                    day=enr["day"],
                    start_period=enr["startPeriod"],
                    end_period=enr["endPeriod"],
                    room_id=enr["roomId"],
                    reason=enr["reason"],
                    effective_category=enr["effectiveCategory"],
                    score_weight=enr["scoreWeight"],
                    requester=enr["requester"],
                    role=enr["role"],
                    requested_category=enr["requestedCategory"],
                    attendance=enr["attendance"],
                    title=enr["title"],
                    requested_room=enr["requestedRoom"],
                ))

        official_fest_week = {
            "session_overrides": overridden_sessions,
            "bookings": official_bookings,
        }

        # Run official validator verification
        sched_for_val = {"sessions": timetable_sessions, "team": req.team_name, "dataset_id": dataset_id}
        val_result = verify_spectra_week_bookings(
            data=dataset,
            timetable_schedule=sched_for_val,
            fest_week=official_fest_week,
            team_name=req.team_name,
        )

        b_stats = val_result["stats"]
        stats_out = BookingStatsOut(
            booking_score=float(b_stats.get("booking_score", stats.booking_score)),
            max_booking_score=int(b_stats.get("booking_score_max_if_all_approved", stats.max_booking_score)),
            score_percentage=round((float(b_stats.get("booking_score", stats.booking_score)) / max(1, int(b_stats.get("booking_score_max_if_all_approved", stats.max_booking_score)))) * 100, 2),
            approved=int(b_stats.get("approved", stats.approved_count)),
            alternatives=int(b_stats.get("alternatives", stats.alternative_count)),
            rejected=int(b_stats.get("rejected", stats.rejected_count)),
            cancelled=stats.cancelled_count,
            session_overrides=int(b_stats.get("session_overrides", 0)),
            priority_inversion_count=len(b_stats.get("priority_inversions", [])),
            priority_inversions=b_stats.get("priority_inversions", []),
        )

        val_report = BookingValidationReport(
            dataset_id=dataset_id,
            team=req.team_name,
            is_valid=val_result["valid"],
            hard_violation_count=val_result["hard_violation_count"],
            hard_violations=val_result["hard_violations"],
            warning_count=val_result["warning_count"],
            warnings=val_result["warnings"],
            booking_score=stats_out.booking_score,
            max_booking_score=stats_out.max_booking_score,
            approved=stats_out.approved,
            alternatives=stats_out.alternatives,
            rejected=stats_out.rejected,
            session_overrides=stats_out.session_overrides,
            priority_inversions=stats_out.priority_inversions,
            parity_verified=True,
        )

        return BookingSolveResponse(
            dataset_id=dataset_id,
            dataset_version_id=req.dataset_version_id,
            team=req.team_name,
            decisions=enriched_decisions,
            stats=stats_out,
            official_fest_week=official_fest_week,
            validation_report=val_report,
        )

    @staticmethod
    def validate_booking_decisions(req: BookingValidateRequest) -> BookingValidationReport:
        val_result = verify_spectra_week_bookings(
            data=req.dataset,
            timetable_schedule=req.timetable_schedule,
            fest_week=req.fest_week,
            team_name=req.team_name,
        )
        b_stats = val_result["stats"]
        score = float(b_stats.get("booking_score", 0.0))
        max_score = int(b_stats.get("booking_score_max_if_all_approved", 0))

        return BookingValidationReport(
            dataset_id=req.dataset.get("dataset_id", "cit-public-v1"),
            team=req.team_name,
            is_valid=val_result["valid"],
            hard_violation_count=val_result["hard_violation_count"],
            hard_violations=val_result["hard_violations"],
            warning_count=val_result["warning_count"],
            warnings=val_result["warnings"],
            booking_score=score,
            max_booking_score=max_score,
            approved=int(b_stats.get("approved", 0)),
            alternatives=int(b_stats.get("alternatives", 0)),
            rejected=int(b_stats.get("rejected", 0)),
            session_overrides=int(b_stats.get("session_overrides", 0)),
            priority_inversions=b_stats.get("priority_inversions", []),
            parity_verified=True,
        )

    @staticmethod
    def reschedule_timetable(req_data: Dict[str, Any]) -> Dict[str, Any]:
        from ..solver.rescheduling_solver import solve_rescheduling
        dataset = req_data.get("dataset", {})
        disruption = req_data.get("disruption", {})
        baseline_sessions = req_data.get("baseline_sessions", [])
        timeout = float(req_data.get("timeout_seconds", 15.0))

        res = solve_rescheduling(
            raw_dataset=dataset,
            disruption=disruption,
            baseline_sessions=baseline_sessions,
            solver_timeout_seconds=timeout,
        )
        return res
