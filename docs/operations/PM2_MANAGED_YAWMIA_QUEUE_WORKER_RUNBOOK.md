# PM2-Managed Yawmia Queue Worker Runbook

> Phase 61.4 — Active Worker / PM2 Forensic Control  
> Purpose: stop active PM2-managed Yawmia queue workers safely before any queue mutation.

---

## Summary

Yawmia queue workers run inside `server.js`.

When `server.js` is managed by PM2, direct PID kill is not durable:

```text
kill PID → PM2 restarts server.js → new queue worker starts → leases refresh again
```

Queue worker IDs include the Node process PID:

```text
queue_worker_<PID>_<random>
```

Example:

```text
queue_worker_315_5bz5lp
queue_worker_45177_uoqmv6
```

This means:

```text
PID 315 owned queue leases.
After direct kill, PM2 restarted Yawmia as PID 45177.
PID 45177 created queue_worker_45177_uoqmv6.
```

Therefore:

```text
Do not run queue mutation while PM2-managed Yawmia is active.
```

---

## Required Read-Only Discovery

```bash
pm2 list || true
pm2 status || true
pm2 jlist || true
pm2 describe yawmia || true
pm2 describe 0 || true
pm2 describe 1 || true
pm2 describe 2 || true
pm2 describe 3 || true
pm2 logs --lines 80 --nostream || true
```

If PM2 command is unavailable:

```bash
which pm2 || true
ps -ef | grep -i pm2 | grep -v grep || true
```

---

## OS Process Correlation

```bash
pgrep -af "node|server.js|queue|scheduler|yawmia" || true
```

For each suspicious PID:

```bash
readlink -f /proc/<PID>/cwd || true
tr '\0' ' ' < /proc/<PID>/cmdline; echo
ps -fp <PID> || true
ps -o pid,ppid,stat,etime,cmd -p <PID> || true
pgrep -P <PID> -af . || true
```

Expected Yawmia identity:

```text
cwd = /mnt/j/yawmia
cmdline includes server.js
```

---

## Queue Owner Correlation

Inspect running queue records:

```bash
cd /mnt/j/yawmia

grep -R "queue_worker_" data/ops_queue/running data/ops_queue 2>/dev/null | head -200 || true
find data/ops_queue/running -type f -name "*.json" -print | head -50
```

For sample files:

```bash
sed -n '1,220p' <RUNNING_JOB_FILE>
```

Correlate:

```text
lockedBy = queue_worker_<PID>_*
PID = OS process
OS cwd/cmdline = /mnt/j/yawmia/server.js
PM2 app pid = PID
```

---

## Process Lock Evidence

```bash
find data/ops_locks -type f -name "*.json" -print -exec sed -n '1,220p' {} \; 2>/dev/null || true
```

Expected queue worker lock:

```text
lockName = queue_worker
metadata.workerId = queue_worker_<PID>_*
pid = <PID>
heartbeatAt moving while worker active
expiresAt moving while worker active
```

---

## Scheduler Evidence

```bash
find data/scheduler -type f -name "*.json" -print -exec sed -n '1,220p' {} \; 2>/dev/null || true
```

Focus on:

```text
predictive_scan
nextRunAt
lastRunAt
lastStatus
lastQueueJobId
leaseOwner
leaseUntil
runCount
failCount
```

---

## PM2-Controlled Stop

Only after PM2 identity is proven:

```bash
pm2 stop <CONFIRMED_YAWMIA_PM2_APP_NAME_OR_ID>
sleep 10
pm2 status
pgrep -af "node /mnt/j/yawmia/server.js|/mnt/j/yawmia/server.js" || true
```

Do not use:

```bash
pkill node
killall node
kill -9 <pid>
```

Direct PID kill is not durable under PM2 autorestart.

---

## Quiet Snapshot Requirement

After PM2 stop:

```bash
cd /mnt/j/yawmia

date -Is
node scripts/recover-stale-running-jobs.js --dry-run --json

sleep 660

date -Is
node scripts/recover-stale-running-jobs.js --dry-run --json
```

Expected proof:

```text
- no new queue_worker_<PID> appears
- leaseUntil stops moving forward
- updatedAt stops moving forward
- leases stop refreshing
- nonStaleRunningCount drops or becomes stale
```

---

## Forbidden Commands Until Quiet Snapshot

```bash
node scripts/queue-drain.js --confirm --json
node scripts/repair-queue.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

---

## Important Interpretation

`nonStaleRunningCount` is not proof that independent jobs are truly executing.

It is evidence that some active worker/server is likely refreshing or recently claimed running records.

Treat it as:

```text
ACTIVE_QUEUE_WORKER_LIKELY
```

until quiet snapshots prove otherwise.

---

## Explicit Non-Goals

```text
No PostgreSQL.
No Redis.
No external queue.
No queue mutation before PM2 stop.
No Pilot while QUEUE_SUMMARY_MISMATCH remains active.
No version rollback.
No RATE_LIMIT disable.
No OTP weakening.
No admin write weakening.
```
