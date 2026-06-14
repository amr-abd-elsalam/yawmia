# Payment Backfill Dry-run Design

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 72  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Mutation posture: Dry-run only  
> Ledger posture: Preview only, no ledger writes  
> Receipt posture: Preview only, no receipt generation  
> Database posture: No DB writes, no PostgreSQL connection

---

## 1. Purpose

This document defines the no-mutation payment backfill dry-run design required before any future payment ledger backfill, persisted receipt rollout, PostgreSQL payment runtime migration, or financial reconciliation import.

It is a design and evidence-gate document.

It does not implement:

```text
payment ledger runtime
payment ledger backfill
ledger writes
receipt persistence
receipt generation
receipt number allocation
payment mutation
job mutation
database writes
PostgreSQL adapter activation
TransactionManager runtime
durable outbox runtime
privacy_action_log runtime
```

The goal is to define how a future dry-run script should scan legacy file-backed payment/job data and produce an operator-reviewed financial migration report without changing any data.

---

## 2. Current Runtime Reality

Current payment runtime remains file-backed and mutable.

Relevant runtime files include:

```text
server/services/payments.js
server/services/jobs.js
server/services/applications.js
server/services/attendance.js
server/services/financialExport.js
server/handlers/paymentsHandler.js
server/handlers/analyticsHandler.js
server/services/database.js
server/services/eventBus.js
```

Current behavior:

```text
createPayment() writes pay_*.json
confirmPayment() mutates pay_*.json
disputePayment() mutates pay_*.json
completePayment() mutates pay_*.json
generateReceipt() builds a receipt on demand
receipt number is generated at read time
receipt number is not persisted
receipt is not transactionally allocated
payment events use in-memory EventBus
job completion may create payment fire-and-forget
```

This is not sufficient for production-grade financial correctness.

---

## 3. Non-goals

This dry-run design must not be interpreted as runtime readiness.

Non-goals:

```text
No ledger writes.
No receipt generation.
No persisted receipts.
No receipt number allocation.
No payment status mutation.
No payment repair.
No job repair.
No DB writes.
No PostgreSQL migration execution.
No PostgreSQL adapter activation.
No TransactionManager runtime implementation.
No durable outbox runtime implementation.
No privacy_action_log runtime implementation.
No queue execution.
No EventBus emission.
No admin payment completion.
No dispute resolution.
No production data mutation.
No AI financial decision-maker.
No AI canonicalization.
No microservices split.
```

---

## 4. Source Data to Scan

A future `scripts/payment-backfill-dry-run.js` should scan only.

Primary sources:

```text
data/payments/**/*.json
data/jobs/**/*.json
data/applications/**/*.json
data/attendance/**/*.json
```

Optional supporting sources:

```text
data/payments/job-index.json
data/jobs/index.json
data/applications/job-index.json
data/attendance/job-index.json
```

The physical JSON records remain source of truth for the dry-run.

Secondary indexes are acceleration/hints only.

If index and physical files disagree, the report must surface drift and prefer physical records for evidence.

---

## 5. Required No-mutation Guarantees

The future dry-run must guarantee:

```text
mode = "dry-run"
mutationPerformed = false
no writes to ./data
no atomicWrite
no deleteJSON
no writeIndex
no addToSetIndex
no removeFromSetIndex
no queue enqueue
no EventBus emit
no payment status mutation
no job status mutation
no ledger writes
no receipt generation
no receipt number allocation
no DB writes
no PostgreSQL connection
no migration execution
```

Forbidden flags:

```text
--confirm
--repair
--write
--write-db
--ledger-write
--generate-receipts
--issue-receipts
--mutate-payments
--complete-payments
--resolve-disputes
--delete-legacy
```

If any forbidden flag appears, the script must fail closed.

---

## 6. Payment Invariants

The dry-run must validate each legacy payment projection.

Required invariants:

```text
payment.id exists and starts with pay_
payment.jobId exists
payment.employerId exists
payment.status is known
amount >= 0
platformFee >= 0
workerPayout >= 0
amount = platformFee + workerPayout
workersAccepted >= 0
dailyWage >= FINANCIALS.minDailyWage when applicable
durationDays >= 1
method is known when present
createdAt exists and is valid enough for ordering
one canonical payment per job unless policy says otherwise
job.status should be completed for payment creation
```

Known payment statuses:

```text
pending
employer_confirmed
completed
disputed
```

Unknown statuses are import blockers until explicit policy exists.

---

## 7. Job-Payment Relationship Checks

The dry-run must detect:

```text
completed jobs without payment records
payments for non-completed jobs
payments whose job file is missing
duplicate payment records per job
payment employerId mismatch with job.employerId
payment amount mismatch with job totalCost when no attendance adjustment exists
payment workersAccepted mismatch with job.workersAccepted
payment dailyWage mismatch with job.dailyWage
payment durationDays mismatch with job.durationDays
```

Completed jobs without payments are warnings by default unless the future ledger migration policy requires all completed jobs to be represented.

Payments without jobs are blockers.

Payments for non-completed jobs are blockers unless explicit finance/admin approval allows importing them as historical exceptions.

---

## 8. Attendance-adjusted Payment Limitations

Current payment creation may adjust totals using attendance summary:

```text
expectedWorkerDays = job.workersAccepted * job.durationDays
actualWorkerDays = checkedInCount
attendanceRate = actualWorkerDays / expectedWorkerDays
adjustedTotalCost = job.totalCost * attendanceRate
```

Dry-run must report ambiguity when:

```text
payment.attendanceBreakdown exists but source attendance records are missing
payment.attendanceBreakdown differs from recomputed attendance summary
payment amount differs from job.totalCost and no attendanceBreakdown exists
attendance records include no_show or manual overrides
accepted-equivalent application statuses changed over time
```

These are warnings unless the amount equation is invalid.

---

## 9. Receipt Gap Policy

Current receipt generation is not proof of historical receipt issuance.

The dry-run must explicitly report:

```text
receiptMissingCount
receiptNotPersistedCount
receiptNumberNonTransactionalRisk
jobsEligibleForPersistedReceiptPreview
wouldInsertReceiptCount
wouldSkipReceiptCount
```

The dry-run must not:

```text
generate receipt numbers
persist receipts
write receipt_sequences
write receipts
modify payment records
modify job records
```

Default policy:

```text
Do not issue retroactive receipts during dry-run.
Do not allocate historical receipt numbers during dry-run.
Completed legacy payments should be marked as receiptMissing=true in preview only.
```

Any future retroactive receipt issuance requires finance/admin approval and legal/business policy.

---

## 10. Synthetic Ledger Preview Policy

The dry-run may preview future ledger entries only as would-insert rows.

Previewed ledger entry types may include:

```text
payment_created
platform_fee_accrual
worker_payout_payable
employer_payment_confirmed
payment_dispute_opened
payment_completed
receipt_eligible
```

The preview must use:

```text
wouldInsertLedgerEntryCount
wouldInsertLedgerEntriesPreview[]
```

It must not write:

```text
payment_ledger_entries
payments table
receipts table
receipt_sequences table
outbox_events table
```

No ledger entry preview may be treated as persisted financial truth.

---

## 11. Import Gate Policy

The dry-run report must contain an import gate.

Default:

```text
importGate.canProceedToLedgerBackfill = false
```

until all blockers are resolved and required approvals are recorded.

Blockers include:

```text
corrupt payment JSON
corrupt job JSON affecting payment relationship
duplicate active/canonical payments per job
payment without job
unknown payment status
negative amount
negative platformFee
negative workerPayout
amount != platformFee + workerPayout
missing required payment fields
payment for non-completed job without explicit approval
receipt number conflict if persisted receipts already exist later
ledger preview cannot be derived deterministically
```

Warnings include:

```text
completed job without payment
disputed payments
pending payments
employer_confirmed payments not completed
attendance-adjusted amount ambiguity
legacy mutable status limitation
receipt non-persistence
receipt number non-transactional risk
synthetic ledger limitations
secondary index drift
missing optional timestamps
```

