# Yawmia Privacy Action Log Minimum Design

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch direction: Patch 53  
> Status: Architecture design / migration preparation  
> Runtime status: Not implemented  
> Source finding: Patch 50 privacy action log gap characterization  
> Production posture: Privacy action log required before compliance-grade privacy/anonymization workflows

---

## 1. Purpose

This document defines the minimum privacy action log design required before Yawmia can claim compliance-grade privacy request handling or anonymization safety.

It follows Patch 50, which characterized the current runtime as:

```text
privacy_requests exists
privacy_action_log does not exist
privacy anonymization queues jobs without action log entries
approval validity is checked before enqueue but not action-logged
approval is consumed later in queue worker
anonymization mutates multiple collections
privacy request completion is separate from anonymization steps
privacy events are emitted through in-memory EventBus
no transaction manager is used
no durable outbox is used
```

This document is a design target.

It does not implement:

```text
privacy_action_log runtime
PostgreSQL runtime
transaction manager
durable outbox runtime
new queue backend
actual anonymization execution
```

---

## 2. Current Runtime Reality

Current privacy/anonymization runtime spans:

```text
server/services/privacyRequests.js
server/services/userAnonymization.js
server/services/userDataExport.js
server/services/adminApprovals.js
server/services/queueWorkers.js
server/services/opsQueue.js
server/handlers/governanceHandler.js
server/services/eventBus.js
```

Current behavior:

```text
createPrivacyRequest() writes a file-backed privacy request
queuePrivacyExport() enqueues a file-backed ops queue job
queueUserAnonymization() validates approval and enqueues a job
queue worker consumes approval separately
queue worker calls anonymizeUserData()
anonymizeUserData() mutates multiple collections
completePrivacyRequest() updates request status
events are emitted in-memory
```

There is no durable step-by-step privacy action record.

---

## 3. Production Decision

Yawmia must not treat `privacy_requests` alone as a sufficient compliance trail.

Production privacy workflows require:

```text
privacy_requests
privacy_action_log
admin_approvals
admin_audit_log
outbox_events
transaction boundaries
idempotency keys
step-level status tracking
```

The production source of privacy workflow evidence must include:

```text
privacy_action_log
```

---

## 4. Definitions

### Privacy Request

A privacy request is the user's/admin's requested privacy workflow.

Examples:

```text
user_data_export
user_anonymization
```

It answers:

```text
what was requested?
who requested it?
what is the current state?
```

It does not fully answer:

```text
what exact steps happened?
which records were touched?
which approval was consumed?
which step failed?
was the workflow partially completed?
was an outbox event persisted?
```

### Privacy Action Log

A privacy action log is a durable append-oriented workflow evidence log.

It answers:

```text
what privacy-sensitive action occurred?
which request caused it?
which admin/user/system actor caused it?
what step was executed?
what records were affected?
what approval was used?
was the step committed?
was an outbox event written?
```

---

## 5. Minimum Storage Shape

Target production storage should include:

```text
privacy_action_log
```

Minimum fields:

```text
id
request_id
user_id
actor_id
actor_type
action_type
step
status
approval_id
idempotency_key
affected_collections_json
affected_counts_json
before_summary_json
after_summary_json
error
metadata_json
transaction_id
outbox_event_id
created_at
updated_at
completed_at
failed_at
```

Allowed statuses:

```text
planned
started
completed
failed
skipped
compensated
```

Allowed actor types:

```text
admin
system
queue_worker
user
```

Minimum action types:

```text
privacy_request_created
privacy_export_queued
privacy_export_started
privacy_export_completed
privacy_export_failed
privacy_anonymization_queued
privacy_approval_validated
privacy_approval_consumed
privacy_anonymization_started
privacy_anonymization_step_completed
privacy_anonymization_completed
privacy_anonymization_failed
privacy_request_cancelled
privacy_request_expired
```

---

## 6. PostgreSQL Schema Draft

Conceptual schema:

```sql
CREATE TABLE privacy_action_log (
  id text PRIMARY KEY,
  request_id text NOT NULL,
  user_id text NOT NULL,
  actor_id text,
  actor_type text NOT NULL,
  action_type text NOT NULL,
  step text NOT NULL,
  status text NOT NULL,
  approval_id text,
  idempotency_key text UNIQUE,
  affected_collections_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_counts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  transaction_id text,
  outbox_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  CHECK (status IN ('planned', 'started', 'completed', 'failed', 'skipped', 'compensated')),
  CHECK (actor_type IN ('admin', 'system', 'queue_worker', 'user'))
);
```

Suggested indexes:

```sql
CREATE INDEX idx_privacy_action_log_request
  ON privacy_action_log (request_id, created_at);

CREATE INDEX idx_privacy_action_log_user
  ON privacy_action_log (user_id, created_at);

CREATE INDEX idx_privacy_action_log_status
  ON privacy_action_log (status, created_at);

CREATE INDEX idx_privacy_action_log_action_type
  ON privacy_action_log (action_type, created_at);
```

This is a draft, not a migration.

---

## 7. Repository Boundary

Future repository contract:

```text
PrivacyActionLogRepository
```

Minimum methods:

```text
append(tx, entry)
markStarted(tx, entryId, patch)
markCompleted(tx, entryId, patch)
markFailed(tx, entryId, error, patch)
findById(tx, entryId)
findByIdempotencyKey(tx, idempotencyKey)
listByRequest(tx, requestId, options)
listByUser(tx, userId, options)
```

Rules:

```text
append must be usable inside a business transaction
idempotency key must prevent duplicate step logs
failed steps must preserve sanitized error
entries must not contain raw tokens, OTPs, secrets, or raw verification images
```

---

## 8. Transaction Boundary Rule

For compliance-grade workflows:

```text
privacy request state update
approval consumption
privacy action log append
outbox event insert
```

must happen in the same transaction where possible.

Bad shape:

```text
validate approval
enqueue job
later consume approval
later anonymize user
later complete request
emit EventBus
```

Target shape:

```text
begin
validate request
validate approval
append privacy_action_log privacy_anonymization_queued
enqueue DB-backed queue job or insert outbox command event
update privacy request status
commit
```

For execution:

```text
begin
claim privacy job
append privacy_action_log privacy_anonymization_started
consume approval
apply deterministic step
append privacy_action_log privacy_anonymization_step_completed
update request progress
insert outbox event if workflow completed
commit
```

---

## 9. Workflow Targets

### 9.1 Privacy Request Creation

Current:

```text
createPrivacyRequest() writes privacy request file
EventBus emits privacy_request:created
```

Target:

```text
begin
insert privacy_request
append privacy_action_log privacy_request_created
insert outbox_events privacy_request_created
commit
```

---

### 9.2 Privacy Export Queueing

Current:

```text
queuePrivacyExport() enqueues ops queue job
patches request status to queued
EventBus emits privacy_request:queued
```

Target:

```text
begin
validate request status
append privacy_action_log privacy_export_queued
enqueue DB-backed queue job or insert durable command
update privacy_request status queued
insert outbox_events privacy_request_queued
commit
```

---

### 9.3 Privacy Export Completion

Target:

```text
begin
persist export artifact metadata
append privacy_action_log privacy_export_completed
update privacy_request completed
insert outbox_events privacy_request_completed
commit
```

---

### 9.4 User Anonymization Queueing

Current:

```text
queueUserAnonymization() checks approval validity
enqueues privacy_user_anonymization job
updates request status queued
```

Target:

```text
begin
select privacy_request for update
validate status
validate approval
append privacy_action_log privacy_approval_validated
append privacy_action_log privacy_anonymization_queued
enqueue durable job
update privacy_request queued
insert outbox_events privacy_request_queued
commit
```

---

### 9.5 Approval Consumption

Current:

```text
queue worker consumes approval immediately before anonymization
```

