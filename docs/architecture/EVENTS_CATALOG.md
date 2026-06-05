# Yawmia Events Catalog

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Patch: Patch 19 — Event Catalog Baseline  
> Scope: EventBus / events / fanout architecture inventory  
> Runtime posture: documentation-only  
> Source of truth posture: file-backed JSON source of truth  
> EventBus posture: in-memory, single-process  
> Externalization posture: advisory-only  
> Last reviewed: 2026-06-05

---

## Purpose

This catalog is the canonical EventBus/events/fanout architecture inventory reference for Yawmia.

It maps the current event architecture across:

```text
EventBus model
event emitters
event listeners
listener bootstrap order
fanout surfaces
SSE
Admin SSE
Live Feed SSE
Web Push
notifications
admin alerts
incidents
direct offer counters
analytics cache invalidation
queue visibility events
scheduler visibility events
governance/privacy workflow events
source-data-triggered events
derived-artifact-triggered events
event durability classes
risks and invariants
```

This document is documentation-only.

It does not authorize:

```text
runtime changes
EventBus refactors
SSE fanout implementation
Admin SSE fanout implementation
Live Feed fanout implementation
external pub/sub
external queue
scheduler changes
PM2 restart/start/save
queue remediation
confirmed script execution
index repair execution
notification quarantine execution
migration execution
data mutation
externalization
PostgreSQL
Redis
external search
new dependencies
version/cache changes
```

---

## Runtime Event Architecture Posture

