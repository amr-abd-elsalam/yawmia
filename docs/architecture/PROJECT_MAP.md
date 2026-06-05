# Yawmia Project Map

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch: Patch 21 — Project Map Baseline  
> Scope: Project-wide repository / onboarding / architecture map  
> Runtime posture: documentation-only  
> Source of truth posture: file-backed JSON source of truth  
> Externalization posture: advisory-only  
> Last reviewed: 2026-06-05

---

## Purpose

`PROJECT_MAP.md` is the canonical project-wide repository / onboarding / architecture map for Yawmia.

It explains where the major parts of the repository live and how to inspect them safely:

```text
repository structure
top-level files
runtime entrypoints
backend map
router / middleware / handlers / services map
data and storage map
EventBus and fanout map
frontend / PWA map
scripts / operational tooling map
tests map
docs map
governance / privacy map
safe review workflow
safe git / bundle workflow
```

It complements the canonical architecture catalogs:

```text
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
```

## How To Use This Documentation Set

Start with `PROJECT_MAP.md` for repository orientation, onboarding, source tree navigation, and safe review workflow.

Use the narrowest relevant doc:

```text
Repository layout / onboarding / safe navigation:
  docs/architecture/PROJECT_MAP.md

Product/runtime system ownership:
  docs/architecture/SYSTEMS_CATALOG.md

Data collections / source-vs-derived / sharding / indexes:
  docs/architecture/DATA_CATALOG.md

Server startup / middleware / timers / workers / schedulers / shutdown:
  docs/architecture/SERVER_CATALOG.md

EventBus / SSE / Admin SSE / Live Feed / Web Push / fanout:
  docs/architecture/EVENTS_CATALOG.md

Route registry / handler / service ownership / route risk:
  docs/architecture/ROUTES_CATALOG.md

Operational script safety / dry-run / --confirm governance:
  docs/operations/SCRIPTS_CATALOG.md

Docs inventory / classification / canonical-vs-evidence status:
  docs/operations/DOCS_REALITY_CHECK.md
```

Source files are the source of truth.

Generated review bundles are not source of truth:

```text
CODEBASE_PART1.md
CODEBASE_PART2.md
CODEBASE_PART3.md
CODEBASE_PART4.md
```

Do not update every catalog for every small change.

Update the narrowest relevant doc.

Prefer source truth over bundles.

`PROJECT_MAP.md` is not runtime authority.

It is not remediation approval, mutation approval, queue remediation approval, PM2 approval, migration approval, pilot approval, or externalization approval.

## Documentation Update Scope Rules

Use these rules before editing docs:

```text
Runtime source change:
  update only docs that directly describe the changed behavior.

Route registry change:
  update ROUTES_CATALOG.md only if route ownership, middleware, access control, source collection, derived artifact, or risk classification changed.

Data collection / source-vs-derived / sharding / index change:
  update DATA_CATALOG.md.

Event / listener / fanout / SSE / Web Push change:
  update EVENTS_CATALOG.md.

Server startup / middleware / timer / queue worker / scheduler / shutdown lifecycle change:
  update SERVER_CATALOG.md.

Product/system responsibility change:
  update SYSTEMS_CATALOG.md.

Repository layout / onboarding / safe review workflow change:
  update PROJECT_MAP.md.

Script governance / dry-run / --confirm / operational safety change:
  update SCRIPTS_CATALOG.md.

Docs inventory / canonical-vs-evidence classification change:
  update DOCS_REALITY_CHECK.md.

Small implementation fix with no architecture ownership or risk change:
  do not touch every catalog.
```

Do not touch all catalogs for one narrow change.

Do not create a new architecture catalog unless:

```text
a practical risk exists,
the risk cannot be covered by PROJECT_MAP.md,
the risk cannot be covered by an existing catalog,
tests or operational evidence justify it,
and maintenance cost is lower than the benefit.
```

Default decision:

```text
No new architecture catalog.
```

This document is documentation-only.

