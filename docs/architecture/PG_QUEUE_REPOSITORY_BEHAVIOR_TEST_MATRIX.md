# PgQueueRepository Behavior Test Matrix

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 66  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL-backed queue target  
> Builds on: `docs/architecture/DB_BACKED_QUEUE_MINIMUM_DESIGN.md`  
> Builds on: `docs/architecture/QUEUE_BACKFILL_DRY_RUN_DESIGN.md`  
> Builds on: `docs/architecture/POSTGRESQL_QUEUE_ADAPTER_SPIKE_PLAN.md`  
> Builds on: `server/repositories/queueRepository.contract.js`  
> Builds on: `server/repositories/postgresTestDatabaseGuard.contract.js`  
> Non-goal: No PgQueueRepository implementation in this patch  
> Non-goal: No pg dependency in this patch  
> Non-goal: No PostgreSQL connection in this patch  
> Non-goal: No schema migration execution  
> Non-goal: No queue import execution  
> Non-goal: No queue worker replacement  
> Non-goal: No production data mutation  
> Non-goal: No Redis dependency  
> Non-goal: No external queue dependency  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This document defines the required behavior test matrix for a future `PgQueueRepository` adapter.

Patch 60 defined the DB-backed queue target.

Patch 61 defined the queue repository contracts.

Patch 62 defined the queue backfill dry-run design.

Patch 63 added the no-mutation queue backfill dry-run script skeleton and tests.

Patch 64 defined the PostgreSQL queue adapter spike and test database policy.

Patch 65 added a runtime-neutral PostgreSQL test database safety guard.

Patch 66 prevents the next step from becoming a shallow adapter implementation that only satisfies structural contracts while missing the queue-grade behavior required for production.

This document does not implement the adapter.

---

## 2. Current Runtime Reality

Current runtime queue remains file-backed:

```text
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/queueStorageIndex.js
server/services/processLock.js
server/services/resourceLock.js
server/services/database.js
```

The future DB-backed adapter does not exist yet:

```text
PgQueueRepository: not implemented
PostgreSQL queue schema: not migrated runtime
DB-backed queue workers: not implemented
queue import: not implemented
queue cutover: not approved
```

---

## 3. Why Behavior Tests Are Required

The existing `QueueRepository` contract tests verify structural method presence only.

Structural validation is useful, but insufficient.

A fake object can satisfy:

```text
enqueue
claimDue
markCompleted
markFailed
recoverExpiredLeases
```

without proving:

```text
idempotent enqueue correctness
SKIP LOCKED claim isolation
lease recovery safety
attempt history persistence
dead-letter semantics
retry/cancel correctness
transaction-scoped enqueue
concurrent worker safety
```

A future `PgQueueRepository` must pass behavior tests before any runtime queue switch.

---

## 4. Design Decision

Yawmia must define and maintain a behavior test matrix for any future PostgreSQL queue adapter.

No `PgQueueRepository` implementation should be merged unless:

```text
the test DB safety guard is used
the schema is isolated to a test database
the adapter passes structural contracts
the adapter passes behavior tests
no production DB is touched
no file-backed runtime queue is switched
```

---

## 5. Test DB Guard Requirement

Every future PostgreSQL adapter behavior test must call the guard from:

```text
server/repositories/postgresTestDatabaseGuard.contract.js
```

