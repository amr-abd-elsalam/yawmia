# يوميّة — Storage Pressure Runbook
> Phase 59 — Operational Runbook  
> Version target: v0.57.0

هذا الملف يشرح ماذا تفعل عند ظهور warning أو critical في Storage Pressure أو Scale Thresholds.

---

## 1. أين ترى ضغط التخزين؟

Admin UI:

```text
Admin → Scale → Storage Pressure
```

Routes:

```text
GET  /api/admin/storage-pressure
POST /api/admin/storage-pressure/capture
GET  /api/admin/storage-pressure/snapshots
GET  /api/admin/scale-thresholds
POST /api/admin/scale-thresholds/verify
```

CLI:

```bash
node scripts/measure-storage-pressure.js
node scripts/verify-scale-thresholds.js
```

---

## 2. Important principle

Storage warning لا يعني أن ننتقل فورًا إلى PostgreSQL.

Correct order:

```text
measure
verify
compact
archive
repair indexes
review runbook
benchmark
then consider Phase 60+ only if pressure repeats
```

---

## 3. Warning threshold workflow

### Step 1 — افتح Admin dashboard

راجع:

```text
Storage Pressure summary
Top recommended actions
Collections pressure
Index pressure
Queue pressure
Workroom pressure
Governance pressure
```

### Step 2 — شغّل قياس يدوي

```bash
node scripts/measure-storage-pressure.js
```

JSON output لو محتاج CI/artifact:

```bash
node scripts/measure-storage-pressure.js --json
```

### Step 3 — تحقق من thresholds

```bash
node scripts/verify-scale-thresholds.js
```

### Step 4 — نفذ الإجراء المناسب

Queue:

```bash
node scripts/verify-queue.js
node scripts/compact-queue.js
```

Audit:

```bash
node scripts/verify-audit-index.js
node scripts/rebuild-audit-index.js
```

Workrooms:

```bash
node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
node scripts/cleanup-attachments.js
```

Counters:

```bash
node scripts/compact-counters.js
```

Marketplace/product intelligence:

```bash
node scripts/rollup-product-intelligence.js
node scripts/verify-marketplace-intelligence.js
```

Governance:

```bash
node scripts/verify-privacy-governance.js --strict
node scripts/verify-admin-rbac.js --strict
```

### Step 5 — وثّق في weekly ops review

```bash
node scripts/ops-weekly-review.js --persist
```

---

## 4. Critical threshold workflow

### Step 1 — قيّم التأثير

اسأل:

```text
هل APIs بطيئة؟
هل queue متأخرة؟
هل DLQ زاد؟
هل search fallback مستمر؟
هل Workroom messages بطيئة؟
هل JSON corruption موجودة؟
هل المستخدمين متأثرين؟
```

### Step 2 — خذ backup

```bash
node scripts/backup.js
```

### Step 3 — شغّل strict checks

```bash
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
node scripts/verify-scale-thresholds.js --strict
```

### Step 4 — لو التأثير production-facing، فعّل maintenance مؤقتًا

```bash
curl -X POST https://yowmia.com/api/admin/maintenance/enable \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"المنصة تحت الصيانة مؤقتاً. حاول بعد قليل."}'
```

### Step 5 — نفذ remediation حسب المصدر

#### Queue critical

```bash
node scripts/verify-queue.js
node scripts/repair-queue.js
node scripts/compact-queue.js
node scripts/queue-retry-dlq.js --dry-run
```

Do not retry all DLQ blindly.

#### Audit/search critical

```bash
node scripts/verify-audit-index.js
node scripts/rebuild-audit-index.js
node scripts/benchmark-file-paths.js --json
```

#### Workroom critical

```bash
node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
node scripts/cleanup-attachments.js
```

#### Counter critical

```bash
node scripts/compact-counters.js
node scripts/rebuild-counters.js
```

#### Governance critical

```bash
node scripts/verify-privacy-governance.js --strict
node scripts/ops-weekly-review.js --persist
```

### Step 6 — افتح incident لو يوجد user impact أو operational risk

Admin:

```text
/api/admin/incidents
```

