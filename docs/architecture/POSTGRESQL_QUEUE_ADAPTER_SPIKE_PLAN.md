# PostgreSQL Queue Adapter Spike Plan

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 64  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL-backed queue target  
> Builds on: `docs/architecture/DB_BACKED_QUEUE_MINIMUM_DESIGN.md`  
> Builds on: `docs/architecture/QUEUE_BACKFILL_DRY_RUN_DESIGN.md`  
> Builds on: `server/repositories/queueRepository.contract.js`  
> Non-goal: No PostgreSQL runtime adapter in this patch  
> Non-goal: No schema migration execution  
> Non-goal: No queue import execution  
> Non-goal: No queue cutover  
> Non-goal: No production data mutation  
> Non-goal: No queue worker replacement  
> Non-goal: No Redis dependency  
> Non-goal: No external queue dependency  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This document defines the spike plan and test database policy required before implementing a future `PgQueueRepository` adapter.

Patch 60 defined the DB-backed queue minimum design.

Patch 61 defined the `QueueRepository` contract seam.

Patch 62 defined the queue backfill dry-run design.

Patch 63 added a no-mutation `scripts/queue-backfill-dry-run.js` skeleton and characterization tests.

Patch 64 must prevent the next step from becoming an unsafe runtime jump.

This document is the guardrail between:

```text
Queue dry-run tooling
and
future PgQueueRepository implementation
```

It does not implement the adapter.

It does not run migrations.

It does not import queue data.

It does not make the file-backed queue production-grade.

---

## 2. Current Runtime Reality

Current queue runtime remains file-backed:

```text
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/queueStorageIndex.js
server/services/processLock.js
server/services/resourceLock.js
server/services/database.js
```

Current queue files may exist in both legacy and segmented layouts:

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

Patch 63 dry-run tooling can now inspect these shapes without mutation.

This does not change the runtime queue.

---

## 3. Why This Spike Plan Is Required

A `PgQueueRepository` adapter touches critical operational execution.

Unsafe adapter implementation can cause:

```text
duplicate job execution
lost queue jobs
privacy anonymization replay
payment backfill replay
dead-letter resurrection
idempotency bypass
outbox dispatcher duplication
admin export inconsistency
worker crash recovery gaps
staging/prod database confusion
```

Therefore the adapter must not be written as a casual implementation detail.

It needs explicit policy for:

```text
test database lifecycle
migration tool selection
schema ownership
adapter feature flags
contract test extension
concurrency tests
dry-run gate
rollback posture
production block conditions
```

---

## 4. Design Decision

Before implementing `PgQueueRepository`, Yawmia must define and follow a PostgreSQL adapter spike plan.

The spike must be:

```text
development/staging only
test database only
contract-test driven
feature-flagged
no production data mutation
no queue import
no queue worker cutover
no dual-write hidden behavior
no microservices split
```

The first PostgreSQL queue adapter work should prove technical feasibility, not production readiness.

---

## 5. Dependency Decision Policy

Adding PostgreSQL runtime dependencies is acceptable only when tied to a real production risk.

Candidate dependencies:

```text
pg
node-pg-migrate
```

Alternative migration tools may be considered:

```text
Knex migrations
Prisma migrations
custom SQL migrations
```

Decision criteria:

```text
minimal runtime footprint
clear migration history
works with Node.js 20+ ESM
easy test DB setup
does not force ORM adoption
supports raw SQL for SKIP LOCKED
low operational surprise
```

Initial recommendation:

```text
Use pg for adapter spike.
Use either node-pg-migrate or plain SQL migration files for schema spike.
Do not introduce a full ORM for the queue spike.
```

This is not a final payment/session/users database decision.

---

## 6. Test Database Policy

`PgQueueRepository` tests must never connect to production.

Required environment variables for adapter tests:

```text
YAWMIA_TEST_DATABASE_URL
YAWMIA_ALLOW_DB_TESTS=true
```

Tests must refuse to run if:

```text
YAWMIA_ALLOW_DB_TESTS is not true
database URL is missing
database name does not clearly indicate test/dev
database URL points to a known production host
NODE_ENV=production
```

Recommended DB name pattern:

```text
yawmia_test
yawmia_dev
yawmia_ci
```

Forbidden DB name indicators:

```text
prod
production
main
primary
live
```

Adapter tests must be skipped or fail-safe by default.

No developer should accidentally run queue adapter tests against production data.

---

## 7. Schema Migration Policy

The first queue schema migration must be explicit and reversible in development.

Minimum schema target comes from:

```text
docs/architecture/DB_BACKED_QUEUE_MINIMUM_DESIGN.md
```

