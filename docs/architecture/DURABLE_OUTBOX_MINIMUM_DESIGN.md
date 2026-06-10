# Yawmia Durable Outbox Minimum Design

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 52  
> Status: Architecture design / migration preparation  
> Runtime status: Not implemented  
> Source finding: Patch 49 outbox event durability gap characterization  
> Production posture: Durable outbox required before multi-instance production and transaction-backed core workflows

---

## 1. Purpose

This document defines the minimum durable outbox design required before Yawmia can claim production-grade event durability.

It follows Patch 49, which characterized the current runtime as:

```text
in-memory EventBus only
no durable outbox_events collection/table
business-critical events emitted directly from services
late subscribers cannot replay events
server restart loses pending events
multi-instance event fanout is unsupported
```

This document is a design target.

It does not implement:

```text
PostgreSQL runtime
outbox dispatcher runtime
DB-backed queue
SSE fanout
external pub/sub
runtime repository switching
```

---

## 2. Current Runtime Reality

Current event runtime is primarily:

```text
server/services/eventBus.js
server/router.js
server/services/notifications.js
server/services/jobs.js
server/services/applications.js
server/services/directOffer.js
server/services/payments.js
server/services/privacyRequests.js
server/services/userAnonymization.js
server/services/opsQueue.js
server/services/queueWorkers.js
```

Current model:

```text
service writes one or more records
service emits EventBus event in memory
listeners run in same process
SSE/WebPush/notifications/admin alerts depend on listener execution
no event row is persisted with the domain mutation
```

This is acceptable for development and regression baselines, but not production durability.

---

## 3. Production Decision

Yawmia must not rely on in-memory `EventBus` as the source of durable business event truth.

Production target:

```text
domain transaction writes state changes
same transaction inserts outbox_events
dispatcher reads committed outbox_events
dispatcher performs delivery/fanout/side effects
EventBus becomes local process fanout only after durable commit
```

---

## 4. Definitions

### EventBus

Current `EventBus` is an in-memory listener map.

It is useful for:

```text
local runtime notifications
tests
same-process fanout
non-critical cache invalidation
```

It is not suitable for:

```text
durable event persistence
cross-instance delivery
replay
exactly-once semantics
business-critical workflow guarantees
```

### Durable Outbox

A durable outbox is a committed table/collection of domain events written atomically with the domain state mutation.

It answers:

```text
what business event was committed?
which aggregate produced it?
was it dispatched?
how many attempts?
what failed?
can it be retried?
```

---

## 5. Minimum Storage Shape

Target production storage should include:

```text
outbox_events
outbox_attempts or attempt metadata
```

If implemented in PostgreSQL, minimum table:

```text
outbox_events
```

Minimum fields:

```text
id
event_type
aggregate_type
aggregate_id
transaction_id
idempotency_key
payload_json
headers_json
status
priority
available_at
attempts
max_attempts
locked_by
locked_until
processed_at
failed_at
last_error
created_at
updated_at
```

Allowed statuses:

```text
pending
processing
processed
failed
dead_letter
cancelled
```

Required constraints:

```text
id primary key
idempotency_key unique where not null
status constrained
created_at immutable
payload_json required
event_type required
aggregate_type required
aggregate_id required
```

---

## 6. Minimum Event Types

Core domain events that must become durable before production:

```text
application_submitted
application_accepted
application_rejected
application_withdrawn
application_worker_confirmed
application_worker_declined

job_created
job_started
job_completed
job_cancelled
job_expired
job_filled
job_renewed

payment_created
payment_confirmed
payment_disputed
payment_completed
receipt_issued

direct_offer_created
direct_offer_accepted
direct_offer_declined
direct_offer_expired
direct_offer_withdrawn

message_created
workroom_message_created
notification_created

privacy_request_created
privacy_request_queued
privacy_request_completed
privacy_request_failed
privacy_user_anonymized

admin_approval_created
admin_approval_approved
admin_approval_rejected
admin_approval_consumed
```

Operational events may also use the outbox later, but core business events are first.

---

## 7. Transaction Boundary Rule

For production core workflows:

```text
domain mutation and outbox insert must happen in the same transaction
```

Bad shape:

```text
write application
write job
emit EventBus application:accepted
```

Target shape:

```text
begin
update application
update job
insert outbox_events(application_accepted)
insert outbox_events(job_filled if needed)
commit
```

Only after commit:

```text
dispatcher delivers events
```

---

## 8. Dispatcher Semantics

Minimum dispatcher loop:

```text
select pending outbox events ordered by priority, available_at, created_at
claim rows with lock/lease
dispatch to registered handlers
mark processed on success
mark failed and schedule retry on retryable failure
mark dead_letter after max attempts or permanent failure
```

