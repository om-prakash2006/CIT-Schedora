# CIT Schedora — Spectra Week Booking Validation & Official Validator Integration

## 1. Official Validator Parity

The Spectra Week Booking Decision Engine implements 100% mathematical parity with `validator.py` (`check_bookings`).

Validation output on the complete institutional schedule:
```
Dataset: cit-public-v1   Schedule says: cit-public-v1   Team: cit-schedora
Hard violations: 0  {}
Soft penalty: 37  {'S1': 0, 'S2': 30, 'S3': 0, 'S4': 3, 'S5': 0, 'S6': 4}
Bookings: score 63.0 | approved 20, alternatives 3, rejected 2, session overrides 0, priority inversions 0
Exam soft penalty: 0
```

## 2. Hard Booking Violations Checked (Rules B1, B2, B3, H13)

| Rule | Category | Description | Violation Count |
|---|---|---|---|
| **B1** | Booking Validity | Invalid timing ($a < 1$ or $b > 13$), wrong day, duration mismatch ($b - a + 1 \neq \text{duration}$), or unknown status. | **0** |
| **B2** | Venue Eligibility | Unknown room, venue does not allow events (`events_allowed == False`), room type mismatch, capacity deficit ($\text{cap} < \text{att}$), or missing required features (`needs`). | **0** |
| **B3** | Collision & Double-Booking | Room double-booked with another booking or non-overridden class session, or cancelled request approved. | **0** |
| **H13** | Governance & Mandatory Groups | Student groups in mandatory events double-booked with class sessions, or unapproved class displacement. | **0** |

## 3. Score Calculation Methodology

The booking score is calculated according to official category weights:
- Full weight for `approved` in requested window.
- Half weight for `alternative_offered` outside requested window.
- Zero weight for `rejected`.

$$\text{Booking Score} = \sum_{r \in \text{Approved}} W(\text{eff}(r)) + \sum_{r \in \text{Alternatives}} 0.5 \times W(\text{eff}(r))$$

- **Maximum Possible Score (if all 24 non-cancelled approved)**: `70.0`
- **Achieved Score**: `63.0 / 70.0` (90.0% efficiency)
- **Approved**: 20 requests
- **Alternatives Offered**: 3 requests (`BR-17` with period 14, `BR-18` with CE-3 class collision, `BR-20` with AUD Friday class collision)
- **Rejected**: 2 requests (`BR-04` cancelled by requester, `BR-09` 1200 attendance exceeding 800 campus max)
- **Priority Inversions**: 0
