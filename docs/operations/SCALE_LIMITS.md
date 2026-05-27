# يوميّة — Scale Limits
> Phase 59 — File-Based Scale Limits + Externalization Readiness  
> Version target: v0.57.0

هذا الملف يحدد حدود التشغيل الآمنة للبنية الحالية المعتمدة على ملفات JSON.

Phase 59 لا تنقل يوميّة إلى PostgreSQL أو Redis أو external queue أو external search.  
Phase 59 تضيف قياسًا واضحًا وحدودًا تشغيلية تساعدنا نعرف متى نضغط، نؤرشف، نصلّح، أو نبدأ مراجعة Phase 60+.

---

## 1. لماذا Phase 59 موجودة؟

بعد Phase 58 أصبحت يوميّة منصة marketplace متكاملة مع:

- jobs / applications
- attendance
- payments
- ratings
- reports
- verification
- Workrooms
- Direct Offers
- Predictive Abuse
- Audit Index
- Ops Queue
- Scheduler Registry
- Production Readiness
- Governance / Privacy / RBAC

كل هذا ما زال يعمل على file-based JSON persistence.

هذا مناسب في المراحل الحالية بشرط وجود:

```text
حدود واضحة
قياس مستمر
تحذيرات مبكرة
Runbooks عملية
قرار externalization مبني على دليل
```

---

## 2. حدود file-based architecture

البنية الحالية قوية لأنها:

- بسيطة
- قابلة للفهم
- تعمل بدون dependency خارجية
- سهلة backup/restore
- سهلة الاختبار عبر YAWMIA_DATA_PATH
- تستخدم atomic writes
- تستخدم monthly sharding للـ high-volume collections
- تستخدم secondary indexes و filesystem inverted indexes

لكن لها حدود:

```text
كثرة الملفات تزيد readdir/stat/list costs
ملفات index واحدة قد تكبر جدًا
JSON parse الكامل يصبح مكلفًا
queue claim scans قد تتباطأ
audit token index قد ينفجر في عدد الملفات
workroom sidecars قد تكبر مع read receipts/messages
multi-writer غير آمن
```

---

## 3. Soft vs Hard Thresholds

### Soft warning threshold

يعني:

```text
النظام يعمل، لكن يجب المراجعة والتخفيف.
```

الإجراءات المقترحة:

- قياس Storage Pressure
- compact / archive
- verify indexes
- مراجعة cadence
- توثيق في weekly ops review

### Critical threshold

يعني:

```text
النظام يحتاج إجراء قريب. لا يعني تلقائيًا نقل قاعدة البيانات.
```

الإجراءات المقترحة:

- backup
- verify JSON/file health
- run relevant compaction/repair
- فتح incident لو التأثير تشغيلي
- Postmortem لو critical incident
- مراجعة EXTERNALIZATION_READINESS.md كتحضير Phase 60+

---

## 4. Collection thresholds

الإعدادات الرسمية موجودة في:

```text
config.SCALE_LIMITS.thresholds.collections
```

أمثلة:

| Collection | Warning | Critical | Notes |
|---|---:|---:|---|
| users | 50,000 files | 100,000 files | flat collection |
| jobs | 20,000 files/shard | 50,000 files/shard | monthly sharded |
| applications | 50,000 files/shard | 100,000 files/shard | high growth |
| messages | 100,000 files/shard | 250,000 files/shard | Workroom pressure |
| notifications | 100,000 files/shard | 250,000 files/shard | high volume |
| audit | 100,000 files | 250,000 files | retention + index pressure |
| direct_offers | 50,000 files/shard | 100,000 files/shard | Talent Radar / offers |
| privacy_requests | 5,000 files | 20,000 files | governance |
| admin_approvals | 5,000 files | 20,000 files | governance |
| ops_reviews | 5,000 files | 20,000 files | governance |
| postmortems | 2,000 files | 10,000 files | governance |

---

## 5. Index thresholds

Official config:

```text
config.SCALE_LIMITS.thresholds.indexes
```

| Index Type | Warning | Critical |
|---|---:|---:|
| set index JSON file | 2 MB | 8 MB |
| audit token files | 50,000 files | 150,000 files |
| search index | 4 MB | 16 MB |

High-risk index files:

```text
notifications/user-index.json
messages/job-index.json
messages/user-index.json
applications/job-index.json
applications/worker-index.json
jobs/index.json
direct_offers/employer-index.json
direct_offers/worker-index.json
```

---

## 6. Queue thresholds

Official config:

```text
config.SCALE_LIMITS.thresholds.queue
```

| Metric | Warning | Critical |
|---|---:|---:|
| pending jobs | 1,000 | 5,000 |
| running jobs | 100 | 500 |
| dead-letter jobs | 10 | 50 |
| stale summary | 30 minutes | 6 hours |

Queue pressure does not mean “add more writer processes”.

Correct response:

```bash
node scripts/verify-queue.js
node scripts/compact-queue.js
node scripts/queue-retry-dlq.js --dry-run
node scripts/repair-queue.js
```

---

## 7. Workroom sidecar thresholds

Official config:

```text
config.SCALE_LIMITS.thresholds.workrooms
```

