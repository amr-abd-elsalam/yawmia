# يوميّة — Externalization Readiness
> Phase 59 — Advisory Only  
> Version target: v0.55.0

هذا الملف يجهّز يوميّة لقرارات Phase 60+ بدون تنفيذ أي external database أو external queue أو external search في Phase 59.

---

## 1. Externalization is not Phase 59 implementation

Phase 59 لا تنفذ:

```text
PostgreSQL
Redis
Elastic/OpenSearch
Kafka/NATS/RabbitMQ
external object storage
distributed locks
multi-writer production
```

Phase 59 تضيف فقط:

```text
thresholds
storage pressure visibility
benchmarks
migration snapshot formats
repository boundary proposal
decision matrix
runbooks
```

---

## 2. Evidence required before externalization

لا تبدأ Phase 60+ externalization بدون evidence:

```bash
node scripts/measure-storage-pressure.js --json
node scripts/benchmark-file-paths.js --json
node scripts/verify-scale-thresholds.js --json
node scripts/ops-weekly-review.js --persist
```

Evidence should show at least one:

- repeated critical storage pressure
- repeated queue pressure
- audit/search fallback becoming expensive
- file scans breaching p95 targets
- Workroom sidecars exceeding critical thresholds repeatedly
- operational incidents caused by file-based saturation
- single-writer bottleneck blocking growth

---

## 3. Candidate collections

Configured candidates:

```text
users
jobs
applications
payments
messages
ops_queue
audit
search
images
```

Potential additional candidates later:

```text
notifications
attendance
workrooms
direct_offers
metrics
privacy/governance records
```

---

## 4. First externalization candidates

Likely order if pressure evidence supports it:

1. `messages` + Workroom data
2. `notifications`
3. `audit` + audit search
4. `ops_queue`
5. `jobs` + `applications`
6. `payments`
7. `users`
8. `images`

This order is not final.  
Phase 60 decision must use real benchmark and pressure data.

---

## 5. Repository / service boundary proposal

Current services call `database.js` directly.  
Before Phase 60 implementation, define interfaces:

```text
UserRepository
SessionRepository
JobRepository
ApplicationRepository
PaymentRepository
MessageRepository
WorkroomRepository
NotificationRepository
AuditRepository
QueueRepository
MetricsRepository
GovernanceRepository
SearchIndexRepository
ImageObjectStore
```

Example future interface shape:

```javascript
export async function findById(id)
export async function create(record)
export async function update(id, patch)
export async function listByIndex(indexName, key, options)
export async function appendEvent(record)
```

Phase 59 does not implement these repositories.  
It documents the boundary.

---

## 6. Read/write consistency requirements

Any externalization must preserve:

- atomic write semantics
- idempotent queue jobs
- session security
- audit logging
- privacy constraints
- no raw token leakage
- referential integrity across jobs/applications/payments/messages
- rollback capability

---

## 7. Dual-read strategy

Future Phase 60+ strategy:

```text
Read external store first.
Fallback to file store during migration window.
Log mismatch.
Expose mismatch metrics only to admin.
Do not expose partial inconsistent data publicly.
```

Dual-read must be disabled after successful cutover.

---

## 8. Dual-write strategy

Future Phase 60+ strategy:

```text
Write external store and file store.
Use idempotency keys.
Preserve file store as rollback source initially.
Audit all migration anomalies.
Never dual-write secrets blindly.
```

If external write succeeds but file write fails:

- mark migration anomaly
- retry idempotently
- keep rollback decision documented

If file write succeeds but external write fails:

- retry external write
- keep file store as source of truth until cutover

---

## 9. Rollback strategy

Before any externalization:

1. Create migration snapshot:

```bash
node scripts/export-migration-snapshot.js --out=./migration-snapshots/pre-phase60 --confirm
```

2. Verify snapshot:

```bash
node scripts/verify-data-json.js --strict
node scripts/verify-scale-thresholds.js --strict
```

3. Keep file store immutable or append-only during cutover window if possible.
4. To rollback:
   - disable external reads
   - restore file store snapshot if needed
   - rerun indexes/repair
   - run smoke tests
   - document incident if user impact occurred

---

## 10. Migration snapshot strategy

Snapshot format is defined in:

```text
DATA_MIGRATION_FORMATS.md
```

Snapshot is:

```text
NDJSON per collection
manifest.json
checksums
indexes snapshot
privacy exclusions
```

Phase 59 script:

```bash
node scripts/export-migration-snapshot.js --dry-run
node scripts/export-migration-snapshot.js --out=./migration-snapshots/test --confirm
```

---

## 11. Data validation strategy

Before externalization:

```bash
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
node scripts/verify-queue.js
node scripts/verify-audit-index.js
node scripts/verify-workroom-indexes.js
node scripts/verify-privacy-governance.js --strict
```

Validation must include:

- JSON parse
- zero-byte files
- stale tmp files
- secondary index integrity
- queue summary/location integrity
- Workroom search index integrity
- privacy export constraints
- anonymization preview safety

---

## 12. Privacy constraints

Externalization must not leak:

```text
session tokens
ADMIN_TOKEN
VAPID private key
webhook secrets
raw identity images
raw queue secrets
unrevealed third-party phone numbers
```

Anonymization must remain:

```text
previewable
idempotent
audited
approval-protected
```

Financial records and audit records must not be blindly deleted.

---

## 13. Queue externalization requirements

Before external queue implementation, Phase 60+ needs:

```text
atomic claim
visibility timeout
retry/backoff
dead-letter queue
idempotency keys
manual retry
job cancellation
worker concurrency
scheduler integration
admin visibility
metrics rollups
```

Current file queue remains valid for single-writer.

---

## 14. Search externalization requirements

Before external search implementation, Phase 60+ needs:

```text
Arabic normalization support
Arabic tokenization support
ranking explainability
index rebuild strategy
incremental updates
privacy-safe query analytics
zero-result analytics
fallback plan
```

Search externalization must not introduce black-box punitive scoring.

---

## 15. EventBus / SSE fanout requirements

Current:

```text
EventBus is in-memory.
Admin SSE is single-instance.
User SSE is per process.
```

Phase 60+ multi-instance needs:

```text
event bridge/pub-sub
SSE fanout
cache invalidation fanout
notification fanout
admin alert fanout
metrics event fanout
```

Without this, read-only replicas may serve reads but will not receive writer events.

---

## 16. Decision matrix for Phase 60+

| Signal | Action |
|---|---|
| one warning | compact / verify / monitor |
| repeated warnings | weekly ops review + pressure benchmark |
| one critical | backup + repair/compact + incident if impact |
| repeated critical after mitigation | externalization readiness review |
| p95 read/list/search unacceptable | benchmark and candidate ranking |
| queue claim latency high | queue externalization review |
| audit fallback too frequent | search/audit externalization review |
| multi-writer needed | external DB + external queue + event bridge required |

---

## 17. What NOT to do

```text
Do not implement PostgreSQL in Phase 59.
Do not add Redis in Phase 59.
Do not add external search in Phase 59.
Do not add external queue in Phase 59.
Do not run multiple writers.
Do not use PM2 cluster.
Do not treat file locks as distributed consensus.
Do not skip migration snapshots.
Do not ignore privacy constraints.
```
