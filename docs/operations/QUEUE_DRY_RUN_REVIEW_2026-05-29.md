# Queue Dry-Run Review — 2026-05-29

> Phase 61.4C — Queue Duplicate / Summary Hygiene Review  
> Scope: evidence documentation only  
> Mutation: none  
> Externalization: none  
> Pilot: blocked

---

## Summary

On 2026-05-29, queue verification and repair dry-run were executed to investigate the remaining Phase 61 remediation blocker:

```text
QUEUE_SUMMARY_MISMATCH
```

The commands confirmed:

```text
- JSON data health is clean.
- Null-byte scan is clean.
- Queue files are parseable.
- Queue verification has warnings but no hard errors.
- Queue repair dry-run completed successfully.
- No mutation was performed.
- The queue summary/location index appears heavily inflated compared to actual segmented files.
```

This is a file-backed queue hygiene issue, not evidence for external queue migration.

---

## Commands Run

```bash
node scripts/repair-queue.js --dry-run --json
node scripts/verify-queue.js --json
```

No confirm command was run.

Explicitly not run:

```bash
node scripts/repair-queue.js --confirm --json
```

---

## Repair Dry-Run Result

Source command:

```bash
node scripts/repair-queue.js --dry-run --json
```

Observed result:

```text
ok: true
dryRun: true
mutationPerformed: false
durationMs: 10270
```

Warnings before repair:

```text
stale running jobs: 2
expired idempotency records: 115
queue summary appears inflated compared to actual segmented files
summary mismatches: 3
actual file mismatches: 3
```

Dry-run repair actions proposed:

```text
1. rebuild_queue_summary
2. rebuild_queue_summary_from_actual_files
3. report_stale_running_jobs
```

Dry-run risks reported:

```text
actual segmented files are treated as source of truth; summary/location index is repairable acceleration only
stale running jobs are not mutated here; use queue drain/recovery workflow after review
```

---

## Queue Verify Result

Source command:

```bash
node scripts/verify-queue.js --json
```

Observed result:

```text
ok: true
status: warnings
warnings: 5
errors: 0
parsedRecords: 394
legacyRecords: 0
statusDirMismatches: 0
staleRunningJobs: 2
orphanIdempotency: 0
expiredIdempotency: 115 reported in earlier remediation status, verify output recommended cleanup showed 50 sampled/reported records
summaryMismatches: 3
actualFileMismatches: 3
```

Actual segmented queue files:

```text
pending: 284
running: 28
completed: 82
failed: 0
cancelled: 0
dead-letter: 0
total: 394
```

Summary mismatch snapshot:

```text
pending:
  summaryCount: 20692
  scanCount: 256

running:
  summaryCount: 30409
  scanCount: 0

completed:
  summaryCount: 30976
  scanCount: 82
```

Actual file mismatch snapshot:

```text
pending:
  summaryCount: 20692
  actualFileCount: 284
  delta: 20408

running:
  summaryCount: 30409
  actualFileCount: 28
  delta: 30381

completed:
  summaryCount: 30976
  actualFileCount: 82
  delta: 30894
```

---

## Stale Running Jobs

Two stale running jobs were reported:

```text
q_mpp3bny1_d06b603418
q_mpp3uydb_740b5914fa
```

Both had expired leases:

```text
lockedBy: queue_worker_417_6ze1l8
leaseUntil: expired before verification time
updatedAt: stale
```

Interpretation:

```text
These are queue recovery/drain candidates.
They should not be blindly retried.
They should not be mutated as part of summary repair.
They require queue drain/recovery workflow review.
```

Recommended command remains dry-run-first:

```bash
node scripts/queue-drain.js --dry-run --json
```

Do not run confirm/drain mutation without explicit approval.

---

## Expired Idempotency Records

Expired idempotency records were reported.

Interpretation:

```text
Expired idempotency records are cleanup candidates.
They are not data corruption.
They are not external queue evidence.
```

