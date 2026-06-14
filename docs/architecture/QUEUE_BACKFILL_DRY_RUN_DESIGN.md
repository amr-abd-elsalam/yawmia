# Yawmia Queue Backfill Dry-run Design

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 62  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL-backed queue target  
> Builds on: `docs/architecture/DB_BACKED_QUEUE_MINIMUM_DESIGN.md`  
> Builds on: `server/repositories/queueRepository.contract.js`  
> Non-goal: No runtime DB-backed queue adapter in this patch  
> Non-goal: No queue migration execution  
> Non-goal: No queue import execution  
> Non-goal: No queue repair, drain, retry, or worker execution  
> Non-goal: No production data mutation  
> Non-goal: No PostgreSQL writes  
> Non-goal: No Redis dependency  
> Non-goal: No external queue dependency  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This document defines the no-mutation dry-run design required before importing the existing file-backed `opsQueue` data into a future PostgreSQL-backed queue.

Patch 60 defined the DB-backed queue target.

Patch 61 defined the `QueueRepository` contract seam.

Patch 62 must define how legacy queue state will be scanned, classified, reported, and reviewed before any PostgreSQL adapter or import tooling is allowed to mutate data.

This is a migration-preparation document only.

It does not implement:

```text
PgQueueRepository
PostgreSQL schema migration
queue import
queue cutover
queue worker replacement
queue repair
queue drain
queue retry
queue execution
```

---

## 2. Current Runtime Reality

Current queue runtime remains file-backed and implemented primarily in:

```text
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/queueStorageIndex.js
server/services/processLock.js
server/services/resourceLock.js
server/services/database.js
```

Current storage shapes include:

```text
data/ops_queue/q_*.json
data/ops_queue/pending/YYYY-MM/q_*.json
data/ops_queue/running/YYYY-MM/q_*.json
data/ops_queue/completed/YYYY-MM/q_*.json
data/ops_queue/failed/YYYY-MM/q_*.json
data/ops_queue/cancelled/YYYY-MM/q_*.json
data/ops_queue/dead-letter/q_*.json
data/ops_queue/dead-letter/YYYY-MM/q_*.json
data/ops_queue/idempotency/*.json
data/metrics/queue/summary.json
```

The current queue has useful single-writer behavior, but it is not production queue-grade because it cannot provide database-level claim isolation, transaction-scoped enqueue, durable relational attempt history, or safe cross-instance workers.

---

## 3. Why Dry-run Comes Before PgQueueRepository

A future `PgQueueRepository` adapter should not be built against assumptions about clean legacy queue state.

The file-backed queue can contain:

```text
legacy flat records
segmented status records
dead-letter mirror records
summary/location drift
duplicate job IDs across legacy and segmented paths
corrupt JSON files
stale running jobs
active running jobs
idempotency records pointing to missing jobs
duplicate idempotency keys
jobs with missing fields
jobs with invalid statuses
jobs with oversized payloads
jobs with unknown handler types
```

A dry-run report must make these facts visible before any import.

The dry-run is evidence collection, not remediation.

---

## 4. Design Decision

Before any DB-backed queue adapter is enabled, Yawmia must have a queue backfill dry-run tool that:

```text
scans legacy file-backed queue state
classifies records
detects corrupt/duplicate/stale/orphan cases
produces a stable report shape
does not mutate ./data
does not write to PostgreSQL
does not execute queue jobs
does not repair queue summary/indexes
does not drain or retry queue jobs
```

This dry-run report becomes an approval artifact for a later queue import.

---

## 5. Inputs to Scan

The dry-run scanner should inspect these paths relative to `YAWMIA_DATA_PATH` or `config.DATABASE.basePath`:

```text
ops_queue/
ops_queue/pending/
ops_queue/running/
ops_queue/completed/
ops_queue/failed/
ops_queue/cancelled/
ops_queue/dead-letter/
ops_queue/idempotency/
metrics/queue/summary.json
```

It should support both:

```text
legacy flat layout
segmented status/month layout
```

It must treat missing directories as empty, not fatal.

---

## 6. Mutation Policy

The dry-run must never mutate:

```text
./data
queue files
idempotency files
dead-letter files
summary files
archive files
PostgreSQL
external stores
```

The dry-run must not expose any `--confirm` mode.

If a later import tool is created, it must be a separate command and must require explicit approval gates.

---

## 7. Worker and Scheduler Policy

The dry-run must not import or start:

```text
server.js
server/router.js
server/services/queueWorkers.js
server/services/schedulerRegistry.js
```

The dry-run must not:

```text
start queue workers
claim jobs
retry jobs
cancel jobs
complete jobs
dead-letter jobs
run handlers
run schedulers
repair process locks
```

This protects production data and prevents accidental job execution.

---

## 8. Record Discovery Policy

Each discovered queue JSON record should be represented internally as:

```text
{
  jobId,
  sourcePath,
  sourceLayout,
  sourceStatusDirectory,
  physicalStatus,
  recordStatus,
  createdAt,
  updatedAt,
  parsed,
  parseError,
  rawSizeBytes
}
```

Allowed `sourceLayout` values:

```text
legacy_flat
segmented_status_month
legacy_dead_letter
segmented_dead_letter_month
idempotency
summary
unknown
```

The scanner should not trust the directory status blindly.

It must compare:

```text
directory/status path
record.status
summary location status
```

and report mismatches.

---

## 9. Corrupt JSON Policy

Corrupt JSON files must be reported, not repaired.

Report fields:

```text
corruptFileCount
corruptFiles[]
```

Each corrupt file entry should include:

```text
sourcePath
sourceLayout
error
rawSizeBytes
```

Corrupt files must not block the entire dry-run unless the caller explicitly requests strict mode in a later script design.

Default dry-run behavior:

```text
continue scanning
record warning/error
do not mutate
```

---

## 10. Duplicate Job ID Policy

A job ID may appear in multiple physical locations due to:

```text
legacy-to-segment transition
failed move cleanup
summary drift
manual recovery
old dead-letter mirror
```

Dry-run must detect duplicates by `job.id`.

Report:

```text
duplicateJobIdCount
duplicateJobIds[]
```

Each duplicate entry should include:

```text
jobId
locations[]
canonicalCandidate
reason
```

No canonical file should be rewritten in dry-run.

Canonical selection is for reporting only.

---

## 11. Canonical Selection Policy for Reporting

When a duplicate job ID exists, the dry-run should choose a canonical candidate for would-insert counts only.

Suggested reporting-only precedence:

```text
1. record with latest updatedAt
2. if tie, record with latest lifecycle timestamp:
   completedAt
   failedAt
   deadLetteredAt
   cancelledAt
   startedAt
   createdAt
3. if tie, prefer segmented path over legacy flat path
4. if tie, prefer non-dead-letter active record unless record.status is dead-letter
5. if still tied, choose lexicographically smallest sourcePath
```

The report must include that this is not mutation and not repair.

---

## 12. Status Classification

Recognized file-backed statuses:

```text
pending
running
completed
failed
dead-letter
cancelled
```

Future PostgreSQL target statuses from Patch 60:

```text
pending
running
completed
failed
cancelled
dead_letter
```

Dry-run should map:

```text
dead-letter -> dead_letter
```

It should report unknown statuses separately:

```text
unknownStatusCount
unknownStatusJobs[]
```

Unknown status jobs should be skipped from would-insert unless a later import policy explicitly maps them.

---

## 13. Running Job Policy

Running jobs are risky during migration.

Dry-run must classify running jobs as:

```text
active_running
stale_running
invalid_running_missing_lease
invalid_running_missing_locked_by
```

Suggested stale rules should mirror current runtime posture:

```text
leaseUntil < now
or updatedAt older than OPS_QUEUE.staleRunningMs
```

Report fields:

```text
runningJobCount
activeRunningJobCount
staleRunningJobCount
invalidRunningJobCount
skippedActiveRunningCount
```

Default import posture:

```text
active_running jobs are skipped
stale_running jobs are report-only candidates for later recovery/import review
```

Dry-run must not recover stale running jobs.

---

## 14. Dead-letter Policy

Dead-letter records may exist in:

```text
ops_queue/dead-letter/q_*.json
ops_queue/dead-letter/YYYY-MM/q_*.json
segmented status paths with status dead-letter
legacy mirror paths
```

Dry-run must report:

```text
deadLetterCount
deadLetterMirrorDuplicateCount
deadLetterJobs[]
```

Dead-letter jobs should preserve:

```text
payload
lastError
attempts
maxAttempts
deadLetteredAt
createdBy
type
```

Default import posture:

```text
dead-letter jobs may be imported as historical dead_letter rows
but must not be retried or reactivated by backfill
```

---

## 15. Attempt Reconstruction Policy

