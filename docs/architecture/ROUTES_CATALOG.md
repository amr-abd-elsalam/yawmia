# Yawmia Routes Catalog

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch: Patch 20 — Route / Handler / Service Catalog Baseline  
> Scope: Route registry / handler / service ownership architecture inventory  
> Runtime posture: documentation-only  
> Source of truth posture: file-backed JSON source of truth  
> Router source of truth: `server/router.js`  
> Externalization posture: advisory-only  
> Last reviewed: 2026-06-05

---

## Purpose

This catalog is the canonical route registry / handler / service ownership architecture reference for Yawmia.

It maps the current `server/router.js` route registry across:

```text
routes
methods
paths
route groups
route-specific middleware
auth / role / admin / capability protection
handler ownership
service ownership
source collections touched
derived artifacts touched
read/write/SSE/download classification
admin route capability matrix
read-only replica posture
maintenance mode posture
query-token download exceptions
route risks and invariants
```

Companion project map:

```text
docs/architecture/PROJECT_MAP.md
```

PROJECT_MAP.md maps where route registry, handlers, services, tests, and docs live in the repository.

PROJECT_MAP.md is the repository-level route/handler/service source tree companion map.

This document is documentation-only.

It does not authorize:

```text
runtime changes
route refactors
middleware changes
handler rewrites
service rewrites
auth weakening
admin capability weakening
data mutation
queue remediation
scheduler changes
PM2 restart/start/save
confirmed script execution
index repair execution
notification quarantine execution
migration execution
externalization
PostgreSQL
Redis
external queue
external search
new dependencies
version/cache changes
```

---

## Runtime Routing Architecture Posture

Current routing architecture is:

```text
Native Node.js 20+ ESM
native http
zero-framework backend
Vanilla JS frontend
PWA
SSE
Admin SSE
Live Feed SSE
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
in-memory EventBus
single-writer discipline
```

Current routing architecture explicitly has:

```text
no Express
no Koa
no Fastify
no PostgreSQL
no Redis
no external queue
no external search
no external DB
no external pub/sub
no EventBus bridge implementation
no SSE fanout service implementation
no runtime repository switching
no dual-write
no cutover
no pilot by default
```

Phase 59 / Phase 60 / Phase 61 externalization routes are advisory/evidence/control surfaces only.

No external DB/search/queue is implemented.

No runtime repository switching is enabled.

---

## Router Registry Model

Runtime route source of truth:

```text
server/router.js
```

`server/router.js` owns:

```text
routes[]
createRouter()
matchPath(pattern, pathname)
runMiddlewares(middlewares, req, res, done)
sendJSON(res, statusCode, data)
route-specific middleware execution
handler dispatch
path parameter validation through isValidId()
/api/docs route introspection
404 fallback
request logging through logger.request()
```

Important invariants:

```text
server/router.js routes[] is the runtime route source of truth.
ROUTES_CATALOG.md must not contradict server/router.js.
Route order matters.
Specific routes must appear before generic :id patterns.
Path params are validated through isValidId().
Route-specific middleware runs after global middleware.
Static files are served before API middleware chain.
```

`/api/docs` is generated from `routes[]` and exposes:

```text
method
path
auth
admin
total
version
```

---

## Route Definition Format

Route definitions use this model:

```javascript
{
  method,
  path,
  middlewares,
  handler
}
```

Examples:

```text
{ method: 'GET', path: '/api/health', middlewares: [], handler }
{ method: 'POST', path: '/api/jobs', middlewares: [requireAuth, requireRole('employer')], handler }
{ method: 'POST', path: '/api/admin/payments/:id/complete', middlewares: [requireCapability('admin.payments.complete')], handler }
```

Route-specific middleware examples:

```text
requireAuth
requireRole('worker')
requireRole('employer')
requireAdmin
requireCapability('admin.scale.read')
```

---

## Route Matching and Param Validation

`matchPath(pattern, pathname)` behavior:

```text
splits pattern and pathname by /
requires same segment count
literal segments must match exactly
:param segments are captured into req.params
returns params object or null
```

Path parameter validation:

```text
req.params are attached after match.
Each param is validated through isValidId().
Invalid path params return 400 INVALID_ID before route middleware/handler.
```

Related files:

```text
server/router.js
server/services/database.js
```

Important warning:

```text
Route ordering matters because /api/jobs/live-feed must appear before /api/jobs/:id.
Specific workroom routes must appear before /api/workrooms/:id.
Specific admin routes must appear before generic :id patterns.
```

---

## Global Middleware vs Route-Specific Middleware

Global API middleware chain is defined in `server.js`:

```text
timingMiddleware
corsMiddleware
securityMiddleware
requestIdMiddleware
rateLimitMiddleware
maintenanceMiddleware
readOnlyReplicaMiddleware
bodyParserMiddleware
```

Request flow:

```text
staticMiddleware(req, res, () => {
  runMiddleware(globalMiddleware, req, res, () => {
    router(req, res);
  });
});
```

Important behavior:

```text
staticMiddleware runs before global API middleware chain.
API routes pass through global middleware chain then router.
Route-specific middleware runs inside router after route path match.
SSE routes are special long-lived responses.
bodyParserMiddleware only parses JSON for POST/PUT/PATCH/DELETE.
rateLimitMiddleware runs before route auth.
per-user rate limit is enforced after requireAuth through checkUserRateLimit().
maintenanceMiddleware may block before handler.
readOnlyReplicaMiddleware may block writes before handler.
```

---

## Route Authentication Model

Route protection classes:

| Class | Middleware / Pattern | Meaning |
|---|---|---|
| Public | `middlewares: []` | No route-specific auth middleware |
| Authenticated | `requireAuth` | Bearer session required |
| Role-restricted | `requireAuth + requireRole(...)` | Worker/employer role required |
| Admin legacy | `requireAdmin` | Admin token/session admin |
| Admin RBAC | `requireCapability(...)` | Capability checked through admin RBAC |
| Self-authenticated SSE | handler verifies token/header/query | Long-lived EventSource route |
| Query-token download | limited query token route | Download/export only |

