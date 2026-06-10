# Yawmia PostgreSQL Core Migration Plan

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 57  
> Status: Architecture decision / migration preparation  
> Runtime status: Not implemented  
> Strategy: Refactor First / Modular Monolith First / PostgreSQL Core Target  
> Non-goal: No runtime DB migration in this patch  
> Non-goal: No production data mutation  
> Non-goal: No externalization execution  
> Non-goal: No microservices split  
> Non-goal: No AI data gateway

---

## 1. Purpose

This document aligns the existing Yawmia production-reset evidence, characterization tests, repository contracts, and architecture designs into one coherent PostgreSQL core migration spine.

It consolidates the direction established by:

```text
docs/architecture/PRODUCTION_FOUNDATION_RESET.md
docs/architecture/PAYMENT_LEDGER_MINIMUM_DESIGN.md
docs/architecture/POSTGRESQL_PAYMENT_LEDGER_SCHEMA_DRAFT.md
docs/architecture/PAYMENT_REPOSITORY_BOUNDARY_PREPARATION.md
docs/architecture/DURABLE_OUTBOX_MINIMUM_DESIGN.md
docs/architecture/PRIVACY_ACTION_LOG_MINIMUM_DESIGN.md
server/repositories/paymentRepository.contract.js
server/repositories/outboxRepository.contract.js
server/repositories/privacyActionLogRepository.contract.js
server/repositories/transactionManager.contract.js
server/repositories/sessionRepository.contract.js
```

This file is a migration plan.

It does not implement PostgreSQL runtime.

It does not approve production readiness.

---

## 2. Current Runtime Reality

Current Yawmia runtime remains:

```text
Node.js native HTTP
ESM
Vanilla JS frontend
file-backed JSON persistence
monthly sharding
secondary JSON indexes
in-memory resourceLock
in-memory EventBus
SSE / Admin SSE / live feed
file-backed ops queue
file-backed scheduler registry
file-backed admin audit/index/counters/metrics
hashed session tokens at rest for new sessions
temporary legacy plaintext session read path
no runtime PostgreSQL
no runtime DB TransactionManager
no runtime durable outbox
no runtime payment ledger
no runtime persisted receipt issuance
no runtime privacy_action_log
no runtime DB-backed queue
```

This architecture is useful for:

```text
development
demos
regression baselines
migration rehearsal artifacts
exports
benchmarks
restore drill evidence
read-only generated reports
```

It is not sufficient as the long-term production source of truth for core marketplace workflows.

---

## 3. Why File-backed JSON Exits Core Source-of-truth Role

The problem is not that files cannot store data.

The problem is that Yawmia core workflows mutate multiple records, indexes, and event side effects without a true transaction boundary.

Current file-backed runtime cannot provide:

```text
multi-record transactions
foreign keys
rollback
isolation
durable outbox
cross-process locks
safe multi-writer behavior
financial ledger immutability
transactional receipt numbering
privacy action step traceability
safe queue claiming with SKIP LOCKED
```

Therefore, file-backed JSON must exit the production source-of-truth role for core domains.

---

## 4. Modular Monolith First Decision

Yawmia should not split into microservices now.

The target near-term architecture is:

```text
Modular monolith
PostgreSQL source of truth
repository boundaries
TransactionManager
payment ledger
persisted receipts
durable outbox
DB-backed queue
DB-backed sessions
privacy action log
object storage later
structured observability
```

Logical separation now.

Physical separation later only after measured operational evidence.

---

## 5. No Microservices / No VPS Split Now

Do not introduce:

```text
service-per-domain VPS
database-per-agent
microservices mesh
AI data gateway
agent-per-store
distributed domain agents
```

Reasons:

```text
core transaction safety is not solved yet
payment ledger is not implemented yet
outbox durability is not implemented yet
queue claiming is still file-backed
admin auth is still temporary
multi-instance write safety is not ready
```

Microservices would add operational complexity before the monolith is transaction-safe.

---

## 6. No AI Data Gateway

AI may assist with:

```text
summaries
risk explanation
operator hints
admin copilot suggestions
marketplace insights
dispute summaries
```

AI must not:

```text
write payments
issue receipts
append ledger entries
approve anonymization
consume approvals
ban users
mark attendance
claim queue jobs
act as a data gateway
decide direct offer acceptance
decide application acceptance
mutate privacy workflows
```

Sensitive actions must remain:

```text
deterministic
rule-based
transaction-backed
auditable
human-reviewed where needed
approval-gated where needed
```

---

## 7. Migration Priority Order