Required approvals may include:

```text
finance_review
admin_approval
receipt_policy_approval
disputed_payment_import_policy
non_completed_job_payment_policy
legacy_mutable_status_policy
reconciliation_override_policy
```

---

## 12. Required Report Shape

A future dry-run report must have at least:

```json
{
  "ok": true,
  "mode": "dry-run",
  "reportVersion": 1,
  "severity": "ok",
  "mutationPerformed": false,
  "generatedAt": "ISO",
  "basePath": "./data",
  "scannedPaymentFileCount": 0,
  "scannedJobFileCount": 0,
  "validPaymentCount": 0,
  "corruptPaymentCount": 0,
  "corruptJobCount": 0,
  "duplicateJobPaymentCount": 0,
  "missingPaymentForCompletedJobCount": 0,
  "paymentForNonCompletedJobCount": 0,
  "paymentWithoutJobCount": 0,
  "invalidAmountCount": 0,
  "invalidPlatformFeeCount": 0,
  "invalidWorkerPayoutCount": 0,
  "invalidAmountEquationCount": 0,
  "unknownPaymentStatusCount": 0,
  "statusCounts": {},
  "paymentMethodCounts": {},
  "disputedPaymentCount": 0,
  "completedPaymentCount": 0,
  "pendingPaymentCount": 0,
  "receiptMissingCount": 0,
  "receiptNotPersistedCount": 0,
  "receiptNumberNonTransactionalRisk": true,
  "wouldInsertLedgerEntryCount": 0,
  "wouldInsertLedgerEntriesPreview": [],
  "wouldInsertReceiptCount": 0,
  "wouldSkipPaymentCount": 0,
  "wouldSkipByReason": {},
  "skippedByReasonCounts": {},
  "importGate": {
    "canProceedToLedgerBackfill": false,
    "blockers": [],
    "warnings": [],
    "requiredApprovals": []
  },
  "financeRisk": {},
  "receiptRisk": {},
  "reconciliation": {},
  "warnings": [],
  "errors": [],
  "recommendations": []
}
```

Additional fields are allowed if backward-compatible.

---

## 13. Severity Model

Recommended severity values:

```text
ok
warning
critical
```

Severity rules:

```text
critical if blockers exist
critical if corrupt required payment/job JSON exists
critical if invalid financial equation exists
critical if negative amount/fee/payout exists
critical if duplicate canonical payment per job exists
critical if paymentWithoutJobCount > 0
warning if only warnings exist
ok only when no blockers and no warnings
```

The script should expose:

```text
importBlockerCount
warningCount
errorCount
```

---

## 14. Reconciliation Requirements

The dry-run must prepare future reconciliation.

Minimum reconciliation sections:

```text
filePaymentCount
canonicalPaymentCount
paymentByJobCount
completedJobCount
completedJobWithPaymentCount
completedJobWithoutPaymentCount
statusCounts
amountTotals
platformFeeTotals
workerPayoutTotals
equationMismatchCount
duplicateJobPaymentCount
ledgerPreviewCount
receiptPreviewCount
```

Reconciliation must be reviewed before any ledger import.

---

## 15. Finance/Admin Approval Requirements

Future payment ledger backfill requires explicit approvals.

Required approvals may include:

```text
payment_ledger_backfill
receipt_retroactive_policy
payment_reconciliation_override
payment_for_non_completed_job_import
duplicate_payment_canonical_selection
disputed_payment_import_policy
legacy_receipt_gap_acceptance
```

These approvals should be recorded through the admin approvals workflow before any future mutation patch.

---

## 16. Relationship to Payment Ledger Runtime Migration Plan

This design is a prerequisite for the payment ledger runtime migration plan.

It supports:

```text
Phase 4: Backfill dry-run
Phase 5: Reconciliation and shadow reads
Phase 8: Persisted receipt issuance policy
Phase 9: Production rehearsal
```

It does not implement those phases.

