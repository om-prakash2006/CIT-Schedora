# CIT Schedora — Phase 4B Examination Solver Verification Report

## Test Execution Summary

- **Solver Service**: `cit-schedora-solver`
- **Solver Engine**: Google OR-Tools CP-SAT (`9.15.6755`)
- **Dataset**: `cit-public-v1` (source `data/cit_public.json`, checksum `v1-1a9cf4b23ac3`)
- **Python Pytest Suite**: `solver-service/app/tests/test_examinations.py`
  - Total Phase 4B Tests: 15
  - Total Python Solver Suite Tests: 37 (22 Phase 4A weekly + 15 Phase 4B exam)
  - Result: **37 / 37 passed in 41.44s**
- **Node.js Integration Suite**: `tests/health.test.ts`
  - Total Subtests: 20 (including Test 20 End-to-End Exam Scheduling Engine)
  - Result: **20 / 20 passed**

---

## Detailed Test Matrix (Phase 4B)

| # | Test Case Description | Scope / Assertion | Status |
|---|----------------------|-------------------|:------:|
| 1 | `test_standalone_exam_penalty_calculator` | 0 vs positive penalty calculations matching `validator.py check_exams` | **PASS** |
| 2 | `test_official_check_exams_bridge_empty` | Missing all 41 exams detects exactly 41 hard violations | **PASS** |
| 3 | `test_official_check_exams_bridge_invalid_day` | Slot `SUN` detected as hard violation | **PASS** |
| 4 | `test_official_check_exams_bridge_ineligible_room` | `CS-LAB-1` / `OAT` detected as hard violations | **PASS** |
| 5 | `test_official_check_exams_bridge_double_booked_room` | Room conflict in slot detected as hard violation | **PASS** |
| 6 | `test_official_check_exams_bridge_group_clash` | Group taking two exams in same slot detected as hard violation | **PASS** |
| 7 | `test_official_check_exams_bridge_capacity_shortfall` | Half-capacity shortfall detected as hard violation | **PASS** |
| 8 | `test_official_check_exams_bridge_half_capacity_floor_division` | Odd capacity room (81 -> 40) floor division enforced | **PASS** |
| 9 | `test_official_check_exams_bridge_multi_room_allocation` | Multi-room sum of half-capacities satisfies candidate size | **PASS** |
| 10 | `test_exam_solver_full_cit_public_dataset` | All 41 exams scheduled; 0 hard violations; 0 soft penalty | **PASS** |
| 11 | `test_exam_solver_soft_penalty_parity` | Standalone calculator matches official `check_exams` (0 == 0) | **PASS** |
| 12 | `test_exam_solver_reproducibility` | Identical allocations produced with fixed random seed 42 | **PASS** |
| 13 | `test_exam_solver_infeasible_when_rooms_stripped` | Infeasible status when all eligible rooms removed | **PASS** |
| 14 | `test_exam_solver_service_endpoints` | `/internal/v1/solve/examinations` and `/validate/examinations` HTTP parity | **PASS** |
| 15 | `test_exam_solver_candidate_artifact_schema` | JSON artifact contains 41 allocations and correct validation scope | **PASS** |

---

## Solved Metrics & Performance

- **Examinations Scheduled**: 41 / 41 (100%)
- **Total Room Allocations**: 63 rooms across 12 slots (average 1.54 rooms per exam)
- **Multi-Room Split Seating Allocations**:
  - Year 1 Physics / Chemistry / Maths cohorts (size 360): split across `AUD` (250) + `LH-1` (100) + `CR-101` (45) -> 395 effective seats
  - Year 2 HS201 (size 320): split across `AUD` (250) + `LH-2` (100) -> 350 effective seats
  - Year 3 Open Elective Basket (size 295): split across `AUD` (250) + `LH-1` (100) -> 350 effective seats
- **Hard Violations**: 0
- **Official Soft Penalty**: 0 (no student cohort has two exams on the same day)
- **Official validator.py Parity**: 100% verified
- **CP-SAT Solve Duration**: 2,836 ms (under 3 seconds)
- **Candidate Artifact**: `artifacts/examination_timetable_candidate.json`
- **Schedule State**: `examination_candidate`
- **Validation Scope**: `EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY`
