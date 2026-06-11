# Yawmia DB-backed Queue Minimum Design

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 60  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL-backed queue target  
> Non-goal: No runtime DB migration in this patch  
> Non-goal: No queue migration execution  
> Non-goal: No production data mutation  
> Non-goal: No Redis dependency in this patch  
> Non-goal: No external queue dependency in this patch  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This document defines the minimum PostgreSQL-backed queue design required before Yawmia can rely on production-grade background job execution.

It exists because the current file-backed `opsQueue` has become a critical operational dependency for:

```text
admin alert delivery
audit CSV exports
counter rebuilds
counter compaction
audit index rebuilds
backup restore drills
ops rollup capture
trust snapshot batches
trust calibration reports
predictive signal retention
workroom hygiene jobs
marketplace intelligence rollups
privacy user data export
privacy user anonymization
future durable outbox dispatch
future payment backfills
future migration/reconciliation jobs
```

This is a design and migration preparation document.

It does not implement PostgreSQL runtime.

It does not approve production readiness.

---

## 2. Current Runtime Reality

Current queue runtime is implemented primarily in:

```text
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/queueStorageIndex.js
server/services/processLock.js
server/services/resourceLock.js
server/services/database.js
```

Current behavior is file-backed:

```text
queue jobs stored as JSON files
segmented queue directories
monthly sharding
file-backed idempotency records
file-backed dead-letter records
summary/index files
process-local resourceLock
file-backed process locks
worker interval polling
lease-like fields on JSON records
```

The current implementation is useful for:

```text
development
single-writer operation
regression baselines
migration transition
small operational workloads
```

It is not a production-grade queue foundation for critical background work.

---

## 3. Why File-backed Queue Is Not Production Queue-grade

The current file-backed queue cannot provide strong guarantees for:

```text
atomic multi-worker claim across processes
database-level row locking
safe high-concurrency claiming
transactional enqueue with domain changes
transactional coupling with outbox events
durable attempt history with relational constraints
safe cross-instance workers
queryable backlog and latency metrics at scale
foreign-key coupling to privacy/payment/outbox workflows
```

File-backed queue claiming relies on:

```text
filesystem reads/writes
process-local locks
file-backed process locks
best-effort stale recovery
periodic summary repair
```

This is not enough for production workflows such as:

```text
privacy anonymization
payment backfill
ledger reconciliation
receipt issuance backfills
durable outbox dispatch
admin alert delivery
audit export retry
```

---

## 4. Design Decision

Yawmia should migrate the operational queue to PostgreSQL as part of the modular monolith core migration.

Preferred near-term design:

```text
PostgreSQL-backed queue inside the monolith
custom jobs table using SELECT ... FOR UPDATE SKIP LOCKED
no Redis dependency initially
no external queue dependency initially
no microservices split
```

Redis or external queue infrastructure can be considered later only after measured operational evidence.

---

## 5. Queue Is Not Outbox

The DB-backed queue and durable outbox are related but not the same system.

```text
outbox_events = durable business/domain events committed with domain transactions
ops_queue_jobs = background work execution records
```

Examples:

```text
Payment completed transaction inserts outbox event.
Outbox dispatcher later delivers notification/SSE/push.
If delivery requires retryable work, dispatcher may enqueue queue jobs.
```

The queue must not become the source of truth for business events.

The outbox must not become a generic long-running job queue.

---

## 6. Minimum Tables