PostgreSQL target should use:

```text
SELECT ... FOR UPDATE SKIP LOCKED
```

File-backed dispatcher, if ever created for transition tests, must be marked:

```text
non-production
single-process only
no distributed lock guarantee
```

---

## 9. Delivery Targets

Outbox dispatcher may deliver to:

```text
EventBus local fanout
SSE notification manager
Admin SSE manager
Web Push
in-app notification creation
admin alert delivery queue
analytics counters
cache invalidation
audit indexing
incident timeline
```

Important:

```text
outbox event persistence is the source of durability
delivery side effects are retryable consumers
```

---

## 10. Idempotency

Each outbox event should have an idempotency key.

Examples:

```text
application_accepted:{applicationId}
job_filled:{jobId}
payment_created:{paymentId}
receipt_issued:{paymentId}
direct_offer_accepted:{offerId}
privacy_user_anonymized:{requestId}:{userId}
```

Consumers must be idempotent:

```text
notification creation must dedupe
push send can retry safely
analytics counters must avoid double-count or support rebuild
audit index updates must tolerate duplicates
```

---

## 11. Error and Retry Policy

Minimum retry model:

```text
attempts starts at 0
max_attempts default 5
retry backoff exponential
last_error stores sanitized error only
dead_letter preserves payload and error metadata
manual retry requires admin capability
```

Errors must not include:

```text
raw bearer tokens
OTP codes
passwords
API keys
authorization headers
VAPID private keys
full secret payloads
```

---

## 12. Relationship to DB-backed Queue

Outbox and queue are related but not identical.

Outbox:

```text
records domain events committed by business transactions
```

Queue:

```text
runs operational/background jobs
```

Some outbox deliveries may enqueue DB-backed queue jobs.

Examples:

```text
payment_completed outbox event -> enqueue notification delivery job
privacy_user_anonymized outbox event -> enqueue admin alert job
receipt_issued outbox event -> enqueue email/export job later
```

Do not use the queue as a replacement for transactional outbox insertion.

---

## 13. Relationship to EventBus

Current `eventBus.emit()` should eventually move behind an outbox dispatcher.

Transition path:

```text
Phase A: continue EventBus, document gaps
Phase B: introduce OutboxRepository contract
Phase C: write outbox in new transaction-backed workflows
Phase D: dispatcher emits EventBus after commit
Phase E: remove direct EventBus emits from critical workflows
```

EventBus can remain as:

```text
local process delivery mechanism
test utility
non-critical cache invalidation helper
```

But it must not be source of durable truth.

---

## 14. Repository Boundary

Future repository contract:

```text
OutboxRepository
```

Minimum methods:

```text
insert(tx, event)
findPendingForDispatch(tx, options)
claimForProcessing(tx, eventId, workerId, leaseMs)
markProcessed(tx, eventId, result)
markFailed(tx, eventId, error, nextAvailableAt)
markDeadLetter(tx, eventId, reason)
findByIdempotencyKey(tx, idempotencyKey)
listByAggregate(tx, aggregateType, aggregateId, options)
```

Important:

```text
insert(tx, event) must be usable inside business transaction
dispatcher methods may use separate transaction
```

---

## 15. Minimum PostgreSQL Schema Draft

Conceptual schema:

```sql
CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  transaction_id text,
  idempotency_key text UNIQUE,
  payload_json jsonb NOT NULL,
  headers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 50,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_by text,
  locked_until timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter', 'cancelled'))
);
```

Suggested indexes:

```sql
CREATE INDEX idx_outbox_pending
  ON outbox_events (status, priority DESC, available_at, created_at);

CREATE INDEX idx_outbox_aggregate
  ON outbox_events (aggregate_type, aggregate_id, created_at);

CREATE INDEX idx_outbox_locked_until
  ON outbox_events (status, locked_until);
```

This is a draft, not a migration.

---

## 16. Workflow Targets

### 16.1 Application Acceptance

Current gap:

```text
application accepted
job workersAccepted updated
EventBus emits application:accepted/job:filled
```

Target:

```text
begin
update application
update job
insert outbox application_accepted
insert outbox job_filled if filled
commit
```

---

### 16.2 Direct Offer Acceptance

Current gap:

```text
synthetic job created
application created
job started
ad matched best-effort
offer accepted
events emitted in-memory
```

Target:

```text
begin
lock offer
create synthetic job
create application
update job
update offer
update ad if linked
insert outbox direct_offer_accepted
insert outbox application_accepted
insert outbox job_started
commit
```

---

### 16.3 Job Completion + Payment Creation

Current gap:

```text
completeJob commits job
payment creation is fire-and-forget
```

Target:

