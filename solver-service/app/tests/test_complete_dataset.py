"""Full institutional dataset (cit_public.json, 189 sessions) solver and verification test."""
import json
from pathlib import Path

from app.schemas import SolveParameters
from app.solver.timetable_solver import solve_weekly_timetable


def test_complete_cit_public_dataset_189_sessions():
    repo_root = Path(__file__).resolve().parents[3]
    dataset_path = repo_root / "data" / "cit_public.json"
    assert dataset_path.exists(), f"Missing official dataset at {dataset_path}"

    with open(dataset_path, encoding="utf-8") as f:
        data = json.load(f)

    assert data["dataset_id"] == "cit-public-v1"
    assert len(data["sessions"]) == 189

    res = solve_weekly_timetable(
        data=data,
        dataset_version_id="v1-1a9cf4b23ac3",
        team_name="cit-schedora",
        params=SolveParameters(timeout_seconds=25.0, num_workers=8, random_seed=42),
    )

    assert res.solver_status in ("OPTIMAL", "FEASIBLE")
    assert len(res.sessions) == 189
    assert res.diagnostics.scheduled_sessions == 189
    assert res.validation_report is not None
    assert res.validation_report.validation_scope == "WEEKLY TIMETABLE COMPONENT VALIDATION ONLY"
    assert res.validation_report.hard_violation_count == 0
    assert res.validation_report.hard_by_rule == {}
    assert res.validation_report.is_valid is True
    assert res.validation_report.parity_verified is True
    assert res.validation_report.soft_total == res.validation_report.solver_soft_total

    # Verify all fixed_slot sessions in cit_public.json
    by_id = {s.session_id: s for s in res.sessions}
    for s in data["sessions"]:
        fx = s.get("fixed_slot")
        if fx:
            placed = by_id[s["id"]]
            assert placed.day == fx["day"]
            assert placed.start_period == fx["start_period"]

    # Verify all elective baskets in cit_public.json (e.g., BASKET-1-A..C, BASKET-2-A..C)
    basket_ids = sorted({s["basket_slot"] for s in data["sessions"] if s.get("basket_slot")})
    assert len(basket_ids) > 0
    for basket_id in basket_ids:
        b_sessions = [by_id[s["id"]] for s in data["sessions"] if s.get("basket_slot") == basket_id]
        assert len(b_sessions) > 1
        b_times = {(bs.day, bs.start_period) for bs in b_sessions}
        b_rooms = {bs.room_id for bs in b_sessions}
        assert len(b_times) == 1, f"{basket_id} must share one synchronized (day, start_period)"
        assert len(b_rooms) == len(b_sessions), f"{basket_id} sessions must use distinct rooms"

    # Write internal candidate artifact to artifacts/weekly_timetable_candidate.json
    artifact_dir = repo_root / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    candidate_artifact = {
        "dataset_id": res.dataset_id,
        "dataset_version_id": res.dataset_version_id,
        "team": res.team,
        "schedule_state": "weekly_candidate",
        "validation_scope": "WEEKLY TIMETABLE COMPONENT VALIDATION ONLY",
        "solver_status": res.solver_status,
        "solve_duration_ms": res.diagnostics.solve_duration_ms,
        "soft_total": res.validation_report.soft_total,
        "soft_penalties": res.validation_report.soft_penalties.model_dump(),
        "hard_violation_count": res.validation_report.hard_violation_count,
        "sessions": [
            {
                "session_id": item.session_id,
                "day": item.day,
                "start_period": item.start_period,
                "room_id": item.room_id,
            }
            for item in res.sessions
        ],
    }
    with open(artifact_dir / "weekly_timetable_candidate.json", "w", encoding="utf-8") as f:
        json.dump(candidate_artifact, f, indent=2)