Minimum PostgreSQL queue tables:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
```

Optional later tables:

```text
ops_queue_dead_letters
ops_queue_metrics_rollups
```

A separate dead-letter table is optional if `ops_queue_jobs.status='dead_letter'` preserves all required fields.

---

## 7. ops_queue_jobs

Minimum columns:

```text
id
type
status
priority
priority_weight
payload_json
idempotency_key
attempts
max_attempts
backoff_ms
next_run_at
lease_until
locked_by
last_error
result_json
cancel_requested
created_by
created_at
updated_at
started_at
completed_at
failed_at
dead_lettered_at
cancelled_at
```

Minimum statuses:

```text
pending
running
completed
failed
cancelled
dead_letter
```

Recommended constraints:

```text
status in allowed set
priority in allowed set
attempts >= 0
max_attempts >= 1
payload_json not null
created_at not null
updated_at not null
```

Recommended indexes:

```text
(status, next_run_at, priority_weight desc, created_at)
(type, status)
(idempotency_key)
(lease_until) where status = 'running'
(created_at)
(updated_at)
```

---

## 8. ops_queue_attempts

Attempt history must be durable and queryable.

Minimum columns:

```text
id
job_id
attempt_number
worker_id
started_at
completed_at
status
error
duration_ms
metadata_json
```

Allowed attempt statuses:

```text
started
completed
failed
cancelled
dead_lettered
```

Required behavior:

```text
one attempt row per actual processing attempt
attempt row starts when worker begins job
attempt row completes when job handler returns or throws
attempt error is sanitized
attempt duration is recorded
```

This replaces inference from a mutable job JSON record.

---

## 9. ops_queue_idempotency

Idempotency must protect enqueue calls.

Minimum columns:

```text
key_hash
idempotency_key
job_id
created_at
expires_at
```

Required behavior:

```text
same idempotency key returns existing pending/running/completed job while not expired
expired idempotency key may enqueue a new job
idempotency record is created transactionally with queue job
idempotency key is not used as filesystem path
```

---

## 10. Claiming Semantics

Workers claim jobs using PostgreSQL row locks.

Minimum claim shape:

```sql
SELECT id
FROM ops_queue_jobs
WHERE status = 'pending'
  AND cancel_requested = false
  AND next_run_at <= now()
ORDER BY priority_weight DESC, next_run_at ASC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT $limit;
```

Then in the same transaction:

```text
status = running
locked_by = worker_id
lease_until = now + lease interval
attempts = attempts + 1
started_at = coalesce(started_at, now)
updated_at = now
insert ops_queue_attempts started row
commit
```

This is the minimum queue-grade improvement over file-backed claim loops.

---

## 11. Lease / Visibility Timeout

Each running job must have:

```text
lease_until
locked_by
```

A job is stale when:

```text
status = running
lease_until < now()
```

Recovery rule:

```text
if attempts >= max_attempts:
  mark dead_letter
else:
  status = pending
  next_run_at = calculated backoff
  lease_until = null
  locked_by = null
