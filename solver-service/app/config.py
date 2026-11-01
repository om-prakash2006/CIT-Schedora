"""Configuration for the CIT Schedora Python CP-SAT Solver Service."""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SolverServiceConfig:
    project_id: str = os.getenv("FIREBASE_PROJECT_ID", "cit-schedora")
    firestore_database_id: str = os.getenv(
        "FIRESTORE_DATABASE_ID",
        "ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9",
    )
    service_name: str = os.getenv("SOLVER_SERVICE_NAME", "cit-schedora-solver")
    region: str = os.getenv("SOLVER_REGION", "asia-south1")
    solver_name: str = "google-ortools-cp-sat"
    solver_version: str = "9.15-cit-weekly-v1"
    default_timeout_seconds: float = float(os.getenv("SOLVER_TIMEOUT_SECONDS", "30"))
    default_num_workers: int = int(os.getenv("SOLVER_NUM_WORKERS", "8"))
    default_random_seed: int = int(os.getenv("SOLVER_RANDOM_SEED", "42"))
    internal_service_token: str = os.getenv(
        "SOLVER_INTERNAL_TOKEN",
        "cit-schedora-internal-s2s-cit-public-v1",
    )


settings = SolverServiceConfig()