Self-authenticated SSE routes:

```text
GET /api/notifications/stream
GET /api/jobs/live-feed
GET /api/admin/events
```

Query-token allowed direct-download routes:

```text
GET /api/admin/audit-log/export
GET /api/admin/export/*
GET /api/admin/exports/:id/download
```

Critical warning:

```text
Query token auth is intentionally limited to direct-download endpoints.
Do not broaden query-token admin auth.
Do not weaken requireAuth.
Do not weaken requireRole.
Do not weaken requireAdmin.
Do not weaken requireCapability.
```

---

## Public Routes

Representative public routes:

```text
GET  /api/health
GET  /api/config
GET  /api/docs
POST /api/auth/send-otp
POST /api/auth/verify-otp
GET  /api/jobs
GET  /api/jobs/:id
GET  /api/jobs/:id/ratings
GET  /api/users/:id/ratings
GET  /api/users/:id/rating-summary
GET  /api/users/:id/trust-score
GET  /api/users/:id/trust-v2
GET  /api/users/:id/public-profile
```

Ownership:

```text
server/handlers/authHandler.js
server/handlers/jobsHandler.js
server/handlers/ratingsHandler.js
server/handlers/reportsHandler.js
server/handlers/verificationHandler.js
```

Services:

```text
auth.js
sessions.js
users.js
jobs.js
ratings.js
trust.js
trustScoreV2.js
verification.js
```

Classification:

```text
Public read:
  health/config/docs/job listing/job detail/public profile/public ratings/public trust.

Public auth bootstrap write:
  send OTP
  verify OTP
```

Source / derived impact:

```text
POST /api/auth/send-otp -> otp source records
POST /api/auth/verify-otp -> users, sessions, users/phone-index.json
GET routes -> source reads and derived metrics/index reads only
```

---

## Auth Routes

Routes:

```text
GET  /api/auth/me
PUT    /api/auth/profile
GET    /api/profile/tasks
POST   /api/profile/tasks/:id/click
POST   /api/auth/logout
POST   /api/auth/logout-all
POST   /api/auth/accept-terms
DELETE /api/auth/account
POST   /api/auth/verify-identity
GET    /api/auth/verification-status
```

Handlers:

```text
server/handlers/authHandler.js
server/handlers/profileTasksHandler.js
server/handlers/verificationHandler.js
```

Services:

```text
users.js
sessions.js
auth.js
profileCompleteness.js
profileTasks.js
activationFunnelMetrics.js
verification.js
imageStore.js
```

Source collections:

```text
users
sessions
verifications
images
privacy_requests indirectly for privacy workflows
```

Derived artifacts:

```text
users/phone-index.json
verifications/user-index.json
metrics/product-intelligence activation artifacts
```

Classification:

```text
Authenticated read
Authenticated write
Privacy-sensitive write for identity verification and account deletion
```

---

## Job Routes

Routes:

```text
POST /api/jobs
GET  /api/jobs
GET  /api/jobs/mine
GET  /api/jobs/nearby
GET  /api/jobs/live-feed
GET  /api/jobs/:id
GET  /api/jobs/:id/applications
POST /api/jobs/:id/apply
POST /api/jobs/:id/accept
POST /api/jobs/:id/reject
POST /api/jobs/:id/start
POST /api/jobs/:id/complete
POST /api/jobs/:id/cancel
POST /api/jobs/:id/renew
POST /api/jobs/:id/duplicate
POST /api/jobs/:id/instant-accept
```

Handlers:

```text
server/handlers/jobsHandler.js
server/handlers/applicationsHandler.js
server/handlers/liveFeedHandler.js
```

Services:

```text
jobs.js
applications.js
instantMatch.js
liveFeed.js
geo.js
contentFilter.js
searchIndex.js
queryIndex.js
searchRelevance.js
arabicNormalizer.js
arabicSearchTokens.js
```

Source collections:

```text
jobs
applications
instant_matches
notifications from side effects
payments from completion side effect
```

Derived artifacts:

```text
jobs/index.json
jobs/employer-index.json
applications/worker-index.json
applications/job-index.json
search indexes
query indexes
search analytics
notifications/user-index.json
```

Classification:

```text
Public read for GET /api/jobs and GET /api/jobs/:id
Authenticated read for mine/nearby
Role-restricted write for job create/lifecycle
SSE long-lived for /api/jobs/live-feed
Role-restricted write for instant accept
```

Risks:

```text
Route order matters for /api/jobs/live-feed before /api/jobs/:id.
Synthetic direct-offer jobs must not leak into public listing.
Job lifecycle writes trigger EventBus side effects.
Derived indexes must remain rebuildable.
```

---

## Application Routes

Routes:

```text
GET  /api/jobs/:id/applications
GET  /api/applications/mine
POST /api/jobs/:id/apply
POST /api/jobs/:id/accept
POST /api/jobs/:id/reject
POST /api/applications/:id/withdraw
POST /api/applications/:id/confirm
POST /api/applications/:id/decline
```

Handlers:

```text
server/handlers/applicationsHandler.js
```

Services:

```text
applications.js
applicationStatus.js
jobs.js
notifications.js
```

Source collections:

```text
applications
jobs
notifications from side effects
```

Derived artifacts:

```text
applications/worker-index.json
applications/job-index.json
jobs/index.json when job status changes
```

Classification:

```text
Authenticated read
Role-restricted write
Employer-owned application decisions
Worker-owned confirmation/withdrawal
```

Invariant:

```text
accept uses accept-job:${jobId} locking to prevent over-acceptance.
worker_confirmed is accepted-equivalent for attendance/messaging/workroom flows.
```

---

## Attendance Routes

Routes:

```text
POST /api/jobs/:id/checkin
POST /api/jobs/:id/checkout
POST /api/jobs/:id/no-show
POST /api/jobs/:id/manual-checkin
GET  /api/jobs/:id/attendance/summary
GET  /api/jobs/:id/attendance
POST /api/attendance/:id/confirm
```

