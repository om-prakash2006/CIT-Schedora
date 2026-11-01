# CIT Schedora — Deterministic Examination Scheduling Engine Architecture

## 1. Overview & Objective

The **Deterministic Examination Scheduling Engine** generates optimal, conflict-free midsemester examination timetables for the Coimbatore Institute of Technology (CIT Schedora).

The engine extends the existing private Python solver microservice (`cit-schedora-solver`) running Google OR-Tools CP-SAT (`9.15.6755`) and is invoked by the Node.js TypeScript backend over internal authenticated endpoints (`/internal/v1/solve/examinations` and `/internal/v1/validate/examinations`).

## 2. Institutional Dataset Dimensions

Based on the active canonical dataset `cit-public-v1` (source `data/cit_public.json`, checksum `v1-1a9cf4b23ac3`):
- **Midsemester Examination Period**: 6 days (`MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`), 2 sessions per day (`AM` 09:00–12:00, `PM` 14:00–17:00), yielding 12 available examination slots.
- **Examinations**: 41 midsemester examinations dynamically parsed from the active dataset.
- **Venues**: 27 total physical rooms, of which exactly 19 rooms possess `"exam"` in `allowed_uses` (`AUD`, `LH-1` through `LH-6`, `CR-101` through `CR-205`, `SH-1`, `SH-2`).
- **50% Seating Capacity Rule**: By institutional directive, rooms during exams operate at integer floor 50% capacity:
  $$\text{effective\_capacity} = \lfloor \text{capacity} / 2 \rfloor$$
  Single slot maximum seating across all 19 eligible venues: 1,210 seats.

## 3. Mathematical Formulation (Google OR-Tools CP-SAT)

### 3.1 Decision Variables
For each examination $e \in \text{Exams}$, day $d \in \text{Days}$, session $s \in \text{Sessions}$, and eligible room $r \in \text{EligibleRooms}$:
1. **Slot Allocation**:
   $$x_{e, d, s} \in \{0, 1\}$$
   Indicates whether examination $e$ is held on day $d$ in session $s$.
2. **Room Allocation**:
   $$y_{e, d, s, r} \in \{0, 1\}$$
   Indicates whether eligible room $r$ is assigned to examination $e$ during slot $(d, s)$.
3. **Cohort Day Exam Count**:
   $$c_{g, d} = \sum_{e \in \text{Exams}: g \in e.\text{groups}} \sum_{s \in \text{Sessions}} x_{e, d, s}$$
4. **Soft Penalty Auxiliary Variables**:
   $$p_{g, d} \ge 0, \quad p_{g, d} \ge c_{g, d} - 1$$

### 3.2 Hard Constraints
- **Constraint A (Exact Slot Allocation)**:
  $$\sum_{d \in \text{Days}} \sum_{s \in \text{Sessions}} x_{e, d, s} = 1 \quad \forall e \in \text{Exams}$$
- **Constraint B (Room Allocation Requires Slot)**:
  $$y_{e, d, s, r} \le x_{e, d, s} \quad \forall e, d, s, r$$
- **Constraint C (50% Floor Capacity & Multi-Room Partitioning)**:
  $$\sum_{r \in \text{EligibleRooms}} y_{e, d, s, r} \cdot \lfloor \text{cap}(r) / 2 \rfloor \ge e.\text{size} \cdot x_{e, d, s} \quad \forall e, d, s$$
- **Constraint D (Room Non-Overlap)**:
  $$\sum_{e \in \text{Exams}} y_{e, d, s, r} \le 1 \quad \forall d, s, r$$
- **Constraint E (Student Group Non-Overlap)**:
  $$\sum_{e \in \text{Exams}: g \in e.\text{groups}} x_{e, d, s} \le 1 \quad \forall g \in \text{StudentGroups}, d, s$$
- **Constraint F (Calendar Domain)**:
  $$\text{Days} = \{\text{MON}, \text{TUE}, \text{WED}, \text{THU}, \text{FRI}, \text{SAT}\}, \quad \text{Sessions} = \{\text{AM}, \text{PM}\}$$
- **Constraint G (Eligible Examination Rooms Only)**:
  $$r \in \text{EligibleRooms} \iff \text{"exam"} \in r.\text{allowed\_uses}$$

### 3.3 Objective Function
The engine minimizes the official soft penalty plus secondary tie-breaking objectives:
$$\min \left( 1000 \cdot \sum_{g, d} 5 \cdot p_{g, d} + 10 \cdot \sum_{e, d, s, r} y_{e, d, s, r} + \text{tie\_breakers} \right)$$
- **Primary Objective**: 5 penalty points for each additional exam assigned to the same student group on the same day ($5 \cdot \max(0, \text{exams\_on\_day} - 1)$), matching official `validator.py check_exams`.
- **Secondary Objective**: Minimize total room assignments to avoid fragmented seating.
- **Deterministic Tie-Breaking**: Deterministic slot-room preferences ensuring exact reproducibility across solver runs.

## 4. Verification & validator.py Parity

All solver outputs are verified against the official `validator.py check_exams` routine.
Parity is verified across:
- `hard_violation_count == 0`
- `official_soft_penalty == solver_soft_penalty == 0`
- `parity_verified == True`
- `ineligible_room_violations == 0`
- `group_clashes == 0`
- `room_conflicts == 0`
- `capacity_violations == 0`

Validation reports are permanently persisted in Firestore and labeled:
`"EXAMINATION TIMETABLE COMPONENT VALIDATION ONLY"`.
