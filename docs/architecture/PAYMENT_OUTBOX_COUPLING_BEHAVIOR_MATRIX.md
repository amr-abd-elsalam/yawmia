# Payment Outbox Coupling Behavior Matrix

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 83  
> Status: Static behavior matrix / migration preparation  
> Runtime status: Not implemented  
> Database posture: No DB connection  
> Migration posture: No migration execution  
> Outbox posture: No outbox runtime, no dispatcher runtime  
> Ledger posture: No ledger writes  
> Receipt posture: No receipt generation, no receipt number allocation  
> Adapter posture: No runtime adapter implementation  

---

## 1. Purpose

This document defines the future durable outbox coupling expectations for payment workflows.

It exists because payment workflow correctness requires more than projection rows and ledger rows. A future payment workflow must also persist durable business events in the same transaction as payment, ledger, dispute, receipt, audit, and approval changes.

This is a static behavior matrix.

It does not implement:

```text
outbox runtime
outbox dispatcher
PgOutboxRepository
PaymentWorkflowService
PgPaymentRepository
PgPaymentLedgerRepository
PgReceiptRepository
PgTransactionManager
database connection
migration execution
SQL execution
payment import
ledger writes
receipt generation
receipt number allocation
runtime adapter switch
hidden dual-write
EventBus replacement
queue worker activation
```

---

## 2. Current Runtime Reality

Current Yawmia payment runtime still uses:

```text
server/services/payments.js
server/services/financialExport.js
server/services/eventBus.js
server/services/database.js
```

Current behavior:

```text
payment events are emitted through in-memory EventBus
EventBus events are not durable
EventBus events are not replayable after process crash
payment mutations are file-backed JSON writes
receipts are generated on demand and not persisted
no durable outbox table is active
no outbox dispatcher exists
```

This document does not change runtime behavior.

---

## 3. Relationship to Existing Documents

This matrix depends on and complements:

```text
docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md
docs/architecture/PAYMENT_LEDGER_RUNTIME_MIGRATION_PLAN.md
docs/architecture/PAYMENT_LEDGER_ADAPTER_BEHAVIOR_TEST_MATRIX.md
docs/architecture/PAYMENT_WORKFLOW_TRANSACTION_BOUNDARY_MATRIX.md
docs/architecture/PAYMENT_BACKFILL_DRY_RUN_DESIGN.md
server/repositories/outboxRepository.contract.js
server/repositories/paymentRepository.contract.js
server/repositories/transactionManager.contract.js
```

Harness references:

```text
tests/adapters/payment-ledger-repository.harness.test.js
tests/adapters/transaction-manager.harness.test.js
tests/adapters/receipt-repository.harness.test.js
```

---

## 4. Core Rule

Future payment workflow events must be inserted into a durable outbox in the same transaction as the state change that produced them.

Required invariant:

```text
if payment/ledger/receipt/dispute/audit state commits, its required outbox event commits
if required outbox insert fails, the payment workflow rolls back
```

Forbidden invariant violations:

```text
payment projection committed without required outbox event
ledger entry committed without required outbox event
receipt committed without receipt_issued outbox event
admin completion audit committed without payment_completed outbox event
outbox event committed without matching payment/ledger/receipt state
EventBus emitted as the only financial event truth
```

---

## 5. Required Future Payment Outbox Events

Future payment workflow outbox events must include at least:

```text
payment_created
payment_confirmed
payment_disputed
payment_completed
receipt_issued
payment_backfilled
receipt_backfilled
payment_reconciliation_warning
```

Optional later events:

```text
payment_adjusted
refund_requested
refund_completed
payment_import_blocked
receipt_policy_required
payment_reconciliation_completed
```

---

## 6. Outbox Event Envelope

Future outbox rows should include a stable envelope:

```json
{
  "id": "out_x",
  "eventType": "payment_created",
  "aggregateType": "payment",
  "aggregateId": "pay_x",
  "jobId": "job_x",
  "paymentId": "pay_x",
  "ledgerEntryId": "ple_x",
  "receiptId": null,
  "idempotencyKey": "payment_created:job:job_x",
  "payload": {},
  "status": "pending",
  "attempts": 0,
  "availableAt": "ISO",
  "createdAt": "ISO",
  "processedAt": null,
  "lastError": null
}
```

Required fields:

```text
eventType
aggregateType
aggregateId
idempotencyKey
payload
status
createdAt
```

Recommended payment-specific references:

