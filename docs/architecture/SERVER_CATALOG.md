# Yawmia Server Catalog

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch: Patch 18 — Server Catalog Baseline  
> Scope: Server/runtime lifecycle architecture inventory  
> Runtime posture: documentation-only  
> Source of truth posture: file-backed JSON source of truth  
> Externalization posture: advisory-only  
> Last reviewed: 2026-06-04

---

## Purpose

This catalog is the canonical server/runtime lifecycle architecture reference for Yawmia.

It documents how the current server boots, wires middleware, creates the router, registers EventBus listeners, starts timers, starts queue workers, starts scheduler registry jobs, serves SSE, and shuts down.

This document complements:

```text
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
```

`SYSTEMS_CATALOG.md` maps systems.

`DATA_CATALOG.md` maps collections and data artifacts.

`SERVER_CATALOG.md` maps server startup, middleware, router, timers, queue workers, schedulers, SSE, and shutdown lifecycle.

EVENTS_CATALOG.md maps the EventBus event graph companion catalog bootstrapped by server/router.js and services.

ROUTES_CATALOG.md maps the server/router.js route registry, route-specific middleware, handlers, and services.
This document is documentation-only.

It does not authorize:

```text
runtime changes
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

## Runtime Architecture Posture

Current Yawmia server architecture is:

```text
Native Node.js 20+ ESM
native http
native fetch
native node:stream
native node:test
zero-framework backend
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

