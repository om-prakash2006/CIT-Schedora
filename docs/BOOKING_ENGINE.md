# CIT Schedora — Phase 5: Deterministic Spectra Week Booking Decision Engine

## 1. System Overview

The **Spectra Week Booking Decision Engine** is a production-grade deterministic allocation system for Chilika Institute of Technology's annual festival week (Spectra Week). The engine processes 25 official institutional booking requests (`BR-01` through `BR-20`, including series items `BR-05a–e` and `BR-11a–b`), allocates venues according to strict institutional hierarchy and capacity constraints, and validates allocations with 100% parity against the official `validator.py` (`check_bookings`).

## 2. Fixed Infrastructure & System Identifiers

- **Google Cloud / Firebase Project ID**: `cit-schedora`
- **Cloud Firestore Database ID**: `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`
- **Region**: `asia-south1`
- **Active Institutional Dataset**: `cit-public-v1` (`v1-1a9cf4b23ac3`)
- **Solver Service Port**: `8001` (authenticated private internal service)
- **Node.js Backend**: Express on port `3000` with Vite dev middlewares

## 3. Key Allocation Decisions

1. **`BR-04` (Cancelled by Requester)**:
   - Requested category: `club_event`
   - Decision: `rejected`
   - Reason: `"Requester cancelled prior to allocation"`
   - Score Weight: `0.0`
   - Compliance: Guaranteed never approved or offered an alternative (violates Rule B3 if approved).

2. **`BR-09` (Excessive Attendance)**:
   - Attendance: `1200`
   - Campus Maximum Venue Capacity: `800` (Open Air Theatre `OAT`)
   - Decision: `rejected`
   - Reason: `"Requested attendance (1200) exceeds maximum campus venue capacity (800)"`
   - Score Weight: `0.0`

3. **`BR-17` (Out of Bounds Period 14)**:
   - Requested Window: `WED P13–P14` (`P14 > MAX_PERIOD = 13`)
   - Decision: `alternative_offered`
   - Placement: `MON P1–P2` in `OAT`
   - Score Weight: `1.0` (half weight of `club_event` (2.0 * 0.5))
   - Compliance: Avoids hard violation B1 (`b > MAX_PERIOD`).

4. **`BR-14` (Non-existent Requested Room `LHC-5`)**:
   - Requested Room: `LHC-5` (does not exist in campus inventory)
   - Fallback Room: `SH-2` (Seminar Hall 2, capacity 100)
   - Decision: `approved` in requested window `WED P11–P12`

5. **`BR-18` (Civil Engineering Contest)**:
   - Mandatory Group: `CE-3`
   - Requested Windows: `TUE P6–P9`, `THU P6–P9`
   - Conflict: `CE-3` has mandatory classes in both requested windows (`CE391-P1` on Tue, `OE301-L3/CE303-L1/CE301-L2` on Thu).
   - Decision: `alternative_offered` (`MON P1–P3` in `CIVIL-LAB`)
   - Compliance: Avoids hard violation H13 (group double-booking).

6. **`BR-20` (Spectra Closing Ceremony)**:
   - Requester: Spectra Core Team (Admin)
   - Category: `institute_event`
   - Window: `FRI P4–P5` in `AUD`
   - Conflict: Regular class `ID101-ALL-L1` occupies `AUD` on `FRI P5`.
   - Decision: `alternative_offered` (`MON P1–P2` in `AUD`)
   - Compliance: Avoids hard violation H13 (room collision without override).