Handlers:

```text
server/handlers/attendanceHandler.js
```

Services:

```text
attendance.js
applications.js
applicationStatus.js
jobs.js
geo.js
notifications.js
```

Source collections:

```text
attendance
jobs
applications
notifications from side effects
```

Derived artifacts:

```text
attendance/job-index.json
attendance/worker-index.json
trust/analytics derived evidence
```

Classification:

```text
Authenticated read
Role-restricted write
Location-sensitive worker writes
Employer confirmation/no-show writes
```

---

## Ratings / Reports / Trust Routes

Routes:

```text
POST /api/jobs/:id/rate
GET  /api/jobs/:id/ratings
GET  /api/users/:id/ratings
GET  /api/users/:id/rating-summary
GET  /api/users/:id/trust-score
GET  /api/users/:id/trust-v2
GET  /api/ratings/pending
POST /api/reports
```

Handlers:

```text
server/handlers/ratingsHandler.js
server/handlers/reportsHandler.js
```

Services:

```text
ratings.js
reports.js
trust.js
trustScoreV2.js
sanitizer.js
auditLog.js for admin review routes
```

Source collections:

```text
ratings
reports
users
jobs
applications
```

Derived artifacts:

```text
rating summaries
trust score derived reads
reports target/reporter indexes
trust calibration artifacts in admin flows
```

Classification:

```text
Public read for ratings/trust summaries
Authenticated write for ratings/reports
Authenticated read for pending ratings
```

Safety:

```text
Trust scoring must remain explainable and non-punitive by default.
Reports are human-in-the-loop.
Predictive signals must not auto-ban.
```

---

## Notification / SSE Routes

Routes:

```text
GET  /api/notifications
GET  /api/notifications/stream
POST /api/notifications/read-all
POST /api/notifications/:id/action-click
POST /api/notifications/:id/read
GET  /api/messages/unread-count
POST /api/messages/:id/read
```

Handlers:

```text
server/handlers/notificationsHandler.js
server/handlers/sseHandler.js
server/handlers/messagesHandler.js
```

Services:

```text
notifications.js
notificationActions.js
notificationConversionMetrics.js
sseManager.js
eventReplayBuffer.js
messages.js
```

Source collections:

```text
notifications
messages
```

Derived artifacts:

```text
notifications/user-index.json
messages/user-index.json
metrics/product-intelligence notification conversion metrics
in-memory SSE replay buffer
```

Classification:

```text
Authenticated read
Authenticated write for read/action-click
SSE long-lived for /api/notifications/stream
```

SSE warning:

```text
/api/notifications/stream is self-authenticated via Authorization header or token query.
SSE is long-lived, best-effort, in-memory, single-process.
No cross-instance SSE fanout exists.
```

---

## Message / Workroom Routes

Job message routes:

```text
POST /api/jobs/:id/messages/broadcast
POST /api/jobs/:id/messages/read-all
GET  /api/jobs/:id/messages
POST /api/jobs/:id/messages
```

Workroom routes:

```text
GET  /api/workrooms
GET    /api/workrooms/:id/search
GET    /api/workrooms/:id/read-receipts
POST   /api/workrooms/:id/messages/:messageId/read
POST   /api/workrooms/:id/attachments
GET    /api/workrooms/:id/summary
GET    /api/workrooms/:id/pins
POST   /api/workrooms/:id/pins
DELETE /api/workrooms/:id/pins/:messageId
GET    /api/workrooms/:id/checklist
POST   /api/workrooms/:id/checklist
PUT    /api/workrooms/:id/checklist/:itemId
DELETE /api/workrooms/:id/checklist/:itemId
GET    /api/workrooms/:id/messages
POST   /api/workrooms/:id/messages/read-all
POST   /api/workrooms/:id/messages
GET    /api/workrooms/:id/timeline
GET    /api/workrooms/:id
```

Handlers:

```text
server/handlers/messagesHandler.js
server/handlers/workroomHandler.js
```

Services:

```text
messages.js
workroom.js
workroomReceipts.js
workroomPins.js
workroomChecklist.js
workroomAttachments.js
workroomSearch.js
workroomHygiene.js
workroomIndexHealth.js
imageStore.js
```

Source collections:

```text
messages
workrooms
workrooms/receipts
workrooms/pins
workrooms/checklists
images
jobs
applications
```

Derived artifacts:

```text
messages/job-index.json
messages/user-index.json
workrooms/search-indexes
metrics/workroom-hygiene
metrics/workroom-template-usage
metrics/product-intelligence workroom adoption
```

Classification:

```text
Authenticated read
Authenticated write
Role/participation guarded by services
Attachment/image-sensitive write
```

Route risk:

```text
Specific workroom routes must remain before generic /api/workrooms/:id.
Workroom search indexes are derived/rebuildable.
Attachments should store image refs, not raw base64 in messages.
```

---

## Push / Alerts / Favorites / Images Routes

Push routes:

```text
POST   /api/push/subscribe
DELETE /api/push/subscribe
```

Alert routes:

```text
POST   /api/alerts
GET    /api/alerts
DELETE /api/alerts/:id
PUT    /api/alerts/:id
```

Favorite routes:

```text
POST   /api/favorites
GET    /api/favorites
GET    /api/favorites/check/:id
DELETE /api/favorites/:id
```

Image route:

```text
GET /api/images/:id
```

Handlers:

```text
pushHandler.js
alertsHandler.js
favoritesHandler.js
imageHandler.js
```

Services:

```text
webpush.js
jobAlerts.js
favorites.js
imageStore.js
```

Source collections:

```text
push_subscriptions
alerts
favorites
images
```

Derived artifacts:

```text
push_subscriptions/user-index.json
alerts/user-index.json
favorites/user-index.json
image metadata sidecars
```

Classification:

```text
Authenticated read/write
Employer-only favorites
Auth-required private image serving
```

---

## Presence / Live Feed / Instant Match Routes

Routes:

```text
POST /api/presence/heartbeat
GET  /api/workers/online-count
GET  /api/jobs/live-feed
POST /api/jobs/:id/instant-accept
```