It does not authorize:

```text
runtime changes
source code refactors
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
externalization
new dependencies
version/cache changes
```

---

## Current Architecture Posture

Current Yawmia architecture is:

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
single-process EventBus
single-writer discipline
zero new dependencies
```

Current Yawmia architecture explicitly has:

```text
no Express
no Koa
no Fastify
no React
no PostgreSQL
no Redis
no external DB
no external queue
no external search
no external pub/sub
no external EventBus bridge
no external SSE fanout
no Kafka
no NATS
no RabbitMQ
no Elastic
no OpenSearch
no runtime repository switching
no dual-write
no cutover
no pilot by default
```

Phase 59 / Phase 60 / Phase 61 externalization work is advisory/evidence only.

No external DB/search/queue is implemented.

No runtime repository switching is enabled.

---

## Source of Truth vs Generated Review Bundles

Repo source files are the source of truth.

Generated review bundles are not source of truth:

```text
CODEBASE_PART1.md
CODEBASE_PART2.md
CODEBASE_PART3.md
CODEBASE_PART4.md
```

Review bundle rules:

```text
CODEBASE_PART*.md files are generated review bundles only.
Do not patch generated bundles manually as source truth.
Do not resolve bundle conflicts as source truth.
Do not infer runtime behavior from stale bundles.
If bundles are stale, inspect source files directly.
If source/docs changes require bundle refresh, regenerate with:
node scripts/bundle-for-review.js
```

Source truth lives in:

```text
config.js
server.js
server/
frontend/
scripts/
tests/
docs/
package.json
```

---

## Repository Top-Level Map

Top-level repository files and directories:

| Path | Purpose |
|---|---|
| `config.js` | Runtime configuration, feature flags, storage paths, security posture, Phase 59/60/61 advisory config |
| `server.js` | Native Node.js runtime entrypoint, startup lifecycle, global middleware chain, timers, workers, schedulers, graceful shutdown |
| `server/` | Backend runtime source tree |
| `frontend/` | Vanilla JS frontend, HTML pages, CSS, PWA service worker, manifest |
| `scripts/` | Zero-dependency operational tooling and evidence scripts |
| `tests/` | `node:test` test suite for docs, scripts, services, and regression checks |
| `docs/` | Canonical architecture, operations, governance, privacy, deployment, incidents, design, and phase docs |
| `package.json` | Project metadata, `type: module`, scripts, Node engine, dependency posture |
| `.env.example` | Environment variable template |
| `.gitignore` | Local/runtime/generated ignore rules |
| `CODEBASE_PART1.md` | Generated review bundle: config + server core + router |
| `CODEBASE_PART2.md` | Generated review bundle: backend services |
| `CODEBASE_PART3.md` | Generated review bundle: middleware + handlers |
| `CODEBASE_PART4.md` | Generated review bundle: frontend + scripts |

Important rule:

```text
Source files are truth.
Review bundles are generated artifacts.
```

---

## Backend Runtime Map

Backend runtime source tree:

```text
server.js
server/router.js
server/middleware/
server/handlers/
server/services/
config.js
```

Ownership:

```text
server.js owns startup, shutdown, native http server, global middleware chain, timers, queue workers, scheduler registry, and runtime lifecycle.
server/router.js owns the central routes[] registry, route matching, route-specific middleware execution, handler dispatch, /api/docs, and EventBus listener bootstrap.
server/middleware/ owns native middleware and request guards.
server/handlers/ owns HTTP request/response translation.
server/services/ owns business logic, file-backed persistence, EventBus emissions/listeners, derived artifacts, and ops systems.
config.js owns runtime configuration and feature posture.
```

Important runtime invariant:

```text
server.js startup order matters.
server/router.js route order matters.
server/router.js imports register EventBus listeners at module load.
Do not reorder listener bootstrap without a dedicated runtime architecture patch.
```

Detailed companion:

```text
docs/architecture/SERVER_CATALOG.md
```

---

## Router / Handler / Middleware Map

Runtime route source of truth:

```text
server/router.js
```

Router model:

```text
routes[]
createRouter()
matchPath(pattern, pathname)
runMiddlewares(middlewares, req, res, done)
sendJSON(res, statusCode, data)
isValidId() path parameter validation
```

Route object format:

```javascript
{
  method,
  path,
  middlewares,
  handler
}
```

Global middleware chain is defined in `server.js`:

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

Static file serving order:

```text
staticMiddleware runs before API middleware chain.
```

Route-specific middleware includes:

```text
requireAuth
requireRole('worker')
requireRole('employer')
requireAdmin
requireCapability(...)
```

Handlers live in:

```text
server/handlers/
```

Middleware lives in:

```text
server/middleware/
```

Detailed companion:

```text
docs/architecture/ROUTES_CATALOG.md
```

Safety:

```text
PROJECT_MAP.md does not authorize route refactors.
PROJECT_MAP.md does not authorize middleware changes.
PROJECT_MAP.md does not authorize handler rewrites.
PROJECT_MAP.md does not authorize auth weakening.
PROJECT_MAP.md does not authorize RBAC weakening.
```

---

## Service Layer Map

Service layer source tree:

```text
server/services/
```

Service families:

```text
auth/session/users:
  auth.js
  sessions.js
  users.js
  validators.js
  sanitizer.js
  messaging.js
  channels/whatsapp.js
  channels/sms.js

