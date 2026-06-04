# Yawmia Systems Catalog

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch: Patch 16 — Systems Catalog Baseline  
> Scope: Architecture Inventory / system-level map  
> Runtime posture: documentation-only  
> Source of truth posture: file-backed JSON source of truth  
> Externalization posture: advisory-only  
> Last reviewed: 2026-06-04

---

## Purpose

This catalog is the first canonical Architecture Inventory document for Yawmia after scripts governance stabilization.

It maps the current runtime systems at system level:

```text
routes
handlers
services
data collections
events
operational scripts
source vs derived data boundaries
risks
notes
```

This document is not a remediation approval, not a migration approval, and not runtime authority.

Companion architecture catalogs:

```text
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
```

SYSTEMS_CATALOG.md maps systems.

DATA_CATALOG.md maps collections, indexes, source/derived boundaries, queue storage, evidence artifacts, privacy sensitivity, and repair/rebuild ownership.

SERVER_CATALOG.md maps server startup, middleware, router, timers, queue workers, schedulers, SSE, and shutdown lifecycle.

SERVER_CATALOG.md is the server/runtime lifecycle catalog companion to this system-level catalog.

Together they form the current architecture inventory baseline.

---

## Architecture Posture

Current Yawmia architecture is:

```text
Native Node.js 20+ ESM
native http
native fetch
native node:stream
native node:test
Vanilla JS frontend
PWA
SSE
Admin SSE
Web Push
file-backed JSON source of truth
atomic writes
unique temp-file writes
monthly sharding
secondary indexes
filesystem indexes
durable file-backed ops queue
segmented queue storage
queue summary/location indexes
file-backed process locks
file-backed scheduler registry
file-backed governance records
file-backed evidence artifacts
single-writer discipline
zero new dependencies
```

Current Yawmia architecture is explicitly:

```text
no Express
no Koa
no Fastify
no React
no PostgreSQL
no Redis
no external queue
no external search
no external DB
no runtime repository switching
```

Externalization work in Phase 59 / Phase 60 / Phase 61 is advisory/evidence only.

---

## Global Source of Truth Rules

Yawmia uses file-backed JSON storage with explicit source-vs-derived boundaries.

Core rules:

```text
JSON source records are source of truth.
Secondary indexes are derived/rebuildable artifacts.
Filesystem search indexes are derived/rebuildable artifacts.
Queue segmented files are source of truth when summary mismatch exists.
Queue summary/location indexes are derived acceleration artifacts.
Metrics snapshots and rollups are evidence artifacts.
Migration snapshots and rehearsal reports are evidence artifacts.
```

Operational warning:

```text
Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed.
Actual segmented queue files are source of truth.
Do not run queue-drain --confirm as remediation.
```

---

## Scripts Governance Baseline Link

Canonical script governance lives at:

```text
docs/operations/SCRIPTS_CATALOG.md
```

Current governance baseline:

```text
Patch 14 repair-indexes hardened.
Patch 15 cleanup-notification-flood hardened.
Scripts governance is green baseline before architecture inventory.
```

Important notification flood warning:

```text
cleanup-notification-flood.js is quarantine-only.
It never deletes notifications.
Confirmed mode moves notification source files to quarantine and updates notifications/user-index.json.
Hardening does not authorize confirmed execution.
```

---

## Advisory-only Externalization Rule

Phase 59 / Phase 60 / Phase 61 systems are evidence and governance systems only.

They do not implement:

```text
PostgreSQL
Redis
external queue
external search
external DB
object storage migration
runtime repository switching
dual-write
cutover
pilot by default
```

Pilot posture:

```text
pilotAllowed=false by default
implementationAllowed=false by default
runtimeSwitchEnabled=false
docsOnly=true for repository contracts
```

---

## Systems Index

1. Auth & Sessions System
2. Users & Profiles System
3. Jobs Marketplace System
4. Applications Lifecycle System
5. Attendance System
6. Payments & Receipts System
7. Ratings & Trust System
8. Reports & Abuse Review System
9. Notifications System
10. Messaging System
11. Workroom System
12. SSE / Live Feed / Web Push System
13. Presence & Instant Match System
14. Availability Ads / Worker Discovery / Direct Offers System
15. Search & Relevance System
16. Analytics & Marketplace Intelligence System
17. Ops Queue System
18. Scheduler Registry System
19. Monitoring / Incidents / Production Ops System
20. Governance / Privacy / RBAC / Approvals System
21. Backup / Restore / Migration Evidence System
22. File-backed Database & Indexing System

---

## 1. Auth & Sessions System

### Purpose

Phone OTP authentication and token-based sessions for workers, employers, and admins.

### Primary Routes

- `POST /api/auth/send-otp`
- `POST /api/auth/verify-otp`
- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `POST /api/auth/accept-terms`
- `DELETE /api/auth/account`

### Handlers

- `server/handlers/authHandler.js`

### Services

- `server/services/auth.js`
- `server/services/sessions.js`
- `server/services/users.js`
- `server/services/messaging.js`
- `server/services/channels/whatsapp.js`
- `server/services/channels/sms.js`
- `server/services/validators.js`
- `server/services/sanitizer.js`

### Data Collections

- `users`
- `sessions`
- `otp`
- `users/phone-index.json`

### Events

Emitted:

- `otp:sent`
- `user:created`
- `session:created`

Listened to:

- Notification and activation listeners may consume user/session-related events indirectly.

### Scripts / Operational Tools

- `scripts/verify-data-json.js`
- `scripts/verify-production-readiness.js`
- `scripts/export-user-data.js`
- `scripts/anonymize-user-data.js`

### Source vs Derived Data Boundary

- Source records: `users`, `sessions`, `otp`.
- Derived artifacts: `users/phone-index.json`.
- OTP hashes are source for active OTP validation but short-lived.
- Sessions are source records for bearer-token validation.

### Risks

- OTP abuse and rate-limit bypass.
- Default admin token in production.
- Session metadata stale or missing.
- Phone index drift.
- Query-token admin auth must remain limited to direct downloads.

### Notes

- Admin registration through OTP is blocked.
- OTP storage hashes OTP values.
- `dotenv` is the only production dependency.
- Do not weaken OTP, rate limit, or admin protections.

---

## 2. Users & Profiles System

### Purpose

User lifecycle, profile data, availability preferences, soft deletion, notification preferences, and public profile exposure.

### Primary Routes

- `GET /api/auth/me`
- `PUT /api/auth/profile`
- `GET /api/users/:id/public-profile`
- `GET /api/profile/tasks`
- `POST /api/profile/tasks/:id/click`
- `DELETE /api/auth/account`

### Handlers

- `server/handlers/authHandler.js`
- `server/handlers/profileTasksHandler.js`
- `server/handlers/verificationHandler.js`

### Services

- `server/services/users.js`
- `server/services/profileCompleteness.js`
- `server/services/profileTasks.js`
- `server/services/userDataExport.js`
- `server/services/userAnonymization.js`
- `server/services/verification.js`

### Data Collections

- `users`
- `verifications`
- `sessions`
- `privacy_requests`
- `users/phone-index.json`
- `verifications/user-index.json`

### Events

Emitted:

- `user:created`
- `profile_task:clicked_recorded`
- `verification_reviewed`

Listened to:

- `profile_task:*` events by activation funnel metrics.
- Privacy workflows consume user records through services.

### Scripts / Operational Tools