Current Yawmia event architecture is:

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
Live Feed SSE
Web Push
file-backed JSON source of truth
in-memory EventBus
single-process EventBus
fire-and-forget listeners
derived artifact updates
single-writer discipline
zero new dependencies
```

Current Yawmia event architecture explicitly has:

```text
no external pub/sub
no external queue
no Redis
no PostgreSQL
no Kafka
no NATS
no RabbitMQ
no external search
no external DB
no cross-instance EventBus propagation
no cross-instance SSE fanout
no EventBus bridge implementation
no runtime repository switching
no dual-write
no cutover
no pilot by default
```

Phase 59 / Phase 60 / Phase 61 externalization systems are advisory/evidence only.

EVENTS_CATALOG.md does not authorize externalization.

---

## EventBus Model

Runtime source:

```text
server/services/eventBus.js
```

The current EventBus implementation contains:

```text
EventBus class
_listeners Map<string, Set<Function>>
on(event, callback)
off(event, callback)
once(event, callback)
emit(event, data)
clear()
singleton export eventBus
```

Behavior:

```text
emit(event, data) loops synchronously over registered callbacks.
listener errors are caught and logged to console.error.
async listeners usually start fire-and-forget async work internally.
EventBus events are not persisted.
EventBus events are not replayed across processes.
EventBus events do not cross instance boundaries.
EventBus is runtime glue, not source of truth.
```

Important warning:

```text
EventBus is in-memory and single-process.
EventBus does not provide durable delivery.
EventBus does not provide cross-process delivery.
EventBus does not provide distributed fanout.
EventBus does not replace source records.
EventBus does not replace queue files.
EventBus does not replace metrics artifacts.
No external pub/sub is implemented.
```

Source of truth remains:

```text
file-backed JSON source records
segmented queue files for queue jobs
durable scheduler records
governance records
notification records
direct_offers records
jobs/applications/payments/messages/attendance source records
```

Derived artifacts must remain rebuildable.

---

## Event Durability Classes

EventBus events themselves are not durable.

Durability comes from records or artifacts written by services.

Current durability classes:

| Class | Meaning | Durability Source |
|---|---|---|
| In-memory signal | Process-local runtime notification | None |
| Source-data lifecycle event | Emitted after source record mutation | Source JSON record |
| Derived artifact update event | Emitted around rebuild/rollup/compaction | Derived artifact or source records |
| Notification fanout event | Creates or broadcasts notification state | `notifications` source records where written |
| SSE/Admin SSE fanout event | Pushes to connected EventSource clients | Best-effort in-memory connection |
| Web Push fanout event | Pushes to browser subscription endpoint | Best-effort; `push_subscriptions` are source records |
| Cache invalidation event | Clears in-memory analytics/cache state | Cache is not durable |
| Ops evidence event | Captures operational evidence | Metrics/evidence artifact when persisted |
| Incident trigger event | Opens/appends incident timeline | `incidents` source/evidence record |
| Admin alert routing event | Delivers or queues alert delivery | Durable only if alert delivery history + ops queue enabled |
| Queue visibility event | Signals queue transition | Queue segmented files are source of truth |
| Governance workflow event | Signals approvals/privacy/reviews/postmortems | Governance source records |

Rules:

```text
EventBus events are not durable.
Queue jobs are durable because queue files are source records.
Notifications are durable because notification records are written.
Counters are derived and rebuildable from direct_offers.
SSE delivery is best-effort.
Admin SSE delivery is best-effort.
Live Feed SSE delivery is best-effort.
Web Push delivery is best-effort.
Admin alerts can become durable if alert delivery history + ops queue are enabled.
```

---

## Listener Bootstrap Order

Listener bootstrap is order-sensitive and currently happens from `server/router.js`.

Current observed order:

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

Important bootstrap files:

```text
server/router.js
server/services/notifications.js
server/services/adMatcher.js
server/services/workerDiscovery.js
server/services/jobMatcher.js
server/services/jobAlerts.js
server/services/instantMatch.js
server/services/liveFeed.js
server/services/directOffer.js
server/services/directOfferCounters.js
server/services/cacheDebouncer.js
```

Ordering invariants:

```text
router.js module import has side effects through listener registration.
Listener order matters.
setupAdMatchListeners() runs before setupJobMatching().
adMatcher runs before jobMatcher so jobMatcher can dedupe workers already notified by adMatcher.
Direct offer counter listeners are registered before analytics cache invalidation.
Some listeners are config-gated.
Some service modules self-register listeners at import time.
Tests can duplicate listeners if modules are imported with cache-busting unless guarded.
```

---

## Core Event Flow Principles

Core rules:

```text
EventBus is runtime glue, not source of truth.
Source JSON files remain source of truth.
Derived artifacts must be rebuildable.
EventBus listeners must not be assumed durable.
Fanout is best-effort unless a source record or queue job is written.
Fire-and-forget listeners must tolerate failure.
Listener order must not be changed casually.
Event absence is not proof that no source mutation happened.
```

Queue-specific rules:

```text
Queue source state is represented by segmented queue files, not EventBus events.
EventBus queue events are visibility/side-effect signals.
Do not use EventBus event absence as proof that no queue mutation happened.
Do not use queue summary/location indexes as source of truth when QUEUE_SUMMARY_MISMATCH exists.
Actual segmented queue files are source of truth.
Do not run queue-drain --confirm as remediation.
```

---

## Auth / Session Events

Primary emitters:

```text
server/services/auth.js
server/services/users.js
server/services/sessions.js
```

Events:

```text
otp:sent
user:created
session:created
```

Typical meaning:

| Event | Emitter | Meaning |
|---|---|---|
| `otp:sent` | `server/services/auth.js` | OTP record saved and messaging attempted |
| `user:created` | `server/services/auth.js` / `users.js` path | new user created after OTP verification |
| `session:created` | `server/services/auth.js` | bearer session created |

Durability:

```text
otp:sent is not durable as event; OTP file is source until expiry.
user:created is not durable as event; users record is source.
session:created is not durable as event; session record is source.
```

Side effects:

```text
activation metrics may consume user lifecycle signals.
notification systems may indirectly react to user/session lifecycle in future.
```

---

## User / Profile Events

Primary files:

```text
server/services/users.js
server/services/profileTasks.js
server/services/activationFunnelMetrics.js
server/handlers/profileTasksHandler.js
```

Events:

```text
profile_task:shown
profile_task:clicked
profile_task:completed
profile_task:clicked_recorded
activation:first_application
activation:first_job_posted
activation:first_accepted
activation:first_checkin
activation:first_payment
activation:first_rating
verification_reviewed
```

Side effects:

```text
activation funnel metrics
product intelligence artifacts
admin/product dashboards
notification conversion context
```

Durability:

```text
Profile task events are not durable.
Persisted activation funnel files in metrics/product-intelligence are derived evidence artifacts.
User profile source data remains in users records.
```

---

## Job Events

Primary emitter:

```text
server/services/jobs.js
```

Events:

```text
job:created
job:filled
job:started
job:completed
job:cancelled
job:renewed
job:expiry_warning
```

Key listeners and side effects:

| Event | Important listeners / effects |
|---|---|
| `job:created` | notifications, adMatcher, jobMatcher, jobAlerts, liveFeed, instant match path |
| `job:filled` | notifications, liveFeed job_updated |
| `job:started` | notifications, liveFeed job_updated, workroom timeline |
| `job:completed` | notifications, payment creation, liveFeed job_updated, workroom timeline |
| `job:cancelled` | notifications, liveFeed job_updated |
| `job:renewed` | notifications |
| `job:expiry_warning` | notifications for employer/pending workers |

Related files:

```text
server/services/jobs.js
server/services/jobMatcher.js
server/services/adMatcher.js
server/services/jobAlerts.js
server/services/liveFeed.js
server/services/notifications.js
server/services/instantMatch.js
server/services/payments.js
server/services/workroom.js
```

Durability:

```text
job source record is durable.
EventBus job events are not durable.
Derived notifications become durable only after notification records are written.
Live Feed SSE updates are best-effort.
```

---

## Application Events

Primary emitter:

```text
server/services/applications.js
```

Events:

```text
application:submitted
application:accepted
application:rejected
application:withdrawn
application:worker_confirmed
application:worker_declined
```

Side effects:

```text
notifications
job:filled emission when accepted count fills job
activation metrics
workroom eligibility
attendance eligibility
rating eligibility
```

Related files:

```text
server/services/applications.js
server/services/applicationStatus.js
server/services/notifications.js
server/services/workroom.js
server/services/attendance.js
```

Durability:

```text
application records are source.
application events are not durable.
accepted-equivalent semantics are computed by applicationStatus.js.
```

---

## Attendance Events

Primary emitter:

```text
server/services/attendance.js
```

Events:

```text
attendance:checkin
attendance:checkout
attendance:confirmed
attendance:noshow
```

Side effects:

```text
notifications
trust scoring inputs
workroom timeline
analytics
activation metrics
Web Push for attendance_noshow if configured
```

Durability:

```text
attendance records are source.
attendance events are best-effort process-local signals.
```

---

## Payment Events

Primary emitter:

```text
server/services/payments.js
```

Events:

```text
payment:created
payment:confirmed
payment:completed
payment:disputed
```

Side effects:

```text
notifications
workroom summary
payment dispute analytics
marketplace intelligence cache invalidation
activation:first_payment
```

Related files:

```text
server/services/payments.js
server/services/paymentDisputeAnalytics.js
server/services/notifications.js
server/services/marketplaceIntelligenceRollups.js
server/services/workroom.js
```

Durability:

```text
payment records are source.
payment dispute analytics are derived evidence artifacts.
```

---

## Report / Abuse Events

Primary files:

```text
server/services/reports.js
server/services/abuseFlagReview.js
server/services/offerAbuseDetector.js
server/services/scheduledAbuseDetection.js
server/services/trustAnalytics.js
```

Events:

```text
report:created
report:reviewed
report:autoban
abuse_flag:state_changed
abuse_flag:detected_high_severity
abuse_flag:snooze_expiring
abuse_flag:snooze_expired
direct_offer:abuse_threshold_crossed
```

Side effects:

```text
notifications
trust analytics cache invalidation
admin SSE
admin alert routing
decision quality analytics
incident timeline for selected critical paths
```

Durability:

```text
reports and abuse_flag_reviews are source records.
detected abuse events are not durable.
admin review state is durable when written to abuse_flag_reviews.
```

---

## Notification Events

Primary files:

```text
server/services/notifications.js
server/services/notificationActions.js
server/services/notificationConversionMetrics.js
server/services/sseManager.js
server/services/eventReplayBuffer.js
```

Events:

```text
notification:created
notification:action_clicked
notification:action_click_recorded
notification:conversion_recorded
notification:conversion_metric_recorded
```

Side effects:

```text
notification:created -> sendToUser(userId, 'notification', notification, id)
notification:created -> eventReplayBuffer in SSE manager flow
notification action clicks -> notification conversion metrics
notification conversion metrics -> marketplace intelligence cache invalidation
```

Durability:

```text
notifications source records are durable.
notification:created event is not durable.
SSE notification delivery is best-effort.
eventReplayBuffer is in-memory.
```

---

## Message / Workroom Events

Primary files:

```text
server/services/messages.js
server/services/workroom.js
server/services/workroomSearch.js
server/services/workroomReceipts.js
server/services/workroomPins.js
server/services/workroomChecklist.js
server/services/workroomAttachments.js
server/services/workroomHygiene.js
server/services/workroomAdoptionMetrics.js
server/services/workroomTemplateMetrics.js
server/handlers/workroomHandler.js
```

Events:

```text
message:created
message:broadcast
workroom:opened
workroom:message_sent
workroom:timeline_viewed
workroom:message_pinned
workroom:checklist_item_created
workroom:checklist_item_completed
workroom:attachment_uploaded
workroom:template_used
workroom_hygiene:inspection_completed
workroom_hygiene:compaction_completed
workroom_hygiene:attachment_cleanup_completed
workroom_hygiene:warning_detected
workroom_search:verified
workroom_search:repair_completed
```

Side effects:

```text
notifications
SSE workroom_message
workroom search indexing
admin SSE
marketplace intelligence
workroom adoption metrics
workroom template metrics
```

Durability:

```text
messages/workroom sidecars are source records.
workroom search indexes are derived/rebuildable.
workroom hygiene metrics are evidence artifacts.
workroom events are process-local signals.
```

---

## Availability Ad Events

Primary files:

```text
server/services/availabilityAd.js
server/services/adMatcher.js
server/services/workerDiscovery.js
```

Events:

```text
ad:created
ad:expired
ad:withdrawn
ad:matched
ad:job_match
```

Side effects:

```text
worker discovery cache invalidation
adMatcher notification dedup
job matching dedup
direct offer linkage
notifications
push delivery in adMatcher
```

Durability:

```text
availability_ads source records are durable.
ad events are not durable.
worker discovery cache is derived/in-memory.
```

---

## Direct Offer Events

Primary files:

```text
server/services/directOffer.js
server/services/directOfferCounters.js
server/services/directOfferAnalytics.js
server/services/cacheDebouncer.js
server/services/liveFeed.js
server/services/adminAlertChannels.js
server/services/offerAbuseDetector.js
```

Events:

```text
direct_offer:created
direct_offer:accepted
direct_offer:declined
direct_offer:expired
direct_offer:withdrawn
direct_offer:abuse_threshold_crossed
```

Side effects:

```text
live feed direct_offer_received
live feed direct_offer_status
directOfferCounters.applyEventBatched
analytics cache invalidation
admin direct offer dashboard
abuse detection
admin SSE
admin alert routing
synthetic job creation on accept
application:accepted through direct offer acceptance
ad matched reconciliation
```

Counter listener events:

```text
direct_offer:created
direct_offer:accepted
direct_offer:declined
direct_offer:expired
direct_offer:withdrawn
```

Counter listener behavior:

```text
directOfferCounters.applyEventBatched()
directOfferCounters.forceFlush on graceful shutdown
counter file is derived/rebuildable
direct_offers source records are source of truth
```

Analytics invalidation:

```text
config.ANALYTICS.cacheInvalidationEvents
debouncedClear
clearAnalyticsCache
clearDirectOfferAnalyticsCache
cacheDebouncer.flushPending on shutdown
```

Durability:

```text
direct_offers records are source.
direct offer counters are derived.
analytics caches are in-memory derived state.
live feed/direct offer SSE is best-effort.
```

---

## Instant Match / Presence Events

Primary files:

```text
server/services/presenceService.js
server/services/instantMatch.js
server/services/liveFeed.js
server/handlers/liveFeedHandler.js
```

Events:

```text
instant_match:candidates
instant_match:accepted
instant_match:expired
```

Side effects:

```text
Live Feed SSE instant_match_offer
Web Push to candidates
notify other candidates when taken/expired
application:accepted from instant accept
job status update through application/job services
```

Presence note:

```text
presence map is in-memory.
presence is not durable.
presence does not cross instance boundaries.
```

Durability:

```text
instant_matches records are source.
presence state is in-memory only.
instant match SSE/Web Push is best-effort.
```

---

## Search / Analytics Events

Primary files:

```text
server/services/searchAnalytics.js
server/services/activationFunnelMetrics.js
server/services/notificationConversionMetrics.js
server/services/workroomAdoptionMetrics.js
server/services/paymentDisputeAnalytics.js
server/services/marketplaceIntelligenceRollups.js
server/services/jobs.js
```

Events:

```text
search:performed
search:zero_results
search:result_clicked_recorded
search:conversion_recorded
marketplace_intelligence:rollup_captured
search_analytics:rollup_completed
activation_funnel:rollup_completed
workroom_adoption:rollup_completed
payment_dispute_analytics:rollup_completed
```

Side effects:

```text
product intelligence metrics
admin SSE
metrics artifacts
cache invalidation
marketplace intelligence dashboard
```

Durability:

```text
search events are not durable.
analytics rollup artifacts are derived evidence.
raw source records remain source of truth.
search query storage should remain hashed by default.
```

---

## Trust / Predictive Events

Primary files:

```text
server/services/trustAnalytics.js
server/services/adminDecisionAnalytics.js
server/services/predictiveAbuse.js
server/services/predictiveSignalRetention.js
server/services/abuseFlagReview.js
```

Events:

```text
abuse_flag:state_changed
abuse_flag:detected_high_severity
abuse_flag:snooze_expiring
abuse_flag:snooze_expired
predictive_abuse:signal_created
predictive_abuse:signal_updated
predictive_abuse:signal_escalated
predictive_abuse:scan_failed
predictive_signal:false_positive
predictive_signal:confirmed
```

Side effects:

```text
admin SSE
admin alerts
incident timeline
trust analytics cache invalidation
decision quality analytics
predictive precision metrics
marketplace intelligence
```

Durability:

```text
abuse_flag_reviews and predictive_signals records are source.
predictive archive indexes are derived.
predictive events must not trigger auto-ban.
```

Safety invariant:

```text
No punitive automation.
No auto-ban from predictive signals.
Human-in-the-loop remains mandatory.
```

---

## Queue Events

Primary files:

```text
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/queueStorageIndex.js
server/services/queueHealthVerify.js
server/services/queueCompaction.js
server/services/metricsRollups.js
server/handlers/queueHandler.js
```

Events:

```text
ops_queue:job_created
ops_queue:job_running
ops_queue:job_completed
ops_queue:job_failed
ops_queue:job_dead_lettered
ops_queue:summary_updated
ops_queue:record_moved
ops_queue:legacy_record_detected
queue:health_verified
queue:repair_completed
queue:compaction_started
queue:compaction_completed
queue:compaction_failed
queue:summary_rebuilt
queue:idempotency_cleanup_completed
queue:slow_jobs_detected
```

Side effects:

```text
Admin SSE
incident timeline for dead-letter
ops rollups
monitoring visibility
admin queue dashboard
scale hygiene dashboard
```

Durability:

```text
Queue events are visibility signals.
Segmented queue files are source of truth.
Queue summary/location indexes are derived.
Queue events are not durable proof.
```

Critical warning:

```text
Do not use EventBus event absence as proof that no queue mutation happened.
Do not use queue summary/location indexes as source of truth when QUEUE_SUMMARY_MISMATCH exists.
Actual segmented queue files are source of truth.
Do not run queue-drain --confirm as remediation.
```

---

## Scheduler Events

Primary files:

```text
server/services/schedulerRegistry.js
server/services/schedulerRunHistory.js
server/services/metricsRollups.js
server/handlers/productionOpsHandler.js
```

Events:

```text
scheduler:job_queued
scheduler:job_failed
scheduler:stale
scheduler:run_history_recorded
scheduler:history_cleanup_completed
```

Side effects:

```text
Admin SSE
incident timeline
ops rollups
scheduler cadence reporting
admin scheduler dashboard
```

Durability:

```text
scheduler records and scheduler history records are file-backed.
scheduler events are visibility signals.
```

Warning:

```text
EVENTS_CATALOG.md does not authorize scheduler changes.
read_only_replica must not run schedulers.
```

---

## Monitoring / Incident / Alert Events

Primary files:

```text
server/services/monitor.js
server/services/metricsRollups.js
server/services/incidentTimeline.js
server/services/adminAlertChannels.js
server/services/alertDeliveryHistory.js
server/services/backupRestoreDrill.js
server/services/processLock.js
server/services/maintenanceMode.js
server/services/auditLogRetention.js
server/services/directOfferCounters.js
```

Events:

```text
ops_rollup:captured
ops_slo:violated
incident:opened
incident:event_appended
incident:resolved
backup_restore_drill:started
backup_restore_drill:passed
backup_restore_drill:failed
process_lock:stale_recovered
process_lock:acquire_failed
maintenance:enabled
maintenance:disabled
counters:auto_rebuild_triggered
counters:file_size_critical
audit_retention:cleanup_failed_threshold
alert_delivery:created
alert_delivery:running
alert_delivery:delivered
alert_delivery:failed
alert_delivery:dead_lettered
```

Side effects:

```text
Admin SSE
admin alert routing
incident auto-open
ops dashboards
queue alert delivery jobs
monitoring threshold visibility
```

Admin alert routed events include:

```text
abuse_flag:detected_high_severity
direct_offer:abuse_threshold_crossed
counters:auto_rebuild_triggered
audit_retention:cleanup_failed_threshold
counters:file_size_critical
```

Incident auto-open events include:

```text
counters:file_size_critical
counters:auto_rebuild_triggered
ops_queue:job_dead_lettered
alert_delivery:dead_lettered
predictive_abuse:scan_failed
backup_restore_drill:failed
ops_slo:violated
scheduler:stale
```

Durability:

```text
incidents are durable when written.
alert delivery is durable only when alertDeliveryHistory + opsQueue are used.
monitoring snapshots and ops rollups are evidence artifacts.
EventBus events remain non-durable.
```

---

## Governance / Privacy / Approval Events

Primary files:

```text
server/services/adminApprovals.js
server/services/privacyRequests.js
server/services/opsReviewRecords.js
server/services/postmortemRecords.js
server/handlers/governanceHandler.js
```

Events:

```text
admin_approval:created
admin_approval:approved
admin_approval:rejected
admin_approval:expired
admin_approval:consumed
privacy_request:created
privacy_request:queued
privacy_request:completed
privacy_request:failed
privacy_request:cancelled
ops_review:created
ops_review:completed
postmortem:created
postmortem:updated
postmortem:action_item_added
postmortem:action_item_updated
```

Side effects:

```text
Admin SSE
governance dashboards
audit logs
privacy workflows
queue jobs
postmortem governance visibility
```

Durability:

```text
admin approval records are source.
privacy request records are source.
ops review records are source.
postmortem records are source.
governance events are non-durable visibility signals.
```

Safety:

```text
Privacy anonymization requires approval.
Dangerous admin actions require configured RBAC/capability/approval flow.
EVENTS_CATALOG.md does not authorize privacy mutation.
```

---

## SSE Fanout Mapping

Notification SSE route:

```text
GET /api/notifications/stream
```

Files:

```text
server/handlers/sseHandler.js
server/services/sseManager.js
server/services/eventReplayBuffer.js
server/services/notifications.js
```

Flow:

```text
client EventSource connects with bearer token or token query
sseHandler verifies session
sseManager.addConnection registers user connection
init event sends unread count
notification:created -> sendToUser(userId, 'notification', notification, id)
workroom_message event delivery through SSE manager
eventReplayBuffer stores recent events in memory
Last-Event-Id can replay in-memory buffered events
```

Warnings:

```text
SSE fanout is single-process.
SSE replay buffer is in-memory.
SSE delivery is best-effort.
No cross-instance SSE fanout exists.
No external pub/sub exists.
```

---

## Live Feed Fanout Mapping

Live Feed SSE route:

```text
GET /api/jobs/live-feed
```

Files:

```text
server/handlers/liveFeedHandler.js
server/services/liveFeed.js
server/services/instantMatch.js
server/services/directOffer.js
```

Flow:

```text
worker EventSource connects with bearer token or token query
liveFeed.registerConnection stores connection in memory
initial nearby jobs dump is sent
job:created -> job_created
job:filled -> job_updated
job:cancelled -> job_updated
job:started -> job_updated
job:completed -> job_updated
instant_match:candidates -> instant_match_offer
instant_match:accepted -> instant_match_taken
instant_match:expired -> instant_match_taken
direct_offer:created -> direct_offer_received
direct_offer:accepted -> direct_offer_status
direct_offer:declined -> direct_offer_status
direct_offer:expired -> direct_offer_status
```

Warnings:

```text
Live Feed SSE is single-process.
Live Feed connection map is in-memory.
No cross-instance Live Feed fanout exists.
No external pub/sub exists.
```

---

## Admin SSE Fanout Mapping

Admin SSE route:

```text
GET /api/admin/events
```

File:

```text
server/handlers/adminSseHandler.js
```

Model:

```text
SUBSCRIBED_EVENTS list defines admin event fanout.
Listeners are registered lazily on first admin connection.
adminConnections is an in-memory Map.
heartbeat every 30 seconds.
broadcastToAdmins writes SSE events to connected admins.
```

Representative SUBSCRIBED_EVENTS:

```text
abuse_flag:snooze_expiring
abuse_flag:snooze_expired
abuse_flag:detected_high_severity
direct_offer:abuse_threshold_crossed
counters:auto_rebuild_triggered
csv_export:progress
predictive_abuse:signal_created
predictive_abuse:signal_escalated
predictive_abuse:scan_failed
ops_queue:job_failed
ops_queue:job_dead_lettered
alert_delivery:failed
alert_delivery:dead_lettered
export:job_completed
export:job_failed
ops_rollup:captured
ops_slo:violated
incident:opened
incident:event_appended
incident:resolved
backup_restore_drill:started
backup_restore_drill:passed
backup_restore_drill:failed
process_lock:stale_recovered
process_lock:acquire_failed
scheduler:job_failed
scheduler:job_queued
maintenance:enabled
maintenance:disabled
admin_approval:created
admin_approval:approved
admin_approval:rejected
admin_approval:expired
admin_approval:consumed
privacy_request:created
privacy_request:queued
privacy_request:completed
privacy_request:failed
privacy_request:cancelled
ops_review:created
ops_review:completed
postmortem:created
postmortem:updated
postmortem:action_item_added
postmortem:action_item_updated
```

Warnings:

```text
Admin SSE is single-process.
Admin SSE is not durable.
No cross-instance Admin SSE fanout exists.
No external pub/sub exists.
```

---

## Web Push Mapping

Primary file:

```text
server/services/webpush.js
```

Related data:

```text
push_subscriptions
push_subscriptions/user-index.json
```

Known Web Push usage:

```text
instant_match:candidates can send push to candidate workers.
adMatcher may send push to matching workers.
notifications may trigger push depending service path and config.
```

Config:

```text
config.WEB_PUSH.enabled
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