| Metric | Warning | Critical |
|---|---:|---:|
| sidecar JSON | 512 KB | 2 MB |
| workroom search index | 1 MB | 4 MB |

Pressure sources:

- read receipts
- messages
- search index terms
- attachments metadata
- timeline events
- pinned messages
- checklist items

Correct response:

```bash
node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
node scripts/cleanup-attachments.js
```

---

## 8. Governance record thresholds

Governance collections are not usually high volume, so growth is a signal:

```text
privacy_requests
admin_approvals
ops_reviews
postmortems
```

Warning may mean:

- stale privacy requests
- forgotten approvals
- overdue postmortem action items
- weekly ops review not being completed

Correct response:

```bash
node scripts/verify-privacy-governance.js --strict
node scripts/verify-admin-rbac.js --strict
node scripts/ops-weekly-review.js --persist
```

---

## 9. Analytics / rollup thresholds

Official config:

```text
config.SCALE_LIMITS.thresholds.analytics
```

| Metric | Warning | Critical |
|---|---:|---:|
| search analytics files | 5,000 | 20,000 |
| product intelligence files | 5,000 | 20,000 |

Correct response:

```bash
node scripts/rollup-product-intelligence.js
node scripts/verify-marketplace-intelligence.js
```

---

## 10. What to do when warning threshold is hit

1. افتح Admin → Scale → Storage Pressure.
2. اقرأ top recommended actions.
3. شغّل قياس يدوي:

```bash
node scripts/measure-storage-pressure.js
```

4. شغّل الفحص المناسب:

```bash
node scripts/verify-scale-thresholds.js
```

5. شغّل compaction/repair حسب المصدر:

```bash
node scripts/compact-queue.js
node scripts/compact-workrooms.js
node scripts/compact-counters.js
node scripts/rebuild-audit-index.js
node scripts/verify-audit-index.js
```

6. وثّق النتيجة:

```bash
node scripts/ops-weekly-review.js --persist
```

---

## 11. What to do when critical threshold is hit

1. قيّم التأثير:
   - هل API بطيء؟
   - هل queue متوقفة؟
   - هل search fallback مستمر؟
   - هل JSON corruption موجودة؟
2. خذ backup:

```bash
node scripts/backup.js
```

3. شغّل health verification:

```bash
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
node scripts/verify-scale-thresholds.js --strict
```

4. شغّل الإجراء المناسب:
   - queue → `repair-queue`, `compact-queue`
   - audit → `rebuild-audit-index`, `verify-audit-index`
   - workrooms → `compact-workrooms`, `verify-workroom-indexes`
   - counters → `compact-counters`, `rebuild-counters`
5. لو هناك user impact أو production risk:
   - افتح incident
   - اتبع `../incidents/INCIDENT_RUNBOOKS.md`
6. لو incident critical:
   - أنشئ Postmortem
7. بعد الاستقرار:
   - راجع `EXTERNALIZATION_READINESS.md`
   - لا تبدأ Phase 60 قبل evidence واضح

---

## 12. When to consider Phase 60+ externalization

Consider Phase 60+ only if:

- نفس threshold يتكرر بعد compaction/archive.
- p95 benchmark paths غير مقبول.
- queue claim latency يتزايد باستمرار.
- audit/search fallback مكلف ومتكرر.
- Workroom sidecars/read receipts لا يمكن ضغطها كفاية.
- storage pressure critical يؤثر على production.
- single-writer file-based model أصبح عائقًا مؤكدًا.

Evidence required:

```bash
node scripts/measure-storage-pressure.js --json
node scripts/benchmark-file-paths.js --json
node scripts/verify-scale-thresholds.js --json
node scripts/ops-weekly-review.js --persist
```

---

## 13. What NOT to do

```text
Do not migrate to PostgreSQL just because one warning appears.
Do not run multiple writers as a scaling solution.
Do not run PM2 cluster mode.
Do not treat file locks as distributed consensus.
Do not ignore critical queue or JSON corruption signals.
Do not delete audit or financial records blindly.
Do not run deep scans during startup.
Do not cache /api/*.
Do not expose storage pressure reports publicly.
Do not include PII in benchmark or pressure output.
```

---

## 14. Phase 59 rule

Phase 59 is:

```text
measure
warn
document
prepare
benchmark
```

Phase 59 is not:

```text
PostgreSQL implementation
external queue implementation
external search implementation
distributed locking implementation
multi-writer production
```

## Phase 61 — Evidence Before Pilot

Scale thresholds في Phase 61 لا تعني migration تلقائي.

Decision rules:

```text
one warning → monitor
repeated warnings → mitigate_file_based
repeated criticals → rehearsal_required
pilot_candidate → requires rollback rehearsal + approval + privacy review
```

Candidate matrix:

| Candidate | Mitigation first |
|---|---|
| ops_queue | verify/repair/compact/DLQ review |
| audit/search | rebuild/verify/token compaction |
| images | cleanup/dedupe/retention/restore drill impact |
| messages/workrooms | compact sidecars/receipts/verify indexes |
| jobs/applications | query index repair/search rebuild |
| users | phone-index repair/privacy review |
| payments | audit/financial rollback plan |

No external DB/search/queue implementation in Phase 61 by default.
