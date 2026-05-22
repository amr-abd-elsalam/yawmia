# يوميّة — Deployment Runbook
> Phase 58 — Production Deployment + Governance Discipline  
> Version target: v0.54.0

هذا الملف يشرح طريقة نشر يوميّة في production مع الحفاظ على قاعدة أساسية:

> **Production = single writer فقط. لا PM2 cluster. لا multi-writer.**

---

## 1. Production prerequisites

قبل أي deploy:

node --version
npm test
node scripts/predeploy-check.js --strict
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict

المطلوب:

- Node.js `>=20`
- `npm install`
- `.env` مضبوط
- `ADMIN_TOKEN` غير default
- `ALLOWED_ORIGIN` مضبوط في production
- backup موجود أو خطة backup مفعلة
- آخر restore drill ناجح وحديث
- Queue سليمة
- Audit index غير stale
- PWA cache محدث مع version

---

## 2. Environment variables

مثال production:

NODE_ENV=production
PORT=3002
HOST=0.0.0.0
ADMIN_TOKEN=replace-with-long-random-secret
ALLOWED_ORIGIN=https://yowmia.com
INSTANCE_MODE=single_writer
INSTANCE_ID=prod-main-01
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

لو messaging مفعّل:

WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
INFOBIP_API_KEY=...
INFOBIP_BASE_URL=...

---

## 3. Single-writer rule

يوميّة في Phase 57 يستخدم file-based JSON persistence.  
هذا يعني:

مسموح: instance واحد writer
مسموح: read-only replicas للقراءة فقط
ممنوع: multiple writer instances
ممنوع: PM2 cluster mode
ممنوع: Kubernetes replicas تعمل writes بدون external DB/lock system

---

## 4. systemd deployment

ملف مثال:

[Unit]
Description=Yawmia Node.js App
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/yawmia
EnvironmentFile=/opt/yawmia/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
User=yawmia
Group=yawmia
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target

Commands:

sudo systemctl daemon-reload
sudo systemctl enable yawmia
sudo systemctl start yawmia
sudo systemctl status yawmia

Restart آمن:

node scripts/predeploy-check.js --strict
sudo systemctl restart yawmia
node scripts/postdeploy-smoke.js --base=http://localhost:3002

---

## 5. PM2 single-writer deployment

مسموح فقط single process:

pm2 start server.js --name yawmia --instances 1
pm2 save
pm2 status

ممنوع:

pm2 start server.js -i max
pm2 start server.js --instances 2

> لا تستخدم PM2 cluster mode في Phase 57.

---

## 6. nginx reverse proxy

مثال:

server {
  listen 80;
  server_name yowmia.com www.yowmia.com;

  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 75s;
    proxy_send_timeout 75s;
  }

  location /api/notifications/stream {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /api/admin/events {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}

ممنوع cache لـ:

/api/*
/api/notifications/stream
/api/admin/events

---

## 7. Cloudflare/TLS recommendations

- SSL/TLS: Full strict
- Always Use HTTPS: enabled
- Brotli: enabled
- Cache Level: Standard
- لا تعمل Cache Rules على `/api/*`
- لا تعمل cache للـ SSE endpoints
- استخدم WAF rate limiting لو متاح
- تأكد من proxy timeout مناسب للـ SSE

---

## 8. Static/PWA cache deployment discipline

عند كل release:

package.json version
config.PWA.cacheName
frontend/sw.js CACHE_NAME
/api/health version
/api/docs version

لازم كلهم يتطابقوا.

في Phase 58:

0.54.0
yawmia-v0.54.0

---

## 9. Pre-deploy checklist

git status
npm test
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
node scripts/verify-queue.js
node scripts/verify-production-readiness.js --strict
node scripts/predeploy-check.js --strict

لو أي critical fail: لا تعمل deploy.

---

## Phase 58 Governance deployment checks

قبل deploy أي نسخة Phase 58+:

node scripts/verify-admin-rbac.js --strict
node scripts/verify-privacy-governance.js --strict
node scripts/predeploy-check.js --strict

تأكد من:

ADMIN_RBAC.enabled=true
ADMIN_APPROVALS.enabled=true
PRIVACY_REQUESTS.enabled=true
POSTMORTEMS.enabled=true
OPS_REVIEW_RECORDS.enabled=true

---

## Admin token governance

`ADMIN_TOKEN` ما زال مدعومًا للـ backward compatibility، لكنه يساوي غالبًا:

super_admin

لا تشاركه مع الدعم اليومي.

للدعم اليومي استخدم admin sessions مع roles:

ops_admin
trust_admin
support_admin
finance_admin
read_only_admin

---

## Privacy workflows

قبل تشغيل anonymization:

node scripts/backup.js
node scripts/anonymize-user-data.js --userId=usr_x --dry-run

ثم بعد approval:

node scripts/anonymize-user-data.js --userId=usr_x --confirm

لا تحذف financial أو audit records يدويًا.

---

## Incident postmortems

الحوادث `critical` تحتاج Postmortem إذا:

POSTMORTEMS.requireForCriticalIncidents=true

راجع:

POSTMORTEM_TEMPLATE.md
/api/admin/postmortems

---

## 10. Backup before deploy

يدويًا:

node scripts/backup.js

أو تأكد من backup scheduler في production.

ثم تأكد من restore drill:

node scripts/run-backup-restore-drill.js

---

## 11. Migration procedure

node scripts/migrate.js --dry-run
node scripts/migrate.js

Migration في Phase 57 لا يعمل heavy scan.

---

## 12. Safe restart procedure

node scripts/predeploy-check.js --strict
sudo systemctl restart yawmia
node scripts/postdeploy-smoke.js --base=http://localhost:3002

راقب:

journalctl -u yawmia -f

---

## 13. Post-deploy smoke

node scripts/postdeploy-smoke.js --base=https://yowmia.com

مع admin token:

ADMIN_TOKEN=xxx node scripts/postdeploy-smoke.js --base=https://yowmia.com

---

## 14. Rollback procedure

1. فعّل maintenance لو لازم:

curl -X POST https://yowmia.com/api/admin/maintenance/enable \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"المنصة تحت الصيانة مؤقتاً. حاول بعد قليل."}'

2. ارجع commit السابق:

git checkout <previous-good-commit>
npm install
node scripts/migrate.js
sudo systemctl restart yawmia
node scripts/postdeploy-smoke.js --base=http://localhost:3002

3. عطّل maintenance.

---

## 15. Read-only replica deployment

Replica للقراءة فقط:

INSTANCE_MODE=read_only_replica
INSTANCE_ID=read-replica-01

المتوقع:

- queue workers لا تعمل
- schedulers لا تعمل
- write APIs محجوبة
- GET APIs مسموحة

لا تستخدم read-only replica لقبول OTP أو نشر jobs أو admin write actions.

---

## 16. What NOT to do

Do not run PM2 cluster mode.
Do not run multiple writer instances.
Do not cache /api/*.
Do not deploy without backup.
Do not enable experimental_multi_instance in production.
Do not treat file locks as distributed consensus.
Do not run queue-drain from multiple machines at once.
Do not run writer and read-only replica against same writable disk.
Do not deploy with default ADMIN_TOKEN.
Do not ignore failed restore drill in production.

---

## Phase 60+ externalization boundary

Phase 58 ما زال يحافظ على نفس قيود المعمارية: لا PostgreSQL ولا external search ولا external DB.  
عند Phase 60+، أول candidates للـ external DB:

1. `users`
2. `jobs`
3. `applications`
4. `payments`
5. `messages/workrooms`
6. `ops_queue`