marketplace:
  jobs.js
  applications.js
  applicationStatus.js
  attendance.js
  payments.js
  ratings.js
  reports.js
  geo.js

notifications/messages/workrooms:
  notifications.js
  notificationActions.js
  notificationMessenger.js
  messages.js
  workroom.js
  workroomReceipts.js
  workroomPins.js
  workroomChecklist.js
  workroomAttachments.js
  workroomSearch.js
  workroomHygiene.js
  workroomIndexHealth.js

realtime/fanout:
  eventBus.js
  sseManager.js
  eventReplayBuffer.js
  liveFeed.js
  webpush.js
  presenceService.js
  instantMatch.js

talent exchange:
  availabilityWindow.js
  availabilityAd.js
  adMatcher.js
  workerDiscovery.js
  matchingIntelligence.js
  directOffer.js
  directOfferAnalytics.js
  directOfferCounters.js
  counterCompaction.js
  offerAbuseDetector.js

search/analytics/trust:
  searchIndex.js
  queryIndex.js
  searchRelevance.js
  arabicNormalizer.js
  arabicSearchTokens.js
  searchAnalytics.js
  analytics.js
  marketplaceIntelligenceRollups.js
  activationFunnelMetrics.js
  notificationConversionMetrics.js
  workroomAdoptionMetrics.js
  paymentDisputeAnalytics.js
  trust.js
  trustScoreV2.js
  trustAnalytics.js
  trustCalibration.js
  trustSnapshotRollups.js
  predictiveAbuse.js
  predictiveSignalRetention.js
  predictiveArchiveIndex.js
  adminDecisionAnalytics.js

ops:
  opsQueue.js
  queueWorkers.js
  queueStorageIndex.js
  queueHealthVerify.js
  queueCompaction.js
  processLock.js
  resourceLock.js
  schedulerRegistry.js
  schedulerRunHistory.js
  monitor.js
  metricsRollups.js
  incidentTimeline.js
  adminAlertChannels.js
  alertDeliveryHistory.js
  productionReadiness.js
  instanceMode.js
  maintenanceMode.js
  backupScheduler.js
  backupRestoreDrill.js

governance/privacy:
  adminRbac.js
  adminApprovals.js
  privacyRequests.js
  userDataExport.js
  userAnonymization.js
  opsReviewRecords.js
  postmortemRecords.js

