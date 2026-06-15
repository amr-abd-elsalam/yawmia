# Payment Workflow Transaction Boundary Matrix

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 82  
> Status: Static behavior matrix / migration preparation  
> Runtime status: Not implemented  
> Database posture: No DB connection  
> Migration posture: No migration execution  
> Ledger posture: No ledger writes  
> Receipt posture: No receipt generation, no receipt number allocation  
> Adapter posture: No runtime adapter implementation  

---

## 1. Purpose

This document defines the future transaction boundary expectations for payment workflows before any PostgreSQL-backed payment runtime, immutable ledger runtime, persisted receipt runtime, or durable outbox runtime is implemented.

It is a behavior matrix.

It is not runtime code.

It does not implement:

```text
PaymentWorkflowService
PgPaymentRepository
PgPaymentLedgerRepository
PgPaymentDisputeRepository
PgReceiptRepository
PgOutboxRepository
PgAuditRepository
PgTransactionManager
database connection
migration execution
payment import
ledger import
ledger writes
receipt generation
receipt number allocation
runtime adapter switch
hidden dual-write
```

---

## 2. Current Runtime Reality

Current Yawmia payment runtime remains file-backed and mutable.

Relevant runtime files:

```text
server/services/payments.js
server/services/jobs.js
server/services/financialExport.js
server/handlers/paymentsHandler.js
server/services/eventBus.js
server/services/database.js
```

Current behavior:

```text
createPayment() writes pay_*.json
confirmPayment() mutates pay_*.json
disputePayment() mutates pay_*.json
completePayment() mutates pay_*.json
generateReceipt() builds an on-demand receipt view
receipt numbers are not persisted transactionally
payment events use in-memory EventBus
job completion creates payment fire-and-forget
```

This document does not change that runtime.

---

## 3. Required Future Components

Future transaction-backed payment workflows require:

```text
TransactionManager
PaymentRepository
PaymentLedgerRepository
PaymentDisputeRepository
ReceiptRepository
OutboxRepository
AuditRepository
AdminApprovalRepository or approval service
```

Contract references:

```text
server/repositories/paymentRepository.contract.js
server/repositories/transactionManager.contract.js
server/repositories/outboxRepository.contract.js
server/repositories/postgresTestDatabaseGuard.contract.js
```

Harness references:

```text
tests/adapters/payment-ledger-repository.harness.test.js
tests/adapters/transaction-manager.harness.test.js
tests/adapters/receipt-repository.harness.test.js
```

Static schema reference:

```text
migrations/postgres/payments/001_create_payment_ledger_tables.sql
```

---

## 4. Universal Transaction Rules

Every future payment write workflow must follow these rules:

```text
begin transaction
load required rows with explicit lock where mutation is possible
validate actor authorization
validate current state
apply projection update
append immutable ledger entry or entries
insert durable outbox event
insert audit row when admin or sensitive action
consume approval inside the same transaction when required
commit
```

Rollback rules:

```text
if projection insert/update fails, no ledger/outbox/audit should persist
if ledger append fails, projection must roll back
if receipt insert fails, sequence/projection/ledger/outbox must roll back unless policy explicitly burns numbers
if outbox insert fails, projection/ledger/receipt/audit must roll back
if audit insert fails for admin action, projection/ledger/outbox must roll back unless policy explicitly allows degraded audit
if approval consume fails, workflow must roll back
```

Forbidden partial states:

```text
payment projection without matching required ledger entries
ledger entries without matching payment projection
receipt without payment
receipt without receipt_issued ledger entry
receipt_issued ledger entry without persisted receipt
outbox event without committed payment/ledger state
admin payment completion without audit
dangerous financial action without approval when approval is required
```

---

## 5. Idempotency Policy

Future workflows must define explicit idempotency keys.

Recommended keys:

```text
payment_created:job:{jobId}
payment_confirmed:{paymentId}:employer:{employerId}
payment_disputed:{paymentId}:actor:{actorId}
payment_completed:{paymentId}:admin:{adminId}
receipt_issued:{paymentId}
payment_backfill:{sourcePaymentId}
receipt_backfill:{sourcePaymentId}
```

Idempotency must be enforced at repository/database level, not only in memory.

---

## 6. Workflow Matrix Overview

Required workflow groups:

```text
createPaymentForCompletedJob
confirmPayment
disputePayment
completePaymentAsAdmin
issueOrReadReceipt
paymentBackfillImport
receiptRetroactiveIssuance
```

Each workflow below defines:

```text
transaction participants
lock requirements
idempotency key
ledger entries
outbox event
audit/approval behavior
rollback expectations
future tests
```

---

## 7. createPaymentForCompletedJob

### Trigger

A completed job becomes eligible for payment creation.

### Current runtime gap

Current job completion can call payment creation fire-and-forget. This is not atomic.

### Future transaction participants

```text
TransactionManager
JobRepository or JobReadRepository
PaymentRepository
PaymentLedgerRepository
OutboxRepository
AuditRepository optional
```

### Required locks

```text
job row FOR UPDATE or equivalent
payment unique constraint on job_id
```

### Idempotency key

```text
payment_created:job:{jobId}
```

### Transaction steps

```text
begin
lock completed job
validate job.status = completed
validate actor is job employer or system policy allows auto-create
validate no payment exists for job
calculate amount/platformFee/workerPayout
insert payment projection
append payment_created ledger entry
append platform_fee_accrual ledger entry if split-entry policy is enabled
append worker_payout_payable ledger entry if split-entry policy is enabled
insert outbox event payment_created
commit
```

### Rollback expectations

```text
payment insert failure leaves no ledger/outbox
ledger append failure rolls back payment projection
outbox insert failure rolls back payment projection and ledger entries
duplicate request returns existing payment or deterministic idempotency result
```

### Future tests

```text
creates payment atomically
rejects non-completed job
rejects duplicate payment for same job
rolls back projection if ledger append fails
rolls back projection and ledger if outbox insert fails
idempotent by job
```

---

## 8. confirmPayment

### Trigger

Employer confirms payment.

### Current runtime gap

Current `confirmPayment()` mutates mutable JSON payment state.

### Future transaction participants

```text
TransactionManager
PaymentRepository
PaymentLedgerRepository
OutboxRepository
```

### Required locks

```text
payment row FOR UPDATE
```

### Idempotency key

```text
payment_confirmed:{paymentId}:employer:{employerId}
```

### Transaction steps

```text
begin
lock payment
validate payment.status = pending
validate employer owns payment
append employer_confirmed ledger entry
update payment projection to employer_confirmed
insert outbox event payment_confirmed
commit
```

### Rollback expectations

```text
ledger append failure rolls back projection update
outbox insert failure rolls back ledger and projection
duplicate confirm is idempotent or rejected predictably
```

### Future tests

```text
confirms pending payment
rejects non-owner employer
rejects invalid status
appends ledger entry
updates projection
inserts outbox
rolls back on ledger failure
rolls back on outbox failure
```

---

## 9. disputePayment

### Trigger

Employer or accepted worker opens a payment dispute.

### Current runtime gap

Current `disputePayment()` mutates mutable payment JSON and emits in-memory event.

### Future transaction participants

```text
TransactionManager
PaymentRepository
PaymentDisputeRepository
PaymentLedgerRepository
OutboxRepository
```

### Required locks

```text
payment row FOR UPDATE
open dispute uniqueness on payment_id
```

### Idempotency key

```text
payment_disputed:{paymentId}:actor:{actorId}
```

### Transaction steps

```text
begin
lock payment
validate payment is not completed
validate dispute window
validate actor is employer or accepted worker
validate no open dispute exists
insert payment_dispute row
append worker_disputed or employer_disputed ledger entry
update payment projection to disputed
insert outbox event payment_disputed
commit
```

### Rollback expectations

```text
dispute insert failure leaves payment unchanged
ledger append failure rolls back dispute and payment update
outbox insert failure rolls back dispute, ledger, and payment update
duplicate open dispute is rejected or idempotent by explicit policy
```

### Future tests

```text
opens worker dispute
opens employer dispute
rejects uninvolved actor
rejects outside dispute window
rejects already open dispute
rolls back on ledger failure
rolls back on outbox failure
```

---

## 10. completePaymentAsAdmin

### Trigger

Admin finalizes payment.

### Current runtime gap

Current `completePayment()` mutates payment JSON. Admin audit is outside a DB transaction.

### Future transaction participants

```text
TransactionManager
PaymentRepository
PaymentDisputeRepository
PaymentLedgerRepository
OutboxRepository
AuditRepository
AdminApprovalRepository or approval service
```

### Required locks

```text
payment row FOR UPDATE
open dispute row FOR UPDATE when present
approval row FOR UPDATE when approval is required
```

### Idempotency key

```text
payment_completed:{paymentId}:admin:{adminId}
```

### Transaction steps

