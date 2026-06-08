# Yawmia Production Foundation Reset

> Status: Proposed ADR  
> Patch: 37  
> Scope: Production foundation, core risk characterization, migration direction  
> Decision: Refactor First / Wait before Investment  
> Runtime posture today: Native Node.js monolith with file-backed JSON  
> Target posture: Transaction-backed production monolith

---

## 1. Decision Summary

Yawmia is not production-scale or investment-ready in its current architecture.

The current file-backed JSON foundation is acceptable for development, demos, temporary evidence, exports, snapshots, and migration rehearsals, but it is no longer acceptable as the long-term production source of truth for core marketplace workflows.

The immediate direction is:

```text
Refactor first.
Move core domain state to PostgreSQL.
Introduce transaction boundaries.
Introduce a payment ledger.
Replace file-backed queue with DB-backed queue.
Reduce dashboard/documentation expansion.
Preserve existing smoke tests as regression baselines only.
```

No microservices are recommended at this stage.

No AI decision-maker is allowed for sensitive actions.

---

## 2. Why File-backed JSON Is No Longer Enough

The current file-backed architecture relies on:

```text
atomic single-file writes
secondary JSON indexes
monthly sharding
in-memory resource locks
in-memory EventBus
periodic repair/verification scripts
file-backed operational queue
```

This is not enough for production because it does not provide:

```text
multi-record transactions
foreign keys
rollback
isolation levels
durable outbox
cross-process locking
safe multi-instance writes
financial ledger immutability
complete audit guarantees
safe concurrent queue claiming
```

The main issue is not that files cannot store data.  
The issue is that the core business workflows mutate multiple records and indexes and emit events without a transaction boundary.

---

## 3. Collections That Must Move First

Priority 1 migration candidates:

```text
users
sessions
jobs
applications
attendance
payments
payment_ledger_entries
direct_offers
messages
workrooms
notifications
admin_audit
privacy_requests
admin_approvals
ops_queue
```

File-backed storage may remain for:

```text
exports
migration snapshots
benchmark artifacts
restore drill reports
externalization decision snapshots
read-only generated reports
local development seed data
```

---

## 4. Required PostgreSQL Tables

Minimum production tables:

```text
users
user_profiles
sessions
jobs
applications
attendance_records
payments
payment_ledger_entries
payment_disputes
receipts
direct_offers
availability_ads
messages
workrooms
workroom_participants
workroom_read_receipts
notifications
push_subscriptions
admin_users
admin_sessions
admin_audit_log
admin_approvals
privacy_requests
privacy_action_log
ops_queue_jobs
ops_queue_attempts
outbox_events
stored_files
```

Indexes must be designed for:

```text
phone lookup
job listing filters
worker applications
job applications
payment lookup by job
message lookup by workroom/job
notification lookup by user
admin audit search
queue pending/running claim
privacy request status
```

---

## 5. Required Transaction Boundaries

The following workflows require DB transactions before serious production use:

### Job application accept

```text
read application
verify job capacity
update application status
increment job workersAccepted
possibly update job status
insert notification/outbox events
```

### Direct offer accept

```text
read direct offer
validate pending and expiry
create synthetic job or real assignment
create accepted application/assignment
update offer to accepted
update availability ad
insert workroom
insert notifications/outbox events
```

### Job complete and payment creation

```text
update job completed
calculate attendance-adjusted payable amount
create payment
insert payment ledger entries
insert receipt draft or receipt allocation event
insert notifications/outbox events
```

### Payment confirmation / completion / dispute

```text
validate actor
validate current state
insert immutable ledger entry
update payment projection
insert dispute/evidence record if applicable
insert audit/outbox event
```

### User anonymization

```text
validate approval
mark privacy request processing
scrub user profile
delete sessions
scrub verification images
scrub direct offer identity fields
preserve financial/audit records
insert privacy action log
mark request completed
```

---

## 6. Payment Ledger Minimum Design

Payments must not rely only on mutable payment records.

Minimum ledger model:

```text
payment_ledger_entries:
  id
  payment_id
  job_id
  actor_id
  actor_role
  entry_type
  amount_delta
  platform_fee_delta
  worker_payout_delta
  currency
  reason
  metadata_json
  idempotency_key
  created_at
```

Required entry types:

```text
payment_created
employer_confirmed
worker_disputed
admin_resolved
payment_completed
payment_adjusted
receipt_issued
refund_or_reversal
```

`payments.status` should become a projection derived from ledger + dispute state.

Receipt numbers must be allocated transactionally and persisted in `receipts`.

---

## 7. Queue Replacement Options