```text
paymentId
jobId
ledgerEntryId
receiptId
disputeId
adminId
approvalId
dryRunReportId
```

---

## 7. Event Idempotency Policy

Required idempotency keys:

```text
outbox:payment_created:job:{jobId}
outbox:payment_confirmed:{paymentId}:employer:{employerId}
outbox:payment_disputed:{paymentId}:actor:{actorId}
outbox:payment_completed:{paymentId}:admin:{adminId}
outbox:receipt_issued:{paymentId}
outbox:payment_backfilled:{sourcePaymentId}
outbox:receipt_backfilled:{sourcePaymentId}
outbox:payment_reconciliation_warning:{reportId}:{warningCode}
```

Rules:

```text
idempotency must be enforced by database uniqueness
idempotency must not rely only on memory
duplicate workflow request must return deterministic result
duplicate outbox insert must not duplicate downstream event delivery
```

---

## 8. Workflow Coupling Matrix

Required coupling groups:

```text
createPaymentForCompletedJob
confirmPayment
disputePayment
completePaymentAsAdmin
issueOrReadReceipt
paymentBackfillImport
receiptRetroactiveIssuance
reconciliationWarningPublication
```

Each group below defines required outbox coupling, rollback expectations, and future tests.

---

## 9. createPaymentForCompletedJob Outbox Coupling

### Required event

```text
payment_created
```

### Same transaction participants

```text
PaymentRepository
PaymentLedgerRepository
OutboxRepository
TransactionManager
```

### Required references

```text
paymentId
jobId
employerId
ledgerEntryId
amount
platformFee
workerPayout
currency
```

### Required idempotency key

```text
outbox:payment_created:job:{jobId}
```

### Rollback rule

```text
if outbox payment_created insert fails, payment projection and ledger entries must roll back
```

### EventBus boundary

```text
EventBus may fire payment:created only after durable outbox commit or dispatcher processing
EventBus must not be the only event persistence mechanism
```

### Future tests

```text
payment_created outbox row inserted with payment projection
outbox failure rolls back payment projection
outbox failure rolls back payment_created ledger entry
duplicate create does not duplicate outbox event
```

---

## 10. confirmPayment Outbox Coupling

### Required event

```text
payment_confirmed
```

### Same transaction participants

```text
PaymentRepository
PaymentLedgerRepository
OutboxRepository
TransactionManager
```

### Required references

```text
paymentId
jobId
employerId
ledgerEntryId
confirmedAt
```

### Required idempotency key

```text
outbox:payment_confirmed:{paymentId}:employer:{employerId}
```

### Rollback rule

```text
if outbox payment_confirmed insert fails, payment projection update and ledger append must roll back
```

### Future tests

```text
confirmation inserts outbox event
confirmation outbox failure rolls back projection update
confirmation outbox failure rolls back ledger append
duplicate confirmation does not duplicate event
```

---

## 11. disputePayment Outbox Coupling

### Required event

```text
payment_disputed
```

### Same transaction participants

```text
PaymentRepository
PaymentDisputeRepository
PaymentLedgerRepository
OutboxRepository
TransactionManager
```

### Required references

```text
paymentId
jobId
disputeId
actorId
actorRole
ledgerEntryId
disputedAt
```

### Required idempotency key

```text
outbox:payment_disputed:{paymentId}:actor:{actorId}
```

### Rollback rule

```text
if outbox payment_disputed insert fails, dispute row, payment projection update, and ledger append must roll back
```

### Future tests

```text
worker dispute inserts outbox event
employer dispute inserts outbox event
outbox failure rolls back dispute creation
outbox failure rolls back payment status update
outbox failure rolls back ledger append
```

---

## 12. completePaymentAsAdmin Outbox Coupling

### Required event

```text
payment_completed
```

### Same transaction participants

```text
PaymentRepository
PaymentDisputeRepository
PaymentLedgerRepository
OutboxRepository
AuditRepository
AdminApprovalRepository or approval service
TransactionManager
```

### Required references

```text
paymentId
jobId
adminId
approvalId
auditId
ledgerEntryId
disputeId when present
completedAt
```

### Required idempotency key

```text
outbox:payment_completed:{paymentId}:admin:{adminId}
```

### Rollback rule

```text
if outbox payment_completed insert fails, payment completion, ledger append, dispute resolution, audit insert, and approval consumption must roll back
```

### Future tests