- `scripts/export-user-data.js`
- `scripts/anonymize-user-data.js`
- `scripts/verify-privacy-governance.js`
- `scripts/verify-admin-rbac.js`

### Source vs Derived Data Boundary

- Source records: `users`, `verifications`, privacy request records.
- Derived artifacts: phone indexes, verification user indexes, activation/product metrics.

### Risks

- PII leakage through public profiles.
- Privacy export artifacts must be protected.
- Anonymization is irreversible and requires approval and backup evidence.
- Profile completeness metrics must not become punitive automation.

### Notes

- Public profile must never expose phone, raw images, lat/lng, or notification preferences.
- Soft deletion and anonymization are separate flows.

---

## 3. Jobs Marketplace System

### Purpose

Job creation, listing, detail, lifecycle transitions, renewal, duplication, urgency, location, and public marketplace search.

### Primary Routes

- `POST /api/jobs`
- `GET /api/jobs`
- `GET /api/jobs/mine`
- `GET /api/jobs/nearby`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/start`
- `POST /api/jobs/:id/complete`
- `POST /api/jobs/:id/cancel`
- `POST /api/jobs/:id/renew`
- `POST /api/jobs/:id/duplicate`

### Handlers

- `server/handlers/jobsHandler.js`

### Services

- `server/services/jobs.js`
- `server/services/geo.js`
- `server/services/contentFilter.js`
- `server/services/searchIndex.js`
- `server/services/queryIndex.js`
- `server/services/searchRelevance.js`
- `server/services/arabicNormalizer.js`
- `server/services/arabicSearchTokens.js`

### Data Collections

- `jobs`
- `jobs/index.json`
- `jobs/employer-index.json`

### Events

Emitted:

- `job:created`
- `job:filled`
- `job:started`
- `job:completed`
- `job:cancelled`
- `job:renewed`
- `job:expiry_warning`
- `search:performed`
- `search:zero_results`

Listened to:

- `job:created` by job matching, alerts, live feed, availability ads.
- `job:*` by notification listeners and workroom timeline.

### Scripts / Operational Tools

- `scripts/repair-indexes.js`
- `scripts/rebuild-search-relevance.js`
- `scripts/benchmark-file-paths.js`
- `scripts/measure-storage-pressure.js`

### Source vs Derived Data Boundary

- Source records: `jobs`.
- Derived artifacts: `jobs/index.json`, `jobs/employer-index.json`, search indexes, query indexes.
- Synthetic direct-offer jobs are source job records but private to the involved parties.

### Risks

- Expiry warning floods if idempotency markers fail.
- Duplicate physical records across flat and sharded paths.
- Search index/query index drift.
- Synthetic jobs must not leak into public listings.
- Address/location fields must remain safe and bounded.

### Notes

- Jobs are monthly sharded.
- Public job listing filters out `sourceType='direct_offer'` unless explicitly requested.

---

## 4. Applications Lifecycle System

### Purpose

Worker applications, employer accept/reject, worker confirmation/decline, withdrawal, and instant-accept integration.

### Primary Routes

- `POST /api/jobs/:id/apply`
- `GET /api/jobs/:id/applications`
- `POST /api/jobs/:id/accept`
- `POST /api/jobs/:id/reject`
- `GET /api/applications/mine`
- `POST /api/applications/:id/withdraw`
- `POST /api/applications/:id/confirm`
- `POST /api/applications/:id/decline`

### Handlers

- `server/handlers/applicationsHandler.js`

### Services

- `server/services/applications.js`
- `server/services/applicationStatus.js`
- `server/services/jobs.js`

### Data Collections

- `applications`
- `applications/worker-index.json`
- `applications/job-index.json`

### Events

Emitted:

- `application:submitted`
- `application:accepted`
- `application:rejected`
- `application:withdrawn`
- `application:worker_confirmed`
- `application:worker_declined`

Listened to:

- Notification listeners consume application events.
- Workroom and attendance use accepted-equivalent semantics.

### Scripts / Operational Tools

- `scripts/repair-indexes.js`
- `scripts/report-duplicate-records.js`
- `scripts/measure-storage-pressure.js`

### Source vs Derived Data Boundary

- Source records: `applications`.
- Derived artifacts: worker/job application indexes.
- Accepted-equivalent statuses are computed by `applicationStatus.js`, not by migrating every historical record.

### Risks

- Over-acceptance if locks are bypassed.
- Worker confirmation status drift.
- Index mismatch can hide applications from employer dashboards.
- Legacy records may use older accepted semantics.

### Notes

- Accept operations lock per job via `accept-job:${jobId}`.
- `worker_confirmed` is accepted-equivalent for downstream systems.

---

## 5. Attendance System

### Purpose

Worker GPS check-in/out, employer manual check-in, no-show reporting, attendance confirmation, and auto no-show detection.

### Primary Routes

- `POST /api/jobs/:id/checkin`
- `POST /api/jobs/:id/checkout`
- `POST /api/jobs/:id/no-show`
- `POST /api/jobs/:id/manual-checkin`
- `GET /api/jobs/:id/attendance`
- `GET /api/jobs/:id/attendance/summary`
- `POST /api/attendance/:id/confirm`

### Handlers

- `server/handlers/attendanceHandler.js`

### Services

- `server/services/attendance.js`
- `server/services/geo.js`
- `server/services/applicationStatus.js`

### Data Collections

- `attendance`
- `attendance/job-index.json`
- `attendance/worker-index.json`

### Events

Emitted:

- `attendance:checkin`
- `attendance:checkout`
- `attendance:confirmed`
- `attendance:noshow`

Listened to:

- Notification, trust, analytics, workroom timeline, and activation metrics may consume attendance events.

### Scripts / Operational Tools

- `scripts/repair-indexes.js`
- `scripts/benchmark-file-paths.js`

### Source vs Derived Data Boundary

- Source records: `attendance`.
- Derived artifacts: job/worker attendance indexes, analytics rollups.

### Risks

- GPS false negatives.
- Manual override misuse.
- Auto no-show timing mismatch.
- Attendance index drift.
- Accepted-equivalent status must be respected.

### Notes

- Check-in uses Haversine distance.
- Check-out GPS is optional.
- Employer manual check-in is guarded by config.

---

## 6. Payments & Receipts System

### Purpose

Payment creation, confirmation, disputes, admin completion, financial summaries, receipts, and CSV exports.

### Primary Routes

- `POST /api/jobs/:id/payment`
- `GET /api/jobs/:id/payment`
- `GET /api/jobs/:id/receipt`
- `POST /api/payments/:id/confirm`
- `POST /api/payments/:id/dispute`
- `POST /api/admin/payments/:id/complete`
- `GET /api/admin/financial-summary`
- `GET /api/admin/export/payments`
- `GET /api/employer/export/payments`

### Handlers

- `server/handlers/paymentsHandler.js`
- `server/handlers/analyticsHandler.js`

### Services

- `server/services/payments.js`
- `server/services/financialExport.js`
- `server/services/analytics.js`
- `server/services/paymentDisputeAnalytics.js`

### Data Collections

- `payments`
- `payments/job-index.json`
- `metrics/payment-disputes`
- `exports`

### Events

Emitted:

- `payment:created`
- `payment:confirmed`
- `payment:completed`
- `payment:disputed`

Listened to:

- Notifications, analytics, marketplace intelligence, workroom summary.

### Scripts / Operational Tools

- `scripts/rollup-product-intelligence.js`
- `scripts/verify-marketplace-intelligence.js`
- `scripts/export-user-data.js`

### Source vs Derived Data Boundary

- Source records: `payments`.
- Derived artifacts: payment indexes, financial CSV files, dispute analytics rollups.

### Risks

- Financial data integrity.
- Dispute window miscalculation.
- CSV export leakage.
- Admin completion requires capability and should remain audited.

### Notes

- Receipt generation reads job, payment, users, applications, and attendance.
- Export artifacts are sensitive and expire through export registry policy.

---

## 7. Ratings & Trust System

### Purpose

Bidirectional ratings, user rating summaries, trust score v1/v2, trust calibration, and decision-quality analytics.

### Primary Routes

- `POST /api/jobs/:id/rate`
- `GET /api/jobs/:id/ratings`
- `GET /api/users/:id/ratings`
- `GET /api/users/:id/rating-summary`
- `GET /api/users/:id/trust-score`
- `GET /api/users/:id/trust-v2`
- `GET /api/ratings/pending`
- `GET /api/admin/users/:id/trust-v2`
- `GET /api/admin/trust/calibration/dashboard`
- `POST /api/admin/trust/calibration/snapshot-batch`
- `POST /api/admin/trust/calibration/report`

### Handlers

- `server/handlers/ratingsHandler.js`
- `server/handlers/reportsHandler.js`
- `server/handlers/adminHandler.js`
- `server/handlers/trustCalibrationHandler.js`

### Services

- `server/services/ratings.js`
- `server/services/trust.js`
- `server/services/trustScoreV2.js`
- `server/services/trustCalibration.js`
- `server/services/trustSnapshotRollups.js`
- `server/services/adminDecisionAnalytics.js`

### Data Collections

- `ratings`
- `metrics/trust-v2-snapshots`
- `metrics/trust-calibration`
- `metrics/trust-calibration/rollups`

### Events

Emitted:

- `rating:submitted`
- `trust_snapshot:created`
- `trust_calibration:report_created`

Listened to:

- Trust calibration listens to trust/rating/outcome events.
- Marketplace intelligence includes predictive precision and trust calibration summaries.

### Scripts / Operational Tools

- `scripts/run-trust-calibration.js`
- `scripts/rollup-trust-snapshots.js`
- `scripts/verify-marketplace-intelligence.js`

### Source vs Derived Data Boundary

- Source records: `ratings`.
- Derived artifacts: user rating summaries, trust snapshots, calibration reports, trust rollups.

### Risks

- Trust scores must remain explainable and non-punitive by default.
- Calibration drift.
- Ratings count threshold must prevent misleading public averages.
- Admin-only trust detail must not leak publicly.

### Notes

- Trust Score V2 exposes public-safe components when configured.
- No automatic weight changes are performed by calibration.

---

## 8. Reports & Abuse Review System

### Purpose

User reports, abuse flags, direct-offer abuse review workflow, warnings, snoozing, admin review history, and predictive abuse signals.

### Primary Routes

- `POST /api/reports`
- `GET /api/admin/reports`
- `PUT /api/admin/reports/:id`
- `GET /api/admin/direct-offers/abuse`
- `GET /api/admin/abuse-flags`
- `GET /api/admin/abuse-flags/search`
- `POST /api/admin/abuse-flags/bulk-action`
- `GET /api/admin/abuse-flags/:id/history`
- `POST /api/admin/abuse-flags/:id/review`
- `POST /api/admin/abuse-flags/:id/warn`
- `GET /api/admin/predictive-abuse/dashboard`
- `POST /api/admin/predictive-abuse/run-scan`

### Handlers

- `server/handlers/reportsHandler.js`
- `server/handlers/adminHandler.js`
- `server/handlers/trustCalibrationHandler.js`

### Services

- `server/services/reports.js`
- `server/services/trust.js`
- `server/services/offerAbuseDetector.js`
- `server/services/abuseFlagReview.js`
- `server/services/scheduledAbuseDetection.js`
- `server/services/predictiveAbuse.js`
- `server/services/predictiveSignalRetention.js`
- `server/services/trustAnalytics.js`

### Data Collections

- `reports`
- `abuse_flag_reviews`
- `predictive_signals`
- `metrics/predictive-signal-archives`
- `metrics/predictive-signal-archives/index`

### Events

Emitted:

- `report:created`
- `report:reviewed`
- `abuse_flag:state_changed`
- `abuse_flag:detected_high_severity`
- `direct_offer:abuse_threshold_crossed`
- `predictive_abuse:signal_created`
- `predictive_abuse:signal_updated`
- `predictive_abuse:signal_escalated`
- `predictive_abuse:scan_failed`

Listened to:

- Admin SSE listens to high-severity and predictive events.
- Admin alert channels can route high-severity abuse events.
- Incident timeline listens to predictive scan failures.

### Scripts / Operational Tools

- `scripts/compact-predictive-signals.js`
- `scripts/rebuild-predictive-archive-index.js`
- `scripts/inspect-predictive-scan-queue.js`
- `scripts/verify-marketplace-intelligence.js`

### Source vs Derived Data Boundary

- Source records: `reports`, `abuse_flag_reviews`, `predictive_signals`.
- Derived artifacts: predictive archives, archive indexes, trust analytics caches.

### Risks

- False positives.
- Admin warnings rate-limit visibility.
- Predictive signals must not auto-ban.
- Snooze reminder staleness.
- Bulk action misuse.

### Notes

- Human-in-the-loop is mandatory.
- Predictive abuse has `noAutoBan=true`.
- Abuse review state is fingerprint-based.

---

## 9. Notifications System

### Purpose

In-app notifications, notification indexes, actionable notification URLs, notification cleanup, external notification messaging, and notification conversion metrics.

### Primary Routes

- `GET /api/notifications`
- `GET /api/notifications/stream`
- `POST /api/notifications/read-all`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/:id/action-click`

