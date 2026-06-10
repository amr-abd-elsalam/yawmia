# Yawmia Payment Ledger Runtime Migration Plan

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 58  
> Status: Runtime migration planning / financial correctness preparation  
> Runtime status: Not implemented  
> Depends on:
> - `docs/architecture/PRODUCTION_FOUNDATION_RESET.md`
> - `docs/architecture/POSTGRESQL_CORE_MIGRATION_PLAN.md`
> - `docs/architecture/PAYMENT_LEDGER_MINIMUM_DESIGN.md`
> - `docs/architecture/POSTGRESQL_PAYMENT_LEDGER_SCHEMA_DRAFT.md`
> - `docs/architecture/PAYMENT_REPOSITORY_BOUNDARY_PREPARATION.md`
> - `docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md`
> - `server/repositories/paymentRepository.contract.js`
> - `server/repositories/outboxRepository.contract.js`
> - `server/repositories/transactionManager.contract.js`
> Non-goal: No runtime migration in this patch  
> Non-goal: No production data mutation  
> Non-goal: No receipt issuance  
> Non-goal: No PostgreSQL adapter activation  
> Non-goal: No external payment processor integration

---

## 1. Purpose

This document defines the runtime migration plan for moving Yawmia payments from mutable file-backed projections to a PostgreSQL-backed payment ledger and persisted receipt model.

It is a planning document.

It does not implement:

```text
PostgreSQL runtime
payment ledger runtime
receipt persistence runtime
TransactionManager runtime
OutboxRepository runtime
backfill execution
production cutover
```

It exists to prevent accidental partial runtime migration and to make the financial migration sequence explicit before implementation begins.

---

## 2. Current Runtime Reality

Current payment runtime is still implemented primarily in:

```text
server/services/payments.js
server/services/financialExport.js
server/services/jobs.js
server/handlers/paymentsHandler.js
server/services/eventBus.js
server/services/database.js
```

Current behavior:

```text
createPayment() creates one mutable pay_*.json record
confirmPayment() mutates the same payment record
disputePayment() mutates the same payment record
completePayment() mutates the same payment record
generateReceipt() builds an on-demand receipt
receipt number is generated at read time
receipt is not persisted
payment events are emitted through in-memory EventBus
payment creation after job completion is fire-and-forget
```

This is not production-grade financial correctness.

---

## 3. Production Target

The target payment architecture is:

```text
PostgreSQL-backed modular monolith
payments table as current-state projection
payment_ledger_entries table as immutable financial source of truth
payment_disputes table as durable dispute workflow
receipt_sequences table for transactional receipt numbering
receipts table as persisted financial artifacts
outbox_events table for durable business events
TransactionManager for atomic workflow boundaries
repository adapters for storage isolation
```

No microservices are required.

No AI data gateway is allowed.

---

## 4. Migration Safety Principle

Payment migration must be conservative.

Financial migration must not rely on:

```text
dashboard green status
smoke test success
manual spot checks only
single benchmark result
uncontrolled dual-write
fire-and-forget event delivery
file-backed transaction simulation
```

Financial migration must require:

```text
dry-run backfill
row count reconciliation
ledger reconstruction review
receipt policy approval
rollback rehearsal
transaction rollback tests
idempotency tests
admin approval for cutover
```

---

## 5. Runtime Migration Phases

Recommended payment migration phases:

```text
Phase 0: Keep current runtime stable
Phase 1: Add runtime-neutral service seam
Phase 2: Add PostgreSQL schema and migrations
Phase 3: Add PostgreSQL repositories behind inactive flags
Phase 4: Backfill dry-run from file-backed payments
Phase 5: Reconciliation and shadow reads
Phase 6: Enable ledger writes for new payments in non-production
Phase 7: Enable persisted receipt issuance in non-production
Phase 8: Production rehearsal and rollback rehearsal
Phase 9: Production cutover for payment writes
Phase 10: Freeze file-backed payments as archive
Phase 11: Remove legacy payment write paths
```

Do not skip directly to production DB writes.

---

## 6. Phase 0 — Keep Current Runtime Stable

Current file-backed runtime remains active until the new payment ledger runtime is proven.

Allowed work:

```text
docs
contract tests
adapter skeletons
schema migrations in development only
isolated test database work
dry-run backfill tooling
characterization tests
```

