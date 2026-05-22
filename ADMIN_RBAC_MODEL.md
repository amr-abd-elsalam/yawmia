# يوميّة — Admin RBAC Model
> Phase 58 — Governance, Privacy, RBAC, and Operational Maturity  
> Version target: v0.54.0

هذا الملف يشرح نموذج صلاحيات الأدمن في يوميّة بعد Phase 58.

---

## 1. لماذا نحتاج RBAC بعد Phase 57؟

بعد Phase 57 أصبحت يوميّة تحتوي على أدوات تشغيل حساسة:

- queue repair
- scheduler control
- process lock force release
- maintenance mode
- audit exports
- payment completion
- trust and predictive abuse review
- privacy export/anonymization

استخدام `ADMIN_TOKEN` واحد لكل هذه العمليات خطر.  
RBAC يقلل الخطر بتطبيق مبدأ:

Least privilege — أقل صلاحية تكفي لأداء المهمة

---

## 2. Admin roles

الأدوار الرسمية:

super_admin
ops_admin
trust_admin
support_admin
finance_admin
read_only_admin

### super_admin

صلاحيات كاملة.  
يستخدم فقط للطوارئ والإعدادات الحساسة.

### ops_admin

مسؤول عن التشغيل:

- queue
- schedulers
- incidents
- maintenance
- locks
- readiness
- scale hygiene

### trust_admin

مسؤول عن الثقة والأمان:

- reports
- abuse flags
- predictive signals
- trust calibration
- decision quality

### support_admin

مسؤول عن الدعم:

- قراءة المستخدمين
- مراجعة التحقق
- إجراءات status محدودة

### finance_admin

مسؤول عن الماليات:

- financial summaries
- payment completion
- dispute analytics
- finance exports

### read_only_admin

قراءة فقط.  
لا ينفذ write أو dangerous actions.

---

## 3. Capability model

كل route حساس يجب أن يطلب capability واضحة مثل:

admin.queue.repair
admin.locks.release
admin.payments.complete
admin.predictive.review
admin.trust.calibration
admin.audit.export
admin.privacy.anonymize

`super_admin` يمتلك:

*

---

## 4. Route capability examples

| Route | Capability |
|---|---|
| `POST /api/admin/queue/repair` | `admin.queue.repair` |
| `POST /api/admin/production/process-locks/:name/release` | `admin.locks.release` |
| `POST /api/admin/payments/:id/complete` | `admin.payments.complete` |
| `POST /api/admin/predictive-abuse/signals/:id/escalate` | `admin.predictive.review` |
| `POST /api/admin/trust/calibration/report` | `admin.trust.calibration` |
| `GET /api/admin/audit-log/export` | `admin.audit.export` |
| `POST /api/admin/privacy/requests/:id/anonymize` | `admin.privacy.anonymize` |

---

## 5. Dangerous actions

Dangerous actions تشمل:

user_ban
bulk_abuse_action
process_lock_force_release
maintenance_enable
queue_repair
scheduler_disable
payment_complete
audit_export
privacy_anonymize

هذه العمليات قد تحتاج approval إذا:

ADMIN_APPROVALS.enabled=true
ADMIN_RBAC.dangerousActionsRequireApproval=true

---

## 6. Approval requirements

Approval workflow:

pending → approved | rejected | expired | consumed

مهم:

- approval لا ينفذ action تلقائيًا.
- approval فقط يسمح بتنفيذ action لاحقًا.
- approval يجب أن يحتوي reason.
- approval payload لا يحتوي secrets.

---

## 7. Audit requirements

كل write admin action يجب أن يسجل audit:

adminId
action
targetType
targetId
details sanitized
ip
createdAt

لا تخزن:

raw session tokens
ADMIN_TOKEN
webhook secrets
raw identity image data

---

## 8. Emergency super_admin process

استخدم `super_admin` فقط عند:

- incident critical
- lock stuck
- maintenance emergency
- privacy anonymization approval
- production readiness failure

بعد الطوارئ:

node scripts/ops-weekly-review.js --persist

وسجل postmortem إذا incident critical.

---

## 9. What NOT to do

Do not share ADMIN_TOKEN broadly.
Do not use super_admin for daily support.
Do not allow support admins to run ops queue repair.
Do not allow trust admins to force release process locks.
Do not allow finance admins to review predictive abuse signals.
Do not allow read_only_admin to POST dangerous routes.
Do not store secrets in approval payloads.
Do not bypass audit logs.
