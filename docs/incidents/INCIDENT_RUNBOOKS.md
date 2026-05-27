# يوميّة — Incident Runbooks
> Phase 57 — Incident Taxonomy + Response Playbooks

كل incident في Phase 57 يفضل أن يحتوي على:

```text
runbookKey
severity
sourceType
refs
events
```

---

# QUEUE_DLQ_SPIKE

Severity: high

## Symptoms
- DLQ count > 0 أو spike مفاجئ
- `ops_queue:job_dead_lettered`
- Admin tab: Scale / Ops Queue

## Commands

```bash
node scripts/verify-queue.js
node scripts/queue-retry-dlq.js --dry-run
```

## Safe remediation

- افحص نوع jobs.
- افحص `lastError`.
- retry فقط لو الخطأ transient.
- لا تعمل retry جماعي بدون فهم السبب.

## Escalation

لو DLQ >= 5 أو نفس النوع يتكرر: افتح incident high.

## Prevention

- idempotency keys واضحة.
- لا ترسل payload كبير.
- راقب alert delivery failures.

---

# QUEUE_STALE_RUNNING

Severity: high

## Symptoms
- running jobs قديمة
- lease expired
- queue worker restart حصل أثناء job

## Commands

```bash
node scripts/verify-queue.js
node scripts/queue-drain.js
```

## Safe remediation

- شغل verify.
- اترك queue recovery يحاول.
- لو متكرر، راجع worker logs والـ process lock.

---

# QUEUE_SUMMARY_MISMATCH

Severity: medium

## Symptoms
- summary counts لا تطابق scan
- Scale hygiene يحذر من Queue summary stale

## Commands

```bash
node scripts/repair-queue.js
node scripts/verify-queue.js
```

## Safe remediation

- rebuild summary/location index.
- لا تعدل queue files يدويًا.

---

# SCHEDULER_STALE

Severity: medium

## Symptoms
- scheduler nextRunAt overdue
- lastStatus failed
- ops SLO scheduler stale

## Commands

```bash
node scripts/scheduler-cadence-report.js
```

## Safe remediation

- راجع instance mode.
- راجع queue status.
- run scheduler manually من admin UI إذا آمن.

---

# ALERT_DELIVERY_DEAD_LETTER

Severity: high

## Symptoms
- alert_delivery dead-letter
- webhook فشل كل retry attempts

## Commands

```bash
node scripts/verify-queue.js
```

## Safe remediation

- افحص webhook URL.
- افحص network/TLS.
- retry من admin UI بعد الإصلاح.

---

# BACKUP_RESTORE_DRILL_FAILED

Severity: critical

## Symptoms
- restore drill status failed
- JSON parse errors داخل backup
- missing critical indexes

## Commands

```bash
node scripts/run-backup-restore-drill.js --keep
node scripts/verify-data-json.js --strict
```

## Safe remediation

- لا تعتمد على backup until fixed.
- افحص backup path.
- افحص JSON corruption.
- أنشئ backup جديد بعد الإصلاح.

---

# JSON_CORRUPTION

Severity: critical

## Symptoms
- invalid JSON
- zero-byte JSON
- rebuild scripts تفشل

## Commands

```bash
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
```

## Safe remediation

- اعزل الملف الفاسد.
- استرجع من backup.
- لا تعمل repair-indexes قبل إصلاح source records.

---

# SEARCH_REBUILD_FAILED

Severity: medium

## Symptoms
- searchIndex/queryIndex rebuild failed
- jobs listing/search slow or inaccurate

## Commands

```bash
node scripts/verify-data-json.js --strict
node scripts/rebuild-search-relevance.js
```

## Safe remediation

- أصلح JSON corruption أولًا.
- أعد rebuild search relevance.

---

# AUDIT_INDEX_STALE

Severity: medium

## Symptoms
- audit index stale
- indexed search fallback

## Commands

```bash
node scripts/rebuild-audit-index.js
node scripts/verify-audit-index.js
```

## Safe remediation

- rebuild index.
- verify.
- لو audit critical مطلوب، لا تعتمد على indexed-only search.

---

# COUNTER_FILE_CRITICAL

Severity: high

## Symptoms
- counter file size critical
- monitor emits `counters:file_size_critical`

## Commands

```bash
node scripts/compact-counters.js
node scripts/rebuild-counters.js
```

## Safe remediation

- compact first.
- rebuild only لو compact لم يكفِ.
- راقب direct offer analytics بعدها.

---

# WORKROOM_SIDECAR_CRITICAL

Severity: medium

## Symptoms
- workroom sidecar كبير جدًا
- workroom hygiene warnings

## Commands

```bash
node scripts/compact-workrooms.js
node scripts/verify-workroom-indexes.js
```

## Safe remediation

- compact sidecars.
- verify search indexes.
- cleanup orphan attachments.

---

# MARKETPLACE_ROLLUP_STALE

Severity: low/medium

## Symptoms
- marketplace dashboard stale
- no recent product intelligence rollup

## Commands

```bash
node scripts/rollup-product-intelligence.js
node scripts/verify-marketplace-intelligence.js
```

## Safe remediation

- run rollup.
- check scheduler cadence.

---

# MAINTENANCE_ENABLED_TOO_LONG

Severity: medium

## Symptoms
- maintenance mode active لفترة طويلة
- users blocked from write APIs

## Commands

```bash
node scripts/postdeploy-smoke.js --base=http://localhost:3002
```

## Safe remediation

- تأكد من سبب maintenance.
- اعمل smoke.
- عطّل maintenance بعد التأكد.

---

# PROCESS_LOCK_STALE

Severity: medium/high

## Symptoms
- stale process lock
- queue workers/schedulers لا تبدأ

## Commands

```bash
node scripts/verify-production-readiness.js
```

## Safe remediation

- تأكد أن owner process مات.
- force release من admin UI فقط بعد التأكد.

---

# PRODUCTION_READINESS_FAILED

Severity: high

## Symptoms
- predeploy-check fails
- readiness status not_ready

## Commands

```bash
node scripts/predeploy-check.js --strict
node scripts/verify-production-readiness.js --strict
```

## Safe remediation

- لا تعمل deploy.
- اتبع recommendation لكل failed check.

---

# GENERAL_OPERATIONAL_INCIDENT

Severity: medium

## Symptoms
- unknown event
- no specific runbookKey

## Safe remediation

- راجع incident timeline.
- اربط event بنوع incident جديد في phase لاحقة.
