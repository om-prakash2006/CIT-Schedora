"""Weekly timetable verification using the exact official validator.py."""
from typing import Any, Dict, List, Optional
from ..schemas import SoftPenaltyBreakdown, WeeklyValidationReport
from . import official_validator


def verify_weekly_timetable(
    data: Dict[str, Any],
    schedule: Dict[str, Any],
    team_name: str = "cit-schedora",
    solver_breakdown: Optional[SoftPenaltyBreakdown] = None,
    solver_total: Optional[int] = None,
) -> WeeklyValidationReport:
    """
    Validate a weekly timetable candidate using the unmodified official validator's
    Ctx, to_assign, check_timetable, and soft_score functions, plus allowed_uses
    and group/faculty accessibility checks.
    Labeled strictly as: WEEKLY TIMETABLE COMPONENT VALIDATION ONLY.
    """
    ctx = official_validator.Ctx(data)
    assign, dup = official_validator.to_assign(schedule)
    violations, _ = official_validator.check_timetable(ctx, assign, "timetable")

    for d in dup:
        violations.append(
            {
                "rule": "H1",
                "where": "timetable",
                "detail": f"Session {d} appears more than once",
            }
        )

    # Also enforce allowed_uses ("class" in room["allowed_uses"]) and faculty/group accessibility
    # if an external adversarial schedule tries to place a class in a seminar hall/OAT or non-accessible room
    for sid, (day, start, rid) in assign.items():
        s = ctx.sessions.get(sid)
        r = ctx.rooms.get(rid)
        if s is None or r is None:
            continue
        allowed_uses = set(r.get("allowed_uses", []))
        if s.get("kind") not in allowed_uses and "class" not in allowed_uses:
            violations.append(
                {
                    "rule": "H6",
                    "where": "timetable",
                    "detail": f"{sid}: room {rid} does not allow regular {s.get('kind')} classes (allowed_uses={r.get('allowed_uses')})",
                }
            )
        fac = ctx.fac.get(s["faculty_id"], {})
        grp_needs_acc = any(
            bool(ctx.groups.get(g, {}).get("needs_accessible")) for g in s.get("groups", [])
        )
        if (bool(fac.get("needs_accessible")) or grp_needs_acc) and not r.get("accessible"):
            if not any(
                v["rule"] == "H10" and v["detail"].startswith(f"{sid}:") for v in violations
            ):
                violations.append(
                    {
                        "rule": "H10",
                        "where": "timetable",
                        "detail": f"{sid}: faculty/group requires an accessible room, {rid} is not",
                    }
                )

    # Deduplicate violations in official validator style
    seen = set()
    uniq_violations: List[Dict[str, Any]] = []
    for x in violations:
        k = (x["rule"], x["detail"])
        if k not in seen:
            seen.add(k)
            uniq_violations.append(x)

    hard_by_rule: Dict[str, int] = {}
    for x in uniq_violations:
        hard_by_rule[x["rule"]] = hard_by_rule.get(x["rule"], 0) + 1

    soft_dict, soft_total = official_validator.soft_score(ctx, assign)
    official_breakdown = SoftPenaltyBreakdown(
        S1=int(soft_dict.get("S1", 0)),
        S2=int(soft_dict.get("S2", 0)),
        S3=int(soft_dict.get("S3", 0)),
        S4=int(soft_dict.get("S4", 0)),
        S5=int(soft_dict.get("S5", 0)),
        S6=int(soft_dict.get("S6", 0)),
    )

    calc_solver_breakdown = solver_breakdown if solver_breakdown is not None else official_breakdown
    calc_solver_total = solver_total if solver_total is not None else int(soft_total)

    parity_ok = (
        calc_solver_total == int(soft_total)
        and calc_solver_breakdown.S1 == official_breakdown.S1
        and calc_solver_breakdown.S2 == official_breakdown.S2
        and calc_solver_breakdown.S3 == official_breakdown.S3
        and calc_solver_breakdown.S4 == official_breakdown.S4
        and calc_solver_breakdown.S5 == official_breakdown.S5
        and calc_solver_breakdown.S6 == official_breakdown.S6
    )

    warnings: List[str] = []
    if data.get("dataset_id") != schedule.get("dataset_id"):
        warnings.append("schedule was made for a different dataset_id")
    if not parity_ok:
        warnings.append(
            f"Solver soft penalty ({calc_solver_total}: {calc_solver_breakdown.model_dump()}) "
            f"diverged from official validator ({soft_total}: {official_breakdown.model_dump()})"
        )

    return WeeklyValidationReport(
        validation_scope="WEEKLY TIMETABLE COMPONENT VALIDATION ONLY",
        dataset_id=str(data.get("dataset_id", "cit-public-v1")),
        schedule_dataset_id=str(schedule.get("dataset_id", data.get("dataset_id", "cit-public-v1"))),
        team=str(schedule.get("team", team_name)),
        is_valid=(len(uniq_violations) == 0 and parity_ok),
        hard_violation_count=len(uniq_violations),
        hard_by_rule=hard_by_rule,
        hard_violations=uniq_violations,
        soft_penalties=official_breakdown,
        soft_total=int(soft_total),
        solver_soft_penalties=calc_solver_breakdown,
        solver_soft_total=calc_solver_total,
        parity_verified=parity_ok,
        warnings=warnings,
    )
