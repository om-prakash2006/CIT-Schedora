"""CP-SAT Hard Constraint formulation (H1-H12, H14) for the Weekly Timetable Solver."""
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple
from ortools.sat.python import cp_model

from .candidate_generation import CandidateGenerationResult, CandidatePlacement


@dataclass
class HardConstraintArtifacts:
    # sid -> list of (CandidatePlacement, BoolVar)
    session_vars: Dict[str, List[Tuple[CandidatePlacement, cp_model.IntVar]]] = field(default_factory=dict)
    # (sid, day, start_period) -> BoolVar (1 iff session sid starts at day, start_period)
    session_time_vars: Dict[Tuple[str, str, int], cp_model.IntVar] = field(default_factory=dict)
    # (sid, day) -> BoolVar (1 iff session sid is scheduled on day)
    session_on_day: Dict[Tuple[str, str], cp_model.IntVar] = field(default_factory=dict)
    # (basket_id, day, start_period) -> BoolVar
    basket_slot_vars: Dict[Tuple[str, str, int], cp_model.IntVar] = field(default_factory=dict)
    # (basket_id, day) -> BoolVar
    basket_on_day: Dict[Tuple[str, str], cp_model.IntVar] = field(default_factory=dict)
    # (group_id, day, period) -> BoolVar (1 iff group has a class at day, period)
    group_period_occupied: Dict[Tuple[str, str, int], cp_model.IntVar] = field(default_factory=dict)


