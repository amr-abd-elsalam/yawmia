# Predictive Scan Flood Review — 2026-05-31

> Phase 61.5  
> Status: Read-only review required before stale running recovery  
> Version: Yawmia v0.57.0

---

## 1. Current Evidence

Stale running recovery dry-run shows:

```text
scannedRunning: 40
staleRunningCount: 40
nonStaleRunningCount: 0
activeWorkerLikely: false
pm2ManagedLikely: false
```

All sampled stale running jobs are:

```text
type: predictive_scan
attempts: 1
proposedAction: move_back_to_pending_after_review
```

This must not be treated as approval to requeue them.

---

## 2. Why Requeue Is Unsafe Without Review

Moving stale `predictive_scan` jobs back to pending may restart a flood if the root cause is still present.

Potential flood sources:

```text
legacy predictive scan timer in server.js
scheduler registry predictive_scan job
PM2 restart loop
queue worker startup stale recovery
idempotency expiry after backlog
summary/location index inflation
```

---

## 3. Required Read-Only Inspector

Run:

```bash
node scripts/inspect-predictive-scan-queue.js --json
```

Capture:

```text
predictive_scan by status
stale running count
attempt buckets
age buckets
idempotency key counts
expired idempotency keys
scheduler predictive_scan state
dual scheduling risk
```

---

## 4. Interpretation

If stale running jobs are all `predictive_scan`, do not blindly recover them.

Possible decisions after review:

```text
leave running stale until summary repair decision
cancel/archive obsolete predictive_scan records after approval
move back to pending only if dedupe and scheduling are safe
pause one scheduling source before restart
```

No decision should be made from summary counts alone while `QUEUE_SUMMARY_MISMATCH` is active.

---

## 5. Source Of Truth

While `QUEUE_SUMMARY_MISMATCH` remains active:

```text
actual segmented queue files are source of truth
summary/location index is repairable acceleration metadata only
```

---

## 6. Commands Not To Run

```bash
node scripts/queue-drain.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/repair-queue.js --confirm --json
```

Unless a new explicit approval and runbook step authorizes a bounded action.

---

## 7. Architecture Guardrails

No immediate recommendation for:

```text
PostgreSQL
Redis
external queue
external search
external database
Pilot
version rollback
```

The current evidence shows low actual file counts and clean JSON health. The problem is operational queue hygiene, not database selection.

---

## 8. Recommended Next Step

```text
Run predictive scan inspector.
Review counts by status and idempotency.
Then decide whether queue summary/location repair can proceed first.
Stale running recovery remains separate.
```