Minimum tables:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
```

The spike migration may create only these queue tables.

It must not create or modify:

```text
users
sessions
payments
ledger
receipts
jobs
applications
messages
privacy_requests
outbox_events
```

A queue spike migration must not be bundled with unrelated PostgreSQL core migrations.

---

## 8. Adapter Flag Policy

Future runtime flags should exist before activation:

```text
QUEUE_ADAPTER=file_json | postgres
QUEUE_POSTGRES_ENABLED=false | true
QUEUE_FILE_WRITES_ENABLED=true | false
QUEUE_WORKERS_ENABLED=true | false
```

Default production posture before cutover:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
```

During adapter spike:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
```

Adapter tests may instantiate `PgQueueRepository` directly.

Server runtime must not switch to it unless a later approved patch explicitly does so.

---

## 9. No Hidden Dual-write

Do not silently dual-write queue jobs to files and PostgreSQL.

Dual-write creates false confidence and ambiguous source of truth.

If shadow metrics are needed later, they must be explicit:

```text
QUEUE_SHADOW_READS_ENABLED=true
QUEUE_SHADOW_WRITES_ENABLED=false
```

But Patch 64 does not introduce shadow mode.

---

## 10. Queue Backfill Dry-run Gate

No queue import or cutover is allowed before a dry-run report exists.

Required command before any future import planning:

```bash
node scripts/queue-backfill-dry-run.js --json --include-previews
```

The report must be reviewed for:

```text
corruptJobCount
duplicateJobIdCount
activeRunningJobCount
invalidRunningJobCount
unknownStatusCount
unknownTypeCount
oversizedPayloadCount
orphanIdempotencyRecordCount
duplicateIdempotencyKeyCount
summary.summaryMismatchCount
```

A future import must be blocked if:

```text
corruptJobCount > 0
activeRunningJobCount > 0
unknownStatusCount > 0
oversizedPayloadCount > 0 for pending/running jobs
duplicateJobIdCount has unresolved active ambiguity
```

Patch 64 does not import queue data.

---

## 11. Adapter Scope

The first `PgQueueRepository` adapter may implement only the contract from:

```text
server/repositories/queueRepository.contract.js
```

Required contract groups:

```text
QueueRepository
QueueAttemptRepository
QueueIdempotencyRepository
QueueWorkerRegistry
QueueTransactionManager
```

The first adapter spike should focus on:

```text
enqueue
findById
findByIdempotencyKey
listByStatus
claimDue
markCompleted
markFailed
markDeadLetter
retry
cancel
recoverExpiredLeases
getStats
```

It should not implement unrelated domain logic.

---

## 12. Contract Test Strategy

Existing contract tests are structural and runtime-neutral.

Future adapter tests must add behavior tests:

```text
idempotent enqueue returns existing job
claimDue uses SKIP LOCKED semantics
two concurrent workers do not claim same job
markCompleted finalizes job once
markFailed schedules retry with backoff
max attempts moves job to dead_letter
cancel prevents execution
retry dead_letter returns to pending
recoverExpiredLeases handles stale running jobs
attempt rows are persisted
worker registry heartbeat is visible
```

These tests must use a test PostgreSQL database only.

They must not mutate `./data`.

---

## 13. Transaction Policy

Queue adapter spike should prepare for transaction-scoped enqueue.

The future `QueueTransactionManager` must support:

```text
withTransaction
withReadOnlyTransaction
```

Transaction-scoped enqueue is required later for:

```text
privacy request queued
payment backfill requested
outbox dispatch scheduling
migration/rehearsal jobs
```

Patch 64 does not implement a runtime transaction manager.

---

## 14. Worker Policy

Do not switch `queueWorkers.js` to PostgreSQL in the adapter spike.

Future worker migration should happen after:

```text
PgQueueRepository adapter behavior tests pass
lease recovery tests pass
idempotency tests pass
dead-letter tests pass
backfill dry-run report is reviewed
staging shadow/limited job type plan is approved
```

Initial adapter tests can call adapter methods directly.

Do not run worker loops against PostgreSQL during the spike.

---

## 15. Outbox Relationship

DB-backed queue is not the durable outbox.

The adapter spike must not create an outbox dispatcher.

Future relation:

```text
outbox_events = durable domain facts
ops_queue_jobs = background execution work
```

The queue adapter must not invent or reconstruct business events.

Queue backfill must not become outbox backfill.

---

## 16. Privacy Job Policy

Privacy jobs are high-risk.

The future adapter must support them reliably, but the spike must not execute them.

High-risk job types:

```text
privacy_user_data_export
privacy_user_anonymization
```

Future tests must ensure:

```text
privacy jobs can be enqueued idempotently
privacy jobs can fail safely
privacy jobs preserve attempt history
privacy jobs do not execute without handler/approval context
```

Patch 64 does not execute privacy jobs.

---

## 17. Payment Job Policy

Payment migration/backfill jobs are financial-risk jobs.

The future adapter must preserve:

```text
attempt history
idempotency
dead-letter state
operator retry audit
```

Patch 64 does not:

```text
write ledger entries
issue receipts
run payment reconciliation
complete payments
```

---

## 18. Data Import Policy

A future queue import must be separate from the adapter spike.

Future import tool name should be separate:

```text
scripts/queue-backfill-import.js
```

It must not be added in Patch 64.

Future import must require:

```text
dry-run report
admin approval
staging rehearsal
database backup reference
file-backed queue backup reference
rollback plan
quiet worker state
```

Patch 64 explicitly forbids queue import.

---

## 19. Rollback Policy

Adapter spike rollback is simple:

```text
do not enable adapter in runtime
drop test DB tables if needed
remove test DB
keep file-backed queue runtime unchanged
```

Future cutover rollback must reset:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
QUEUE_WORKERS_ENABLED=true
```

