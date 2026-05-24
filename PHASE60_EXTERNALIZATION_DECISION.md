# يوميّة — Phase 60 Externalization Decision Framework

> Phase 60 = Evidence-Based Decision + Rehearsal  
> Version: v0.56.0  
> Advisory by default. No automatic migration.

---

## 1. الهدف

Phase 60 ليست PostgreSQL migration.

Phase 60 تضيف طبقة قرار:

```text
Evidence → Decision → Rehearsal → Approval → Future Pilot
```

ولا تنفذ أي external database أو external queue أو external search افتراضيًا.

---

## 2. قواعد صارمة

```text
Do not implement PostgreSQL because of a single warning.
Do not externalize without repeated evidence.
Do not remove file-backed fallback in Phase 60.
Do not run multiple writers.
Do not treat file locks as distributed consensus.
```

---

## 3. Evidence inputs

قبل أي قرار externalization يجب جمع:

```bash
node scripts/measure-storage-pressure.js --json
node scripts/verify-scale-thresholds.js --json
node scripts/benchmark-file-paths.js --json --persist
node scripts/export-migration-snapshot.js --dry-run
node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/test --json
node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/test --dry-run --json
node scripts/ops-weekly-review.js --persist
```

Evidence المقبول:

```text
storage pressure snapshots
scale threshold evaluations
benchmark history
migration snapshot validation reports
migration rehearsal reports
weekly ops reviews
ops SLO violations
incidents/postmortems related to file saturation
```

---

## 4. Decision statuses

| Status | معنى القرار | الإجراء |
|---|---|---|
| `no_action` | لا يوجد دليل كافٍ | استمر بالمراقبة |
| `monitor` | إشارة واحدة أو evidence ضعيف | اجمع history |
| `mitigate_file_based` | repeated warnings | compact/repair/rebuild |
| `rehearsal_required` | repeated criticals أو benchmark critical | شغّل rehearsal |
| `pilot_candidate` | rehearsal passed + evidence persists + approval | pilot محدود فقط |
| `deferred` | مؤجل | لا تنفيذ |

---

## 5. Candidate matrix

| Candidate | Evidence Needed | File-Based Mitigation First | Externalization Only If |
|---|---|---|---|
| `ops_queue` | pending/DLQ/claim latency trends | compact/repair/drain/DLQ review | repeated queue pressure or single-writer bottleneck |
| `audit/search` | token file explosion, slow fallback, p95 search | token compaction/rebuild/index verify | repeated search/index criticals |
| `images` | binary size, backup/restore time, largest files | cleanup orphans, dedupe, retention | image store pressure affects ops |
| `messages/workrooms` | sidecar growth, read receipt write amplification | compact workrooms, receipt compaction | repeated sidecar criticals |
| `jobs/applications` | shard pressure, listing latency, index size | shard/index repair/query optimization | marketplace core p95 unacceptable |
| `users` | flat user count, phone-index size, privacy workflows | index hygiene, profile compaction | identity storage becomes bottleneck |
| `payments` | financial volume, dispute records, audit constraints | retention/reporting improvements | only after strong transactional need |

---

## 6. One warning rule

تحذير واحد لا يساوي externalization.

If one warning appears:

```text
measure again
verify thresholds
compact/repair
benchmark
document in ops review
```

---

## 7. Repeated warning rule

Repeated warnings داخل window 30 يوم:

```text
status = mitigate_file_based
```

الإجراءات:

```bash
node scripts/compact-queue.js
node scripts/verify-queue.js
node scripts/rebuild-audit-index.js
node scripts/compact-workrooms.js
node scripts/cleanup-attachments.js
```

---

## 8. Repeated critical rule

Repeated criticals بعد mitigation:

```text
status = rehearsal_required
```

هذا لا يعني migration.  
يعني فقط:

```bash
node scripts/export-migration-snapshot.js --out=./migration-snapshots/phase60-test --confirm
node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/phase60-test --strict
node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/phase60-test --dry-run --json
```

---

## 9. Pilot candidate rule

`pilot_candidate` لا يظهر إلا بعد:

```text
repeated evidence
successful migration rehearsal
rollback plan
privacy review
admin approval
production readiness review
single bounded subsystem
```

Pilot لا يعني إزالة file-backed source.

---

## 10. Approval process

أي pilot future يحتاج:

```text
admin approval
ops review
privacy review
rollback rehearsal
incident plan
postdeploy smoke
```

---

## 11. What NOT to do

```text
Do not migrate all data at once.
Do not remove file-backed source of truth.
Do not run multi-writer production.
Do not add external dependencies without approval.
Do not externalize search if Arabic explainability will be lost.
Do not externalize payments without financial rollback/audit plan.
```