```

The recovery update must be transaction-backed.

---

## 12. Retry and Backoff

Retry rules:

```text
retryable failure returns job to pending
non-retryable failure moves to dead_letter
max attempts exhaustion moves to dead_letter
backoff uses bounded exponential delay
next_run_at controls due time
```

Backoff formula should remain configurable:

```text
min(maxBackoffMs, baseBackoffMs * 2^(attempts - 1))
```

Jitter can be added later if needed.

---

## 13. Dead-letter Semantics

A dead-lettered job must preserve:

```text
original payload
type
attempt count
last error
attempt history
dead_lettered_at
created_by
idempotency metadata
```

Admin retry must:

```text
create audit record
reset status to pending
optionally reset attempts
clear lease fields
set next_run_at
preserve attempt history
```

Admin cancel must:

```text
create audit record
mark cancel_requested
transition cancelable states to cancelled
not delete the job row
```

---

## 14. Transactional Enqueue

Queue enqueue should support two modes:

```text
standalone enqueue
transaction-scoped enqueue
```

Standalone enqueue is acceptable for admin/manual jobs.

Transaction-scoped enqueue is required when queue job is part of a domain state change.

Examples:

```text
privacy request queued
payment backfill requested
outbox dispatcher scheduled
migration rehearsal requested
```

If the domain transaction rolls back, the queue job must not exist.

---

## 15. Relationship to Durable Outbox Dispatcher

The durable outbox dispatcher may use the DB-backed queue in two ways:

```text
1. direct dispatcher loop claims outbox_events with SKIP LOCKED
2. dispatcher schedules queue jobs for delivery types that need retry isolation
```

In both cases:

```text
outbox event is durable source
queue job is operational execution wrapper
```

Queue failure must not delete the outbox event.

Outbox processing state must remain independently visible.

---

## 16. Relationship to Privacy Jobs

Privacy jobs require DB-backed queue semantics because they are:

```text
sensitive
approval-gated
multi-step
retry-sensitive
idempotent
audit-critical
privacy_action_log-backed
```

Future privacy anonymization queue flow:

```text
begin
validate request
validate/consume approval if required
append privacy_action_log privacy_anonymization_queued
insert ops_queue_jobs privacy_user_anonymization
insert outbox_events privacy_request_queued
commit
```

Queue worker then processes steps and appends privacy action log entries.

---

## 17. Relationship to Payment Backfill and Reconciliation

Payment migration jobs require queue reliability for:

```text
legacy payment scan dry-run
ledger reconstruction rehearsal
receipt missing report
payment reconciliation
cutover validation
```

Payment backfill jobs must be:

```text
dry-run first
approval-gated before mutation
idempotent
reconciliation-producing
never silently destructive
```

The queue must preserve attempt history for financial audit.

---

## 18. Worker Crash Recovery

Crash recovery must be based on database state.

Minimum recovery query:

```text
find running jobs where lease_until < now()
```

Recovery action:

```text
transactionally return retryable jobs to pending
transactionally dead-letter exhausted jobs
append attempt status if needed
emit durable/admin-visible event after commit
```

No worker should need to scan JSON directories or infer stale state from file timestamps.

---

## 19. Worker Heartbeat

Optional but recommended:

```text
ops_queue_workers
```

Minimum fields:

```text
worker_id
instance_id
hostname
pid
started_at
heartbeat_at
stopped_at
metadata_json
```

This table is not required for claiming, but improves observability.

It must not be treated as distributed consensus.

---

## 20. Metrics and Observability

Minimum metrics:

```text
jobs by status
jobs by type
pending oldest age
running count
stale running count
dead-letter count
failure rate last hour
average attempts
p95 job duration
p95 queue latency
throughput per hour
retry count
admin retry count
admin cancel count
```

These should be visible to admin operations, but dashboard visibility must not be treated as production readiness.

---

## 21. Runtime Flags

Suggested future flags:

```text
QUEUE_ADAPTER=file_json | postgres
QUEUE_POSTGRES_ENABLED=false | true
QUEUE_FILE_WRITES_ENABLED=true | false
QUEUE_WORKERS_ENABLED=true | false
OUTBOX_DISPATCH_QUEUE_MODE=disabled | postgres_queue
```

Before cutover:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
```

After tested cutover:

```text
QUEUE_ADAPTER=postgres
QUEUE_POSTGRES_ENABLED=true
QUEUE_FILE_WRITES_ENABLED=false
```

No hidden dual-write.

---

## 22. Migration Path from File-backed Queue

Recommended migration phases:

```text
Phase 0: keep file-backed queue stable
Phase 1: add DB-backed queue design and tests
Phase 2: implement PostgreSQL schema in development
Phase 3: implement PgQueueRepository behind inactive flag
Phase 4: add contract tests and DB adapter tests
Phase 5: add file queue export dry-run report
Phase 6: import non-running historical queue rows into test DB
Phase 7: shadow metrics only
Phase 8: enable DB queue for one low-risk job type in staging
Phase 9: enable DB queue for admin exports in staging
Phase 10: enable DB queue for privacy/payment migration jobs only after approval
Phase 11: production cutover with rollback plan
```

Do not migrate active running file-backed queue jobs blindly.

---