Current file-backed jobs do not have durable attempt rows equivalent to future `ops_queue_attempts`.

Dry-run may reconstruct minimal attempt previews from available mutable fields only.

Suggested policy:

```text
if attempts > 0:
  wouldInsertAttemptCount += attempts
  mark reconstructed=true
  mark estimatedFromMutableJob=true
else:
  no attempt rows
```

Attempt reconstruction limitations must be explicit.

Dry-run must not claim exact historical attempt timeline unless actual attempt records exist.

---

## 16. Idempotency Record Policy

Current idempotency records are stored under:

```text
ops_queue/idempotency/{sha256}.json
```

Dry-run should scan them and report:

```text
idempotencyRecordCount
validIdempotencyRecordCount
corruptIdempotencyRecordCount
orphanIdempotencyRecordCount
duplicateIdempotencyKeyCount
expiredIdempotencyRecordCount
wouldInsertIdempotencyCount
```

Each idempotency record should be checked for:

```text
keyHash
idempotencyKey
jobId
createdAt
expiresAt
```

An idempotency record is orphaned when:

```text
jobId does not resolve to any canonical queue job
```

Expired idempotency should be reported separately.

Default import posture:

```text
only non-expired idempotency records pointing to importable canonical jobs are would-insert candidates
```

---

## 17. Queue Summary Drift Policy

`metrics/queue/summary.json` is acceleration and visibility data, not source of truth.

Dry-run should inspect it if present and compare it with actual files.

Report:

```text
summaryPresent
summaryStale
summaryStaleReason
summaryLocationCount
summaryStatusCounts
actualStatusCounts
summaryMismatchCount
summaryMissingFileCount
summaryExtraFileCount
summaryWrongStatusCount
```

Dry-run must not call `rebuildQueueSummary()`.

Dry-run must not write `summary.json`.

---

## 18. Payload Validation

Dry-run should validate payload size and JSON-serializability.

Report:

```text
oversizedPayloadCount
oversizedPayloadJobs[]
invalidPayloadCount
```

Use the current configured limit:

```text
config.OPS_QUEUE.maxPayloadBytes
```

Oversized jobs should be skipped from would-insert unless a later import policy explicitly allows archival import.

---

## 19. Type / Handler Classification

Dry-run should count job types:

```text
typeCounts
unknownTypeCount
unknownTypeJobs[]
```

It should not import `queueWorkers.js` just to discover handlers.

Instead, maintain a static known-types list in the future dry-run script or load it from a safe docs/metadata source.

Known types may include:

```text
admin_alert_webhook
admin_alert_email
audit_csv_export
predictive_scan
counter_rebuild
counter_compaction
audit_index_rebuild
backup_restore_drill
ops_rollup_capture
production_readiness_check
trust_snapshot_batch
trust_calibration_report
predictive_signal_retention
workroom_search_rebuild
queue_compaction
queue_verify
queue_repair
workroom_hygiene_compaction
workroom_search_verify
workroom_attachment_cleanup
audit_token_compaction
trust_snapshot_rollup
predictive_archive_index_rebuild
scheduler_history_cleanup
marketplace_intelligence_rollup
search_analytics_rollup
payment_dispute_analytics_rollup
workroom_adoption_rollup
notification_conversion_rollup
activation_funnel_rollup
search_relevance_rebuild
privacy_user_data_export
privacy_user_anonymization
```

Unknown types should be reported for operator review.

---

## 20. Would-insert Mapping to PostgreSQL Tables

