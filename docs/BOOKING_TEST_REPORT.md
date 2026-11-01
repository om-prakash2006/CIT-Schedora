# CIT Schedora — Phase 5 Spectra Week Booking Test Report

## 1. Test Suite Summary

- **Total Unit & Integration Scenarios (Python pytest)**: **33 passed** (in `solver-service/app/tests/test_bookings.py`)
- **Total Microservice Tests (All Phases)**: **70 passed** (Timetable, Elective Baskets, Fixed Slots, Hard Constraints, Soft Penalties, Examinations, and Bookings)
- **Node.js Integration Tests**: **21 passed** (including Test 21 for Phase 5 in `tests/health.test.ts`)
- **Official Validator Parity**: **100% (0 hard violations across entire institution)**

## 2. 33 Booking Scenarios Matrix

| Scenario | Description | Expected Outcome | Result |
|---|---|---|---|
| 1 | Club role category cap | Capped at `club_event` | PASS |
| 2 | Faculty role category cap | Capped at `guest_lecture` | PASS |
| 3 | Coordinator role category cap | Capped at `department_event` | PASS |
| 4 | Admin role category cap | Can request `institute_event` | PASS |
| 5 | Official category weights | 5, 4, 3, 2 verified | PASS |
| 6 | Outranks across categories | Institute > Guest > Dept > Club | PASS |
| 7 | Same category tie-break | Earlier submitted_at wins | PASS |
| 8 | Same timestamp tie-break | Lexicographic ID tie-break | PASS |
| 9 | Priority sorting order | Descending weight, ascending timestamp | PASS |
| 10 | Room events_allowed filter | Rooms with false rejected | PASS |
| 11 | Capacity deficit rejection | Attendance > capacity rejected | PASS |
| 12 | Room type mismatch rejection | Non-matching types excluded | PASS |
| 13 | Equipment needs matching | Missing features excluded | PASS |
| 14 | Wheelchair accessibility | `accessible: True` verified | PASS |
| 15 | Preferred room prioritization | If eligible, preferred room picked | PASS |
| 16 | Non-existent room fallback | `LHC-5` falls back to `SH-2` | PASS |
| 17 | Period bounds check | Period > 13 excluded from windows | PASS |
| 18 | Window duration fitting | Window smaller than duration excluded | PASS |
| 19 | Room unavailability conflict | Unavailable slots avoided | PASS |
| 20 | Timetable session collision | Class session room blocked | PASS |
| 21 | Mandatory group class conflict | Group class periods blocked | PASS |
| 22 | Booking-booking collision | Two bookings cannot share room/time | PASS |
| 23 | Group double-booking collision | Same group cannot be in two events | PASS |
| 24 | Cancelled booking rejection | `BR-04` rejected | PASS |
| 25 | Cancelled no alternative | `BR-04` never offered alternative | PASS |
| 26 | Excessive attendance rejection | `BR-09` (1200 > 800) rejected | PASS |
| 27 | Alternative offer on clash | `BR-17` offered alternative (half score) | PASS |
| 28 | Alternative slot valid bounds | Within MON–FRI periods 1–13 | PASS |
| 29 | Priority inversion detection | Detector correctly flags inversions | PASS |
| 30 | Zero inversions on official | 0 priority inversions confirmed | PASS |
| 31 | Zero hard violations | 0 violations with check_bookings | PASS |
| 32 | Official validator score | Exactly 63.0 / 70.0 achieved | PASS |
| 33 | Complete schedule validation | `schedule.json` passes official validator | PASS |
