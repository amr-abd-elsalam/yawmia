# Active Queue Worker Forensic Audit — 2026-05-31

> Phase 61.4  
> Scope: PM2-managed Yawmia queue worker control, stale running evidence, quiet snapshot proof.

---

## Executive Summary

A PM2-managed Yawmia server had previously restarted automatically after direct PID termination and created new queue workers.

Confirmed pattern:

```text
PID 315 → queue_worker_315_5bz5lp
PM2 restarted Yawmia as PID 45177
PID 45177 → queue_worker_45177_uoqmv6
```

A later active process was found:

```text
PID 136125
cwd: /mnt/j/yawmia
cmdline: node server.js
lockedBy: queue_worker_136125_6az6g7
```

PM2 state at the time of final control:

```text
PM2 app name: yawmia
PM2 app id: 3
status: stopped
pid: null
exec cwd: /mnt/j/yawmia
script path: /mnt/j/yawmia/server.js
node env: production
```

PID 136125 was not PM2-online at the time of final control and was stopped with targeted SIGTERM after identity proof.

---

## Process Evidence

```text
PID 136125
PPID 365
cwd /mnt/j/yawmia
cmdline node server.js
```

Parent:

```text
PPID 365 = /init
```

Interpretation:

```text
PID 136125 was a Yawmia server process under WSL init/orphaned process path, while PM2 app yawmia was stopped.
```

Because PM2 was stopped and not supervising this PID, targeted SIGTERM was acceptable.

Forbidden alternatives remain:

```text
pkill node
killall node
kill -9
```

---

## Quiet Snapshot Evidence

After stopping PID 136125:

```text
scannedRunning: 40
staleRunningCount: 40
nonStaleRunningCount: 0
activeWorkerLikely: false
pm2ManagedLikely: false
```

Lock owners:

```text
queue_worker_136125_6az6g7
  total: 26
  stale: 26
  nonStale: 0
  processExists: false

queue_worker_97924_rda18f
  total: 14
  stale: 14
  nonStale: 0
  processExists: false
```

Interpretation:

```text
No active Yawmia server/queue worker was detected.
Running leases stopped refreshing.
All running records are stale.
```

---

## Remaining Blockers

`phase61-1-remediation-status.js --json` after quiet state:

```text
status: blocked
blocker: QUEUE_SUMMARY_MISMATCH
warning: STALE_RUNNING_JOBS_REQUIRE_REVIEW
```

Queue verification showed actual files:

```text
pending: 599
running: 40
completed: 94
failed: 0
cancelled: 0
dead-letter: 0
```

Queue summary mismatch showed inflated summary values earlier:

```text
summary pending: 24185
actual pending files: 595

summary running: 3309
actual running files: 40
```

Interpretation:

```text
Queue summary/location index is not source of truth while mismatch is active.
Actual segmented queue files are the source of truth.
```

---

## Current Safe State

```text
PM2 yawmia stopped.
No Yawmia server process detected.
No active queue worker likely.
No PM2-managed Yawmia online.
All running records stale.
No queue mutation performed.
```

---

## Do Not Run Yet

```bash
node scripts/queue-drain.js --confirm --json
node scripts/repair-queue.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

---

## Next Safe Step

Keep all commands read-only until explicit queue remediation approval.

Recommended next evidence commands:

```bash
node scripts/recover-stale-running-jobs.js --dry-run --json --summary-only
node scripts/repair-queue.js --dry-run --json
node scripts/verify-queue.js --json
node scripts/phase61-1-remediation-status.js --json
```

---

## Operational Interpretation

`nonStaleRunningCount = 0` means active worker risk has been controlled.

`staleRunningCount = 40` means the remaining running records are stale and need a reviewed recovery plan.

`QUEUE_SUMMARY_MISMATCH` remains the active blocker before any production readiness or pilot gate.

---

## Non-Goals

```text
No PostgreSQL.
No Redis.
No external queue.
No queue mutation without approval.
No direct PID kill as durable PM2 control.
No pilot while queue mismatch remains.
No version rollback.
No RATE_LIMIT weakening.
No OTP/admin protection weakening.
```
