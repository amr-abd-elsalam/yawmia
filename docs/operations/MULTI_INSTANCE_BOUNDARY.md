# يوميّة — Multi-Instance Boundary
> Phase 59 — Current Safe Boundary  
> Version target: v0.57.0

هذا الملف يوضح ما هو آمن وغير آمن في تشغيل يوميّة بأكثر من instance.

القاعدة الأساسية:

```text
Production writer = instance واحد فقط.
Read-only replicas مسموحة للقراءة فقط.
Multiple writers غير مدعوم في Phase 59.
```

---

## 1. Current supported modes

Configured via:

```bash
INSTANCE_MODE=single_writer
INSTANCE_MODE=read_only_replica
INSTANCE_MODE=experimental_multi_instance
```

Service:

```text
server/services/instanceMode.js
```

Guard:

```text
server/middleware/readOnlyReplica.js
```

---

## 2. single_writer rules

`single_writer` هو الوضع الطبيعي في production.

Allowed:

```text
write APIs
queue workers
scheduler runner
process locks
audit writes
admin write actions
privacy jobs
exports
backup restore drills
```

Required:

```text
only one writer process
no PM2 cluster
no multiple containers writing same data path
regular backups
restore drills
predeploy checks
```

---

## 3. read_only_replica rules

`read_only_replica` مناسب للقراءة فقط.

Allowed:

```text
GET public APIs
GET admin dashboards if admin auth valid
/api/health
/api/config
/api/docs
static frontend files
```

Blocked:

```text
POST
PUT
PATCH
DELETE
```

Queue workers and schedulers must not run.

---

## 4. experimental_multi_instance warning

`experimental_multi_instance` ليس production-safe.

It may be used only for development experiments.

Do not use it for:

```text
production traffic
queue workers
schedulers
payments
privacy jobs
audit writes
direct offer acceptance
application acceptance
```

---

## 5. APIs safe on read-only replica

Examples:

```text
GET /api/health
GET /api/config
GET /api/docs
GET /api/jobs
GET /api/jobs/:id
GET /api/users/:id/public-profile
GET /api/users/:id/ratings
GET /api/users/:id/rating-summary
GET /api/admin/production/readiness
GET /api/admin/scale-hygiene/overview
GET /api/admin/storage-pressure
GET /api/admin/externalization/readiness
```

Admin read APIs still require admin auth.

---

## 6. APIs unsafe on read-only replica

All writes are unsafe:

```text
POST /api/auth/send-otp
POST /api/auth/verify-otp
POST /api/jobs
POST /api/jobs/:id/apply
POST /api/jobs/:id/accept
POST /api/direct-offers
POST /api/direct-offers/:id/accept
POST /api/payments/:id/confirm
POST /api/reports
POST /api/workrooms/:id/messages
POST /api/admin/*
PUT /api/admin/*
DELETE /api/*
```

Even if a write looks small, it can affect indexes, audit, queue, notifications, or privacy workflows.

---

## 7. Queue worker restrictions

Queue workers are allowed only when:

```text
INSTANCE_MODE=single_writer
config.OPS_QUEUE.enabled=true
config.OPS_QUEUE.workerEnabled=true
instanceMode.canRunQueueWorkers() === true
```

Do not run queue workers on read-only replicas.

Do not run queue workers from multiple machines in Phase 59.

---

## 8. Scheduler restrictions

Scheduler runner is allowed only when:

```text
INSTANCE_MODE=single_writer
instanceMode.canRunSchedulers() === true
```

Schedulers enqueue jobs and update scheduler registry files.  
Therefore they are writer-only.

---

## 9. EventBus limitations

Current EventBus is in-memory:

```text
server/services/eventBus.js
```

Limitations:

```text
events do not cross process boundaries
events do not reach read-only replicas
cache invalidation is local
notification fanout is local
admin alerts are local
analytics event listeners are local
```

Phase 60+ needs event bridge/pub-sub before multi-instance writes.

---

## 10. Admin SSE limitations

Admin SSE is single-instance:

```text
GET /api/admin/events
```

If admin connects to a read-only replica, it will not receive writer instance events unless Phase 60+ adds SSE fanout.

---

## 11. Web Push / notification limitations

In-app notifications are file-backed and persist.  
But live delivery paths are per process:

```text
SSE connections
live feed
instant match modal
direct offer modal
admin SSE
```

Phase 60+ needs cross-instance fanout.

---

## 12. File locks limitations

Important:

```text
File-backed process locks are guardrails, not distributed consensus.
```

They do not provide:

```text
quorum
fencing tokens
network partition safety
cross-host consensus
multi-writer correctness
```

Use them to prevent accidental duplicate work in single-writer mode.  
Do not use them as a distributed lock system.

---

## 13. What Phase 60+ needs

Before true multi-instance/multi-writer:

```text
external database
external queue
event bridge/pub-sub
SSE fanout
distributed scheduler/leader election
distributed idempotency store
observability
migration/rollback plan
repository boundaries
```

---

## 14. What NOT to do

```text
Do not run PM2 cluster mode.
Do not run multiple writers.
Do not run node server.js multiple times against same writable data path.
Do not run multiple Kubernetes replicas as writers.
Do not run queue workers on read-only replicas.
Do not run schedulers on read-only replicas.
Do not treat file locks as distributed consensus.
Do not assume Admin SSE is multi-instance.
Do not assume EventBus crosses instances.
Do not use experimental_multi_instance in production.
```

---

## 15. Recommended production setup in Phase 59

```text
1 writer instance:
  INSTANCE_MODE=single_writer

0 or more read-only replicas:
  INSTANCE_MODE=read_only_replica

Shared writable disk:
  writer only

Read replicas:
  replicated/copy/snapshot data only, or read-only mounted data
```

If you cannot guarantee single writer, do not deploy Phase 59 in production until Phase 60+ externalization is implemented.
```

## Phase 61 — EventBridge and SSE Fanout Remain Pilot-Gated

Multi-instance production remains unsafe without:

```text
external database or equivalent transactional store
external queue
EventBus bridge
SSE fanout
distributed scheduler/leader election
rollback plan
```

Phase 61 only adds planning docs:

```text
PHASE61_EVENT_BRIDGE_PILOT_PLAN.md
PHASE61_SSE_FANOUT_PILOT_PLAN.md
```

No EventBus bridge or SSE fanout implementation is enabled by default.