```text
admin completion inserts outbox event
outbox failure rolls back payment completion
outbox failure rolls back audit row
outbox failure rolls back approval consumption
outbox failure rolls back dispute resolution
duplicate admin completion does not duplicate event
```

---

## 13. issueOrReadReceipt Outbox Coupling

### Required event

```text
receipt_issued
```

### Same transaction participants

```text
PaymentRepository
ReceiptRepository
PaymentLedgerRepository
OutboxRepository
TransactionManager
```

### Required references

```text
paymentId
jobId
receiptId
receiptNumber
ledgerEntryId
issuedAt
```

### Required idempotency key

```text
outbox:receipt_issued:{paymentId}
```

### Rollback rule

```text
if outbox receipt_issued insert fails, receipt insert, receipt sequence allocation, and receipt_issued ledger append must roll back unless explicit burn-number policy exists
```

### Read behavior

```text
reading an existing receipt must not insert an outbox event
reading an existing receipt must not allocate a receipt number
```

### Future tests

```text
receipt issuance inserts outbox event
outbox failure rolls back receipt insert
outbox failure rolls back receipt_issued ledger entry
outbox failure rolls back sequence allocation unless burn-number policy is explicit
concurrent receipt requests produce one outbox event
```

---

## 14. paymentBackfillImport Outbox Coupling

### Required event

```text
payment_backfilled
```

### Default posture

Backfill import is not implemented and must remain blocked until dry-run and approvals pass.

### Same transaction participants

```text
PaymentRepository
PaymentLedgerRepository
OutboxRepository optional by approved policy
AuditRepository
AdminApprovalRepository
TransactionManager
```

### Required references

```text
sourcePaymentId
paymentId
jobId
dryRunReportId
ledgerEntryIds
approvalId
```

### Required idempotency key

```text
outbox:payment_backfilled:{sourcePaymentId}
```

### Rollback rule

```text
if payment_backfilled outbox event is required by policy and insert fails, imported payment projection and imported ledger entries must roll back
```

### Future tests

```text
critical dry-run report blocks outbox creation
approved backfill inserts payment_backfilled event
outbox failure rolls back imported payment
outbox failure rolls back imported ledger entries
duplicate source payment does not duplicate event
```

---

## 15. receiptRetroactiveIssuance Outbox Coupling

### Required event

```text
receipt_backfilled
```

### Default posture

Retroactive receipt issuance is blocked by default.

### Same transaction participants

```text
PaymentRepository
ReceiptRepository
PaymentLedgerRepository
OutboxRepository
AuditRepository
AdminApprovalRepository
TransactionManager
```

### Required references

```text
sourcePaymentId
paymentId
receiptId
receiptNumber
ledgerEntryId
approvalId
auditId
```

### Required idempotency key

```text
outbox:receipt_backfilled:{sourcePaymentId}
```

### Rollback rule

```text
if receipt_backfilled outbox insert fails, receipt insert, receipt sequence allocation, ledger append, approval consumption, and audit insert must roll back
```

### Future tests

```text
blocked without receipt policy approval
approved retroactive receipt inserts receipt_backfilled event
outbox failure rolls back receipt
outbox failure rolls back approval consumption
duplicate source payment does not duplicate receipt_backfilled event
```

---

## 16. reconciliationWarningPublication

### Required event

```text
payment_reconciliation_warning
```

### Trigger

Future reconciliation detects non-blocking finance warning that must be tracked durably.

### Same transaction participants

```text
OutboxRepository
AuditRepository optional
TransactionManager
```

### Required references

```text
dryRunReportId
warningCode
paymentId optional
jobId optional
severity
```

### Required idempotency key

```text
outbox:payment_reconciliation_warning:{reportId}:{warningCode}
```

### Rollback rule

```text
if audit is required and fails, reconciliation warning publication must roll back
if outbox insert fails, no publication claim may be made
```

### Future tests

```text
warning publication inserts durable outbox event
duplicate warning publication is idempotent
outbox failure produces no delivery claim
```

---

## 17. Dispatcher Behavior Matrix

A future dispatcher must not be conflated with workflow commit.

Required dispatcher states:

```text
pending
processing
processed
failed
dead_letter
```

Required dispatcher behavior:

```text
claim pending events atomically
mark processing with lease
send event to transport or in-process bridge
mark processed only after send succeeds
retry failed events with backoff
move poison events to dead_letter after max attempts
preserve payload and lastError
support replay by event id or aggregate id
```

Crash scenarios:

```text
crash before send leaves event pending or recoverable processing
crash after send before mark processed may cause duplicate delivery
downstream handlers must be idempotent
dead_letter event requires admin review
```