### Handlers

- `server/handlers/notificationsHandler.js`
- `server/handlers/sseHandler.js`

### Services

- `server/services/notifications.js`
- `server/services/notificationActions.js`
- `server/services/notificationMessenger.js`
- `server/services/notificationConversionMetrics.js`
- `server/services/eventReplayBuffer.js`
- `server/services/sseManager.js`

### Data Collections

- `notifications`
- `notifications/user-index.json`
- `metrics/product-intelligence`

### Events

Emitted:

- `notification:created`
- `notification:action_clicked`
- `notification:action_click_recorded`
- `notification:conversion_recorded`

Listened to:

- `job:*`
- `application:*`
- `payment:*`
- `report:*`
- `verification:*`
- `attendance:*`
- `message:*`
- `direct_offer:*`

### Scripts / Operational Tools

- `scripts/cleanup-notification-flood.js`
- `scripts/cleanup-attachments.js`
- `scripts/verify-marketplace-intelligence.js`

### Source vs Derived Data Boundary

- Source records: `notifications`.
- Derived artifacts: `notifications/user-index.json`, notification conversion metrics.

### Risks

- Notification flood.
- Notification index drift.
- Action URL open redirect risks.
- SSE replay memory growth.

### Notes

- `cleanup-notification-flood.js` is quarantine-only.
- It never deletes notifications.
- Confirmed mode moves notification source files to quarantine and updates `notifications/user-index.json`.
- Hardening does not authorize confirmed execution.

---

## 10. Messaging System

### Purpose

Job-scoped in-app messaging, broadcasts, unread counts, message read state, message notifications, and content filtering.

### Primary Routes