Handlers:

```text
presenceHandler.js
liveFeedHandler.js
```

Services:

```text
presenceService.js
instantMatch.js
liveFeed.js
availabilityWindow.js
trust.js
geo.js
applications.js
```

Source collections:

```text
instant_matches
availability_windows
applications
jobs
```

Derived/in-memory state:

```text
presence map
liveFeed connection map
SSE delivery state
```

Classification:

```text
Authenticated write heartbeat
Authenticated read online count
Self-authenticated SSE for live feed
Role-restricted write for instant accept
```

Warning:

```text
Presence is in-memory and single-process.
Live Feed SSE is best-effort and single-instance.
Instant match uses first-accept-wins lock discipline.
```

---

## Availability Ads / Worker Discovery / Direct Offer Routes

Availability windows:

```text
POST   /api/availability/windows
GET    /api/availability/windows
DELETE /api/availability/windows/:id
```

Availability ads:

```text
POST   /api/availability-ads
GET    /api/availability-ads/mine
DELETE /api/availability-ads/:id
GET    /api/availability-ads/:id
```

Worker discovery:

```text
GET  /api/workers/discover
GET  /api/workers/:id/card
POST /api/workers/:id/quick-offer
```

Direct Offer routes:

```text
POST   /api/direct-offers
GET    /api/direct-offers/mine
GET    /api/direct-offers/stats/employer
GET    /api/direct-offers/stats/worker
POST   /api/direct-offers/:id/accept
POST   /api/direct-offers/:id/decline
DELETE /api/direct-offers/:id
GET    /api/direct-offers/:id
```

Handlers:

```text
availabilityHandler.js
availabilityAdHandler.js
workerDiscoveryHandler.js
directOfferHandler.js
```

Services:

```text
availabilityWindow.js
availabilityAd.js
workerDiscovery.js
matchingIntelligence.js
directOffer.js
directOfferAnalytics.js
directOfferCounters.js
offerAbuseDetector.js
jobs.js
applications.js
```

Source collections:

```text
availability_windows
availability_ads
direct_offers
jobs
applications
notifications
```

Derived artifacts:

```text
availability_ads/worker-index.json
direct_offers/employer-index.json
direct_offers/worker-index.json
metrics/direct-offer-counters.json
metrics/counter-archives
analytics caches
query index
```

Classification:

```text
Worker-only writes for availability.
Employer-only worker discovery / offer creation.
Worker-only offer accept/decline.
Authenticated offer read.
```

Important warning:

```text
Direct Offer acceptance creates synthetic jobs and accepted applications.
Synthetic jobs must remain private and filtered from public job listings.
Two-phase identity reveal must not expose name/phone before accept.
Direct offer counters are derived/rebuildable from direct_offers source records.
```

---

## Payment / Analytics / Export Routes

Payment routes:

```text
POST /api/jobs/:id/payment
GET  /api/jobs/:id/payment
GET  /api/jobs/:id/receipt
POST /api/payments/:id/confirm
POST /api/payments/:id/dispute
```

User analytics routes:

```text
GET /api/analytics/employer
GET /api/analytics/worker
GET /api/employer/export/payments
```

Handlers:

```text
paymentsHandler.js
analyticsHandler.js
```

Services:

```text
payments.js
financialExport.js
analytics.js
paymentDisputeAnalytics.js
attendance.js
applications.js
jobs.js
users.js
```

Source collections:

```text
payments
jobs
applications
attendance
users
```

Derived artifacts:

```text
payments/job-index.json
financial CSV export output
analytics caches
metrics/payment-disputes
```

Classification:

```text
Authenticated read/write
Role-restricted payment creation/confirmation
Download/export for employer payments
Financial-sensitive routes
```

---

## Admin Core Routes

Routes:

```text
GET  /api/admin/stats
GET  /api/admin/users
GET  /api/admin/jobs
PUT  /api/admin/users/:id/status
GET  /api/admin/reports
PUT  /api/admin/reports/:id
GET  /api/admin/verifications
PUT  /api/admin/verifications/:id
GET  /api/admin/financial-summary
POST /api/admin/payments/:id/complete
GET  /api/admin/analytics
GET  /api/admin/monitoring
GET  /api/admin/monitoring/latest
GET  /api/admin/errors
GET  /api/admin/availability-ads/stats
```

Handlers:

```text
adminHandler.js
analyticsHandler.js
paymentsHandler.js
reportsHandler.js
verificationHandler.js
availabilityAdHandler.js
```

Services:

```text
users.js
jobs.js
applications.js
payments.js
reports.js
verification.js
auditLog.js
analytics.js
monitor.js
errorAggregator.js
```

Source collections:

```text
users
jobs
applications
payments
reports
verifications
audit
availability_ads
```

Classification:

```text
Admin read
Admin write
Capability-restricted admin writes where configured
```

---

## Admin Audit / Export Routes

Audit routes:

```text
GET  /api/admin/audit-log
GET  /api/admin/audit-log/search
GET  /api/admin/audit-log/export
GET  /api/admin/audit-index/status
POST /api/admin/audit-index/rebuild
POST /api/admin/audit-index/verify
```

Export registry routes:

```text
POST /api/admin/exports/audit-log
GET  /api/admin/exports
GET  /api/admin/exports/:id/download
POST /api/admin/exports/:id/cancel
GET  /api/admin/exports/:id
```

Handlers:

```text
adminHandler.js
queueHandler.js
```

Services:

```text
auditLog.js
auditLogSearch.js
auditLogIndex.js
exportRegistry.js
csvExportProgress.js
opsQueue.js
```

Source collections:

```text
audit
exports
ops_queue for async export jobs
```

Derived artifacts:

```text
audit/indexes
exports CSV files
metrics/repository artifacts indirectly
```

Classification:

```text
Admin read
Admin write
Download/export
Capability-restricted admin export via admin.audit.export
Background/ops action for async export
```

Query token warning:

```text
Download/export direct links are the only query token admin exceptions.
Do not broaden query-token admin auth.
```

---

## Admin Trust / Predictive / Calibration Routes

Routes include:

```text
GET  /api/admin/trust/resolution-time
GET  /api/admin/trust/warning-conversion
GET  /api/admin/trust/per-admin
GET  /api/admin/trust/abuse-trend
GET  /api/admin/trust/dashboard
GET  /api/admin/trust/calibration/dashboard
GET  /api/admin/trust/snapshots
POST /api/admin/trust/calibration/snapshot-batch
POST /api/admin/trust/calibration/report
GET  /api/admin/users/:id/trust-v2

GET  /api/admin/predictive-abuse/dashboard
GET  /api/admin/predictive-abuse/signals
GET  /api/admin/predictive-abuse/precision
POST /api/admin/predictive-abuse/run-scan
POST /api/admin/predictive-abuse/retention/run
POST /api/admin/predictive-abuse/signals/:id/false-positive
POST /api/admin/predictive-abuse/signals/:id/confirm
POST /api/admin/predictive-abuse/signals/:id/dismiss
POST /api/admin/predictive-abuse/signals/:id/escalate

GET /api/admin/trust/decision-quality
GET /api/admin/trust/backlog-priority
```

Handlers:

```text
adminHandler.js
trustCalibrationHandler.js
```

Services:

```text
trustAnalytics.js
trustCalibration.js
trustScoreV2.js
predictiveAbuse.js
predictiveSignalRetention.js
adminDecisionAnalytics.js
opsQueue.js
auditLog.js
```

Source collections:

```text
abuse_flag_reviews
predictive_signals
ratings
reports
users
audit
```

Derived artifacts:

```text
metrics/trust-v2-snapshots
metrics/trust-calibration
metrics/predictive-signal-archives
metrics/predictive-signal-archives/index
ops_queue jobs for async scans/reports
```

Classification:

```text
Admin read
Admin write
Capability-restricted admin trust calibration
Capability-restricted predictive review
Background/ops action
```

Safety:

```text
No auto-ban from predictive signals.
Human-in-the-loop remains mandatory.
```

---

## Admin Queue / Alert Delivery Routes

Queue routes:

```text
GET  /api/admin/ops-queue/stats
GET  /api/admin/ops-queue/dead-letter
POST /api/admin/ops-queue/dead-letter/:id/retry
GET  /api/admin/ops-queue/jobs
POST /api/admin/ops-queue/jobs/:id/retry
POST /api/admin/ops-queue/jobs/:id/cancel
GET  /api/admin/ops-queue/jobs/:id
```

Alert delivery routes:

```text
GET  /api/admin/alerts/health
GET  /api/admin/alerts/deliveries
POST /api/admin/alerts/deliveries/:id/retry
GET  /api/admin/alerts/deliveries/:id
POST /api/admin/alerts/test-webhook
```

Handlers:

```text
queueHandler.js
adminHandler.js
```

Services:

```text
opsQueue.js
queueWorkers.js
alertDeliveryHistory.js
adminAlertChannels.js
auditLog.js
```

Source collections:

```text
ops_queue segmented files
ops_queue/idempotency
ops_queue/dead-letter
alert_deliveries
audit
```

Derived artifacts:

```text
metrics/queue/summary.json
ops_queue/archive
ops rollups
incidents from side effects
```

Classification:

```text
Admin read
Admin write
Operational remediation surface
Background/ops action
```

Critical warning:

```text
Admin queue routes are operational visibility/remediation surfaces.
ROUTES_CATALOG.md does not authorize running confirm commands.
Queue segmented files remain source of truth.
Queue summary/location indexes are derived.
QUEUE_SUMMARY_MISMATCH must be evaluated with read-only evidence.
Do not use route catalog as remediation approval.
```

---

## Admin Production Ops Routes

Production readiness and mode routes:

```text
GET  /api/admin/production/readiness
GET  /api/admin/production/deployment-gate
GET  /api/admin/production/scheduler-cadence
GET  /api/admin/production/ops-review
GET  /api/admin/production/instance-mode
GET  /api/admin/production/multi-instance-boundary
GET  /api/admin/production/process-locks
POST /api/admin/production/process-locks/:name/release
```

Scheduler routes:

```text
GET  /api/admin/schedulers
GET  /api/admin/schedulers/:name/history
POST /api/admin/schedulers/:name/run
POST /api/admin/schedulers/:name/enable
POST /api/admin/schedulers/:name/disable
GET  /api/admin/schedulers/:name
```

Ops / incidents / backup / maintenance routes:

```text
GET  /api/admin/ops/rollups
GET  /api/admin/ops/slo
GET  /api/admin/incidents
POST /api/admin/incidents/:id/resolve
GET  /api/admin/incidents/:id
POST /api/admin/backups/restore-drill
GET  /api/admin/backups/restore-drills
GET  /api/admin/backups/restore-drills/:id
GET  /api/admin/maintenance
POST /api/admin/maintenance/enable
POST /api/admin/maintenance/disable
```

Handlers:

```text
productionOpsHandler.js
scaleHygieneHandler.js
storagePressureHandler.js
```

Services:

```text
productionReadiness.js
instanceMode.js
processLock.js
schedulerRegistry.js
schedulerRunHistory.js
metricsRollups.js
incidentTimeline.js
backupRestoreDrill.js
maintenanceMode.js
opsQueue.js
auditLog.js
```

Source collections:

```text
ops_locks
scheduler
scheduler/history
metrics/ops-rollups
metrics/incidents
metrics/backup-restore-drills
ops/maintenance.json
audit
```

Classification:

```text
Admin read
Capability-restricted admin write
Background/ops action
Operational evidence route
```

Warning:

```text
process locks are guardrails, not distributed consensus.
ROUTES_CATALOG.md does not authorize scheduler changes or PM2 restart/start/save.
```

---

## Admin Scale / Storage / Externalization Routes

Scale hygiene routes:

```text
GET  /api/admin/scale-hygiene/overview
GET  /api/admin/queue/health
POST /api/admin/queue/verify
POST /api/admin/queue/compact
POST /api/admin/queue/repair
GET  /api/admin/workroom-hygiene/overview
POST /api/admin/workroom-hygiene/compact
POST /api/admin/workroom-hygiene/verify-indexes
POST /api/admin/workroom-hygiene/cleanup-attachments
GET  /api/admin/trust/rollups
POST /api/admin/trust/rollups/run
GET  /api/admin/predictive-abuse/archive-index/status
POST /api/admin/predictive-abuse/archive-index/rebuild
```

Storage / thresholds / readiness routes:

```text
GET  /api/admin/storage-pressure
POST /api/admin/storage-pressure/capture
GET  /api/admin/storage-pressure/snapshots
GET  /api/admin/scale-thresholds
POST /api/admin/scale-thresholds/verify
GET  /api/admin/externalization/readiness
```

Handlers:

```text
scaleHygieneHandler.js
storagePressureHandler.js
```

Services:

```text
scaleHygiene.js
queueHealthVerify.js
queueCompaction.js
workroomHygiene.js
workroomIndexHealth.js
trustSnapshotRollups.js
predictiveArchiveIndex.js
storagePressure.js
scaleThresholds.js
externalizationReadiness.js
opsQueue.js
auditLog.js
```

Source collections:

```text
ops_queue segmented files
workrooms and sidecars
messages
images
trust snapshots
predictive archives
audit
```

Derived artifacts:

```text
metrics/scale-hygiene
metrics/storage-pressure
metrics/scale-thresholds
metrics/queue/summary.json
workrooms/search-indexes
metrics/trust-calibration/rollups
metrics/predictive-signal-archives/index
```

Classification:

```text
Admin read
Capability-restricted admin write
Background/ops action
Advisory/evidence route
```

Safety:

```text
Scale warnings do not prove externalization is required.
Storage pressure snapshots are evidence artifacts.
Confirmed repair/cleanup scripts require separate approval.
```

---

## Admin Phase 60 / Phase 61 Routes

Phase 60 routes:

```text
GET  /api/admin/externalization/decision
POST /api/admin/externalization/decision/capture
GET  /api/admin/externalization/decision/snapshots
POST /api/admin/migration-snapshots/validate
POST /api/admin/migration-rehearsal/run
GET  /api/admin/benchmarks/history
```

Phase 61 routes:

```text
GET  /api/admin/phase61/evidence
POST /api/admin/phase61/evidence/capture
GET  /api/admin/phase61/evidence/snapshots
GET  /api/admin/phase61/pilot-gate
POST /api/admin/phase61/pilot-gate/capture
POST /api/admin/rollback-rehearsal/run
GET  /api/admin/rollback-rehearsal
GET  /api/admin/rollback-rehearsal/:id
GET  /api/admin/repository-contracts
```

Handlers:

```text
externalizationDecisionHandler.js
phase61Handler.js
```

Services:

```text
externalizationDecision.js
migrationSnapshotValidation.js
benchmarkHistory.js
phase61EvidenceCadence.js
pilotDecisionGate.js
rollbackRehearsal.js
repositoryContractReport.js
auditLog.js
```

Source / evidence artifacts:

```text
metrics/externalization-decisions
metrics/benchmarks
migration-snapshots/rehearsals
metrics/phase61-evidence
migration-snapshots/rehearsals/rollback
metrics/pilot-decisions
metrics/repository-contracts
```

Classification:

```text
Admin read
Capability-restricted admin write
Advisory/evidence route
Migration/rehearsal validation route
```

Critical advisory-only posture:

```text
Phase 59/60/61 externalization routes are advisory/evidence/control surfaces only.
No external DB/search/queue is implemented.
No runtime repository switching is enabled.
No pilot is allowed by default.
ROUTES_CATALOG.md does not authorize externalization.
```

---

## Admin Governance / Privacy / RBAC Routes

RBAC routes:

```text
GET /api/admin/rbac/matrix
GET /api/admin/rbac/me
```

Approvals routes:

```text
GET  /api/admin/approvals
POST /api/admin/approvals
POST /api/admin/approvals/:id/approve
POST /api/admin/approvals/:id/reject
```

Privacy routes:

```text
GET  /api/admin/privacy/requests
POST /api/admin/privacy/requests
GET  /api/admin/privacy/requests/:id
POST /api/admin/privacy/requests/:id/export
POST /api/admin/privacy/requests/:id/anonymize-preview
POST /api/admin/privacy/requests/:id/anonymize
POST /api/admin/privacy/requests/:id/cancel
```

Ops review / postmortem routes:

```text
GET  /api/admin/ops/reviews
POST /api/admin/ops/reviews
GET  /api/admin/ops/reviews/:id
POST /api/admin/ops/reviews/:id/complete
GET  /api/admin/incidents/:id/postmortem
POST /api/admin/incidents/:id/postmortem
PUT  /api/admin/postmortems/:id
GET  /api/admin/postmortems
```

Handlers:

```text
governanceHandler.js
productionOpsHandler.js
```

Services:

```text
adminRbac.js
adminApprovals.js
privacyRequests.js
userDataExport.js
userAnonymization.js
opsReviewRecords.js
postmortemRecords.js
incidentTimeline.js
opsQueue.js
auditLog.js
```

Source collections:

```text
admin_approvals
privacy_requests
ops/reviews
ops/postmortems
metrics/incidents
audit
users for privacy workflows
```

Classification:

```text
Capability-restricted admin read
Capability-restricted admin write
Governance-sensitive route
Privacy-sensitive route
Background/ops action
```

Safety:

```text
Privacy anonymization requires approval.
Dangerous admin actions require RBAC/capability/approval flow.
ROUTES_CATALOG.md does not authorize privacy mutation.
```

---

## Route Capability Matrix

Capabilities are enforced by:

```text
requireCapability()
server/services/adminRbac.js
```

Admin role mapping:

```text
X-Admin-Token maps to config.ADMIN_RBAC.tokenRole.
Session admin maps to user.adminRole or defaultSessionAdminRole.
ADMIN_RBAC.enabled=false preserves legacy admin behavior.
```

Capability-protected routes include:

| Capability | Representative routes |
|---|---|
| `admin.payments.complete` | `POST /api/admin/payments/:id/complete` |
| `admin.users.status_limited` | `PUT /api/admin/users/:id/status` |
| `admin.reports.review` | `PUT /api/admin/reports/:id` |
| `admin.verifications.review` | `PUT /api/admin/verifications/:id` |
| `admin.audit.export` | `GET /api/admin/audit-log/export`, `POST /api/admin/exports/audit-log` |
| `admin.trust.calibration` | `POST /api/admin/trust/calibration/snapshot-batch`, `POST /api/admin/trust/calibration/report` |
| `admin.predictive.review` | predictive signal confirm/false-positive/dismiss/escalate routes |
| `admin.queue.repair` | `POST /api/admin/queue/repair` |
| `admin.locks.release` | `POST /api/admin/production/process-locks/:name/release` |
| `admin.schedulers.run` | `POST /api/admin/schedulers/:name/run` |
| `admin.schedulers.toggle` | scheduler enable/disable routes |
| `admin.maintenance.toggle` | maintenance enable/disable routes |
| `admin.scale.read` | storage/externalization/phase61 read routes |
| `admin.ops.review` | storage capture, threshold verify, rehearsal/evidence captures |
| `admin.ops.read` | production multi-instance boundary and ops read surfaces |
| `admin.read` | RBAC matrix/me and broad admin read capability |
| `admin.approvals.write` | admin approval create/approve/reject |
| `admin.privacy.read` | privacy request read/preview |
| `admin.privacy.write` | privacy request create/cancel |
| `admin.privacy.export` | privacy export queue |
| `admin.privacy.anonymize` | privacy anonymization queue |
| `admin.incidents.read` | incident postmortem/list read |
| `admin.postmortems.write` | create/update postmortems |

Important warning:

```text
Do not weaken requireCapability.
Do not broaden super_admin bypass semantics without separate governance patch.
```

---

## Read / Write / SSE / Download Classification

Route classification examples:

| Class | Examples |
|---|---|
| Public read | `GET /api/health`, `GET /api/config`, `GET /api/jobs`, `GET /api/users/:id/public-profile` |
| Public auth bootstrap write | `POST /api/auth/send-otp`, `POST /api/auth/verify-otp` |
| Authenticated read | `GET /api/auth/me`, `GET /api/notifications`, `GET /api/workrooms` |
| Authenticated write | `PUT /api/auth/profile`, `POST /api/reports`, notification read/action routes |
| Role-restricted write | `POST /api/jobs`, `POST /api/jobs/:id/apply`, direct-offer accept/decline |
| Admin read | `GET /api/admin/stats`, `GET /api/admin/users`, `GET /api/admin/monitoring` |
| Admin write | admin review/status/action routes protected by `requireAdmin` |
| Capability-restricted admin write | queue repair, scheduler toggle, maintenance toggle, privacy anonymize |
| SSE long-lived | `/api/notifications/stream`, `/api/jobs/live-feed`, `/api/admin/events` |
| Download/export | admin audit CSV, admin exports download, employer payment export |
| Background/ops action | async audit export, queue compaction, scheduler run, restore drill queue |
| Advisory/evidence route | storage pressure, externalization decision, Phase 61 evidence, pilot gate |

---

## Read-only Replica Route Posture

Read-only replica guard files:

```text
server/middleware/readOnlyReplica.js
server/services/instanceMode.js
```

Behavior:

```text
INSTANCE_MODE=read_only_replica blocks POST/PUT/PATCH/DELETE API routes.
GET routes are generally allowed when guard permits read APIs.
Health/config/docs are always allowed.
Static files are served before global middleware.
Admin read-only ops are allowed according to guard config.
Write APIs must be sent to single_writer instance.
```

Important warning:

```text
ROUTES_CATALOG.md does not change read-only replica policy.
read_only_replica must not run queue workers.
read_only_replica must not run schedulers.
read_only_replica is not multi-writer.
```

---

## Maintenance Mode Route Posture

Maintenance files:

```text
server/middleware/maintenance.js
server/services/maintenanceMode.js
```

Behavior:

```text
Maintenance mode can block API routes when active.
Static files are allowed.
Health/config/docs are allowed.
Admin maintenance/production routes are allowed.
Admin bypass may be allowed by config.
Read-only public APIs may be allowed by config.
Maintenance state is file-backed in ops/maintenance.json.
Maintenance check fails open if service check fails.
```

Important warning:

```text
ROUTES_CATALOG.md does not change maintenance mode policy.
Maintenance route allowances are controlled by maintenanceMode.js and config.
```

---

## Source Collections and Derived Artifacts by Route Group

| Route group | Source collections | Derived artifacts / side effects |
|---|---|---|
| Auth | `users`, `sessions`, `otp` | `users/phone-index.json` |
| Profile / Verification | `users`, `verifications`, `images` | `verifications/user-index.json`, activation metrics |
| Jobs | `jobs` | `jobs/index.json`, `jobs/employer-index.json`, search/query indexes |
| Applications | `applications`, `jobs` | worker/job application indexes, job status index |
| Attendance | `attendance`, `jobs`, `applications` | attendance job/worker indexes, trust/analytics artifacts |
| Ratings / Trust | `ratings`, `users`, `jobs` | rating summaries, trust snapshots/calibration |
| Reports / Abuse | `reports`, `abuse_flag_reviews`, `predictive_signals` | report indexes, predictive archives/indexes |
| Notifications / SSE | `notifications` | `notifications/user-index.json`, SSE replay buffer |
| Messages | `messages` | message job/user indexes, notification records |
| Workrooms | `workrooms`, `messages`, receipts, pins, checklists, `images` | workroom search indexes, hygiene/adoption metrics |
| Direct Offers | `direct_offers`, synthetic `jobs`, `applications` | direct offer indexes, counters, analytics cache invalidation |
| Availability Ads | `availability_ads` | worker ads index, query index |
| Payments | `payments`, `jobs`, `attendance` | payment job index, receipts, dispute analytics |
| Queue Admin | `ops_queue` segmented files, idempotency, DLQ | `metrics/queue/summary.json`, archive, ops rollups |
| Admin Audit / Export | `audit`, `exports` | audit indexes, CSV files, export progress |
| Production Ops | locks, scheduler, incidents, maintenance, restore drills | ops rollups, incident timelines |
| Governance / Privacy | `admin_approvals`, `privacy_requests`, `ops_reviews`, `postmortems` | audit logs, privacy export artifacts |
| Scale / Phase 60/61 | metrics/evidence artifacts | storage pressure, benchmark history, pilot decisions, repository reports |