Target:

```text
begin
select approval for update
consume approval once
append privacy_action_log privacy_approval_consumed
commit as part of anonymization execution transaction
```

Approval consumption must reference:

```text
approval_id
request_id
user_id
admin/request actor
queue job id
transaction_id
```

---

### 9.6 User Anonymization Execution

Current `anonymizeUserData()` mutates:

```text
sessions
users
phone index
verifications
verification images
notifications
direct offers
predictive signals
```

Target step log:

```text
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
```

Each step must be:

```text
idempotent
recorded
counted
error-aware
safe to retry
```

---

## 10. External/Object Deletion Handling

Some steps may involve non-transactional external operations.

Example:

```text
delete verification image from object storage
```

Rule:

```text
do not pretend external deletion is covered by DB transaction
```

Use step states:

```text
planned
started
completed
failed
compensated
```

For external deletion:

```text
append planned step
attempt deletion
record result
retry if needed
```

If object deletion fails but user PII in core DB is anonymized:

```text
privacy_request status may be failed or partial_attention_required
admin must review
privacy_action_log must show exact failed step
```

---

## 11. Idempotency

Required idempotency keys:

```text
privacy_request_created:{requestId}
privacy_export_queued:{requestId}
privacy_export_completed:{requestId}
privacy_anonymization_queued:{requestId}
privacy_approval_consumed:{requestId}:{approvalId}
privacy_anonymization_started:{requestId}
privacy_anonymization_step:{requestId}:{step}
privacy_anonymization_completed:{requestId}
privacy_request_cancelled:{requestId}
```

Retry behavior:

```text
same idempotency key returns existing log entry
step can be skipped if already completed
failed step can be retried with new attempt metadata
```

---

## 12. Outbox Integration

Privacy workflows must not rely on in-memory EventBus for durable privacy events.

Required outbox events:

```text
privacy_request_created
privacy_request_queued
privacy_export_completed
privacy_export_failed
privacy_user_anonymized
privacy_request_failed
privacy_request_cancelled
```

Rules:

```text
privacy action log and outbox event should be written in the same transaction
EventBus is downstream delivery only
Admin SSE is downstream delivery only
notifications are downstream delivery only
```

---

## 13. Audit Integration

Privacy action log is not a replacement for admin audit.

Both are needed:

```text
admin_audit_log: who performed/admin-triggered sensitive admin action
privacy_action_log: what privacy workflow step happened and what it affected
```

Sensitive admin actions:

```text
privacy_request_create
privacy_export_queue
privacy_anonymize_preview
privacy_anonymize_queue
privacy_request_cancel
approval_approve
approval_consume
```

Audit rows should reference:

```text
request_id
privacy_action_log_id
approval_id
queue_job_id
```

when available.

---

## 14. Data Preservation Rules

Anonymization must not blindly delete:

```text
financial records
payment ledger entries
receipts
admin audit records
incident records
postmortems
legal/compliance evidence
```

Instead:

```text
replace user-identifying fields with anonymized marker
preserve financial/legal record integrity
store action log evidence
avoid retaining phone/name/images unless legally required
```

---

## 15. Sensitive Data Rules

`privacy_action_log` must not store:

```text
raw bearer tokens
raw OTPs
passwords
authorization headers
API keys
VAPID private keys
raw national ID images
raw selfie images
full message text unless explicitly required
```

Allowed summaries:

```text
counts
collection names
record ids if needed for audit
hashed/redacted identifiers
step names
sanitized errors
```

---

## 16. Relationship to DB-backed Queue

Privacy workflows may need background execution.

But queueing alone is not enough.

Queue job creation must be transactionally tied to:

```text
privacy request state update
privacy action log append
outbox event insert
```

DB-backed queue target:

```text
begin
insert/update privacy_request
insert privacy_action_log
insert queue job
insert outbox event
commit
```

File-backed queue can remain temporary but is not compliance-grade.

---

## 17. Admin UI Requirements

