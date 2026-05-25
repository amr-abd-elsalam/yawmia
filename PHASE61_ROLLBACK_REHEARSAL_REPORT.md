# يوميّة — Phase 61 Rollback Rehearsal Report

> Rollback rehearsal is required before any future pilot.  
> Version: v0.57.0

---

## 1. Required backup reference

Rollback rehearsal must reference a backup or explicitly mark it missing:

```json
{
  "backupReference": "./backups/yawmia-backup-..."
}
```

Missing backup blocks pilot.

---

## 2. Required restore drill reference

Rollback rehearsal must inspect latest restore drill:

```bash
node scripts/run-backup-restore-drill.js
```

A pilot is blocked if:

```text
restore drill missing
restore drill failed
restore drill stale > 7 days
```

---

## 3. Snapshot reference

Rollback rehearsal should reference the latest migration snapshot used for rehearsal:

```json
{
  "snapshotReference": "./migration-snapshots/phase61-test"
}
```

---

## 4. Index repair checklist

Rollback report must include:

```bash
node scripts/repair-indexes.js
node scripts/rebuild-audit-index.js
node scripts/rebuild-workroom-search.js
node scripts/rebuild-predictive-archive-index.js
```

---

## 5. Queue verify checklist

Rollback report must include:

```bash
node scripts/verify-queue.js --strict
node scripts/repair-queue.js
```

Do not blindly retry all DLQ.

---

## 6. Postdeploy smoke checklist

Rollback report must include:

```bash
node scripts/postdeploy-smoke.js --json
node scripts/verify-production-readiness.js --json
```

---

## 7. Incident/postmortem plan

If rollback has user impact:

```text
open incident
assign runbookKey
resolve when stable
create postmortem if critical
track action items
```

---

## 8. Rollback pass/fail criteria

Passed only if:

```text
backup reference exists
restore drill exists and passed
restore drill is fresh
index repair plan present
queue verify plan present
smoke plan present
sourceDataMutated=false
externalDbConnected=false
```

Warnings allowed for missing optional snapshot reference.

---

## 9. Report JSON shape

```json
{
  "ok": true,
  "status": "passed",
  "phase": 61,
  "sourceDataMutated": false,
  "externalDbConnected": false,
  "backupReference": null,
  "restoreDrillReference": null,
  "snapshotReference": null,
  "indexRepairPlan": [],
  "queueVerifyPlan": [],
  "smokePlan": [],
  "incidentPlan": [],
  "blockers": [],
  "warnings": [],
  "generatedAt": "..."
}
```

---

## 10. What blocks pilot

```text
no backup reference
no restore drill
failed restore drill
stale restore drill
missing rollback plan
missing queue verify plan
missing smoke plan
open critical incident
overdue critical postmortem action items
```
