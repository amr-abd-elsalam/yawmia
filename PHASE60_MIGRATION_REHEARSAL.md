# يوميّة — Phase 60 Migration Rehearsal

> تدريب آمن للهجرة بدون تنفيذ external database  
> Version: v0.56.0

---

## 1. What rehearsal means

Migration rehearsal في Phase 60 يعني:

```text
export snapshot
validate snapshot
validate checksums
validate redaction
validate references
write rehearsal report
document rollback path
```

ولا يعني:

```text
PostgreSQL import
external DB connection
dual-write
cutover
source mutation
```

---

## 2. Inputs

```text
migration snapshot directory
manifest.json
*.ndjson
checksums
index snapshots
current config
rollback plan
```

---

## 3. Snapshot export

```bash
node scripts/export-migration-snapshot.js --out=./migration-snapshots/phase60-test --confirm
```

Dry run:

```bash
node scripts/export-migration-snapshot.js --dry-run
```

---

## 4. Snapshot validation

```bash
node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/phase60-test --json
node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/phase60-test --strict
```

Checks:

```text
manifest exists
manifest valid
NDJSON parses line-by-line
counts match manifest
checksums match
forbidden keys absent
raw session tokens absent
raw identity image/base64 absent
referential integrity sampled
```

---

## 5. Rehearsal command

```bash
node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/phase60-test --dry-run --json
```

Persist report:

```bash
node scripts/run-migration-rehearsal.js \
  --snapshot=./migration-snapshots/phase60-test \
  --out=./migration-snapshots/rehearsals/phase60-test \
  --confirm
```

---

## 6. Rehearsal report

Report shape:

```json
{
  "ok": true,
  "status": "passed",
  "phase": 60,
  "rehearsalType": "snapshot_validation_only",
  "sourceDataMutated": false,
  "externalDbConnected": false,
  "snapshotPath": "...",
  "validation": {},
  "rollbackPlanRequired": true,
  "generatedAt": "..."
}
```

---

## 7. Source data safety

Phase 60 rehearsal must not:

```text
write to source data
delete source data
modify indexes
start queue workers
start schedulers
connect external DB
```

---

## 8. Failure handling

If rehearsal fails:

```text
do not start pilot
fix snapshot/export/redaction issue
rerun validation
document in ops review
open incident if production risk exists
```

---

## 9. Success criteria

```text
validation passed
no secrets leaked
no raw base64 identity data
reference sample acceptable
report persisted
rollback plan exists
weekly ops review updated
```

## Phase 61 Update

Phase 61 deepens rehearsal reports but keeps them non-destructive.

Additional Phase 61 checks:

```text
rollback plan checked
restore drill linked
index repair plan included
queue verify plan included
postdeploy smoke plan included
```

Run:

```bash
node scripts/run-rollback-rehearsal.js --dry-run --json
```

No external DB connection is introduced.