- `POST /api/jobs/:id/messages`
- `POST /api/jobs/:id/messages/broadcast`
- `GET /api/jobs/:id/messages`
- `POST /api/jobs/:id/messages/read-all`
- `GET /api/messages/unread-count`
- `POST /api/messages/:id/read`

### Handlers

- `server/handlers/messagesHandler.js`

### Services

- `server/services/messages.js`
- `server/services/contentFilter.js`
- `server/services/sanitizer.js`
- `server/services/applicationStatus.js`

### Data Collections

- `messages`
- `messages/job-index.json`
- `messages/user-index.json`

### Events

Emitted:

- `message:created`
- `message:broadcast`

Listened to:

- Notification system listens for message events.
- Workroom search indexing listens to workroom-origin messages.

### Scripts / Operational Tools

- `scripts/repair-indexes.js`
- `scripts/rebuild-workroom-search.js`
- `scripts/verify-workroom-indexes.js`

### Source vs Derived Data Boundary

- Source records: `messages`.
- Derived artifacts: message job/user indexes, workroom search indexes, notification records.

### Risks

- Contact-info leakage.
- Content filter false positives/negatives.
- Broadcast overuse.
- Message index drift.
- Accepted-equivalent status mismatch.

### Notes

- Workroom messages reuse the messaging service with `source='workroom'`.
- Content filter checks messages when enabled.

---

## 11. Workroom System

### Purpose

Job-scoped collaboration spaces with messages, timeline, read receipts, pins, checklists, attachments, summaries, hygiene, and search.

### Primary Routes

- `GET /api/workrooms`
- `GET /api/workrooms/:id`
- `GET /api/workrooms/:id/messages`
- `POST /api/workrooms/:id/messages`
- `POST /api/workrooms/:id/messages/read-all`
- `GET /api/workrooms/:id/timeline`
- `GET /api/workrooms/:id/search`
- `GET /api/workrooms/:id/read-receipts`
- `POST /api/workrooms/:id/messages/:messageId/read`
- `GET /api/workrooms/:id/pins`
- `POST /api/workrooms/:id/pins`
- `DELETE /api/workrooms/:id/pins/:messageId`
- `GET /api/workrooms/:id/checklist`
- `POST /api/workrooms/:id/checklist`
- `PUT /api/workrooms/:id/checklist/:itemId`
- `DELETE /api/workrooms/:id/checklist/:itemId`
- `POST /api/workrooms/:id/attachments`
- `GET /api/workrooms/:id/summary`

### Handlers

- `server/handlers/workroomHandler.js`

### Services

- `server/services/workroom.js`
- `server/services/workroomReceipts.js`
- `server/services/workroomPins.js`
- `server/services/workroomChecklist.js`
- `server/services/workroomAttachments.js`
- `server/services/workroomSearch.js`
- `server/services/workroomHygiene.js`
- `server/services/workroomIndexHealth.js`
- `server/services/workroomAdoptionMetrics.js`
- `server/services/workroomTemplateMetrics.js`
- `server/services/messages.js`

### Data Collections

- `workrooms`
- `workrooms/receipts`
- `workrooms/pins`
- `workrooms/checklists`
- `workrooms/search-indexes`
- `messages`
- `images`
- `metrics/workroom-hygiene`
- `metrics/workroom-template-usage`

### Events

Emitted:

- `workroom:opened`
- `workroom:message_sent`
- `workroom:timeline_viewed`
- `workroom:message_pinned`
- `workroom:checklist_item_created`
- `workroom:checklist_item_completed`
- `workroom:attachment_uploaded`
- `workroom:template_used`

Listened to:

- Admin SSE listens to template and hygiene events.
- Marketplace intelligence consumes workroom adoption metrics.
- Workroom search indexes workroom message events.

### Scripts / Operational Tools

- `scripts/compact-workrooms.js`
- `scripts/rebuild-workroom-search.js`
- `scripts/verify-workroom-indexes.js`
- `scripts/cleanup-attachments.js`
- `scripts/verify-marketplace-intelligence.js`

### Source vs Derived Data Boundary

- Source records: `workrooms`, messages, receipts, pins, checklists, attachment metadata.
- Derived artifacts: workroom search indexes, hygiene metrics, adoption metrics.

### Risks

- Sidecar file growth.
- Search index drift.
- Orphan attachments.
- Read receipt sidecar growth.
- Attachment privacy and size risks.

### Notes

- Attachments are stored through content-addressed image storage.
- Workroom search indexes are rebuildable derived artifacts.

---

## 12. SSE / Live Feed / Web Push System

### Purpose

Real-time user notifications, admin events, live job feed, direct offers, instant match offers, and web push delivery.

### Primary Routes

- `GET /api/notifications/stream`
- `GET /api/jobs/live-feed`
- `POST /api/push/subscribe`
- `DELETE /api/push/subscribe`
- `GET /api/admin/events`

### Handlers

- `server/handlers/sseHandler.js`
- `server/handlers/liveFeedHandler.js`
- `server/handlers/pushHandler.js`
- `server/handlers/adminSseHandler.js`

### Services

- `server/services/sseManager.js`
- `server/services/eventReplayBuffer.js`
- `server/services/liveFeed.js`
- `server/services/webpush.js`
- `server/services/notifications.js`
- `server/services/adminAlertChannels.js`

### Data Collections

- `push_subscriptions`
- `push_subscriptions/user-index.json`
- `notifications`
- in-memory SSE connection maps

### Events

Emitted:

- SSE delivery is generally event-to-connection fanout, not durable events.

Listened to:

- `notification:created`
- `job:created`
- `job:filled`
- `job:cancelled`
- `job:started`
- `job:completed`
- `instant_match:candidates`
- `instant_match:accepted`
- `instant_match:expired`
- `direct_offer:created`
- `direct_offer:accepted`
- `direct_offer:declined`
- `direct_offer:expired`
- admin ops events listed in `adminSseHandler.js`

### Scripts / Operational Tools

- `scripts/verify-production-readiness.js`
- `scripts/postdeploy-smoke.js`

### Source vs Derived Data Boundary

- Source records: push subscriptions and notifications.
- Derived/in-memory state: SSE connection maps, replay buffers, live feed connections.

### Risks

- SSE is single-process in current architecture.
- Admin SSE is single-instance.
- EventBus is in-memory and not cross-instance.
- VAPID config missing in production breaks Web Push readiness.

### Notes

- SSE fanout is a Phase 60/61 docs-only planning topic.
- No external pub-sub is implemented.

---

## 13. Presence & Instant Match System

### Purpose

Worker live presence heartbeat, online worker counts, immediate job candidate selection, instant match offers, and first-accept-wins workflow.

### Primary Routes

- `POST /api/presence/heartbeat`
- `GET /api/workers/online-count`
- `POST /api/jobs/:id/instant-accept`
- `GET /api/jobs/live-feed`

### Handlers

- `server/handlers/presenceHandler.js`
- `server/handlers/liveFeedHandler.js`

### Services

- `server/services/presenceService.js`
- `server/services/instantMatch.js`
- `server/services/liveFeed.js`
- `server/services/geo.js`
- `server/services/trust.js`
- `server/services/availabilityWindow.js`
- `server/services/applications.js`

### Data Collections

- `instant_matches`
- in-memory presence map
- `availability_windows`

### Events

Emitted:

- `instant_match:candidates`
- `instant_match:accepted`
- `instant_match:expired`
- `application:accepted`

