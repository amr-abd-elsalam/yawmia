# Yawmia Data Catalog

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch: Patch 17 — Data Catalog Baseline  
> Scope: Architecture Inventory / collection-level data map  
> Runtime posture: documentation-only  
> Source of truth posture: file-backed JSON source of truth  
> Externalization posture: advisory-only  
> Last reviewed: 2026-06-04

---

## Purpose

This catalog is the canonical collection-level data architecture reference for Yawmia.

It complements:

```text
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
```

`SYSTEMS_CATALOG.md` maps systems.

`DATA_CATALOG.md` maps collections and data artifacts.

SERVER_CATALOG.md maps runtime phases that initialize, read, write, index, schedule, and shut down those data flows.

EVENTS_CATALOG.md maps events that are emitted from source-record lifecycle changes and derived artifact workflows.

SERVER_CATALOG.md is the runtime/server lifecycle companion catalog to this collection-level data catalog.

EVENTS_CATALOG.md is the event/source-record lifecycle companion catalog to this collection-level data catalog.

`DATA_CATALOG.md` maps:

```text
collections
paths
record prefixes
source vs derived boundaries
sharding
secondary indexes
filesystem indexes
queue storage
metrics/evidence artifacts
governance artifacts
repair/rebuild ownership
privacy sensitivity
operational risks
```

This document is documentation-only.

It does not authorize:

```text
runtime changes
data mutation
queue remediation
notification quarantine execution
index repair execution
migration execution
externalization
PostgreSQL
Redis
external queue
external search
new dependencies
version/cache changes
```

---

## Data Architecture Posture

Current Yawmia data architecture is:

```text
Native Node.js 20+ ESM
native http
native fetch
native node:stream
native node:test
Vanilla JS frontend
PWA
SSE
Admin SSE
Web Push
file-backed JSON source of truth
atomic writes
unique temp-file writes
monthly sharding
secondary indexes
filesystem indexes
segmented queue storage
queue summary/location indexes
metrics/evidence artifacts
governance artifacts
migration/rehearsal artifacts
single-writer discipline
zero new dependencies
```

Current Yawmia data architecture is explicitly:

```text
no PostgreSQL
no Redis
no external queue
no external search
no external DB
no runtime repository switching
no dual-write
no cutover
no pilot by default
```

Phase 59 / Phase 60 / Phase 61 externalization systems are advisory/evidence only.

---

## Global Source vs Derived Data Rules

Core rules:

```text
JSON source records are source of truth.
Secondary indexes are derived/rebuildable artifacts.
Filesystem search indexes are derived/rebuildable artifacts.
Queue segmented files are source of truth when summary mismatch exists.
Queue summary/location indexes are derived acceleration artifacts.
Metrics snapshots and rollups are evidence artifacts.
Migration snapshots and rehearsal reports are evidence artifacts.
Review bundles are not source of truth.
```

Operational interpretation:

```text
Source records must be protected first.
Derived artifacts may be rebuilt from source records.
Evidence artifacts inform decisions but do not mutate source data.
Review bundles are generated review artifacts only.
```

Important queue warning:

```text
Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed.
Actual segmented queue files are source of truth.
Queue summary/location indexes are derived acceleration artifacts.
Do not run queue-drain --confirm as remediation.
Do not run repair-queue --confirm without dry-run evidence and explicit approval.
```

Important notification flood warning:

```text
cleanup-notification-flood.js is quarantine-only.
It never deletes notifications.
Confirmed mode moves notification source files to quarantine and updates notifications/user-index.json.
Hardening does not authorize confirmed execution.
```

Important index repair warning:

```text
repair-indexes.js rebuilds derived secondary indexes only.
sourceDataMutated:false.
It must remain dry-run-first.
Confirmed index repair requires explicit approval.
```

---

## Sharding Model

Configured by:

```text
config.SHARDING.enabled=true
config.SHARDING.strategy=monthly
```

Monthly sharded collections:

```text
jobs
applications
notifications
attendance
messages
ratings
payments
instant_matches
availability_ads
direct_offers
```

Implementation notes:

```text
New records use getWriteRecordPath().
Reads use getRecordPath() plus shard fallback.
shardLocationCache accelerates record ID to shard path lookup.
Flat legacy fallback exists.
Duplicate physical records can happen and must be diagnosed carefully.
```

Relevant files:

```text
config.js
server/services/database.js
server/services/jobs.js
server/services/applications.js
server/services/notifications.js
server/services/attendance.js
server/services/messages.js
server/services/ratings.js
server/services/payments.js
server/services/instantMatch.js
server/services/availabilityAd.js
server/services/directOffer.js
```

---

## Atomic Write Model

Yawmia writes JSON through:

```text
server/services/database.js
atomicWrite(filePath, data)
```

Current atomic write behavior:

```text
write JSON to unique .tmp path
rename unique temp file to target path
invalidate cache after successful write
best-effort temp cleanup on write error
```

Safety implications:

```text
Unique temp-file writes reduce concurrent rename races.
Atomic rename protects readers from partial JSON writes.
Stale .tmp files are cleanup targets only after age threshold.
Zero-byte/corrupt JSON must be handled by verification/quarantine tooling, not blind deletion.
```

Related tooling:

```text
scripts/verify-data-json.js
scripts/verify-file-health.js
scripts/quarantine-corrupt-json.js
scripts/find-null-json-files.js
server/services/database.js cleanStaleTmpFiles()
```

---

## Indexing Model

Secondary index files from `config.DATABASE.indexFiles` are derived/rebuildable artifacts:

```text
users/phone-index.json
jobs/index.json
applications/worker-index.json
applications/job-index.json
notifications/user-index.json
jobs/employer-index.json
payments/job-index.json
reports/target-index.json
reports/reporter-index.json
verifications/user-index.json
attendance/job-index.json
attendance/worker-index.json
messages/job-index.json
messages/user-index.json
push_subscriptions/user-index.json
alerts/user-index.json
favorites/user-index.json
availability_ads/worker-index.json
direct_offers/employer-index.json
direct_offers/worker-index.json
```

Rules:

```text
Secondary indexes are derived/rebuildable artifacts.
Index drift is an operational risk, not source data loss by itself.
Source records remain source of truth.
repair-indexes.js rebuilds derived secondary indexes only.
```

Filesystem indexes:

```text
audit/indexes
workrooms/search-indexes
metrics/predictive-signal-archives/index
```

Rules:

```text
Filesystem search indexes are derived/rebuildable artifacts.
Final search results must re-read and re-filter source records where services require correctness.
```

Related services:

```text
server/services/auditLogIndex.js
server/services/searchIndex.js
server/services/queryIndex.js
server/services/workroomSearch.js
server/services/workroomIndexHealth.js
server/services/predictiveArchiveIndex.js
```

Related scripts:

```text
scripts/repair-indexes.js
scripts/rebuild-audit-index.js
scripts/verify-audit-index.js
scripts/rebuild-workroom-search.js
scripts/verify-workroom-indexes.js
scripts/rebuild-predictive-archive-index.js
scripts/rebuild-search-relevance.js
```

---

## Privacy Sensitivity Classes

This catalog uses these classes:

```text
Public-safe
Internal
PII
Sensitive PII
Financial
Auth-sensitive
Operational
Governance-sensitive
Evidence artifact
Derived artifact
```

Examples:

| Collection / artifact | Sensitivity |
|---|---|
| `users` | PII / Sensitive PII |
| `sessions` | Auth-sensitive |
| `otp` | Auth-sensitive |
| `payments` | Financial |
| `verifications` | Sensitive PII |
| `privacy_requests` | Governance-sensitive |
| `admin_approvals` | Governance-sensitive |
| `notifications` | Internal / user-specific |
| `messages` | Internal / user-generated content |
| `images` | Sensitive PII depending purpose |
| `audit` | Governance-sensitive / Operational |
| `ops_queue/*` | Operational source records |
| `metrics/*` | Evidence artifact |
| secondary indexes | Derived artifact |

---

## Source Collections

### users

- Path: `data/users`
- Record prefix: `usr_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/users.js`, auth/profile/privacy flows
- Primary readers: auth, sessions, profiles, jobs, applications, reports, trust, analytics
- Index files: `users/phone-index.json`
- Events emitted/listened: `user:created`
- Related scripts: `export-user-data.js`, `anonymize-user-data.js`, `verify-privacy-governance.js`, `repair-indexes.js`
- Privacy sensitivity: PII / Sensitive PII
- Retention / hygiene: soft delete, anonymization workflow, privacy request workflow
- Repair / rebuild: phone index rebuild through `repair-indexes.js`
- Risks: phone index drift, public-profile PII leakage, unsafe anonymization execution
- Notes: public profiles must not expose phone, raw images, lat/lng, or notification preferences.

### sessions

