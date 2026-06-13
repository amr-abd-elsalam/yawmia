# PostgreSQL Queue Dependency / Migration Tool ADR

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 67  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL-backed queue target  
> Builds on: `docs/architecture/DB_BACKED_QUEUE_MINIMUM_DESIGN.md`  
> Builds on: `docs/architecture/QUEUE_BACKFILL_DRY_RUN_DESIGN.md`  
> Builds on: `docs/architecture/POSTGRESQL_QUEUE_ADAPTER_SPIKE_PLAN.md`  
> Builds on: `docs/architecture/PG_QUEUE_REPOSITORY_BEHAVIOR_TEST_MATRIX.md`  
> Builds on: `server/repositories/queueRepository.contract.js`  
> Builds on: `server/repositories/postgresTestDatabaseGuard.contract.js`  
> Non-goal: No `pg` dependency installation in this patch  
> Non-goal: No migration tool dependency installation in this patch  
> Non-goal: No PostgreSQL connection in this patch  
> Non-goal: No schema migration execution  
> Non-goal: No `PgQueueRepository` implementation  
> Non-goal: No queue import execution  
> Non-goal: No queue worker replacement  
> Non-goal: No runtime queue adapter activation  
> Non-goal: No production data mutation  
> Non-goal: No Redis dependency  
> Non-goal: No external queue dependency  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This ADR records the dependency and migration-tool decision for the future PostgreSQL-backed queue work.

Patch 60 defined the DB-backed queue minimum design.

Patch 61 defined the `QueueRepository` contract seam.

Patch 62 defined the queue backfill dry-run design.

Patch 63 added the no-mutation queue backfill dry-run script and tests.

Patch 64 defined the PostgreSQL queue adapter spike plan and test database policy.

Patch 65 added the dependency-free PostgreSQL test database safety guard.

Patch 66 defined the required behavior test matrix for a future `PgQueueRepository`.

Patch 67 decides the dependency and migration-tool posture required before Patch 68 can introduce migration scaffold or static enforcement tests.

This document does not implement PostgreSQL runtime.

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

Current operational queue files remain under:

```text
data/ops_queue
data/ops_queue/pending
data/ops_queue/running
data/ops_queue/completed
data/ops_queue/failed
data/ops_queue/cancelled
data/ops_queue/dead-letter
data/ops_queue/idempotency
data/metrics/queue/summary.json
```

Current repository state must remain:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
QUEUE_WORKERS_ENABLED=true
```

No runtime adapter switch is approved by this ADR.

---

## 3. Decision Summary

Yawmia will target PostgreSQL for the future operational queue adapter.

The future queue adapter dependency decision is:

```text
PostgreSQL client: pg
Migration tool: node-pg-migrate
Schema style: explicit SQL migrations owned by the queue adapter scope
Runtime activation: forbidden until a later approved patch
```

Patch 67 does not install these dependencies.

Dependency installation belongs to a later scaffold or adapter-test patch after static policy tests are in place.

---

## 4. Dependency Decision

The selected PostgreSQL client for future queue adapter work is:

```text
pg
```

Reason:

```text
minimal dependency footprint
works with Node.js 20+ ESM
supports direct SQL
supports transactions
supports row-level locking
supports FOR UPDATE SKIP LOCKED
does not force ORM adoption
fits modular monolith repository adapter style
```

Rejected for the queue adapter spike:

```text
full ORM adoption
Redis queue dependency
external hosted queue dependency
microservice queue split
AI data gateway
```

This decision is scoped to the queue adapter spike.

It does not decide the final adapter approach for:

```text
users
sessions
payments
ledger
receipts
messages
workrooms
privacy_action_log
outbox_events
```

---

## 5. Migration Tool Decision

The selected migration tool for the queue schema scaffold is:

```text
node-pg-migrate
```

Reason:

```text
small Node.js migration tool
plain SQL friendly
works without adopting ORM
supports ordered migration files
supports up/down migrations for test and staging workflows
keeps schema history explicit
```

The queue migration must remain isolated from unrelated PostgreSQL core migrations.

Queue migrations may create only queue-scoped tables during the queue adapter spike.

---

## 6. Schema Location Convention

Future queue migrations should live under:

```text
migrations/postgres/queue
```

Future queue migration file names should use an ordered timestamp prefix and queue scope:

```text
migrations/postgres/queue/202606130001_create_ops_queue_tables.sql
migrations/postgres/queue/202606130002_add_ops_queue_claim_indexes.sql
```

A future `node-pg-migrate` wrapper may reference these files or translate them into `node-pg-migrate` migration modules.

The schema scaffold must not be executed automatically by `server.js`.

---

## 7. Minimum Queue Tables

The first queue schema scaffold may define only:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
ops_queue_workers
```

