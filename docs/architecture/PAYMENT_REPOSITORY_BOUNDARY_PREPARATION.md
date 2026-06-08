# Payment Repository Boundary Preparation

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 42  
> Status: Migration preparation / repository boundary design  
> Runtime status: Not implemented  
> Depends on:
> - `PAYMENT_LEDGER_MINIMUM_DESIGN.md`
> - `POSTGRESQL_PAYMENT_LEDGER_SCHEMA_DRAFT.md`
> - `payment-ledger-gap-characterization.test.js`

---

## 1. Purpose

This document defines the repository and transaction boundaries needed before Yawmia migrates payment workflows from file-backed JSON to PostgreSQL.

It is intentionally a preparation document.

It does not:

```text
add PostgreSQL
add dependencies
run migrations
change runtime behavior
replace payments.js
enable dual-write
enable externalization
approve production readiness
```

It prepares the codebase for a future modular-monolith payment migration.

---

## 2. Current Runtime Reality

Current payment runtime lives mainly in:

```text
server/services/payments.js
server/services/financialExport.js
server/services/jobs.js
server/handlers/paymentsHandler.js
```

Current payment implementation:

```text
uses file-backed JSON
uses mutable payment records
has no payment ledger
has no persisted receipts
has no DB transaction boundary
emits in-memory EventBus events
updates payment state directly inside service functions
```

Current service functions include:

```text
createPayment()
confirmPayment()
disputePayment()
completePayment()
getFinancialSummary()
listByJob()
listAll()
```

Patch 39 characterized this as a production gap.

---

## 3. Target Direction

The target is not microservices.

The target is:

```text
modular monolith
PostgreSQL core
transaction-backed payment workflows
immutable payment ledger
persisted receipts
outbox events
repository boundaries
```

Repository boundaries allow the runtime to evolve from:

```text
service -> file-backed JSON helpers
```

to:

```text
service -> transaction boundary -> repository interfaces -> PostgreSQL adapter
```

without rewriting the entire payment domain repeatedly.

---

## 4. Non-goals

This document does not require:

```text
microservices
VPS split
AI data gateway
external payment processor
full accounting system
runtime repository switching today
PostgreSQL dependency today
```

---

## 5. Boundary Principle

Payment workflow code should express business intent.

Storage-specific code should live behind repositories.

Bad target shape:

```text
payments.js directly imports fs helpers, updates files, emits events, and calculates summaries
```

Better target shape:

```text
paymentService
  -> transactionManager.withTransaction()
    -> paymentRepository
    -> paymentLedgerRepository
    -> paymentDisputeRepository
    -> receiptRepository
    -> outboxRepository
    -> auditRepository
```

---

## 6. Required Repository Interfaces

### 6.1 `PaymentRepository`

Purpose:

```text
current payment projection read/write
```

Suggested methods:

```text
createProjection(tx, payment)
findById(tx, paymentId)
findForUpdate(tx, paymentId)
findByJob(tx, jobId)
listByEmployer(tx, employerId, filters)
updateProjection(tx, paymentId, patch)
getFinancialSummary(tx, filters)
```

Rules:

```text
updateProjection must not be called outside a transaction for production workflows
projection is not ledger
projection must reference lastLedgerEntryId when ledger is enabled
```

---

### 6.2 `PaymentLedgerRepository`

Purpose:

```text
append-only financial event history
```

Suggested methods:

```text
append(tx, ledgerEntry)
findById(tx, ledgerEntryId)
listByPayment(tx, paymentId)
listByJob(tx, jobId)
findByIdempotencyKey(tx, idempotencyKey)
```

Rules:

```text
append only
no update
no delete
idempotencyKey unique when present
```

---

### 6.3 `PaymentDisputeRepository`

Purpose:

```text
durable dispute workflow separate from payment projection
```

Suggested methods:

```text
open(tx, dispute)
findOpenByPayment(tx, paymentId)
findByPayment(tx, paymentId)
resolve(tx, disputeId, patch)
listByStatus(tx, status, filters)
```

Rules:

```text
one open dispute per payment unless explicitly redesigned
opening dispute writes ledger entry in same transaction
resolving dispute writes ledger entry in same transaction
```

---

### 6.4 `ReceiptRepository`

Purpose:

```text
persisted financial receipt artifacts
```

Suggested methods:

```text
findByPayment(tx, paymentId)
findByReceiptNumber(tx, receiptNumber)
allocateReceiptNumber(tx, receiptDate)
issue(tx, receipt)
```

Rules:

```text
receipt issuance must be idempotent by paymentId
receipt number must be allocated transactionally
receipt values must be snapshot-based
receipt is not a live projection
```

---

### 6.5 `OutboxRepository`

Purpose:

```text
durable domain events
```

Suggested methods:

```text
insert(tx, outboxEvent)
findPendingForDispatch(tx, limit)
markProcessing(tx, eventId)
markProcessed(tx, eventId)
markFailed(tx, eventId, error)
```

Rules:

```text
domain mutation and outbox insert happen in the same transaction
EventBus may remain a runtime dispatcher, but not source of durability
```

---

### 6.6 `AuditRepository`

Purpose:

```text
durable admin action audit for payment-sensitive operations
```

Suggested methods:

```text
insert(tx, auditRecord)
listByTarget(tx, targetType, targetId, filters)
```

Rules:

```text
admin payment completion must write audit row
audit row should reference ledgerEntryId when possible
```

---

## 7. Transaction Manager

Target abstraction:

```text
TransactionManager.withTransaction(fn)
```

Conceptual usage:

```text
await transactionManager.withTransaction(async (tx) => {
  const payment = await paymentRepository.findForUpdate(tx, paymentId);
  const ledgerEntry = await paymentLedgerRepository.append(tx, entry);
  await paymentRepository.updateProjection(tx, payment.id, patch);
  await outboxRepository.insert(tx, event);
});
```

The first implementation may be an adapter boundary only.

Future implementations:

```text
FileTransactionManager for tests/dev characterization only
PostgresTransactionManager for production
```

Important:

```text
a file-backed transaction manager cannot provide real multi-record rollback
```

So any file-backed adapter must be explicitly marked as non-production.

---

## 8. Service Boundary Target

Future `paymentService` should own orchestration.

It should not own storage mechanics.

Target service methods:

```text
createPaymentForCompletedJob(actor, jobId, options)
confirmPayment(actor, paymentId, options)
openPaymentDispute(actor, paymentId, reason)
completePaymentAsAdmin(actor, paymentId, options)
issueReceipt(actor, paymentId, options)
getPaymentSummary(actor, filters)
```

Each write method must:

```text
validate actor
validate state
append ledger
update projection
insert outbox event
insert audit when admin/sensitive
commit transaction
```

---

## 9. Handler Boundary

Current handler:

```text
server/handlers/paymentsHandler.js
```

should eventually call only service-level methods.

Handler should not know:

```text
ledger details
receipt sequence allocation
PostgreSQL transaction mechanics
file paths
outbox storage
```

Handler responsibilities:

```text
parse request
enforce route middleware auth/capability
sanitize user input
call service
map domain result to HTTP response
```

---

## 10. Current Functions and Target Mapping

| Current function | Future service method | Required repositories |
|---|---|---|
| `createPayment(jobId, employerId, options)` | `createPaymentForCompletedJob(actor, jobId, options)` | PaymentRepository, PaymentLedgerRepository, OutboxRepository |
| `confirmPayment(paymentId, employerId)` | `confirmPayment(actor, paymentId, options)` | PaymentRepository, PaymentLedgerRepository, OutboxRepository |
| `disputePayment(paymentId, userId, reason)` | `openPaymentDispute(actor, paymentId, reason)` | PaymentRepository, PaymentDisputeRepository, PaymentLedgerRepository, OutboxRepository |
| `completePayment(paymentId)` | `completePaymentAsAdmin(actor, paymentId, options)` | PaymentRepository, PaymentDisputeRepository, PaymentLedgerRepository, AuditRepository, OutboxRepository |
| `generateReceipt(paymentId)` | `issueOrReadReceipt(actor, paymentId, options)` | ReceiptRepository, PaymentRepository, PaymentLedgerRepository, OutboxRepository |
| `getFinancialSummary()` | `getPaymentSummary(actor, filters)` | PaymentRepository, PaymentLedgerRepository if reconciliation is requested |

---

## 11. Event Boundary

Current runtime emits:

```text
payment:created
payment:confirmed
payment:disputed
payment:completed
```

Future production path:

```text
insert outbox_events in transaction
dispatcher emits EventBus/SSE/WebPush/Admin alerts after commit
```

