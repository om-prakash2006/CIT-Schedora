# CIT Schedora — Examination Rules & Constraint Specification

This document details all hard constraints, soft optimization objectives, and validation invariants enforced during Midsemester Examination Scheduling.

---

## 1. Hard Institutional Constraints

### Rule H-EX-1: Exact Single Slot Assignment (Constraint A)
- **Rule**: Every examination in the active dataset must be assigned to exactly one `(day, session)` slot.
- **Enforcement**:
  $$\sum_{d \in \text{Days}} \sum_{s \in \text{Sessions}} \text{exam\_slot}[e, d, s] = 1 \quad \forall e \in \text{Exams}$$
- **Violation Action**: Infeasible model; solver will refuse to produce an invalid schedule.

### Rule H-EX-2: Room-Slot Coupling (Constraint B)
- **Rule**: A room can only be allocated to an examination if that examination is active in that specific `(day, session)` slot.
- **Enforcement**:
  $$\text{exam\_room}[e, d, s, r] \le \text{exam\_slot}[e, d, s] \quad \forall e, d, s, r$$

### Rule H-EX-3: 50% Effective Seating Capacity (Constraint C)
- **Rule**: During examinations, social distancing and anti-collusion protocols require that all venues operate at integer floor 50% capacity:
  $$\text{effective\_capacity}(r) = \lfloor \text{capacity}(r) / 2 \rfloor$$
- **Multi-Room Splitting**: For examinations where cohort size exceeds the 50% capacity of any single venue (e.g., Year 1 exams with 360 candidates, HS201 with 320 candidates, OE baskets with 295 candidates), multiple rooms are allocated simultaneously:
  $$\sum_{r \in \text{AllocatedRooms}(e)} \lfloor \text{capacity}(r) / 2 \rfloor \ge \text{candidate\_count}(e)$$

### Rule H-EX-4: Room Non-Overlap (Constraint D)
- **Rule**: No physical room may be assigned to more than one examination during the same `(day, session)` slot.
- **Enforcement**:
  $$\sum_{e \in \text{Exams}} \text{exam\_room}[e, d, s, r] \le 1 \quad \forall d, s, r$$

### Rule H-EX-5: Student Group Non-Overlap (Constraint E)
- **Rule**: No student group or cohort can be assigned to two examinations in the same `(day, session)` slot.
- **Enforcement**:
  $$\sum_{e \in \text{Exams}: g \in e.\text{groups}} \text{exam\_slot}[e, d, s] \le 1 \quad \forall g, d, s$$

### Rule H-EX-6: Calendar Window Domain (Constraint F)
- **Rule**: Examinations must only be scheduled within the official exam week:
  $$\text{Days} \in \{\text{MON}, \text{TUE}, \text{WED}, \text{THU}, \text{FRI}, \text{SAT}\}$$
  $$\text{Sessions} \in \{\text{AM}, \text{PM}\}$$

### Rule H-EX-7: Room Eligibility (Constraint G)
- **Rule**: Only venues having `"exam"` in their `allowed_uses` property may be assigned to examinations.
- **Eligible Venues (19)**:
  - Auditorium: `AUD` (rated 500, effective 250)
  - Lecture Halls: `LH-1`, `LH-2` (rated 200, effective 100); `LH-3`..`LH-6` (rated 120, effective 60)
  - Classrooms: `CR-101`, `CR-102`, `CR-201` (rated 90, effective 45); `CR-103`, `CR-104`, `CR-202`, `CR-203` (rated 80, effective 40); `CR-105`, `CR-204` (rated 70, effective 35); `CR-205` (rated 60, effective 30)
  - Seminar Halls: `SH-1` (rated 150, effective 75); `SH-2` (rated 100, effective 50)
- **Ineligible Venues (8)**:
  - Computer Labs: `CS-LAB-1`, `CS-LAB-2`, `ELEC-LAB-1`, `ELEC-LAB-2`, `PHY-LAB`, `MECH-WS`, `CIVIL-LAB`
  - Open Air Theatre: `OAT`

---

## 2. Soft Optimization Objective

### Soft Penalty: Student Group Multi-Exam Same Day (S-EX-1)
- **Official Formula (validator.py check_exams)**:
  $$\text{Penalty}(g, d) = 5 \cdot \max(0, \text{exams}(g, d) - 1)$$
- **Interpretation**: 5 penalty points are levied every time a student group is forced to take more than one examination on the same calendar day.
- **Achieved Score in CIT Canonical Dataset**:
  $$\text{Official Soft Penalty} = 0$$
  The CP-SAT solver finds an optimal schedule where every student group has at most 1 examination per calendar day.

---

## 3. Secondary Solver Objectives
1. **Room Minimization**: Avoid over-allocating small halls when larger halls can accommodate the cohort.
2. **Deterministic Tie-Breaking**: Small deterministic multipliers on room and slot indices ensure identical outputs across multiple solver runs with the same random seed.
