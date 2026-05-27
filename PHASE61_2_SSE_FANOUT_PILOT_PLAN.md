# Phase 61.2 — SSE Fanout Pilot Plan

> Status: planning only  
> Implementation: not justified now  
> Current SSE: per-process

---

## 1. Current State

Yawmia currently supports:

```text
User notification SSE
Live feed SSE
Admin SSE
```

Connections are in-memory per process.

This is acceptable for:

```text
single-writer deployment
single instance
read-only replica without write-side SSE guarantees
```

---

## 2. Known Limitations

Current SSE does not provide:

```text
cross-instance fanout
shared connection registry
global admin event delivery
global live-feed delivery
multi-instance user notification routing
```

---

## 3. Phase 61.2 Decision

Do not implement SSE fanout now.

Reason:

```text
No approved multi-instance pilot.
No EventBus bridge.
No external pub/sub.
No evidence that SSE fanout is a production blocker.
```

---

## 4. When to Reconsider

Reconsider only when:

```text
multi-instance pilot is approved
read-only replicas serve user traffic
sticky routing is insufficient
Admin SSE must receive events from multiple writers
external pub/sub is approved
```

---

## 5. Future Requirements

A future SSE fanout must define:

```text
connection ownership
user routing
admin event routing
heartbeat behavior
reconnect behavior
Last-Event-ID semantics
privacy filtering
backpressure behavior
failure handling
rollback strategy
```

---

## 6. Non-goals Now

Phase 61.2 does not implement:

```text
SSE fanout
Redis
pub/sub
multi-writer routing
distributed connection registry
```
