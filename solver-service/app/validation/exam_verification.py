"""Examination timetable verification using the exact official validator.py."""
from collections import defaultdict
from typing import Any, Dict, List, Optional
from ..schemas import ExamValidationReport
from . import official_validator

VALIDATION_SCOPE_EXAMS = "EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY"


def compute_exam_soft_penalty(data: Dict[str, Any], exams_out: List[Dict[str, Any]]) -> int:
    """
    Standalone examination soft penalty calculator that exactly reproduces
    official_validator.check_exams soft penalty calculation:
      5 * max(0, exams_on_day - 1) for each group and day.
    """
    ex_map = {e["id"]: e for e in data.get("exams", [])}
    grp_day = defaultdict(set)
    for e in exams_out:
        eid = e.get("exam_id")
        if eid in ex_map and e.get("day"):
            for g in ex_map[eid].get("groups", []):
                grp_day[(g, e["day"])].add(eid)

    pen = 0
    for (g, day), eids in grp_day.items():
        if len(eids) > 1:
            pen += 5 * (len(eids) - 1)
    return pen


def verify_examination_schedule(
    data: Dict[str, Any],
    exams_out: List[Dict[str, Any]],
    team_name: str = "cit-schedora",
    solver_soft_penalty: Optional[int] = None,
) -> ExamValidationReport:
    """
    Validate an examination timetable candidate using the unmodified official validator's
    Ctx and check_exams functions. Labeled strictly as:
    EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY.
    """
    ctx = official_validator.Ctx(data)
    violations, official_pen = official_validator.check_exams(ctx, exams_out)

    calc_penalty = compute_exam_soft_penalty(data, exams_out)
    assert calc_penalty == official_pen, (
        f"Standalone exam soft penalty ({calc_penalty}) does not match official validator ({official_pen})"
    )

    hard_by_rule: Dict[str, int] = defaultdict(int)
    for v in violations:
        hard_by_rule[v["rule"]] += 1

    ineligible_rooms = hard_by_rule.get("E2", 0)
    group_clashes = hard_by_rule.get("H3", 0)
    room_conflicts = hard_by_rule.get("H4", 0)
    capacity_violations = hard_by_rule.get("H5", 0)

    # Detailed counts of scheduled, duplicate, and missing exams
    all_dataset_exams = {e["id"] for e in data.get("exams", [])}
    seen_exams = set()
    dup_exams = []
    scheduled_valid = []
    for e in exams_out:
        eid = e.get("exam_id")
        if not eid:
            continue
        if eid in seen_exams:
            dup_exams.append(eid)
        else:
            seen_exams.add(eid)
            if eid in all_dataset_exams:
                scheduled_valid.append(eid)

    missing_exams = sorted(all_dataset_exams - seen_exams)

    calc_solver_pen = (
        solver_soft_penalty if solver_soft_penalty is not None else int(official_pen)
    )
    parity_ok = calc_solver_pen == int(official_pen)

    warnings: List[str] = []
    if not parity_ok:
        warnings.append(
            f"Solver soft penalty ({calc_solver_pen}) diverged from official validator ({official_pen})"
        )

    is_valid = len(violations) == 0 and parity_ok and len(missing_exams) == 0

    return ExamValidationReport(
        validation_scope=VALIDATION_SCOPE_EXAMS,
        dataset_id=str(data.get("dataset_id", "cit-public-v1")),
        schedule_dataset_id=str(data.get("dataset_id", "cit-public-v1")),
        team=team_name,
        is_valid=is_valid,
        hard_violation_count=len(violations),
        hard_by_rule=dict(hard_by_rule),
        hard_violations=violations,
        official_soft_penalty=int(official_pen),
        solver_soft_penalty=calc_solver_pen,
        parity_verified=parity_ok,
        total_exams=len(all_dataset_exams),
        scheduled_exams=len(scheduled_valid),
        missing_exams=missing_exams,
        duplicate_exams=dup_exams,
        ineligible_room_violations=ineligible_rooms,
        group_clashes=group_clashes,
        room_conflicts=room_conflicts,
        capacity_violations=capacity_violations,
        warnings=warnings,
    )