```text
begin
lock payment
validate admin capability
validate approval if dangerous action requires approval
validate payment.status in employer_confirmed/disputed
lock and resolve open dispute if present
append admin_resolved ledger entry when resolving dispute
append payment_completed ledger entry
update payment projection to completed
consume approval when provided
insert admin audit row
insert outbox event payment_completed
commit
```

### Rollback expectations

```text
ledger failure rolls back projection/dispute/audit/outbox
audit failure rolls back financial completion unless explicit degraded audit policy exists
approval consume failure rolls back completion
outbox failure rolls back completion and ledger
duplicate completion is deterministic
```

### Future tests

```text
completes employer_confirmed payment
completes disputed payment and resolves dispute
requires admin capability
requires approval when configured
consumes approval once
inserts audit
inserts outbox
rolls back on audit failure
rolls back on outbox failure
```

---

## 11. issueOrReadReceipt

### Trigger

User/admin requests a receipt for an eligible payment.

### Current runtime gap

Current receipt generation is on-demand and not persisted.

### Future transaction participants

```text
TransactionManager
PaymentRepository
ReceiptRepository
PaymentLedgerRepository
OutboxRepository
```

### Required locks

```text
payment row FOR UPDATE when issuing
receipt_sequences row FOR UPDATE or equivalent atomic allocation
unique receipt_number
unique receipt by payment_id
```

### Idempotency key

```text
receipt_issued:{paymentId}
```

### Transaction steps

```text
if receipt exists, return persisted receipt without issuing a new one

begin
lock payment
validate payment state allows receipt
validate receipt does not already exist
allocate receipt number transactionally
insert immutable receipt snapshot
append receipt_issued ledger entry
insert outbox event receipt_issued
commit
```

### Rollback expectations

```text
receipt insert failure rolls back sequence allocation unless explicit burn-number policy exists
ledger append failure rolls back receipt and sequence allocation unless explicit burn-number policy exists
outbox insert failure rolls back receipt, ledger, and sequence allocation
concurrent calls return one receipt
read existing receipt must not allocate a number
```

### Future tests

```text
read existing receipt is no-mutation
issue receipt once
concurrent receipt issuance returns one receipt
receipt_number unique
payment_id unique receipt
rollback does not orphan receipt
rollback does not orphan receipt_issued ledger entry
rollback does not emit outbox
```

---

## 12. paymentBackfillImport

### Trigger

Future approved import from file-backed payment projections into PostgreSQL.

### Current foundation

Dry-run exists:

```text
scripts/payment-backfill-dry-run.js
```

### Required preconditions

```text
dry-run report exists
dry-run report severity is not critical
importBlockerCount = 0
finance/admin approvals recorded
receipt policy approval recorded when required
reconciliation reviewed
rollback rehearsal exists
```

### Future transaction participants

```text
TransactionManager
PaymentRepository
PaymentLedgerRepository
OutboxRepository optional
AuditRepository
AdminApprovalRepository
```

### Required locks

```text
idempotency key uniqueness
payment id uniqueness
job_id uniqueness on payment projection
```

### Idempotency key

```text
payment_backfill:{sourcePaymentId}
```

### Transaction steps

```text
begin
validate dry-run report gate
validate approvals
insert imported payment projection
append synthetic imported ledger entries
insert audit row for import batch
commit
```

### Receipt policy

Default:

```text
do not issue retroactive receipts during payment import
mark receiptMissing in reconciliation evidence only
```

### Rollback expectations

```text
payment insert failure leaves no ledger
ledger append failure rolls back imported payment
audit failure rolls back import batch entry unless explicit policy says otherwise
receipt rows must not be inserted unless receipt backfill is explicitly enabled
```

### Future tests

```text
critical dry-run blocks import
missing approvals block import
imports completed payment without receipt by default
preserves imported_from_file_json
sets estimated_from_projection when needed
idempotent source payment import
```

---

## 13. receiptRetroactiveIssuance

### Trigger

Explicit approved retroactive receipt issuance for legacy payments.

### Default posture

Blocked by default.

### Required preconditions

```text
receipt policy approval
finance approval
admin approval
dry-run receipt gap report
legal/business decision on retroactive issuance
```

### Future transaction participants

```text
TransactionManager
PaymentRepository
ReceiptRepository
PaymentLedgerRepository
OutboxRepository
AuditRepository
AdminApprovalRepository
```

### Required locks

```text
payment row FOR UPDATE
receipt_sequences row FOR UPDATE
approval row FOR UPDATE
```

### Idempotency key

```text
receipt_backfill:{sourcePaymentId}
```

### Transaction steps