Listened to:

- `job:created` through job matching flow.
- Live feed listens to instant match events.

### Scripts / Operational Tools

- `scripts/verify-production-readiness.js`
- `scripts/postdeploy-smoke.js`

### Source vs Derived Data Boundary

- Source records: `instant_matches`, accepted applications.
- In-memory runtime state: presence map.
- Derived notifications/push messages are not source.

### Risks

- Presence is in-memory and single-process.
- Instant match timeout race conditions.
- Over-acceptance if job lock discipline is broken.
- Worker availability windows may be stale.

### Notes

- Instant accept uses the same `accept-job:${jobId}` lock pattern as applications.

---

## 14. Availability Ads / Worker Discovery / Direct Offers System

### Purpose

Worker availability ads, employer talent discovery, privacy-first worker cards, direct offers, synthetic jobs, two-phase identity reveal, and direct-offer analytics counters.

### Primary Routes

- `POST /api/availability-ads`
- `GET /api/availability-ads/mine`
- `DELETE /api/availability-ads/:id`
- `GET /api/availability-ads/:id`
- `GET /api/workers/discover`
- `GET /api/workers/:id/card`
- `POST /api/workers/:id/quick-offer`
- `POST /api/direct-offers`
- `GET /api/direct-offers/mine`
- `GET /api/direct-offers/:id`
- `POST /api/direct-offers/:id/accept`
- `POST /api/direct-offers/:id/decline`
- `DELETE /api/direct-offers/:id`
- `GET /api/direct-offers/stats/employer`
- `GET /api/direct-offers/stats/worker`

### Handlers

- `server/handlers/availabilityAdHandler.js`
- `server/handlers/workerDiscoveryHandler.js`
- `server/handlers/directOfferHandler.js`

### Services

- `server/services/availabilityAd.js`
- `server/services/workerDiscovery.js`
- `server/services/directOffer.js`
- `server/services/directOfferAnalytics.js`
- `server/services/directOfferCounters.js`
- `server/services/offerAbuseDetector.js`
- `server/services/adMatcher.js`
- `server/services/matchingIntelligence.js`
- `server/services/jobs.js`
- `server/services/applications.js`

### Data Collections

- `availability_ads`
- `availability_ads/worker-index.json`
- `direct_offers`
- `direct_offers/employer-index.json`
- `direct_offers/worker-index.json`
- `metrics/direct-offer-counters.json`
- `metrics/counter-archives`
- `abuse_flag_reviews`

### Events

Emitted:

- `ad:created`
- `ad:expired`
- `ad:withdrawn`
- `ad:matched`
- `ad:job_match`
- `direct_offer:created`
- `direct_offer:accepted`
- `direct_offer:declined`
- `direct_offer:expired`
- `direct_offer:withdrawn`

Listened to:

- Direct-offer counters listen to `direct_offer:*`.
- Analytics cache invalidation listens to `direct_offer:*`.
- Live feed listens to direct-offer events.
- Abuse detector evaluates direct-offer data.
- Availability ad matcher listens to `job:created`.

### Scripts / Operational Tools

- `scripts/rebuild-counters.js`
- `scripts/compact-counters.js`
- `scripts/benchmark-file-paths.js`
- `scripts/repair-indexes.js`

### Source vs Derived Data Boundary

- Source records: `availability_ads`, `direct_offers`, synthetic jobs/applications.
- Derived artifacts: direct-offer counters, counter archives, analytics caches, secondary indexes.

### Risks

- Counter drift.
- Direct-offer spam.
- Offer bombing.
- Synthetic job privacy leakage.
- Two-phase identity reveal must not expose phone/name before accept.
- Linked ad matching must remain idempotent.

### Notes

- Direct-offer accepted flow creates a synthetic job and accepted application.
- Synthetic jobs are private and filtered from public job listings.

---

## 15. Search & Relevance System

### Purpose

Arabic-first search normalization, job search filtering, weighted relevance ranking, audit search indexing, workroom search, and search analytics.

### Primary Routes

- `GET /api/jobs?search=...`
- `GET /api/workrooms/:id/search`
- `GET /api/admin/audit-log/search`
- `GET /api/admin/audit-index/status`
- `POST /api/admin/audit-index/rebuild`
- `POST /api/admin/audit-index/verify`
- `GET /api/admin/marketplace-intelligence/search`
- `GET /api/admin/marketplace-intelligence/search/zero-results`

### Handlers

- `server/handlers/jobsHandler.js`
- `server/handlers/workroomHandler.js`
- `server/handlers/adminHandler.js`
- `server/handlers/marketplaceIntelligenceHandler.js`

### Services

- `server/services/searchIndex.js`
- `server/services/queryIndex.js`
- `server/services/searchRelevance.js`
- `server/services/arabicNormalizer.js`
- `server/services/arabicSearchTokens.js`
- `server/services/searchAnalytics.js`
- `server/services/auditLogSearch.js`
- `server/services/auditLogIndex.js`
- `server/services/workroomSearch.js`
- `server/services/workroomIndexHealth.js`

### Data Collections

- `audit/indexes`
- `workrooms/search-indexes`
- `metrics/search-analytics`
- process-local search/query indexes

### Events

Emitted:

- `search:performed`
- `search:zero_results`
- `search:result_clicked_recorded`
- `search:conversion_recorded`
- `audit:logged`
- `audit:deleted`
- `audit_index:token_compaction_completed`
- `workroom_search:verified`
- `workroom_search:repair_completed`

Listened to:

- Audit index listens to `audit:logged` and `audit:deleted`.
- Marketplace intelligence listens to search analytics events.
- Workroom search listens to workroom message indexing calls.

### Scripts / Operational Tools

- `scripts/rebuild-audit-index.js`
- `scripts/verify-audit-index.js`
- `scripts/rebuild-search-relevance.js`
- `scripts/rebuild-workroom-search.js`
- `scripts/verify-workroom-indexes.js`
- `scripts/verify-marketplace-intelligence.js`

### Source vs Derived Data Boundary

- Source records: jobs, audit logs, messages.
- Derived artifacts: audit indexes, workroom search indexes, process-local search/query indexes, search analytics rollups.

### Risks

- Stale indexes.
- Candidate cap fallback to full scan.
- Arabic tokenization false positives/negatives.
- Audit query full-scan latency.
- Workroom search index mismatch.

### Notes

- Search indexes are acceleration only.
- Final records are re-read and re-filtered for correctness.

---

## 16. Analytics & Marketplace Intelligence System

### Purpose

Employer/worker/platform analytics, direct-offer funnel analytics, search analytics, activation funnel, notification conversions, workroom adoption, payment disputes, and marketplace intelligence rollups.

### Primary Routes

- `GET /api/analytics/employer`
- `GET /api/analytics/worker`
- `GET /api/admin/analytics`
- `GET /api/admin/monitoring`
- `GET /api/admin/marketplace-intelligence/dashboard`
- `GET /api/admin/marketplace-intelligence/search`
- `GET /api/admin/marketplace-intelligence/activation-funnel`
- `GET /api/admin/marketplace-intelligence/notification-conversions`
- `GET /api/admin/marketplace-intelligence/workroom-adoption`
- `GET /api/admin/marketplace-intelligence/payment-disputes`
- `GET /api/admin/marketplace-intelligence/matching-quality`
- `POST /api/admin/marketplace-intelligence/rollup/run`

### Handlers