The first queue schema scaffold must not create or modify:

```text
users
sessions
jobs
applications
payments
ledger
receipts
messages
workrooms
notifications
privacy_requests
privacy_action_log
outbox_events
audit
```

Queue schema is operational infrastructure, not domain storage migration.

---

## 8. Required Queue Claim Semantics

The future PostgreSQL queue adapter must support behavior equivalent to:

```sql
SELECT id
FROM ops_queue_jobs
WHERE status = 'pending'
  AND next_run_at <= now()
ORDER BY priority_weight DESC, next_run_at ASC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT $1;
```

This ADR requires behavior tests before runtime activation.

The required behavior matrix remains:

```text
docs/architecture/PG_QUEUE_REPOSITORY_BEHAVIOR_TEST_MATRIX.md
```

Structural contract compliance is necessary but not sufficient.

---

## 9. Test Database Guard Requirement

Every future PostgreSQL queue adapter test must call the guard in:

```text
server/repositories/postgresTestDatabaseGuard.contract.js
```

before any database connection is opened.

Required environment variables:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/yawmia_test
```

The guard must block:

```text
NODE_ENV=production
missing YAWMIA_ALLOW_DB_TESTS=true
missing YAWMIA_TEST_DATABASE_URL
non-PostgreSQL URLs
database names without test/dev/ci
database names containing prod/production/main/primary/live
hosts containing prod/production/main/primary/live
```

Patch 67 does not connect to a database.

---

## 10. CI Policy

Default CI must remain database-free.

Always-run tests:

```text
tests/contracts/*.js
tests/docs/*.js
tests/scripts/queue-backfill-dry-run.test.js
```

Future DB adapter behavior tests must be skipped or fail-safe unless both are set:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL=postgres://user:pass@localhost:5432/yawmia_test
```

The DB guard must run before connection creation.

---

## 11. Package Dependency Policy

Patch 67 must not change `package.json`.

Future dependency patch may add:

```json
{
  "dependencies": {
    "pg": "approved-by-this-adr"
  },
  "devDependencies": {
    "node-pg-migrate": "approved-by-this-adr"
  }
}
```

Exact versions must be selected in the dependency patch.

This ADR approves the dependency direction, not installation in Patch 67.

---

## 12. Runtime Activation Policy

Future runtime flags may include:

```text
QUEUE_ADAPTER=file_json | postgres
QUEUE_POSTGRES_ENABLED=false | true
QUEUE_FILE_WRITES_ENABLED=true | false
QUEUE_WORKERS_ENABLED=true | false
```

Current and default posture remains:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
QUEUE_WORKERS_ENABLED=true
```

Server startup must not run PostgreSQL migrations.

Queue workers must not import or instantiate `PgQueueRepository` until a later approved runtime patch.

---

## 13. No Hidden Dual-write

Do not silently dual-write queue jobs to both file-backed JSON and PostgreSQL.

Hidden dual-write creates ambiguous source of truth and false confidence.

If a future shadow mode is needed, it must be explicit and disabled by default:

```text
QUEUE_SHADOW_READS_ENABLED=false
QUEUE_SHADOW_WRITES_ENABLED=false
```

Patch 67 does not introduce shadow mode.

---

## 14. Queue Backfill Gate

No queue import or cutover is allowed before a dry-run report exists.

Required dry-run command before import planning:

```bash
node scripts/queue-backfill-dry-run.js --json --include-previews
```

The dry-run report must be reviewed for:

```text
corruptJobCount
duplicateJobIdCount
activeRunningJobCount
staleRunningJobCount
invalidRunningJobCount
unknownStatusCount
unknownTypeCount
oversizedPayloadCount
orphanIdempotencyRecordCount
duplicateIdempotencyKeyCount
summary.summaryMismatchCount
```

A future import must be blocked when unresolved active or corrupt records exist.

Patch 67 does not import queue data.

---

## 15. Adapter Implementation Gate

Do not implement `PgQueueRepository` until all are true:

```text
this ADR exists and is indexed
migration scaffold exists
static policy tests pass
postgres test database guard exists
behavior matrix exists
DB tests are skip-by-default
schema smoke tests are defined
queue backfill dry-run remains no-mutation
runtime queue remains file-backed by default
```

Do not activate `PgQueueRepository` until all are true:

```text
structural contracts pass
behavior tests pass
concurrent claim tests pass
lease recovery tests pass
idempotency tests pass
dead-letter retry tests pass
attempt lifecycle tests pass
staging rehearsal passes
rollback plan exists
admin approval exists
```

---

## 16. Rollback Policy

Patch 67 rollback is documentation-only:

```text
remove this ADR
remove references from docs index files
remove static docs tests if added
```

Future adapter rollback must be:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
QUEUE_WORKERS_ENABLED=true
```

Do not delete legacy queue files during adapter spike.

---

## 17. Security and Privacy Policy

Queue adapter work must not weaken existing security posture.

Preserve:

```text
admin query-token disabled by default
admin SSE query token disabled by default
session token hashing at rest
no production DB tests
no production database URL usage
no raw secret logging
```

Privacy jobs must not execute during adapter tests.

High-risk queue types:

```text
privacy_user_data_export
privacy_user_anonymization
payment backfill jobs
ledger reconciliation jobs
outbox dispatch jobs
```

Future tests may enqueue synthetic jobs only in isolated test DB.

---

## 18. Outbox Relationship

The PostgreSQL queue is not the durable outbox.

Future architecture must preserve separation:

```text
outbox_events = durable domain facts
ops_queue_jobs = background execution work
```

Queue import must not invent business events.

Queue adapter spike must not implement outbox dispatcher runtime.

---

## 19. AI Boundary

AI may assist with:

```text
summarizing queue dry-run reports
explaining adapter test failures
drafting operator notes
reviewing migration plans
```

AI must not:

```text
select production DB targets
approve DB safety
run migrations
claim jobs
retry jobs
cancel jobs
complete jobs
approve queue import
decide cutover
act as data gateway
```

All queue behavior must remain deterministic, auditable, and transaction-backed.

---

## 20. What Must Not Happen in Patch 67

Do not:

```text
install pg
install node-pg-migrate
create PgQueueRepository
create PostgreSQL connections
create runtime migration runner
run migrations from server.js
run queue import
run queue repair
run queue drain
switch queue workers
dual-write queue jobs
delete legacy queue files
claim DB-backed queue readiness
claim production readiness
add Redis
split into microservices
add AI data gateway
```

---

## 21. Approved Next Patch

If this ADR is landed and indexed, the next patch may be:

```text
Patch 68 — PostgreSQL Queue Migration Scaffold / Static Policy Tests
```

Patch 68 may add:

```text
docs/architecture/POSTGRESQL_QUEUE_MIGRATION_SCAFFOLD.md
tests/contracts/postgres-queue-migration-policy.test.js
```

Patch 68 still must not:

```text
implement PgQueueRepository
install dependencies unless explicitly scoped to dependency scaffold
execute migrations
connect to PostgreSQL
import queue data
switch runtime queue
```

---

## 22. Final Decision

Yawmia chooses:

```text
pg for future PostgreSQL queue adapter work
node-pg-migrate for future queue migration tooling
explicit queue-scoped migration location
test DB guard before any DB connection
behavior tests before adapter acceptance
dry-run before import
file-backed queue remains runtime source of truth until later approved cutover
```

This ADR is a decision gate.

It is not an implementation.

It is not a migration.

It is not a production approval.