Warnings:

```text
Web Push is best-effort.
Web Push delivery is not event durability.
Push subscriptions are source records.
Missing VAPID keys in production is readiness failure when Web Push is enabled.
```

---

## Counter / Derived Artifact Events

Direct offer counters:

```text
server/services/directOfferCounters.js
server/services/counterCompaction.js
server/router.js
```

Counter listener events:

```text
direct_offer:created
direct_offer:accepted
direct_offer:declined
direct_offer:expired
direct_offer:withdrawn
```

Behavior:

```text
eventBus.on(eventName, ...)
directOfferCounters.applyEventBatched(eventType, data)
batch flush writes metrics/direct-offer-counters.json
directOfferCounters.forceFlush on shutdown
counter file is derived/rebuildable
direct_offers source records are source of truth
```

Counter related events:

```text
counters:auto_rebuild_triggered
counters:file_size_critical
counters:rebuild_completed
counters:compaction_started
counters:compaction_completed
counters:compaction_failed
```

Safety:

```text
Counter drift is recovered by rebuild from direct_offers.
Counter file is not source of truth.
EVENTS_CATALOG.md does not authorize rebuild/compact execution.
```

---

## Cache Invalidation Events

Primary files:

```text
server/router.js
server/services/cacheDebouncer.js
server/services/analytics.js
server/services/directOfferAnalytics.js
```

