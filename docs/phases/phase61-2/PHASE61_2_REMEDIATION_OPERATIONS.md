# Phase 61.2 — Remediation Operations Runbook

> Status: Operational runbook  
> Mode: dry-run-first  
> Mutation: forbidden without backup + approval + confirm  
> Externalization: not allowed by this runbook

---

## 1. Purpose

This runbook turns Phase 61.1 remediation visibility into a safe workflow.

The remediation status aggregator reports problems. It does not fix them.

```text
Remediation status is diagnosis.
Repair is a separate approved operation.
```

---

## 2. Required Safe Sequence

Run in this order:

```bash
node scripts/phase61-1-remediation-status.js --json
node scripts/verify-data-json.js --strict --json
node scripts/find-null-json-files.js --json
node scripts/quarantine-corrupt-json.js --dry-run --json
node scripts/verify-queue.js --json
node scripts/repair-queue.js --dry-run --json
node scripts/compact-queue.js --dry-run --json
node scripts/backup.js
node scripts/repair-queue.js --confirm --json
node scripts/verify-queue.js --strict --json
```

The mutation boundary is:

```text
Everything before backup is read-only or dry-run.
Nothing mutates unless --confirm is explicit.
```

---

## 3. Non-negotiable Rules

```text
Do not mutate without backup.
Do not mutate without explicit --confirm.
Do not mutate without approval for dangerous admin actions.
Do not delete corrupt JSON blindly.
Do not retry all DLQ blindly.
Do not treat queue inflation as external queue evidence.
Do not treat JSON corruption as PostgreSQL evidence.
Do not run heavy scans inside readiness HTTP endpoints.
```

---

## 4. JSON Integrity Workflow

Diagnosis:

```bash
node scripts/verify-data-json.js --strict --json
```

If corrupt JSON exists:

```bash
node scripts/find-null-json-files.js --json
node scripts/quarantine-corrupt-json.js --dry-run --json
```

Before any quarantine or mutation:

```bash
node scripts/backup.js
```

Only after backup and explicit approval:

```bash
node scripts/quarantine-corrupt-json.js --confirm --json
```

Then verify again:

```bash
node scripts/verify-data-json.js --strict --json
```

---

## 5. Null-byte Workflow

Diagnosis:

```bash
node scripts/find-null-json-files.js --json
```

Interpretation:

```text
Null-byte files indicate corruption or interrupted writes.
They are not externalization evidence by themselves.
```

Actions:

```text
1. Identify affected collection.
2. Verify if tmp/stale files exist.
3. Check latest backup.
4. Quarantine only with dry-run first.
5. Confirm only after approval.
```

---

## 6. Queue Verification Workflow

Diagnosis:

```bash
node scripts/verify-queue.js --json
```

Strict verification before deploy:

```bash
node scripts/verify-queue.js --strict --json
```

If verification fails:

```bash
node scripts/repair-queue.js --dry-run --json
```

Do not run confirm yet.

---

## 7. Queue Repair Workflow

Dry-run:

```bash
node scripts/repair-queue.js --dry-run --json
```

Required before confirm:

```text
dry-run output reviewed
backup completed
admin approval exists
no critical open incident blocks operation
maintenance window considered
```

Confirm:

```bash
node scripts/repair-queue.js --confirm --json
```

Post-repair verification:

```bash
node scripts/verify-queue.js --strict --json
node scripts/phase61-1-remediation-status.js --json
```

---

## 8. Queue Compaction Workflow

Dry-run:

```bash
node scripts/compact-queue.js --dry-run --json
```

Confirm only when:

```text
completed/failed/cancelled/archive policy is understood
backup exists
approval exists if mutation is dangerous
queue workers are healthy or paused intentionally
```

Confirm:

```bash
node scripts/compact-queue.js --confirm --json
```

Post-check:

```bash
node scripts/verify-queue.js --strict --json
```

---

## 9. DLQ Workflow

Never blindly retry all DLQ.

Safe sequence:

```text
1. Group DLQ by job type.
2. Inspect representative error.
3. Fix root cause.
4. Retry one sample job.
5. Verify side effects.
6. Retry bounded batch.
7. Re-run queue verify.
```

Commands:

```bash
node scripts/queue-retry-dlq.js --dry-run --json
node scripts/queue-retry-dlq.js --confirm --limit 10 --json
```

If a DLQ pattern repeats:

```text
open incident
link to weekly ops review
do not call it external queue evidence until repeated after repair/compaction
```

---

## 10. Evidence After Remediation

After remediation:

```bash
node scripts/phase61-1-remediation-status.js --json
node scripts/measure-storage-pressure.js --json --persist
node scripts/verify-scale-thresholds.js --latest-only --persist --json
node scripts/capture-phase61-evidence.js --persist --json
node scripts/ops-weekly-review.js --persist
```

The review should record:

```text
what was detected
what dry-run said
what was approved
which backup was used
what command mutated data
what post-verification showed
remaining risks
```

---

## 11. Admin UI Copy Requirements

Admin UI copy should say:

```text
تشغيل الإصلاح يجب أن يبدأ بـ dry-run.
أي إصلاح مؤثر يحتاج backup وموافقة.
Pilot غير مسموح الآن — وهذا سلوك صحيح لحماية المنصة.
لا يوجد نقل خارجي مفعّل. النظام ما زال file-backed.
```

Avoid:

```text
Repair now
Migrate now
Enable pilot
Externalize queue
Switch DB
```

---

## 12. Success Criteria

Remediation operations are successful only when:

```text
dry-run was executed first
backup exists before mutation
approval exists for dangerous mutation
confirm was explicit
post-repair verification passed
weekly ops review linked the operation
pilot gate remains evaluated after remediation
no externalization was triggered automatically
```