Dry-run should preview rows for:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
```

It must report counts, not write rows.

Suggested report fields:

```text
wouldInsertJobCount
wouldInsertAttemptCount
wouldInsertIdempotencyCount
wouldSkipJobCount
wouldSkipAttemptCount
wouldSkipIdempotencyCount
```

Each would-insert preview should include enough metadata for review but avoid dumping huge payloads by default.

---

## 21. Job Import Eligibility

A canonical job is importable when:

```text
parsed successfully
has valid job id
has recognized status
has valid type
payload size is within configured limit
is not active_running
does not have unresolved critical structural errors
```

Skipped jobs should include a reason:

```text
active_running
corrupt_json
duplicate_non_canonical
unknown_status
unknown_type
oversized_payload
missing_required_field
orphan_dead_letter_mirror
```

---

## 22. Required Report Shape

Minimum dry-run report:

```text
{
  ok,
  mode,
  reportVersion,
  severity,
  mutationPerformed,
  generatedAt,
  basePath,
  canonicalSelectionPolicyVersion,
  importGate,
  importBlockerCount,
  scannedFileCount,
  scannedJobFileCount,
  scannedIdempotencyFileCount,
  validJobCount,
  corruptJobCount,
  duplicateJobIdCount,
  duplicateActiveJobIdCount,
  statusCounts,
  physicalStatusCounts,
  sourceLayoutCounts,
  typeCounts,
  runningJobCount,
  activeRunningJobCount,
  staleRunningJobCount,
  invalidRunningJobCount,
  activeQueueRisk,
  privacyJobFindings,
  paymentJobFindings,
  auditExportJobFindings,
  adminAlertJobFindings,
  predictiveAnalyticsJobFindings,
  unknownJobFindings,
  deadLetterCount,
  idempotencyRecordCount,
  validIdempotencyRecordCount,
  orphanIdempotencyRecordCount,
  duplicateIdempotencyKeyCount,
  expiredIdempotencyRecordCount,
  summary,
  wouldInsertJobCount,
  wouldInsertAttemptCount,
  wouldInsertIdempotencyCount,
  wouldSkipJobCount,
  wouldInsertByStatus,
  wouldSkipByReason,
  skippedByReasonCounts,
  warnings,
  errors,
  recommendations
}
```

Optional details:

```text
corruptFiles
duplicateJobIds
activeRunningJobs
staleRunningJobs
orphanIdempotencyRecords
unknownStatusJobs
unknownTypeJobs
oversizedPayloadJobs
summaryMismatches
wouldInsertJobsPreview
wouldSkipJobs
```

Previews should be bounded.

---

## 23. Import Gate Policy

The dry-run report must include an explicit import gate:

```text
importGate: {
  canProceedToImport: boolean,
  blockers: [],
  warnings: [],
  requiredApprovals: []
}
```

`importGate.canProceedToImport` must be `false` when blockers exist.

Blockers include:

```text
corruptJobCount > 0
duplicateActiveJobIdCount > 0
activeRunningJobCount > 0
invalidRunningJobCount > 0
unknownActiveStatusCount > 0
oversizedPayloadCount > 0
missingRequiredFieldCount > 0
```

Warnings / approval-required findings include:

```text
historical dead-letter duplicates
summary drift
stale running jobs
orphan idempotency records
expired idempotency records
unknown queue types
privacy queue jobs
payment/ledger/receipt queue jobs
attempt reconstruction limitations
legacy flat records
```

The report must not rely on `errors[]` alone as the migration gate.

It must separate:

```text
blockers
warnings
requiredApprovals
recommendations
```

This preserves operator review and prevents false confidence before any future queue import.

## 24. Evidence Report Hardening

The dry-run report should also include stable evidence fields:

```text
reportVersion
canonicalSelectionPolicyVersion
severity
sourceLayoutCounts
skippedByReasonCounts
wouldInsertByStatus
wouldSkipByReason
activeQueueRisk
privacyJobFindings
paymentJobFindings
```

Source layout counts must distinguish:

```text
legacy_flat
segmented_status_month
legacy_dead_letter
segmented_dead_letter_month
idempotency
summary
```

Privacy jobs must be classified separately:

```text
privacy_user_data_export
privacy_user_anonymization
```

Payment or future ledger/receipt jobs must be classified separately by type or type hints:

```text
payment
ledger
receipt
financial
reconciliation
```

The script must not choose canonical records as an irreversible decision.

Canonical selection is reporting-only and must include:

```text
canonicalSelectionPolicyVersion
canonicalCandidate
locations
reason
```

## 25. Severity Model

Suggested severity:

```text
ok
warning
critical
```

Critical findings:

```text
corrupt queue JSON files
duplicate canonical ambiguity for active jobs
active running jobs during intended import window
summary indicates missing files for running/pending jobs
idempotency duplicates for active pending/running jobs
unknown status on active queue records
oversized payload for pending/running jobs
```

Warnings:

```text
dead-letter historical duplicates
expired idempotency records
summary drift for completed/cancelled jobs
unknown types in completed/cancelled history
attempt reconstruction limitations
legacy flat records still present
```

---

## 24. Future CLI Shape

A future script may be:

```bash
node scripts/queue-backfill-dry-run.js --json
```

Optional safe flags:

```text
--base-path <path>
--include-previews
--strict
--max-preview 50
--status pending,running,failed
```

Forbidden flags:

```text
--confirm
--repair
--drain
--retry
--cancel
--complete
--import
--write-db
--delete-legacy
```

If a future import tool is created, it must be separate:

```text
scripts/queue-backfill-import.js
```

and must require its own approval design.

---

## 25. Required Tests for Future Script

If implemented later, test with temp `YAWMIA_DATA_PATH` only.

Required cases:

```text
empty queue
legacy flat pending job
segmented pending job
segmented running active job
segmented running stale job
dead-letter legacy mirror
duplicate job id across legacy and segmented path
corrupt JSON job file
unknown status
unknown type
oversized payload
valid idempotency record
orphan idempotency record
duplicate idempotency key
expired idempotency record
summary drift
bounded preview output
no mutation of input files
no --confirm support
no queue worker import
no scheduler import
```

Tests must assert:

```text
source files unchanged
no new files written
no jobs executed
stable report shape
```

---

## 26. Approval Gates Before Real Import

A later real import must not run until:

```text
dry-run report reviewed
active running jobs resolved or intentionally skipped
corrupt JSON policy approved
duplicate job policy approved
dead-letter import policy approved
idempotency import policy approved
attempt reconstruction limitation accepted
PostgreSQL queue schema exists in staging
PgQueueRepository adapter tests pass
rollback rehearsal passes
admin approval recorded
```

---

## 27. Rollback Notes

Dry-run needs no rollback because it performs no mutation.

A future import rollback must include:

```text
database backup reference
file-backed queue backup reference
import manifest
import report
idempotency mapping report
dead-letter preservation report
worker pause/resume plan
adapter flag reset plan
post-rollback smoke
```

Default rollback adapter posture:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
```

