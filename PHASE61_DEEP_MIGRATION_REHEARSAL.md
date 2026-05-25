# يوميّة — Phase 61 Deep Migration Rehearsal

> Deep rehearsal without external DB  
> Version: v0.57.0

---

## 1. الفرق بين validation-only و deep rehearsal

Phase 60 rehearsal كان:

```text
snapshot validation only
no external DB
no source mutation
```

Phase 61 deep rehearsal يضيف report أعمق:

```text
snapshot selected
validation status
counts/checksums
redaction status
reference sample status
rollback plan checked
restore drill link
sourceDataMutated=false
externalDbConnected=false
```

---

## 2. Snapshot selection

اختر snapshot محدد:

```bash
node scripts/export-migration-snapshot.js --out=./migration-snapshots/phase61-test --confirm
```

---

## 3. Strict validation

```bash
node scripts/validate-migration-snapshot.js \
  --snapshot=./migration-snapshots/phase61-test \
  --strict \
  --json
```

---

## 4. Counts and checksums comparison

يجب التحقق من:

```text
manifest count == NDJSON actual line count
manifest sha256 == actual file sha256
all exported collections represented
```

---

## 5. Redaction confirmation

يجب ألا تظهر:

```text
token
secret
password
apiKey
authorization
vapidPrivateKey
raw session tokens
raw identity images
raw base64 image payloads
```

---

## 6. Reference sample report

Sample checks:

```text
jobs.employerId → users.id
applications.jobId → jobs.id
applications.workerId → users.id
payments.jobId → jobs.id
messages.senderId → users.id
direct_offers.workerId → users.id
```

Warnings في reference sampling لا تعني failure تلقائيًا، لكنها تمنع pilot إذا لم يتم تفسيرها.

---

## 7. Test target / copied snapshot rules

Allowed:

```text
read snapshot
validate snapshot
copy snapshot to test directory
write rehearsal report
```

Not allowed:

```text
write source data
delete source data
modify production indexes
connect external DB
start queue workers
start schedulers
```

---

## 8. No source mutation

كل report يجب أن يحتوي:

```json
{
  "sourceDataMutated": false,
  "externalDbConnected": false
}
```

---

## 9. No external DB connection

Phase 61 لا يتصل بـ:

```text
PostgreSQL
Redis
Elastic/OpenSearch
Kafka
RabbitMQ
S3
```

---

## 10. Report format

```json
{
  "ok": true,
  "status": "passed",
  "phase": 61,
  "rehearsalType": "deep_snapshot_validation",
  "snapshotPath": "./migration-snapshots/phase61-test",
  "validation": {},
  "countsChecked": true,
  "checksumsChecked": true,
  "redactionChecked": true,
  "referencesChecked": true,
  "rollbackPlanChecked": true,
  "sourceDataMutated": false,
  "externalDbConnected": false,
  "blockers": [],
  "warnings": [],
  "generatedAt": "..."
}
```

---

## 11. Failure workflow

If rehearsal fails:

```text
do not pilot
fix snapshot export
rerun validation
document in ops review
open incident if production risk exists
```

---

## 12. Approval prerequisites for future pilot

Before any pilot:

```text
deep rehearsal passed
rollback rehearsal passed
restore drill fresh
privacy review passed
admin approval exists
pilot gate allows exactly one bounded candidate
```