Important:

```text
EventBus can remain a local delivery mechanism
EventBus must not be relied on for durable business truth
```

---

## 12. Receipt Boundary

Current `generateReceipt()` should be split into two conceptual operations:

```text
buildReceiptSnapshot(payment, job, workers, attendance)
issueReceipt(actor, paymentId)
```

Future design:

```text
ReceiptSnapshotBuilder
ReceiptRepository
PaymentLedgerRepository
OutboxRepository
```

Rules:

```text
snapshot builder may be pure/read-only
receipt issuance must be transactional
receipt number allocation belongs to ReceiptRepository
```

---

## 13. Backfill Boundary

Backfill should not reuse normal runtime write methods blindly.

Recommended separate module:

```text
PaymentBackfillService
```

Responsibilities:

```text
read file-backed payments
validate source projection
insert payment projection
insert synthetic ledger entries
mark imported_from_file_json
report ambiguous timestamps
dry-run first
```

Backfill must support:

```text
dry-run
json report
row count verification
rollback plan
no receipt generation unless approved
```

---

## 14. Testing Strategy

### 14.1 Existing characterization tests

Keep:

```text
tests/e2e/payment-ledger-gap-characterization.test.js
```

Purpose:

```text
prove current system is not ledger-backed
```

### 14.2 Next characterization tests

Recommended:

```text
payment-transaction-boundary-characterization.test.js
receipt-persistence-gap-characterization.test.js
```

### 14.3 Future repository contract tests

When repositories exist, add:

```text
tests/contracts/payment-repository.contract.test.js
tests/contracts/payment-ledger-repository.contract.test.js
tests/contracts/receipt-repository.contract.test.js
```

Each adapter must pass the same contract:

```text
file-backed dev adapter if kept
PostgreSQL adapter
```

---

## 15. Migration Order

Recommended order:

```text
1. Keep current payments.js stable
2. Add repository interfaces / contracts
3. Add file-backed adapter only if needed for test parity
4. Add PostgreSQL adapter behind inactive runtime flag
5. Backfill dry-run tooling
6. Dual-read comparison in non-production
7. Switch payment writes transactionally
8. Freeze file-backed payments as archive
9. Remove direct file writes from payment workflows
```

Do not start with:

```text
rewriting all services
adding microservices
adding AI agent gateways
adding production DB writes without backfill/reconciliation
```

---

## 16. Runtime Flag Policy

A future runtime flag may exist:

```text
PAYMENT_REPOSITORY_MODE=file_json | postgres
```

But it must default to:

```text
file_json
```

until:

```text
PostgreSQL adapter passes repository contracts
backfill dry-run passes
dual-read comparison passes
rollback plan is tested
admin approval is recorded
```

Production switch must not be hidden behind dashboard-only approval.

---

## 17. File-backed Adapter Warning

A file-backed repository adapter can be useful for transition tests, but must be marked:

```text
non-transactional
single-process only
not production-safe
no rollback guarantee
```

Do not name it in a way that implies production parity.

Recommended naming:

```text
FilePaymentRepositoryForTransition
```

Not:

```text
ProductionFilePaymentRepository
```

---

## 18. PostgreSQL Adapter Requirements

The PostgreSQL adapter must support:

```text
SELECT ... FOR UPDATE for payment state transitions
unique idempotency keys
append-only ledger
transactional receipt sequence allocation
outbox insert in same transaction
admin audit insert in same transaction for sensitive operations
```

---

## 19. Open Questions Before Runtime Work

Before coding runtime migration:

```text
Should receipt issuance be automatic on payment completion or on first receipt read?
Should old file-backed completed payments receive retroactive receipts?
Should employer_confirmed ledger entry carry zero deltas or state metadata only?
Should worker payouts be split into per-worker ledger rows?
Should payment adjustments require admin approval always?
What legal retention applies to preserved payment/audit/message records after anonymization?
```

---

## 20. Final Decision

Payment repository boundaries should be introduced before any PostgreSQL runtime migration.

The correct path is:

```text
characterize gap
define ledger design
draft PostgreSQL schema
define repository boundaries
add repository contracts
then implement adapters
then migrate runtime
```

Yawmia should remain a modular monolith.

No microservices are required now.

No AI data gateway is allowed.

No smoke test should be interpreted as payment correctness proof.
