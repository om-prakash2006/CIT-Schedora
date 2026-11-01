# CIT Schedora — Booking Priority, Role Capping & Inversion Prevention

## 1. Category Weights & Institutional Priority Hierarchy

The booking decision engine enforces the official CIT category weights:

| Priority Rank | Category Name | Score Weight (Approved) | Score Weight (Alternative) | Allowed Roles |
|---|---|---|---|---|
| 1 | `institute_event` | **5.0** | **2.5** | `admin` only |
| 2 | `guest_lecture` | **4.0** | **2.0** | `admin`, `faculty` |
| 3 | `department_event` | **3.0** | **1.5** | `admin`, `department_coordinator` |
| 4 | `club_event` | **2.0** | **1.0** | `admin`, `department_coordinator`, `faculty`, `club` |

## 2. Role Category Capping Logic

The system deterministically caps the effective category of any request according to the requester's role. If a requester submits a request for a category above their institutional authorization, it is clamped to their role cap:

```python
def effective_category(data, req):
  order = data["priority_order"]  # ['institute_event', 'guest_lecture', 'department_event', 'club_event']
  cap = data["role_category_cap"].get(req["role"], "club_event")
  a = (
      order.index(req["requested_category"])
      if req["requested_category"] in order
      else len(order) - 1
  )
  return order[max(a, order.index(cap))]
```

- **`club`**: Capped strictly at `club_event` (weight 2).
  - Example: `BR-12` (club requesting `guest_lecture`) -> evaluated as `club_event`.
  - Example: `BR-15` (club requesting `institute_event`) -> evaluated as `club_event`.
- **`faculty`**: Capped at `guest_lecture` (weight 4). Cannot request `institute_event`.
- **`department_coordinator`**: Capped at `department_event` (weight 3). Cannot request `guest_lecture` or `institute_event`.
- **`admin`**: Uncapped; can request up to `institute_event` (weight 5).

## 3. Strict Tie-Breaking Order

When two requests have the same effective category, ties are resolved deterministically:
1. **Earlier submission timestamp** (`submitted_at` ISO-8601 string comparison).
2. **Lexicographical Request ID** (`id` string comparison).

Example: `BR-06` vs `BR-07` (both `club_event`, overlapping windows on `THU P10–P11`):
- `BR-06` submitted on `2027-01-23T10:00:00+05:30`
- `BR-07` submitted on `2027-01-26T16:00:00+05:30`
- `BR-06` outranks `BR-07` and is granted Seminar Hall 1 (`SH-1`).
- `BR-07` accepts `auditorium`, so it is allocated `AUD`, completely eliminating conflict and priority inversions.

## 4. Priority Inversion Detection

A **Priority Inversion** occurs if a higher-priority request $R_{high}$ was rejected while a lower-priority request $R_{low}$ ($R_{high} \succ R_{low}$) was approved in a room and time slot that $R_{high}$ could have legitimately occupied.

The engine runs the official validator's priority inversion detector:
- $R_{high}$ is not cancelled.
- $R_{high}$ status is `rejected`.
- $R_{low}$ status is `approved`.
- $R_{high}$ strictly outranks $R_{low}$ via `outranks(r_high, r_low)`.
- The allocated room matches $R_{high}$'s room type, capacity ($\ge$ attendance), and equipment features.
- $R_{high}$'s requested windows intersect with $R_{low}$'s assigned slot.

**Result**: In the official dataset, **0 priority inversions** occur.
