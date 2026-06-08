# PostgreSQL Payment Ledger Schema Draft

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 41  
> Status: Migration preparation / schema draft  
> Runtime status: Not implemented  
> Depends on: `PAYMENT_LEDGER_MINIMUM_DESIGN.md`  
> Production posture: Draft only; not a migration execution approval

---

## 1. Purpose

This document drafts the PostgreSQL schema required to implement the Yawmia payment ledger and persisted receipt model.

It translates:

```text
docs/architecture/PAYMENT_LEDGER_MINIMUM_DESIGN.md
```

into concrete table and constraint planning.

This document does not:

```text
add PostgreSQL dependency
run migrations
change runtime persistence
replace file-backed JSON
create production tables
enable externalization
approve production readiness
```

It is a migration preparation artifact.

---

## 2. Current Runtime Reminder

Current runtime remains:

```text
file-backed JSON
mutable payment projection
on-demand receipt generation
no immutable ledger entries
no persisted receipt allocation
no DB transactions
```

Relevant runtime files:

```text
server/services/payments.js
server/services/financialExport.js
server/services/jobs.js
server/handlers/paymentsHandler.js
tests/e2e/payment-ledger-gap-characterization.test.js
```

Patch 39 characterized the current gap.

Patch 40 defined the minimum design target.

Patch 41 defines a PostgreSQL schema draft only.

---

## 3. Design Principles

The PostgreSQL implementation must follow these rules:

```text
ledger entries are append-only
receipts are persisted financial artifacts
receipt numbers are transactionally allocated
payment projection updates happen with ledger insert in one transaction
admin payment completion is audited
domain events are persisted through outbox_events
idempotency keys prevent duplicated financial actions
backfill must not invent false certainty
```

---

## 4. Required PostgreSQL Extensions

Recommended extension:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Reason:

```text
gen_random_uuid()
```

Alternative:

```text
application-generated IDs may be used if consistent with existing Yawmia IDs
```

This draft uses text IDs to ease migration from existing IDs like:

```text
pay_x
job_x
usr_x
```

---

## 5. Enum Strategy

For the first migration, prefer CHECK constraints over PostgreSQL enum types.

Reason:

```text
CHECK constraints are easier to evolve during early migration
```

Later migrations can convert stable fields to enum types.

---

## 6. `payments`

Purpose:

```text
current-state projection
not the financial source of truth
```