def add_hard_constraints(
    model: cp_model.CpModel,
    data: Dict[str, Any],
    cand_result: CandidateGenerationResult,
) -> HardConstraintArtifacts:
    """
    Build all decision variables and enforce Hard Constraints H1-H12 and H14 on the CP-SAT model.
    Uses factored time-slot indicators t[sid, day, start_p] so faculty (H2), student-group (H3),
    elective-basket (H11), and daily-load (H12) constraints do not duplicate across compatible rooms.
    """
    artifacts = HardConstraintArtifacts()
    days: List[str] = list(data["calendar"]["days"])
    sessions_by_id: Dict[str, Dict[str, Any]] = {s["id"]: s for s in data["sessions"]}
    faculty_by_id: Dict[str, Dict[str, Any]] = {f["id"]: f for f in data["faculty"]}

    # Track occupancy lists for H2 (faculty), H3 (student group), H4 (room), H12 (faculty daily hours)
    room_period_vars: Dict[Tuple[str, str, int], List[cp_model.IntVar]] = defaultdict(list)
    fac_period_vars: Dict[Tuple[str, str, int], List[cp_model.IntVar]] = defaultdict(list)
    fac_day_terms: Dict[Tuple[str, str], List[cp_model.LinearExpr]] = defaultdict(list)
    group_period_vars: Dict[Tuple[str, str, int], List[cp_model.IntVar]] = defaultdict(list)

    # 1. Create synchronized time-slot variables for each elective basket (H11)
    for basket_id, valid_slots in cand_result.basket_valid_time_slots.items():
        b_vars: List[cp_model.IntVar] = []
        by_day: Dict[str, List[cp_model.IntVar]] = defaultdict(list)
        for day, start_p in valid_slots:
            b_var = model.NewBoolVar(f"basket_{basket_id}_{day}_P{start_p}")
            artifacts.basket_slot_vars[(basket_id, day, start_p)] = b_var
            b_vars.append(b_var)
            by_day[day].append(b_var)
        if b_vars:
            model.AddExactlyOne(b_vars)

        for day in days:
            d_vars = by_day.get(day, [])
            if not d_vars:
                b_day_var = model.NewConstant(0)
            elif len(d_vars) == 1:
                b_day_var = d_vars[0]
            else:
                b_day_var = model.NewBoolVar(f"basket_day_{basket_id}_{day}")
                model.Add(b_day_var == sum(d_vars))
            artifacts.basket_on_day[(basket_id, day)] = b_day_var

        basket_sids = cand_result.basket_sessions.get(basket_id, [])
        basket_groups = set()
        basket_dur = 1
        for sid in basket_sids:
            s = sessions_by_id[sid]
            basket_groups.update(s.get("groups", []))
            basket_dur = int(s["duration"])

        for (day, start_p) in valid_slots:
            b_var = artifacts.basket_slot_vars[(basket_id, day, start_p)]
            for p in range(start_p, start_p + basket_dur):
                for gid in basket_groups:
                    group_period_vars[(gid, day, p)].append(b_var)

    # 2. Create factored time-slot variables and room-placement variables per session
    for sid, s in sessions_by_id.items():
        cands = cand_result.candidates_by_session.get(sid, [])
        cand_pairs: List[Tuple[CandidatePlacement, cp_model.IntVar]] = []
        by_time_slot: Dict[Tuple[str, int], List[cp_model.IntVar]] = defaultdict(list)
        slot_periods: Dict[Tuple[str, int], Tuple[int, ...]] = {}

        for idx, c in enumerate(cands):
            v = model.NewBoolVar(f"x_{sid}_{c.day}_P{c.start_period}_{c.room_id}_{idx}")
            cand_pairs.append((c, v))
            by_time_slot[(c.day, c.start_period)].append(v)
            slot_periods[(c.day, c.start_period)] = c.periods

            # Register room occupancy for H4
            for p in c.periods:
                room_period_vars[(c.room_id, c.day, p)].append(v)

        artifacts.session_vars[sid] = cand_pairs

        if not cand_pairs:
            unsat = model.NewBoolVar(f"unsat_{sid}")
            model.Add(unsat == 1)
            model.Add(unsat == 0)

        basket_id = s.get("basket_slot")
        time_vars_for_session: List[cp_model.IntVar] = []
        time_vars_by_day: Dict[str, List[cp_model.IntVar]] = defaultdict(list)

        for (day, start_p), room_vars in by_time_slot.items():
            if basket_id and (basket_id, day, start_p) in artifacts.basket_slot_vars:
                t_var = artifacts.basket_slot_vars[(basket_id, day, start_p)]
                model.Add(sum(room_vars) == t_var)
            elif len(room_vars) == 1:
                t_var = room_vars[0]
            else:
                t_var = model.NewBoolVar(f"t_{sid}_{day}_P{start_p}")
                model.Add(sum(room_vars) == t_var)

            artifacts.session_time_vars[(sid, day, start_p)] = t_var
            time_vars_for_session.append(t_var)
            time_vars_by_day[day].append(t_var)

            periods = slot_periods[(day, start_p)]
            for p in periods:
                fac_period_vars[(s["faculty_id"], day, p)].append(t_var)
                if not basket_id:
                    for gid in s.get("groups", []):
                        group_period_vars[(gid, day, p)].append(t_var)

        # H1: Every session scheduled in exactly one time slot (and therefore one room)
        if time_vars_for_session and not basket_id:
            model.AddExactlyOne(time_vars_for_session)

        # Link session_on_day variables using factored time-slot vars
        for day in days:
            d_vars = time_vars_by_day.get(day, [])
            if not d_vars:
                s_day_var = model.NewConstant(0)
            elif basket_id and (basket_id, day) in artifacts.basket_on_day:
                s_day_var = artifacts.basket_on_day[(basket_id, day)]
            elif len(d_vars) == 1:
                s_day_var = d_vars[0]
            else:
                s_day_var = model.NewBoolVar(f"s_day_{sid}_{day}")
                model.Add(s_day_var == sum(d_vars))
            artifacts.session_on_day[(sid, day)] = s_day_var
            if d_vars:
                fac_day_terms[(s["faculty_id"], day)].append(int(s["duration"]) * s_day_var)

    # 3. H4: Room non-overlap across full session duration
    for key, vars_at_slot in room_period_vars.items():
        if len(vars_at_slot) > 1:
            model.AddAtMostOne(vars_at_slot)

    # 4. H2: Faculty non-overlap across full session duration
    for key, vars_at_slot in fac_period_vars.items():
        if len(vars_at_slot) > 1:
            model.AddAtMostOne(vars_at_slot)

    # 5. H3: Student group non-overlap across full session duration
    # Also create exact group_period_occupied indicator for S2 free-period computation
    for g in data.get("student_groups", []):
        gid = g["id"]
        for day in days:
            for p in range(1, 10):
                vars_at_slot = group_period_vars.get((gid, day, p), [])
                if not vars_at_slot:
                    occ_var = model.NewConstant(0)
                elif len(vars_at_slot) == 1:
                    occ_var = vars_at_slot[0]
                else:
                    model.AddAtMostOne(vars_at_slot)
                    occ_var = model.NewBoolVar(f"grp_occ_{gid}_{day}_P{p}")
                    model.Add(occ_var == sum(vars_at_slot))
                artifacts.group_period_occupied[(gid, day, p)] = occ_var

    # 6. H12: Faculty maximum daily teaching hours (default 4)
    for (fac_id, day), terms in fac_day_terms.items():
        max_hours = int(faculty_by_id.get(fac_id, {}).get("max_hours_per_day", 4))
        model.Add(sum(terms) <= max_hours)

    return artifacts
