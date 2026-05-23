# يوميّة — Data Governance Runbook
> Phase 58 — Privacy and Operational Data Governance

---

## 1. Data ownership

يوميّة تحتفظ ببيانات تشغيلية لازمة لتشغيل marketplace:

- user profile
- jobs/applications
- attendance
- payments
- workrooms/messages
- trust and safety records
- operational audit records

أي وصول إداري لهذه البيانات يجب أن يكون:

least privilege
audited
purpose-bound
time-limited where possible

---

## 2. PII inventory summary

PII الأساسية:

phone
name
governorate
lat/lng
GPS attendance
message text
verification image refs
dispute reasons
report reasons
audit target/details/ip

---

## 3. Public-safe vs admin-only data

Public-safe endpoints لا تعرض:

phone
session tokens
identity images
precise GPS
raw workroom messages
admin notes
audit details
predictive signal internals

Admin-only endpoints يجب أن تكون protected بـ:

requireAdmin for backward compatibility
requireCapability for least privilege
audit logging for every write/privacy action

---

## 4. Financial data handling

لا تحذف financial records blindly.

Payments يجب أن تبقى للحسابات والمراجعة القانونية:

amount
platformFee
workerPayout
status
jobId
createdAt

عند anonymization:
- أزل PII embedded إن وجدت.
- لا تحذف مبلغ أو حالة الدفع.

---

## 5. Identity image handling

Identity images highly sensitive.

Rules:

Do not export raw identity images by default.
Do not expose image refs publicly.
Delete verification image refs on anonymization if configured.
Use cleanup scripts for orphan attachments/images where safe.

---

## 6. Workroom/message data handling

Messages may contain accidental PII.

Rules:

Do not expose messages publicly.
Do not include other users' unrevealed phones in privacy export.
Do not delete workroom history blindly.
Preserve operational/legal context where required.

---

## 7. Predictive signal data handling

Predictive signals are admin-only.

Rules:

No auto-ban.
No punitive automation.
Human review only.
False-positive and confirmed labels must be maintained.

---

## 8. Export policy

Exports must exclude:

session tokens
ADMIN_TOKEN
webhook secrets
VAPID private key
raw identity images
raw queue secrets

Audit/log export requires RBAC capability.

---

## 9. Anonymization policy

Anonymization must be:

previewable
idempotent
audited
approval-protected for destructive action

Do not blindly delete:

financial records
audit records
incident records
ops review records

---

## 10. Phase 59 migration snapshot policy

Migration snapshots are for Phase 60+ readiness only.

Command:

```bash
node scripts/export-migration-snapshot.js --dry-run
node scripts/export-migration-snapshot.js --out=./migration-snapshots/test --confirm
```

Rules:

```text
Do not export raw session tokens.
Do not export ADMIN_TOKEN or webhook secrets.
Do not inline raw identity images or base64 attachments.
Do not expose migration snapshots publicly.
Do not import snapshots into external DB in Phase 59.
Do not use snapshots to bypass anonymization/privacy rules.
```

Snapshot format is documented in:

```text
DATA_MIGRATION_FORMATS.md
```

Externalization readiness is documented in:

```text
EXTERNALIZATION_READINESS.md
```

## 11. Retention policy

Follow config:

AUDIT_RETENTION.retentionDays
EXPORTS.retentionHours
ALERT_DELIVERY.historyRetentionDays
PRIVACY_REQUESTS.requestRetentionDays
POSTMORTEMS.actionItemRetentionDays

---

## 12. Admin audit policy

Every privacy/admin governance action must write audit:

privacy_request_created
privacy_export_queued
privacy_anonymization_queued
user_anonymized
approval_created
approval_approved
approval_rejected
approval_consumed
postmortem_created
ops_review_completed

---

## 13. Privacy review cadence

Weekly:

node scripts/verify-privacy-governance.js
node scripts/ops-weekly-review.js --persist

Review:
- open privacy requests
- expired exports
- anonymization queue jobs
- failed privacy jobs