Config:

```text
config.ANALYTICS.cacheInvalidationEnabled
config.ANALYTICS.cacheInvalidationEvents
```

Default invalidation events:

```text
direct_offer:created
direct_offer:accepted
direct_offer:declined
direct_offer:expired
direct_offer:withdrawn
```

Behavior:

```text
debouncedClear
clearAnalyticsCache
clearDirectOfferAnalyticsCache
cacheDebouncer.flushPending on shutdown
```

Warnings:

```text
Analytics caches are derived in-memory state.
Cache invalidation events are not durable.
TTL provides fallback freshness.
flushPending is best-effort on shutdown.
```

---

## Event Risks and Invariants

Key invariants:

```text
EventBus is in-memory and single-process.
EventBus events are not durable.
EventBus events are not replayed across processes.
EventBus does not cross instance boundaries.
SSE/Admin SSE/Live Feed fanout is single-instance.
Read-only replicas do not receive EventBus events from the writer.
No external pub/sub is implemented.
No EventBus bridge is implemented.
No SSE fanout service is implemented.
No external queue is implemented.
No runtime repository switching is implemented.
Listener bootstrap order matters.
adMatcher must run before jobMatcher for dedup.
Direct offer counter listeners must run before analytics cache invalidation listeners.
Source JSON files remain source of truth.
Derived artifacts must be rebuildable.
```