- `server/handlers/analyticsHandler.js`
- `server/handlers/marketplaceIntelligenceHandler.js`
- `server/handlers/adminHandler.js`

### Services

- `server/services/analytics.js`
- `server/services/directOfferAnalytics.js`
- `server/services/searchAnalytics.js`
- `server/services/activationFunnelMetrics.js`
- `server/services/notificationConversionMetrics.js`
- `server/services/workroomAdoptionMetrics.js`
- `server/services/paymentDisputeAnalytics.js`
- `server/services/marketplaceIntelligenceRollups.js`
- `server/services/matchingIntelligence.js`

### Data Collections

- `metrics/search-analytics`
- `metrics/product-intelligence`
- `metrics/matching`
- `metrics/payment-disputes`
- `metrics/direct-offer-counters.json`

### Events

Emitted:

- `marketplace_intelligence:rollup_captured`
- `search_analytics:rollup_completed`
- `activation_funnel:rollup_completed`
- `workroom_adoption:rollup_completed`
- `payment_dispute_analytics:rollup_completed`

Listened to:

- `search:*`
- `profile_task:*`
- `notification:*`
- `workroom:*`
- `payment:disputed`
- `direct_offer:*`
- `predictive_signal:*`

### Scripts / Operational Tools

- `scripts/rollup-product-intelligence.js`
- `scripts/verify-marketplace-intelligence.js`
- `scripts/benchmark-file-paths.js`

### Source vs Derived Data Boundary

- Source records: users, jobs, applications, payments, messages, notifications, direct offers.
- Derived artifacts: analytics caches, metrics files, rollups, benchmark artifacts.

### Risks

- Heavy scans from HTTP endpoints.
- Stale rollups.
- Analytics cache invalidation delay.
- Metrics artifacts can be mistaken as source of truth.

### Notes

- HTTP dashboards should be lightweight and artifact-based.
- Heavy rollups should run via scripts, queue, or scheduler.

---

## 17. Ops Queue System

### Purpose

Durable file-backed operational queue with pending/running/completed/failed/cancelled/dead-letter lifecycle, idempotency, workers, retries, compaction, repair, and health verification.

### Primary Routes

- `GET /api/admin/ops-queue/stats`
- `GET /api/admin/ops-queue/jobs`
- `GET /api/admin/ops-queue/jobs/:id`
- `POST /api/admin/ops-queue/jobs/:id/retry`
- `POST /api/admin/ops-queue/jobs/:id/cancel`
- `GET /api/admin/ops-queue/dead-letter`
- `POST /api/admin/ops-queue/dead-letter/:id/retry`
- `GET /api/admin/queue/health`
- `POST /api/admin/queue/verify`
- `POST /api/admin/queue/compact`
- `POST /api/admin/queue/repair`

### Handlers

- `server/handlers/queueHandler.js`
- `server/handlers/scaleHygieneHandler.js`

### Services

- `server/services/opsQueue.js`
- `server/services/queueWorkers.js`
- `server/services/queueStorageIndex.js`
- `server/services/queueHealthVerify.js`
- `server/services/queueCompaction.js`
- `server/services/processLock.js`
- `server/services/instanceMode.js`

### Data Collections

- `ops_queue`
- `ops_queue/pending`
- `ops_queue/running`
- `ops_queue/completed`
- `ops_queue/failed`
- `ops_queue/cancelled`
- `ops_queue/dead-letter`
- `ops_queue/idempotency`
- `ops_queue/archive`
- `metrics/queue/summary.json`

### Events

Emitted:

- `ops_queue:job_created`
- `ops_queue:job_running`
- `ops_queue:job_completed`
- `ops_queue:job_failed`
- `ops_queue:job_dead_lettered`
- `ops_queue:summary_updated`
- `ops_queue:record_moved`
- `queue:health_verified`
- `queue:repair_completed`
- `queue:compaction_started`
- `queue:compaction_completed`
- `queue:compaction_failed`
- `queue:summary_rebuilt`

Listened to:

- Admin SSE listens to queue events.
- Incident timeline listens to dead-letter events.
- Ops rollups summarize queue events and state.

### Scripts / Operational Tools

- `scripts/verify-queue.js`
- `scripts/repair-queue.js`
- `scripts/compact-queue.js`
- `scripts/queue-retry-dlq.js`
- `scripts/queue-drain.js`
- `scripts/recover-stale-running-jobs.js`
- `scripts/inspect-predictive-scan-queue.js`

### Source vs Derived Data Boundary

- Source records: segmented queue job files.
- Derived artifacts: queue summary/location indexes.
- Queue segmented files are source of truth when summary mismatch exists.

### Risks

- Stale running jobs.
- Summary/index mismatch.
- Duplicate workers.
- Running confirmed queue scripts while server workers are active.
- Treating queue summary mismatch as externalization evidence.

### Notes

- Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed.
- Actual segmented queue files are source of truth.
- Do not run `queue-drain --confirm` as remediation.

---

## 18. Scheduler Registry System

### Purpose

File-backed recurring scheduler registry, leases, manual run, enable/disable, scheduler history, cadence reports, and scheduler queue integration.

### Primary Routes

- `GET /api/admin/schedulers`
- `GET /api/admin/schedulers/:name`
- `POST /api/admin/schedulers/:name/run`
- `POST /api/admin/schedulers/:name/enable`
- `POST /api/admin/schedulers/:name/disable`
- `GET /api/admin/schedulers/:name/history`
- `GET /api/admin/production/scheduler-cadence`

### Handlers

- `server/handlers/productionOpsHandler.js`
- `server/handlers/scaleHygieneHandler.js`

### Services

- `server/services/schedulerRegistry.js`
- `server/services/schedulerRunHistory.js`
- `server/services/opsQueue.js`
- `server/services/instanceMode.js`
- `server/services/processLock.js`

### Data Collections

- `scheduler`
- `scheduler/history`

### Events

Emitted:

- `scheduler:job_queued`
- `scheduler:job_failed`
- `scheduler:stale`
- `scheduler:run_history_recorded`
- `scheduler:history_cleanup_completed`

Listened to:

- Admin SSE listens to scheduler events.
- Incident timeline auto-opens incidents for stale scheduler events.
- Ops rollups summarize scheduler state.

### Scripts / Operational Tools

- `scripts/scheduler-cadence-report.js`
- `scripts/verify-production-readiness.js`
- `scripts/predeploy-check.js`

### Source vs Derived Data Boundary

- Source records: scheduler registry records.
- Derived artifacts: scheduler history and cadence reports.

### Risks

- Stale scheduler leases.
- Read-only replica running schedulers.
- Duplicate scheduler registration.
- Manual run misuse.

### Notes

- Scheduler execution should enqueue durable queue jobs.
- Schedulers are disabled in read-only replica mode.

---

## 19. Monitoring / Incidents / Production Ops System

### Purpose

Health checks, monitoring snapshots, threshold alerts, production readiness, deployment gate, ops rollups, incidents, process locks, maintenance mode, and backup restore drill visibility.

### Primary Routes

- `GET /api/health`
- `GET /api/admin/monitoring`
- `GET /api/admin/monitoring/latest`
- `GET /api/admin/production/readiness`
- `GET /api/admin/production/deployment-gate`
- `GET /api/admin/production/ops-review`
- `GET /api/admin/production/instance-mode`
- `GET /api/admin/production/process-locks`
- `POST /api/admin/production/process-locks/:name/release`
- `GET /api/admin/ops/rollups`
- `GET /api/admin/ops/slo`
- `GET /api/admin/incidents`
- `GET /api/admin/incidents/:id`
- `POST /api/admin/incidents/:id/resolve`
- `GET /api/admin/maintenance`
- `POST /api/admin/maintenance/enable`
- `POST /api/admin/maintenance/disable`