---

## 28. Relationship to Durable Outbox

Queue backfill is not outbox backfill.

The queue import must not invent durable business events.

Outbox backfill or event reconstruction requires a separate design because:

```text
outbox_events represent business/domain facts
ops_queue_jobs represent operational work execution
```

A queue job imported from legacy files should remain an operational history item, not become proof that a domain event occurred.

---

## 29. Relationship to Privacy Jobs

Privacy jobs are high-risk queue jobs.

Dry-run should classify them separately:

```text
privacy_user_data_export
privacy_user_anonymization
```

For privacy jobs, report must indicate:

```text
approvalId present/missing
requestId present/missing
userId present/missing
privacy request status if safely resolvable by read-only lookup
```

Dry-run must not run anonymization.

Dry-run must not consume approvals.

Dry-run must not modify privacy requests.

---

## 30. Relationship to Payment Backfill Jobs

Payment-related queue jobs are future-facing.

If encountered, they must be classified as financial migration jobs.

Dry-run must not:

```text
write ledger entries
issue receipts
run payment reconciliation
complete payments
```

Any payment migration queue import must preserve attempt history and failed state for audit.

---

## 31. AI Boundary

AI may assist with:

```text
summarizing the dry-run report
explaining duplicate patterns
drafting operator review notes
suggesting non-mutating next steps
```

AI must not:

```text
decide canonical records
approve import
execute import
retry jobs
cancel jobs
mark jobs completed
mutate privacy requests
mutate payments
claim queue jobs
```

All queue state transitions must remain deterministic, auditable, and transaction-backed in the future DB-backed runtime.

---

## 32. What Must Not Happen

Do not:

```text
claim this dry-run design implements DB-backed queue
claim file-backed queue is production-grade
write PgQueueRepository before dry-run policy is clear
run queue import in this patch
repair queue summary in this patch
drain queue in this patch
delete duplicate files in this patch
recover stale running jobs in this patch
consume privacy approvals in this patch
write payment ledger entries in this patch
use AI as a queue migration decision-maker
split queue into a separate service before monolith transaction safety exists
```

---

## 33. Final Decision

Yawmia must define and later implement a no-mutation queue backfill dry-run before any DB-backed queue adapter or import tooling is allowed to affect runtime state.

This dry-run is a safety gate between:

```text
Patch 60 DB-backed queue design
Patch 61 QueueRepository contract
future PgQueueRepository adapter
future queue import/cutover
```

The correct direction remains:

```text
Refactor First
Modular Monolith First
PostgreSQL Core
DB-backed Queue
Dry-run Before Import
Durable Outbox Later
Payment Ledger Later
Privacy Action Log Later
DB-backed Sessions Later
No False Confidence
No AI Data Gateway
No Microservices Yet
```
