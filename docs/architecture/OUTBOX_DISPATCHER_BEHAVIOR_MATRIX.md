# Outbox Dispatcher Behavior Matrix

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch posture: Patch 86 — static behavior matrix / migration preparation  
> Runtime status: Not implemented  
> Database posture: No DB connection  
> Migration posture: No migration execution  
> Outbox posture: Static SQL scaffold only; no PgOutboxRepository runtime  
> Dispatcher posture: No OutboxDispatcher runtime  
> EventBus posture: Current EventBus remains in-memory and is not durable event truth  
> Queue posture: Current queue runtime remains file-backed  
> Adapter posture: No runtime adapter implementation  
> Mutation posture: No data mutation

---

## 1. Purpose

This document defines the future behavior expectations for a durable outbox dispatcher.

It is a static behavior matrix only.

It does not implement:

```text
OutboxDispatcher
PgOutboxRepository
durable event dispatch runtime
database polling
database connection
migration execution
EventBus replacement
queue replacement
payment workflow rewrite
ledger writes
receipt generation
production activation
```

The goal is to define the behavior that future implementation and DB behavior tests must satisfy before any runtime activation.

---

## 2. Current Runtime Reality

Current runtime remains:

```text
Node.js native HTTP + ESM
file-backed JSON persistence
file-backed ops queue
in-memory EventBus
payments stored as mutable JSON projections
receipts generated on demand
no PostgreSQL runtime
no pg dependency
no node-pg-migrate dependency
no durable outbox runtime
no outbox dispatcher runtime
```

The current EventBus is useful for process-local fanout, but it is not financial event truth.

---

## 3. Future Dispatcher Scope

A future dispatcher may read from `outbox_events` and write dispatch diagnostics to `outbox_dispatch_attempts`.

The dispatcher must treat `outbox_events` as the durable source of event truth.

Allowed future dispatcher responsibilities:

```text
claim pending events atomically
mark processing with lease
send event to registered handler or transport
mark processed only after send succeeds
mark failed after send or handler failure
retry failed events with backoff
recover expired processing leases
move poison events to dead_letter after max attempts
preserve payload and last_error diagnostics
support replay by outbox event id
support replay by aggregate id
publish observability counters
avoid leaking sensitive payload fields
```

Out of scope for this static matrix:

```text
opening a DB connection
running SQL
executing migrations
installing pg
installing node-pg-migrate
creating runtime dispatcher code
activating PgOutboxRepository
replacing EventBus
replacing file-backed queue runtime
mutating payment state
writing ledger rows
issuing receipts
```

---

## 4. Dispatcher State Model

Future dispatcher state values:

| State | Meaning | Future transition owner |
|---|---|---|
| `pending` | Event is durable and waiting for dispatch | Producing workflow / retry scheduler |
| `processing` | Event is leased by a dispatcher instance | Dispatcher claim transaction |
| `processed` | Event was delivered successfully | Dispatcher success path |
| `failed` | Event failed but may retry later | Dispatcher failure path |
| `dead_letter` | Event exceeded retry policy or is poison | Dispatcher failure policy |
| `cancelled` | Event should not dispatch | Operator or policy path |

Required state rules:

```text
pending events are eligible when available_at <= now()
processing events must have lease_until and locked_by
processed events must have processed_at
dead_letter events must preserve last_error
cancelled events must preserve cancellation reason when available
failed events must preserve retry diagnostics
```

Forbidden state shortcuts:

```text
marking processed before send succeeds
dropping failed events without diagnostics
deleting poison events instead of dead-lettering
clearing payload_json during failure handling
treating queue job completion as outbox processed proof
treating EventBus emission as outbox processed proof
```

---

## 5. Claiming and Lease Behavior

Future claim behavior must be atomic.

Required future claim semantics:

```text
claim pending events atomically
FOR UPDATE SKIP LOCKED
status = 'pending'
available_at <= now()
ORDER BY priority DESC, available_at ASC, created_at ASC
set status = 'processing'
set locked_by = dispatcher id
set lease_until = now() + lease duration
increment attempts only inside the claim/send lifecycle policy
commit claim before external send when using poller semantics
```

Lease recovery expectations:

```text
processing events with expired lease_until are recoverable
expired processing events may return to pending or failed according to policy
lease recovery must not delete the outbox event
lease recovery must preserve attempts and last_error
multiple dispatchers must not claim the same unexpired event
```

Concurrency expectations:

```text
concurrent dispatchers must not process the same active lease
claim order should respect priority and availability
claim limit must be enforced
claim transaction must be short
dispatcher crash must leave event recoverable
```

---

## 6. Sending and Handler Registry Behavior

A future dispatcher may call a handler registry or transport adapter.

Required future handler registry behavior:

```text
registerHandler maps event_type to a handler
getHandler returns the handler for event_type
missing handler fails safely
handler failures mark failed or dead_letter according to retry policy
handlers must be idempotent
handlers must tolerate duplicate delivery
handler side effects must not be used as durable financial truth
```

Required send behavior:

```text
send only after event is durably claimed
mark processed only after send succeeds
preserve transport diagnostics in outbox_dispatch_attempts
record dispatcher_id
record attempt_number
record started_at and completed_at
record error text when send fails
record delivery metadata without raw secrets
```

Event ordering posture:

```text
per-aggregate ordering may be required for payment workflows
global ordering is not guaranteed
handlers must tolerate gaps and retries
replay must be explicit and audited in future runtime
```

---

## 7. Retry and Dead Letter Behavior

Required future retry policy:

```text
failed event remains durable
attempts must be tracked
max_attempts must be enforced
retry_backoff controls available_at
last_error must be preserved
poison event payload must move to dead_letter after max attempts
dead_letter threshold exceeded must preserve diagnostics
manual replay from dead_letter requires explicit future approval
```

Required future dead-letter behavior:

```text
dead_letter events are not silently deleted
dead_letter events remain queryable by id
dead_letter events remain queryable by aggregate id
dead_letter events expose last_error
dead_letter events expose attempts
dead_letter review must not leak raw tokens or credentials
```

---

## 8. Crash Scenario Matrix

| Scenario | Required future behavior |
|---|---|
| crash before claim commit | Event remains `pending` and claimable |
| crash after claim before send | Event remains `processing` until lease expires, then recoverable |
| crash before send | Event remains pending or recoverable processing |
| crash during send | Event may retry; handler must tolerate duplicate delivery |
| crash after send before mark processed | Event may dispatch twice; idempotent handlers required |
| crash after mark processed | Event remains `processed`; replay requires explicit operator path |
| dispatcher restarts | Expired leases are recovered safely |
| DB unavailable | No event should be marked processed without durable evidence |
| transport unavailable | Event should fail, back off, and preserve diagnostics |
| missing handler | Event should fail safely and preserve handler-missing diagnostic |

The specific phrase required for future tests:

```text
crash after send before mark processed may cause duplicate delivery
```

Duplicate delivery must be safe because consumers and handlers must be idempotent.

---

## 9. Queue Coupling

A future dispatcher may use DB-backed queue metadata or a direct polling loop.

Queue coupling rules:

```text
outbox event remains financial event truth
queue job id is delivery metadata, not financial truth
queue enqueue failure must not erase outbox event
outbox event remains pending until dispatcher succeeds
DB-backed queue may schedule dispatcher work later
file-backed queue runtime remains current runtime until separately migrated
```

Forbidden queue shortcuts:

```text
claim queue completed means payment event delivered
delete outbox row after queue enqueue
replace durable outbox with queue-only event storage
treat queue retry as outbox retry without persisted outbox status
```

---

## 10. EventBus Boundary

Current EventBus is in-memory.

Future boundary rules:

```text
EventBus is not durable event truth
EventBus may be a local delivery mechanism only after durable outbox event exists
EventBus emission must not occur before durable producing transaction commits
EventBus listeners must tolerate duplicate delivery
EventBus must not be used as receipt issuance proof
EventBus must not be used as ledger import proof
EventBus must not be used as payment completion proof
```

Forbidden EventBus shortcuts:

```text
using EventBus as the only record that payment_completed occurred
using EventBus as the only record that receipt_issued occurred
claiming EventBus delivery equals durable outbox dispatch
replacing outbox_events with process-local fanout
```

---

## 11. Payment Workflow Coupling

Future payment workflows must insert required outbox events in the same transaction as the producing state change.

Required payment/outbox coupling posture:

```text
payment workflow transaction writes payment state
payment workflow transaction writes ledger state
payment workflow transaction writes receipt state when applicable
payment workflow transaction writes required outbox event insertion
if required outbox insert fails, the payment workflow rolls back
dispatcher only sends after durable outbox event exists
dispatcher failure does not roll back already committed payment transaction
```

The dispatcher is not allowed to create missing financial facts.

