# CIT Schedora — Weekly Timetable Hard Constraints (`H1`–`H12`, `H14`)

All hard constraints defined by the official Crunch Week specification and `validator.py` are strictly enforced in the CP-SAT solver (`solver-service/app/solver/candidate_generation.py` and `solver-service/app/solver/hard_constraints.py`).

| Rule | Name | CP-SAT Enforcement Mechanism |
| :--- | :--- | :--- |
| **H1** | Session Completeness & Uniqueness | `model.AddExactlyOne([v for _, v in cand_pairs])` for every session ID in `ctx.sessions` (all 189 sessions). No duplicate or omitted sessions. |
| **H2** | Faculty Non-Overlap | For every `(faculty_id, day, period)` in `MON..FRI` x `P1..P9`, `model.AddAtMostOne(fac_period_vars[(f, day, p)])` across full session duration `range(start, start + duration)`. |
| **H3** | Student Group Non-Overlap | For every `(group_id, day, period)`, `model.AddAtMostOne(group_period_vars[(g, day, p)])`. Combined sessions register under every listed student group; parallel sessions in the same `basket_slot` share a single synchronized basket indicator variable. |
| **H4** | Room Non-Overlap | For every `(room_id, day, period)`, `model.AddAtMostOne(room_period_vars[(rid, day, p)])` across full session duration. |
| **H5** | Room Capacity | Domain pruning requires `room.capacity >= session.size` (full room capacity for regular classes). |
| **H6** | Room Type & Allowed Uses | Domain pruning requires `room.type in session.room_types` and `session.kind in room.allowed_uses` (excluding `SH-1`, `SH-2`, and `OAT` from regular classes). |
| **H7** | Faculty Unavailability | Domain pruning eliminates any candidate covering `(day, p) in ctx.fac_un[faculty_id]`. |
| **H8** | Room Unavailability | Domain pruning eliminates any candidate covering `(day, p) in ctx.room_un[room_id]`. |
| **H9** | Teaching Periods, Lunch & Lab Starts | Teaching days `MON..FRI`, periods `1..9`, no candidate crosses lunch after `P5` (`per[0] <= 5 < per[-1]`), and 3-hour labs (`kind == "lab"`) start only at `P2` or `P6`. |
| **H10** | Accessibility | If `session.needs_accessible`, faculty `needs_accessible`, or any student group `needs_accessible` is `True`, only rooms with `room.accessible == True` are permitted. |
| **H11** | Elective Basket Synchronization | Each elective basket (`BASKET-1-A..C`, `BASKET-2-A..C`) has a synchronized time-slot variable `basket_slot_vars[(basket_id, day, start_p)]` with `AddExactlyOne`, and each member session is linked via `sum(slot_cand_vars) == b_var` while `H4` forces distinct rooms. |
| **H12** | Faculty Daily Teaching Limit | For every `(faculty_id, day)`, `model.Add(sum(duration * session_on_day) <= faculty.max_hours_per_day)` (default `4` hours/day). |
| **H14** | Fixed Slot Preservation | Domain pruning restricts any session with `fixed_slot` to `day == fixed_slot.day` and `start_period == fixed_slot.start_period`. |