### Handlers

- `server/router.js`
- `server/handlers/analyticsHandler.js`
- `server/handlers/productionOpsHandler.js`
- `server/handlers/adminSseHandler.js`

### Services

- `server/services/monitor.js`
- `server/services/productionReadiness.js`
- `server/services/metricsRollups.js`
- `server/services/incidentTimeline.js`
- `server/services/processLock.js`
- `server/services/instanceMode.js`
- `server/services/maintenanceMode.js`
- `server/services/backupRestoreDrill.js`
- `server/services/errorAggregator.js`

### Data Collections

- `metrics`
- `metrics/ops-rollups`
- `metrics/incidents`
- `metrics/backup-restore-drills`
- `ops_locks`
- `ops/maintenance.json`

### Events

Emitted:

- `ops_rollup:captured`
- `ops_slo:violated`
- `incident:opened`
- `incident:event_appended`
- `incident:resolved`
- `backup_restore_drill:started`
- `backup_restore_drill:passed`
- `backup_restore_drill:failed`
- `process_lock:stale_recovered`
- `process_lock:acquire_failed`
- `maintenance:enabled`
- `maintenance:disabled`
- `counters:file_size_critical`
- `counters:auto_rebuild_triggered`

Listened to:

- Incident timeline listens to critical operational events.
- Admin SSE listens to monitoring/incident/maintenance events.
- Admin alert channels can deliver selected critical alerts.

### Scripts / Operational Tools

- `scripts/verify-production-readiness.js`
- `scripts/predeploy-check.js`
- `scripts/postdeploy-smoke.js`
- `scripts/run-backup-restore-drill.js`
- `scripts/export-incident-timeline.js`
- `scripts/ops-weekly-review.js`

### Source vs Derived Data Boundary

- Source records: process locks, maintenance state, incident records.
- Derived artifacts: monitoring snapshots, ops rollups, readiness reports, restore drill reports.

### Risks

- Health endpoints becoming too heavy.
- Stale locks.
- Maintenance mode fail-open.
- Critical incidents without postmortems.
- Monitoring snapshots mistaken as source truth.

### Notes

- HTTP readiness should remain lightweight and artifact-based.
- Production requires single-writer discipline.

---

## 20. Governance / Privacy / RBAC / Approvals System

### Purpose

Admin RBAC, dangerous action approvals, privacy requests, data export/anonymization workflows, ops review records, postmortems, and governance evidence.

### Primary Routes

- `GET /api/admin/rbac/matrix`
- `GET /api/admin/rbac/me`
- `GET /api/admin/approvals`
- `POST /api/admin/approvals`
- `POST /api/admin/approvals/:id/approve`
- `POST /api/admin/approvals/:id/reject`
- `GET /api/admin/privacy/requests`
- `POST /api/admin/privacy/requests`
- `GET /api/admin/privacy/requests/:id`
- `POST /api/admin/privacy/requests/:id/export`
- `POST /api/admin/privacy/requests/:id/anonymize-preview`
- `POST /api/admin/privacy/requests/:id/anonymize`
- `POST /api/admin/privacy/requests/:id/cancel`
- `GET /api/admin/ops/reviews`
- `POST /api/admin/ops/reviews`
- `GET /api/admin/ops/reviews/:id`
- `POST /api/admin/ops/reviews/:id/complete`
- `GET /api/admin/incidents/:id/postmortem`
- `POST /api/admin/incidents/:id/postmortem`
- `PUT /api/admin/postmortems/:id`
- `GET /api/admin/postmortems`

### Handlers

- `server/handlers/governanceHandler.js`
- `server/middleware/auth.js`
- `server/services/adminRbac.js`

### Services

- `server/services/adminRbac.js`
- `server/services/adminApprovals.js`
- `server/services/privacyRequests.js`
- `server/services/userDataExport.js`
- `server/services/userAnonymization.js`
- `server/services/opsReviewRecords.js`
- `server/services/postmortemRecords.js`
- `server/services/auditLog.js`

### Data Collections

- `privacy_requests`
- `ops/reviews`
- `ops/postmortems`
- `ops/admin-approvals`
- `audit`

### Events

Emitted:

- `admin_approval:created`
- `admin_approval:approved`
- `admin_approval:rejected`
- `admin_approval:expired`
- `admin_approval:consumed`
- `privacy_request:created`
- `privacy_request:queued`
- `privacy_request:completed`
- `privacy_request:failed`
- `privacy_request:cancelled`
- `ops_review:created`
- `ops_review:completed`
- `postmortem:created`
- `postmortem:updated`
- `postmortem:action_item_added`
- `postmortem:action_item_updated`

Listened to:

- Admin SSE listens to governance events.
- Production readiness and scale hygiene read governance evidence.

### Scripts / Operational Tools

- `scripts/verify-admin-rbac.js`
- `scripts/verify-privacy-governance.js`
- `scripts/export-user-data.js`
- `scripts/anonymize-user-data.js`
- `scripts/ops-weekly-review.js`

### Source vs Derived Data Boundary

- Source records: approvals, privacy requests, ops reviews, postmortems, audit logs.
- Derived artifacts: governance pressure stats, readiness reports.

### Risks

- Approval bypass.
- Privacy data leakage.
- Anonymization without backup evidence.
- Admin token over-privilege.
- RBAC capability mismatch.

### Notes

- Prefer admin privacy request workflow for production anonymization.
- Dangerous actions require explicit approval unless super-admin bypass is configured.

---

## 21. Backup / Restore / Migration Evidence System

### Purpose

Backups, restore drills, migration snapshots, snapshot validation, migration rehearsals, rollback rehearsals, benchmark history, externalization decisions, Phase 61 evidence cadence, pilot gate, and repository contract reports.

### Primary Routes

- `POST /api/admin/backups/restore-drill`
- `GET /api/admin/backups/restore-drills`
- `GET /api/admin/backups/restore-drills/:id`
- `GET /api/admin/storage-pressure`
- `POST /api/admin/storage-pressure/capture`
- `GET /api/admin/externalization/readiness`
- `GET /api/admin/externalization/decision`
- `POST /api/admin/externalization/decision/capture`
- `GET /api/admin/externalization/decision/snapshots`
- `POST /api/admin/migration-snapshots/validate`
- `POST /api/admin/migration-rehearsal/run`
- `GET /api/admin/benchmarks/history`
- `GET /api/admin/phase61/evidence`
- `POST /api/admin/phase61/evidence/capture`
- `GET /api/admin/phase61/pilot-gate`
- `POST /api/admin/phase61/pilot-gate/capture`
- `POST /api/admin/rollback-rehearsal/run`
- `GET /api/admin/rollback-rehearsal`
- `GET /api/admin/repository-contracts`

### Handlers

- `server/handlers/productionOpsHandler.js`
- `server/handlers/storagePressureHandler.js`
- `server/handlers/externalizationDecisionHandler.js`
- `server/handlers/phase61Handler.js`

### Services

