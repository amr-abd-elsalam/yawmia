# PostgreSQL Queue Migration Scaffold

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 68  
> Status: Migration scaffold / static policy preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL-backed queue target  
> Builds on: `docs/architecture/DB_BACKED_QUEUE_MINIMUM_DESIGN.md`  
> Builds on: `docs/architecture/QUEUE_BACKFILL_DRY_RUN_DESIGN.md`  
> Builds on: `docs/architecture/POSTGRESQL_QUEUE_ADAPTER_SPIKE_PLAN.md`  
> Builds on: `docs/architecture/PG_QUEUE_REPOSITORY_BEHAVIOR_TEST_MATRIX.md`  
> Builds on: `docs/architecture/POSTGRESQL_QUEUE_DEPENDENCY_MIGRATION_ADR.md`  
> Builds on: `server/repositories/queueRepository.contract.js`  
> Builds on: `server/repositories/postgresTestDatabaseGuard.contract.js`  
> Non-goal: No `pg` dependency installation in this patch  
> Non-goal: No `node-pg-migrate` dependency installation in this patch  
> Non-goal: No PostgreSQL connection in this patch  
> Non-goal: No schema migration execution  
> Non-goal: No `PgQueueRepository` implementation  
> Non-goal: No queue import execution  
> Non-goal: No queue worker replacement  
> Non-goal: No runtime queue adapter activation  
> Non-goal: No production data mutation  
> Non-goal: No hidden dual-write  
> Non-goal: No durable outbox runtime  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This scaffold defines the safe file, schema, test, and runtime-boundary conventions for a future PostgreSQL-backed queue migration.

Patch 67 decided:

```text
PostgreSQL client: pg
Migration tool: node-pg-migrate
Schema location: migrations/postgres/queue
Test DB guard: required before any DB connection
Behavior gate: behavior tests before adapter acceptance
Import gate: dry-run before import
Runtime queue: remains file-backed until later approved cutover
```

Patch 68 does not install dependencies, execute migrations, or implement the adapter.

This document makes the future migration path explicit enough for static policy tests and future implementation discipline.

---

## 2. Current Runtime Reality

The runtime queue remains file-backed:

```text
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/queueStorageIndex.js
server/services/processLock.js
server/services/resourceLock.js
server/services/database.js
```

The active runtime source of truth remains:

```text
data/ops_queue/**
data/metrics/queue/summary.json
```

The future PostgreSQL queue is not active.

No runtime file may import:

```text
PgQueueRepository
pg
node-pg-migrate
```

until a later approved adapter patch.

---

## 3. Scaffold Directory Convention

Future queue migration artifacts should use:

```text
migrations/postgres/queue/
```

Allowed future files:

```text
migrations/postgres/queue/README.md
migrations/postgres/queue/202606130001_create_ops_queue_tables.sql
migrations/postgres/queue/202606130002_add_ops_queue_claim_indexes.sql
```

A future `node-pg-migrate` wrapper may live under:

```text
migrations/postgres/queue/node-pg-migrate/
```

or:

```text
scripts/postgres-queue-migrate.js
```

but it must remain inactive by default and must require the PostgreSQL test database guard before any DB connection.

Patch 68 does not add these migration files.

---

## 4. Schema Scope

The first PostgreSQL queue migration may create only queue infrastructure tables:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
ops_queue_workers
```

It must not create or modify:

```text
users
sessions
jobs
applications
direct_offers
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

Queue migration is operational infrastructure migration, not domain data migration.

---

## 5. Minimum Table Responsibilities

### `ops_queue_jobs`

Responsible for:

```text
job identity
job type
status
priority
payload_json
attempt counters
max attempts
backoff
next_run_at
lease_until
locked_by
cancel_requested
lifecycle timestamps
result_json
last_error
created_by
```

### `ops_queue_attempts`

Responsible for:

```text
durable attempt history
attempt_number
worker_id
started_at
completed_at
failed_at
dead_lettered_at
error
status
```

### `ops_queue_idempotency`

Responsible for:

```text
idempotency key hash
job_id
created_at
expires_at
```

Raw idempotency keys should not be exposed in logs.

### `ops_queue_workers`

Responsible for:

```text
worker visibility
heartbeat_at
started_at
stopped_at
metadata
```

Worker registry is observability, not distributed consensus.

---

## 6. Status Mapping

Future PostgreSQL rows should use stable status names:

```text
pending
running
completed
failed
dead_letter
cancelled
```

File-backed legacy status mapping:

```text
dead-letter -> dead_letter
```

Import tools must not silently invent statuses.

Unknown statuses must be rejected or reported as blockers during dry-run/import planning.

---

## 7. Claim Semantics

Future PostgreSQL queue claim behavior must be equivalent to:

```sql
SELECT id
FROM ops_queue_jobs
WHERE status = 'pending'
  AND next_run_at <= now()
ORDER BY priority_weight DESC, next_run_at ASC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT $1;
```

The adapter must atomically transition claimed jobs to:

```text
status=running
locked_by=<worker id>
lease_until=<future timestamp>
attempts=attempts+1
```

and create an attempt row.

This scaffold does not implement that behavior.

---

## 8. Migration Execution Policy

