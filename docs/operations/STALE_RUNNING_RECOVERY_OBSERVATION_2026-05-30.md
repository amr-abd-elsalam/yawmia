# Stale Running Recovery Observation — 2026-05-30

## Phase

Phase 61.4 — Operational Adoption + Queue Recovery Safety Review

## Related Documents

```text
docs/operations/QUEUE_REPAIR_CONFIRM_REVIEW_2026-05-29.md
docs/operations/STALE_RUNNING_RECOVERY_DRY_RUN_2026-05-30.md
```

## Status

```text
Status: OBSERVED_DRY_RUN
Queue mutation performed: NO
Recovery confirm implemented: NO
Recovery confirm approved: NO
QUEUE_SUMMARY_MISMATCH: ACTIVE BLOCKER
Pilot allowed: NO
Externalization allowed: NO
```

## Purpose

This document records the observed output from the dry-run-only stale running recovery auditor.

The goal is to preserve evidence before designing any future confirm workflow.

## Command Observed

```bash
node scripts/recover-stale-running-jobs.js --dry-run --json
```

## Dry-Run Result Summary

Observed:

```text
ok: true
dryRun: true
mutationPerformed: false
confirmImplemented: false
scannedRunning: 40
staleRunningCount: 40
moveBackToPendingCandidates: 40
deadLetterCandidates: 0
```

## Job Type Pattern

All observed stale running jobs were:

```text
type: predictive_scan
```

This matters because `predictive_scan` is an operational analytics/risk scan job, not a direct user payment, privacy anonymization, webhook delivery, or one-off destructive workflow.

Even so, no blind retry or confirm recovery is approved by this document.

## Attempts Pattern

All observed stale running jobs had:

```text
attempts: 1
maxAttempts: 5
```

Interpretation:

```text
The jobs are not exhausted.
They are candidates for move_back_to_pending_after_review in a future reviewed workflow.
They are not dead-letter candidates based on attempts alone.
```

## Lock Pattern

The stale running jobs were locked by:

```text
queue_worker_97924_rda18f
```

Their leases were expired:

```text
leaseUntil: 2026-05-29T12:12:38Z .. 2026-05-29T12:12:57Z
updatedAt: 2026-05-29T12:07:38Z .. 2026-05-29T12:07:57Z
```

This matches the previous `queue-drain --confirm` sequence that claimed 40 jobs.

## Relationship to queue-drain --confirm

Previous confirmed result:

```text
queue-drain --confirm totalClaimed: 40
```

Current stale running dry-run result:

```text
staleRunningCount: 40
```

Interpretation:

```text
The 40 stale running jobs are consistent with the prior queue-drain --confirm run.
```

Important:

```text
queue-drain --confirm is not stale-running recovery only.
queue-drain --confirm calls processDueJobs().
queue-drain --confirm can claim and process due pending jobs.
```

Do not use queue-drain as a stale-running recovery command.

## Proposed Action From Dry-Run

For all 40 stale running jobs:

```text
proposedAction: move_back_to_pending_after_review
proposedReason: lease is stale; eligible for explicit recovery workflow after review
```

This is a proposal only.

No mutation was performed.

## Why No Confirm Yet

A confirm workflow is not implemented and not approved because recovery must consider:

```text
job type
attempts
maxAttempts
handler side effects
idempotency
whether the original worker partially executed the job
whether the active server/worker is stopped
whether queue summary/location mismatch is still active
```

## Current Queue State Still Blocked

Latest remediation status remains:

```text
ok: false
status: blocked
blockers:
- QUEUE_SUMMARY_MISMATCH
```

Latest queue verification still shows:

```text
status: warnings
stale running jobs: 40
expired idempotency records: 200
summary mismatches: 3
actual file mismatches: 3
```

Actual file counts observed:

```text
pending: 518
running: 40
completed: 94
failed: 0
cancelled: 0
dead-letter: 0
```

The exact pending count may change if a server/worker is active. That is why future remediation requires a stopped server and quiet snapshots.

## Source of Truth During This Review

While `QUEUE_SUMMARY_MISMATCH` is active:

```text
1. actual segmented queue files
2. raw queue records
3. queue summary/location index as rebuildable acceleration metadata only
```

Do not treat summary/location index as source of truth.

## Safe Next Commands

Allowed:

```bash
node scripts/verify-data-json.js --strict --json
node scripts/find-null-json-files.js --json
node scripts/verify-queue.js --json
node scripts/repair-queue.js --dry-run --json
node scripts/recover-stale-running-jobs.js --dry-run --json
node scripts/phase61-1-remediation-status.js --json
```

## Forbidden Now

Do not run:

```bash
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

## Future Confirm Workflow Requirements

A future stale-running confirm workflow must:

```text
require explicit approval
require a stopped /mnt/j/yawmia server
not call processDueJobs()
not import queueWorkers.js
not claim pending jobs
not process due jobs
not complete jobs
not delete jobs blindly
not reset attempts blindly
not mutate queue summary as source of truth
only affect selected stale running records
clear lockedBy and leaseUntil
append recovery metadata
recommend repair-queue --dry-run after mutation
```

## Architecture Guardrails

This observation is not evidence for:

```text
PostgreSQL
Redis
external queue
external search
data reset
pilot readiness
runtime repository switch
```

## Operator Summary

```text
The stale running dry-run found 40 stale predictive_scan jobs.
All are attempts=1/maxAttempts=5.
All are proposed as move_back_to_pending_after_review.
No mutation was performed.
No confirm workflow is implemented or approved.
Do not use queue-drain for stale-running recovery.
QUEUE_SUMMARY_MISMATCH remains the active blocker.
```

## Latest Follow-Up Observation

A later dry-run showed:

```text
scannedRunning: 40
staleRunningCount: 14
moveBackToPendingCandidates: 14
deadLetterCandidates: 0
```

This differs from the earlier observation where all 40 running jobs were classified as stale.

Interpretation:

```text
The stale-running recovery auditor is non-mutating.
The difference must be treated as evidence requiring review, not as approval to recover.
The system still has 40 running records, but only 14 matched stale criteria in this follow-up dry-run.
QUEUE_SUMMARY_MISMATCH remains active.
No recovery confirm is approved.
```

Required next step:

```text
compare verify-queue staleRunningJobs output with recover-stale-running-jobs dry-run output
review why full queue verification and recovery auditor classify stale running jobs differently
do not use queue-drain as recovery
do not run confirm
```

## Classification Explainability Update

The dry-run auditor should expose why each running job is or is not stale:

```text
stale
staleReasons
leaseExpired
updatedAtStale
leaseAgeMs
updatedAgeMs
staleRunningMs
```

It should also report:

```text
nonStaleRunningJobs
nonStaleRunningCount
```

This is necessary because a later snapshot showed:

```text
scannedRunning: 40
staleRunningCount: 14
nonStaleRunningCount: 26
```

The variance does not approve recovery.

It means:

```text
classification must be explained before any confirm workflow
verify-queue and stale recovery auditor outputs must be compared
future recovery must be selective
queue-drain must remain forbidden as stale recovery
```

## Final Conclusion

The stale running dry-run gives enough evidence to design a future selective recovery workflow, but not enough to run recovery now.

No new dependencies.
No PostgreSQL.
No external queue.
No Redis.
No external search.
No queue mutation now.
No stale-running recovery confirm now.
No repair confirm now.
No queue-drain confirm now.
No compact confirm now.
No reset.
No quarantine when JSON health is clean.
No pilot while QUEUE_SUMMARY_MISMATCH remains active.
No version rollback.
