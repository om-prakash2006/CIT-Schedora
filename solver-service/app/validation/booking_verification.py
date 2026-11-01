"""Spectra Week booking validation wrapper using the official CIT validator."""
from typing import Any, Dict, List, Optional
from .official_validator import Ctx, check_bookings, to_assign


def verify_spectra_week_bookings(
    data: Dict[str, Any],
    timetable_schedule: Dict[str, Any],
    fest_week: Dict[str, Any],
    team_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Run official validation on Spectra Week booking decisions."""
    ctx = Ctx(data)
    assign, _ = to_assign(timetable_schedule)

    violations, warnings, stats = check_bookings(ctx, assign, fest_week)

    return {
        "valid": len(violations) == 0,
        "team": team_name or timetable_schedule.get("team", "CIT Schedora"),
        "hard_violations": violations,
        "hard_violation_count": len(violations),
        "warnings": warnings,
        "warning_count": len(warnings),
        "stats": stats,
    }
