# Queue Drain Dry-Run Review — 2026-05-29

> Phase 61.4D — Queue Drain Dry-Run Evidence Review  
> Scope: documentation and safety interpretation only  
> Mutation: none  
> Externalization: none  
> Pilot: blocked

---

## Summary

On 2026-05-29, `queue-drain.js` was executed in dry-run mode after queue verify and repair dry-run confirmed the remaining blocker:

```text
QUEUE_SUMMARY_MISMATCH
```

Command:

```bash
node scripts/queue-drain.js --dry-run --json
```

Result:

```text
ok: true
dryRun: true
mutationPerformed: false
totalClaimed: 0
```

This confirms the command was safe and non-mutating.

However, the output also showed extremely inflated active queue counts:

```text
pending: 21680
running: 30802
completed: 31474
totalActiveRecords: 83956
```

These numbers do not match actual segmented queue files reported by queue verify.

Therefore, current `queue-drain` dry-run output must be interpreted as impacted by the stale/inflated queue summary/location index.

---

## Current Queue Truth Source

The trusted source of truth remains:

```text
actual segmented queue files
```

Not:

```text
queue summary inflated counts
location index inflated counts
queue-drain totalActiveRecords while summary mismatch is active
```

---

## Cross-Check Against Queue Verify

Recent `verify-queue` result reported:

```text
ok: true
status: warnings
errors: 0
parsedRecords: 394
legacyRecords: 0
statusDirMismatches: 0
summaryMismatches: 3
actualFileMismatches: 3
```

Actual segmented files:

```text
pending: 286
running: 28
completed: 82
failed: 0
cancelled: 0
dead-letter: 0
```

This differs sharply from `queue-drain` dry-run output:

```text
pending: 21680
running: 30802
completed: 31474
```

Interpretation:

```text
queue-drain is currently seeing or reporting inflated summary-derived counts while QUEUE_SUMMARY_MISMATCH remains unresolved.
```

---

## Queue Drain Dry-Run Result

Observed:

```text
ok: true
dryRun: true
mutationPerformed: false
maxCycles: 20
delayMs: 500
totalClaimed: 0
```

The dry-run explicitly warned:

```text
dry-run does not claim, recover, retry, complete, fail, or mutate queue jobs
```

This is correct and safe.

---

## Summary Metadata in Drain Output

`queue-drain` reported:

```text
summary.stale: true
summary.staleReason: summary_actual_file_count_mismatch
summary.mismatchSuspected: true
summary.repairRecommended: true
summary.repairCommand: node scripts/repair-queue.js --dry-run --json
```

This is the most important part of the output.

It means:

```text
Do not trust summary-derived active counts until summary/location index is rebuilt from actual files.
```

---

## Stale Running Jobs Context

Previous queue verification reported:

```text
stale running jobs: 2
```

But queue-drain dry-run did not claim or recover anything:

```text
totalClaimed: 0
```

Interpretation:

```text
stale running job recovery should not proceed while queue summary/location index is known stale unless the drain/recovery script explicitly reads actual segmented running files and reports exact job IDs.
```

Current known stale running job IDs from queue verify:

```text
q_mpp3bny1_d06b603418
q_mpp3uydb_740b5914fa
```

No mutation has been approved.

---

## Why This Is Not External Queue Evidence

This dry-run does not prove:

```text
- queue capacity exhaustion
- queue throughput failure
- need for Redis/RabbitMQ/Kafka/NATS
- need for PostgreSQL
- need for external worker orchestration
- need for multi-writer production
```

It proves:

```text
- queue summary/location index is stale or inflated
- queue-drain output depends on or reflects stale summary metadata
- actual segmented files remain much smaller and parseable
```

Therefore:

```text
No external queue is justified.
No PostgreSQL is justified.
No externalization is justified.
No pilot is justified.
```

---

## Safe Interpretation Rule

Until `QUEUE_SUMMARY_MISMATCH` is repaired and verified:

```text
Use verify-queue actualFilesByStatus as operational truth.
Treat queue-drain byStatus and totalActiveRecords as suspect if summary.stale=true.
Do not use queue-drain inflated counts for scale decisions.
Do not use inflated counts as externalization evidence.
```

---

## Recommended Safe Next Steps

### 1. Keep documenting evidence

This document records queue-drain dry-run behavior.

### 2. Do not run queue-drain confirm

Do not run:

```bash
node scripts/queue-drain.js --confirm --json
```

### 3. Review queue compaction dry-run

Safe command:

```bash
node scripts/compact-queue.js --dry-run --json
```

Purpose:

```text
- inspect expired idempotency cleanup
- inspect archive/compaction plan
- confirm mutationPerformed=false
```

### 4. Keep repair summary dry-run-first

Safe command:

```bash
node scripts/repair-queue.js --dry-run --json
```

Mutation command remains not approved:

```bash
node scripts/repair-queue.js --confirm --json
```

### 5. Hardening recommendation before any recovery mutation

Before stale running job recovery is approved, `queue-drain` should ideally:

```text
- explicitly state whether counts are summary-derived or actual-file-derived
- refuse or warn strongly when summary.stale=true
- list exact running job files considered stale
- report mutationPerformed=false in dry-run
- avoid presenting inflated totalActiveRecords as actual truth
```

---

## Current Decision

```text
Status: blocked
Blocker: QUEUE_SUMMARY_MISMATCH
Queue drain dry-run: safe but summary-inflated
Mutation performed: false
External queue: not justified
Pilot: not allowed
```

---

## Operational Guardrails

```text
No queue-drain confirm.
No repair-queue confirm.
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

Recommended next safe command:

```bash
node scripts/compact-queue.js --dry-run --json
```

Do not run confirm commands.
