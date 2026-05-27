# يوميّة — Phase 60 Rollback Plan

> Rollback must exist before any future external pilot.

---

## 1. Why rollback is required

أي external pilot مستقبلي قد يفشل بسبب:

```text
data mismatch
partial writes
latency regression
privacy issue
queue duplication
SSE fanout gap
search mismatch
```

لذلك file-backed source of truth لا يُزال في Phase 60.

---

## 2. Pre-rollback prerequisites

قبل أي pilot future:

```bash
node scripts/backup.js
node scripts/export-migration-snapshot.js --out=./migration-snapshots/pre-pilot --confirm
node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/pre-pilot --strict
node scripts/run-backup-restore-drill.js
```

---

## 3. Disable external reads

لو future pilot موجود:

```text
disable external read path
disable dual-read
route reads to file-backed store
pause external write consumers
```

Phase 60 لا ينفذ external reads أصلًا.

---

## 4. Restore file-backed source

If needed:

```text
restore data directory from backup
or keep current file store as source of truth
```

Do not blindly overwrite without confirming backup timestamp.

---

## 5. Repair indexes

```bash
node scripts/repair-indexes.js
node scripts/rebuild-audit-index.js
node scripts/rebuild-workroom-search.js
node scripts/rebuild-predictive-archive-index.js
```

---

## 6. Verify queue

```bash
node scripts/verify-queue.js
node scripts/repair-queue.js
```

Do not retry all DLQ blindly.

---

## 7. Smoke test

```bash
node scripts/postdeploy-smoke.js --json
node scripts/verify-production-readiness.js --json
```

---

## 8. Incident and postmortem

If rollback had user impact:

```text
open incident
assign runbookKey
resolve incident
create postmortem if critical
add action items
```

---

## 9. Rollback success criteria

```text
app starts
health ok
config ok
jobs list works
auth works
queue verified
indexes repaired
no JSON corruption
no unexpected DLQ spike
admin dashboard loads
```

---

## 10. What NOT to do

```text
Do not delete audit records.
Do not delete payment records.
Do not skip queue verification.
Do not run multiple writers during rollback.
Do not rely on external system as only source of truth until cutover is approved.
```

## Phase 61 Update

Rollback plan becomes a reportable rehearsal:

```bash
node scripts/run-rollback-rehearsal.js --dry-run --json
node scripts/run-rollback-rehearsal.js --persist --confirm
```

The rehearsal does not mutate source data.  
The rehearsal does not restore production.  
The rehearsal does not connect external systems.

It produces a file-backed report used by the Pilot Gate.