The dispatcher only delivers facts that were already durably produced.

Required future payment event examples:

```text
payment_created
payment_confirmed
payment_disputed
payment_completed
receipt_issued
payment_backfilled
receipt_backfilled
payment_reconciliation_warning
```

---

## 12. Idempotency and Replay

Idempotency requirements:

```text
idempotency_key must be unique at the outbox storage boundary
duplicate insert must be deterministic
duplicate dispatch must be safe
handlers must be idempotent
replay must not create duplicate financial state
replay must use existing durable outbox event
replay by aggregate id must preserve audit diagnostics
```

Replay requirements:

```text
replay by outbox event id
replay by aggregate id
replay preserves original payload_json
replay records new dispatch attempt
replay does not rewrite financial state
replay is explicit operator action in future runtime
```

---

## 13. Observability Requirements

Future observability metrics should include:

```text
outboxPendingCount
outboxProcessingCount
outboxProcessedCount
outboxFailedCount
outboxDeadLetterCount
outboxCancelledCount
outboxOldestPendingAgeMs
outboxOldestProcessingLeaseAgeMs
outboxDispatchP95Ms
outboxLastProcessedAt
outboxLastDeadLetteredAt
outboxRetryCount
outboxPoisonEventCount
```

Operational dashboards must not imply runtime activation before code exists.

Static metrics names in this document do not prove runtime metrics exist.

---

## 14. Security and Privacy Requirements

Payload and dispatch metadata must avoid:

```text
raw tokens
session tokens
authorization headers
API keys
VAPID private keys
passwords
OTP codes
private keys
unredacted verification assets
full sensitive user profiles
```

Allowed payload posture:

```text
stable ids
payment id
job id
ledger entry id
receipt id
aggregate id
minimal amount and currency details needed for event processing
redacted diagnostics
```

Security requirements:

```text
payload_json must be minimized
last_error must be sanitized
delivery_metadata_json must not contain raw secrets
dead_letter review must avoid leaking credentials
observability labels must avoid high-cardinality sensitive values
```

---

## 15. Runtime Activation Gate

Future dispatcher runtime activation requires all of the following, in separate later patches:

```text
PostgreSQL dependency approval
migration tool approval
static SQL scaffold accepted
migration execution plan accepted
postgres test database guard passes
OutboxRepository DB behavior tests pass
OutboxDispatcher behavior tests pass
TransactionManager behavior tests pass
payment workflow transaction tests pass
payment outbox coupling tests pass
dispatcher crash recovery tests pass
dead-letter and replay tests pass
observability review
security/privacy payload review
rollback rehearsal
cutover rehearsal
operator approval
```

Passing this static matrix does not activate runtime.

---

## 16. Forbidden Shortcuts

Do not:

```text
install pg inside this behavior matrix patch
install node-pg-migrate inside this behavior matrix patch
open DB connection from documentation/static tests
execute SQL migrations implicitly
create an OutboxDispatcher runtime in this patch
create PgOutboxRepository runtime in this patch
replace EventBus in this patch
replace file-backed queue runtime in this patch
claim EventBus is durable
claim queue job equals financial event truth
treat static SQL as executed schema
treat behavior matrix as behavior tests passed
treat harness skeleton as adapter implementation
treat dispatcher matrix as dispatcher implementation
claim payment events are durable at runtime
claim finance readiness from this matrix
claim production approval from this matrix
```

---

## 17. AI Boundary

AI may assist with:

```text
summarizing diagnostics
drafting operator review notes
classifying dead-letter causes
suggesting retry policies for human review
```

AI must not:

```text
dispatch events
mark outbox events processed
issue receipts
complete payments
write ledger entries
run migrations
approve replay
mutate financial state
```

---

## 18. Final Position

This document defines a future dispatcher behavior matrix.

It proves only that dispatcher expectations are documented.

It does not prove:

```text
OutboxDispatcher exists
PgOutboxRepository exists
PostgreSQL is connected
migrations have run
outbox events are durable at runtime
payment events are delivered durably
EventBus has been replaced
queue runtime is DB-backed
payment workflow has same-transaction outbox inserts
finance correctness is complete
production approval exists
```

Required sequence remains:

```text
static policy
static SQL scaffold
static schema tests
behavior matrices
DB guard harnesses
non-production DB behavior tests
inactive adapters
dispatcher implementation behind explicit gates
reconciliation
runtime seam
rollback rehearsal
cutover rehearsal
operator approval
```