Recommended command remains dry-run-first:

```bash
node scripts/compact-queue.js --dry-run --json
```

---

## Interpretation

The queue system has three separate issues:

### 1. Inflated summary/location index

```text
summary counts are far higher than actual segmented files.
```

This is repairable acceleration metadata.

### 2. Stale running jobs

```text
2 running jobs have expired leases.
```

These require queue drain/recovery review, not blind retry.

### 3. Expired idempotency records

```text
expired idempotency keys exist.
```

These require queue compaction cleanup, dry-run first.

---

## Source of Truth Rule

For Phase 61.4C, the source-of-truth rule remains:

```text
Actual segmented queue files are source of truth.
Queue summary/location index is repairable acceleration.
```

Canonical queue records should be selected from actual files.

When duplicate queue records exist across status segments, recommended canonical preference is:

```text
completed
failed/dead-letter
cancelled
running
pending
```

But no mutation should happen without explicit confirm workflow.

---

## Why This Is Not Externalization Evidence

This dry-run does not show:

```text
- unparseable queue JSON
- null-byte queue corruption
- unreadable queue directories
- write failure
- atomic write failure
- lock failure requiring distributed consensus
- throughput limit requiring external queue
- multi-writer production requirement
```

It shows:

```text
- stale/inflated summary metadata
- stale running leases
- expired idempotency metadata
```

Therefore:

```text
No external queue is justified.
No PostgreSQL is justified.
No external search is justified.
No pilot is justified.
```

---

## Recommended Safe Remediation Order

### Step 1 — Record evidence

Done by this document.

### Step 2 — Keep repair dry-run posture

Safe command:

```bash
node scripts/repair-queue.js --dry-run --json
```

No mutation.

### Step 3 — Backup before any mutation

Required before confirm:

```bash
node scripts/backup.js
```

### Step 4 — Review stale running jobs

Dry-run first:

```bash
node scripts/queue-drain.js --dry-run --json
```

No blind retry.

### Step 5 — Review expired idempotency cleanup

Dry-run first:

```bash
node scripts/compact-queue.js --dry-run --json
```

### Step 6 — Only after explicit approval

Potential mutation commands, not approved now:

```bash
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/compact-queue.js --confirm --json
```

### Step 7 — Post-repair verification

If any future approved mutation happens:

```bash
node scripts/verify-queue.js --strict --json
node scripts/phase61-1-remediation-status.js --json
node scripts/capture-phase61-evidence.js --persist --json
node scripts/evaluate-pilot-gate.js --json
```

---

## Current Decision

```text
Status: blocked
Blocker: QUEUE_SUMMARY_MISMATCH
Mutation performed: false
Externalization allowed: false
Pilot allowed: false
```

This is the correct state until summary/location index repair is explicitly approved and verified.

---

## Recommended Hardening Before Confirm Repair

Before any confirm repair, the repair dry-run output should ideally provide:

```text
- canonical queue record path
- ghost queue record paths
- status segment path
- proposed summary rewrite counts
- proposed location index rewrite counts
- stale running recovery candidates
- idempotency cleanup count
- mutationPerformed: false in dry-run
```

This would make review safer.

---

## Operational Guardrails

```text
No reset.
No data deletion.
No repair confirm without explicit approval.
No blind DLQ retry.
No blind running-job retry.
No external queue.
No externalization.
No pilot.
```

---

## Related Files

```text
scripts/verify-queue.js
scripts/repair-queue.js
scripts/compact-queue.js
scripts/queue-drain.js
server/services/queueHealthVerify.js
server/services/queueStorageIndex.js
server/services/opsQueue.js
docs/operations/QUEUE_REMEDIATION_LOG_2026-05-28.md
```

---

## Current Follow-Up

Recommended next safe command:

```bash
node scripts/queue-drain.js --dry-run --json
```

Recommended next optional command:

```bash
node scripts/compact-queue.js --dry-run --json
```

Do not run confirm commands yet.
