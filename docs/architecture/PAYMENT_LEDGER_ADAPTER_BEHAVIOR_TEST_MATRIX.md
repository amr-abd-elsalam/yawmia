# Payment Ledger Adapter Behavior Test Matrix

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 77  
> Status: Behavior gate / migration preparation  
> Runtime status: Not implemented  
> Adapter status: PgPaymentRepository / PaymentLedgerRepository / ReceiptRepository not implemented  
> Database posture: No DB connection  
> Migration posture: No migration execution  
> Ledger posture: No ledger writes  
> Receipt posture: No receipt generation

---

## 1. Purpose

This document defines the required behavior test matrix before any future PostgreSQL-backed payment adapter is accepted.

It is a behavior gate.

It does not implement:

```text
PgPaymentRepository
PaymentLedgerRepository runtime
PaymentDisputeRepository runtime
ReceiptRepository runtime
PgTransactionManager
PostgreSQL connection
migration execution
payment import
ledger import
receipt generation
runtime adapter switch
hidden dual-write
```

The goal is to prevent a future payment adapter from being accepted because it merely satisfies method names or static SQL shape.

Contracts and SQL scaffold are necessary, but not sufficient.

---

## 2. Current Reality

Current runtime still uses:

```text
server/services/payments.js
server/services/financialExport.js
server/services/jobs.js
server/services/database.js
server/services/eventBus.js
```

Current behavior is still:

```text
file-backed mutable payment projections
on-demand receipt generation
non-transactional receipt numbers
fire-and-forget payment creation after job completion
in-memory EventBus events
no DB TransactionManager runtime
no immutable ledger runtime
no persisted receipts runtime
```

This matrix describes future behavior tests only.

---

## 3. Acceptance Rule

A future PostgreSQL payment adapter must not be accepted unless all relevant behavior groups pass against a guarded test database.