Before any database connection is attempted, tests must assert:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL is present
NODE_ENV is not production
database name contains test/dev/ci
database name does not contain prod/production/main/primary/live
host does not contain prod/production/main/primary/live
```

If the guard fails, DB tests must skip or fail-safe before connecting.

Patch 66 does not connect to a database.

---

## 6. Minimum Behavior Test Categories

Future `PgQueueRepository` adapter tests must cover:

```text
schema smoke
enqueue
idempotent enqueue
find
list
claimDue
concurrent claim
markRunning
markCompleted
markFailed
retry/backoff
dead-letter
cancel
recoverExpiredLeases
attempt lifecycle
idempotency lifecycle
worker registry
transaction-scoped enqueue
read-only transaction behavior
stats
cleanup
```

---

## 7. Schema Smoke Tests

Required tests:

```text
ops_queue_jobs table exists
ops_queue_attempts table exists
ops_queue_idempotency table exists
required indexes exist or claim query plan is acceptable
status constraints reject invalid statuses
priority constraints reject invalid priorities
payload_json cannot be null
attempts cannot be negative
max_attempts must be positive
```

Non-goals:

```text
no users table
no payments table
no privacy table
no outbox table
no domain migration
```

---

## 8. Enqueue Behavior Tests

Required tests:

```text
enqueue creates pending job
enqueue sets created_at and updated_at
enqueue stores type, priority, payload, created_by
enqueue applies default max_attempts and backoff_ms
enqueue rejects oversized payload
enqueue rejects missing type
enqueue normalizes invalid priority to normal or rejects according to policy
enqueue sets next_run_at to now unless provided
```

Required assertions:

```text
job status = pending
attempts = 0
lease_until is null
locked_by is null
cancel_requested = false
```

---

## 9. Idempotent Enqueue Tests

Required tests:

```text
same idempotency key returns existing pending job
same idempotency key returns existing running job
same idempotency key returns existing completed job
expired idempotency key allows new job
idempotency record is created transactionally with job
idempotency record points to job_id
idempotency key lookup does not expose raw secret-like data in logs
```

Required failure-mode test:

```text
if job insert fails, idempotency record must not remain orphaned
```

---

## 10. Find/List Tests

Required tests:

```text
findById returns job by id
findById returns null for missing job
findByIdempotencyKey returns related job
listByStatus filters status
listByStatus supports pagination
listByStatus can filter by type
listByStatus sorts deterministically
```

No full production-like scan should be required for normal admin queue views.

---

## 11. Claim Due Tests

Required tests:

```text
claimDue claims pending due jobs
claimDue ignores future next_run_at jobs
claimDue ignores cancelled jobs
claimDue ignores completed jobs
claimDue ignores dead_letter jobs
claimDue respects priority ordering
claimDue respects next_run_at ordering
claimDue respects created_at ordering as final tie-break
claimDue sets status running
claimDue sets locked_by
claimDue sets lease_until
claimDue increments attempts
claimDue creates attempt started row
```

Required invariant:

```text
claimed job must not remain pending after commit
```

---

## 12. Concurrent Claim Tests

Required tests:

```text
two workers claiming concurrently never receive the same job
claimDue uses row-level locking semantics equivalent to FOR UPDATE SKIP LOCKED
claimDue with limit N returns at most N jobs per worker
jobs are distributed across concurrent claimers without duplication
```

This is the most important DB-backed queue behavior.

A future adapter that cannot pass this test must not be used.

---

## 13. Mark Running Tests

If `claimDue` already marks jobs running, `markRunning` may be a lower-level lifecycle method.

Required tests:

```text
markRunning transitions pending to running
markRunning sets locked_by
markRunning sets lease_until
markRunning increments attempts only once according to adapter policy
markRunning refuses completed/dead_letter jobs
markRunning creates or updates attempt start record according to adapter policy
```

---

## 14. Mark Completed Tests

Required tests:

```text
markCompleted transitions running to completed
markCompleted clears lease_until
markCompleted clears locked_by
markCompleted stores result_json
markCompleted sets completed_at
markCompleted updates updated_at
markCompleted completes latest attempt row
markCompleted is idempotent or safely rejects repeated completion
```

Required invariant:

```text
completed job must not be claimable again
```

---

## 15. Mark Failed / Retry Tests

Required tests:

```text
markFailed on retryable running job returns it to pending
markFailed stores sanitized last_error
markFailed clears lease fields
markFailed sets failed_at or failure timestamp according to schema policy
markFailed computes next_run_at with bounded exponential backoff
markFailed updates latest attempt row to failed
markFailed increments failure metrics through stats
```

Required max attempt behavior:

```text
when attempts >= max_attempts, markFailed moves job to dead_letter
```

---

## 16. Dead-letter Tests

Required tests:

```text
markDeadLetter transitions job to dead_letter
markDeadLetter preserves payload_json
markDeadLetter preserves type
markDeadLetter preserves attempts
markDeadLetter preserves last_error
markDeadLetter sets dead_lettered_at
markDeadLetter clears lease fields
markDeadLetter marks latest attempt as dead_lettered when appropriate
dead_letter job is not claimable
```

Admin retry behavior:

```text
retry dead_letter job moves it to pending
retry can optionally reset attempts
retry preserves historical attempts
retry clears dead_lettered_at according to adapter policy
```

---

## 17. Cancel Tests

Required tests:

```text
cancel pending job transitions to cancelled
cancel running job transitions to cancelled or marks cancel_requested according to policy
cancel completed job is rejected
cancel dead_letter job is rejected unless explicit retry/cancel policy exists
cancel clears lease fields
cancel sets cancelled_at
cancel preserves payload
cancelled job is not claimable
```

Admin cancel must be auditable later.

Adapter tests may assert state only; audit integration belongs to service-level tests.

---

## 18. Recover Expired Leases Tests

Required tests:

```text
recoverExpiredLeases finds running jobs with lease_until < now
recoverExpiredLeases returns retryable jobs to pending
recoverExpiredLeases dead-letters exhausted jobs
recoverExpiredLeases clears locked_by
recoverExpiredLeases clears lease_until
recoverExpiredLeases sets next_run_at for retryable jobs
recoverExpiredLeases records attempt failure or recovery metadata
recoverExpiredLeases does not touch active running jobs
```

Required concurrency invariant:

```text
recoverExpiredLeases must not race with active claim/complete paths in a way that duplicates execution.
```

---

## 19. Attempt Lifecycle Tests

Required tests:

```text
startAttempt creates attempt row
completeAttempt completes attempt row
failAttempt stores sanitized error
markDeadLettered records dead-letter attempt status
listAttemptsByJob returns attempts ordered by attempt_number
attempt_number is monotonic per job
attempt rows are not overwritten by later attempts
```

Attempt history is essential because file-backed queue currently infers attempts from mutable job fields.

---

## 20. Idempotency Repository Tests

Required tests:

```text
create idempotency record
findByKey returns record
findByJobId returns record
expire marks or removes according to policy
cleanupExpired removes expired records
duplicate key is rejected or returns existing record
idempotency record cannot point to missing job within same transaction
```

---

## 21. Worker Registry Tests

Required tests:

```text
registerWorker creates worker row
heartbeat updates heartbeat_at
markStopped sets stopped_at
listActiveWorkers excludes stopped/stale workers
worker registry is observability only
worker registry is not treated as distributed consensus
```

---

## 22. Transaction Tests

Required tests:

```text
withTransaction commits queue job and idempotency together
withTransaction rolls back both job and idempotency if callback throws
withTransaction supports post-commit hook if shared TransactionManager policy requires it
withReadOnlyTransaction rejects write attempts or uses read-only DB transaction where supported
```

Required future service-level tests:

```text
privacy request queued + queue job inserted atomically
outbox dispatch job inserted after durable event transaction
payment backfill job inserted atomically with migration request
```

Patch 66 does not implement these.

---

## 23. Stats Tests

Required tests:

```text
getStats returns byStatus
getStats returns byType
getStats returns deadLetter count
getStats returns oldest pending age
getStats returns running count
getStats returns stale running count
getStats does not require full table scan for common dashboard fields
```

Stats visibility is not production readiness, but it is necessary for operations.

---

## 24. Cleanup Tests

Required tests:

```text
cleanupExpired idempotency records
cleanup old completed jobs according to retention policy
cleanup old cancelled jobs according to retention policy
cleanup does not delete pending/running jobs
cleanup does not delete dead_letter jobs before retention
cleanup is disabled or dry-run by default in tests unless explicitly scoped to test DB
```

No cleanup test may touch file-backed `./data`.

---

## 25. Backfill Compatibility Tests

Before queue import, adapter tests must support rows shaped from dry-run report decisions.

Future import tests should assert:

```text
legacy pending job maps to pending row
legacy completed job maps to completed row
dead-letter job maps to dead_letter row
idempotency record maps to idempotency row
active running job is skipped
stale running job import requires explicit policy
unknown status is rejected
unknown type is rejected or archived according to policy
oversized payload is rejected
```

Patch 66 does not implement import.

---

## 26. Failure Mode Tests

Required tests:

```text
DB error during enqueue rolls back partial job insert
DB error during idempotency insert rolls back job insert
DB error during claim does not partially claim job
DB error during markCompleted leaves job recoverable or unchanged according to transaction policy
DB error during markFailed does not lose attempt history
```

These tests require real PostgreSQL transaction behavior.

---

## 27. Service Integration Tests Later

After adapter behavior tests pass, service-level tests may cover:

```text
opsQueue service using QueueRepository adapter
queueWorkers loop using repository abstraction
admin retry/cancel handlers using repository abstraction
privacy request queueing using transaction-scoped enqueue
outbox dispatcher using DB queue where appropriate
```

These are later tests.

Patch 66 is pre-adapter.

---

## 28. Runtime Activation Gate

Do not activate DB-backed queue runtime unless all are true:

```text
test DB safety guard exists and passes
queue dry-run report reviewed
schema migration tested in staging
PgQueueRepository structural contract passes
PgQueueRepository behavior matrix passes
concurrent claim tests pass
lease recovery tests pass
idempotency tests pass
dead-letter retry tests pass
attempt history tests pass
rollback plan documented
feature flags default to file_json
admin approval recorded
```

---

## 29. AI Boundary

AI may assist with:

```text
summarizing failed adapter tests
explaining queue dry-run reports
drafting operator notes
reviewing migration plans
```

AI must not:

```text
run adapter tests against a database
select production database
approve DB test safety
claim jobs
retry jobs
cancel jobs
complete jobs
approve import
execute migrations
decide cutover
```

---

## 30. What Must Not Happen

Do not:

```text
write PgQueueRepository before this matrix is accepted
add pg dependency in this patch
connect to PostgreSQL in this patch
run schema migrations in this patch
run queue import in this patch
switch queue runtime in this patch
start DB-backed queue workers in this patch
dual-write file and DB queue jobs silently
delete legacy file-backed queue jobs
claim production readiness from structural contract tests
claim production readiness from this matrix
```

---

## 31. Recommended Future Test File Names

Future behavior tests may use:

```text
tests/adapters/pg-queue-repository.enqueue.test.js
tests/adapters/pg-queue-repository.claim.test.js
tests/adapters/pg-queue-repository.lifecycle.test.js
tests/adapters/pg-queue-repository.idempotency.test.js
tests/adapters/pg-queue-repository.attempts.test.js
tests/adapters/pg-queue-repository.recovery.test.js
tests/adapters/pg-queue-repository.transactions.test.js
```

Every DB-backed adapter test must use the PostgreSQL test database guard before connecting.

---

## 32. Final Decision

The future `PgQueueRepository` must be behavior-test driven.

Structural contract compliance is necessary but not sufficient.

The correct next implementation order remains:

```text
1. keep file-backed queue runtime unchanged
2. preserve queue backfill dry-run tooling
3. preserve PostgreSQL test DB guard
4. define behavior matrix
5. decide pg + migration tooling explicitly
6. add schema in test/staging only
7. implement PgQueueRepository behind inactive flag
8. pass behavior tests
9. run queue dry-run and review
10. only then discuss import/cutover
```

No runtime queue migration is approved by this document.