- Path: `data/sessions`
- Record prefix: token/session records are service-defined / token-keyed
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/sessions.js`, `server/services/auth.js`
- Primary readers: auth middleware, admin RBAC, SSE self-auth
- Index files: none
- Events emitted/listened: `session:created`
- Related scripts: `verify-production-readiness.js`
- Privacy sensitivity: Auth-sensitive
- Retention / hygiene: expired session cleanup
- Repair / rebuild: not rebuildable from other data
- Risks: token leakage, stale sessions, session metadata drift
- Notes: sessions are source records for bearer-token validation.

### jobs

- Path: `data/jobs`
- Record prefix: `job_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/jobs.js`, direct-offer synthetic job flow
- Primary readers: applications, attendance, payments, notifications, search, analytics, workrooms
- Index files: `jobs/index.json`, `jobs/employer-index.json`
- Events emitted/listened: `job:created`, `job:filled`, `job:started`, `job:completed`, `job:cancelled`, `job:renewed`, `job:expiry_warning`
- Related scripts: `repair-indexes.js`, `rebuild-search-relevance.js`, `benchmark-file-paths.js`, `measure-storage-pressure.js`
- Privacy sensitivity: Internal / Public-safe subset
- Retention / hygiene: expiry enforcement, renewal count, duplicate physical record checks
- Repair / rebuild: secondary indexes and search indexes derived from job records
- Risks: duplicate flat/sharded copies, expiry warning flood, synthetic job privacy leakage, index drift
- Notes: `sourceType='direct_offer'` synthetic jobs are private and filtered from public listings.

### applications

- Path: `data/applications`
- Record prefix: `app_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/applications.js`, instant match, direct-offer acceptance
- Primary readers: jobs, attendance, messages, workrooms, ratings, payments, analytics
- Index files: `applications/worker-index.json`, `applications/job-index.json`
- Events emitted/listened: `application:submitted`, `application:accepted`, `application:rejected`, `application:withdrawn`, `application:worker_confirmed`, `application:worker_declined`
- Related scripts: `repair-indexes.js`, `report-duplicate-records.js`, `measure-storage-pressure.js`
- Privacy sensitivity: Internal
- Retention / hygiene: no destructive cleanup by default
- Repair / rebuild: worker/job application indexes
- Risks: accepted-equivalent status drift, over-acceptance if locks bypassed, index drift
- Notes: `worker_confirmed` is accepted-equivalent via `applicationStatus.js`.

### otp

- Path: `data/otp`
- Record prefix: phone-keyed
- Classification: Source / short-lived
- Sharding: flat
- Primary writers: `server/services/auth.js`
- Primary readers: OTP verification
- Index files: none
- Events emitted/listened: `otp:sent`
- Related scripts: none
- Privacy sensitivity: Auth-sensitive
- Retention / hygiene: expired OTP cleanup
- Repair / rebuild: not rebuildable
- Risks: OTP brute force, stale OTP files, rate-limit bypass
- Notes: OTP values are hashed.

### notifications

- Path: `data/notifications`
- Record prefix: `ntf_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/notifications.js`
- Primary readers: notification drawer, SSE, notification cleanup, analytics
- Index files: `notifications/user-index.json`
- Events emitted/listened: `notification:created`, `notification:action_clicked`, `notification:action_click_recorded`, `notification:conversion_recorded`
- Related scripts: `cleanup-notification-flood.js`, `repair-indexes.js`
- Privacy sensitivity: Internal / user-specific
- Retention / hygiene: notification TTL cleanup; flood cleanup quarantine-only
- Repair / rebuild: notification user index
- Risks: notification flood, user-index drift, stale unread counts
- Notes: cleanup-notification-flood.js is quarantine-only. It never deletes notifications.

### ratings

- Path: `data/ratings`
- Record prefix: `rtg_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/ratings.js`
- Primary readers: public profile, trust, analytics, calibration
- Index files: service-defined / verify from service
- Events emitted/listened: `rating:submitted`
- Related scripts: `run-trust-calibration.js`, `rollup-trust-snapshots.js`
- Privacy sensitivity: Internal / Public-safe subset
- Retention / hygiene: no destructive cleanup by default
- Repair / rebuild: rating summaries derived at read/aggregation time
- Risks: misleading averages under minimum count, trust calibration drift
- Notes: public average visibility is guarded by minimum ratings configuration.

### payments

- Path: `data/payments`
- Record prefix: `pay_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/payments.js`
- Primary readers: receipts, analytics, dispute analytics, exports
- Index files: `payments/job-index.json`
- Events emitted/listened: `payment:created`, `payment:confirmed`, `payment:completed`, `payment:disputed`
- Related scripts: `rollup-product-intelligence.js`, `export-user-data.js`
- Privacy sensitivity: Financial
- Retention / hygiene: no blind deletion; export retention separate
- Repair / rebuild: payment job index
- Risks: financial integrity, dispute window errors, CSV leakage
- Notes: admin payment completion must stay audited and capability-protected.

### reports

- Path: `data/reports`
- Record prefix: `rpt_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/reports.js`
- Primary readers: admin review, trust scoring, abuse analytics
- Index files: `reports/target-index.json`, `reports/reporter-index.json`
- Events emitted/listened: `report:created`, `report:reviewed`
- Related scripts: `repair-indexes.js`
- Privacy sensitivity: Governance-sensitive / Internal
- Retention / hygiene: status lifecycle, no blind deletion
- Repair / rebuild: reporter/target indexes
- Risks: false reports, report index drift, sensitive complaint text
- Notes: report reasons are user-generated content.

### verifications

- Path: `data/verifications`
- Record prefix: `vrf_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/verification.js`
- Primary readers: profile, admin verification review, privacy workflows
- Index files: `verifications/user-index.json`
- Events emitted/listened: `verification_reviewed`
- Related scripts: `repair-indexes.js`, `anonymize-user-data.js`, `export-user-data.js`
- Privacy sensitivity: Sensitive PII
- Retention / hygiene: image extraction to image store, delete verification images on anonymize
- Repair / rebuild: verification user index
- Risks: ID image leakage, base64 payload retention, privacy anonymization correctness
- Notes: verification images may be stored as image refs.

### attendance

- Path: `data/attendance`
- Record prefix: `att_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/attendance.js`
- Primary readers: payments, receipts, trust, analytics, workrooms
- Index files: `attendance/job-index.json`, `attendance/worker-index.json`
- Events emitted/listened: `attendance:checkin`, `attendance:checkout`, `attendance:confirmed`, `attendance:noshow`
- Related scripts: `repair-indexes.js`
- Privacy sensitivity: Internal / location-sensitive
- Retention / hygiene: no destructive cleanup by default
- Repair / rebuild: job/worker attendance indexes
- Risks: GPS false negatives, manual override misuse, no-show disputes
- Notes: check-in may store coordinates.

### audit

- Path: `data/audit`
- Record prefix: `aud_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/auditLog.js`
- Primary readers: admin audit log, audit search, audit index, retention
- Index files: `audit/indexes`
- Events emitted/listened: `audit:logged`, `audit:deleted`
- Related scripts: `rebuild-audit-index.js`, `verify-audit-index.js`
- Privacy sensitivity: Governance-sensitive / Operational
- Retention / hygiene: audit retention cleanup
- Repair / rebuild: audit index derived from audit records
- Risks: audit index staleness, audit export leakage, retention cleanup failures
- Notes: audit records are append-oriented source records.

### messages

- Path: `data/messages`
- Record prefix: `msg_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/messages.js`, workroom messaging
- Primary readers: workrooms, notifications, analytics, workroom search
- Index files: `messages/job-index.json`, `messages/user-index.json`
- Events emitted/listened: `message:created`, `message:broadcast`
- Related scripts: `repair-indexes.js`, `rebuild-workroom-search.js`, `verify-workroom-indexes.js`
- Privacy sensitivity: Internal / user-generated content
- Retention / hygiene: no destructive cleanup by default
- Repair / rebuild: message indexes and workroom search indexes
- Risks: contact-info leakage, content filter false positives, broadcast overuse
- Notes: workroom messages reuse this collection with `source='workroom'`.

### push_subscriptions

- Path: `data/push_subscriptions`
- Record prefix: `psub_` / verify from service
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/webpush.js`
- Primary readers: Web Push delivery
- Index files: `push_subscriptions/user-index.json`
- Events emitted/listened: push delivery is event-driven
- Related scripts: `generate-vapid-keys.js`, `repair-indexes.js`
- Privacy sensitivity: Internal / Auth-adjacent endpoint metadata
- Retention / hygiene: unsubscribe cleanup
- Repair / rebuild: push user index
- Risks: stale endpoints, missing VAPID keys
- Notes: push subscriptions are user-specific.

### alerts