Source data warning:

```text
Source JSON records remain source of truth.
Secondary indexes are derived/rebuildable artifacts.
Queue summary/location indexes are derived.
Metrics/evidence artifacts do not authorize mutation.
```

---

## Route Risks and Invariants

Key invariants:

```text
server/router.js routes[] is the runtime route source of truth.
Route order matters.
Specific routes must appear before generic :id patterns.
Path params are validated through isValidId().
Static files are served before API middleware chain.
Global middleware runs before route-specific middleware.
Route-specific middleware must not be bypassed.
SSE routes are long-lived and self-authenticated.
Query-token admin auth must remain limited to direct-download endpoints.
read_only_replica blocks write APIs.
maintenance mode can block non-allowed API routes.
EventBus is in-memory and single-process.
SSE/Admin SSE/Live Feed fanout is single-instance.
```

Operational risks:

```text
route ordering regressions
accidental public exposure of synthetic jobs
admin query-token broadening
RBAC capability weakening
middleware reordering
read-only replica write leakage
maintenance mode bypass changes
handler/service boundary drift
source vs derived artifact confusion
queue summary mismatch misinterpretation
confirmed remediation script misuse
```

Queue invariant:

```text
Queue segmented files remain source of truth.
QUEUE_SUMMARY_MISMATCH means queue summary/location derived artifacts are untrusted.
Do not use ROUTES_CATALOG.md as remediation approval.
```

---

## Review / Testing Surface

Relevant static docs tests:

```text
tests/docs/routes-catalog-static.test.js
tests/docs/docs-reality-check-static.test.js
tests/docs/systems-catalog-static.test.js
tests/docs/data-catalog-static.test.js
tests/docs/server-catalog-static.test.js
tests/docs/events-catalog-static.test.js
```

Relevant source files for route reality checks:

```text
server.js
server/router.js
server/middleware/auth.js
server/middleware/rateLimit.js
server/middleware/maintenance.js
server/middleware/readOnlyReplica.js
server/middleware/bodyParser.js
server/middleware/static.js
server/handlers/*.js
server/services/*.js
```

Recommended verification:

```bash
node --test --test-concurrency=1 tests/docs/*.test.js
```

Script governance regression subset:

```bash
node --test --test-concurrency=1 \
  tests/scripts/repair-indexes-hardening.test.js \
  tests/scripts/cleanup-notification-flood-hardening.test.js \
  tests/scripts/repair-cleanup-higher-risk-reality.test.js \
  tests/scripts/scripts-governance-final-summary.test.js
```

---

## Cross-Links

Canonical architecture docs:

```text
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
```

Catalog roles:

```text
SYSTEMS_CATALOG.md maps systems.
DATA_CATALOG.md maps collections and source/derived data boundaries.
SERVER_CATALOG.md maps server startup, middleware, router, timers, queue workers, schedulers, SSE, and shutdown lifecycle.
EVENTS_CATALOG.md maps EventBus events, emitters, listeners, fanout, side effects, and durability classes.
ROUTES_CATALOG.md maps route registry, route-specific middleware, handler ownership, service ownership, and route risk classifications.
```

Canonical operations docs:

```text
docs/operations/DOCS_REALITY_CHECK.md
docs/operations/SCRIPTS_CATALOG.md
docs/operations/OPERATIONS_RUNBOOK.md
docs/operations/QUEUE_REMEDIATION_APPROVAL_RUNBOOK.md
docs/operations/PM2_MANAGED_YAWMIA_QUEUE_WORKER_RUNBOOK.md
docs/operations/MULTI_INSTANCE_BOUNDARY.md
docs/operations/STORAGE_PRESSURE_RUNBOOK.md
docs/operations/SCALE_LIMITS.md
docs/operations/EXTERNALIZATION_READINESS.md
```

---

## Final Safety Position

No runtime change.

No deletion.

No reset.

No confirmed mutation.

No production queue mutation.

No scheduler mutation.

No PM2 restart/start/save.

No index repair execution.

No notification quarantine execution.

No migration execution.

No router refactor.

No middleware refactor.

No handler rewrite.

No service rewrite.

No auth weakening.

No RBAC weakening.

No EventBus refactor.

No SSE fanout implementation.

No external pub/sub.

No externalization.

No PostgreSQL.

No Redis.

No external queue.

No external search.

No new dependencies.

No version/cache change.

ROUTES_CATALOG.md is documentation-only.

ROUTES_CATALOG.md does not authorize runtime changes.

ROUTES_CATALOG.md does not authorize route refactors.

ROUTES_CATALOG.md does not authorize middleware changes.

ROUTES_CATALOG.md does not authorize handler rewrites.

ROUTES_CATALOG.md does not authorize service rewrites.

ROUTES_CATALOG.md does not authorize auth weakening.

ROUTES_CATALOG.md does not authorize admin capability weakening.

ROUTES_CATALOG.md does not authorize data mutation.

ROUTES_CATALOG.md does not authorize queue remediation.

ROUTES_CATALOG.md does not authorize scheduler changes.

ROUTES_CATALOG.md does not authorize PM2 restart/start/save.

ROUTES_CATALOG.md does not authorize confirmed script execution.

ROUTES_CATALOG.md does not implement externalization.
