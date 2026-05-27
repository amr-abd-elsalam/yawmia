# يوميّة — Privacy Data Map
> Phase 57 — Initial Privacy Inventory for Phase 58

هذا الملف توثيق فقط. لا يضيف data export/delete implementation في Phase 57.

---

## users

PII fields:
- phone
- name
- governorate
- lat/lng
- categories
- notificationPreferences
- verificationStatus

Admin-only:
- phone كامل
- status/banReason

Public-safe:
- id
- display name
- role
- governorate
- categories
- rating
- verificationStatus

Retention:
- soft delete retention via TRUST.softDeleteRetentionDays

Export/delete implications:
- user deletion يجب أن يخفي phone/name/location.
- ratings/audit قد تبقى بدون PII.

---

## sessions

PII:
- userId
- token
- ip
- userAgent

Admin-only:
- yes

Public-safe:
- no

Retention:
- ttlDays

Delete:
- logout/delete account destroys sessions.

---

## jobs

PII:
- employerId
- location
- lat/lng
- description may contain accidental PII

Public-safe:
- public jobs excluding direct_offer synthetic jobs

Retention:
- no explicit deletion yet

Notes:
- content filter يقلل phone leakage.

---

## applications

PII:
- workerId
- jobId

Admin-only:
- full lifecycle

Public-safe:
- no direct public listing

Delete:
- user deletion needs anonymization strategy Phase 58.

---

## attendance

PII:
- workerId
- employerId
- GPS checkInLat/checkInLng
- date/time

Admin-only:
- mostly

Public-safe:
- no

Retention:
- no explicit retention yet

Risk:
- high location sensitivity.

---

## messages

PII:
- senderId
- recipientId
- text
- attachments metadata

Admin-only:
- should not be broadly exposed

Public-safe:
- no

Retention:
- Workroom retains after completion per config.

Risk:
- message text may contain phone/private details.

---

## workrooms

PII:
- job participants
- messages sidecars
- read receipts
- pins
- checklist
- attachments refs

Admin-only:
- operational hygiene only, not raw message content in dashboards

Public-safe:
- no

---

## payments

PII:
- employerId
- disputedBy
- jobId
- disputeReason

Financial sensitivity:
- amount
- platformFee
- workerPayout

Admin-only:
- yes

Public-safe:
- involved parties only.

---

## reports

PII:
- reporterId
- targetId
- reason
- adminNotes

Admin-only:
- yes

Public-safe:
- no

Retention:
- no explicit cleanup yet.

---

## verifications

PII:
- userId
- nationalIdImageRef
- selfieImageRef
- adminNotes

Highly sensitive:
- identity images

Admin-only:
- yes

Public-safe:
- only verificationStatus.

---

## images

PII:
- identity images
- workroom attachments

Storage:
- content-addressed image store

Public-safe:
- no; served via authenticated route.

Risk:
- high.

---

## notifications

PII:
- userId
- message
- meta

Admin-only:
- user-scoped

Public-safe:
- no

Retention:
- read notification cleanup via config.

---

## audit

PII:
- adminId
- targetId
- details
- ip

Admin-only:
- yes

Retention:
- AUDIT_RETENTION retentionDays.

---

## predictive_signals

PII:
- entityId
- relatedUserId
- risk explanations

Admin-only:
- yes

Public-safe:
- no

Policy:
- no auto-ban.
- human review only.

---

## metrics

PII:
- should be aggregate only
- some operational records may contain IDs

Admin-only:
- yes

Public-safe:
- no

---

## exports

PII:
- depends on export type
- audit CSV can include admin IDs, target IDs, details, IP

Admin-only:
- yes

Retention:
- EXPORTS.retentionHours

---

## ops_queue

PII:
- payload may contain IDs
- exportId
- deliveryId

Admin-only:
- yes

Retention:
- queue hygiene/compaction.

---

## alert_deliveries

PII:
- payload may include operational IDs
- webhook payload details sanitized

Admin-only:
- yes

Retention:
- ALERT_DELIVERY.historyRetentionDays

---

# Phase 58 notes

Required later:
- user data export
- account deletion/anonymization map
- PII field inventory enforcement
- retention policy dashboard
- admin audit around privacy access