Not allowed in this phase:

```text
production DB writes
dual-write production payments
receipt number allocation in production DB
file-backed payment deletion
ledger backfill with --confirm
runtime payment adapter switch
```

---

## 7. Phase 1 — Runtime-neutral Payment Service Seam

Before PostgreSQL adapters are enabled, introduce a seam that separates business workflow from storage mechanics.

Target service boundary:

```text
PaymentWorkflowService
```

Suggested write methods:

```text
createPaymentForCompletedJob(actor, jobId, options)
confirmPayment(actor, paymentId, options)
openPaymentDispute(actor, paymentId, reason)
completePaymentAsAdmin(actor, paymentId, options)
issueOrReadReceipt(actor, paymentId, options)
```

This seam should eventually use:

```text
TransactionManager
PaymentRepository
PaymentLedgerRepository
PaymentDisputeRepository
ReceiptRepository
OutboxRepository
AuditRepository
```

In the transition phase, current `payments.js` remains runtime source.

---

## 8. Phase 2 — PostgreSQL Schema Migration

Schema work should include:

```text
payments
payment_ledger_entries
payment_disputes
receipt_sequences
receipts
outbox_events
admin_audit_log if not already migrated
```

Minimum rules:

```text
ledger append-only
receipt_number unique
receipt payment_id unique unless correction receipts are explicitly supported
idempotency_key unique where present
payments.amount = payments.platform_fee + payments.worker_payout
ledger amount_delta = platform_fee_delta + worker_payout_delta
```

Schema migration must run first in development/staging only.

---

## 9. Phase 3 — PostgreSQL Repository Adapters

Implement inactive PostgreSQL adapters:

```text
PgPaymentRepository
PgPaymentLedgerRepository
PgPaymentDisputeRepository
PgReceiptRepository
PgOutboxRepository
PgAuditRepository
PgTransactionManager
```

Adapters must be behind explicit runtime configuration.

Example flags:

```text
PAYMENT_REPOSITORY_MODE=file_json | postgres
PAYMENT_LEDGER_ENABLED=false | true
RECEIPT_PERSISTENCE_ENABLED=false | true
OUTBOX_ENABLED=false | true
```

Production default before cutover:

```text
PAYMENT_REPOSITORY_MODE=file_json
PAYMENT_LEDGER_ENABLED=false
RECEIPT_PERSISTENCE_ENABLED=false
OUTBOX_ENABLED=false
```

---

## 10. Phase 4 — Backfill Dry-run

Backfill source:

```text
data/payments/**/*.json
```

Dry-run must produce a report with:

```text
paymentCount
statusCounts
missingJobCount
invalidAmountSplitCount
ambiguousTimestampCount
wouldInsertPaymentRows
wouldInsertLedgerRows
wouldSkipReceiptRows
estimatedFromProjectionCount
errors
warnings
```

Backfill dry-run must not mutate:

```text
./data
PostgreSQL production database
receipt_sequences
receipts
```

---

## 11. Backfill Rules

For each existing payment projection:

```text
insert payments projection with imported_from_file_json=true
insert synthetic payment_created ledger entry
insert employer_confirmed if confirmedAt exists
insert worker_disputed or employer_disputed if disputedAt exists
insert payment_completed if completedAt exists
```

If timestamps are missing or ambiguous:

```text
preserve source fields
set estimated_from_projection=true
record metadata_json.source = file_json_backfill
record metadata_json.warning = ambiguous_timestamps
```

Do not retroactively issue receipts unless explicitly approved.

---

## 12. Receipt Backfill Policy

Current receipts are not persisted.

Therefore, old file-backed payments cannot safely be assumed to have issued receipts.

Default policy:

```text
do not issue retroactive receipts during payment backfill
mark receiptMissing=true for completed legacy payments
allow explicit admin-approved receipt issuance later if business/legal policy permits
```

Forbidden:

```text
generate receipt numbers retroactively without approval
use current generateReceipt() output as proof of historical receipt issuance
allocate receipt numbers during dry-run
```

---

## 13. Phase 5 — Reconciliation and Shadow Reads

After dry-run and test backfill:

Required reconciliation:

```text
file payment count vs DB payments count
status counts parity
amount/platformFee/workerPayout parity
payment by job parity
ledger rows per payment expected count
ledger idempotency uniqueness
no duplicate receipts
no receipt without payment
no payment_completed ledger without completed payment projection
```

