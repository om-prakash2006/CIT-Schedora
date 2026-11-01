# CIT Schedora — Phase 4A Deterministic Weekly Timetable Solver Test Report

## 1. Test Execution Summary

- **Python CP-SAT Solver Suite (`pytest solver-service/app/tests`)**: **22 / 22 PASSED**
  - `test_hard_constraints.py`: **14 / 14 PASSED** (4 solver constraint tests + 10 adversarial invalid assignment tests)
  - `test_soft_penalties.py`: **5 / 5 PASSED** (`S1`, `S2`, `S3`, `S4`, `S5`, `S6` and exact validator parity)
  - `test_elective_baskets.py`: **1 / 1 PASSED** (synchronized basket day & period, separate rooms)
  - `test_fixed_slots.py`: **1 / 1 PASSED** (fixed slot preservation)
  - `test_complete_dataset.py`: **1 / 1 PASSED** (full 189-session `cit_public.json` institutional dataset)
- **Node.js + Firestore + Python Live Integration Suite (`npm test`)**: **19 / 19 PASSED**

## 2. Official Dataset (`cit_public.json`) Benchmark Results

- **Dataset ID**: `cit-public-v1` (version `v1-1a9cf4b23ac3`)
- **Total Sessions**: `189` (`189` scheduled, `0` omitted, `0` duplicated)
- **Hard Violations**: `0` (`hard_by_rule: {}`)
- **Validation Scope**: `WEEKLY TIMETABLE COMPONENT VALIDATION ONLY` (`scheduleState: "weekly_candidate"`)
- **Soft Penalty Parity Verified**: `true` (`solver_soft_total == soft_total == 156`)
  - `S1` (Faculty avoid): `0`
  - `S2` (Student group free periods): `139`
  - `S3` (Group > 6 hrs/day): `0`
  - `S4` (Repeated course lectures same day): `3`
  - `S5` (Room underutilisation < 40%): `1`
  - `S6` (P9 scheduling): `13`