- Path: `data/alerts`
- Record prefix: `alt_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/jobAlerts.js`
- Primary readers: job alerts matcher, user alert UI
- Index files: `alerts/user-index.json`
- Events emitted/listened: listens to `job:created`
- Related scripts: `repair-indexes.js`
- Privacy sensitivity: Internal
- Retention / hygiene: delete/toggle by owner
- Repair / rebuild: user alerts index
- Risks: stale alert criteria, index drift
- Notes: alert matching creates notifications.

### favorites

- Path: `data/favorites`
- Record prefix: `fav_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/favorites.js`
- Primary readers: employer favorites UI
- Index files: `favorites/user-index.json`
- Events emitted/listened: none central
- Related scripts: `repair-indexes.js`
- Privacy sensitivity: Internal
- Retention / hygiene: explicit removal
- Repair / rebuild: user favorites index
- Risks: stale favorite target users
- Notes: enriched with public worker profile at read time.

### images

- Path: `data/images`
- Record prefix: `img_` public ref; content-addressed hash filenames
- Classification: Source / object-store boundary
- Sharding: hash-prefix bucketing
- Primary writers: `server/services/imageStore.js`, verification, workroom attachments
- Primary readers: `server/handlers/imageHandler.js`, verification/workroom flows
- Index files: metadata sidecars are service-defined
- Events emitted/listened: attachment upload events through workroom services
- Related scripts: `cleanup-attachments.js`, `verify-file-health.js`
- Privacy sensitivity: Sensitive PII depending purpose
- Retention / hygiene: orphan attachment cleanup, anonymization deletes verification images
- Repair / rebuild: metadata/binary reconciliation scripts
- Risks: sensitive image leakage, large binary growth, orphan files
- Notes: this is the current image/object store boundary; no external object storage is implemented.

### availability_windows

- Path: `data/availability_windows`
- Record prefix: `aw_`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/availabilityWindow.js`
- Primary readers: instant match and worker availability checks
- Index files: none
- Events emitted/listened: none central
- Related scripts: `verify-data-json.js`
- Privacy sensitivity: Internal
- Retention / hygiene: explicit delete by user
- Repair / rebuild: not indexed
- Risks: stale availability windows
- Notes: when no windows exist, default behavior can be always available.

### instant_matches

- Path: `data/instant_matches`
- Record prefix: `im_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/instantMatch.js`
- Primary readers: live feed, instant accept handler, health stats
- Index files: none
- Events emitted/listened: `instant_match:candidates`, `instant_match:accepted`, `instant_match:expired`
- Related scripts: `verify-data-json.js`
- Privacy sensitivity: Operational / Internal
- Retention / hygiene: expiry sweep
- Repair / rebuild: not indexed
- Risks: timeout races, first-accept-wins lock discipline
- Notes: instant accept creates accepted application.

### availability_ads

- Path: `data/availability_ads`
- Record prefix: `aad_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/availabilityAd.js`
- Primary readers: worker discovery, ad matcher, direct offers
- Index files: `availability_ads/worker-index.json`
- Events emitted/listened: `ad:created`, `ad:expired`, `ad:withdrawn`, `ad:matched`, `ad:job_match`
- Related scripts: `repair-indexes.js`
- Privacy sensitivity: Internal / location-sensitive
- Retention / hygiene: expire stale ads
- Repair / rebuild: worker ads index
- Risks: stale active ads, geo privacy, offer spam
- Notes: max one active ad per worker.

### direct_offers

- Path: `data/direct_offers`
- Record prefix: `dof_`
- Classification: Source
- Sharding: monthly sharded
- Primary writers: `server/services/directOffer.js`
- Primary readers: worker/employer offer UI, analytics, abuse detector, counters
- Index files: `direct_offers/employer-index.json`, `direct_offers/worker-index.json`
- Events emitted/listened: `direct_offer:created`, `direct_offer:accepted`, `direct_offer:declined`, `direct_offer:expired`, `direct_offer:withdrawn`
- Related scripts: `repair-indexes.js`, `rebuild-counters.js`, `compact-counters.js`
- Privacy sensitivity: Internal / PII after accept
- Retention / hygiene: expiry sweep
- Repair / rebuild: employer/worker indexes, counters derived from offers
- Risks: spam, offer bombing, counter drift, identity reveal bugs, synthetic job leakage
- Notes: accepted offers create synthetic private jobs and accepted applications.

### abuse_flag_reviews

- Path: `data/abuse_flag_reviews`
- Record prefix: fingerprint hash
- Classification: Source / Governance-sensitive
- Sharding: flat
- Primary writers: `server/services/abuseFlagReview.js`
- Primary readers: admin review UI, trust analytics, decision quality
- Index files: none
- Events emitted/listened: `abuse_flag:state_changed`
- Related scripts: none direct
- Privacy sensitivity: Governance-sensitive
- Retention / hygiene: snooze lazy expiry
- Repair / rebuild: not derived
- Risks: false positives, warning overuse, bulk action misuse
- Notes: human-in-the-loop is mandatory.

### predictive_signals

- Path: `data/predictive_signals`
- Record prefix: service-defined / verify from `predictiveAbuse.js`
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/predictiveAbuse.js`
- Primary readers: admin predictive dashboards, retention, precision analytics
- Index files: archive index is derived
- Events emitted/listened: `predictive_abuse:signal_created`, `predictive_abuse:signal_updated`, `predictive_abuse:signal_escalated`, `predictive_abuse:scan_failed`
- Related scripts: `compact-predictive-signals.js`, `inspect-predictive-scan-queue.js`
- Privacy sensitivity: Governance-sensitive / Operational
- Retention / hygiene: resolved signals archived by retention
- Repair / rebuild: predictive archive index is derived
- Risks: false positives, punitive automation misuse
- Notes: no auto-ban.

### workrooms

- Path: `data/workrooms`
- Record prefix: jobId / service-defined
- Classification: Source
- Sharding: flat
- Primary writers: `server/services/workroom.js`
- Primary readers: workroom UI, summary, hygiene
- Index files: sidecar directories for receipts/pins/checklists/search
- Events emitted/listened: `workroom:opened`, `workroom:message_sent`, `workroom:timeline_viewed`
- Related scripts: `compact-workrooms.js`, `verify-workroom-indexes.js`
- Privacy sensitivity: Internal
- Retention / hygiene: workroom hygiene compaction
- Repair / rebuild: sidecar compaction and search rebuild
- Risks: sidecar growth, stale timeline, search drift
- Notes: messages remain in `messages`.

---

## Derived Indexes and Rebuildable Artifacts

### audit_indexes

- Path: `data/audit/indexes`
- Record prefix: derived index files
- Classification: Derived / Rebuildable artifact
- Sharding: filesystem partitioning by index kind/token hash
- Primary writers: `server/services/auditLogIndex.js`
- Primary readers: `server/services/auditLogSearch.js`
- Index files: itself
- Events emitted/listened: listens to `audit:logged`, `audit:deleted`
- Related scripts: `rebuild-audit-index.js`, `verify-audit-index.js`
- Privacy sensitivity: Derived artifact / Governance-sensitive metadata
- Retention / hygiene: token compaction
- Repair / rebuild: rebuild from `audit`
- Risks: stale token index, candidate cap fallback
- Notes: acceleration only; source audit records remain source of truth.

### workroom_search_indexes

- Path: `data/workrooms/search-indexes`
- Record prefix: service-defined
- Classification: Derived / Rebuildable artifact
- Sharding: artifact directory
- Primary writers: `server/services/workroomSearch.js`
- Primary readers: workroom search API
- Index files: itself
- Events emitted/listened: workroom message indexing
- Related scripts: `rebuild-workroom-search.js`, `verify-workroom-indexes.js`
- Privacy sensitivity: Derived artifact / Internal message tokens
- Retention / hygiene: verify/repair/compact
- Repair / rebuild: rebuild from `messages`
- Risks: search drift, stale tokens
- Notes: source messages remain source of truth.

### predictive_archive_indexes

- Path: `data/metrics/predictive-signal-archives/index`
- Record prefix: service-defined
- Classification: Derived / Rebuildable artifact
- Sharding: artifact directory
- Primary writers: `server/services/predictiveArchiveIndex.js`
- Primary readers: admin predictive archive reports
- Index files: itself
- Events emitted/listened: `predictive_archive_index:rebuilt`
- Related scripts: `rebuild-predictive-archive-index.js`
- Privacy sensitivity: Derived artifact / Governance-sensitive
- Retention / hygiene: rebuild on retention
- Repair / rebuild: rebuild from predictive signal archives
- Risks: archive search drift
- Notes: derived only.

### exports

- Path: `data/exports`
- Record prefix: `exp_` for registry records; `.csv` files for export outputs
- Classification: Derived / Operational artifact
- Sharding: flat artifact directory
- Primary writers: `server/services/exportRegistry.js`, audit CSV export
- Primary readers: admin export UI/download
- Index files: none
- Events emitted/listened: `export:created`, `export:progress`, `export:completed`, `export:failed`, `export:cancelled`
- Related scripts: none direct
- Privacy sensitivity: Governance-sensitive / may contain PII
- Retention / hygiene: export retention cleanup
- Repair / rebuild: recreate export from source data
- Risks: CSV leakage, stale files, partial exports
- Notes: export artifacts are not source of truth.

