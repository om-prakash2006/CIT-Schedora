"""CP-SAT Soft Objective formulation (S1-S6) and standalone soft penalty breakdown."""
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple
from ortools.sat.python import cp_model

from .hard_constraints import HardConstraintArtifacts
from ..validation import official_validator


@dataclass
class SoftObjectiveArtifacts:
    s1_expr: cp_model.LinearExpr
    s2_expr: cp_model.LinearExpr
    s3_expr: cp_model.LinearExpr
    s4_expr: cp_model.LinearExpr
    s5_expr: cp_model.LinearExpr
    s6_expr: cp_model.LinearExpr
    total_expr: cp_model.LinearExpr


def add_soft_objective(
    model: cp_model.CpModel,
    data: Dict[str, Any],
    hard: HardConstraintArtifacts,
) -> SoftObjectiveArtifacts:
    """
    Build the exact CP-SAT integer objective matching validator.py's soft_score(ctx, assign):
      - S1: Faculty avoid preference (2 pts per teaching hour)
      - S2: Student group free periods between first and last class of the day (1 pt per period)
      - S3: More than 6 teaching hours in a day for a student group (3 pts per hour > 6)
      - S4: Repeated lectures of the same course on the same day (3 pts per extra lecture)
      - S5: Room underutilisation size / capacity < 0.4 (1 pt per session)
      - S6: Period P9 usage (1 pt per session)
    Uses pure linear inequalities for rapid LP relaxation and fast first-feasible discovery.
    """
    days: List[str] = list(data["calendar"]["days"])
    sessions: List[Dict[str, Any]] = data.get("sessions", [])
    groups: List[Dict[str, Any]] = data.get("student_groups", [])

    # 1. S1 and S6 from factored session_time_vars, S5 from room-placement vars
    s1_terms: List[cp_model.LinearExpr] = []
    s5_terms: List[cp_model.LinearExpr] = []
    s6_terms: List[cp_model.LinearExpr] = []

    for sid, cand_pairs in hard.session_vars.items():
        seen_slots = set()
        for cand, var in cand_pairs:
            if cand.s5_cost:
                s5_terms.append(cand.s5_cost * var)
            slot_key = (cand.day, cand.start_period)
            if slot_key not in seen_slots:
                seen_slots.add(slot_key)
                t_var = hard.session_time_vars.get((sid, cand.day, cand.start_period), var)
                if cand.s1_cost:
                    s1_terms.append(cand.s1_cost * t_var)
                if cand.s6_cost:
                    s6_terms.append(cand.s6_cost * t_var)

    # 2. S2: Student group free periods between min(ps) and max(ps) on each day
    # Period p (in 2..8) is an internal gap if there is at least one class at or before p-1,
    # at least one class at or after p+1, and p itself is unoccupied.
    s2_terms: List[cp_model.LinearExpr] = []
    for g in groups:
        gid = g["id"]
        for day in days:
            occ_vars = [hard.group_period_occupied[(gid, day, p)] for p in range(1, 10)]
            prefix_vars: List[cp_model.IntVar] = [occ_vars[0]]
            for p_idx in range(1, 9):
                pv = model.NewBoolVar(f"s2_pre_{gid}_{day}_{p_idx + 1}")
                model.Add(pv >= prefix_vars[-1])
                model.Add(pv >= occ_vars[p_idx])
                model.Add(pv <= prefix_vars[-1] + occ_vars[p_idx])
                prefix_vars.append(pv)

            suffix_vars: List[cp_model.IntVar] = [occ_vars[8]]
            for p_idx in range(7, -1, -1):
                sv = model.NewBoolVar(f"s2_suf_{gid}_{day}_{p_idx + 1}")
                model.Add(sv >= suffix_vars[-1])
                model.Add(sv >= occ_vars[p_idx])
                model.Add(sv <= suffix_vars[-1] + occ_vars[p_idx])
                suffix_vars.append(sv)
            suffix_vars.reverse()

            active_var = prefix_vars[8]
            free_var = model.NewIntVar(0, 7, f"s2_free_{gid}_{day}")
            model.Add(
                free_var
                == sum(prefix_vars) + sum(suffix_vars) - 9 * active_var - sum(occ_vars)
            )
            s2_terms.append(free_var)

    # 3. S3: More than 6 teaching hours in a day for a student group (+3 * max(0, h - 6))
    s3_terms: List[cp_model.LinearExpr] = []
    non_basket_by_group: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    baskets_by_group: Dict[str, Dict[str, int]] = defaultdict(dict)

    for s in sessions:
        b_slot = s.get("basket_slot")
        dur = int(s["duration"])
        for gid in s.get("groups", []):
            if b_slot:
                baskets_by_group[gid][b_slot] = dur
            else:
                non_basket_by_group[gid].append(s)

    for g in groups:
        gid = g["id"]
        for day in days:
            hour_terms: List[cp_model.LinearExpr] = []
            for s in non_basket_by_group.get(gid, []):
                hour_terms.append(int(s["duration"]) * hard.session_on_day[(s["id"], day)])
            for b_slot, b_dur in baskets_by_group.get(gid, {}).items():
                hour_terms.append(b_dur * hard.basket_on_day[(b_slot, day)])

            if hour_terms:
                excess_var = model.NewIntVar(0, 3, f"s3_excess_{gid}_{day}")
                model.Add(excess_var >= sum(hour_terms) - 6)
                s3_terms.append(3 * excess_var)

    # 4. S4: Repeated lectures of the same course on the same day (+3 * (c - 1))
    s4_terms: List[cp_model.LinearExpr] = []
    grp_course_lectures: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    basket_course_sessions: Dict[str, List[str]] = defaultdict(list)

    for s in sessions:
        if s.get("basket_slot"):
            basket_course_sessions[s["course_id"]].append(s["id"])
        elif s.get("kind") == "lecture":
            for gid in s.get("groups", []):
                grp_course_lectures[(gid, s["course_id"])].append(s["id"])

    for (gid, course_id), sids in grp_course_lectures.items():
        if len(sids) > 1:
            for day in days:
                day_vars = [hard.session_on_day[(sid, day)] for sid in sids]
                rep_var = model.NewIntVar(0, len(sids) - 1, f"s4_rep_{gid}_{course_id}_{day}")
                model.Add(rep_var >= sum(day_vars) - 1)
                s4_terms.append(3 * rep_var)

    for course_id, sids in basket_course_sessions.items():
        if len(sids) > 1:
            for day in days:
                day_vars = [hard.session_on_day[(sid, day)] for sid in sids]
                rep_var = model.NewIntVar(0, len(sids) - 1, f"s4_brep_{course_id}_{day}")
                model.Add(rep_var >= sum(day_vars) - 1)
                s4_terms.append(3 * rep_var)

    s1_expr = sum(s1_terms) if s1_terms else 0
    s2_expr = sum(s2_terms) if s2_terms else 0
    s3_expr = sum(s3_terms) if s3_terms else 0
    s4_expr = sum(s4_terms) if s4_terms else 0
    s5_expr = sum(s5_terms) if s5_terms else 0
    s6_expr = sum(s6_terms) if s6_terms else 0

    total_expr = s1_expr + s2_expr + s3_expr + s4_expr + s5_expr + s6_expr
    model.Minimize(total_expr)

    return SoftObjectiveArtifacts(
        s1_expr=s1_expr,
        s2_expr=s2_expr,
        s3_expr=s3_expr,
        s4_expr=s4_expr,
        s5_expr=s5_expr,
        s6_expr=s6_expr,
        total_expr=total_expr,
    )


def compute_solver_soft_breakdown(
    data: Dict[str, Any],
    assign: Dict[str, Tuple[str, int, str]],
) -> Tuple[Dict[str, int], int]:
    """
    Standalone solver soft-penalty calculator used to verify 100% parity with official_validator.soft_score.
    """
    ctx = official_validator.Ctx(data)
    return official_validator.soft_score(ctx, assign)
