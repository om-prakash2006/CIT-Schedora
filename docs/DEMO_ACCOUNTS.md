# CIT Schedora — Demo Identity Specifications & Seeding Guide

## Overview

CIT Schedora uses **Firebase Authentication with Email/Password** (`cit-schedora`) paired with authoritative **Cloud Firestore user profiles** (`users/{uid}`) in the named database `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9` (`asia-south1`).

- **No manual role selection** at login.
- **No Google Sign-In, no Gmail OAuth, and no social login**.
- **No passwords or password hashes stored in Firestore**: Firebase Authentication handles password verification exclusively, while Firestore `users/{uid}` stores role, institutional scope (`departmentId`, `facultyId`, `clubId`), `accountStatus` (`active`, `suspended`, `disabled`), and `authorizationVersion`.
- **Not exposed in browser UI**: Demo credentials are documented here for evaluation and automated verification and are never displayed on the browser login page.

---

## Four Fixed Institutional Demo Accounts

### 1. Institutional Administrator (`admin`)

| Field | Value |
| :--- | :--- |
| **UID** | `uid-cit-admin-01` |
| **Email** | `dean.admin@cit-schedora.test` |
| **Role** | `admin` |
| **Password** | `CITSchedora!Admin2026` |
| **Department / Faculty / Club Scope** | `null` / `null` / `null` (Global Institutional Authority — Dean's Office) |
| **Account Status** | `active` |
| **Post-Login Workspace** | Admin Command Center (`/admin/dashboard`) |

**Authorised Capabilities**:
- Full access to all 15 Admin modules (`Dashboard`, `Timetable Management`, `Examination Scheduler`, `Venue Bookings`, `Spectra Week`, `Room Intelligence`, `Dynamic Rescheduling`, `AI Scheduling Assistant`, `Decision Intelligence`, `Manual Scheduling`, `Reports & Exports`, `Dataset Management`, `User & Role Management`, `Audit Logs`, `Settings`).
- Approve/reject institutional venue bookings, class displacements, dynamic rescheduling proposals, and faculty scheduling requests.
- Manage users, roles, account statuses (`active`, `suspended`, `disabled`), and explicit session revocations.
- Protected by **Last Active Admin Protection** (`409 LAST_ADMIN_PROTECTED`): the system prevents suspending, disabling, or demoting the last active Admin account.
- Subject to strict **Separation of Duties**: cannot approve a request submitted by their own `uid`.

---

### 2. Department Coordinator (`department_coordinator`)

| Field | Value |
| :--- | :--- |
| **UID** | `uid-cit-coord-cse` |
| **Email** | `coordinator.cse@cit-schedora.test` |
| **Role** | `department_coordinator` |
| **Department (`departmentId`)** | `CSE` (Verified against active dataset `cit-public-v1`) |
| **Password** | `CITSchedora!Coord2026` |
| **Account Status** | `active` |
| **Post-Login Workspace** | Department Coordinator Workspace (`/coordinator/department-event-bookings`) |

**Authorised Capabilities**:
- Restricted to three navigation destinations in fixed order:
  1. **Department Event Bookings** (`/coordinator/department-event-bookings`)
  2. **Session Change Requests** (`/coordinator/session-change-requests`)
  3. **Lab Booking Approvals** (`/coordinator/lab-booking-approvals`)
- **Department Isolation**: Can view and act only on `CSE` department bookings and sessions (`/api/v1/rbac/coordinator/departments/CSE/*`). Requests for other departments (e.g., `ECE`) are rejected with `403 DEPARTMENT_SCOPE_FORBIDDEN`.
- **Approval Scope**: Can approve only authorised `CSE` departmental laboratory bookings. Non-lab venues or `institute_event` requests are rejected for Coordinator approval with `403 ADMIN_ESCALATION_REQUIRED` and escalated to Admin.
- **Separation of Duties**: Cannot approve their own booking requests (`403 SELF_APPROVAL_FORBIDDEN`).

---

### 3. Faculty Member (`faculty`)

| Field | Value |
| :--- | :--- |
| **UID** | `uid-cit-faculty-f01` |
| **Email** | `faculty.f01@cit-schedora.test` |
| **Role** | `faculty` |
| **Faculty ID (`facultyId`)** | `F01` (`Dr. Ananya Mishra` in `cit-public-v1`, 7 assigned sessions) |
| **Department (`departmentId`)** | `CSE` |
| **Password** | `CITSchedora!Faculty2026` |
| **Account Status** | `active` |
| **Post-Login Workspace** | Faculty Workspace — My Timetable (`/faculty/timetable`) |

**Authorised Capabilities**:
- Restricted to three navigation destinations in fixed order:
  1. **My Timetable** (`/faculty/timetable`)
  2. **Scheduling Requests** (`/faculty/scheduling-requests` — unified screen for **Mark Unavailability** and **Request Additional Session**)
  3. **Session Relocation** (`/faculty/session-relocation`)
- **Personal Timetable Isolation**: Can view only their own timetable (`/api/v1/rbac/faculty/F01/timetable`). Accessing another faculty member's timetable (e.g., `F02`) is rejected with `403 FACULTY_OWNERSHIP_FORBIDDEN`.
- **Separation of Duties**: Cannot approve their own scheduling or relocation requests (`403 SELF_APPROVAL_FORBIDDEN`).

---

### 4. Club Representative (`club`)

| Field | Value |
| :--- | :--- |
| **UID** | `uid-cit-club-robotics` |
| **Email** | `robotics.club@cit-schedora.test` |
| **Role** | `club` |
| **Club ID (`clubId`)** | `robotics_club_demo` (`Robotics Club Demo`) |
| **Password** | `CITSchedora!Club2026` |
| **Account Status** | `active` |
| **Post-Login Workspace** | Club Representative Workspace — Submit Venue Request (`/club/submit-venue-request`) |

**Authorised Capabilities**:
- Restricted to two navigation destinations in fixed order:
  1. **Submit Venue Request** (`/club/submit-venue-request` — supports **Describe Your Event** and **Manual Booking Form**)
  2. **My Venue Requests** (`/club/my-venue-requests`)
- **Club Ownership Isolation**: Can view and cancel only `robotics_club_demo` requests (`/api/v1/rbac/club/robotics_club_demo/requests`). Accessing another club's requests (e.g., `music_society_demo`) is rejected with `403 CLUB_OWNERSHIP_FORBIDDEN`.
- **Category Cap**: Effective booking category is deterministically capped at `club_event`.
- **No Approval Authority**: Cannot approve or reject any booking request (`403 SELF_APPROVAL_FORBIDDEN` / `INSUFFICIENT_APPROVAL_AUTHORITY`).

---

## Explicit Idempotent Seeding Instructions (`scripts/seed-demo-accounts.ts`)

1. **Guard Condition**: The seed script runs **only** when `DEMO_SEED_ENABLED=true` is explicitly set. Invoking `npm run auth:seed` without `DEMO_SEED_ENABLED=true` exits with `DEMO_SEED_DISABLED`.
2. **Command**:
   ```bash
   DEMO_SEED_ENABLED=true npm run auth:seed
   ```
3. **Idempotent Execution Guarantees**:
   - Verifies that the active dataset (`cit-public-v1`) is present in Firestore and resolves `F01` (`Dr. Ananya Mishra`, `CSE`) directly from the stored dataset.
   - Checks whether each Firebase Authentication user already exists (`getUser` / `getUserByEmail`). If the user already exists, **their existing password is preserved** and never reset on repeat runs.
   - Creates or verifies the corresponding `users/{uid}` document in `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9` with zero password fields.
   - Assigns minimal Firebase custom claims (`{ role, authorizationVersion }`).
   - Writes an immutable audit log entry (`DEMO_ACCOUNT_CREATED` or `DEMO_ACCOUNT_VERIFIED`) to `auditLogs/{auditId}`.