### counter_archives

- Path: `data/metrics/counter-archives`
- Record prefix: archive files by kind/month
- Classification: Derived artifact
- Sharding: monthly artifact files
- Primary writers: `server/services/counterCompaction.js`
- Primary readers: admin counter hygiene
- Index files: none
- Events emitted/listened: `counters:compaction_completed`
- Related scripts: `compact-counters.js`
- Privacy sensitivity: Evidence artifact / Operational
- Retention / hygiene: counter hygiene policy
- Repair / rebuild: counters can be rebuilt from `direct_offers`
- Risks: stale derived counters
- Notes: direct offers remain source of truth.

---

## Queue Storage Model

Queue storage is a special source model.

Queue source segments:

```text
ops_queue/pending
ops_queue/running
ops_queue/completed
ops_queue/failed
ops_queue/cancelled
ops_queue/dead-letter
```

Additional queue directories:

```text
ops_queue/idempotency
ops_queue/archive
metrics/queue/summary.json
```

Collection entries:

### ops_queue

- Path: `data/ops_queue`
- Record prefix: `q_`
- Classification: Queue source / legacy fallback
- Sharding: segmented queue storage plus legacy read fallback
- Primary writers: `server/services/opsQueue.js`, `server/services/queueStorageIndex.js`, `server/services/queueWorkers.js`
- Primary readers: queue workers, admin queue handlers, scale hygiene, ops rollups
- Index files: `metrics/queue/summary.json` derived acceleration artifact
- Events emitted/listened: `ops_queue:job_created`, `ops_queue:job_running`, `ops_queue:job_completed`, `ops_queue:job_failed`, `ops_queue:job_dead_lettered`
- Related scripts: `verify-queue.js`, `repair-queue.js`, `compact-queue.js`, `queue-retry-dlq.js`, `queue-drain.js`, `recover-stale-running-jobs.js`
- Privacy sensitivity: Operational
- Retention / hygiene: queue compaction, archive, idempotency cleanup
- Repair / rebuild: summary/location index rebuild from segmented files
- Risks: stale running jobs, summary mismatch, confirmed script misuse
- Notes: segmented queue job files are source of truth.

### queue_pending

- Path: `data/ops_queue/pending`
- Record prefix: `q_`
- Classification: Queue source
- Sharding: segmented queue status directory
- Primary writers: ops queue enqueue and status transitions
- Primary readers: queue workers and admin queue listing
- Index files: `metrics/queue/summary.json` derived
- Events emitted/listened: queue lifecycle events
- Related scripts: `verify-queue.js`, `repair-queue.js`, `compact-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: queue worker claim / compaction
- Repair / rebuild: summary rebuild only
- Risks: pending backlog, duplicate enqueue, idempotency issues
- Notes: source-of-truth segment.

### queue_running

- Path: `data/ops_queue/running`
- Record prefix: `q_`
- Classification: Queue source
- Sharding: segmented queue status directory
- Primary writers: queue workers
- Primary readers: stale running recovery, admin queue, ops rollups
- Index files: `metrics/queue/summary.json` derived
- Events emitted/listened: queue lifecycle events
- Related scripts: `recover-stale-running-jobs.js`, `verify-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: stale running detection/recovery
- Repair / rebuild: summary rebuild only
- Risks: stale leases, worker crash, duplicate execution if repaired incorrectly
- Notes: do not mutate without dry-run evidence.

### queue_completed

- Path: `data/ops_queue/completed`
- Record prefix: `q_`
- Classification: Queue source
- Sharding: segmented queue status directory
- Primary writers: queue workers
- Primary readers: queue metrics and hygiene
- Index files: `metrics/queue/summary.json` derived
- Events emitted/listened: queue lifecycle events
- Related scripts: `compact-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: archive completed after configured hours
- Repair / rebuild: summary rebuild only
- Risks: archive policy mistakes
- Notes: source-of-truth until archived.

### queue_failed

- Path: `data/ops_queue/failed`
- Record prefix: `q_`
- Classification: Queue source
- Sharding: segmented queue status directory
- Primary writers: queue workers
- Primary readers: admin retry, queue metrics
- Index files: `metrics/queue/summary.json` derived
- Events emitted/listened: `ops_queue:job_failed`
- Related scripts: `queue-retry-dlq.js`, `verify-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: archive failed after configured days
- Repair / rebuild: retry is mutation and must be controlled
- Risks: retry storm, hidden failures
- Notes: failed jobs are source records.

### queue_cancelled

- Path: `data/ops_queue/cancelled`
- Record prefix: `q_`
- Classification: Queue source
- Sharding: segmented queue status directory
- Primary writers: admin cancel and queue services
- Primary readers: admin queue listing
- Index files: `metrics/queue/summary.json` derived
- Events emitted/listened: queue cancellation events
- Related scripts: `verify-queue.js`, `compact-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: archive cancelled after configured hours
- Repair / rebuild: summary rebuild only
- Risks: accidental cancellation
- Notes: source-of-truth status segment.

### ops_queue_dead_letter

- Path: `data/ops_queue/dead-letter`
- Record prefix: `q_`
- Classification: Queue source
- Sharding: segmented queue status directory
- Primary writers: queue workers after max attempts
- Primary readers: admin DLQ, incident timeline, ops rollups
- Index files: `metrics/queue/summary.json` derived
- Events emitted/listened: `ops_queue:job_dead_lettered`
- Related scripts: `queue-retry-dlq.js`, `verify-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: archive dead-letter after configured days
- Repair / rebuild: retry is mutation and approval-sensitive
- Risks: DLQ ignored, unsafe retry, treating DLQ as externalization proof
- Notes: DLQ files are source records.

### ops_queue_idempotency

- Path: `data/ops_queue/idempotency`
- Record prefix: idempotency key records / service-defined
- Classification: Queue source / operational guard
- Sharding: flat under queue
- Primary writers: `server/services/opsQueue.js`
- Primary readers: enqueue deduplication
- Index files: none
- Events emitted/listened: queue enqueue behavior
- Related scripts: `compact-queue.js`, `verify-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: idempotency TTL cleanup
- Repair / rebuild: not blindly rebuildable
- Risks: duplicate heavy jobs if deleted incorrectly
- Notes: protects against duplicate queue execution.

### queue_archive

- Path: `data/ops_queue/archive`
- Record prefix: archived queue files
- Classification: Queue archive / Operational evidence
- Sharding: monthly artifact directories/files
- Primary writers: queue compaction/hygiene
- Primary readers: scale hygiene and forensic review
- Index files: none
- Events emitted/listened: `queue:compaction_completed`
- Related scripts: `compact-queue.js`
- Privacy sensitivity: Operational
- Retention / hygiene: queue archive policy
- Repair / rebuild: archive is not active source for workers
- Risks: losing forensic context
- Notes: archive policy must be explicit.

### queue_metrics

- Path: `data/metrics/queue`
- Record prefix: summary metrics files
- Classification: Derived / Evidence artifact
- Sharding: artifact directory
- Primary writers: queue summary and queue metrics services
- Primary readers: health/admin/scale hygiene
- Index files: `metrics/queue/summary.json`
- Events emitted/listened: `ops_queue:summary_updated`
- Related scripts: `verify-queue.js`, `repair-queue.js`
- Privacy sensitivity: Evidence artifact / Operational
- Retention / hygiene: summary rebuild
- Repair / rebuild: derived from segmented queue files
- Risks: QUEUE_SUMMARY_MISMATCH
- Notes: Queue summary/location indexes are derived acceleration artifacts.

---

## Metrics / Evidence Artifacts

Metrics and evidence artifacts are not source-of-truth business records.

### metrics

- Path: `data/metrics`
- Record prefix: mixed artifact prefixes
- Classification: Evidence artifact
- Sharding: artifact directories/files
- Primary writers: monitor, analytics, rollups, evidence cadence
- Primary readers: admin dashboards, scripts, readiness checks
- Index files: nested artifact-specific indexes
- Events emitted/listened: metrics-specific events
- Related scripts: `measure-storage-pressure.js`, `benchmark-file-paths.js`, `rollup-product-intelligence.js`
- Privacy sensitivity: Evidence artifact / Operational
- Retention / hygiene: per-service retention
- Repair / rebuild: usually recapture/recompute
- Risks: stale evidence, artifact mistaken as source data
- Notes: evidence informs decisions but does not authorize mutation.

### trust_snapshots

- Path: `data/metrics/trust-v2-snapshots`
- Record prefix: service-defined
- Classification: Evidence artifact / Derived
- Sharding: artifact directory
- Primary writers: `server/services/trustCalibration.js`
- Primary readers: trust calibration dashboards
- Related scripts: `run-trust-calibration.js`, `rollup-trust-snapshots.js`
- Privacy sensitivity: Evidence artifact / Internal
- Retention / hygiene: trust retention
- Repair / rebuild: recapture snapshots
- Risks: stale calibration evidence
- Notes: no automatic trust weight changes.

### trust_calibration

- Path: `data/metrics/trust-calibration`
- Record prefix: calibration reports / service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/trustCalibration.js`
- Primary readers: admin calibration UI
- Related scripts: `run-trust-calibration.js`
- Privacy sensitivity: Evidence artifact / Internal
- Retention / hygiene: calibration report retention
- Repair / rebuild: regenerate report
- Risks: drift interpretation errors
- Notes: advisory analytics only.

