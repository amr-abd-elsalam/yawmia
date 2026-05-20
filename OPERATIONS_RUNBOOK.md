# يوميّة — Operations Runbook
> Phase 57 — Operational Governance

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
- افتح `INCIDENT_RUNBOOKS.md`
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
```

Admin:

```text
/api/admin/scale-hygiene/overview
```

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
- audit index stale with admin audit required
- scheduler stale for more than one cadence
- repeated alert delivery DLQ