Current file-backed queue is transitional only.

Preferred near-term option:

```text
Postgres-backed queue inside the monolith.
```

Acceptable implementations:

```text
pg-boss
custom jobs table with SELECT ... FOR UPDATE SKIP LOCKED
```

Required queue semantics:

```text
atomic claim
visibility timeout
retries
dead-letter queue
idempotency keys
attempt history
job payload validation
admin retry/cancel audit
worker crash recovery
```

Redis can be considered later only if operational evidence justifies it.

---

## 8. SSE and EventBus Future

The in-memory EventBus is not a durable production event system.

Minimum production direction:

```text
outbox_events table
transactional writes alongside domain changes
background dispatcher
SSE fanout from durable events
sticky sessions or pub/sub for multi-instance
idempotent notification delivery
```

SSE can remain for UX, but it must not be the durable source of business truth.

---

## 9. Admin Auth and Security Decision

Static admin token is not sufficient for production.

Immediate hardening priorities:

```text
disable admin token via query by default
replace query download tokens with short-lived signed download tokens
hash session tokens at rest
introduce admin sessions
preserve RBAC capabilities
add MFA-ready design
audit sensitive admin actions
```

Admin token in URL is a P0/P1 risk because URLs can leak through logs, history, referrers, browser extensions, and shared screenshots.

---

## 10. Privacy and Anonymization Decision

The current privacy workflow is useful but not compliance-complete.

Production privacy requires:

```text
complete data inventory
transaction-backed anonymization
privacy action log
export completeness tests
legal retention rules for payments/audit/messages
approval-gated destructive actions
idempotent retry-safe anonymization jobs
```

Financial and audit records may be preserved, but the legal basis and redaction rules must be explicit.

---

## 11. What to Delete or Simplify

Stop expanding:

```text
new catalogs
new readiness dashboards
new advisory-only gate layers
new marketplace intelligence dashboards
new predictive automation
new file-backed indexes for core domain
```

Simplify:

```text
admin dashboard
Phase 60/61 UI
predictive abuse surface
workroom advanced features
file hygiene panels
```

Keep only what supports:

```text
production migration
risk reduction
operational safety
regression protection
```

---

## 12. What to Preserve

Preserve:

```text
Node.js monolith
business workflow services
Arabic-first UX
existing smoke tests as regression baselines
admin RBAC concept
privacy request concept
direct offer concept
workroom concept
PWA frontend
migration and evidence scripts as support tooling
```

Do not preserve file-backed JSON as a production core source of truth.

---

## 13. Smoke Tests Are Regression Baselines Only

Existing smoke tests are useful.

They prove:

```text
workflow shape
basic happy path
some authorization guardrails
temporary data behavior
```

They do not prove:

```text
production readiness
financial correctness
transaction safety
privacy compliance
multi-process safety
durable event delivery
investment readiness
```

Future tests should focus on characterization of failure modes, not green dashboards.

---

## 14. No Microservices Yet

Yawmia should remain a monolith for now.

The next production architecture should be:

```text
Node.js monolith
PostgreSQL source of truth
DB migrations
DB-backed queue
object storage for images/attachments
outbox events
structured logging
metrics/alerts
admin auth hardening
payment ledger
```

Microservices would add operational complexity before the core domain is transaction-safe.

---

## 15. No AI Decision-maker

AI may assist with:

```text
summaries
analysis
operator hints
risk explanation
draft recommendations
```

AI must not:

```text
ban users
resolve disputes
change payments
approve anonymization
change admin roles
mark attendance
execute externalization
```

Sensitive decisions must remain:

```text
human-reviewed
auditable
approval-gated
rule-based
```

---

## 16. 30 / 60 / 90 Day Roadmap

### First 30 days

```text
disable admin query token by default
write payment ledger design
write PostgreSQL schema draft
identify transaction boundaries
freeze new dashboard/catalog expansion
add characterization tests for direct offer/payment partial failure
mark file-backed production posture as non-ready
```

### 60 days

```text
introduce PostgreSQL migrations
move users/sessions/jobs/applications/payments to DB
introduce payment ledger
introduce outbox_events
introduce DB-backed queue
replace in-memory locks for core workflows with DB transactions
```

### 90 days

```text
migrate messages/workrooms/notifications
introduce object storage for images/attachments
replace admin token model with admin sessions
add observability stack
run load/concurrency/failure tests
prepare investment diligence package based on measured evidence
```

---

## 17. Final Decision

Yawmia should not seek production scale or investment approval until the production foundation reset is underway.

The immediate patch should document and enforce this reset direction, not add more smoke confidence.
