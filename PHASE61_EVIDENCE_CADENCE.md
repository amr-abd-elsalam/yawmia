# يوميّة — Phase 61 Evidence Cadence

> Phase 61 = تشغيل الأدلة بشكل دوري + منع القرارات المعمارية المبكرة  
> Version: v0.57.0  
> Advisory by default. No externalization by default.

---

## 1. لماذا نحتاج Evidence Cadence؟

Phase 60 أضافت framework لاتخاذ قرار externalization مبني على الدليل.

لكن framework بدون cadence يتحول إلى لوحة نظرية:

```text
No evidence history = no externalization decision.
A single benchmark artifact is not a trend.
A single warning is not migration evidence.
```

Phase 61 يحوّل الأدلة إلى operating loop:

```text
measure → benchmark → verify → review → decide → rehearse → gate
```

---

## 2. Weekly storage pressure capture

مرة أسبوعيًا:

```bash
node scripts/measure-storage-pressure.js --json
node scripts/measure-storage-pressure.js --json --persist
```

الغرض:

```text
file counts
largest JSON files
queue pressure
workroom sidecars
image/object pressure
governance pressure
```

لا تستخدم deep scan افتراضيًا في وقت الذروة.

---

## 3. Weekly benchmark persist

مرة أسبوعيًا:

```bash
node scripts/benchmark-file-paths.js --json --persist
```

الغرض:

```text
read user by id
read job by id
list jobs
audit search
queue list
workroom search
search relevance
storage pressure shallow scan
```

قاعدة مهمة:

```text
One p95 warning ≠ migration evidence.
Repeated p95 warnings over evidence window = investigate.
Repeated p95 criticals after mitigation = rehearsal_required.
```

---

## 4. Weekly scale threshold verification

مرة أسبوعيًا:

```bash
node scripts/verify-scale-thresholds.js --json
```

وفي predeploy strict:

```bash
node scripts/verify-scale-thresholds.js --json --strict
```

---

## 5. Weekly externalization decision snapshot

مرة أسبوعيًا بعد storage pressure + benchmark:

```bash
node scripts/capture-externalization-decision.js --json
node scripts/capture-externalization-decision.js --persist
```

الغرض:

```text
ربط pressure + benchmark + readiness في decision artifact
```

---

## 6. Weekly Phase 61 evidence snapshot

مرة أسبوعيًا:

```bash
node scripts/capture-phase61-evidence.js --json
node scripts/capture-phase61-evidence.js --persist
```

هذا لا يشغل heavy scans.  
هذا يقرأ آخر artifacts فقط.

---

## 7. Weekly ops review integration

بعد الأدلة:

```bash
node scripts/ops-weekly-review.js --persist
```

يجب أن تتضمن المراجعة:

```text
latest storage pressure
latest benchmark
latest scale thresholds
latest externalization decision
latest migration rehearsal
latest rollback rehearsal
latest restore drill
pilot gate status
```

---

## 8. Restore drill freshness

قبل أي pilot future:

```bash
node scripts/run-backup-restore-drill.js
```

Freshness default:

```text
max age = 7 days
```

---

## 9. Evidence freshness rules

| Evidence | Fresh | Warning | Critical |
|---|---:|---:|---:|
| storage pressure | <= 7 days | > 14 days | > 30 days |
| benchmark | <= 7 days | > 14 days | > 30 days |
| scale thresholds | <= 7 days | > 14 days | > 30 days |
| externalization decision | <= 7 days | > 14 days | > 30 days |
| weekly ops review | <= 7 days | > 7 days | > 30 days |
| restore drill | <= 7 days | > 7 days | failed/missing before pilot |
| rollback rehearsal | required before pilot | missing = blocker | failed = blocker |

---

## 10. Stale evidence warnings

If evidence is stale:

```text
status = stale
recommendation = capture evidence
pilotAllowed = false
implementationAllowed = false
```

If evidence is missing:

```text
status = missing
recommendation = start cadence
pilotAllowed = false
implementationAllowed = false
```

---

## 11. What not to do

```text
Do not externalize because of one warning.
Do not treat one benchmark artifact as a trend.
Do not run deep scans at startup.
Do not run benchmarks from production readiness.
Do not add PostgreSQL by default.
Do not add external queue/search by default.
Do not remove file-backed source of truth.
Do not run multiple writers.
Do not start pilot without rollback rehearsal.
```

---

## 12. Minimum weekly command set

```bash
node scripts/measure-storage-pressure.js --json --persist
node scripts/benchmark-file-paths.js --json --persist
node scripts/verify-scale-thresholds.js --json
node scripts/capture-externalization-decision.js --persist
node scripts/capture-phase61-evidence.js --persist
node scripts/evaluate-pilot-gate.js --json
node scripts/ops-weekly-review.js --persist
```