storage/externalization/evidence:
  database.js
  cache.js
  cacheDebouncer.js
  logger.js
  logWriter.js
  imageStore.js
  migration.js
  storagePressure.js
  scaleThresholds.js
  externalizationReadiness.js
  externalizationDecision.js
  migrationSnapshotValidation.js
  benchmarkHistory.js
  phase61EvidenceCadence.js
  pilotDecisionGate.js
  rollbackRehearsal.js
  repositoryContractReport.js
```

Service boundary:

```text
Handlers translate HTTP.
Services own business logic.
Services own source record reads/writes.
Services own EventBus emit/listen side effects.
Services own derived artifact rebuild/repair logic.
```

---

## Data / Storage Map

Current data architecture:

```text
file-backed JSON source of truth
atomic writes
unique temp-file writes
monthly sharding
secondary indexes
filesystem indexes
segmented queue storage
queue summary/location indexes
metrics/evidence artifacts
governance artifacts
migration/rehearsal artifacts
```

Primary storage root:

```text
data/
```

Configured in:

```text
config.DATABASE.basePath
config.DATABASE.dirs
config.DATABASE.indexFiles
config.SHARDING
```

Source collections include:

```text
users
sessions
jobs
applications
otp
notifications
ratings
payments
reports
verifications
attendance
audit
messages
push_subscriptions
alerts
favorites
images
availability_windows
instant_matches
availability_ads
direct_offers
abuse_flag_reviews
predictive_signals
workrooms
ops_queue segmented files
alert_deliveries
ops_locks
scheduler
incidents
privacy_requests
admin_approvals
ops_reviews
postmortems
```

Derived/rebuildable artifacts include:

```text
secondary index files
audit/indexes
workrooms/search-indexes
metrics/queue/summary.json
metrics/direct-offer-counters.json
metrics/search-analytics
metrics/product-intelligence
metrics/payment-disputes
metrics/storage-pressure
metrics/scale-thresholds
metrics/benchmarks
metrics/externalization-decisions
metrics/phase61-evidence
metrics/pilot-decisions
metrics/repository-contracts
```

Detailed companion:

```text
docs/architecture/DATA_CATALOG.md
```

Critical data rules:

```text
JSON source records are source of truth.
Secondary indexes are derived/rebuildable artifacts.
Filesystem indexes are derived/rebuildable artifacts.
Queue segmented files are source of truth when summary mismatch exists.
Queue summary/location indexes are derived acceleration artifacts.
Metrics snapshots and rollups are evidence artifacts.
Review bundles are not source of truth.
```

---

## Event / Fanout Map

Event system source:

```text
server/services/eventBus.js
```

Current event posture:

```text
EventBus is in-memory.
EventBus is single-process.
EventBus events are not durable.
EventBus events do not cross instance boundaries.
EventBus does not replace source records.
EventBus does not replace queue files.
No external pub/sub is implemented.
```

Fanout surfaces:

```text
SSE notification stream:
  GET /api/notifications/stream
  server/handlers/sseHandler.js
  server/services/sseManager.js
  server/services/eventReplayBuffer.js

Admin SSE:
  GET /api/admin/events
  server/handlers/adminSseHandler.js

Live Feed SSE:
  GET /api/jobs/live-feed
  server/handlers/liveFeedHandler.js
  server/services/liveFeed.js

Web Push:
  server/services/webpush.js
  push_subscriptions source records

Admin alerts:
  server/services/adminAlertChannels.js
  server/services/alertDeliveryHistory.js
  opsQueue-backed delivery when enabled
