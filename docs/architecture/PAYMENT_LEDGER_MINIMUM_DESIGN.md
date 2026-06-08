# Yawmia Payment Ledger Minimum Design

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 40  
> Status: Architecture design / production prerequisite  
> Runtime status: Not implemented  
> Source finding: Patch 39 payment ledger gap characterization  
> Production posture: Payment ledger required before serious production or investment readiness

---

## 1. Purpose

This document defines the minimum payment ledger design required before Yawmia can claim production-grade financial correctness.

It follows Patch 39, which characterized the current payment implementation as:

```text
mutable payment projection
on-demand receipt generation
no immutable ledger entries
no persisted receipt allocation
no transaction-backed financial event history
```

This document is a design target.

It does not implement:

```text
PostgreSQL runtime
payment ledger tables
receipt persistence
DB transactions
queue replacement
outbox dispatcher
```

---

## 2. Current Runtime Reality

Current implementation is file-backed JSON.

Relevant files:

```text
server/services/payments.js
server/services/financialExport.js
server/services/jobs.js
server/handlers/paymentsHandler.js
tests/e2e/payment-ledger-gap-characterization.test.js
```

Current behavior:

```text
createPayment() creates one mutable pay_*.json record
confirmPayment() mutates the same payment record
disputePayment() mutates the same payment record
completePayment() mutates the same payment record
getFinancialSummary() aggregates current mutable payment records
generateReceipt() builds an on-demand receipt from current projections
receipt number is generated at read time
receipt is not persisted
```

Current payment records are useful projections, but they are not a financial ledger.

---

## 3. Production Decision

Yawmia must not treat `payments` as the source of financial truth.

The production source of truth must be:

```text
payment_ledger_entries
```

The `payments` record/table should become a projection derived from ledger state and dispute state.

Receipt numbers must be transactionally allocated and persisted.

---

## 4. Definitions

### Payment Projection

A payment projection is a convenient current-state view.

Example:

```text
payment.status = completed
payment.amount = 300
payment.platformFee = 45
payment.workerPayout = 255
```

Projection answers:

```text
what is the current payment state?
```

Projection does not answer reliably:

```text
who changed the financial state?
when did each financial event happen?
what was the previous amount?
was a dispute opened then later resolved?
was a receipt issued once and only once?
was an adjustment made?
```

### Payment Ledger

A payment ledger is an immutable append-only financial event stream.

Ledger answers:

```text
what happened financially, in order, with actor, reason, and idempotency?
```

---

## 5. Minimum Tables / Collections

Target production storage should include at minimum:

```text
payments
payment_ledger_entries
payment_disputes
receipts
outbox_events
admin_audit_log
```

If implemented in PostgreSQL, these should be relational tables with constraints and transactions.

---

## 6. `payments` Projection

`payments` should remain as current-state projection.

Minimum fields:

```text
id
job_id
employer_id
status
currency
amount
platform_fee
worker_payout
method
workers_accepted
daily_wage
duration_days
attendance_adjusted
attendance_breakdown_json
created_at
confirmed_at
completed_at
last_ledger_entry_id
updated_at
```

Allowed statuses:

```text
pending
employer_confirmed
disputed
completed
cancelled
refunded
adjusted
```

Production rules:

```text
payments is mutable
payments is not the ledger
payments updates must happen only inside the same transaction as ledger insert
payments.last_ledger_entry_id must point to the latest financial event
```

---

## 7. `payment_ledger_entries`

Minimum ledger schema:

```text
id
payment_id
job_id
actor_id
actor_role
entry_type
amount_delta
platform_fee_delta
worker_payout_delta
currency
reason
metadata_json
idempotency_key
created_at
```

Required constraints:

```text
id primary key
payment_id references payments(id)
job_id references jobs(id)
idempotency_key unique where not null
created_at immutable
entry_type constrained to known values
currency required
```

Ledger entries must be append-only.

No update/delete in normal runtime.

---

## 8. Required Ledger Entry Types

Minimum entry types:

```text
payment_created
employer_confirmed
worker_disputed
employer_disputed
admin_resolved
payment_completed
payment_adjusted
receipt_issued
refund_requested
refund_completed
reversal
```

Recommended future entry types:

```text
attendance_adjustment_applied
platform_fee_adjusted
worker_payout_adjusted
dispute_evidence_added
manual_admin_correction
```

---

## 9. `payment_disputes`

Disputes should not be represented only by fields on `payments`.

Minimum schema:

```text
id
payment_id
job_id
opened_by
opened_by_role
reason
status
resolution
resolved_by
resolved_at
created_at
updated_at
```

Allowed statuses:

```text
open
under_review
resolved_employer
resolved_worker
resolved_adjusted
dismissed
```

Production rule:

```text
opening or resolving a dispute must insert a payment_ledger_entries row.
```

---

## 10. `receipts`

Receipts must be persisted.

Minimum schema:

```text
id
receipt_number
payment_id
job_id
employer_id
currency
subtotal
platform_fee
worker_payout
attendance_snapshot_json
worker_snapshot_json
job_snapshot_json
issued_by
issued_at
created_at
```

Required constraints:

```text
receipt_number unique
payment_id unique unless correction receipts are explicitly supported
receipt_number allocated inside transaction
receipt values snapshot persisted at issuance time
```

Production rule:

```text
A receipt is a financial artifact, not a view.
```

Current `generateReceipt()` can become:

```text
read persisted receipt if exists
or issue receipt transactionally if allowed
```

It must not allocate a receipt number on every read.

---

## 11. Receipt Number Allocation

Current behavior in `server/services/financialExport.js` is insufficient because receipt sequence is generated from timestamp fallback.

Target receipt number format may remain:

```text
RCT-YYYYMMDD-NNN
```

But allocation must be backed by transactional counter state.

Possible PostgreSQL design:

```text
receipt_sequences:
  receipt_date primary key
  next_sequence integer not null
```

Transaction flow:

```text
begin
select receipt_sequences row for update
allocate next sequence
insert receipt
insert ledger entry receipt_issued
update payments.last_ledger_entry_id
insert outbox event
commit
```

---

## 12. Transaction Boundaries

### 12.1 Job Completion + Payment Creation

Current runtime:

```text
completeJob() mutates job
eventBus emits job:completed
createPayment() is fire-and-forget
```

Production target:

```text
begin
validate job owner
update job status to completed
calculate attendance-adjusted payable amount
insert payment projection
insert payment_ledger_entries(payment_created)
insert outbox_events(payment_created)
commit
```

Failure mode solved:

```text
completed job without payment
payment without matching committed job completion
missing notification after payment creation
```

---

### 12.2 Payment Confirmation

Production target:

```text
begin
select payment for update
validate employer ownership
validate status = pending
insert payment_ledger_entries(employer_confirmed)
update payments.status = employer_confirmed
insert outbox_events(payment_confirmed)
commit
```

---

### 12.3 Payment Dispute

Production target:

```text
begin
select payment for update
validate actor is involved
validate dispute window
validate not already disputed
insert payment_disputes
insert payment_ledger_entries(worker_disputed or employer_disputed)
update payments.status = disputed
insert outbox_events(payment_disputed)
commit
```

---

### 12.4 Admin Completion / Resolution

Production target:

```text
begin
select payment for update
validate admin capability
validate approval if required
insert payment_ledger_entries(admin_resolved)
update payment_disputes if open
update payments.status = completed
insert admin_audit_log
insert outbox_events(payment_completed)
commit
```

---

### 12.5 Receipt Issuance

Production target:

```text
begin
select payment for update
validate status allows receipt
if receipt exists return existing receipt
allocate receipt number
insert receipts snapshot
insert payment_ledger_entries(receipt_issued)
insert outbox_events(receipt_issued)
commit
```

---

## 13. Idempotency

Every externally triggered payment operation should support idempotency.

Recommended idempotency keys:

```text
payment_created:job:{jobId}
payment_confirmed:{paymentId}:employer:{employerId}
payment_disputed:{paymentId}:user:{userId}
payment_completed:{paymentId}:admin:{adminId}:{approvalId}
receipt_issued:{paymentId}
```

Production rule:

```text
retries must return prior committed result, not duplicate ledger entries.
```

---

## 14. Outbox Integration

Payment workflows must not rely on in-memory EventBus for durable business events.

Required outbox events:

```text
payment_created
payment_confirmed
payment_disputed
payment_completed
receipt_issued
payment_adjusted
refund_completed
```

Minimum outbox fields:

```text
id
event_type
aggregate_type
aggregate_id
payload_json
status
attempts
created_at
available_at
processed_at
```

Production rule:

```text
Domain mutation and outbox insert happen in the same transaction.
```

---

## 15. Audit Integration

Admin payment actions must write durable audit rows in the same transaction or through an outbox-backed audit writer.

Sensitive actions:

```text
payment_complete
payment_adjustment
dispute_resolution
refund_or_reversal
receipt_correction
```