Queue invariants:

```text
Queue source state is segmented queue files.
Queue summary/location indexes are derived.
QUEUE_SUMMARY_MISMATCH means derived queue artifacts are untrusted.
Actual segmented queue files are source of truth.
Do not run queue-drain --confirm as remediation.
```

Operational risks:

```text
duplicate listeners in unusual test imports
lost in-memory events on process crash
SSE best-effort delivery
Web Push endpoint failures
counter drift
analytics stale cache
incident event missed if listener not registered
admin alert event rate limiting
read_only_replica no writer EventBus propagation
multi-instance requires future event bridge and SSE fanout design
```

---

## Review / Testing Surface

Relevant static docs tests:

```text
tests/docs/events-catalog-static.test.js
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

Recommended verification:

```bash
node --test --test-concurrency=1 tests/docs/*.test.js
```

Additional regression subset:

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
ROUTES_CATALOG.md maps route entrypoints that trigger source mutations, derived artifact updates, and EventBus emissions through handlers/services.
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
server/services/eventBus.js
server/services/notifications.js
server/services/liveFeed.js
server/handlers/adminSseHandler.js
server/services/adminAlertChannels.js
server/services/incidentTimeline.js
server/services/directOfferCounters.js
server/services/cacheDebouncer.js
server/services/jobMatcher.js
server/services/adMatcher.js
server/services/jobAlerts.js
server/services/directOffer.js
server/services/instantMatch.js
server/services/workroom.js
server/services/messages.js
server/services/opsQueue.js
server/services/queueWorkers.js
server/services/schedulerRegistry.js
server/services/monitor.js
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

EVENTS_CATALOG.md is documentation-only.

EVENTS_CATALOG.md does not authorize runtime changes.

EVENTS_CATALOG.md does not authorize EventBus refactors.

EVENTS_CATALOG.md does not authorize SSE fanout implementation.

EVENTS_CATALOG.md does not authorize external pub/sub.

EVENTS_CATALOG.md does not authorize data mutation.

EVENTS_CATALOG.md does not authorize queue remediation.

EVENTS_CATALOG.md does not authorize scheduler changes.

EVENTS_CATALOG.md does not authorize PM2 restart/start/save.

EVENTS_CATALOG.md does not authorize confirmed script execution.

EVENTS_CATALOG.md does not implement externalization.