Runbook:

```text
../incidents/INCIDENT_RUNBOOKS.md
```

Possible runbook keys:

```text
QUEUE_DLQ_SPIKE
QUEUE_SUMMARY_MISMATCH
AUDIT_INDEX_STALE
COUNTER_FILE_CRITICAL
WORKROOM_SIDECAR_CRITICAL
JSON_CORRUPTION
PRODUCTION_READINESS_FAILED
```

### Step 7 — Postmortem لو critical

If incident severity is critical:

```text
Admin → Governance → Postmortems
```

Or use postmortem APIs.

---

## 5. Storage pressure snapshot workflow

Capture snapshot from admin:

```text
POST /api/admin/storage-pressure/capture
```

CLI:

```bash
node scripts/measure-storage-pressure.js
```

Deep scan only when explicitly needed:

```bash
node scripts/measure-storage-pressure.js --deep
```

Do not run deep scans during startup.

---

## 6. Benchmark workflow

Run read-only benchmark:

```bash
node scripts/benchmark-file-paths.js
```

JSON artifact:

```bash
node scripts/benchmark-file-paths.js --json
```

Include heavier safe paths:

```bash
node scripts/benchmark-file-paths.js --include-heavy --json
```

Use benchmark data for:

- weekly ops review
- externalization readiness review
- Phase 60 decision matrix

---

## 7. Externalization readiness review

If pressure repeats after remediation:

```bash
node scripts/measure-storage-pressure.js --json
node scripts/benchmark-file-paths.js --json
node scripts/export-migration-snapshot.js --dry-run
```

Then review:

```text
EXTERNALIZATION_READINESS.md
DATA_MIGRATION_FORMATS.md
MULTI_INSTANCE_BOUNDARY.md
```

Important:

```text
Phase 59 does not implement external DB/search/queue.
Phase 60+ requires evidence and migration plan.
```

---

## 8. Read-only replica notes

On read-only replicas:

```text
Do not run capture/verify write actions.
Do not run queue workers.
Do not run schedulers.
Do not use admin write actions.
```

Read-only dashboards can show latest persisted pressure snapshots.

---

## 9. What NOT to do

```text
Do not run multiple writers.
Do not run PM2 cluster mode.
Do not treat file locks as distributed consensus.
Do not migrate to PostgreSQL because of one warning.
Do not delete audit records blindly.
Do not delete payment records blindly.
Do not run deep pressure scans on startup.
Do not expose pressure reports publicly.
Do not include PII in pressure or benchmark output.
Do not retry all DLQ jobs blindly.
Do not ignore JSON corruption.
```

---

## 10. Quick command reference

```bash
# Measure
node scripts/measure-storage-pressure.js
node scripts/measure-storage-pressure.js --json

# Verify thresholds
node scripts/verify-scale-thresholds.js
node scripts/verify-scale-thresholds.js --strict

# Benchmark
node scripts/benchmark-file-paths.js
node scripts/benchmark-file-paths.js --json

# Core health
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict

# Queue
node scripts/verify-queue.js
node scripts/repair-queue.js
node scripts/compact-queue.js
node scripts/queue-retry-dlq.js --dry-run

# Audit
node scripts/verify-audit-index.js
node scripts/rebuild-audit-index.js

# Workrooms
node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
node scripts/cleanup-attachments.js

# Counters
node scripts/compact-counters.js
node scripts/rebuild-counters.js

# Governance
node scripts/verify-admin-rbac.js --strict
node scripts/verify-privacy-governance.js --strict
node scripts/ops-weekly-review.js --persist

# Future migration snapshot
node scripts/export-migration-snapshot.js --dry-run
```

## Phase 61 — Storage Pressure Cadence

Storage pressure must be captured weekly:

```bash
node scripts/measure-storage-pressure.js --json --persist
node scripts/capture-phase61-evidence.js --persist
```

Use shallow by default.  
Use deep scan only off-peak and intentionally.

Storage pressure warnings should trigger:

```text
verify thresholds
compact/repair
benchmark
ops review
```

Storage pressure alone must not trigger PostgreSQL/externalization.