Required guard before any DB connection:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test
assertPostgresTestDatabaseSafety(env)
```

Default CI must remain DB-free.

DB tests must skip by default unless explicitly enabled.

---

## 4. Contract Coverage

Future adapter tests must cover these contract groups:

```text
PaymentRepository
PaymentLedgerRepository
PaymentDisputeRepository
ReceiptRepository
OutboxRepository
AuditRepository
TransactionManager
```

Reference:

```text
server/repositories/paymentRepository.contract.js
server/repositories/transactionManager.contract.js
```

Structural contract tests are not enough. Behavior tests must verify semantics.

---

## 5. Schema Smoke Behavior

Before repository behavior tests:

```text
required tables exist
required indexes exist
required constraints exist
ledger append-only triggers exist
receipt number unique constraint exists
payment_id unique receipt constraint exists
idempotency key unique indexes exist
amount split constraints work
invalid status constraints reject invalid rows
```

Static SQL scaffold reference:

```text
migrations/postgres/payments/001_create_payment_ledger_tables.sql
```

Schema smoke tests must run only against guarded test DB.

---

## 6. PaymentRepository Behavior

### 6.1 createProjection

Must verify:

```text
creates one payment projection
rejects duplicate payment for same job
enforces amount = platformFee + workerPayout
enforces non-negative amount/platformFee/workerPayout
preserves imported_from_file_json flag
preserves import metadata
returns created record
does not append ledger by itself unless workflow layer explicitly owns that transaction
```

### 6.2 findById

Must verify:

```text
returns exact payment by id
returns null for missing payment
does not mutate row
```

### 6.3 findForUpdate

Must verify:

```text
locks row inside transaction
concurrent transaction cannot update same payment until lock releases
read-only transaction cannot call write-lock operation
missing payment returns null or defined not-found result
```

### 6.4 findByJob

Must verify:

```text
returns payment for job
returns null or empty for missing job
enforces one projection per job if unique index exists
```

### 6.5 updateProjection

Must verify:

```text
updates only allowed projection fields
does not update ledger rows
does not allocate receipt number
does not emit events directly
updates updated_at
rejects invalid status transitions at repository or workflow layer
```

### 6.6 getFinancialSummary

Must verify:

```text
matches projection totals
groups by status correctly
does not derive from mutable in-memory state
handles empty tables
does not include ledger-only rows unless projection exists
```

---

## 7. PaymentLedgerRepository Behavior

### 7.1 append

Must verify:

```text
appends immutable ledger entry
enforces amount_delta = platform_fee_delta + worker_payout_delta
preserves idempotency_key
rejects duplicate idempotency_key
preserves imported_from_file_json
preserves estimated_from_projection
does not update payment projection unless workflow layer does it explicitly
```

### 7.2 append-only protection

Must verify:

```text
UPDATE payment_ledger_entries fails
DELETE payment_ledger_entries fails
repository exposes no update/delete method
migration/backfill helpers cannot bypass append-only policy in normal runtime
```

### 7.3 listByPayment

Must verify:

```text
returns ledger entries ordered by created_at
filters by payment_id
does not include unrelated payment ledger rows
```

### 7.4 listByJob

Must verify:

```text
returns all ledger entries for job
orders deterministically
handles empty jobs
```

### 7.5 findByIdempotencyKey

Must verify:

```text
returns existing ledger entry for idempotency key
returns null for missing key
works inside transaction
prevents duplicate appends during concurrent calls
```

---

## 8. PaymentDisputeRepository Behavior

### 8.1 open

Must verify:

```text
opens dispute for payment
enforces one open dispute per payment
records opened_by and opened_by_role
links opened_ledger_entry_id when supplied
sets status=open
```

### 8.2 findOpenByPayment

Must verify:

```text
returns current open/under_review dispute
does not return resolved/dismissed dispute
```

### 8.3 resolve

Must verify:

```text
resolves open dispute exactly once
sets resolved_by and resolved_at
links resolved_ledger_entry_id when supplied
rejects resolving already resolved dispute
```

### 8.4 listByStatus

Must verify:

```text
filters by status
orders deterministically
paginates if implemented
```

---

## 9. ReceiptRepository Behavior

### 9.1 allocateReceiptNumber

Must verify:

```text
allocates receipt numbers transactionally
uses receipt_sequences row lock or equivalent
concurrent allocations for same date are unique
sequence increments exactly once per committed receipt
rolled-back allocation does not burn a number unless explicit policy says otherwise
receipt number format is deterministic and tested
```

### 9.2 issue

Must verify:

```text
inserts persisted receipt snapshot
enforces unique receipt_number
enforces one receipt per payment unless correction receipts are explicitly supported
enforces subtotal = platformFee + workerPayout
stores immutable job/payment/worker/attendance snapshots
links ledger_entry_id
supports imported_from_file_json flag only for approved backfill path
requires retroactive_policy_approval_id for retroactive imported receipts if policy requires it
```

### 9.3 findByPayment

Must verify:

```text
returns existing receipt for payment
is idempotent
does not issue receipt when only reading
```

### 9.4 findByReceiptNumber

Must verify:

```text
returns receipt by receipt_number
returns null for unknown receipt number
```

---

## 10. TransactionManager Behavior

Future PgTransactionManager tests must verify:

```text
commit persists all repository writes
rollback reverts all repository writes
afterCommit hooks run only after commit
afterRollback hooks run only after rollback
markRollbackOnly prevents commit
nested transaction behavior is explicit
read-only transaction rejects write operations
transaction id is stable within transaction
```

Transaction behavior is mandatory before enabling payment workflow runtime.

---

## 11. Workflow Behavior Tests

Repository tests alone are not enough.

Future payment workflow tests must verify full transaction boundaries.

### 11.1 createPaymentForCompletedJob

Must verify:

```text
validates job is completed
validates no payment exists for job
inserts payment projection
appends payment_created ledger entry
appends platform_fee_accrual ledger entry if policy uses split entries
appends worker_payout_payable ledger entry if policy uses split entries
inserts outbox event
commits atomically
rolls back payment if ledger append fails
rolls back payment and ledger if outbox insert fails
is idempotent for same job
```

### 11.2 confirmPayment

Must verify:

```text
validates employer ownership
validates status=pending
appends employer_confirmed ledger entry
updates payment projection
inserts outbox event
commits atomically
duplicate confirm is idempotent or rejected predictably
```

### 11.3 disputePayment

Must verify:

```text
validates actor is employer or accepted worker
validates dispute window
validates no open dispute
opens dispute record
appends worker_disputed or employer_disputed ledger entry
updates payment projection to disputed
inserts outbox event
commits atomically
rolls back all changes on any failure
```

### 11.4 completePaymentAsAdmin

Must verify:

```text
validates admin capability
validates approval when required
validates status in employer_confirmed/disputed
resolves open dispute if present
appends admin_resolved and/or payment_completed ledger entry
updates payment projection to completed
inserts audit record
inserts outbox event
commits atomically
approval is consumed once if used
duplicate completion is idempotent or rejected predictably
```

### 11.5 issueOrReadReceipt

Must verify:

```text
read existing receipt returns existing persisted artifact
issuing receipt locks payment
allocates receipt number transactionally
inserts receipt snapshot
appends receipt_issued ledger entry
inserts outbox event
commits atomically
concurrent receipt requests return one receipt
rollback does not create orphan receipt or orphan ledger entry
does not generate receipt on read unless explicitly allowed
```

---

## 12. Backfill Compatibility Behavior

Future backfill tests must run only after payment dry-run evidence passes.

They must verify:

```text
dry-run report is required input
critical dry-run report blocks import
importBlockerCount > 0 blocks import
required approvals must be present
duplicate payment canonical selection is explicit
unknown payment statuses are rejected unless policy exists
legacy completed payments can be imported without issuing receipts by default
synthetic ledger entries preserve imported_from_file_json=true
estimated_from_projection=true is set when timestamps are ambiguous
receipt backfill is disabled unless explicit receipt policy approval exists
```

Backfill tests must not use production data.

---

## 13. Reconciliation Behavior

Future reconciliation tests must verify:

```text
file payment count equals imported projection count when expected
status counts match dry-run report
amount totals match dry-run report
platform fee totals match dry-run report
worker payout totals match dry-run report
ledger preview count matches inserted ledger count
receipt preview count remains zero unless receipt backfill explicitly enabled
completed payments without receipts are reported but not auto-issued
ledger-derived financial summary matches projection summary where policy says it should
```

---

## 14. Outbox Coupling Behavior

Payment workflow tests must verify:

```text
outbox event inserted in same transaction as payment/ledger changes
outbox failure rolls back payment/ledger changes
EventBus is not the durable source of truth
outbox idempotency prevents duplicate business events
dispatcher behavior is tested separately
```

---

## 15. Audit / Approval Behavior

Admin financial actions must verify:

```text
payment completion audit is inserted in same transaction
dangerous financial actions require approval when configured
approval consumption is one-time
rollback preserves approval when transaction fails unless policy says otherwise
audit contains no secrets
audit references paymentId/jobId/adminId
```

---

## 16. Failure Mode Matrix

Future behavior tests must include failures for:

```text
payment insert failure
ledger append failure
projection update failure
dispute insert failure
receipt sequence allocation failure
receipt insert failure
outbox insert failure
audit insert failure
approval consume failure
duplicate idempotency key
concurrent receipt issuance
concurrent payment completion
invalid status transition
invalid amount equation
missing payment
missing job
missing actor
```

All failures must have deterministic rollback behavior.

---

## 17. Test Isolation Rules

Future DB behavior tests must:

```text
skip by default
require YAWMIA_ALLOW_DB_TESTS=true
require YAWMIA_TEST_DATABASE_URL
run postgresTestDatabaseGuard before connection
reject production NODE_ENV
reject production-like database names
reject production-like hosts
use transaction rollback or disposable schemas
not mutate ./data
not import server.js
not start HTTP server
not start queue workers
not start scheduler registry
```

---

## 18. Runtime Activation Gate

Even if adapter behavior tests pass, production activation still requires:

```text
payment backfill dry-run evidence review
finance/admin approvals
receipt policy approval
migration rehearsal
rollback rehearsal
reconciliation
outbox readiness
observability
explicit runtime cutover patch
```

Passing adapter tests alone does not mean production readiness.

---

## 19. Forbidden Shortcuts

Do not accept a payment adapter that:

```text
updates ledger rows
deletes ledger rows
generates receipt numbers outside transaction
issues receipts during read without explicit policy
uses EventBus as durable financial event truth
does hidden dual-write without reconciliation
bypasses TransactionManager
uses production DB in tests
treats dry-run preview as inserted ledger entries
treats generated receipt preview as persisted receipt
lets AI choose canonical payment records
```

---

## 20. AI Boundary

AI may assist with:

```text
summarizing adapter test failures
explaining reconciliation mismatches
drafting finance review notes
summarizing dry-run reports
```

AI must not:

```text
choose canonical payment rows
append ledger entries
issue receipts
approve receipt policy
complete payments
resolve disputes
consume approvals
run migrations
```

---

## 21. Final Position

This matrix is a required gate before implementing or accepting a PostgreSQL payment ledger adapter.

It proves only that future behavior expectations are defined.

It does not prove:

```text
PostgreSQL payment runtime exists
payment ledger runtime exists
receipt persistence exists
receipt numbering is transactional today
backfill import works
reconciliation passed
production finance readiness
```

The correct next implementation sequence remains:

```text
static policy
static SQL scaffold
behavior matrix
DB test guard
skipped-by-default DB harness
inactive adapter
non-production DB behavior tests
dry-run evidence review
reconciliation
runtime cutover patch
```