---

## 18. EventBus Boundary

Current EventBus is in-memory.

Future rule:

```text
EventBus is not financial event truth
EventBus may be a local delivery mechanism only after durable outbox event exists
EventBus listeners must tolerate duplicate delivery
EventBus listener failure must not roll back already committed durable transaction
```

Forbidden:

```text
emitting payment_created on EventBus before transaction commit
using EventBus as the only record that payment_completed occurred
using EventBus as receipt issuance proof
using EventBus as ledger import proof
```

---

## 19. Queue Coupling

Future outbox dispatcher may use:

```text
DB-backed queue
dedicated outbox poller
single-process development dispatcher
```

But financial truth remains the outbox table.

Rules:

```text
queue enqueue failure must not erase outbox event
outbox event remains pending until dispatcher succeeds
queue job id is delivery metadata, not financial truth
dead-letter queue must reference outbox event id
```

---

## 20. Failure Mode Matrix

Future tests must cover:

```text
outbox insert failure
outbox duplicate idempotency key
dispatcher crash before send
dispatcher crash after send before processed mark
dead-letter threshold exceeded
poison event payload
missing payment reference
missing ledger reference
missing receipt reference
missing approval reference
payload serialization failure
transport failure
downstream duplicate delivery
admin manual retry
```

Expected behavior:

```text
workflow rollback on required outbox insert failure
no delivery claim when outbox insert fails
idempotent dispatcher retry
dead-letter preserves full diagnostic context without secrets
```

---

## 21. Observability Requirements

Future payment outbox runtime must expose:

```text
paymentOutboxPendingCount
paymentOutboxProcessingCount
paymentOutboxFailedCount
paymentOutboxDeadLetterCount
paymentOutboxOldestPendingAgeMs
paymentOutboxP95DispatchMs
paymentOutboxLastProcessedAt
paymentOutboxLastDeadLetterAt
```

These metrics must not imply production readiness alone.

---

## 22. Security and Privacy Requirements

Outbox payloads must not include:

```text
raw tokens
session tokens
authorization headers
API keys
passwords
VAPID private keys
full unredacted verification images
raw base64 documents
```

Payment payloads may include financial references and stable IDs, but sensitive user details should be minimized.

---

## 23. Runtime Activation Gate

Even after outbox repository and dispatcher exist, activation requires:

```text
TransactionManager behavior tests
PaymentRepository behavior tests
PaymentLedgerRepository behavior tests
ReceiptRepository behavior tests
OutboxRepository behavior tests
payment workflow transaction tests
dry-run evidence review
finance/admin approvals
receipt policy approval
migration rehearsal
rollback rehearsal
reconciliation
observability
explicit runtime cutover patch
```

Passing this matrix does not activate runtime behavior.

---

## 24. Test Isolation Rules

Future DB outbox behavior tests must:

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
```

---

## 25. Forbidden Shortcuts

Do not:

```text
install pg inside this behavior matrix patch
open DB connection from documentation/static tests
execute SQL migrations implicitly
create an outbox dispatcher in this patch
replace EventBus in this patch
write ledger entries from outbox tests
generate receipts from outbox tests
claim EventBus is durable
claim queue job equals financial event truth
dual-write production payments secretly
bypass TransactionManager
treat static SQL as executed schema
treat behavior matrix as behavior tests passed
treat harness skeleton as adapter implementation
```

---

## 26. AI Boundary

AI may assist with:

```text
summarizing outbox dead-letter diagnostics
explaining payment event delivery failures
drafting admin review notes
summarizing reconciliation warnings
```

AI must not:

```text
dispatch financial events
mark outbox events processed
append ledger entries
issue receipts
approve receipt policy
complete payments
resolve disputes
consume approvals
run migrations
activate adapters
```

---

## 27. Final Position

This document is a static behavior matrix.

It proves only that future payment outbox coupling expectations are documented.

It does not prove:

```text
outbox runtime exists
dispatcher runtime exists
PostgreSQL outbox table exists
payment workflow runtime exists
durable payment events work
EventBus has been replaced
payment import works
ledger writes work
receipt issuance works
production financial correctness
```

The correct sequence remains:

```text
static policy
static SQL scaffold
dry-run evidence
behavior matrices
DB guard
DB-test harnesses
inactive adapters
non-production DB behavior tests
durable outbox
reconciliation
runtime seam
rehearsed cutover
```
