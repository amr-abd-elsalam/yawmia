# يوميّة — Operations Runbook
> Phase 58 — Operational Governance, RBAC, Privacy, and Postmortems

هذا الملف يشرح daily/weekly/monthly operations لمنصة يوميّة.

---

## Daily checks

### 1. Ops SLO

Admin route:

/api/admin/ops/slo

CLI:

node scripts/verify-production-readiness.js

راجع:

- queue DLQ
- alert delivery rate
- scheduler stale jobs
- process locks
- open incidents

---

### 2. Queue stats

node scripts/verify-queue.js

Admin:

/api/admin/ops-queue/stats
/api/admin/ops-queue/jobs
/api/admin/ops-queue/dead-letter

معاني سريعة:

DLQ = وظائف فشلت بعد كل المحاولات
pending = وظائف تنتظر التنفيذ
running = وظائف قيد التنفيذ
failed = وظائف فشلت ويمكن إعادة المحاولة

---

### 3. DLQ review

node scripts/queue-retry-dlq.js --dry-run

لو السبب transient:

node scripts/queue-retry-dlq.js --type=TYPE --limit=20

لو السبب permanent:
- لا تعمل retry blindly.
- افتح incident أو وثّق السبب.

---

### 4. Alert deliveries

Admin:

/api/admin/alerts/health
/api/admin/alerts/deliveries

لو dead-letter:

node scripts/verify-queue.js

ثم retry من admin UI أو endpoint.

---

### 5. Scheduler stale jobs

node scripts/scheduler-cadence-report.js

لو stale:
- راجع `nextRunAt`
- راجع `lastStatus`
- راجع queue job المرتبط
- راجع instance mode

---

### 6. Open incidents

Admin:

/api/admin/incidents

لو incident مفتوح:
- افتح `INCIDENT_RUNBOOKS.md`
- اتبع runbookKey
- بعد الحل، اعمل resolve من admin UI

---

## Weekly checks

### 1. Backup restore drill

node scripts/run-backup-restore-drill.js

Production gate المقترح: آخر drill ناجح خلال 7 أيام.

---

### 2. Scale hygiene

node scripts/verify-file-health.js
node scripts/verify-data-json.js
node scripts/compact-queue.js
node scripts/compact-workrooms.js
node scripts/compact-counters.js

Admin:

/api/admin/scale-hygiene/overview

---

### 3. Marketplace intelligence review

node scripts/rollup-product-intelligence.js
node scripts/verify-marketplace-intelligence.js

راجع:

- zero-result searches
- direct offer funnel
- payment disputes
- notification conversions
- activation funnel

---

### 4. Predictive precision review

Admin:

/api/admin/predictive-abuse/precision

راجع:

- false positives
- confirmed signals
- precision rate

---

### 5. Trust calibration review

Admin:

/api/admin/trust/calibration/dashboard

لو drift warnings موجودة:
- لا تعدّل weights تلقائيًا.
- راجع outcomes.
- وثّق قرار المنتج/الثقة.

---

### 6. Payment dispute review

Admin:

/api/admin/marketplace-intelligence/payment-disputes

ركز على:

- categories عالية النزاع
- governorates عالية النزاع
- dispute rate
- avg resolution hours

---

## Monthly checks

### 1. Audit token compaction

node scripts/rebuild-audit-index.js
node scripts/verify-audit-index.js

### 2. Counter compaction

node scripts/compact-counters.js

### 3. Trust rollups

node scripts/rollup-trust-snapshots.js

### 4. Predictive archive index

node scripts/rebuild-predictive-archive-index.js

### 5. Workroom hygiene

node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
node scripts/cleanup-attachments.js

### 6. Export cleanup

تتم تلقائيًا عبر timers/registry، لكن راجع:

/api/admin/exports

---

## Weekly review generator

node scripts/ops-weekly-review.js
node scripts/ops-weekly-review.js --out=weekly-review.md

استخدم الملف الناتج في اجتماع التشغيل الأسبوعي.

---

## Phase 58 Governance review

Weekly:

node scripts/verify-admin-rbac.js --strict
node scripts/verify-privacy-governance.js --strict
node scripts/ops-weekly-review.js --persist

راجع من Admin UI:

Governance tab
RBAC status
Approval queue
Privacy requests
Ops review records
Postmortems

إذا وجدت DLQ أو restore drill failure أو marketplace warnings:
- أنشئ review record مناسب.
- اربط incidentId أو drillId أو rollupId إن وجد.
- لا تترك critical incidents بدون Postmortem.

---

## Maintenance mode process

تفعيل:

curl -X POST /api/admin/maintenance/enable

تعطيل:

curl -X POST /api/admin/maintenance/disable

استخدم maintenance عند:

- migration risky
- JSON corruption investigation
- rollback
- queue repair كبير

---

## Queue repair workflow

1. Verify:

node scripts/verify-queue.js

2. Repair summary:

node scripts/repair-queue.js

3. Drain pending if needed:

node scripts/queue-drain.js

4. Review DLQ:

node scripts/queue-retry-dlq.js --dry-run

---

## File health workflow

node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict

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

Admin governance routes:

GET /api/admin/rbac/matrix
GET /api/admin/rbac/me
GET /api/admin/approvals
GET /api/admin/privacy/requests
GET /api/admin/ops/reviews
GET /api/admin/postmortems