Admin should be able to see:

```text
privacy request current status
approval id and state
queue job id
privacy action log timeline
step statuses
affected counts
failed step
retry guidance
export artifact expiry
```

Admin UI must not display:

```text
raw secrets
raw tokens
raw verification image payloads
unredacted sensitive data after anonymization
```

---

## 18. Failure Modes

Must be explicitly handled:

```text
approval valid at enqueue but consumed by another workflow before execution
approval expired before execution
session destruction partially fails
verification image deletion fails
direct offer scrubbing fails
privacy request completion fails after user mutation
outbox insert fails
queue worker crashes mid-step
duplicate retry starts same anonymization
```

Each failure must leave:

```text
privacy_action_log failed entry
request status failed or needs_review
retry/idempotency path
admin-visible error
no false completed state
```

---

## 19. Migration Path

Recommended order:

```text
1. Keep existing privacy runtime stable
2. Add this design doc
3. Add PrivacyActionLogRepository contract skeleton
4. Add PostgreSQL schema draft for privacy_action_log
5. Add transaction manager boundary
6. Add action log writes to new transaction-backed privacy workflow
7. Move privacy queue to DB-backed queue
8. Move outbox events to durable outbox
9. Gradually remove direct EventBus reliance from privacy workflow
```

Do not start with:

```text
rewriting all anonymization at once
microservices
AI privacy executor
external worker mesh
manual-only dashboard claims
```

---

## 20. Required Tests Before Runtime Implementation

Existing characterization:

```text
tests/e2e/privacy-action-log-gap-characterization.test.js
```

Future contract tests:

```text
PrivacyActionLogRepository contract shape
append requires request_id/user_id/action_type/step/status
idempotency key prevents duplicates
markCompleted records completed_at
markFailed records sanitized error
listByRequest returns timeline ordered by created_at
```

Future integration tests:

```text
privacy request creation writes action log and outbox atomically
privacy export queue writes action log and queue job atomically
privacy anonymization queue validates approval and writes action log
approval consumption writes privacy action log
anonymization step retries are idempotent
failed anonymization leaves request failed and action log failed entry
completed anonymization writes privacy_user_anonymized outbox event
```

---

## 21. Non-goals

This design does not implement:

```text
privacy action log runtime
PostgreSQL migration
external queue
object storage deletion workflow
AI privacy agent
microservices
VPS split
automatic compliance claim
```

The target remains:

```text
modular transaction-backed monolith first
```

---

## 22. AI Boundary

AI may assist with:

```text
summarizing privacy action log timeline
suggesting operator next steps
detecting suspicious failed-step patterns
drafting user/admin explanations
```

AI must not:

```text
approve anonymization
consume approvals
execute deletion
mutate user records
decide retention policy
mark privacy request completed
act as privacy data gateway
```

Privacy execution must be:

```text
deterministic
auditable
approval-gated
transaction-backed where possible
human-reviewed for sensitive exceptions
```

---

## 23. Production Readiness Gate

Yawmia should not claim privacy/anonymization readiness until all are true:

```text
privacy_action_log implemented
privacy request state changes are action-logged
approval validation/consumption is action-logged
anonymization steps are idempotent and logged
failed steps are visible and retryable
durable outbox persists privacy events
financial/audit/legal preservation rules are enforced
sensitive data is not stored in logs
transaction boundaries are defined and implemented
DB-backed queue or equivalent durable claiming exists
```

---

## 24. Final Decision

Patch 50 proved the current privacy workflow lacks a durable privacy action log.

This document defines the minimum privacy action log design required before compliance-grade privacy workflows.

The next engineering direction after this design should be:

```text
PrivacyActionLogRepository contract skeleton
PostgreSQL privacy_action_log schema draft
transaction-backed privacy request workflow
durable outbox integration
DB-backed queue preparation
```

No microservices are required now.

No AI data gateway is allowed.

No smoke test should be interpreted as privacy compliance proof.