### trust_rollups

- Path: `data/metrics/trust-calibration/rollups`
- Record prefix: rollup files / service-defined
- Classification: Derived / Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/trustSnapshotRollups.js`
- Primary readers: scale hygiene, admin trust views
- Related scripts: `rollup-trust-snapshots.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: trust retention
- Repair / rebuild: rerun trust rollup
- Risks: stale rollups
- Notes: source trust snapshots remain upstream evidence.

### predictive_signal_archives

- Path: `data/metrics/predictive-signal-archives`
- Record prefix: archive files / service-defined
- Classification: Evidence artifact / Archive
- Sharding: monthly artifact directory
- Primary writers: `server/services/predictiveSignalRetention.js`
- Primary readers: precision analytics and archive index
- Related scripts: `compact-predictive-signals.js`
- Privacy sensitivity: Governance-sensitive / Evidence artifact
- Retention / hygiene: predictive retention policy
- Repair / rebuild: archive index rebuild
- Risks: false positive history loss
- Notes: active source is `predictive_signals`.

### workroom_template_metrics

- Path: `data/metrics/workroom-template-usage`
- Record prefix: service-defined
- Classification: Derived / Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/workroomTemplateMetrics.js`
- Primary readers: marketplace intelligence
- Related scripts: `verify-marketplace-intelligence.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: product intelligence retention
- Repair / rebuild: rollup/recompute from events where possible
- Risks: stale adoption data
- Notes: not source of truth.

### workroom_hygiene

- Path: `data/metrics/workroom-hygiene`
- Record prefix: hygiene reports / service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/workroomHygiene.js`
- Primary readers: scale hygiene dashboards
- Related scripts: `compact-workrooms.js`, `cleanup-attachments.js`
- Privacy sensitivity: Evidence artifact / Operational
- Retention / hygiene: hygiene cleanup interval
- Repair / rebuild: rerun inspection
- Risks: stale sidecar warnings
- Notes: workroom source sidecars remain separate.

### search_analytics

- Path: `data/metrics/search-analytics`
- Record prefix: search analytics files / service-defined
- Classification: Derived / Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/searchAnalytics.js`
- Primary readers: marketplace intelligence
- Related scripts: `rollup-product-intelligence.js`, `verify-marketplace-intelligence.js`
- Privacy sensitivity: Evidence artifact; query hashes by default
- Retention / hygiene: search analytics retention
- Repair / rebuild: rollup/recompute where possible
- Risks: raw query leakage if hashing disabled
- Notes: hashQueries should remain enabled by default.

### product_intelligence

- Path: `data/metrics/product-intelligence`
- Record prefix: `mpi_`, activation and notification conversion files / service-defined
- Classification: Evidence artifact / Derived
- Sharding: artifact directory
- Primary writers: marketplace/product intelligence services
- Primary readers: admin marketplace dashboard
- Related scripts: `rollup-product-intelligence.js`, `verify-marketplace-intelligence.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: product intelligence retention
- Repair / rebuild: rerun rollups
- Risks: stale rollups, heavy HTTP scans if misused
- Notes: HTTP dashboards should be lightweight and artifact-based.

### matching_metrics

- Path: `data/metrics/matching`
- Record prefix: service-defined
- Classification: Evidence artifact / Derived
- Sharding: artifact directory
- Primary writers: matching intelligence services
- Primary readers: admin matching quality
- Related scripts: `verify-marketplace-intelligence.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: product intelligence retention
- Repair / rebuild: recapture/recompute
- Risks: match scoring misinterpretation
- Notes: no punitive automation.

### payment_dispute_analytics

- Path: `data/metrics/payment-disputes`
- Record prefix: service-defined
- Classification: Evidence artifact / Derived
- Sharding: artifact directory
- Primary writers: `server/services/paymentDisputeAnalytics.js`
- Primary readers: marketplace intelligence, finance/admin
- Related scripts: `rollup-product-intelligence.js`
- Privacy sensitivity: Financial evidence artifact
- Retention / hygiene: product intelligence retention
- Repair / rebuild: recompute from payments
- Risks: dispute trend misinterpretation
- Notes: payments remain source of truth.

### storage_pressure

- Path: `data/metrics/storage-pressure`
- Record prefix: storage pressure snapshots / service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/storagePressure.js`
- Primary readers: scale thresholds, externalization readiness, Phase 61 evidence
- Related scripts: `measure-storage-pressure.js`, `verify-scale-thresholds.js`
- Privacy sensitivity: Evidence artifact / Operational
- Retention / hygiene: storage pressure retention
- Repair / rebuild: recapture snapshot
- Risks: one-off warning mistaken as externalization proof
- Notes: repeated evidence is required before decisions.

### scale_thresholds

- Path: `data/metrics/scale-thresholds`
- Record prefix: service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/scaleThresholds.js`
- Primary readers: admin scale endpoints and Phase 61 evidence
- Related scripts: `verify-scale-thresholds.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: evidence cadence
- Repair / rebuild: rerun verification
- Risks: advisory threshold mistaken as strict runtime blocker
- Notes: current mode is advisory unless explicitly configured otherwise.

### scale_hygiene

- Path: `data/metrics/scale-hygiene`
- Record prefix: service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/scaleHygiene.js`
- Primary readers: admin scale hygiene dashboard
- Related scripts: scale/verify/repair scripts
- Privacy sensitivity: Evidence artifact / Operational
- Retention / hygiene: evidence retention
- Repair / rebuild: rerun inspections
- Risks: stale warnings
- Notes: HTTP overview should stay lightweight.

### ops_rollups

- Path: `data/metrics/ops-rollups`
- Record prefix: `or_`
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/metricsRollups.js`
- Primary readers: ops SLO, health, incident timeline
- Events emitted/listened: `ops_rollup:captured`, `ops_slo:violated`
- Related scripts: `ops-weekly-review.js`
- Privacy sensitivity: Operational evidence
- Retention / hygiene: ops rollup retention
- Repair / rebuild: recapture rollup
- Risks: stale SLO evidence
- Notes: SLO violations may open incidents.

### incidents

- Path: `data/metrics/incidents`
- Record prefix: `inc_`
- Classification: Governance-sensitive / Operational source
- Sharding: artifact directory
- Primary writers: `server/services/incidentTimeline.js`
- Primary readers: admin incident UI, postmortems
- Events emitted/listened: `incident:opened`, `incident:event_appended`, `incident:resolved`
- Related scripts: `export-incident-timeline.js`
- Privacy sensitivity: Governance-sensitive / Operational
- Retention / hygiene: incident retention
- Repair / rebuild: not derived
- Risks: missing postmortems, incomplete timeline
- Notes: auto-open for critical operational events.

### backup_restore_drills

- Path: `data/metrics/backup-restore-drills`
- Record prefix: `brd_`
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/backupRestoreDrill.js`
- Primary readers: production readiness, deployment gate
- Events emitted/listened: `backup_restore_drill:started`, `backup_restore_drill:passed`, `backup_restore_drill:failed`
- Related scripts: `run-backup-restore-drill.js`
- Privacy sensitivity: Operational evidence
- Retention / hygiene: retention count
- Repair / rebuild: rerun drill
- Risks: stale restore evidence
- Notes: production deployment may require fresh successful drill.

### benchmark_history

- Path: `data/metrics/benchmarks`
- Record prefix: `bmk_`
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/benchmarkHistory.js`
- Primary readers: externalization decision, Phase 61 evidence
- Related scripts: `benchmark-file-paths.js`, `list-benchmark-history.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: benchmark retention
- Repair / rebuild: rerun benchmark
- Risks: single benchmark mistaken as decision evidence
- Notes: repeated evidence is required.

### externalization_decisions

- Path: `data/metrics/externalization-decisions`
- Record prefix: `edc_`
- Classification: Evidence artifact / Governance advisory
- Sharding: artifact directory
- Primary writers: `server/services/externalizationDecision.js`
- Primary readers: Phase 60/61 admin views and pilot gate
- Related scripts: `capture-externalization-decision.js`
- Privacy sensitivity: Evidence artifact / Governance-sensitive
- Retention / hygiene: decision snapshot retention
- Repair / rebuild: recapture decision
- Risks: mistaken as implementation approval
- Notes: advisory-only; implementationAllowed=false.

