# يوميّة — Phase 61 EventBus Bridge Pilot Plan

> Design-only unless pilot gate passes.  
> Version: v0.57.0

---

## 1. Current EventBus limitation

Current `eventBus.js` is in-memory:

```text
single process
no durable event log
no cross-instance fanout
best-effort listeners
```

This is safe for single-writer deployment only.

---

## 2. Events requiring at-least-once in a future bridge

```text
payment:created
payment:disputed
direct_offer:accepted
ops_queue:job_dead_lettered
privacy_request:queued
admin_approval:approved
audit:logged
incident:opened
```

---

## 3. Events that can remain best-effort

```text
toast-like UI hints
presence updates
live dashboard refresh hints
cache invalidation with TTL fallback
```

---

## 4. Idempotency requirements

Any bridged event must include:

```text
eventId
eventType
entityId
createdAt
idempotencyKey
schemaVersion
```

Consumers must be retry-safe.

---

## 5. PII-safe payload requirements

Do not send:

```text
phone
raw message text when unnecessary
tokens
secrets
identity images
raw base64
```

Use IDs and admin-only lookup where needed.

---

## 6. Admin visibility

Future bridge must expose:

```text
delivery count
failed delivery count
dead-letter count
oldest pending event
replay status
```

---

## 7. Why bridge is prerequisite to multi-instance

Without bridge:

```text
admin SSE misses events across instances
direct offer modals may not deliver
instant match candidates may miss offers
cache invalidation becomes local only
```

---

## 8. No implementation unless pilot gate passes

Phase 61 does not implement bridge.

Before implementation:

```text
pilot gate passed
rollback rehearsal passed
approval exists
bounded candidate selected
```
