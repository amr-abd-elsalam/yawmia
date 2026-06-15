# PostgreSQL Durable Outbox Migration Scaffold

> Project: يوميّة — Yawmia  
> Patch direction: Patch 85  
> Status: Static SQL scaffold only  
> Runtime status: Not executed  
> Adapter status: PgOutboxRepository not implemented  
> Dispatcher status: OutboxDispatcher runtime not implemented  
> Event runtime: EventBus remains in-memory  
> Payment runtime: still file-backed mutable payment projections  

## Purpose

This directory contains static PostgreSQL durable outbox schema scaffold files for future DB-backed outbox work.

It is migration preparation only.

These SQL files are not executed by this patch.

It does not:

```text
install pg
install node-pg-migrate
open a database connection
execute migrations
implement PgOutboxRepository
implement OutboxRepository runtime
implement OutboxDispatcher runtime
activate durable outbox runtime
replace EventBus
insert outbox events
dispatch outbox events
dual-write events
touch production data
```

## Current Files

```text
001_create_outbox_tables.sql
```

## Allowed Scope

The outbox schema scaffold may define only future outbox infrastructure:

```text
outbox_events
outbox_dispatch_attempts
```

It must not create or alter unrelated domain/runtime tables such as:

```text
payments
payment_ledger_entries
payment_disputes
receipt_sequences
receipts
users
sessions
jobs
applications
direct_offers
messages
workrooms
notifications
privacy_requests
privacy_action_log
audit
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
ops_queue_workers
```

## Execution Policy

Do not run these SQL files automatically from:

```text
server.js
server/router.js
server/services/payments.js
server/services/jobs.js
server/services/applications.js
server/services/directOffer.js
server/services/eventBus.js
server/services/opsQueue.js
queueWorkers.js
schedulerRegistry.js
smoke tests
docs tests
contract tests
adapter harness tests
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

## Relationship to Payment Outbox Coupling

This scaffold supports the future requirements documented in:

```text
docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md
docs/architecture/PAYMENT_OUTBOX_COUPLING_BEHAVIOR_MATRIX.md
docs/architecture/PAYMENT_WORKFLOW_TRANSACTION_BOUNDARY_MATRIX.md
```

Required future invariant:

```text
if payment/ledger/receipt/dispute/audit/approval state commits, its required outbox event commits
if required outbox insert fails, the entire payment workflow rolls back
```

This scaffold does not implement that invariant today.

It only documents a future schema shape.

## EventBus Boundary

Current runtime EventBus is still in-memory.

Future rule:

```text
EventBus is not financial event truth.
EventBus may only publish after durable outbox commit or dispatcher delivery.
```

This scaffold does not replace EventBus.

## Dispatcher Policy

Future dispatcher behavior must include:

```text
claim pending events atomically
mark processing with lease
mark processed only after send succeeds
retry failed events with backoff
move poison events to dead_letter after max attempts
preserve lastError without secrets
support replay by aggregate
support manual retry
```

This scaffold does not implement dispatcher runtime.

## Payload Privacy Policy

Outbox payloads must not include:

```text
raw tokens
session tokens
authorization headers
API keys
passwords
VAPID private keys
raw verification images
raw base64 documents
```

Payment payloads may include stable IDs and financial references, but must minimize sensitive user details.

## Future DB Behavior Tests

Future outbox adapter DB tests must remain blocked unless:

```text
YAWMIA_ALLOW_DB_TESTS=true
YAWMIA_TEST_DATABASE_URL=postgres://.../yawmia_test
```

and the guard passes.

Expected future harness:

```text
tests/adapters/outbox-repository.harness.test.js
```

It must not connect before guard approval.

## Final Position

This directory is a scaffold.

It proves only that a future durable outbox schema shape is documented as static SQL.

It does not prove:

```text
PostgreSQL is installed
schema exists in any database
PgOutboxRepository exists
OutboxRepository runtime exists
OutboxDispatcher exists
durable outbox runtime is active
payment events are durable
EventBus has been replaced
payment workflow transaction coupling exists
receipt issuance is durable
production readiness
finance readiness
```