Audit must record:

```text
admin_id
capability
approval_id if required
target payment_id
ledger_entry_id
ip/user-agent where available
created_at
```

---

## 16. Attendance Adjustment

Current `createPayment()` calculates attendance-adjusted amount from attendance summary.

Target behavior:

```text
attendance adjustment calculation should be deterministic
attendance snapshot should be persisted in payment and receipt
ledger entry should record adjustment metadata
```

Recommended metadata:

```json
{
  "expectedWorkerDays": 2,
  "actualWorkerDays": 1,
  "noShowDays": 1,
  "attendanceRate": 0.5,
  "source": "attendance_summary"
}
```

---

## 17. Migration Path

### Step 1 — Characterize

Already done by:

```text
tests/e2e/payment-ledger-gap-characterization.test.js
```

### Step 2 — Design

This document.

### Step 3 — Schema Draft

Create a PostgreSQL schema draft for:

```text
payments
payment_ledger_entries
payment_disputes
receipts
receipt_sequences
outbox_events
```

### Step 4 — Repository Boundary

Introduce internal interfaces:

```text
PaymentRepository
PaymentLedgerRepository
ReceiptRepository
OutboxRepository
```

Initial implementation can still be file-backed for tests, but production target must be PostgreSQL.

### Step 5 — Transaction Adapter

Add a transaction abstraction:

```text
withTransaction(async tx => {})
```

Production implementation should map to PostgreSQL transaction.

### Step 6 — Runtime Migration

Move payment workflows first:

```text
create payment
confirm payment
dispute payment
complete payment
issue receipt
```

### Step 7 — Data Backfill

For existing file-backed payments:

```text
read pay_*.json
insert payments projection
insert synthetic payment_created ledger entry
insert synthetic status transition ledger entries where timestamps exist
mark imported_from_file_json = true
```

### Step 8 — Freeze File Writes

After migration:

```text
file-backed payments become read-only archive or export artifact
PostgreSQL becomes source of truth
```

---

## 18. Backfill Rules

Backfill must preserve truth without inventing false certainty.

For each existing payment:

```text
always insert payment_created
if confirmedAt exists insert employer_confirmed
if disputedAt exists insert worker_disputed or employer_disputed using disputedBy
if completedAt exists insert payment_completed
```

If ordering is ambiguous:

```text
preserve timestamps
mark metadata_json.estimatedFromProjection = true
```

Do not generate receipts retroactively unless business/legal policy approves it.

If receipt was never persisted, mark:

```text
receiptMissing=true
```

---

## 19. Required Tests Before Runtime Migration

Characterization tests:

```text
payment-ledger-gap-characterization
receipt persistence gap characterization
job complete/payment creation partial failure characterization
```

Future implementation tests:

```text
ledger append-only invariant
idempotent payment creation
idempotent receipt issuance
duplicate receipt prevention
payment summary derived from ledger/projection consistency
dispute opens ledger entry
admin completion writes ledger + audit + outbox
transaction rollback leaves no partial payment state
```

---

## 20. Non-goals

This design does not require immediate microservices.

This design does not require AI.

This design does not require VPS-per-domain.

This design does not require external payment processor integration.

This design does not require replacing the entire app at once.

The target is:

```text
modular transaction-backed monolith first
```

---

## 21. AI Boundary

AI may summarize:

```text
payment dispute history
ledger anomaly candidates
admin review suggestions
financial risk explanations
```

AI must not:

```text
confirm payments
complete payments
issue receipts
change ledger entries
resolve disputes
approve refunds
delete or anonymize financial records
```

Financial execution must remain deterministic, auditable, and transaction-backed.

---

## 22. Production Readiness Gate

Yawmia should not claim production-grade payment readiness until all are true:

```text
payment_ledger_entries implemented
receipts persisted transactionally
receipt_number unique and transactionally allocated
payment transitions insert ledger rows
payment projection update and ledger insert are atomic
financial summary reconciles with ledger
admin payment completion audited
outbox events persist payment notifications
session/admin auth hardening completed
migration/backfill tested
rollback plan tested
```

---

## 23. Final Decision

Patch 39 proved the current payment model is not a ledger.

This document defines the minimum ledger design required before production.

The next engineering direction should be:

```text
PostgreSQL-backed payment ledger
transactional receipt issuance
payment projection derived from immutable ledger
outbox-backed payment events
modular monolith first
```

No microservices are required now.

No AI data gateway is allowed.

No smoke test should be treated as proof of financial correctness.