### phase61_evidence

- Path: `data/metrics/phase61-evidence`
- Record prefix: service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/phase61EvidenceCadence.js`
- Primary readers: pilot gate, admin Phase 61 dashboard
- Related scripts: `capture-phase61-evidence.js`
- Privacy sensitivity: Evidence artifact / Governance
- Retention / hygiene: evidence cadence
- Repair / rebuild: recapture snapshot
- Risks: stale evidence
- Notes: does not authorize pilot.

### pilot_decisions

- Path: `data/metrics/pilot-decisions`
- Record prefix: service-defined
- Classification: Governance advisory artifact
- Sharding: artifact directory
- Primary writers: `server/services/pilotDecisionGate.js`
- Primary readers: admin Pilot Gate UI
- Related scripts: `evaluate-pilot-gate.js`
- Privacy sensitivity: Governance-sensitive
- Retention / hygiene: evidence cadence
- Repair / rebuild: recapture gate decision
- Risks: mistaken as pilot approval
- Notes: pilotAllowed=false by default.

### repository_contract_reports

- Path: `data/metrics/repository-contracts`
- Record prefix: service-defined
- Classification: Evidence artifact / Docs-only contract report
- Sharding: artifact directory
- Primary writers: `server/services/repositoryContractReport.js`
- Primary readers: Phase 61 repository contracts UI
- Related scripts: `verify-repository-contracts.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: evidence cadence
- Repair / rebuild: rerun verification
- Risks: mistaken as runtime switch readiness
- Notes: runtimeSwitchEnabled=false; docsOnly=true.

---

## Governance / Privacy Artifacts

### privacy_requests

- Path: `data/privacy_requests`
- Record prefix: service-defined / verify from `privacyRequests.js`
- Classification: Governance-sensitive source
- Sharding: flat
- Primary writers: `server/services/privacyRequests.js`
- Primary readers: governance admin UI, queue workers, user export/anonymization
- Events emitted/listened: `privacy_request:created`, `privacy_request:queued`, `privacy_request:completed`, `privacy_request:failed`, `privacy_request:cancelled`
- Related scripts: `export-user-data.js`, `anonymize-user-data.js`, `verify-privacy-governance.js`
- Privacy sensitivity: Governance-sensitive / PII workflow
- Retention / hygiene: request retention policy, export retention
- Repair / rebuild: not derived
- Risks: irreversible anonymization, export leakage, missing approvals
- Notes: anonymization requires explicit approval where configured.

### admin_approvals

- Path: `data/ops/admin-approvals`
- Record prefix: `apr_`
- Classification: Governance-sensitive source
- Sharding: flat
- Primary writers: `server/services/adminApprovals.js`
- Primary readers: RBAC/governance handlers, privacy anonymization
- Events emitted/listened: `admin_approval:created`, `admin_approval:approved`, `admin_approval:rejected`, `admin_approval:expired`, `admin_approval:consumed`
- Related scripts: `verify-admin-rbac.js`, `verify-privacy-governance.js`
- Privacy sensitivity: Governance-sensitive
- Retention / hygiene: approval retention policy
- Repair / rebuild: not derived
- Risks: dangerous action without approval, stale pending approvals
- Notes: approval does not execute the action.

### ops_reviews

- Path: `data/ops/reviews`
- Record prefix: service-defined
- Classification: Governance-sensitive source
- Sharding: flat
- Primary writers: `server/services/opsReviewRecords.js`
- Primary readers: governance dashboard, Phase 61 evidence
- Events emitted/listened: `ops_review:created`, `ops_review:completed`
- Related scripts: `ops-weekly-review.js`, `verify-privacy-governance.js`
- Privacy sensitivity: Governance-sensitive / Operational
- Retention / hygiene: review retention policy
- Repair / rebuild: not derived
- Risks: missing weekly reviews
- Notes: evidence cadence may require weekly review link.

### postmortems

- Path: `data/ops/postmortems`
- Record prefix: service-defined
- Classification: Governance-sensitive source
- Sharding: flat
- Primary writers: `server/services/postmortemRecords.js`
- Primary readers: governance dashboard, incident view, pilot gate
- Events emitted/listened: `postmortem:created`, `postmortem:updated`, `postmortem:action_item_added`, `postmortem:action_item_updated`
- Related scripts: `verify-privacy-governance.js`
- Privacy sensitivity: Governance-sensitive / Operational
- Retention / hygiene: action item retention
- Repair / rebuild: not derived
- Risks: overdue critical action items, missing critical incident postmortems
- Notes: critical incidents may require postmortems.

### ops

- Path: `data/ops`
- Record prefix: mixed operational records
- Classification: Operational / Governance
- Sharding: flat
- Primary writers: maintenance mode and idempotency marker services
- Primary readers: maintenance middleware and ops tooling
- Events emitted/listened: `maintenance:enabled`, `maintenance:disabled`
- Related scripts: ops scripts
- Privacy sensitivity: Operational
- Retention / hygiene: service-defined
- Repair / rebuild: not generally derived
- Risks: stale maintenance state, marker misuse
- Notes: contains maintenance state and operational markers.

---

## Migration / Rehearsal Artifacts

### migration_snapshots

- Path: `data/migration-snapshots` or `./migration-snapshots`
- Record prefix: snapshot directories / manifests
- Classification: Evidence artifact
- Sharding: snapshot directory
- Primary writers: `scripts/export-migration-snapshot.js`
- Primary readers: validation/rehearsal services
- Events emitted/listened: none central
- Related scripts: `export-migration-snapshot.js`, `validate-migration-snapshot.js`
- Privacy sensitivity: Sensitive depending included collections
- Retention / hygiene: manual artifact management
- Repair / rebuild: export fresh snapshot
- Risks: secrets/base64 leakage, checksum mismatch, referential integrity errors
- Notes: snapshot export does not externalize data.

### migration_rehearsals

- Path: `data/migration-snapshots/rehearsals`
- Record prefix: rehearsal reports / service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/migrationRehearsal` / handler validation-only flow and scripts
- Primary readers: Phase 60/61 dashboards
- Related scripts: `run-migration-rehearsal.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: retention count
- Repair / rebuild: rerun rehearsal
- Risks: mistaken as migration execution approval
- Notes: no external DB connection is implemented.

### rollback_rehearsals

- Path: `data/migration-snapshots/rehearsals/rollback`
- Record prefix: service-defined
- Classification: Evidence artifact
- Sharding: artifact directory
- Primary writers: `server/services/rollbackRehearsal.js`
- Primary readers: pilot gate, Phase 61 dashboard
- Related scripts: `run-rollback-rehearsal.js`
- Privacy sensitivity: Evidence artifact
- Retention / hygiene: retention count
- Repair / rebuild: rerun rollback rehearsal
- Risks: missing rollback proof before pilot
- Notes: sourceDataMutated=false and externalDbConnected=false are expected.

---

## Image/Object Store Boundary

Current image/object boundary:

```text
server/services/imageStore.js
data/images
content-addressed SHA-256 binary files
hash-prefix bucketing
metadata sidecars
```

Rules:

```text
Images are still local file-backed source artifacts.
No external object storage is implemented.
Verification images can be Sensitive PII.
Workroom attachments can be Internal user-generated content.
Anonymization may delete verification images.
Attachment cleanup must be dry-run-first where destructive.
```

Related scripts:

```text
scripts/cleanup-attachments.js
scripts/verify-file-health.js
scripts/anonymize-user-data.js
```

---

## Collection Ownership Matrix

