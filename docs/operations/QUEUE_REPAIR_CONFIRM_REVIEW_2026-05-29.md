# Queue Repair Confirm Review — 2026-05-29

## Phase

Phase 61.4 — Operational Adoption + Queue Recovery Safety Review

## Status

```text
Status: ACTIVE_REVIEW
Mutation planned in this document: NO
Queue mutation now: NO
QUEUE_SUMMARY_MISMATCH: ACTIVE BLOCKER
```

## Purpose

This document records the approved queue repair / drain / compact confirmation sequence and the operational findings that followed.

It exists to prevent unsafe future queue mutations, clarify command semantics, and preserve the rule that actual segmented queue files are the source of truth while the queue summary/location index is stale or mismatched.

## Current Blocker

```text
QUEUE_SUMMARY_MISMATCH
```

This means the queue summary/location index does not match actual queue files.

This is not evidence for:

```text
PostgreSQL
Redis
external queue
external search
data reset
JSON corruption
pilot readiness
```

This is evidence for:

```text
queue summary/location drift
duplicate or ghost queue records
stale running jobs
unclear operational command semantics
need for dry-run-first recovery workflow
```

## Source of Truth During Mismatch

When `QUEUE_SUMMARY_MISMATCH` is active, the source of truth hierarchy is:

```text
1. actual segmented queue files
2. raw queue records
3. queue summary/location index as rebuildable acceleration metadata only
```

Do not treat metrics/queue/summary.json as source of truth while stale.

## Safety Rule

Do not run queue mutation while an active Yawmia server or queue worker exists.

Known active-process risk observed during review:

```text
34324 node /mnt/j/yawmia/server.js
```

Before any future queue remediation confirm operation, verify and stop only the Yawmia process whose cwd is:

```text
/mnt/j/yawmia
```

Do not kill unrelated Node processes.

## Baseline Before Confirm Operations

Known baseline before confirm commands:

```text
JSON health clean.
Null-byte scan clean.
Queue JSON files parseable.
verify-queue showed warnings, not JSON corruption.
repair-queue dry-run showed summary/location index inflation.
Actual segmented files are source of truth.
Summary/location index is repairable acceleration metadata.
```

## Confirm Commands That Were Approved and Run

The following commands were executed only after explicit approval:

```bash
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/compact-queue.js --confirm --json
```

No further confirm command is approved by this document.

## repair-queue --confirm Result

Observed:

```text
ok: true
mutationPerformed: true
before.status: warnings
after.status: warnings
byStatus.pending: 307
running: 28
completed: 82
```

Interpretation:

```text
repair-queue --confirm reduced huge queue summary inflation.
repair-queue --confirm did not fully clear QUEUE_SUMMARY_MISMATCH.
Post-repair queue verification still showed warnings.
```

Important:

```text
repair-queue --confirm rebuilds queue summary/location metadata.
It does not safely deduplicate physical queue records.
It does not recover stale running jobs.
It does not justify external queue.
```

## queue-drain --dry-run Result

Observed:

```text
ok: true
dryRun: true
mutationPerformed: false
maxCycles: 20
delayMs: 500
totalClaimed: 0
byStatus.pending: 1844
running: 28
completed: 352
failed: 0
dead-letter: 0
cancelled: 0
totalActiveRecords: 2224
summary.stale: true
staleReason: summary_actual_file_count_mismatch
mismatchSuspected: true
repairRecommended: true
repairCommand: node scripts/repair-queue.js --dry-run --json
```

Dry-run warning:

```text
dry-run does not claim, recover, retry, complete, fail, or mutate queue jobs
```

Interpretation:

```text
queue-drain --dry-run was non-mutating.
queue-drain --dry-run showed queue summary mismatch was still active.
queue-drain --dry-run did not recover stale running jobs.
```

## queue-drain --confirm Result

Observed:

```text
ok: true
dryRun: false
mutationPerformed: true
maxCycles: 20
delayMs: 500
totalClaimed: 40
```

Cycles:

```text
cycle 1 claimed 2
cycle 2 claimed 2
cycle 3 claimed 2
cycle 4 claimed 2
cycle 5 claimed 2
cycle 6 claimed 2
cycle 7 claimed 2
cycle 8 claimed 2
cycle 9 claimed 2
cycle 10 claimed 2
cycle 11 claimed 2
cycle 12 claimed 2
cycle 13 claimed 2
cycle 14 claimed 2
cycle 15 claimed 2
cycle 16 claimed 2
cycle 17 claimed 2
cycle 18 claimed 2
cycle 19 claimed 2
cycle 20 claimed 2
```