Shadow reads may compare:

```text
file-backed getFinancialSummary()
DB projection summary
ledger-derived summary
```

Shadow reads must not choose whichever succeeds.

Mismatches must fail migration readiness.

---

## 14. Phase 6 — Enable Ledger Writes for New Payments

First non-production write workflow:

```text
createPaymentForCompletedJob()
```

Target transaction:

```text
begin
select completed job for validation
validate no payment exists for job
calculate attendance-adjusted amount
insert payment projection
insert payment_ledger_entries(payment_created)
insert outbox_events(payment_created)
commit
```

Idempotency key:

```text
payment_created:job:{jobId}
```

Rollback test:

```text
if ledger insert fails, payment projection must not exist
if outbox insert fails, payment projection and ledger must not exist
```

---

## 15. Phase 7 — Enable Payment State Transitions

Migrate these workflows one by one:

```text
confirmPayment
disputePayment
completePayment
```

Each workflow must:

```text
select payment for update
validate actor and current state
append ledger entry
update payment projection
insert outbox event
insert audit if admin action
commit
```

State-only ledger entries may carry zero deltas.

Financial adjustment/refund/reversal entries carry deltas.

---

## 16. Phase 8 — Persisted Receipt Issuance

Replace on-demand receipt generation with:

```text
read existing persisted receipt
or issue receipt transactionally if allowed
```

Receipt issuance transaction:

```text
begin
select payment for update
validate payment state allows receipt
if receipt exists return it
select receipt_sequences row for update
allocate receipt number
build immutable receipt snapshot
insert receipts
append payment_ledger_entries(receipt_issued)
insert outbox_events(receipt_issued)
commit
```

Idempotency key:

```text
receipt_issued:{paymentId}
```

`generateReceipt()` should eventually become a compatibility wrapper around persisted receipt service.

---

## 17. Phase 9 — Production Rehearsal

Before production cutover:

```text
export migration snapshot
validate snapshot
restore latest backup in rehearsal target
run payment backfill dry-run
run payment backfill against rehearsal DB
run reconciliation
run rollback rehearsal
run postdeploy smoke against rehearsal environment
document results in ops review
```

No production cutover without:

```text
financial reconciliation passed
rollback rehearsal passed
admin approval recorded
```

---

## 18. Phase 10 — Production Cutover

Production cutover should be domain-scoped.

Recommended cutover order:

```text
1. pause payment writes or enable maintenance/read-only window
2. backup file-backed data
3. run final dry-run report
4. run approved backfill
5. run reconciliation
6. enable PAYMENT_REPOSITORY_MODE=postgres
7. enable PAYMENT_LEDGER_ENABLED=true
8. enable OUTBOX_ENABLED=true for payment events
9. smoke test payment creation/confirmation/dispute/receipt in controlled path
10. monitor outbox and queue
```

If any hard gate fails, rollback.

---

## 19. Phase 11 — Freeze File-backed Payments

After successful cutover:

```text
file-backed payments become read-only archive
payments.js legacy write path disabled
financialExport reads persisted receipts where available
repair/index scripts must not mutate payment truth
```

Do not delete legacy files until retention and audit policy approve.

---

## 20. Rollback Plan

Rollback must include:

```text
file-backed data backup reference
PostgreSQL backup reference
migration manifest
ledger backfill report
receipt issuance report
outbox status report
feature flag reset plan
queue pause/resume plan
admin communication plan
post-rollback smoke plan
```

Rollback target:

```text
PAYMENT_REPOSITORY_MODE=file_json
PAYMENT_LEDGER_ENABLED=false
RECEIPT_PERSISTENCE_ENABLED=false
OUTBOX_ENABLED=false for payment workflow if needed
```

Rollback must not create duplicate receipts or duplicate ledger entries if reattempted.

---

## 21. Runtime Flags

Suggested flags:

```text
PAYMENT_REPOSITORY_MODE=file_json | postgres
PAYMENT_LEDGER_ENABLED=false | true
RECEIPT_PERSISTENCE_ENABLED=false | true
PAYMENT_OUTBOX_ENABLED=false | true
PAYMENT_BACKFILL_ALLOWED=false | true
PAYMENT_LEGACY_FILE_WRITES_ENABLED=true | false
```