Recommended PostgreSQL migration order:

```text
1. TransactionManager runtime adapter
2. sessions
3. users / phone index
4. jobs
5. applications
6. payments projection
7. payment_ledger_entries
8. receipt_sequences / receipts
9. payment_disputes
10. outbox_events
11. direct_offers
12. availability_ads
13. attendance_records
14. notifications
15. messages / workrooms
16. privacy_requests
17. privacy_action_log
18. admin_approvals
19. admin_audit_log
20. ops_queue_jobs / ops_queue_attempts
21. push_subscriptions / stored_files
```

The exact order can be adjusted, but payment ledger and transaction boundaries must not be delayed behind P2 dashboards.

---

## 8. TransactionManager Implementation Sequence

Patch 56 introduced a runtime-neutral contract only.

Target implementation sequence:

```text
1. Keep contract frozen and runtime-neutral.
2. Add PostgreSQL client/pool dependency in a dedicated DB adapter layer.
3. Implement PgTransactionManager.
4. Implement transaction context with:
   - transaction id
   - rollback-only marker
   - afterCommit hooks
   - afterRollback hooks
5. Prove rollback behavior with temp test database only.
6. Use TransactionManager first in payment ledger workflows.
7. Expand to applications/direct offers/privacy workflows.
```

Do not pretend a file-backed wrapper is production-grade transaction support.

---

## 9. Repository Adapter Sequence

Existing contracts are seams only.

Patch 59 adds a runtime-neutral `SessionRepository` contract skeleton to preserve Patch 51 token-hashing posture while preparing DB-backed session persistence.

Recommended adapter sequence:

```text
1. SessionRepository
2. UserRepository
3. JobRepository
4. ApplicationRepository
5. PaymentRepository
6. PaymentLedgerRepository
7. ReceiptRepository
8. OutboxRepository
9. DirectOfferRepository
10. PrivacyRequestRepository
11. PrivacyActionLogRepository
12. QueueRepository
13. AuditRepository
14. MessageRepository / WorkroomRepository
```

> Note: `SessionRepository` is contract-defined as a migration seam. It does not switch runtime persistence by itself.

Each repository should support:

```text
runtime-neutral contract tests
PostgreSQL adapter tests
idempotency where needed
transaction context support
clear ownership of derived indexes/projections
```

---

## 10. Sessions Migration Posture

Patch 51 reduced session risk by hashing new session tokens at rest.

Current remaining risks:

```text
sessions are still file-backed
legacy plaintext session read path exists
session cleanup scans files
admin session model is still temporary
```

Target:

```text
sessions table
hashed token lookup
session id independent from raw token
destroy by token hash
destroy all by user
expiry index
admin session support
legacy plaintext migration path removed after migration window
```

Minimum table:

```text
sessions:
  id
  token_hash
  user_id
  role
  admin_role
  ip
  user_agent
  created_at
  expires_at
  revoked_at
```

---

## 11. Users / Identity Migration Posture

Current user model relies on:

```text
users/*.json
users/phone-index.json
```

Target:

```text
users table
unique phone constraint
status constraint
role constraint
profile fields
verification status
created_at / updated_at
```

The phone index must become a database unique index, not a mutable JSON index.

---

## 12. Jobs / Applications Migration Posture

Current critical risks:

```text
applications.accept() mutates application first
then mutates job capacity
then updates indexes
then emits in-memory events
process-local withLock only
```

Target application acceptance transaction:

```text
begin
select job for update
select application for update
validate application pending
validate job capacity
update application status
increment job workers_accepted
possibly update job status to filled
insert outbox application_accepted
insert outbox job_filled if needed
commit
```

Required tables:

```text
jobs
applications
job_assignments or accepted_applications projection if needed
```

---

## 13. Direct Offers Migration Posture

Current direct offer acceptance writes:

```text
direct offer
synthetic job
accepted application
job status transition
availability ad match
EventBus events
```

Target transaction:

```text
begin
select direct_offer for update
validate pending and expiry
create synthetic job or assignment
create accepted application
update job status
update direct_offer accepted
update availability_ad matched if linked
insert workroom metadata if needed
insert outbox direct_offer_accepted
insert outbox application_accepted
insert outbox job_started if auto-started
commit
```

Non-critical delivery happens after commit through outbox dispatcher.

---

## 14. Payments / Ledger / Receipts Migration Posture

Current payments are mutable projections.

Target:

```text
payments = projection
payment_ledger_entries = immutable source of financial truth
payment_disputes = durable dispute workflow
receipt_sequences = transactional receipt number allocation
receipts = persisted issued financial artifact
```

