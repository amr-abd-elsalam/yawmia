# PostgreSQL Payment Ledger Migration Scaffold

> Project: يوميّة — Yawmia  
> Patch direction: Patch 76  
> Status: Static SQL scaffold only  
> Runtime status: Not executed  
> Adapter status: PgPaymentRepository / PaymentLedgerRepository not implemented  
> Payment runtime: still file-backed mutable payment projections  
> Receipt runtime: still on-demand, not persisted transactionally

## Purpose

This directory contains static PostgreSQL payment ledger schema scaffold files for future DB-backed payment ledger work.

It is migration preparation only.

These SQL files are not executed by this patch.

It does not:

```text
install pg
install node-pg-migrate
open a database connection
execute migrations
implement PgPaymentRepository
implement PaymentLedgerRepository runtime
implement ReceiptRepository runtime
activate PostgreSQL payment runtime
activate payment ledger runtime
persist receipts
allocate receipt numbers at runtime
import file-backed payments
backfill ledger entries
generate receipts
dual-write payments
touch production data
```

## Current Files

```text
001_create_payment_ledger_tables.sql
```

## Allowed Scope

The payment ledger schema scaffold may define only future payment/ledger/receipt infrastructure:

```text
payments
payment_ledger_entries
payment_disputes
receipt_sequences
receipts
```

It must not create or alter unrelated domain/runtime tables such as:

```text
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
outbox_events
```

Outbox storage is intentionally not created in this scaffold.

Durable outbox remains a separate migration/runtime concern.

## Execution Policy

Do not run these SQL files automatically from:

```text
server.js
server/router.js
server/services/payments.js
server/services/jobs.js
server/services/financialExport.js
server/handlers/paymentsHandler.js
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

## Dry-run Before Ledger Import

Before any future payment ledger import:

```bash
node scripts/payment-backfill-dry-run.js --json --include-previews
```

The report must have:

```text
severity != critical
importBlockerCount=0
importGate.canProceedToLedgerBackfill=true
mutationPerformed=false
```

Finance/admin approvals are still required for:

```text
legacy receipt gap
disputed payment import policy
non-completed job payment policy
duplicate payment canonical selection
legacy mutable payment state policy
reconciliation override policy
```

## Receipt Policy

This scaffold defines future receipt persistence tables only.

It does not:

```text
issue receipts
allocate receipt numbers
backfill old receipts
claim historical receipt issuance
replace generateReceipt()
```

Retroactive receipt issuance remains blocked until explicit finance/legal/admin policy exists.

## Append-only Ledger Policy

`payment_ledger_entries` is intended to be append-only.

This scaffold includes static trigger definitions to prevent update/delete once the SQL is executed in a future migration.

Because this file is static/not executed now, it does not enforce runtime behavior today.

## Final Position

This directory is a scaffold.

It proves only that a future payment ledger schema shape is documented as static SQL.

It does not prove:

```text
PostgreSQL is installed
schema exists in any database
PaymentLedgerRepository exists
PgPaymentRepository exists
receipt persistence exists
receipt sequences are allocated
ledger import works
financial reconciliation passed
production readiness
```
