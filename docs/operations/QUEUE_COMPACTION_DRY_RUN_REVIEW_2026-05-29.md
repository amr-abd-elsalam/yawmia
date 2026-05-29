# Queue Compaction Dry-Run Review — 2026-05-29

> Phase 61.4E — Queue Compaction / Idempotency Cleanup Review  
> Scope: documentation and safety interpretation only  
> Mutation: none  
> Externalization: none  
> Pilot: blocked

---

## Summary

On 2026-05-29, queue compaction was executed in dry-run mode after queue verify, repair dry-run, and queue-drain dry-run confirmed the remaining Phase 61 remediation blocker:

```text
QUEUE_SUMMARY_MISMATCH
```

Command:

```bash
node scripts/compact-queue.js --dry-run --json
```

Result:

```text
ok: true
dryRun: true for archive
dryRun: true for idempotency
archive.failed: 0
idempotency.failed: 0
```

No confirm command was run.

Explicitly not run:

```bash
node scripts/compact-queue.js --confirm --json
```

---

## Compaction Dry-Run Output

Observed archive plan:

```text
archive.scanned: 82
archive.archived: 0
archive.skipped: 82
archive.failed: 0
archive.dryRun: true
```

Interpretation:

```text
No completed/failed/cancelled/dead-letter records were proposed for archive in this dry-run.
All 82 scanned archive candidates were skipped.
No archive mutation occurred.
```

Observed idempotency plan:

```text
idempotency.scanned: 356
idempotency.cleaned: 137
idempotency.skipped: 219
idempotency.failed: 0
idempotency.dryRun: true
```

Interpretation:

```text
137 expired idempotency records are cleanup candidates.
Dry-run did not delete them.
This is metadata cleanup, not queue job mutation.
```

Observed slow jobs:

```text
slowJobs.count: 28
slowJobs.thresholdMs: 300000
```

Interpretation:

```text
28 jobs are considered slow by the compaction script threshold.
This aligns with the actual running queue files reported earlier.
These jobs should not be blindly retried or mutated.
Stale/slow running handling remains a separate queue-drain/recovery review.
```

Observed summary:

```text
pending: 22572
running: 31046
completed: 31826
failed: 0
cancelled: 0
dead-letter: 0
```

Interpretation:

```text
These summary counts remain inflated and should not be used as source of truth while QUEUE_SUMMARY_MISMATCH is active.
```

---

## Cross-Check Against Queue Verify

Recent remediation status reported actual segmented files:

```text
pending: 302
running: 28
completed: 82
failed: 0
cancelled: 0
dead-letter: 0
```

This differs sharply from compact-queue summary output:

```text
pending: 22572
running: 31046
completed: 31826
```

Therefore:

```text
compact-queue summary.byStatus is affected by stale/inflated summary metadata.
Use verify-queue actualFilesByStatus as operational truth.
```

---

## What This Dry-Run Proves

It proves:

```text
- queue compaction dry-run is safe
- no archive mutation occurred
- expired idempotency cleanup candidates exist
- slow job candidates exist
- queue summary remains inflated
```

It does not prove:

```text
- external queue is needed
- PostgreSQL is needed
- queue throughput is exhausted
- queue data is corrupt
- jobs should be blindly retried
- repair confirm is safe without backup/approval
```

---

## Idempotency Cleanup Interpretation

Expired idempotency records are:

```text
repairable metadata
```

They are not:

```text
queue job corruption
JSON corruption
external queue evidence
```

Potential future cleanup command, not approved now:

```bash
node scripts/compact-queue.js --confirm --json
```

Required before any confirm cleanup:

```text
- backup
- dry-run review
- explicit approval
- post-cleanup verify
```

---

## Slow Jobs Interpretation

Slow jobs reported:

```text
count: 28
thresholdMs: 300000
```

These should be reviewed using queue-drain/recovery workflows.

Do not run:

```bash
node scripts/queue-drain.js --confirm --json
```

Recommended dry-run-only review remains:

```bash
node scripts/queue-drain.js --dry-run --json
```

---

## Safe Source-of-Truth Rule

Until queue summary is repaired and verified:

```text
Actual segmented queue files are source of truth.
Queue summary/location index is repairable acceleration metadata.
Summary-derived counts from drain/compact outputs are suspect when summary.stale=true or QUEUE_SUMMARY_MISMATCH is active.
```

---

## Recommended Safe Remediation Order

### Step 1 — Preserve dry-run documentation

Done by this document.

### Step 2 — Do not run confirm commands yet

Do not run:

```bash
node scripts/compact-queue.js --confirm --json
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
```

### Step 3 — Backup before any future mutation

Required:

```bash
node scripts/backup.js
```

### Step 4 — If approved later, consider cleanup order

Potential future order after approval:

```text
1. repair queue summary/location index from actual files
2. verify queue strict
3. compact expired idempotency records
4. verify queue again
5. review stale/slow running jobs
6. only then consider drain/recovery
```

This order avoids acting on inflated summary-derived counts.

---

## Why This Is Not Externalization Evidence

The compaction dry-run does not show:

```text
- broken file-backed source of truth
- unparseable queue files
- null-byte corruption
- multi-writer production pressure
- need for Redis/RabbitMQ/Kafka/NATS
- need for PostgreSQL
```

It shows:

```text
- expired idempotency metadata
- slow/running candidates
- inflated summary metadata
```

Therefore:

```text
No external queue is justified.
No PostgreSQL is justified.
No external search is justified.
No externalization is justified.
No pilot is justified.
```

---

## Current Decision

```text
Status: blocked
Blocker: QUEUE_SUMMARY_MISMATCH
Compaction dry-run: safe
Mutation performed: false
Externalization allowed: false
Pilot allowed: false
```

---

## Operational Guardrails

```text
No compact-queue confirm.
No repair-queue confirm.
No queue-drain confirm.
No reset.
No data deletion.
No blind retry.
No external queue.
No PostgreSQL.
No externalization.
No pilot.
```

---

## Related Evidence

```text
docs/operations/QUEUE_REMEDIATION_LOG_2026-05-28.md
docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md
docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md
scripts/verify-queue.js
scripts/repair-queue.js
scripts/queue-drain.js
scripts/compact-queue.js
server/services/queueHealthVerify.js
server/services/queueStorageIndex.js
server/services/opsQueue.js
```

---

## Current Follow-Up

Recommended next safe step:

```text
Prepare queue summary repair approval checklist, but do not run confirm yet.
```

Optional safe command:

```bash
node scripts/backup.js
```

Only if preparing for a future approved repair window.

Do not run confirm commands yet.