Draft:

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,

  job_id TEXT NOT NULL,
  employer_id TEXT NOT NULL,

  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'employer_confirmed',
      'disputed',
      'completed',
      'cancelled',
      'refunded',
      'adjusted'
    )
  ),

  currency TEXT NOT NULL DEFAULT 'EGP',

  amount INTEGER NOT NULL CHECK (amount >= 0),
  platform_fee INTEGER NOT NULL CHECK (platform_fee >= 0),
  worker_payout INTEGER NOT NULL CHECK (worker_payout >= 0),

  method TEXT NOT NULL CHECK (
    method IN ('cash', 'wallet', 'instapay')
  ),

  workers_accepted INTEGER NOT NULL DEFAULT 0 CHECK (workers_accepted >= 0),
  daily_wage INTEGER NOT NULL DEFAULT 0 CHECK (daily_wage >= 0),
  duration_days INTEGER NOT NULL DEFAULT 1 CHECK (duration_days >= 1),

  attendance_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_breakdown_json JSONB,

  notes TEXT,

  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  last_ledger_entry_id TEXT,

  imported_from_file_json BOOLEAN NOT NULL DEFAULT FALSE,
  import_metadata_json JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payments_amount_split_check
    CHECK (amount = platform_fee + worker_payout)
);
```

Recommended indexes:

```sql
CREATE INDEX idx_payments_job_id ON payments(job_id);
CREATE INDEX idx_payments_employer_id ON payments(employer_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
```

Future foreign keys after core migration:

```sql
-- ALTER TABLE payments
--   ADD CONSTRAINT fk_payments_job
--   FOREIGN KEY (job_id) REFERENCES jobs(id);

-- ALTER TABLE payments
--   ADD CONSTRAINT fk_payments_employer
--   FOREIGN KEY (employer_id) REFERENCES users(id);
```

Do not add foreign keys until `users` and `jobs` are DB-backed.

---

## 7. `payment_ledger_entries`

Purpose:

```text
immutable source of financial truth
```

Draft:

```sql
CREATE TABLE payment_ledger_entries (
  id TEXT PRIMARY KEY,

  payment_id TEXT NOT NULL,
  job_id TEXT NOT NULL,

  actor_id TEXT,
  actor_role TEXT CHECK (
    actor_role IS NULL OR actor_role IN (
      'worker',
      'employer',
      'admin',
      'system'
    )
  ),

  entry_type TEXT NOT NULL CHECK (
    entry_type IN (
      'payment_created',
      'employer_confirmed',
      'worker_disputed',
      'employer_disputed',
      'admin_resolved',
      'payment_completed',
      'payment_adjusted',
      'receipt_issued',
      'refund_requested',
      'refund_completed',
      'reversal',
      'attendance_adjustment_applied',
      'platform_fee_adjusted',
      'worker_payout_adjusted',
      'dispute_evidence_added',
      'manual_admin_correction'
    )
  ),

  amount_delta INTEGER NOT NULL DEFAULT 0,
  platform_fee_delta INTEGER NOT NULL DEFAULT 0,
  worker_payout_delta INTEGER NOT NULL DEFAULT 0,

  currency TEXT NOT NULL DEFAULT 'EGP',

  reason TEXT,
  metadata_json JSONB,

  idempotency_key TEXT,

  imported_from_file_json BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_from_projection BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_ledger_amount_split_check
    CHECK (amount_delta = platform_fee_delta + worker_payout_delta)
);
```

Indexes:

```sql
CREATE INDEX idx_payment_ledger_payment_id
  ON payment_ledger_entries(payment_id, created_at);

CREATE INDEX idx_payment_ledger_job_id
  ON payment_ledger_entries(job_id, created_at);

CREATE INDEX idx_payment_ledger_entry_type
  ON payment_ledger_entries(entry_type);

CREATE INDEX idx_payment_ledger_actor
  ON payment_ledger_entries(actor_id, actor_role);

CREATE UNIQUE INDEX idx_payment_ledger_idempotency_key
  ON payment_ledger_entries(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

Future foreign key:

```sql
-- ALTER TABLE payment_ledger_entries
--   ADD CONSTRAINT fk_payment_ledger_payment
--   FOREIGN KEY (payment_id) REFERENCES payments(id);
```

---

## 8. Append-only Ledger Protection

Application code must never update or delete ledger rows.

Optional DB-level guard:

```sql
CREATE OR REPLACE FUNCTION prevent_payment_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_payment_ledger_update
BEFORE UPDATE ON payment_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_payment_ledger_mutation();

CREATE TRIGGER trg_prevent_payment_ledger_delete
BEFORE DELETE ON payment_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_payment_ledger_mutation();
```

This trigger should be applied only after migration/backfill tooling is stable.

---

## 9. `payment_disputes`

Purpose:

```text
durable dispute workflow separate from payment projection
```

Draft:

```sql
CREATE TABLE payment_disputes (
  id TEXT PRIMARY KEY,

  payment_id TEXT NOT NULL,
  job_id TEXT NOT NULL,

  opened_by TEXT NOT NULL,
  opened_by_role TEXT NOT NULL CHECK (
    opened_by_role IN ('worker', 'employer')
  ),

  reason TEXT NOT NULL,

  status TEXT NOT NULL CHECK (
    status IN (
      'open',
      'under_review',
      'resolved_employer',
      'resolved_worker',
      'resolved_adjusted',
      'dismissed'
    )
  ) DEFAULT 'open',

  resolution TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,

  opened_ledger_entry_id TEXT,
  resolved_ledger_entry_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes:

```sql
CREATE INDEX idx_payment_disputes_payment_id ON payment_disputes(payment_id);
CREATE INDEX idx_payment_disputes_job_id ON payment_disputes(job_id);
CREATE INDEX idx_payment_disputes_status ON payment_disputes(status);
CREATE INDEX idx_payment_disputes_opened_by ON payment_disputes(opened_by);
```

Recommended rule:

```sql
CREATE UNIQUE INDEX idx_payment_disputes_one_open_per_payment
  ON payment_disputes(payment_id)
  WHERE status IN ('open', 'under_review');
```

---

## 10. `receipt_sequences`

Purpose:

```text
transactional receipt number allocation
```

Draft:

```sql
CREATE TABLE receipt_sequences (
  receipt_date DATE PRIMARY KEY,
  next_sequence INTEGER NOT NULL CHECK (next_sequence >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Usage:

```text
select row for update
allocate next_sequence
increment next_sequence
insert receipt
commit
```

---

## 11. `receipts`

Purpose:

```text
persisted financial receipt artifact
```

Draft:

```sql
CREATE TABLE receipts (
  id TEXT PRIMARY KEY,

  receipt_number TEXT NOT NULL UNIQUE,

  payment_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  employer_id TEXT NOT NULL,

  currency TEXT NOT NULL DEFAULT 'EGP',

  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  platform_fee INTEGER NOT NULL CHECK (platform_fee >= 0),
  worker_payout INTEGER NOT NULL CHECK (worker_payout >= 0),

  attendance_snapshot_json JSONB,
  worker_snapshot_json JSONB,
  job_snapshot_json JSONB,
  payment_snapshot_json JSONB,

  issued_by TEXT NOT NULL,
  issued_by_role TEXT NOT NULL CHECK (
    issued_by_role IN ('admin', 'system', 'employer')
  ),

  ledger_entry_id TEXT,

  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receipts_amount_split_check
    CHECK (subtotal = platform_fee + worker_payout)
);
```

Indexes:

```sql
CREATE UNIQUE INDEX idx_receipts_payment_id_once
  ON receipts(payment_id);

CREATE INDEX idx_receipts_job_id ON receipts(job_id);
CREATE INDEX idx_receipts_employer_id ON receipts(employer_id);
CREATE INDEX idx_receipts_issued_at ON receipts(issued_at DESC);
```

Future foreign keys:

```sql
-- ALTER TABLE receipts
--   ADD CONSTRAINT fk_receipts_payment
--   FOREIGN KEY (payment_id) REFERENCES payments(id);

-- ALTER TABLE receipts
--   ADD CONSTRAINT fk_receipts_ledger
--   FOREIGN KEY (ledger_entry_id) REFERENCES payment_ledger_entries(id);
```

---

## 12. `outbox_events`

Purpose:

```text
durable event delivery replacing fire-and-forget EventBus for business-critical events
```

Draft:

```sql
CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,

  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,

  payload_json JSONB NOT NULL,

  status TEXT NOT NULL CHECK (
    status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')
  ) DEFAULT 'pending',

  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),

  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  last_error TEXT,

  idempotency_key TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes:

```sql
CREATE INDEX idx_outbox_pending_claim
  ON outbox_events(status, available_at, created_at);

CREATE INDEX idx_outbox_aggregate
  ON outbox_events(aggregate_type, aggregate_id);

CREATE UNIQUE INDEX idx_outbox_idempotency_key
  ON outbox_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

Claim pattern:

```sql
SELECT *
FROM outbox_events
WHERE status = 'pending'
  AND available_at <= now()
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 50;
```

---

## 13. Payment Transaction Flows

### 13.1 Create Payment

```text
begin
lock completed job
validate job completed
validate no payment exists for job
calculate attendance-adjusted amount
insert payments
insert payment_ledger_entries(payment_created)
update payments.last_ledger_entry_id
insert outbox_events(payment_created)
commit
```

Idempotency:

```text
payment_created:job:{jobId}
```

---

### 13.2 Confirm Payment

```text
begin
select payment for update
validate employer owns payment
validate status = pending
insert payment_ledger_entries(employer_confirmed)
update payments.status = employer_confirmed
update payments.confirmed_at
update payments.last_ledger_entry_id
insert outbox_events(payment_confirmed)
commit
```

Idempotency:

```text
payment_confirmed:{paymentId}:employer:{employerId}
```

---

### 13.3 Open Dispute

```text
begin
select payment for update
validate actor is employer or accepted worker
validate dispute window
validate no open dispute
insert payment_disputes
insert payment_ledger_entries(worker_disputed/employer_disputed)
update payments.status = disputed
update payments.last_ledger_entry_id
insert outbox_events(payment_disputed)
commit
```

Idempotency:

```text
payment_disputed:{paymentId}:user:{userId}
```

---

### 13.4 Complete / Resolve Payment

```text
begin
select payment for update
validate admin capability
validate approval if required
validate payment status in employer_confirmed/disputed
resolve open dispute if present
insert payment_ledger_entries(admin_resolved or payment_completed)
update payments.status = completed
update payments.completed_at
update payments.last_ledger_entry_id
insert admin_audit_log
insert outbox_events(payment_completed)
commit
```

Idempotency:

```text
payment_completed:{paymentId}:admin:{adminId}:{approvalId}
```

---

### 13.5 Issue Receipt

```text
begin
select payment for update
validate payment status allows receipt
if receipt exists return existing receipt
select receipt_sequences row for update
allocate receipt number
insert receipts snapshot
insert payment_ledger_entries(receipt_issued)
update payments.last_ledger_entry_id
insert outbox_events(receipt_issued)
commit
```

Idempotency:

```text
receipt_issued:{paymentId}
```

---

## 14. Backfill from File-backed Payments

Existing file-backed records should be migrated carefully.

Source:

```text
data/payments/**/*.json
```

Backfill rules:

```text
insert payments projection as imported_from_file_json=true
insert payment_created ledger entry for every payment
if confirmedAt exists insert employer_confirmed
if disputedAt exists insert worker_disputed or employer_disputed
if completedAt exists insert payment_completed
do not create receipts unless business policy approves retroactive receipt issuance
```

Synthetic ledger metadata:

```json
{
  "source": "file_json_backfill",
  "estimatedFromProjection": true,
  "originalPaymentId": "pay_x"
}
```

---

## 15. Backfill Ordering

For each payment:

```text
createdAt -> payment_created
confirmedAt -> employer_confirmed
disputedAt -> worker_disputed/employer_disputed
completedAt -> payment_completed
```

If timestamps conflict or are missing:

```text
preserve original fields
set estimated_from_projection=true
do not fabricate precise ordering
```

---

## 16. Reconciliation Queries

### 16.1 Projection vs Ledger Totals

```sql
SELECT
  p.id,
  p.amount AS payment_amount,
  COALESCE(SUM(l.amount_delta), 0) AS ledger_amount
FROM payments p
LEFT JOIN payment_ledger_entries l ON l.payment_id = p.id
GROUP BY p.id
HAVING p.amount <> COALESCE(SUM(l.amount_delta), 0);
```

This query may need refinement depending on whether confirmation/completion entries use zero deltas or state-only entries.

Recommended convention:

```text
payment_created carries initial amount deltas
state transition entries usually carry zero deltas
adjustment/refund/reversal entries carry deltas
```

---

### 16.2 Receipts Without Ledger Entry

```sql
SELECT r.*
FROM receipts r
LEFT JOIN payment_ledger_entries l ON l.id = r.ledger_entry_id
WHERE r.ledger_entry_id IS NULL
   OR l.id IS NULL;
```

---

### 16.3 Completed Payments Without Receipt

Business-dependent.

If receipt required for completed payments:

```sql
SELECT p.*
FROM payments p
LEFT JOIN receipts r ON r.payment_id = p.id
WHERE p.status = 'completed'
  AND r.id IS NULL;
```

If receipt issued only on demand, this is not an error.

---

## 17. Application-layer Repository Boundary

Introduce these interfaces before runtime migration:

```text
PaymentRepository
PaymentLedgerRepository
PaymentDisputeRepository
ReceiptRepository
OutboxRepository
```

Suggested methods:

```text
PaymentRepository.createProjection(tx, data)
PaymentRepository.findForUpdate(tx, paymentId)
PaymentRepository.updateProjection(tx, paymentId, patch)
PaymentRepository.findByJob(tx, jobId)

PaymentLedgerRepository.append(tx, entry)
PaymentLedgerRepository.listByPayment(tx, paymentId)

PaymentDisputeRepository.open(tx, data)
PaymentDisputeRepository.resolve(tx, disputeId, patch)
PaymentDisputeRepository.findOpenByPayment(tx, paymentId)

ReceiptRepository.findByPayment(tx, paymentId)
ReceiptRepository.issue(tx, data)
ReceiptRepository.allocateReceiptNumber(tx, date)

OutboxRepository.insert(tx, event)
```

---

## 18. Transaction Adapter Target

Target abstraction:

```javascript
await withTransaction(async (tx) => {
  // repository calls using tx
});
```

No service should directly mutate multiple core records outside a transaction once PostgreSQL-backed payment workflows exist.

---

## 19. Migration Safety Rules

Before enabling runtime writes to PostgreSQL:

```text
backfill dry-run must pass
row counts must match
ledger reconstruction must be reviewed
receipt policy must be approved
rollback plan must exist
dual-read comparison must be tested
admin payment actions must be audited
outbox dispatcher must be idempotent
```

---

## 20. Non-goals

This schema draft does not:

```text
replace all file-backed storage
introduce microservices
introduce AI decision-making
integrate external payment processor
implement refunds fully
implement tax invoicing
implement accounting exports
```

---

## 21. Open Questions

Before implementation:

```text
Should completed payments require receipt issuance automatically?
Should old completed payments receive retroactive receipts?
What legal retention applies to disputes and payment evidence?
Should payment adjustments require admin approval?
Should employer_confirmed be financial or state-only ledger entry?
Should receipt correction be supported or only reversal/new receipt?
Should worker-level payout split be represented per worker?
```

---

## 22. Recommended Next Patch

Recommended next patch after this schema draft:

```text
Patch 42 — Payment Repository Boundary Preparation
```

It should define repository interfaces and service seams without switching runtime storage yet.

Alternative:

```text
Patch 42 — PostgreSQL Core Migration ADR
```

But avoid runtime migration until repository boundaries and tests are ready.

---

## 23. Final Position

This schema draft is a planning artifact.

It does not make Yawmia production-ready.

It does define the minimum PostgreSQL-backed ledger shape required before Yawmia can claim production-grade financial correctness.

The correct path remains:

```text
modular monolith first
PostgreSQL core
payment ledger
persisted receipts
outbox events
transaction boundaries
no microservices yet
no AI data gateway
```
