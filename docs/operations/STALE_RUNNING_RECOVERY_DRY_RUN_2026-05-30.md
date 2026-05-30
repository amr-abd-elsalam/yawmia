# Stale Running Queue Recovery Dry-Run — 2026-05-30

## Phase

Phase 61.4 — Queue Recovery Safety Review

## Status

```text
Status: DRY_RUN_ONLY
Confirm recovery implemented: NO
Queue mutation now: NO
```

## Purpose

This document defines the safe first step for reviewing stale running queue jobs without processing due jobs and without mutating queue records.

It follows from the queue confirm review:

```text
docs/operations/QUEUE_REPAIR_CONFIRM_REVIEW_2026-05-29.md
```

## Current Evidence

Latest safe queue verification showed:

```text
stale running jobs: 40
expired idempotency records: 200
QUEUE_SUMMARY_MISMATCH: ACTIVE
JSON health: clean
Null-byte scan: clean
```

The 40 stale running jobs match the previous confirmed `queue-drain` behavior:

```text
queue-drain --confirm totalClaimed: 40
```

## Important Finding

`queue-drain --confirm` is not stale-running recovery only.

It calls:

```text
queueWorkers.processDueJobs()
```

That means it can:

```text
claim due pending jobs
move jobs to running
increment attempts
set lockedBy
set leaseUntil
run processOneJob()
complete/fail/retry/dead-letter jobs
```

Therefore, do not use `queue-drain --confirm` to recover stale running jobs.

## Safe Dry-Run Command

Use:

```bash
node scripts/recover-stale-running-jobs.js --dry-run --json
```

or:

```bash
node scripts/recover-stale-running-jobs.js --json
```

Default behavior is dry-run.

## Expected Dry-Run Behavior

The script must:

```text
scan running queue records
identify stale jobs by expired leaseUntil / stale updatedAt
show jobId
show type
show status
show attempts
show maxAttempts
show lockedBy
show leaseUntil
show updatedAt
show path
show proposedAction
set mutationPerformed:false
not call processDueJobs()
not claim pending jobs
not complete/fail/retry/delete/move jobs
```

## Confirm Behavior

Confirm is intentionally not implemented in Phase 61.4.

If this is run:

```bash
node scripts/recover-stale-running-jobs.js --confirm --json
```

Expected behavior:

```text
ok: false
code: CONFIRM_NOT_IMPLEMENTED
mutationPerformed: false
```

## Why Confirm Is Not Implemented Yet

A real confirm workflow needs an explicit, reviewed policy for each stale running job:

```text
move back to pending
or move to dead-letter
or mark failed
or preserve for manual inspection
```

That policy must consider:

```text
job type
attempts
maxAttempts
handler side effects
idempotency
whether the original worker may have partially executed the task
```

## Proposed Action Categories

Dry-run can classify proposed actions:

```text
move_back_to_pending_after_review
move_to_dead_letter_after_review
```

These are proposals only, not mutations.

## Required Future Confirm Guardrails

A future confirm workflow must:

```text
require explicit approval
require server stopped
not call processDueJobs()
not claim pending jobs
not process new due jobs
not complete jobs
not delete jobs blindly
clear lockedBy and leaseUntil only for selected stale running jobs
append recovery metadata
recommend repair-queue --dry-run after mutation
```

## Required Pre-Confirm Steps

Before any future confirm recovery:

```bash
node scripts/verify-data-json.js --strict --json
node scripts/find-null-json-files.js --json
node scripts/verify-queue.js --json
node scripts/recover-stale-running-jobs.js --dry-run --json
node scripts/repair-queue.js --dry-run --json
```

Also verify:

```text
no active /mnt/j/yawmia server process
no active queue worker
backup is available
dry-run output reviewed
ops review record created
explicit approval granted
```

## Forbidden During This Review

Do not run:

```bash
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
```

## Architecture Guardrails

This stale-running review is not evidence for:

```text
PostgreSQL
Redis
external queue
external search
data reset
pilot readiness
runtime repository switch
```

## Operator Copy

Use clear wording:

```text
هذا الأمر يعرض وظائف Queue العالقة في running فقط ولا يعالجها.
```

```text
لا يستخدم processDueJobs ولا يعالج pending jobs.
```

```text
queue-drain يعالج due jobs وليس أداة stale recovery.
```

```text
لا تشغّل أي confirm أثناء وجود server أو worker نشط.
```

## Final Conclusion

The safe next step for the 40 stale running jobs is a dry-run-only stale recovery report, not queue-drain and not repair confirm.

No new dependencies.
No PostgreSQL.
No external queue.
No Redis.
No external search.
No queue mutation now.
No reset.
No quarantine when JSON health is clean.
No pilot while QUEUE_SUMMARY_MISMATCH remains active.
