# يوميّة — Privacy Data Map
> Phase 58 — Privacy Inventory, Export Behavior, and Anonymization Map

هذا الملف يصف خريطة البيانات الحساسة وسلوك export/anonymization بعد تفعيل Phase 58.

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

# Phase 58 workflow behavior

بعد Phase 58، هذا الملف لم يعد inventory فقط.  
كل collection يجب أن يكون له:

Export behavior
Anonymization behavior
Delete behavior
Retention owner
Admin access capability

---

## users — Phase 58 behavior

Export behavior:
- included in user data export.
- includes phone/name/location for requesting user only.

Anonymization behavior:
- phone replaced by anon marker.
- name becomes `مستخدم محذوف`.
- governorate/lat/lng removed.
- notificationPreferences removed.
- status becomes `anonymized`.

Delete behavior:
- no hard delete by default.
- preserves referential integrity.

Retention owner:
- platform governance.

Admin access capability:
- `admin.users.read`
- privacy actions require `admin.privacy.*`

---

## sessions — Phase 58 behavior

Export behavior:
- metadata only.
- token always redacted.

Anonymization behavior:
- destroyed if `PRIVACY_REQUESTS.deleteSessionsOnAnonymize=true`.

Delete behavior:
- delete session files.

Retention owner:
- auth/session lifecycle.

Admin access capability:
- no broad admin export of tokens.

---

## verifications / images — Phase 58 behavior

Export behavior:
- metadata only.
- raw image refs withheld.
- raw binaries never included.

Anonymization behavior:
- image refs removed.
- image binaries deleted best-effort if configured.

Delete behavior:
- delete image refs and optionally image files.

Retention owner:
- privacy governance.

Admin access capability:
- `admin.verifications.review`
- anonymization requires `admin.privacy.anonymize`

---

## messages / workrooms — Phase 58 behavior

Export behavior:
- included only if user is participant and config allows.
- no raw base64.
- attachments metadata only.

Anonymization behavior:
- message history preserved by default.
- identity display should resolve to anonymized user record.
- do not delete conversation history blindly.

Delete behavior:
- no hard delete by default.

Retention owner:
- workroom retention policy.

Admin access capability:
- raw message content should not be broadly exposed.

---

## payments — Phase 58 behavior

Export behavior:
- included if user is involved.
- financial amounts preserved.

Anonymization behavior:
- preserve financial/legal records.
- do not remove amount/platformFee/workerPayout.

Delete behavior:
- no hard delete by privacy anonymization.

Retention owner:
- finance/legal governance.

Admin access capability:
- `admin.finance.read`
- `admin.payments.complete`

---

## reports / predictive_signals — Phase 58 behavior

Export behavior:
- included if user is reporter/target/entity.
- admin-only explanations remain limited.

Anonymization behavior:
- preserve safety history.
- mark entity as anonymized where applicable.

Delete behavior:
- no blind delete.

Retention owner:
- trust and safety governance.

Admin access capability:
- `admin.trust.read`
- `admin.predictive.review`

---

## audit — Phase 58 behavior

Export behavior:
- audit export is admin-only and capability-protected.
- privacy export does not include raw audit details by default.

Anonymization behavior:
- audit records are not blindly deleted.
- future phases may hash targetId/details if legally required.

Delete behavior:
- governed by `AUDIT_RETENTION`.

Retention owner:
- security/governance.

Admin access capability:
- `admin.audit.read`
- `admin.audit.export`

---

## privacy_requests — Phase 58 behavior

Export behavior:
- request metadata is exportable to the requesting user.

Anonymization behavior:
- request records preserved for governance.

Delete behavior:
- retention via `PRIVACY_REQUESTS.requestRetentionDays`.

Retention owner:
- privacy governance.

Admin access capability:
- `admin.privacy.read`
- `admin.privacy.write`
- `admin.privacy.export`
- `admin.privacy.anonymize`

## admin_approvals — Phase 58 behavior

PII:
- adminId
- requesterId
- targetId
- reason
- sanitized payload

Export behavior:
- governance/internal only.
- not included in user privacy export by default.

Anonymization behavior:
- preserve approval records for audit.
- remove embedded PII from payload where possible.

Retention owner:
- governance/security.

Admin access capability:
- `admin.approvals.read`
- `admin.approvals.write`

## ops_review_records — Phase 58 behavior

PII:
- may include adminId, incidentId, drillId, queue job refs, findings.

Export behavior:
- internal governance only.

Anonymization behavior:
- preserve operational record.
- avoid raw user PII in findings.

Retention owner:
- operations governance.

Admin access capability:
- `admin.ops.reviews.read`
- `admin.ops.reviews.write`

## postmortems — Phase 58 behavior

PII:
- may include incident refs, owner ids, user impact summaries.

Export behavior:
- internal governance only.

Anonymization behavior:
- preserve incident accountability.
- avoid raw user PII in narrative.

Retention owner:
- incident governance.

Admin access capability:
- `admin.postmortems.read`
- `admin.postmortems.write`