- `server/services/backupScheduler.js`
- `server/services/backupRestoreDrill.js`
- `server/services/storagePressure.js`
- `server/services/scaleThresholds.js`
- `server/services/externalizationReadiness.js`
- `server/services/externalizationDecision.js`
- `server/services/migrationSnapshotValidation.js`
- `server/services/benchmarkHistory.js`
- `server/services/phase61EvidenceCadence.js`
- `server/services/pilotDecisionGate.js`
- `server/services/rollbackRehearsal.js`
- `server/services/repositoryContractReport.js`

### Data Collections

- `metrics/storage-pressure`
- `metrics/scale-thresholds`
- `migration-snapshots`
- `migration-snapshots/rehearsals`
- `migration-snapshots/rehearsals/rollback`
- `metrics/benchmarks`
- `metrics/externalization-decisions`
- `metrics/phase61-evidence`
- `metrics/pilot-decisions`
- `metrics/repository-contracts`
- `metrics/backup-restore-drills`

### Events

Emitted:

- `backup_restore_drill:started`
- `backup_restore_drill:passed`
- `backup_restore_drill:failed`
- `marketplace_intelligence:rollup_captured`
- `phase61_evidence:captured`
- `pilot_gate:captured`
- `rollback_rehearsal:completed`

Listened to:

- Admin SSE listens to backup/ops events.
- Incident timeline listens to backup restore drill failures.
- Pilot gate reads approvals, evidence, rollback rehearsal, privacy reviews, incidents, and postmortems.

### Scripts / Operational Tools

- `scripts/backup.js`
- `scripts/run-backup-restore-drill.js`
- `scripts/export-migration-snapshot.js`
- `scripts/validate-migration-snapshot.js`
- `scripts/run-migration-rehearsal.js`
- `scripts/run-rollback-rehearsal.js`
- `scripts/benchmark-file-paths.js`
- `scripts/list-benchmark-history.js`
- `scripts/capture-externalization-decision.js`
- `scripts/capture-phase61-evidence.js`
- `scripts/evaluate-pilot-gate.js`
- `scripts/verify-repository-contracts.js`

### Source vs Derived Data Boundary

- Source records remain the live JSON collections under `data/`.
- Backup copies are artifacts.
- Migration snapshots are evidence/export artifacts.
- Rehearsal and rollback reports are evidence artifacts.
- Externalization decisions are advisory artifacts.
- Repository contracts are docs/evidence artifacts.

### Risks

- Treating advisory evidence as implementation approval.
- Snapshot leakage.
- Missing checksums/manifest validation.
- Rollback rehearsal not fresh.
- Pilot gate bypass.
- Benchmark artifacts mistaken as runtime performance guarantees.

### Notes

- No external DB/search/queue is implemented.
- No runtime repository switching is enabled.
- Pilot is blocked by default.

---

## 22. File-backed Database & Indexing System

### Purpose

File-backed JSON persistence, atomic writes, unique temp files, sharding, directory initialization, safe/tolerant listing, secondary set indexes, shard location cache, and stale temp cleanup.

### Primary Routes

- This is infrastructure used by all API routes.
- Public visibility through `GET /api/health`.
- Admin visibility through scale, storage pressure, audit index, and queue endpoints.

### Handlers

- `server/router.js`
- Indirectly all handlers using services.

### Services

- `server/services/database.js`
- `server/services/cache.js`
- `server/services/resourceLock.js`
- `server/services/indexHealth.js`
- `server/services/auditLogIndex.js`
- `server/services/queryIndex.js`
- `server/services/searchIndex.js`
- `server/services/queueStorageIndex.js`
- `server/services/storagePressure.js`
- `server/services/scaleThresholds.js`

### Data Collections

Configured in `config.DATABASE.dirs`, including:

- `users`
- `sessions`
- `jobs`
- `applications`
- `otp`
- `notifications`
- `ratings`
- `payments`
- `reports`
- `verifications`
- `attendance`
- `audit`
- `messages`
- `push_subscriptions`
- `alerts`
- `metrics`
- `favorites`
- `images`
- `availability_windows`
- `instant_matches`
- `availability_ads`
- `direct_offers`
- `ops_queue`
- `ops_locks`
- `scheduler`
- governance and Phase 59/60/61 evidence directories

### Events

Emitted:

- Database layer itself does not generally emit domain events.
- Higher-level services emit events after writes.

Listened to:

- Index services listen to domain events such as `audit:logged`, `audit:deleted`, and direct-offer events.

### Scripts / Operational Tools

- `scripts/verify-data-json.js`
- `scripts/verify-file-health.js`
- `scripts/find-null-json-files.js`
- `scripts/quarantine-corrupt-json.js`
- `scripts/report-duplicate-records.js`
- `scripts/repair-indexes.js`
- `scripts/rebuild-audit-index.js`
- `scripts/verify-audit-index.js`
- `scripts/measure-storage-pressure.js`
- `scripts/verify-scale-thresholds.js`

### Source vs Derived Data Boundary

- JSON source records are source of truth.
- Secondary indexes are derived/rebuildable artifacts.
- Filesystem indexes are derived/rebuildable artifacts.
- Queue segmented files are source of truth when summary mismatch exists.
- Queue summary/location indexes are derived acceleration artifacts.
- Cache is in-memory acceleration only.

### Risks

- Corrupt JSON.
- Stale `.tmp` files.
- Duplicate flat/sharded records.
- Index drift.
- Shard cache stale entries.
- Heavy full scans from admin or public HTTP paths.
- Multi-writer file contention.

### Notes

- `atomicWrite()` writes unique `.tmp` paths then renames.
- Monthly sharding is used for high-volume collections.
- `safeListJSON()` supports tolerant scans for corrupt JSON paths.
- File-backed process locks are guardrails, not distributed consensus.

---

## Cross-System Operational Warnings

### Queue Summary Mismatch

```text
Do not treat QUEUE_SUMMARY_MISMATCH as proof that external queue is needed.
Actual segmented queue files are source of truth.
Do not run queue-drain --confirm as remediation.
Use verify/repair dry-run evidence first.
```

### Notification Flood Cleanup

```text
cleanup-notification-flood.js is quarantine-only.
It never deletes notifications.
Confirmed mode moves notification source files to quarantine and updates notifications/user-index.json.
Hardening does not authorize confirmed execution.
```

### Externalization

```text
Externalization is advisory-only in Phase 59/60/61.
No PostgreSQL.
No Redis.
No external queue.
No external search.
No runtime repository switching.
No pilot by default.
```

### Source vs Derived Data Boundary

```text
source vs derived data boundary must be preserved in every repair or cleanup operation.
Source data mutation requires explicit approval and backup evidence when destructive or privacy-sensitive.
Derived artifacts may be rebuilt, but only through dry-run-first operational workflows.
```

---

## Maintenance Rules for This Catalog

1. Any new major system must be added here in the same PR that introduces it.
2. Each system should list routes, handlers, services, data collections, events, scripts, boundaries, and risks.
3. Do not document planned external systems as implemented runtime systems.
4. Keep advisory externalization language explicit.
5. Keep source-vs-derived data boundaries explicit.
6. Link high-risk scripts back to `docs/operations/SCRIPTS_CATALOG.md`.
7. Keep this catalog documentation-only.
8. Do not use this catalog as runtime authorization.

---

## Final Safety Position

```text
No runtime change.
No deletion.
No reset.
No confirmed mutation.
No production queue mutation.
No index repair execution.
No notification quarantine execution.
No migration execution.
No externalization.
No PostgreSQL.
No Redis.
No external queue.
No external search.
No new dependencies.
No version/cache change.
```
