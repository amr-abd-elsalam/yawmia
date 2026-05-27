# يوميّة — Operations Runbook
> Phase 59 — Operational Governance + Storage Pressure

هذا الملف يشرح daily/weekly/monthly operations لمنصة يوميّة.

---

## Daily checks

### 1. Ops SLO

Admin route:

```text
/api/admin/ops/slo
```

CLI:

```bash
node scripts/verify-production-readiness.js
```

راجع:

- queue DLQ
- alert delivery rate
- scheduler stale jobs
- process locks
- open incidents

---

### 2. Queue stats

```bash
node scripts/verify-queue.js
```

Admin:

```text
/api/admin/ops-queue/stats
/api/admin/ops-queue/jobs
/api/admin/ops-queue/dead-letter
```

معاني سريعة:

```text
DLQ = وظائف فشلت بعد كل المحاولات
pending = وظائف تنتظر التنفيذ
running = وظائف قيد التنفيذ
failed = وظائف فشلت ويمكن إعادة المحاولة
```

---

### 2b. Storage pressure

Phase 59 adds unified storage pressure visibility.

CLI:

```bash
node scripts/measure-storage-pressure.js
node scripts/verify-scale-thresholds.js
```

Admin:

```text
/api/admin/storage-pressure
/api/admin/scale-thresholds
/api/admin/externalization/readiness
```

راجع:

- أكبر collections
- ضغط Queue
- ضغط audit/search indexes
- ضغط Workroom sidecars
- ملفات governance المفتوحة أو stale
- recommended actions

قاعدة مهمة:

```text
warning = متابعة وضغط/تحقق
critical = backup + verify + compact/repair + incident إذا يوجد user impact
```

اتبع:

```text
STORAGE_PRESSURE_RUNBOOK.md
SCALE_LIMITS.md
```

---

### 3. DLQ review

```bash
node scripts/queue-retry-dlq.js --dry-run
```

لو السبب transient:

```bash
node scripts/queue-retry-dlq.js --type=TYPE --limit=20
```

لو السبب permanent:
- لا تعمل retry blindly.
- افتح incident أو وثّق السبب.

---

### 4. Alert deliveries

Admin:

```text
/api/admin/alerts/health
/api/admin/alerts/deliveries
```

لو dead-letter:

```bash
node scripts/verify-queue.js
```

ثم retry من admin UI أو endpoint.

---

### 5. Scheduler stale jobs

```bash
node scripts/scheduler-cadence-report.js
```

لو stale:
- راجع `nextRunAt`
- راجع `lastStatus`
- راجع queue job المرتبط
- راجع instance mode

---

### 6. Open incidents

Admin:

```text
/api/admin/incidents
```

لو incident مفتوح:
- افتح `../incidents/INCIDENT_RUNBOOKS.md`
- اتبع runbookKey
- بعد الحل، اعمل resolve من admin UI

---

## Weekly checks

### 1. Backup restore drill

```bash
node scripts/run-backup-restore-drill.js
```

Production gate المقترح: آخر drill ناجح خلال 7 أيام.

---

### 2. Scale hygiene

```bash
node scripts/verify-file-health.js
node scripts/verify-data-json.js
node scripts/compact-queue.js
node scripts/compact-workrooms.js
node scripts/compact-counters.js
node scripts/measure-storage-pressure.js
node scripts/verify-scale-thresholds.js
```

Admin:

```text
/api/admin/scale-hygiene/overview
/api/admin/storage-pressure
```

---

### 2b. File path benchmarks

Weekly or before Phase 60 review:

```bash
node scripts/benchmark-file-paths.js --json
```

If pressure is repeated:

```bash
node scripts/benchmark-file-paths.js --include-heavy --json
```

Use benchmark output in weekly ops review and externalization readiness review.

---

### 3. Marketplace intelligence review

```bash
node scripts/rollup-product-intelligence.js
node scripts/verify-marketplace-intelligence.js
```

راجع:

- zero-result searches
- direct offer funnel
- payment disputes
- notification conversions
- activation funnel

---

### 4. Predictive precision review

Admin:

```text
/api/admin/predictive-abuse/precision
```

راجع:

- false positives
- confirmed signals
- precision rate

---

### 5. Trust calibration review

Admin:

```text
/api/admin/trust/calibration/dashboard
```

لو drift warnings موجودة:
- لا تعدّل weights تلقائيًا.
- راجع outcomes.
- وثّق قرار المنتج/الثقة.

---

### 6. Payment dispute review

Admin:

```text
/api/admin/marketplace-intelligence/payment-disputes
```

ركز على:

- categories عالية النزاع
- governorates عالية النزاع
- dispute rate
- avg resolution hours

---

## Monthly checks

### 1. Audit token compaction

```bash
node scripts/rebuild-audit-index.js
node scripts/verify-audit-index.js
```

### 2. Counter compaction

```bash
node scripts/compact-counters.js
```

### 3. Trust rollups

```bash
node scripts/rollup-trust-snapshots.js
```

### 4. Predictive archive index

```bash
node scripts/rebuild-predictive-archive-index.js
```

### 5. Workroom hygiene

```bash
node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
node scripts/cleanup-attachments.js
```

### 6. Export cleanup

تتم تلقائيًا عبر timers/registry، لكن راجع:

```text
/api/admin/exports
```

---

### 7. Migration snapshot dry run

Phase 59 فقط — للتحقق من الجاهزية المستقبلية:

```bash
node scripts/export-migration-snapshot.js --dry-run
```

لا تستخدم snapshot لتنفيذ external DB migration في Phase 59.

---

---

## Weekly review generator

```bash
node scripts/ops-weekly-review.js
node scripts/ops-weekly-review.js --out=weekly-review.md
```

استخدم الملف الناتج في اجتماع التشغيل الأسبوعي.

---

## Maintenance mode process

تفعيل:

```bash
curl -X POST /api/admin/maintenance/enable
```

تعطيل:

```bash
curl -X POST /api/admin/maintenance/disable
```

استخدم maintenance عند:

- migration risky
- JSON corruption investigation
- rollback
- queue repair كبير

---

## Queue repair workflow

1. Verify:

```bash
node scripts/verify-queue.js
```

2. Repair summary:

```bash
node scripts/repair-queue.js
```

3. Drain pending if needed:

```bash
node scripts/queue-drain.js
```

4. Review DLQ:

```bash
node scripts/queue-retry-dlq.js --dry-run
```

---

## File health workflow

```bash
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
```

لو JSON corruption:
- لا تعمل rebuild search/index.
- اعزل الملف.
- استرجع من backup لو لازم.
- افتح incident `JSON_CORRUPTION`.

---

## What to escalate

Escalate immediately if:

- restore drill failed
- JSON corruption critical
- DLQ spike
- counter file critical
- storage pressure critical
- scale threshold critical
- audit index stale with admin audit required
- workroom sidecar critical
- scheduler stale for more than one cadence
- repeated alert delivery DLQ
- repeated pressure after compaction/repair

---

## Phase 61 — Weekly Evidence Operating Loop

مرة أسبوعيًا:

```bash
node scripts/measure-storage-pressure.js --json --persist
node scripts/benchmark-file-paths.js --json --persist
node scripts/verify-scale-thresholds.js --json
node scripts/capture-externalization-decision.js --persist
node scripts/capture-phase61-evidence.js --persist
node scripts/evaluate-pilot-gate.js --json
node scripts/ops-weekly-review.js --persist
```

قاعدة التشغيل:

```text
تحذير واحد لا يكفي.
Benchmark واحد ليس trend.
Repeated warnings = mitigate file-based first.
Repeated criticals بعد mitigation = rehearsal_required.
Pilot requires rollback rehearsal.
```

لا تشغل deep scans في startup.  
لا تشغل benchmark داخل readiness.  
لا تبدأ externalization بدون approval وrollback rehearsal.
