"""Combined CP-SAT Weekly Timetable Model builder."""
from dataclasses import dataclass
from typing import Any, Dict
from ortools.sat.python import cp_model

from .candidate_generation import CandidateGenerationResult, generate_candidates
from .hard_constraints import HardConstraintArtifacts, add_hard_constraints
from .soft_objective import SoftObjectiveArtifacts, add_soft_objective


@dataclass
class WeeklyTimetableModel:
    model: cp_model.CpModel
    candidates: CandidateGenerationResult
    hard: HardConstraintArtifacts
    soft: SoftObjectiveArtifacts


def build_weekly_timetable_model(data: Dict[str, Any]) -> WeeklyTimetableModel:
    """Construct the complete CP-SAT model for the CIT Schedora weekly timetable."""
    model = cp_model.CpModel()
    candidates = generate_candidates(data)
    hard = add_hard_constraints(model, data, candidates)
    soft = add_soft_objective(model, data, hard)
    return WeeklyTimetableModel(
        model=model,
        candidates=candidates,
        hard=hard,
        soft=soft,
    )