Current Yawmia server architecture is explicitly:

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
no runtime repository switching
no dual-write
no cutover
no pilot by default
```

Phase 59 / Phase 60 / Phase 61 externalization systems are advisory/evidence only.

No external DB/search/queue is implemented.

No runtime repository switching is enabled.

---

## Server Entry Point

Primary entrypoint:

```text
server.js
```

Primary router registry:

```text
server/router.js
```

Important server files:

```text
config.js
server.js
server/router.js
server/middleware/*.js
server/handlers/*.js
server/services/*.js
```

`server.js` owns:

```text
dotenv loading
config import
database initialization
migration execution
index bootstrap
router creation
global middleware chain
native http server creation
server timeout configuration
startup cleanup
legacy timers
scheduler registry startup
queue worker startup
graceful shutdown
```

`server/router.js` owns:

```text
central routes[] registry
route matching
path parameter validation
route-specific middleware execution
handler dispatch
/api/docs introspection endpoint
EventBus listener bootstrap side effects
```

---

## Startup Sequence

The current `server.js` startup sequence is order-sensitive.

Observed startup phases:

1. dotenv loading.
2. `config.js` import.
3. Service and middleware imports.
4. `PORT` / `HOST` resolution.
5. `initDatabase()`.
6. `runMigrations()`.
7. Audit index listener registration and optional rebuild.
8. Search index build.
9. Query index build.
10. Stale `.tmp` cleanup.
11. Logs directory creation.
12. Critical index warning check.
13. `createRouter()`.
14. Global middleware definition.
15. Native `http` server creation.
16. `staticMiddleware` before API middleware chain.
17. Request `pathname` and `query` parsing.
18. Server timeout configuration.
19. Startup cleanup:
    - `cleanExpiredSessions`
    - `enforceExpiredJobs`
    - `cleanExpiredOtps`
    - `cleanOldNotifications`
    - `autoDetectNoShows`
    - `checkExpiryWarnings`
20. Startup index health check.
21. Periodic cleanup timer.
22. Presence cleanup timer.
23. Instant match cleanup timer.
24. Availability ad expiration timer.
25. Ad matcher dedup cleanup timer.
26. Direct offer cleanup timer.
27. Activity summary timer.
28. Monitoring snapshot timer.
29. Export registry cleanup timer.
30. Storage pressure cleanup timer.
31. Backup scheduler timer.
32. Snooze reminders scanner start.
33. Audit retention scanner start.
34. Admin alert channels listener registration.
35. Incident timeline listener registration.
36. Scheduler registry defaults registration and runner start.
37. Queue workers start.
38. Scheduled abuse detection start.
39. Legacy predictive scan scheduler conditional start.
40. Trust snapshot scheduler.
41. Predictive signal retention scheduler.
42. Counter integrity check and scheduled rebuild.
43. `server.listen()`.
44. graceful shutdown handlers for `SIGINT` and `SIGTERM`.

Do not reorder startup phases without a separate architecture/runtime patch.

---

## Database Initialization Phase

Database initialization is handled by:

```text
server/services/database.js
initDatabase()
```

Startup behavior:

```text
creates configured collection directories
creates current monthly shard directories for sharded collections
uses config.DATABASE.dirs
uses config.SHARDING.collections
```

Storage posture:

```text
file-backed JSON source of truth
atomic writes
unique temp-file writes
monthly sharding
secondary indexes
filesystem indexes
```

Important invariant:

```text
Source JSON records must be protected before derived indexes.
```

---

## Migration Phase

Migration phase is handled by:

```text
server/services/migration.js
runMigrations()
```

Behavior:

```text
forward-only migrations
migration state stored in data/migration.json
migration failures are logged and do not silently mutate later phases
```

Important warning:

```text
SERVER_CATALOG.md does not authorize migration execution.
```

---

## Index Bootstrap Phase

Startup index bootstrap includes:

```text
audit index listener registration / optional rebuild
search index build
query index build
critical index warning check
startup index health check
```

Related files:

```text
server/services/auditLogIndex.js
server/services/searchIndex.js
server/services/queryIndex.js
server/services/indexHealth.js
```

Index posture:

```text
Secondary indexes are derived/rebuildable artifacts.
Filesystem indexes are derived/rebuildable artifacts.
Final correctness should come from source records where services require re-read/re-filter behavior.
```

---

## Router Creation Phase

Router creation occurs after initial database/index bootstrap:

```text
const router = createRouter();
```

Source:

```text
server/router.js
```

Important warning:

```text
server/router.js imports register EventBus listeners at module load.
service listener bootstrap in router.js can have side effects.
```

---

## Static File Serving Order

`staticMiddleware` runs before the API middleware chain.

In `server.js` request handling:

```text
staticMiddleware(req, res, () => {
  runMiddleware(globalMiddleware, req, res, () => {
    router(req, res);
  });
});
```

Implications:

```text
staticMiddleware runs before global API middleware chain.
static files are served before API middleware.
API routes pass through globalMiddleware then router.
security headers are also applied by staticMiddleware through applySecurityHeaders().
```

Related files:

```text
server/middleware/static.js
server/middleware/security.js
```

---

## Global Middleware Chain

The global middleware chain in `server.js` is:

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

Important ordering notes:

```text
timingMiddleware is first and wraps res.end.
corsMiddleware handles OPTIONS early.
securityMiddleware applies API security headers.
requestIdMiddleware runs after security and before rate limit in current chain.
rateLimitMiddleware runs before maintenance/read-only/body parsing.
maintenanceMiddleware can block writes while allowing configured reads/admin bypass.
readOnlyReplicaMiddleware blocks write APIs when INSTANCE_MODE=read_only_replica.
bodyParserMiddleware runs after rate/maintenance/read-only guards.
```

---

## Route-Specific Middleware Model

Route-specific middleware is defined inside:

```text
server/router.js
routes[]
```

Route format:

```text
{
  method,
  path,
  middlewares,
  handler
}
```

Common route-specific middleware:

```text
requireAuth
requireRole('worker')
requireRole('employer')
requireAdmin
requireCapability(...)
```

Related files:

```text
server/middleware/auth.js
server/services/adminRbac.js
```

---

## Router Registry Model

`server/router.js` uses a central registry model.

Core router components:

```text
routes[]
createRouter()
matchPath(pattern, pathname)
runMiddlewares(middlewares, req, res, done)
sendJSON(res, statusCode, data)
isValidId path parameter validation
```

Behavior:

```text
matches route by method and path pattern
supports :param patterns
attaches req.params
validates path params through isValidId
runs route-specific middleware
dispatches handler
logs request duration
returns NOT_FOUND when no route matches
```

`/api/docs` introspects the route registry and returns:

```text
method
path
auth
admin
total
version
```

---

## Route Groups

Current route groups include:

```text
Public health/config/docs
Auth
Analytics
Jobs
Applications
Attendance
Ratings
Reports
Notifications/SSE
Messages
Push
Alerts
Favorites
Images
Presence
Availability windows
Availability ads
Worker discovery
Direct offers
Workrooms
Payments
Admin analytics/exports/monitoring
Admin reports/verifications
Admin direct offers/abuse
Admin audit log/search/export
Admin trust/predictive/calibration
Admin queue/alerts
Admin production ops
Admin scale hygiene
Admin storage pressure/externalization
Admin Phase 60/61
Admin governance/RBAC/privacy/postmortems
```

---

## Handler Ownership Overview

Handler files own HTTP request/response translation.

Examples:

```text
server/handlers/authHandler.js
server/handlers/jobsHandler.js
server/handlers/applicationsHandler.js
server/handlers/attendanceHandler.js
server/handlers/messagesHandler.js
server/handlers/workroomHandler.js
server/handlers/directOfferHandler.js
server/handlers/adminHandler.js
server/handlers/queueHandler.js
server/handlers/productionOpsHandler.js
server/handlers/storagePressureHandler.js
server/handlers/externalizationDecisionHandler.js
server/handlers/phase61Handler.js
server/handlers/governanceHandler.js
```

Ownership boundary:

```text
handlers parse request data
handlers call services
handlers map service result codes to HTTP status
handlers should not own source data semantics
services own business logic and file-backed data writes
```

---

## Service Listener Bootstrap

`server/router.js` also performs service listener bootstrap.

Current bootstrap calls include:

```text
setupNotificationListeners()
setupAdMatchListeners()
setupCacheInvalidation()
setupJobMatching()
setupJobAlerts()
setupInstantMatchListeners()
setupLiveFeedListeners()
setupDirectOfferListeners()
direct offer counter event listeners
analytics cache invalidation event listeners
```

Important ordering notes:

```text
router.js module import has side effects through listener registration.
Listener order matters for adMatcher before jobMatcher dedup.
setupAdMatchListeners() runs before setupJobMatching().
Direct offer counters are registered before analytics cache invalidation.
Some listeners are guarded by config flags.
```

---

## EventBus Bootstrap Notes

EventBus source:

```text
server/services/eventBus.js
```

Current EventBus posture:

```text
EventBus is in-memory and single-process.
EventBus is not distributed.
EventBus does not cross instance boundaries.
EventBus does not persist events.
```

EventBus in-memory warning:

```text
EventBus in-memory warning: multi-instance deployments do not get automatic cross-instance event propagation.
```

Implications:

```text
SSE fanout is single-instance.
Admin SSE is single-instance.
Live feed is single-instance.
Queue/scheduler events are process-local unless represented by source files or metrics artifacts.
```

---

## Timers and Intervals

Server-level timers in `server.js` include:

```text
periodic cleanup timer
presence cleanup timer
instant match cleanup timer
availability ad expiration timer
adMatcher dedup cleanup timer
direct offer cleanup timer
activity summary timer
monitoring snapshot timer
export registry cleanup timer
storage pressure cleanup timer
backup scheduler timer
counter scheduled rebuild timer
```

Service-level timers include:

```text
cache cleanup timers in services
rate-limit cleanup timer
event replay buffer cleanup timer
snooze reminders scanner
audit retention scanner
scheduler registry runner
queue worker scan loop
```

Important notes:

```text
timers are unref'd where applicable.
some heavy work should prefer scheduler registry / ops queue.
legacy timers remain safety fallback in some areas.
legacy timers and scheduler registry can coexist.
```

---

## Queue Worker Lifecycle

Queue worker lifecycle is owned by:

```text
server/services/queueWorkers.js
server/services/opsQueue.js
server/services/queueStorageIndex.js
server/services/instanceMode.js
```

Startup:

```text
server.js starts queue workers if config.OPS_QUEUE.enabled && config.OPS_QUEUE.workerEnabled.
queueWorkers.startQueueWorkers()
```

Instance mode invariant:

```text
instanceMode.canRunQueueWorkers should govern actual worker behavior.
queue workers must not run on read_only_replica.
```

Queue worker behavior:

```text
queue workers claim jobs from segmented queue
leases protect running work
stale running jobs require read-only evidence before recovery
completed/failed/dead-letter status transitions write queue source files
```

Shutdown:

```text
graceful shutdown calls stopQueueWorkers({ drainMs: 5000 })
```

Queue remediation warning:

```text
Do not run queue remediation confirmed while a server/queue worker may be active.
Active worker proof requires fresh read-only PM2/process snapshot.
QUEUE_SUMMARY_MISMATCH means queue summary/location derived artifacts are untrusted.
Actual segmented queue files are source of truth.
Do not run queue-drain --confirm as remediation.
```

---

## Scheduler Registry Lifecycle

Scheduler registry lifecycle is owned by:

```text
server/services/schedulerRegistry.js
server/services/schedulerRunHistory.js
server/services/opsQueue.js
server/services/instanceMode.js
```

Startup:

```text
server.js imports schedulerRegistry
registerDefaultSchedulerJobs()
startSchedulerRegistry()
```

Runtime behavior:

```text
scheduler registry is file-backed
scheduler jobs enqueue opsQueue jobs
scheduler history is separate
single-writer discipline required
read_only_replica should not run schedulers
```

Shutdown:

```text
graceful shutdown calls stopSchedulerRegistry()
```

Legacy scheduler note:

```text
legacy predictive scan scheduler is conditionally disabled when scheduler registry predictive_scan is enabled.
```

---

## Process Lock Lifecycle

Process lock lifecycle is owned by:

```text
server/services/processLock.js
server/services/instanceMode.js
```

Purpose:

```text
file-backed guardrails for schedulers and operational jobs
stale lock recovery
manual force release through admin production ops routes
```

Important warning:

```text
process locks are guardrails, not distributed consensus.
```

Implications:

```text
Do not run multi-writer production relying only on process locks.
Do not treat file locks as cross-host consensus.
Use single-writer discipline for queue workers and schedulers.
```

---

## SSE / Notification Stream Lifecycle

Notification SSE route:

```text
GET /api/notifications/stream
```

Handler:

```text
server/handlers/sseHandler.js
```

Services:

```text
server/services/sseManager.js
server/services/eventReplayBuffer.js
server/services/notifications.js
```

Behavior:

```text
self-auth via Authorization header or token query
uses sseManager.addConnection
sends init event with unread count
supports replay buffer via Last-Event-Id
uses EventSource auto-reconnect client behavior
```

Warning:

```text
SSE/EventBus are single-process.
No cross-instance fanout.
No external pub/sub.
```

---

## Live Feed SSE Lifecycle

Live Feed SSE route:

```text
GET /api/jobs/live-feed
```

Handler:

```text
server/handlers/liveFeedHandler.js
```

Service:

```text
server/services/liveFeed.js
```

Behavior:

```text
worker-only self-auth
registerConnection in liveFeed
sends initial nearby jobs dump
delivers job_created
delivers job_updated
delivers instant_match_offer
delivers instant_match_taken
delivers direct_offer_received
delivers direct_offer_status
```

Warning:

```text
Live Feed SSE is single-instance.
No cross-instance fanout exists.
```

---

## Admin SSE Lifecycle

Admin SSE route:

```text
GET /api/admin/events
```

Handler:

```text
server/handlers/adminSseHandler.js
```

Behavior:

```text
self-auth via X-Admin-Token or query token
registers subscribed EventBus events lazily
keeps in-memory connection map per admin
sends init event with subscribed events
heartbeat every 30s
```

Warning:

```text
Admin SSE is single-process.
No cross-instance fanout exists.
No external pub/sub exists.
```

---

## Maintenance Mode Guard

Maintenance guard files:

```text
server/middleware/maintenance.js
server/services/maintenanceMode.js
```

Behavior:

```text
maintenanceMiddleware runs before readOnlyReplicaMiddleware and bodyParserMiddleware.
MAINTENANCE_MODE_ENABLED env override is supported by service logic.
maintenance state is file-backed in ops/maintenance.json.
static files are allowed.
health/config/docs can remain allowed.
admin maintenance/production routes can remain allowed.
configured read-only APIs can remain allowed.
```

Important note:

```text
maintenance check fails open if the maintenance service errors.
```

---

## Read-only Replica Guard

Read-only replica guard files:

```text
server/middleware/readOnlyReplica.js
server/services/instanceMode.js
```

Behavior:

```text
blocks POST/PUT/PATCH/DELETE APIs when INSTANCE_MODE=read_only_replica.
allows health/config/docs when configured.
allows GET APIs by current guard policy.
static files are served before global middleware.
```

read_only_replica warning:

```text
read_only_replica must not run queue workers.
read_only_replica must not run schedulers.
read_only_replica is not multi-writer.
```

---

## Monitoring / Incident / Alert Lifecycle

Monitoring/ops files:

```text
server/services/monitor.js
server/services/metricsRollups.js
server/services/incidentTimeline.js
server/services/adminAlertChannels.js
server/services/alertDeliveryHistory.js
```

Lifecycle:

```text
monitoring snapshot timer captures memory/cache/request/SSE/index/queue/counter/ops visibility
checkThresholds evaluates warning/critical thresholds
counter file critical events can trigger alerts and rebuild/compaction flows
incident timeline listens to critical operational events
admin alert channels can queue durable alert deliveries through opsQueue
ops rollups summarize queue, alert delivery, scheduler, and lock health
```

Important warning:

```text
metrics snapshots and rollups are evidence artifacts.
They do not authorize data mutation.
They do not authorize externalization.
```

---

## Graceful Shutdown Sequence

Graceful shutdown is handled in:

```text
server.js
gracefulShutdown(signal)
```

Sequence:

1. `SIGINT` / `SIGTERM` triggers `gracefulShutdown(signal)`.
2. `server.close()`.
3. `stopQueueWorkers({ drainMs: 5000 })`.
4. `stopSchedulerRegistry()`.
5. `directOfferCounters.forceFlush()`.
6. `cacheDebouncer.flushPending()`.
7. Broadcast SSE shutdown event.
8. Normal exit after 1 second.
9. Force exit after 10 seconds.

Important notes:

```text
directOfferCounters.forceFlush happens before SSE shutdown broadcast.
cacheDebouncer.flushPending happens before SSE shutdown broadcast.
shutdown is best-effort.
some timers are unref'd.
file-backed writes should finish quickly but are not transactional across all services.
```

---

## Server-Level Source vs Derived Boundaries

Source records:

```text
users
sessions
jobs
applications
notifications
payments
messages
attendance
direct_offers
availability_ads
workrooms
ops_queue segmented job files
scheduler records
process locks
incidents
maintenance state
privacy/governance records
```

Derived/rebuildable artifacts:

```text
secondary indexes
audit indexes
search indexes
query indexes
workroom search indexes
queue summary/location indexes
direct-offer counters
analytics rollups
monitoring snapshots
storage pressure snapshots
benchmark history
externalization decision snapshots
Phase 61 evidence snapshots
```

Important queue boundary:

```text
QUEUE_SUMMARY_MISMATCH means queue summary/location derived artifacts are untrusted.
Actual segmented queue files are source of truth.
```

---

## Server-Level Risks and Invariants

Key invariants:

```text
server.js startup order matters.
staticMiddleware runs before the API middleware chain.
router.js imports register EventBus listeners at module load.
service listener bootstrap in router.js can have side effects.
legacy timers and scheduler registry can coexist.
queue workers must not run on read_only_replica.
schedulers must not run on read_only_replica.
process locks are guardrails, not distributed consensus.
EventBus is in-memory and single-process.
SSE/Admin SSE are single-instance fanout.
single-writer discipline is required for production writer behavior.
```

Operational risks:

```text
duplicate EventBus listeners if modules are imported in unusual test/runtime patterns
stale running queue jobs
queue summary/location mismatch
scheduler stale leases
counter file drift
index drift
notification flood
admin token leakage
query-token misuse
maintenance mode fail-open
SSE connection memory growth
```

---

## Review / Testing Surface

Relevant static docs tests:

```text
tests/docs/server-catalog-static.test.js
tests/docs/systems-catalog-static.test.js
tests/docs/data-catalog-static.test.js
tests/docs/docs-reality-check-static.test.js
```

Relevant script governance regression tests:

```text
tests/scripts/repair-indexes-hardening.test.js
tests/scripts/cleanup-notification-flood-hardening.test.js
tests/scripts/repair-cleanup-higher-risk-reality.test.js
tests/scripts/scripts-governance-final-summary.test.js
```

Recommended verification command:

```bash
node --test --test-concurrency=1 tests/docs/*.test.js
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

Runtime source files:

```text
server.js
server/router.js
config.js
server/middleware/*.js
server/handlers/*.js
server/services/*.js
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

No externalization.

No PostgreSQL.

No Redis.

No external queue.

No external search.

No new dependencies.

No version/cache change.

SERVER_CATALOG.md is documentation-only.

SERVER_CATALOG.md does not authorize runtime changes.

SERVER_CATALOG.md does not authorize data mutation.

SERVER_CATALOG.md does not authorize queue remediation.

SERVER_CATALOG.md does not authorize scheduler changes.

SERVER_CATALOG.md does not authorize PM2 restart/start/save.

SERVER_CATALOG.md does not authorize confirmed script execution.

SERVER_CATALOG.md does not implement externalization.