```text
begin
complete job
create payment projection
append payment_ledger_entries(payment_created)
insert outbox job_completed
insert outbox payment_created
commit
```

---

### 16.4 Payment State Transitions

Target:

```text
begin
select payment for update
append ledger entry
update payment projection
insert outbox payment_* event
insert audit if admin action
commit
```

---

### 16.5 Privacy Anonymization

Current gap:

```text
approval consumed
user anonymized across collections
privacy request completed
events emitted in-memory
no privacy_action_log
```

Target:

```text
begin
consume approval
create privacy_action_log entry
apply anonymization steps or enqueue deterministic steps
update privacy request
insert outbox privacy_user_anonymized
commit
```

If anonymization cannot fit one DB transaction due to external/object deletion steps:

```text
use step-level privacy_action_log
make each step idempotent
persist outbox event after durable completion state
```

---

## 17. Consumer Idempotency Requirements

Consumers must handle duplicates.

Examples:

```text
notifications: dedupe by event id or aggregate id
SSE: event id replay support later
Web Push: tolerate repeated send attempts where possible
analytics counters: idempotency key or rebuildable counters
audit index: duplicate indexing safe
admin alerts: idempotency key
```

---

## 18. Ordering Rules

Outbox ordering should be per aggregate, not global.

Examples:

```text
events for one payment should preserve order
events for one application should preserve order
global ordering across unrelated aggregates is not required
```

Suggested fields:

```text
aggregate_type
aggregate_id
created_at
transaction_id
```

Future refinement may include:

```text
aggregate_version
```

---

## 19. Observability

Minimum metrics:

```text
pending count
processing count
processed last hour
failed last hour
dead_letter count
oldest pending age
p95 processing latency
dispatch success rate
handler failure rate
```

Admin UI should show:

```text
outbox health
DLQ events
retry action
aggregate link
sanitized last error
```

---

## 20. Migration Path

Recommended order:

```text
1. Keep EventBus stable
2. Add outbox design document
3. Add OutboxRepository contract skeleton
4. Add PostgreSQL outbox schema draft or integrate into core schema
5. Add dispatcher design
6. Add outbox writes only in new transaction-backed workflows
7. Replace direct critical EventBus emits gradually
8. Keep EventBus as dispatcher output
9. Add DB-backed queue relationship after outbox contract exists
```

Do not start with:

```text
microservices
external pub/sub
AI event gateway
multi-VPS split
dual-write without transaction ownership
```

---

## 21. Required Tests Before Runtime Implementation

Characterization tests already show the gap:

```text
tests/e2e/outbox-event-durability-gap-characterization.test.js
```

Future contract tests should prove:

```text
OutboxRepository contract shape
idempotency key uniqueness
insert requires event_type/aggregate/payload
dispatcher claims only pending/due events
failed events retry with backoff
dead-letter after max attempts
payload sanitization for errors
```

Future integration tests should prove:

```text
application acceptance writes domain state + outbox atomically
payment completion writes ledger + outbox atomically
receipt issuance writes receipt + ledger + outbox atomically
privacy anonymization writes action log + outbox evidence
rollback leaves no outbox event for uncommitted domain mutation
```

---

## 22. Non-goals

This design does not require immediate:

```text
PostgreSQL runtime migration
external queue
Redis
Kafka
RabbitMQ
NATS
microservices
AI dispatcher
AI data gateway
multi-VPS split
```

The target remains:

```text
modular transaction-backed monolith first
```

---

## 23. AI Boundary

AI may analyze outbox health and summarize failures.

AI may suggest:

```text
this handler is failing repeatedly
this event type has a high dead-letter rate
this aggregate may need manual review
```

AI must not:

```text
mark events processed
retry financial events
mutate payment state
complete privacy anonymization
approve admin actions
decide user bans
act as event gateway
```

---

## 24. Production Readiness Gate

Yawmia should not claim durable event readiness until all are true:

```text
outbox_events implemented
business-critical transactions write outbox rows atomically
dispatcher can retry and dead-letter
consumers are idempotent
admin can inspect/retry dead letters
SSE/WebPush/notification delivery is downstream of outbox
payment workflows use ledger + outbox
privacy workflows use action log + outbox
application/direct offer acceptance use transaction + outbox
multi-instance behavior has DB-backed claiming or equivalent
```

---

## 25. Final Decision

Patch 49 proved the current event model is not durable.

This document defines the minimum durable outbox design required before production-grade event reliability.

The next engineering direction after this design should be:

```text
OutboxRepository contract skeleton
PostgreSQL outbox schema integration
dispatcher design
transaction-backed core workflow migration
```

No microservices are required now.

No AI data gateway is allowed.

No smoke test should be interpreted as durable event proof.
