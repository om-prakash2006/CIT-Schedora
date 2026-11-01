# CIT Schedora — Firestore Zero-Trust Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Centralized Backend Authority**: All privileged institutional mutations (dataset activation, solver timetable publication, examination seating allocation, booking decisions, disruption repair commits, user role assignments, and priority hierarchy updates) execute through the Node.js TypeScript backend via the Firebase Admin SDK.
2. **Zero Client-Side Role Escalation**: Direct client SDK writes to `/users/{userId}` or `/admins/{adminUid}` are strictly prohibited from self-assigning or mutating `role`, `passwordHash`, or `departmentId`.
3. **PII & Credential Hash Isolation**: `/users/{userId}` contains institutional email addresses and Argon2id password hashes; blanket `isSignedIn()` reads or list queries are strictly forbidden.
4. **Immutable Governance & Audit Trail**: `/auditLogs/{auditId}` and `/approvalRecords/{approvalId}` are append-only governance ledgers; client-side updates and deletions are unconditionally denied (`allow update, delete: if false;`).
5. **Protected Institutional Invariants**: Published schedules (`/schedules/{scheduleId}`), booking decisions (`/bookingDecisions/{decisionId}`), datasets (`/datasets/{datasetId}`), and priority settings (`/systemSettings/{settingKey}`) cannot be mutated by non-admin client connections.
6. **ID & Payload Size Hardening**: Every document ID path variable must satisfy `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars) and every string field must enforce explicit `.size()` bounds.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Self-Promoted Admin Role)**: Authenticated non-admin attempts `create` on `/users/usr_attacker` with `{ "role": "admin" }`. -> **Expected: `PERMISSION_DENIED`**.
2. **Payload 2 (Shadow Field Injection on Booking Request)**: Authenticated user attempts `create` on `/bookingRequests/req_01` including unauthorized field `{ "priorityOverride": 1 }`. -> **Expected: `PERMISSION_DENIED`** via `.keys().hasOnly(...)`.
3. **Payload 3 (Unverified Email Admin Spoof)**: Attacker with `email == "pratyushsatapathy623@gmail.com"` but `email_verified == false` attempts to write to `/systemSettings/priority_hierarchy`. -> **Expected: `PERMISSION_DENIED`**.
4. **Payload 4 (User Directory PII Scraping)**: Authenticated club user attempts `get` or `list` on `/users/usr_other_faculty` to read `passwordHash` and `email`. -> **Expected: `PERMISSION_DENIED`**.
5. **Payload 5 (ID Poisoning / 2KB Path Variable)**: Attacker sends `create` on `/bookingRequests/{2000_char_id}`. -> **Expected: `PERMISSION_DENIED`** via `isValidId()`.
6. **Payload 6 (Terminal Status Reversal on Booking Decision)**: Attacker attempts `update` on `/bookingDecisions/dec_01` to flip `outcome` from `"rejected"` to `"approved"`. -> **Expected: `PERMISSION_DENIED`**.
7. **Payload 7 (Audit Log Tampering / Deletion)**: Admin or user attempts `update` or `delete` on `/auditLogs/aud_01`. -> **Expected: `PERMISSION_DENIED`**.
8. **Payload 8 (Unvalidated Timetable Publication)**: Non-admin attempts `create` on `/schedules/sched_01` with `{ "validatorPassed": true }`. -> **Expected: `PERMISSION_DENIED`**.
9. **Payload 9 (Identity Spoofing on Request Submission)**: User `uid_A` attempts `create` on `/bookingRequests/req_99` with `requesterUserId: "uid_B"`. -> **Expected: `PERMISSION_DENIED`**.
10. **Payload 10 (Forged Client Timestamp)**: User attempts `create` on `/bookingRequests/req_100` with a past/future `createdAt` not matching `request.time`. -> **Expected: `PERMISSION_DENIED`**.
11. **Payload 11 (Value Poisoning on Update)**: User attempts `update` on `/bookingRequests/req_100` setting `title` to a 50,000-character string or integer. -> **Expected: `PERMISSION_DENIED`** via `isValidBookingRequest(incoming())`.
12. **Payload 12 (Blanket Unfiltered List Query)**: Authenticated user attempts an unfiltered `list` query on `/bookingRequests` to scrape other clubs' private requests. -> **Expected: `PERMISSION_DENIED`** unless `resource.data.requesterUserId == request.auth.uid` or `isAdmin()`.
