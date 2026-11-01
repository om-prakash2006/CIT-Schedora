# CIT Schedora — Demonstration Runbook

## 1. Credentials & Demo Accounts

Use these four pre-seeded institutional accounts for evaluation testing:

| Role | Email | Password | Scope & Role Cap |
| :--- | :--- | :--- | :--- |
| **Admin (Dean's Office)** | `dean.admin@cit-schedora.test` | `CITSchedora!Admin2026` | Full platform access, `institute_event` uncapped |
| **Department Coordinator** | `coordinator.cse@cit-schedora.test` | `CITSchedora!Coord2026` | CSE Department, capped at `department_event` |
| **Faculty** | `faculty.f01@cit-schedora.test` | `CITSchedora!Faculty2026` | Dr. Ananya Mishra (`F01`), capped at `guest_lecture` |
| **Club Representative** | `robotics.club@cit-schedora.test` | `CITSchedora!Club2026` | Robotics Club, capped at `club_event` |

---

## 2. Recommended Walkthrough Flow

### Step 1: Admin Command Center & Full Schedule Generation
1. Sign in as Admin (`dean.admin@cit-schedora.test`).
2. Navigate to **Timetable Management** and view the 189 weekly sessions.
3. Navigate to **Examination Scheduler** and view the 41 midsemester exams (50% room floor capacity enforced).
4. Navigate to **Venue Bookings** and click **Generate Spectra Week Booking Decisions** to run the CP-SAT booking optimizer.
5. Click **Assemble & Export Full Schedule** to write `exports/schedule.json`.

### Step 2: Club Representative Natural-Language Venue Booking (AI Assistant)
1. Log in as Club Representative (`robotics.club@cit-schedora.test`).
2. Navigate to **Submit Venue Request**.
3. Under **Describe Your Event**, enter Hinglish prompt:  
   `"Humko Friday ko robotics workshop karna hai, 80 students honge aur projector chahiye."`
4. Click **Extract Event Details** to see Gemini extract attendance (80), day (FRI), room type (`lab_cs`), and equipment (`projector`).
5. Review the prefilled draft form and click **Submit Venue Booking Request**.

### Step 3: Faculty Scheduling Request
1. Log in as Faculty (`faculty.f01@cit-schedora.test`).
2. Navigate to **Scheduling Requests**.
3. Enter prompt: `"I won't be available on Thursday from P1 to P4 due to academic committee meeting."`
4. Click **AI Assist & Fill Form** to parse unavailability window and click **Submit Request**.

### Step 4: Admin Dynamic Rescheduling (Disruption Repair)
1. Log in as Admin (`dean.admin@cit-schedora.test`).
2. Navigate to **Dynamic Rescheduling**.
3. Click **Analyze Sample Disruption & Repair** to simulate the multi-change disruption (`sample_disruption.json`: Faculty F07 on leave, Room CR-102 closed, Extra tutorial CS202-T2).
4. Inspect the before-and-after comparison showing **14 sessions moved** with **0 hard violations**.
5. Click **Approve & Commit Post-Disruption Schedule** to write `exports/schedule_after.json`.

### Step 5: Official Validation & Reports
1. In Admin, navigate to **Reports & Exports**.
2. Click **Validate with validator.py** on `exports/schedule.json` (0 hard violations, score 67.0).
3. Click **Validate with validator.py** on `exports/schedule_after.json` (0 hard violations, 14 sessions moved).