Do not delete legacy queue files during adapter spike.

---

## 20. Observability Requirements

Before runtime cutover, PostgreSQL queue must expose metrics for:

```text
jobs by status
jobs by type
oldest pending age
running count
stale running count
dead-letter count
failure rate
attempt count
p95 job duration
p95 queue latency
retry count
admin retry count
admin cancel count
```

Patch 64 does not implement these metrics.

---

## 21. CI Policy

Default CI should not require a PostgreSQL service unless explicitly configured.

Allowed approaches:

```text
skip DB adapter tests unless YAWMIA_ALLOW_DB_TESTS=true
run structural contracts always
run dry-run script tests always
run Pg adapter behavior tests only in DB-enabled workflow
```

This prevents local and CI false failures.

---

## 22. Production Block Conditions

Do not enable PostgreSQL queue runtime if any of these are true:

```text
dry-run report has active running jobs
dry-run report has corrupt queue JSON
dry-run report has unresolved duplicate active job IDs
dry-run report has unknown active statuses
PgQueueRepository contract tests fail
concurrent claim test fails
lease recovery test fails
idempotency test fails
dead-letter retry test fails
rollback rehearsal missing
admin approval missing
```

---

## 23. AI Boundary

AI may assist with:

```text
summarizing queue dry-run reports
drafting operator notes
explaining adapter test failures
reviewing migration plans
```

AI must not:

```text
claim queue jobs
retry queue jobs
cancel queue jobs
complete queue jobs
approve imports
execute migrations
select production cutover timing
mutate privacy/payment/session data
```

All queue transitions must remain deterministic, auditable, and transaction-backed.

---

## 24. What Must Not Happen

Do not:

```text
implement PgQueueRepository in this patch
run queue migrations in this patch
run queue import in this patch
enable DB-backed queue runtime in this patch
start DB-backed workers in this patch
write PostgreSQL rows in this patch
delete legacy queue files in this patch
repair queue summary in this patch
drain queue in this patch
retry/cancel/complete jobs in this patch
introduce Redis in this patch
split queue into a separate service in this patch
use AI as queue migration decision-maker
claim production readiness from this plan
```

---

## 25. Recommended Future Sequence

Recommended order after Patch 64:

```text
1. Keep file-backed queue runtime unchanged.
2. Run queue-backfill-dry-run on temp/staging data.
3. Define PostgreSQL test DB bootstrap.
4. Add queue schema migration in dev/test only.
5. Implement PgQueueRepository behind inactive runtime flag.
6. Add DB adapter behavior tests.
7. Add concurrency claim tests.
8. Add lease recovery tests.
9. Add idempotency tests.
10. Add dead-letter retry/cancel tests.
11. Add staging-only shadow/limited job type plan.
12. Only then discuss import/cutover.
```

---

## 26. Success Criteria for Adapter Spike

The adapter spike is successful only if:

```text
no production data is touched
no runtime flag switches server to PostgreSQL
contract tests still pass
DB adapter tests pass against test database
concurrency claim test proves no duplicate claim
lease recovery test passes
idempotent enqueue test passes
dead-letter retry test passes
attempt history test passes
dry-run report remains separate and no-mutation
rollback is a flag reset / test DB cleanup only
```

---

## 27. Final Decision

Yawmia should not implement or enable `PgQueueRepository` until this adapter spike policy is accepted.

The correct direction remains:

```text
Refactor First
Modular Monolith First
Dry-run Before Import
Adapter Spike Before Runtime Switch
PostgreSQL Core Target
DB-backed Queue Target
Durable Outbox Later
Payment Ledger Later
Privacy Action Log Later
DB-backed Sessions Later
No False Confidence
No Microservices Yet
No AI Data Gateway
```