```text
begin
lock payment
validate approval
validate no receipt exists
allocate receipt number transactionally
insert retroactive receipt snapshot
append receipt_issued ledger entry with imported_from_file_json=true
consume approval
insert audit row
insert outbox event receipt_issued
commit
```

### Rollback expectations

```text
approval consume failure rolls back receipt and ledger
receipt insert failure rolls back sequence allocation unless explicit burn-number policy exists
ledger failure rolls back receipt
outbox failure rolls back receipt and ledger
audit failure rolls back unless policy explicitly allows degraded audit
```

### Future tests

```text
blocked without approval
requires explicit retroactive policy approval
allocates unique receipt number
does not duplicate existing receipt
rolls back on ledger failure
rolls back on audit failure
rolls back on outbox failure
```

---

## 14. Outbox Coupling Matrix

Future payment workflow events must use durable outbox, not in-memory EventBus as source of truth.

Required outbox events:

```text
payment_created
payment_confirmed
payment_disputed
payment_completed
receipt_issued
payment_backfilled
```

Rules:

```text
outbox event inserted in same transaction as payment/ledger/receipt state
outbox failure rolls back workflow
EventBus may be used only after durable event exists
dispatcher retries are separate from workflow commit
```

---

## 15. Audit / Approval Coupling Matrix

Admin-sensitive workflows must include audit and approval behavior.

Dangerous actions may include:

```text
payment_complete
payment_ledger_backfill
receipt_retroactive_issue
payment_runtime_cutover
payment_reconciliation_override
```

Rules:

```text
approval checked before action
approval consumed inside transaction
audit inserted inside transaction
approval consumption is one-time
rollback must preserve approval when the action fails before consumption, unless consumed inside the failed transaction and rolled back
```

---

## 16. Failure Mode Matrix

Future tests must cover:

```text
payment projection insert failure
payment projection update failure
ledger append failure
dispute insert failure
receipt sequence allocation failure
receipt insert failure
outbox insert failure
audit insert failure
approval consume failure
duplicate idempotency key
concurrent payment creation
concurrent payment confirmation
concurrent dispute opening
concurrent payment completion
concurrent receipt issuance
invalid status transition
missing job
missing payment
missing actor
unauthorized actor
```

All failures must produce deterministic rollback behavior.

---

## 17. Test Isolation Rules

Future DB behavior tests must:

```text
skip by default
require YAWMIA_ALLOW_DB_TESTS=true
require YAWMIA_TEST_DATABASE_URL
run assertPostgresTestDatabaseSafety before DB connection
reject NODE_ENV=production
reject production-like database names
reject production-like hosts
use disposable schemas or transaction rollback
not mutate ./data
not import server.js
not start HTTP server
not start queue workers
not start scheduler registry
not emit durable business claims from in-memory events
```

---

## 18. Runtime Activation Gate

Even after adapters exist and behavior tests pass, runtime activation still requires:

```text
dry-run evidence review
finance/admin approvals
receipt policy approval
migration rehearsal
rollback rehearsal
reconciliation
outbox readiness
observability
explicit runtime cutover patch
```

Passing this matrix or any harness does not activate runtime behavior.

---

## 19. Forbidden Shortcuts

Do not:

```text
install pg inside a behavior matrix patch
open DB connection from documentation/static tests
execute SQL migrations implicitly
write ledger entries from dry-run
generate receipt numbers from dry-run
persist receipts from dry-run
dual-write production payments secretly
use EventBus as durable financial event truth
bypass TransactionManager
treat static SQL as executed schema
treat behavior matrix as behavior tests passed
treat harness skeleton as adapter implementation
```

---

## 20. AI Boundary

AI may assist with:

```text
summarizing transaction failure reports
explaining dry-run blockers
drafting finance review notes
summarizing reconciliation mismatches
```

AI must not:

```text
choose canonical payments
approve financial import
append ledger entries
issue receipts
complete payments
resolve disputes
consume approvals
run migrations
activate adapters
```

---

## 21. Final Position

This document is a static behavior matrix.

It proves only that future payment workflow transaction boundary expectations are documented.

It does not prove:

```text
TransactionManager runtime exists
PaymentWorkflowService exists
PostgreSQL payment adapters exist
immutable ledger runtime exists
persisted receipts runtime exists
durable outbox runtime exists
payment import works
receipt issuance works
migration execution works
production financial correctness
```

The correct sequence remains:

```text
static policy
static SQL scaffold
dry-run evidence
behavior matrix
DB guard
DB-test harnesses
inactive adapters
non-production DB behavior tests
reconciliation
runtime seam
durable outbox
rehearsed cutover
```