After confirm:

```text
byStatus.pending: 2055
running: 68
completed: 392
totalActiveRecords: 2515
summary.stale: true
staleReason: summary_actual_file_count_mismatch
```

Critical finding:

```text
queue-drain --confirm claimed 40 due jobs because it invokes processDueJobs().
```

## processDueJobs Finding

`queue-drain.js` imports:

```text
server/services/queueWorkers.js
```

and calls:

```text
processDueJobs()
```

`processDueJobs()` does more than stale recovery:

```text
- registers built-in queue handlers
- computes available worker slots
- calls claimNextJobs()
- claims due pending jobs
- moves claimed jobs to running
- increments attempts
- sets lockedBy
- sets leaseUntil
- runs processOneJob() asynchronously
- may complete/fail/retry/dead-letter jobs
- calls cleanupOldJobs()
```

Therefore:

```text
queue-drain is not stale-running recovery only.
queue-drain is a manual due-job processing loop.
```

Operator-facing copy must say:

```text
تشغيل هذا الأمر سيعالج وظائف Queue المستحقة الآن، وليس استرداد وظائف stale فقط.
```

## Why totalClaimed Was 40

The result matches current worker lifecycle behavior:

```text
maxCycles: 20
workerConcurrency: 2
claimed per cycle: 2
20 × 2 = 40
```

This confirms that `queue-drain --confirm` processed due jobs through normal queue worker claiming.

## compact-queue --confirm Result

Observed:

```text
ok: true
archive.scanned: 94
archive.archived: 0
archive.skipped: 94
idempotency.scanned: 364
idempotency.cleaned: 144
idempotency.skipped: 220
durationMs: 2171
completedAt: 2026-05-29T12:09:06.986Z
```

Interpretation:

```text
compact-queue --confirm cleaned expired idempotency metadata.
compact-queue --confirm did not archive queue records.
compact-queue --confirm did not resolve QUEUE_SUMMARY_MISMATCH.
```

## Remaining Verification Result

Observed after confirm sequence:

```text
verify-queue ok: true
status: warnings
warnings:
- queue summary appears inflated compared to actual segmented files
- summary mismatches: 3
- actual file mismatches: 3
actualFilesByStatus:
  pending: 311
  running: 40
  completed: 94
strict: false
```

Interpretation:

```text
Queue records are parseable.
Queue health is warnings, not failed.
QUEUE_SUMMARY_MISMATCH remains active.
actual segmented files must remain the source of truth.
```

## phase61-1-remediation-status Result

Observed:

```text
ok: false
status: blocked
blockers:
- QUEUE_SUMMARY_MISMATCH
```

Conclusion:

```text
Pilot remains blocked.
Externalization remains blocked.
Production adoption remains incomplete until queue summary/location mismatch is understood and remediated safely.
```

## What repair-queue Did Not Prove

The repair confirmation did not prove:

```text
- physical queue duplicates are resolved
- stale running jobs are recovered
- summary/location index is trustworthy again
- external queue is required
- PostgreSQL is required
- reset is safe
```

## What queue-drain Proved

The queue-drain confirmation proved:

```text
- queue-drain --confirm calls processDueJobs()
- processDueJobs claims due pending jobs
- queue-drain can mutate queue state significantly
- queue-drain must not be used as stale-running recovery without hardening
```

## What compact-queue Proved

The compact confirmation proved:

```text
- expired idempotency metadata can be cleaned
- compaction does not resolve queue summary mismatch by itself
- compaction is not duplicate queue record repair
```

## Required Future Policy

### Safe commands during active review

Allowed:

```bash
node scripts/verify-data-json.js --strict --json
node scripts/find-null-json-files.js --json
node scripts/verify-queue.js --json
node scripts/repair-queue.js --dry-run --json
node scripts/phase61-1-remediation-status.js --json
```

### Forbidden without new explicit approval

Do not run:

```bash
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

## Required Future Stale Running Recovery Strategy

Do not use queue-drain as stale-running recovery.

Preferred future workflow:

```text
scripts/recover-stale-running-jobs.js
```

Dry-run must:

```text
- scan running segmented queue records
- identify stale jobs by leaseUntil / updatedAt / staleRunningMs
- show jobId
- show type
- show attempts
- show maxAttempts
- show lockedBy
- show leaseUntil
- show updatedAt
- show segmented file path
- show proposed action
- set mutationPerformed:false
```

Confirm must:

```text
- require explicit approval
- not process due jobs
- not claim fresh pending jobs
- not run processDueJobs()
- not complete jobs
- not delete jobs blindly
- move only stale running jobs according to retry policy
- clear lockedBy and leaseUntil
- append recovery metadata
- recommend repair-queue --dry-run after recovery
```

## Required queue-drain Hardening

`queue-drain.js` should be documented and presented as:

```text
manual due-job processing loop
```

Not as:

```text
stale-running recovery
```

Required wording:

```text
This command processes due queue jobs.
It may claim pending jobs.
It calls queueWorkers.processDueJobs().
It is not stale-running recovery only.
Do not run --confirm while server/worker is active.
```

## Required queueHealthVerify Recommendation Hardening

Queue recommendations should not say stale running recovery is:

```bash
node scripts/queue-drain.js
```

Instead, while dedicated recovery is not implemented, recommendations should point to:

```bash
node scripts/verify-queue.js --json
node scripts/repair-queue.js --dry-run --json
```

For pending backlog, use:

```bash
node scripts/queue-drain.js --dry-run --json
```

before any confirm discussion.

## No Reset

Reset is not a valid fix for this review.

Do not run:

```bash
node scripts/reset-dev-data.js --confirm --reinit --json
```

Reset would destroy evidence and hide the operational issue.

## No Quarantine

Because JSON health and null-byte scan are clean, do not run:

```bash
node scripts/quarantine-corrupt-json.js --confirm --json
```

## No External Queue

This blocker is not evidence for:

```text
Redis
Kafka
NATS
RabbitMQ
external queue
```

The current issue is queue hygiene and operational command semantics.

## No PostgreSQL

This blocker is not evidence for PostgreSQL.

## No Pilot

Pilot remains blocked while:

```text
QUEUE_SUMMARY_MISMATCH
```

is active.

## Operator UX Notes

Use clear copy:

```text
Queue summary mismatch يعني أن summary/location index غير موثوق حاليًا. الملفات الفعلية داخل status segments هي مصدر الحقيقة.
```

```text
ابدأ دائمًا بـ dry-run قبل أي إصلاح.
```

```text
لا تشغّل confirm أثناء وجود server أو worker نشط.
```

```text
queue-drain --confirm يعالج وظائف مستحقة وقد يعمل claim/process، وليس استرداد stale فقط.
```

Avoid:

```text
Repair now
Drain stale jobs
Externalize queue
Reset data
Migrate now
```

## Design Research Alignment

This review follows documented operator UX principles:

```text
Cognitive Load:
Commands must state exactly what they do.

Progressive Disclosure:
Dry-run shows the plan before confirm.

Jakob’s Law:
Operators expect drain to process backlog, not silently recover stale jobs.

Low-literacy/operator clarity:
Short direct Arabic copy prevents mistakes.

Trust:
No hidden mutation and no ambiguous command.

Hick’s Law:
Separate verify, repair, recover, drain, compact commands instead of blending responsibilities.
```

## Final Operational Conclusion

The current `QUEUE_SUMMARY_MISMATCH` is an operational queue hygiene and recovery semantics issue, not evidence for PostgreSQL, Redis, or an external queue.

The approved confirm sequence showed:

```text
repair-queue --confirm reduced but did not eliminate summary mismatch.
queue-drain --confirm claimed 40 due jobs because it invokes processDueJobs().
compact-queue --confirm cleaned idempotency metadata without resolving mismatch.
```

Therefore:

```text
queue-drain must not be treated as stale-running recovery until audited and hardened.
```

Next safe step:

```text
Stop active /mnt/j/yawmia server process.
Capture non-mutating queue snapshots.
Audit queueWorkers / opsQueue / queueHealthVerify / queue-drain behavior.
Keep actual segmented files as source of truth.
Add static guardrails.
Design dry-run-first stale running recovery only if needed.
```

No new dependencies.
No PostgreSQL.
No external queue.
No Redis.
No external search.
No Queue mutation now.
No repair confirm now.
No queue-drain confirm now.
No compact confirm now.
No reset while queue evidence is under review.
No quarantine when JSON health is clean.
No Pilot while QUEUE_SUMMARY_MISMATCH blocks remediation status.
No version rollback.