| Collection / group | Path | Prefix | Class | Sharding | Primary owner service | Privacy |
|---|---|---|---|---|---|---|
| `users` | `users` | `usr_` | Source | flat | `users.js` | PII / Sensitive PII |
| `sessions` | `sessions` | token-keyed | Source | flat | `sessions.js` | Auth-sensitive |
| `jobs` | `jobs` | `job_` | Source | monthly sharded | `jobs.js` | Internal / Public-safe subset |
| `applications` | `applications` | `app_` | Source | monthly sharded | `applications.js` | Internal |
| `otp` | `otp` | phone-keyed | Source short-lived | flat | `auth.js` | Auth-sensitive |
| `notifications` | `notifications` | `ntf_` | Source | monthly sharded | `notifications.js` | Internal / user-specific |
| `ratings` | `ratings` | `rtg_` | Source | monthly sharded | `ratings.js` | Internal / Public-safe subset |
| `payments` | `payments` | `pay_` | Source | monthly sharded | `payments.js` | Financial |
| `reports` | `reports` | `rpt_` | Source | flat | `reports.js` | Governance-sensitive |
| `verifications` | `verifications` | `vrf_` | Source | flat | `verification.js` | Sensitive PII |
| `attendance` | `attendance` | `att_` | Source | monthly sharded | `attendance.js` | Internal / location-sensitive |
| `audit` | `audit` | `aud_` | Source | flat | `auditLog.js` | Governance-sensitive / Operational |
| `messages` | `messages` | `msg_` | Source | monthly sharded | `messages.js` | Internal / UGC |
| `push_subscriptions` | `push_subscriptions` | `psub_` / verify from service | Source | flat | `webpush.js` | Internal |
| `alerts` | `alerts` | `alt_` | Source | flat | `jobAlerts.js` | Internal |
| `metrics` | `metrics` | mixed | Evidence | artifact dirs | multiple services | Evidence artifact |
| `favorites` | `favorites` | `fav_` | Source | flat | `favorites.js` | Internal |
| `images` | `images` | `img_` refs / hash files | Source object boundary | hash buckets | `imageStore.js` | Sensitive PII depending purpose |
| `availability_windows` | `availability_windows` | `aw_` | Source | flat | `availabilityWindow.js` | Internal |
| `instant_matches` | `instant_matches` | `im_` | Source | monthly sharded | `instantMatch.js` | Operational / Internal |
| `availability_ads` | `availability_ads` | `aad_` | Source | monthly sharded | `availabilityAd.js` | Internal / location-sensitive |
| `direct_offers` | `direct_offers` | `dof_` | Source | monthly sharded | `directOffer.js` | Internal / PII after accept |
| `abuse_flag_reviews` | `abuse_flag_reviews` | fingerprint hash | Source governance | flat | `abuseFlagReview.js` | Governance-sensitive |
| `audit_indexes` | `audit/indexes` | derived files | Derived artifact | filesystem | `auditLogIndex.js` | Derived / Governance metadata |
| `exports` | `exports` | `exp_` | Derived artifact | flat | `exportRegistry.js` | Sensitive export artifact |
| `counter_archives` | `metrics/counter-archives` | archive files | Derived artifact | monthly files | `counterCompaction.js` | Evidence artifact |
| `predictive_signals` | `predictive_signals` | verify from service | Source governance | flat | `predictiveAbuse.js` | Governance-sensitive |
| `workrooms` | `workrooms` | jobId/service-defined | Source | flat | `workroom.js` | Internal |
| `trust_snapshots` | `metrics/trust-v2-snapshots` | service-defined | Evidence | artifact dirs | `trustCalibration.js` | Evidence artifact |
| `ops_queue` | `ops_queue` | `q_` | Queue source / legacy | segmented fallback | `opsQueue.js` | Operational |
| `ops_queue_idempotency` | `ops_queue/idempotency` | service-defined | Queue source guard | flat | `opsQueue.js` | Operational |
| `ops_queue_dead_letter` | `ops_queue/dead-letter` | `q_` | Queue source | segmented | `opsQueue.js` | Operational |
| `alert_deliveries` | `alert_deliveries` | `adl_` | Source operational | flat | `alertDeliveryHistory.js` | Operational |
| `queue_metrics` | `metrics/queue` | summary files | Derived artifact | artifact dir | `queueStorageIndex.js` | Operational evidence |
| `workroom_receipts` | `workrooms/receipts` | service-defined | Source sidecar | flat | `workroomReceipts.js` | Internal |
| `workroom_pins` | `workrooms/pins` | service-defined | Source sidecar | flat | `workroomPins.js` | Internal |
| `workroom_checklists` | `workrooms/checklists` | service-defined | Source sidecar | flat | `workroomChecklist.js` | Internal |
| `workroom_search_indexes` | `workrooms/search-indexes` | derived files | Derived artifact | artifact dir | `workroomSearch.js` | Derived / Internal |
| `workroom_template_metrics` | `metrics/workroom-template-usage` | service-defined | Evidence | artifact dir | `workroomTemplateMetrics.js` | Evidence artifact |
| `trust_calibration` | `metrics/trust-calibration` | service-defined | Evidence | artifact dir | `trustCalibration.js` | Evidence artifact |
| `predictive_signal_archives` | `metrics/predictive-signal-archives` | archive files | Evidence archive | monthly artifacts | `predictiveSignalRetention.js` | Governance evidence |
| `ops_locks` | `ops_locks` | lock-name keyed | Operational source | flat | `processLock.js` | Operational |
| `scheduler` | `scheduler` | scheduler-name keyed | Operational source | flat | `schedulerRegistry.js` | Operational |
| `ops_rollups` | `metrics/ops-rollups` | `or_` | Evidence | artifact dir | `metricsRollups.js` | Operational evidence |
| `incidents` | `metrics/incidents` | `inc_` | Operational source | artifact dir | `incidentTimeline.js` | Governance-sensitive |
| `backup_restore_drills` | `metrics/backup-restore-drills` | `brd_` | Evidence | artifact dir | `backupRestoreDrill.js` | Operational evidence |
| `ops` | `ops` | mixed | Operational source | flat | maintenance/jobs services | Operational |
| `privacy_requests` | `privacy_requests` | verify from service | Governance source | flat | `privacyRequests.js` | Governance-sensitive |
| `ops_reviews` | `ops/reviews` | service-defined | Governance source | flat | `opsReviewRecords.js` | Governance-sensitive |
| `postmortems` | `ops/postmortems` | service-defined | Governance source | flat | `postmortemRecords.js` | Governance-sensitive |
| `admin_approvals` | `ops/admin-approvals` | `apr_` | Governance source | flat | `adminApprovals.js` | Governance-sensitive |
| `queue_pending` | `ops_queue/pending` | `q_` | Queue source | segmented | `opsQueue.js` | Operational |
| `queue_running` | `ops_queue/running` | `q_` | Queue source | segmented | `opsQueue.js` | Operational |
| `queue_completed` | `ops_queue/completed` | `q_` | Queue source | segmented | `opsQueue.js` | Operational |
| `queue_failed` | `ops_queue/failed` | `q_` | Queue source | segmented | `opsQueue.js` | Operational |
| `queue_cancelled` | `ops_queue/cancelled` | `q_` | Queue source | segmented | `opsQueue.js` | Operational |
| `queue_archive` | `ops_queue/archive` | archived `q_` | Queue archive | monthly/archive | `queueCompaction.js` | Operational evidence |
| `scheduler_history` | `scheduler/history` | service-defined | Evidence | artifact dir | `schedulerRunHistory.js` | Operational evidence |
| `workroom_hygiene` | `metrics/workroom-hygiene` | service-defined | Evidence | artifact dir | `workroomHygiene.js` | Operational evidence |
| `trust_rollups` | `metrics/trust-calibration/rollups` | service-defined | Evidence | artifact dir | `trustSnapshotRollups.js` | Evidence artifact |
| `predictive_archive_indexes` | `metrics/predictive-signal-archives/index` | derived files | Derived artifact | artifact dir | `predictiveArchiveIndex.js` | Derived artifact |
| `scale_hygiene` | `metrics/scale-hygiene` | service-defined | Evidence | artifact dir | `scaleHygiene.js` | Operational evidence |
| `search_analytics` | `metrics/search-analytics` | service-defined | Evidence | artifact dir | `searchAnalytics.js` | Evidence artifact |
| `product_intelligence` | `metrics/product-intelligence` | `mpi_` and service-defined | Evidence | artifact dir | `marketplaceIntelligenceRollups.js` | Evidence artifact |
| `matching_metrics` | `metrics/matching` | service-defined | Evidence | artifact dir | `matchingIntelligence.js` | Evidence artifact |
| `payment_dispute_analytics` | `metrics/payment-disputes` | service-defined | Evidence | artifact dir | `paymentDisputeAnalytics.js` | Financial evidence |
| `storage_pressure` | `metrics/storage-pressure` | service-defined | Evidence | artifact dir | `storagePressure.js` | Operational evidence |
| `scale_thresholds` | `metrics/scale-thresholds` | service-defined | Evidence | artifact dir | `scaleThresholds.js` | Operational evidence |
| `migration_snapshots` | `migration-snapshots` | snapshot dirs | Evidence | artifact dir | scripts | Sensitive evidence |
| `benchmark_history` | `metrics/benchmarks` | `bmk_` | Evidence | artifact dir | `benchmarkHistory.js` | Evidence artifact |
| `migration_rehearsals` | `migration-snapshots/rehearsals` | service-defined | Evidence | artifact dir | rehearsal scripts/services | Evidence artifact |
| `externalization_decisions` | `metrics/externalization-decisions` | `edc_` | Evidence / advisory | artifact dir | `externalizationDecision.js` | Governance evidence |
| `phase61_evidence` | `metrics/phase61-evidence` | service-defined | Evidence | artifact dir | `phase61EvidenceCadence.js` | Governance evidence |
| `rollback_rehearsals` | `migration-snapshots/rehearsals/rollback` | service-defined | Evidence | artifact dir | `rollbackRehearsal.js` | Evidence artifact |
| `pilot_decisions` | `metrics/pilot-decisions` | service-defined | Governance advisory | artifact dir | `pilotDecisionGate.js` | Governance-sensitive |
| `repository_contract_reports` | `metrics/repository-contracts` | service-defined | Evidence / docs-only | artifact dir | `repositoryContractReport.js` | Evidence artifact |