Payment creation transaction:

```text
begin
lock completed job
calculate amount
insert payment projection
append payment_ledger_entries(payment_created)
insert outbox payment_created
commit
```

Receipt issuance transaction:

```text
begin
select payment for update
return existing receipt if present
select receipt_sequences row for update
allocate receipt number
insert receipts snapshot
append payment_ledger_entries(receipt_issued)
insert outbox receipt_issued
commit
```

No receipt number should be generated at read time.

---

## 15. Durable Outbox Migration Posture

Current EventBus is in-memory only.

Target:

```text
outbox_events table
transactional insert with domain mutation
dispatcher claims pending events
dispatcher retries failures
dispatcher dead-letters exhausted events
EventBus becomes local fanout after durable commit
```

Required outbox consumers:

```text
in-app notifications
SSE fanout
Admin SSE fanout
Web Push
admin alerts
analytics counters
audit index updates
cache invalidation
incident timeline
```

Critical services should stop directly emitting business events before durable persistence.

---

## 16. DB-backed Queue Migration Posture

Current ops queue is durable file-backed but not production queue-grade.

Target table set:

```text
ops_queue_jobs
ops_queue_attempts
ops_queue_idempotency
```

Required semantics:

```text
SELECT ... FOR UPDATE SKIP LOCKED
visibility timeout
retry with backoff
dead-letter
idempotency keys
attempt history
admin retry/cancel audit
worker crash recovery
```

Queue is not a replacement for outbox.

Outbox records committed domain events.

Queue runs background jobs.

---

## 17. Privacy Action Log Migration Posture

Current privacy workflow lacks step-level action logging.

Target:

```text
privacy_requests
privacy_action_log
admin_approvals
outbox_events
ops_queue_jobs
```

Anonymization must become:

```text
approval-gated
idempotent
step-logged
retry-safe
partially-failed state visible
no false completed state
```

Minimum required steps:

```text
privacy_request_created
privacy_anonymization_queued
privacy_approval_validated
privacy_approval_consumed
privacy_anonymization_started
sessions_destroyed
user_record_anonymized
phone_index_scrubbed
verifications_scrubbed
verification_images_deleted_or_queued
notifications_deleted
direct_offers_scrubbed
predictive_signals_scrubbed
privacy_anonymization_completed
privacy_anonymization_failed
```

---

## 18. Admin Audit and Admin Auth Posture

Current admin auth still relies on temporary token paths.

Patch 38 disabled query tokens by default, which must be preserved.

Target:

```text
admin_users
admin_sessions
admin_roles
admin_audit_log
short-lived signed download tokens
MFA-ready design
capability checks
approval-gated dangerous actions
```

Do not reintroduce query-token shortcuts.

---

## 19. Messages / Workrooms Migration Posture

Messages/workrooms can migrate after payment/application/direct offer core safety.

Target:

```text
workrooms
workroom_participants
messages
message_attachments
workroom_read_receipts
workroom_pins
workroom_checklists
```

Message creation should eventually:

```text
begin
insert message
update workroom last_message projection
insert read receipt baseline if needed
insert outbox workroom_message_created
commit
```

Attachments should move to object storage later.

---

## 20. Backfill Policy

Backfill must preserve truth without inventing certainty.

Rules:

```text
always keep source backup
run dry-run first
record import metadata
mark reconstructed facts as estimated when needed
do not retroactively issue receipts without approved policy
do not fabricate ledger ordering when timestamps are missing
do not delete old files until reconciliation passes
```

Backfill phases:

```text
1. users/sessions
2. jobs/applications
3. payments projections
4. synthetic ledger entries
5. receipts only if approved
6. outbox starts only for new committed events
7. privacy requests/action logs for new workflows first
```

---

## 21. Reconciliation Policy

Required reconciliation checks:

```text
file users count vs DB users count
phone uniqueness
jobs count/status parity
applications per job parity
accepted workers vs job workers_accepted parity
payments projection parity
ledger totals vs payments projection
receipts uniqueness
outbox pending/dead-letter health
privacy request status parity
queue job status parity
```

Financial reconciliation must block production cutover if inconsistent.

---

## 22. Rehearsal Policy

Before runtime switch:

```text
migration snapshot export
snapshot validation
backfill dry-run
PostgreSQL restore rehearsal
ledger reconstruction rehearsal
rollback rehearsal
postdeploy smoke
manual admin review
```

No migration should depend on a single green smoke test.

---

## 23. Rollback Policy

Rollback plan must include:

```text
database backup reference
file-backed source backup reference
migration manifest
checksums
index rebuild plan
queue pause/resume plan
outbox pause/resume plan
read-only maintenance mode plan
smoke test plan
operator checklist
```

Rollback must be rehearsed before production cutover.

---

## 24. Dual-read / Dual-write Avoidance

Avoid uncontrolled dual-write.

Allowed temporary strategies:

```text
read from file, write to file only
backfill into DB read-only
shadow compare DB reads with file reads
switch one domain at a time behind feature flag
after switch, DB writes are source of truth
file writes disabled for that domain
```

Forbidden:

```text
long-lived uncontrolled writes to both file and DB
using whichever read succeeds
silent mismatch ignoring
financial dual-write without reconciliation
privacy dual-write without action log
```

---

## 25. Runtime Feature Flag Policy

Feature flags must be explicit and conservative.

Example flags:

```text
STORAGE_ADAPTER=file | postgres
PAYMENTS_ADAPTER=file | postgres
SESSIONS_ADAPTER=file | postgres
OUTBOX_ENABLED=false | true
QUEUE_ADAPTER=file | postgres
PRIVACY_ACTION_LOG_ENABLED=false | true
```

Production default before readiness:

```text
file for current runtime
postgres only after tested adapter and rehearsal
```

No partial hidden DB writes without visibility.

---

## 26. Production Hard Gates

Yawmia must not claim production-grade readiness until:

```text
PostgreSQL source of truth for core domains
runtime TransactionManager implemented
payment ledger implemented
receipts persisted transactionally
durable outbox implemented
DB-backed queue implemented
DB-backed sessions implemented
privacy_action_log implemented
application acceptance transactional
direct offer acceptance transactional
job completion/payment creation transactional
admin auth moved beyond static token
legacy plaintext session read path removed
migration rehearsal passed
rollback rehearsal passed
financial reconciliation passed
privacy workflow integration tests passed
outbox DLQ visible and retryable
queue stale recovery tested
observability and alerting in place
```

---

## 27. What Remains File-backed Temporarily

Acceptable file-backed artifacts after core DB migration:

```text
exports
benchmark artifacts
migration snapshots
restore drill reports
externalization decision snapshots
pilot decision snapshots
repository contract reports
read-only generated reports
local development fixtures
```

These must not be core production source of truth.

---

## 28. Scope Freeze Recommendation

Freeze P2 expansion until P0/P1 foundation improves.

Freeze:

```text
new marketplace intelligence dashboards
predictive abuse expansion
additional admin tabs
new catalog baselines
workroom advanced features
new advisory gates
AI automation ideas
microservice/VPS split proposals
```

Continue only:

```text
P0 hardening
transaction boundary migration
repository adapters
DB schema/migrations
payment ledger
persisted receipts
durable outbox
DB-backed queue
session persistence migration
privacy action log
admin auth hardening
characterization tests that expose real risk
```

---

## 29. Test Strategy

Do not optimize for green dashboards.

Test:

```text
rollback
partial failure
idempotency
concurrency
duplicate prevention
ledger immutability
receipt uniqueness
outbox retries
queue crash recovery
privacy step failures
admin capability boundaries
session hash regression
adapter contract compliance
```

Tests must not mutate `./data`.

Use isolated temp paths or test database only.

---

## 30. Immediate Next Engineering Options

After this alignment patch, recommended next patch options:

```text
A. DB-backed Queue Minimum Design
B. SessionRepository Contract Skeleton
C. Payment Ledger Runtime Migration Plan
D. Scope Reduction for Production Foundation
E. PostgreSQL Adapter Preparation Spike
```

Default next after this document:

```text
Payment Ledger Runtime Migration Plan
```

or

```text
SessionRepository Contract Skeleton
```

depending on whether the team wants financial-first or auth/session-first execution.

---

## 31. Non-goals

This document does not:

```text
install PostgreSQL
add pg dependency
run migrations
change runtime persistence
mutate production data
run backfill
issue receipts
write ledger rows
enable externalization
approve pilot
split services
introduce AI agents
```

---

## 32. Final Decision

Yawmia should continue as a modular monolith and migrate core state to PostgreSQL through repository adapters and a real TransactionManager.

The production foundation path is:

```text
Refactor First
PostgreSQL Core
Payment Ledger
Persisted Receipts
Durable Outbox
DB-backed Queue
DB-backed Sessions
Privacy Action Log
Admin Auth Hardening
Measured Evidence
No False Confidence
No Microservices Yet
No AI Data Gateway
```