Production safety:

```text
PAYMENT_BACKFILL_ALLOWED=false by default
PAYMENT_REPOSITORY_MODE=postgres only after approval
PAYMENT_LEGACY_FILE_WRITES_ENABLED=false only after cutover
```

---

## 22. Required Runtime Tests

Before enabling PostgreSQL payment runtime:

```text
repository contract tests
TransactionManager rollback tests
payment create idempotency tests
payment confirm idempotency tests
payment dispute idempotency tests
payment complete admin audit tests
receipt issuance idempotency tests
receipt number uniqueness tests
ledger append-only tests
outbox insert rollback tests
projection/ledger reconciliation tests
legacy backfill dry-run tests
```

Tests must not mutate `./data`.

Use isolated temp directories or test database.

---

## 23. Required Characterization Tests to Keep

Keep existing characterization tests as gap evidence until runtime replacement passes.

Relevant tests:

```text
tests/e2e/payment-ledger-gap-characterization.test.js
tests/e2e/job-payment-transaction-boundary-characterization.test.js
tests/e2e/receipt-persistence-gap-characterization.test.js
tests/e2e/outbox-event-durability-gap-characterization.test.js
```

Do not delete characterization tests immediately after implementation.

First mark them as historical or update them to assert new runtime behavior under PostgreSQL mode.

---

## 24. Admin Approval Requirements

Payment cutover and financial backfill require admin approval.

Dangerous actions:

```text
payment_ledger_backfill
receipt_retroactive_issue
payment_runtime_cutover
payment_legacy_write_disable
payment_reconciliation_override
```

These actions must be:

```text
approval-gated
audit-logged
rehearsed
rollback-planned
```

---

## 25. Observability Requirements

Payment runtime must expose:

```text
payment write mode
ledger enabled flag
receipt persistence enabled flag
payment outbox pending count
payment outbox dead-letter count
ledger rows count
receipt rows count
reconciliation status
last backfill report
last receipt sequence date
```

Do not present these as production readiness unless hard gates pass.

---

## 26. Failure Modes to Test

Must test:

```text
job completed but payment insert fails
payment insert succeeds but ledger insert fails
ledger insert succeeds but projection update fails
receipt sequence allocation succeeds but receipt insert fails
receipt insert succeeds but ledger receipt_issued fails
outbox insert fails inside payment transaction
duplicate confirm request
duplicate receipt request
concurrent receipt requests
concurrent payment completion requests
admin completion without capability
admin completion without approval when approval required
dispute outside window
accepted worker dispute authorization
```

---

## 27. What Must Not Happen

Do not:

```text
dual-write production payments without reconciliation
generate receipt numbers on read
treat payment.status as source of financial truth
delete legacy payments during migration
retroactively issue receipts without policy approval
use EventBus as durable payment event truth
let AI decide payment outcomes
claim financial correctness from smoke tests
claim production readiness from this document
```

---

## 28. AI Boundary

AI may assist with:

```text
summarizing ledger timeline
suggesting reconciliation anomalies
drafting admin review notes
summarizing dispute evidence
explaining failed migration reports
```

AI must not:

```text
append ledger entries
issue receipts
resolve disputes
complete payments
approve cutover
override reconciliation
mutate payment state
```

---

## 29. Recommended Next Implementation Patch

After this planning document, recommended next patches:

```text
1. SessionRepository Contract Skeleton
2. DB-backed Queue Minimum Design
3. Payment Backfill Dry-run Script Design
4. PostgreSQL Adapter Preparation Spike
5. Payment Workflow Service Seam
```

If choosing payment-first implementation:

```text
start with PaymentWorkflowService seam
then PostgreSQL test adapter
then ledger append-only tests
```

---

## 30. Final Decision

Yawmia payment runtime must migrate from mutable file-backed payment projections to a PostgreSQL-backed immutable ledger and persisted receipt model.

This migration must be:

```text
transaction-backed
idempotent
rehearsed
reconciled
approval-gated
rollback-ready
outbox-backed
admin-audited
```

This document is a plan only.

It does not make Yawmia financially production-ready.

The correct next runtime direction remains:

```text
Modular Monolith First
PostgreSQL Core
Payment Ledger
Persisted Receipts
Durable Outbox
TransactionManager
No False Confidence
No AI Data Gateway
No Microservices Yet
```