---

## Repair / Rebuild Tooling Matrix

| Tool | Data scope | Mutates source data? | Purpose | Safety posture |
|---|---|---:|---|---|
| `scripts/repair-indexes.js` | secondary index files | `sourceDataMutated:false` | rebuild derived secondary indexes | dry-run-first; confirmed requires approval |
| `scripts/rebuild-audit-index.js` | `audit/indexes` | no source mutation | rebuild audit filesystem index | derived artifact rebuild |
| `scripts/verify-audit-index.js` | `audit/indexes` | no | verify audit index | read-only |
| `scripts/rebuild-workroom-search.js` | `workrooms/search-indexes` | no source mutation | rebuild workroom search indexes | derived artifact rebuild |
| `scripts/verify-workroom-indexes.js` | workroom search indexes | no | verify workroom indexes | read-only |
| `scripts/rebuild-predictive-archive-index.js` | predictive archive index | no source mutation | rebuild archive index | derived artifact rebuild |
| `scripts/rebuild-counters.js` | direct-offer counters | no source mutation | rebuild derived counters from `direct_offers` | derived artifact rebuild |
| `scripts/compact-counters.js` | direct-offer counters/archive | no direct-offer source mutation | compact/archival derived counters | dry-run/controlled |
| `scripts/verify-queue.js` | queue segmented files + summary | no | verify queue consistency | read-only |
| `scripts/repair-queue.js` | queue summary/location indexes | can mutate derived queue indexes | repair queue derived artifacts | dry-run-first; confirmed requires approval |
| `scripts/compact-queue.js` | queue status/archive files | can move queue records | queue hygiene/archive | dry-run-first; confirmed requires explicit approval |
| `scripts/queue-retry-dlq.js` | dead-letter queue jobs | yes, retry mutation | retry selected DLQ jobs | dry-run-first; approval-controlled |
| `scripts/queue-drain.js` | active queue | yes, dangerous | drain/stop queue work | Do not run queue-drain --confirm as remediation |
| `scripts/recover-stale-running-jobs.js` | running queue segment | yes, recovery mutation | recover stale running jobs | dry-run-first; avoid duplicate execution |
| `scripts/cleanup-notification-flood.js` | notifications + notifications/user-index.json | quarantine move only in confirmed mode | quarantine notification flood records | cleanup-notification-flood.js is quarantine-only; It never deletes notifications |
| `scripts/cleanup-attachments.js` | image/workroom attachment artifacts | can delete orphan artifacts | attachment hygiene | dry-run-first |
| `scripts/verify-data-json.js` | all JSON source/artifacts | no | JSON parse verification | read-only |
| `scripts/verify-file-health.js` | data files | no | file size/tmp/base64 health | read-only |
| `scripts/quarantine-corrupt-json.js` | corrupt JSON files | can move files | quarantine corrupt JSON | dry-run-first; confirmed requires explicit approval |
| `scripts/export-user-data.js` | user-related source records | no source mutation | privacy export | output artifact is sensitive |
| `scripts/anonymize-user-data.js` | user-related source records | yes, irreversible | privacy anonymization | requires approval/backup; never run casually |
| `scripts/export-migration-snapshot.js` | source collections | no source mutation | migration snapshot evidence | sensitive artifact |
| `scripts/validate-migration-snapshot.js` | migration snapshots | no | snapshot validation | read-only |
| `scripts/run-migration-rehearsal.js` | snapshot/rehearsal artifacts | no source mutation expected | rehearsal evidence | no external DB implemented |
| `scripts/run-rollback-rehearsal.js` | rollback rehearsal artifacts | no source mutation expected | rollback evidence | no external DB implemented |
| `scripts/benchmark-file-paths.js` | file paths/read performance | no | benchmark evidence | read-only measurement |
| `scripts/measure-storage-pressure.js` | data directories | no | storage pressure evidence | read-only unless persisting evidence artifact |
| `scripts/capture-externalization-decision.js` | evidence artifacts | no source mutation | advisory decision snapshot | does not authorize externalization |
| `scripts/capture-phase61-evidence.js` | evidence artifacts | no source mutation | evidence cadence snapshot | does not authorize pilot |
| `scripts/evaluate-pilot-gate.js` | evidence artifacts | no source mutation | pilot gate evaluation | pilot blocked by default |
| `scripts/verify-repository-contracts.js` | docs/contracts | no | repository contract readiness | docs-only; no runtime switch |

---

## Collection-Level Risks

| Risk | Affected collections / artifacts | Why it matters | Required posture |
|---|---|---|---|
| Secondary index drift | `users/phone-index.json`, `jobs/index.json`, `applications/*-index.json`, `notifications/user-index.json`, others | UI/API may miss source records | Rebuild derived indexes only; do not mutate source records |
| Queue summary mismatch | `metrics/queue/summary.json`, segmented queue files | Summary may be stale or wrong | Queue segmented files are source of truth when summary mismatch exists |
| Unsafe queue remediation | `ops_queue/*` | Duplicate execution or lost operational jobs | Do not run queue-drain --confirm as remediation |
| Notification flood | `notifications`, `notifications/user-index.json` | User UX/admin noise | cleanup-notification-flood.js is quarantine-only; It never deletes notifications |
| Duplicate sharded/flat records | sharded collections | stale physical copy may win if read incorrectly | Diagnose before repair; source record freshness rules matter |
| Sensitive PII leakage | `users`, `verifications`, `images`, `privacy_requests` | privacy/legal risk | public profile must remain redacted; exports are sensitive |
| Financial data corruption | `payments`, receipts/exports | financial integrity risk | no blind deletion; admin actions audited |
| Audit index staleness | `audit/indexes` | search performance/fallback | audit source records remain source of truth |
| Workroom sidecar growth | workroom sidecars | large files and slow UX | compact/verify through workroom hygiene tools |
| Search index drift | `audit/indexes`, `workrooms/search-indexes`, process indexes | stale search results | derived artifact rebuild only |
| Evidence staleness | `metrics/*`, benchmarks, evidence cadence | bad operational decisions | recapture evidence; do not treat stale evidence as authority |
| Externalization misread | Phase 59/60/61 artifacts | premature PostgreSQL/Redis/external queue push | advisory-only; no runtime switching |
| Confirmed script misuse | repair/cleanup/queue scripts | source mutation risk | dry-run-first, explicit approval, no `--confirm` by default |

---

## Cross-Links

System-level architecture inventory:

```text
docs/architecture/SYSTEMS_CATALOG.md
```

Script governance catalog:

```text
docs/operations/SCRIPTS_CATALOG.md
```

Docs reality check:

```text
docs/operations/DOCS_REALITY_CHECK.md
```

Queue remediation approval runbook:

```text
docs/operations/QUEUE_REMEDIATION_APPROVAL_RUNBOOK.md
```

Storage pressure runbook:

```text
docs/operations/STORAGE_PRESSURE_RUNBOOK.md
```

Scale limits reference:

```text
docs/operations/SCALE_LIMITS.md
```

Externalization readiness reference:

```text
docs/operations/EXTERNALIZATION_READINESS.md
```

Privacy data map:

```text
docs/privacy/PRIVACY_DATA_MAP.md
```

Governance runbooks:

```text
docs/governance/DATA_GOVERNANCE_RUNBOOK.md
docs/governance/PRIVACY_REQUEST_RUNBOOK.md
docs/governance/ADMIN_RBAC_MODEL.md
```

---

## Final Safety Position

Patch 17 final safety position:

```text
No runtime change.
No deletion.
No reset.
No confirmed mutation.
No production queue mutation.
No index repair execution.
No notification quarantine execution.
No migration execution.
No externalization.
No PostgreSQL.
No Redis.
No external queue.
No external search.
No new dependencies.
No version/cache change.
```

`DATA_CATALOG.md` is:

```text
Architecture documentation baseline
collection-level data ownership map
source vs derived boundary reference
repair/rebuild ownership reference
not runtime authority
not remediation approval
not mutation approval
not migration approval
not externalization approval
```

Critical operator reminders:

```text
Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed.
Actual segmented queue files are source of truth.
Queue summary/location indexes are derived acceleration artifacts.
Do not run queue-drain --confirm as remediation.
Do not run repair-queue --confirm without dry-run evidence and explicit approval.
cleanup-notification-flood.js is quarantine-only.
It never deletes notifications.
repair-indexes.js rebuilds derived secondary indexes only.
```