No PostgreSQL queue migration may run:

```text
during server.js startup
during router import
during queueWorkers start
during scheduler start
during smoke tests
during docs tests
during contract tests
```

Migration execution must be explicit and guarded.

Future DB migration commands must require:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test
```

for DB tests or local adapter test workflows.

Production migrations require a separate future approval/runbook.

---

## 9. Test DB Guard Policy

Patch 68 requires the test DB guard before any DB connection.

Before any future DB connection, code must call:

```text
assertPostgresTestDatabaseSafety(env)
```

from:

```text
server/repositories/postgresTestDatabaseGuard.contract.js
```

The guard must run before:

```text
new pg.Client()
new pg.Pool()
node-pg-migrate execution
schema smoke tests
adapter behavior tests
```

Patch 68 adds no DB connection.

---

## 10. Adapter Location Convention

Future adapter may live at:

```text
server/repositories/pgQueueRepository.js
```

or:

```text
server/repositories/postgres/pgQueueRepository.js
```

The chosen location must be documented in the adapter patch.

Until runtime cutover is approved, the adapter must not be imported by:

```text
server.js
server/router.js
server/services/queueWorkers.js
server/services/opsQueue.js
server/services/schedulerRegistry.js
```

Adapter tests may import it directly only after DB guard passes.

---

## 11. Runtime Flag Convention

Future flags may include:

```text
QUEUE_ADAPTER=file_json | postgres
QUEUE_POSTGRES_ENABLED=false | true
QUEUE_FILE_WRITES_ENABLED=true | false
QUEUE_WORKERS_ENABLED=true | false
```

Default posture remains:

```text
QUEUE_ADAPTER=file_json
QUEUE_POSTGRES_ENABLED=false
QUEUE_FILE_WRITES_ENABLED=true
QUEUE_WORKERS_ENABLED=true
```

Patch 68 does not add or activate runtime flags.

---

## 12. No Hidden Dual-write

Future work must not silently dual-write queue jobs to file-backed JSON and PostgreSQL.

Hidden dual-write causes:

```text
ambiguous source of truth
duplicate execution risk
false confidence
difficult rollback
operator confusion
```

Any future shadow mode must be separately documented and disabled by default.

---

## 13. Queue Backfill Dry-run Gate

Before any queue import planning:

```bash
node scripts/queue-backfill-dry-run.js --json --include-previews
```

must be run and reviewed.

Import planning must explicitly address:

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

Patch 68 does not add queue import tooling.

---

## 14. Future Import Tool Convention

A future import tool, if approved, must be separate from dry-run:

```text
scripts/queue-backfill-import.js
```

It must not reuse `scripts/queue-backfill-dry-run.js` for mutation.

A future import tool must require:

```text
dry-run report reference
admin approval
backup reference
staging rehearsal
quiet queue workers
rollback plan
confirm flag
test/staging DB guard where applicable
```

Patch 68 does not add this import tool.

---

## 15. Behavior Test Gate

Future `PgQueueRepository` implementation must pass the behavior matrix in:

```text
docs/architecture/PG_QUEUE_REPOSITORY_BEHAVIOR_TEST_MATRIX.md
```

Required categories include:

```text
schema smoke
enqueue
idempotent enqueue
find/list
claimDue
concurrent claim
markRunning
markCompleted
markFailed
dead-letter
retry
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

Structural contract tests alone are not enough.

---

## 16. Static Policy Tests

Patch 68 static tests should verify:

```text
scaffold doc exists
scaffold is indexed in docs/README.md
scaffold is cataloged in DOCS_REALITY_CHECK.md
Patch 67 ADR exists
package.json does not install pg/node-pg-migrate in scaffold-only patch
server.js does not import PgQueueRepository/pg/node-pg-migrate
server/router.js does not import PgQueueRepository/pg/node-pg-migrate
queueWorkers.js does not import PgQueueRepository/pg/node-pg-migrate
queue-backfill-dry-run.js remains no-mutation
postgresTestDatabaseGuard remains dependency-free and connection-free
```

These tests are not adapter behavior tests.

They enforce migration discipline only.

---

## 17. Non-goals

Patch 68 must not:

```text
install pg
install node-pg-migrate
create DB connections
execute migrations
create PgQueueRepository
modify queue workers
modify opsQueue runtime
run queue import
run queue repair
run queue drain
retry queue jobs
cancel queue jobs
complete queue jobs
dual-write queue jobs
delete legacy queue files
touch production data
claim DB-backed queue readiness
claim production readiness
```

---

## 18. Rollback

Rollback for Patch 68 is:

```text
remove this scaffold document
remove static policy test
remove references from docs/README.md
remove references from DOCS_REALITY_CHECK.md
```

No data rollback is needed because Patch 68 is no-mutation.

---

## 19. Final Position

This scaffold is a preparation gate.

It proves only:

```text
the migration path is documented
runtime activation is forbidden
static policy can enforce boundaries
```

It does not prove:

```text
PostgreSQL works
pg is installed
migrations run
PgQueueRepository exists
queue import works
queue workers are DB-backed
production is ready
```

The runtime remains file-backed until a later explicitly approved migration/cutover patch.
