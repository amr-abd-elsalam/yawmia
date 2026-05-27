# Phase 61.2 — Rollback Rehearsal Execution Discipline

> Status: required operational discipline before any pilot  
> Default mode: dry-run  
> Production restore: forbidden  
> Source mutation: forbidden by default

---

## 1. Purpose

Rollback rehearsal proves that Yawmia can return safely to the file-backed source of truth.

It must remain non-mutating by default.

It must not restore production data.

It must not connect to external DB/search/queue.

---

## 2. Required Output Fields

A rollback rehearsal report must include:

```text
id
status
generatedAt
dryRun
sourceDataMutated=false
externalDbConnected=false
externalQueueConnected=false
externalSearchConnected=false
backupReference
restoreDrillReference
snapshotReference
indexRepairPlan
queueVerifyPlan
smokePlan
blockers
warnings
```

---

## 3. Required References

### Backup reference

Must identify:

```text
backup path or backup id
createdAt
verified or not
integrity status
```

### Restore drill reference

Must identify:

```text
latest restore drill id
status
completedAt
freshness
error count
```

### Snapshot reference

Must identify:

```text
snapshot path or id
manifest validation result
checksum result
redaction result
referential sample result
```

---

## 4. Rollback Plan Sections

### Index repair plan

Should include commands:

```bash
node scripts/repair-indexes.js
node scripts/rebuild-audit-index.js
node scripts/rebuild-search-relevance.js
node scripts/rebuild-workroom-search.js
```

### Queue verify plan

Should include:

```bash
node scripts/verify-queue.js --strict --json
node scripts/repair-queue.js --dry-run --json
```

If confirm is needed:

```bash
node scripts/backup.js
node scripts/repair-queue.js --confirm --json
node scripts/verify-queue.js --strict --json
```

### Smoke plan

Should include:

```bash
node scripts/postdeploy-smoke.js --json
node scripts/predeploy-check.js --json
node scripts/phase61-1-remediation-status.js --json
```

---

## 5. Blockers

Rollback rehearsal blocks pilot when:

```text
backup reference missing
restore drill missing
restore drill stale
restore drill failed
snapshot reference missing
snapshot validation failed
index repair plan missing
queue verify plan missing
smoke plan missing
critical open incidents exist
sourceDataMutated=true
any external connection flag is true
```

---

## 6. Dry-run Discipline

Default command:

```bash
node scripts/run-rollback-rehearsal.js --dry-run --json
```

Any mutating rollback action requires a later explicitly approved phase.

Phase 61.2 does not allow production restore.

---

## 7. Pass Conditions

Rollback rehearsal passes only if:

```text
dryRun=true
sourceDataMutated=false
externalDbConnected=false
externalQueueConnected=false
externalSearchConnected=false
backup reference valid
restore drill fresh and passed
snapshot reference valid or explicitly not required for this rehearsal
index repair plan present
queue verify plan present
smoke plan present
no critical blockers
```

---

## 8. Relationship to Pilot Gate

Pilot gate must remain blocked when rollback rehearsal is:

```text
missing
stale
failed
incomplete
not linked to backup
not linked to restore drill
not linked to smoke plan
```

A passed rollback rehearsal does not grant pilot by itself.

It is one required condition among several.

---

## 9. Explicit Non-goals

Rollback rehearsal does not implement:

```text
external database rollback
external queue rollback
external search rollback
object storage rollback
dual-write rollback
cutover rollback
```