Reference:

```text
docs/architecture/PAYMENT_LEDGER_RUNTIME_MIGRATION_PLAN.md
```

---

## 17. Relationship to TransactionManager

Future real ledger backfill and receipt issuance must run inside real database transactions.

The dry-run does not need TransactionManager because it must not mutate anything.

However, the report should identify workflows that later require:

```text
TransactionManager.withTransaction()
PaymentRepository
PaymentLedgerRepository
ReceiptRepository
OutboxRepository
AuditRepository
PrivacyActionLogRepository when privacy-related financial exports exist
```

Reference:

```text
server/repositories/transactionManager.contract.js
```

---

## 18. Relationship to Persisted Receipts

Persisted receipts are future runtime artifacts.

The dry-run may preview:

```text
wouldInsertReceiptCount
jobsEligibleForPersistedReceiptPreview
paymentsEligibleForReceiptPreview
receiptPolicyWarnings
```

It must not:

```text
issue receipts
allocate numbers
persist receipt snapshots
claim historical receipt issuance
```

`generateReceipt()` output must be treated as a current on-demand view, not proof of historical receipt issuance.

---

## 19. Relationship to Durable Outbox

Future ledger backfill and receipt issuance should create durable outbox events inside the same transaction.

Potential future events:

```text
payment_backfilled
payment_ledger_entry_imported
receipt_issued
payment_reconciliation_warning
```

The dry-run must not emit EventBus or outbox events.

It may preview:

```text
wouldInsertOutboxEventCount
outboxEventsPreview[]
```

only if needed later.

Reference:

```text
docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md
```

---

## 20. Relationship to Privacy Action Log

Payment backfill can expose privacy-sensitive financial records.

If future dry-run or import handles user data exports, anonymized users, or privacy-linked financial data, it should report:

```text
privacySensitivePaymentCount
anonymizedUserPaymentCount
paymentsLinkedToPrivacyRequests
privacyActionLogRequired
```

The dry-run must not write privacy_action_log.

Reference:

```text
docs/architecture/PRIVACY_ACTION_LOG_MINIMUM_DESIGN.md
```

---

## 21. Future Script Behavior

A future script may be:

```bash
node scripts/payment-backfill-dry-run.js --json --include-previews
```

Allowed flags:

```text
--json
--base-path
--include-previews
--max-preview
--strict
--status
```

Forbidden flags must fail closed.

The script must not import:

```text
server.js
server/router.js
server/services/queueWorkers.js
server/services/schedulerRegistry.js
server/services/opsQueue.js
server/services/payments.js if doing so can mutate or register runtime side effects
```

Preferred implementation should use low-level read-only filesystem scanning helpers or internal pure functions.

---

## 22. Future Tests

Future script tests must use isolated temporary data paths.

They must prove:

```text
no ./data mutation
dry-run rejects mutation flags
corrupt payment JSON is reported
duplicate payment per job is reported
completed job without payment is reported
payment without job is blocker
payment for non-completed job is blocker unless approved by policy
negative amount is blocker
amount equation mismatch is blocker
receipt gap is reported
ledger preview is would-insert only
no receipt number is generated
no DB writes occur
no EventBus emission occurs
```

---

## 23. AI Boundary

AI may assist with:

```text
summarizing the dry-run report
explaining blockers
drafting finance review notes
suggesting reconciliation investigation steps
```

AI must not:

```text
choose canonical payments
write ledger entries
issue receipts
approve finance migration
override reconciliation
complete payments
resolve disputes
mutate payment records
run migrations
```

---

## 24. Final Position

Payment backfill must be dry-run-first.

No future financial import should proceed until:

```text
payment backfill dry-run report exists
severity is not critical
importGate.canProceedToLedgerBackfill is true
importBlockerCount is 0
finance/admin approvals are recorded
receipt policy is explicit
reconciliation is reviewed
rollback plan exists
TransactionManager-backed runtime is ready
```

This document does not make Yawmia financially production-ready.

It defines the evidence gate before future financial migration work.