## 23. File Queue Backfill Dry-run Report Shape

Dry-run report should include:

```text
scannedFileCount
validJobCount
corruptJobCount
statusCounts
typeCounts
runningJobCount
staleRunningJobCount
deadLetterCount
idempotencyRecordCount
duplicateIdempotencyKeyCount
wouldInsertJobCount
wouldInsertAttemptCount
wouldInsertIdempotencyCount
skippedActiveRunningCount
warnings
errors
```

Dry-run must not mutate:

```text
./data
PostgreSQL production database
queue files
idempotency files
dead-letter files
```

---

## 24. Rollback Plan

Rollback must include:

```text
queue adapter flag reset
worker stop/start plan
database backup reference
file-backed queue backup reference
idempotency behavior note
dead-letter preservation
admin audit of cutover attempt
post-rollback smoke
```

Rollback target:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
```

No queue job should be executed twice without idempotency review.

---

## 25. Production Hard Gates

Do not claim production-grade queue readiness until:

```text
PgQueueRepository implemented
queue schema migrated in staging
SKIP LOCKED claim tested under concurrency
lease expiry tested
worker crash recovery tested
idempotency tested
dead-letter retry tested
admin cancel tested
attempt history tested
privacy job test passed
payment backfill dry-run job test passed
outbox dispatcher interaction tested
rollback rehearsal passed
observability metrics available
file-backed queue writes disabled after cutover
```

---

## 26. Required Tests Before Runtime Cutover

Required test categories:

```text
queue repository contract tests
PostgreSQL adapter tests
concurrent claim tests
idempotent enqueue tests
payload size validation tests
retry/backoff tests
dead-letter tests
admin retry/cancel audit tests
lease expiry recovery tests
worker crash simulation tests
outbox dispatcher queue integration tests
privacy job reliability tests
payment backfill dry-run job tests
rollback tests
```

Tests must not mutate `./data`.

Use isolated temp directories or test PostgreSQL database only.

---

## 27. What Must Not Happen

Do not:

```text
claim file-backed queue is production-grade
claim this design implements DB queue runtime
enable DB-backed queue without adapter tests
run queue migration with --confirm in this patch
drain production queue in this patch
delete legacy queue files during design phase
introduce Redis before proving PostgreSQL queue is insufficient
split queue into a separate service before monolith is transaction-safe
use AI to claim or execute queue jobs
hide failed jobs from admin visibility
```

---

## 28. AI Boundary

AI may assist with:

```text
summarizing queue failure patterns
drafting operator remediation notes
explaining dead-letter causes
suggesting runbook steps
summarizing backfill dry-run reports
```

AI must not:

```text
claim jobs
retry jobs
cancel jobs
mark jobs completed
mutate privacy requests
mutate payments
approve backfills
decide cutover
```

Queue state transitions must remain deterministic, auditable, and transaction-backed.

---

## 29. Relationship to Scope Reduction

DB-backed queue work is P0/P1 foundation.

It should take priority over:

```text
new dashboards
new catalogs
new predictive features
new marketplace intelligence expansion
workroom UX expansion
AI agent orchestration
microservices split
```

The queue is infrastructure for safe migration and operations, not another advisory layer.

---

## 30. Final Decision

Yawmia should migrate from file-backed operational queue storage to a PostgreSQL-backed queue inside the modular monolith.

The minimum acceptable DB-backed queue must provide:

```text
SKIP LOCKED claiming
visibility timeout
retry/backoff
dead-letter
idempotency
attempt history
admin retry/cancel audit
worker crash recovery
metrics
transaction-scoped enqueue
```

This document is a plan only.

It does not make the current queue production-ready.

The correct direction remains:

```text
Modular Monolith First
PostgreSQL Core
DB-backed Queue
Durable Outbox
Payment Ledger
Privacy Action Log
DB-backed Sessions
No False Confidence
No Microservices Yet
No AI Data Gateway
```
