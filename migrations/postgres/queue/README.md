# PostgreSQL Queue Migration Scaffold

> Project: يوميّة — Yawmia  
> Patch direction: Patch 71  
> Status: Static SQL scaffold only  
> Runtime status: Not executed  
> Adapter status: PgQueueRepository not implemented  
> Queue runtime: still file-backed

## Purpose

This directory contains static PostgreSQL queue schema scaffold files for future DB-backed queue work.

It is migration preparation only.

These SQL files are not executed by this patch.

It does not:

```text
install pg
install node-pg-migrate
open a database connection
execute migrations
implement PgQueueRepository
activate DB-backed queue runtime
import file-backed queue data
replace queue workers
dual-write queue jobs
touch production data
```

## Current Files

```text
001_create_ops_queue_tables.sql
```

## Allowed Scope

The queue schema scaffold may define only operational queue infrastructure:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
ops_queue_workers
```

It must not create or alter domain tables such as:

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

## Execution Policy

Do not run these SQL files automatically from:

```text
server.js
server/router.js
queueWorkers.js
schedulerRegistry.js
smoke tests
docs tests
contract tests
```

Future execution must be explicit, guarded, and environment-specific.

## Test DB Guard

Before any future PostgreSQL connection or migration execution, code must call:

```text
assertPostgresTestDatabaseSafety(env)
```

from:

```text
server/repositories/postgresTestDatabaseGuard.contract.js
```

Required DB test environment:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test
```

## Dry-run Before Import

Before any future queue import:

```bash
node scripts/queue-backfill-dry-run.js --json --include-previews
```

The report must have:

```text
importGate.canProceedToImport=true
importBlockerCount=0
severity != critical
```

Operator approvals are still required for privacy/payment/dead-letter/idempotency risk classes.

## Final Position

This directory is a scaffold.

It proves only that a future queue schema shape is documented as static SQL.

It does not prove:

```text
PostgreSQL is installed
schema exists in any database
PgQueueRepository exists
queue import works
DB-backed workers are active
production readiness
```
