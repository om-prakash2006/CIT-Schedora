# CIT Schedora — Weekly Timetable Soft Constraints (`S1`–`S6`) & Validator Parity

The CP-SAT objective (`solver-service/app/solver/soft_objective.py`) minimizes the exact integer sum `S1 + S2 + S3 + S4 + S5 + S6` with 100% parity against `validator.py`'s `soft_score(ctx, assign)`.

| Code | Penalty Rule | Weight | CP-SAT Mathematical Formulation |
| :--- | :--- | :--- | :--- |
| **S1** | Faculty `avoid` preference | `+2` per affected teaching hour | Precomputed on each candidate placement `(day, start_period, room_id)` as `2 * sum(1 for p in periods if p in pref["periods"])` for each matching `avoid` preference. |
| **S2** | Student group free periods (gaps) | `+1` per unoccupied period between first and last class of the day | Using prefix (`has_at_or_before[p] = max_{q <= p} occ[q]`) and suffix (`has_at_or_after[p] = max_{q >= p} occ[q]`) boolean indicators on `P1..P9`: `free_var == sum(prefix) + sum(suffix) - 9 * active - sum(occ)`. |
| **S3** | Student group daily teaching hours `> 6` | `+3` per hour above 6 | `h_var == sum(non_basket_hours) + sum(deduplicated_basket_hours)` and `model.AddMaxEquality(excess_var, [0, h_var - 6])` weighted by `3`. |
| **S4** | Repeated lectures of the same course on the same day | `+3 * (c - 1)` | For each `(group, course_id, day)` across non-basket lectures and each `(course_id, day)` across basket sessions, `model.AddMaxEquality(rep_var, [0, count - 1])` weighted by `3`. |
| **S5** | Room underutilisation (`size / capacity < 0.4`) | `+1` per session | Precomputed on each candidate placement using exact integer arithmetic (`size * 10 < capacity * 4`). |
| **S6** | Period `P9` usage (`17:00–18:00`) | `+1` per session | Precomputed on each candidate placement (`+1` if `9 in periods`). |
