# Queue Remediation Approval Runbook — Phase 61.5

> Scope: Queue summary/location repair, stale running review, and predictive_scan flood control.  
> Status: Approval-gated. No mutation by default.  
> Version: Yawmia v0.57.0

---

## 1. Purpose

This runbook defines the safe operational process for queue remediation when:

```text
QUEUE_SUMMARY_MISMATCH is active
stale running jobs exist
predictive_scan flood is suspected
```

The goal is to avoid accidental mutation, avoid queue worker races, and preserve actual segmented queue files as source of truth.

---

## 2. Current Safety Principle

While `QUEUE_SUMMARY_MISMATCH` is active:

```text
queue summary/location index is not source of truth
actual segmented queue files are source of truth
```

The inflated summary counts are not proof that tens of thousands of jobs exist.

---

## 3. Required Quiet-State Evidence

Before any queue mutation:

```bash
pm2 status || true
pm2 jlist || true
pm2 describe yawmia || true
pgrep -af "node|server.js|queue|scheduler|yawmia" || true
```

Required state:

```text
PM2 yawmia: stopped
PM2 yawmia pid: null
no /mnt/j/yawmia/server.js process
nonStaleRunningCount: 0
activeWorkerLikely: false
pm2ManagedLikely: false
```

If suspicious PID appears, inspect only:

```bash
readlink -f /proc/<PID>/cwd || true
tr '\0' ' ' < /proc/<PID>/cmdline; echo
ps -o pid,ppid,stat,etime,cmd -p <PID> || true
```

Forbidden:

```bash
pkill node
killall node
kill -9 <pid>
```

---

## 4. Required Dry-Run Evidence

Run:

```bash
node scripts/verify-data-json.js --strict --json
node scripts/find-null-json-files.js --json
node scripts/verify-queue.js --json
node scripts/repair-queue.js --dry-run --json
node scripts/recover-stale-running-jobs.js --dry-run --json --summary-only
node scripts/phase61-1-remediation-status.js --json
```

Preserve outputs in the ops review.

---

## 5. Queue Summary Repair Scope

`repair-queue --confirm` is only allowed to repair:

```text
metrics/queue/summary.json
queue location index
summary byStatus / byType / locations
```

It must not:

```text
process due jobs
claim pending jobs
recover stale running jobs
move queue records between status dirs
delete queue records
archive queue records
start queue workers
start scheduler registry
```

---

## 6. Approval Requirement

Confirmed repair requires:

```bash
node scripts/repair-queue.js --confirm --json --approval-id=<approved-id>
```

The approval must document:

```text
quiet-state proof
repair-queue dry-run output
actual queue files by status
summary mismatch deltas
stale running counts
why this repair is summary/location only
rollback plan
```

---

## 7. Stale Running Jobs

Stale running jobs are a separate decision.

Current dry-run behavior:

```text
recover-stale-running-jobs.js is dry-run only
--confirm is intentionally not implemented
mutationPerformed:false
```

Do not move stale jobs back to pending blindly.

If stale jobs are `predictive_scan`, review flood risk first.

---

## 8. Predictive Scan Flood Review

Capture:

```text
predictive_scan pending count
predictive_scan running count
predictive_scan stale running count
predictive_scan attempts buckets
predictive_scan idempotency records
scheduler predictive_scan state
legacy server.js predictive timer state
```

Potential causes:

```text
legacy predictive timer + scheduler registry both enqueueing
PM2 restart loop
stale recovery requeue loop
idempotency expiry after flood
summary/location inflation
```

---

## 9. Queue Drain Is Not Recovery

`queue-drain --confirm` calls `processDueJobs()`.

That means it can:

```text
claim due pending jobs
execute queue handlers
create new side effects
complete/fail/dead-letter jobs
```

Therefore:

```text
Do not use queue-drain --confirm as stale-running recovery.
```

---

## 10. Forbidden Without New Approval

```bash
node scripts/queue-drain.js --confirm --json
node scripts/repair-queue.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

---

## 11. Architecture Guardrails

Do not treat this incident as justification for:

```text
PostgreSQL
Redis
external queue
external search
external database
Pilot
version rollback
RATE_LIMIT weakening
OTP weakening
admin protection weakening
```

File-backed remediation remains valid while actual file counts are low and integrity is clean.

---

## 12. Safe Recommended Sequence

```text
1. Keep PM2/Yawmia stopped.
2. Capture quiet-state proof.
3. Capture dry-run evidence.
4. Review repair plan.
5. If repair is summary/location only, request approval.
6. Run bounded repair only after approval.
7. Re-run verify-queue.
8. Review stale running jobs separately.
9. Review predictive_scan flood before any stale recovery.
10. Start Yawmia only after remediation plan is complete.
```

---

## 13. Arabic Admin UI Copy

Use:

```text
ملخص Queue غير مطابق للملفات الفعلية.
اعتمد على actual segmented files حتى يتم إصلاح الملخص.
```

Use:

```text
الخطوة التالية آمنة: مراجعة Dry Run فقط.
لا يوجد تنفيذ أو تعديل بيانات في هذه الخطوة.
```

Use:

```text
لا تستخدم Queue Drain للاسترداد.
Queue Drain يعالج وظائف Pending وقد يشغل Jobs جديدة.
```