```

Detailed companion:

```text
docs/architecture/EVENTS_CATALOG.md
```

Safety:

```text
PROJECT_MAP.md does not authorize EventBus refactor.
PROJECT_MAP.md does not authorize SSE fanout implementation.
PROJECT_MAP.md does not authorize external pub/sub.
```

---

## Frontend / PWA Map

Frontend source tree:

```text
frontend/
frontend/*.html
frontend/assets/js/*.js
frontend/assets/css/*.css
frontend/sw.js
frontend/manifest.json
frontend/robots.txt
frontend/sitemap.xml
```

Frontend architecture:

```text
Vanilla JS
no React
no frontend framework
Arabic-first
RTL
mobile-first
PWA
dark theme
large touch targets
progressive disclosure
```

Primary HTML pages:

```text
frontend/index.html
frontend/dashboard.html
frontend/profile.html
frontend/job.html
frontend/user.html
frontend/admin.html
frontend/terms.html
frontend/offline.html
frontend/404.html
```

Primary JS modules:

```text
frontend/assets/js/app.js
frontend/assets/js/auth.js
frontend/assets/js/jobs.js
frontend/assets/js/jobCard.js
frontend/assets/js/jobDetail.js
frontend/assets/js/profile.js
frontend/assets/js/user.js
frontend/assets/js/admin.js
frontend/assets/js/workroom.js
frontend/assets/js/livePresence.js
frontend/assets/js/instantMatch.js
frontend/assets/js/directOffer.js
frontend/assets/js/talentRadar.js
frontend/assets/js/adForm.js
frontend/assets/js/panels.js
frontend/assets/js/ratingModal.js
frontend/assets/js/modal.js
frontend/assets/js/toast.js
frontend/assets/js/icons.js
frontend/assets/js/utils.js
```

PWA files:

```text
frontend/sw.js
frontend/manifest.json
frontend/offline.html
```

CSS files:

```text
frontend/assets/css/tokens.css
frontend/assets/css/style.css
```

Important frontend surfaces:

```text
worker/employer dashboard
admin dashboard IA
workroom UI
talent radar
availability ads
direct offer modal
instant match modal
notifications drawer
PWA install/offline behavior
```

Safety:

```text
PROJECT_MAP.md does not authorize frontend rewrite.
PROJECT_MAP.md does not authorize framework migration.
PROJECT_MAP.md does not authorize cache/version changes.
```

---

## Scripts / Ops Tooling Map

Scripts live in:

```text
scripts/
```

Scripts are operational tooling.

Canonical scripts governance reference:

```text
docs/operations/SCRIPTS_CATALOG.md
```

Script posture:

```text
Native Node.js 20+ ESM
zero-dependency operational tooling
dry-run-first where applicable
--json evidence where applicable
--confirm required for mutation where applicable
no confirmed mutation without explicit approval
```

Representative script families:

```text
diagnostics:
  verify-data-json.js
  verify-file-health.js
  find-null-json-files.js
  benchmark-file-paths.js
  measure-storage-pressure.js
  verify-production-readiness.js
  postdeploy-smoke.js
  predeploy-check.js

index/search repair:
  repair-indexes.js
  rebuild-audit-index.js
  verify-audit-index.js
  rebuild-workroom-search.js
  verify-workroom-indexes.js
  rebuild-predictive-archive-index.js
  rebuild-search-relevance.js

queue operations:
  verify-queue.js
  repair-queue.js
  compact-queue.js
  queue-drain.js
  queue-retry-dlq.js
  recover-stale-running-jobs.js
  inspect-predictive-scan-queue.js

privacy/governance:
  export-user-data.js
  anonymize-user-data.js
  verify-privacy-governance.js
  verify-admin-rbac.js
  ops-weekly-review.js

evidence/externalization:
  export-migration-snapshot.js
  validate-migration-snapshot.js
  run-migration-rehearsal.js
  run-rollback-rehearsal.js
  capture-externalization-decision.js
  capture-phase61-evidence.js
  evaluate-pilot-gate.js
  verify-repository-contracts.js

rollups/compaction:
  compact-counters.js
  rebuild-counters.js
  rollup-product-intelligence.js
  rollup-trust-snapshots.js
  compact-workrooms.js
  compact-predictive-signals.js
  cleanup-attachments.js
  cleanup-notification-flood.js

bundles:
  bundle-for-review.js
```

Safety:

```text
Do not run confirmed mutation commands from this map.
Always collect read-only evidence first.
Use SCRIPTS_CATALOG.md for script-specific governance.
```

---

## Tests Map

Tests live in:

```text
tests/
```

Test runner:

```text
node:test
node:assert/strict
```

Dependency posture:

```text
no external test framework
no devDependencies
```

Important test groups:

```text
tests/docs/*.test.js
tests/scripts/*.test.js
tests/services/*.test.js
tests/handlers/*.test.js
tests/middleware/*.test.js
```

Docs architecture tests:

```text
tests/docs/docs-reality-check-static.test.js
tests/docs/systems-catalog-static.test.js
tests/docs/data-catalog-static.test.js
tests/docs/server-catalog-static.test.js
tests/docs/events-catalog-static.test.js
tests/docs/routes-catalog-static.test.js
tests/docs/project-map-static.test.js
```

Scripts governance regression tests:

```text
tests/scripts/repair-indexes-hardening.test.js
tests/scripts/cleanup-notification-flood-hardening.test.js
tests/scripts/repair-cleanup-higher-risk-reality.test.js
tests/scripts/scripts-governance-final-summary.test.js
```

Test safety:

```text
Tests must not run --confirm mutation commands.
Tests must not mutate production data.
Tests should verify docs/static behavior and script safety posture.
```

---

## Documentation Map

Documentation root:

```text
docs/
```

Canonical docs:

```text
docs/README.md
docs/operations/DOCS_REALITY_CHECK.md
docs/operations/SCRIPTS_CATALOG.md
docs/architecture/PROJECT_MAP.md
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
docs/design/DESIGN_RESEARCH.md
docs/privacy/PRIVACY_DATA_MAP.md
docs/governance/ADMIN_RBAC_MODEL.md
docs/governance/DATA_GOVERNANCE_RUNBOOK.md
docs/governance/PRIVACY_REQUEST_RUNBOOK.md
docs/operations/OPERATIONS_RUNBOOK.md
docs/operations/STORAGE_PRESSURE_RUNBOOK.md
docs/operations/SCALE_LIMITS.md
docs/operations/MULTI_INSTANCE_BOUNDARY.md
docs/operations/EXTERNALIZATION_READINESS.md
docs/operations/QUEUE_REMEDIATION_APPROVAL_RUNBOOK.md
docs/deployment/DEPLOYMENT_RUNBOOK.md
docs/incidents/INCIDENT_RUNBOOKS.md
docs/incidents/POSTMORTEM_TEMPLATE.md
```

Docs directories:

```text
docs/architecture/
docs/operations/
docs/design/
docs/governance/
docs/privacy/
docs/deployment/
docs/incidents/
docs/phases/
docs/phases/phase60/
docs/phases/phase61/
docs/phases/phase61-2/
```

Docs rules:

```text
Canonical docs should be linked from docs/README.md.
Docs reality classification should stay current in DOCS_REALITY_CHECK.md.
Phase docs must not imply runtime implementation unless code exists.
Externalization docs must remain advisory unless explicitly approved later.
```

---

## Governance / Privacy Map

Governance docs:

```text
docs/governance/ADMIN_RBAC_MODEL.md
docs/governance/DATA_GOVERNANCE_RUNBOOK.md
docs/governance/PRIVACY_REQUEST_RUNBOOK.md
```

Privacy docs:

```text
docs/privacy/PRIVACY_DATA_MAP.md
```

Governance services:

```text
server/services/adminRbac.js
server/services/adminApprovals.js
server/services/privacyRequests.js
server/services/userDataExport.js
server/services/userAnonymization.js
server/services/opsReviewRecords.js
server/services/postmortemRecords.js
server/services/incidentTimeline.js
```

Governance handlers:

```text
server/handlers/governanceHandler.js
server/handlers/productionOpsHandler.js
```

Governance source records:

```text
privacy_requests
ops/reviews
ops/postmortems
ops/admin-approvals
metrics/incidents
audit
```

Safety:

```text
Privacy anonymization requires approval.
Dangerous admin actions require RBAC/capability/approval flow.
Admin audit logging must remain intact.
PROJECT_MAP.md does not authorize privacy mutation.
```

---

## Phase 59 / 60 / 61 Advisory Map

Phase 59 map:

```text
storage pressure
scale thresholds
externalization readiness
multi-instance boundary
advisory-only
no implementation
```

Files:

```text
server/services/storagePressure.js
server/services/scaleThresholds.js
server/services/externalizationReadiness.js
server/handlers/storagePressureHandler.js
docs/operations/STORAGE_PRESSURE_RUNBOOK.md
docs/operations/SCALE_LIMITS.md
docs/operations/EXTERNALIZATION_READINESS.md
docs/operations/MULTI_INSTANCE_BOUNDARY.md
```

Phase 60 map:

```text
externalization decision
benchmark history
migration snapshot validation
migration rehearsal
rollback planning
advisory-only
no external DB
no external queue
no external search
```

Files:

```text
server/services/externalizationDecision.js
server/services/benchmarkHistory.js
server/services/migrationSnapshotValidation.js
server/handlers/externalizationDecisionHandler.js
docs/phases/phase60/
```

Phase 61 map:

```text
evidence cadence
rollback rehearsal
pilot gate
repository contracts
docs-only contracts
pilot blocked by default
runtime switch disabled
```

Files:

```text
server/services/phase61EvidenceCadence.js
server/services/pilotDecisionGate.js
server/services/rollbackRehearsal.js
server/services/repositoryContractReport.js
server/handlers/phase61Handler.js
docs/phases/phase61/
docs/phases/phase61-2/
```

Default posture:

```text
pilotAllowed=false
implementationAllowed=false
runtimeSwitchEnabled=false
docsOnly=true
```

Critical warning:

```text
PROJECT_MAP.md does not authorize externalization.
PROJECT_MAP.md does not authorize pilot.
PROJECT_MAP.md does not authorize runtime repository switching.
PROJECT_MAP.md does not authorize dual-write.
```

---

## Safe Review Workflow

Safe review starts with repository state:

```bash
git status --short
git log --oneline --decorate --graph -n 12
git branch -vv
```

Then read canonical docs:

```text
docs/README.md
docs/operations/DOCS_REALITY_CHECK.md
docs/operations/SCRIPTS_CATALOG.md
docs/architecture/PROJECT_MAP.md
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
```

Then inspect source files directly:

```text
server.js
server/router.js
config.js
server/middleware/
server/handlers/
server/services/
frontend/
scripts/
tests/
docs/
```

Review rules:

```text
Do not assume generated bundle content is current.
Do not patch generated bundles as source truth.
For operational remediation, collect read-only evidence first.
For queue work, inspect segmented queue source files before trusting summaries.
For index work, identify source records before rebuilding derived artifacts.
For privacy work, require governance approval and backup evidence.
```

---

## Safe Git / Bundle Workflow

Safe git check:

```bash
git status --short
git log --oneline --decorate --graph -n 12
git branch -vv
```

Docs/test patch workflow:

```bash
node --test --test-concurrency=1 tests/docs/*.test.js
```

Regression subset:

```bash
node --test --test-concurrency=1 \
  tests/scripts/repair-indexes-hardening.test.js \
  tests/scripts/cleanup-notification-flood-hardening.test.js \
  tests/scripts/repair-cleanup-higher-risk-reality.test.js \
  tests/scripts/scripts-governance-final-summary.test.js
```

Bundle refresh workflow if source/docs changes require review bundles:

```bash
node scripts/bundle-for-review.js
git status --short
```

Commit order:

```text
Commit docs/tests source changes first.
Then commit generated bundle refresh only if CODEBASE_PART*.md changed.
Do not manually edit generated bundles as source truth.
```

Push:

```bash
git push origin main
```

Forbidden:

```text
no git push --force
no git push --force-with-lease
```

---

## What Not To Do

Do not run:

```bash
node scripts/cleanup-notification-flood.js --confirm
node scripts/cleanup-notification-flood.js --confirm --json
node scripts/repair-indexes.js --confirm --json
node scripts/repair-queue.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/queue-retry-dlq.js --confirm --json
node scripts/recover-stale-running-jobs.js --confirm --json
node scripts/reset-dev-data.js
node scripts/reset-dev-data.js --confirm
node scripts/quarantine-corrupt-json.js --confirm --json
node scripts/anonymize-user-data.js --confirm
```

Do not use:

```bash
rm
rm -rf data
rm data/**/*.json
unlink
mv data
pkill node
killall node
kill -9
git push --force
git push --force-with-lease
```

Do not run without separate explicit approval:

```bash
pm2 restart yawmia
pm2 start yawmia
pm2 save
```

Do not do:

```text
no confirmed mutation
no queue-drain confirm
no repair-queue confirm without evidence/approval
no cleanup-notification-flood confirm
no repair-indexes confirm
no reset-dev-data
no destructive data movement
no external DB/queue/search as immediate solution
no dependencies
no version/cache change
no router refactor
no middleware refactor
no handler rewrite
no service rewrite
no auth weakening
no RBAC weakening
no EventBus refactor
no SSE fanout implementation
```

---

## Cross-Links

Canonical architecture docs:

```text
docs/architecture/PROJECT_MAP.md
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
docs/operations/STORAGE_PRESSURE_RUNBOOK.md
docs/operations/SCALE_LIMITS.md
docs/operations/MULTI_INSTANCE_BOUNDARY.md
docs/operations/EXTERNALIZATION_READINESS.md
docs/operations/QUEUE_REMEDIATION_APPROVAL_RUNBOOK.md
docs/operations/PM2_MANAGED_YAWMIA_QUEUE_WORKER_RUNBOOK.md
```

Canonical governance/privacy docs:

```text
docs/governance/ADMIN_RBAC_MODEL.md
docs/governance/DATA_GOVERNANCE_RUNBOOK.md
docs/governance/PRIVACY_REQUEST_RUNBOOK.md
docs/privacy/PRIVACY_DATA_MAP.md
```

Canonical runtime source files:

```text
config.js
server.js
server/router.js
server/middleware/
server/handlers/
server/services/
frontend/
scripts/
tests/
docs/
```

---

## Review / Testing Surface

Required docs tests:

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

Optional full suite:

```bash
npm test
```

Static docs coverage should verify:

```text
PROJECT_MAP.md exists.
PROJECT_MAP.md preserves v0.57.0 posture.
PROJECT_MAP.md preserves zero-framework posture.
PROJECT_MAP.md documents repo top-level map.
PROJECT_MAP.md documents source truth vs generated bundles.
PROJECT_MAP.md documents backend/frontend/scripts/tests/docs maps.
PROJECT_MAP.md links canonical catalogs.
Catalogs link PROJECT_MAP.md.
DOCS_REALITY_CHECK.md catalogs PROJECT_MAP.md as Canonical Reference.
docs/README.md links PROJECT_MAP.md.
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

PROJECT_MAP.md is documentation-only.

PROJECT_MAP.md is not runtime authority.

PROJECT_MAP.md does not authorize runtime changes.

PROJECT_MAP.md does not authorize source code refactors.

PROJECT_MAP.md does not authorize route refactors.

PROJECT_MAP.md does not authorize middleware changes.

PROJECT_MAP.md does not authorize handler rewrites.

PROJECT_MAP.md does not authorize service rewrites.

PROJECT_MAP.md does not authorize auth weakening.

PROJECT_MAP.md does not authorize admin capability weakening.

PROJECT_MAP.md does not authorize data mutation.

PROJECT_MAP.md does not authorize queue remediation.

PROJECT_MAP.md does not authorize scheduler changes.

PROJECT_MAP.md does not authorize PM2 restart/start/save.

PROJECT_MAP.md does not authorize confirmed script execution.

PROJECT_MAP.md does not implement externalization.
