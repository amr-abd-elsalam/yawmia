# Phase 61.2 — EventBus Bridge Pilot Plan

> Status: planning only  
> Implementation: not justified now  
> Current EventBus: in-memory single-process

---

## 1. Current State

Yawmia currently uses an in-memory EventBus.

This is acceptable for:

```text
single-writer production
single process event fanout
fire-and-forget internal listeners
Admin SSE on one instance
User SSE on one instance
```

---

## 2. Known Limitations

In-memory EventBus does not provide:

```text
cross-instance delivery
durable event storage
distributed ordering
multi-writer coordination
replay after process crash
global SSE fanout
```

---

## 3. Phase 61.2 Decision

Implementation is not justified now.

Reason:

```text
No approved multi-instance pilot.
No external queue.
No event bridge dependency.
No evidence that EventBus is production blocker.
```

---

## 4. When to Reconsider

Reconsider EventBus bridge only if:

```text
read-only replicas are actively used
multi-instance pilot is approved
SSE consistency becomes production blocker
queue/event operations require cross-instance coordination
external queue decision is approved
```

---

## 5. Future Requirements

A future bridge must provide:

```text
at-least-once delivery or documented weaker semantics
idempotent listener behavior
bounded retries
dead-letter or failure visibility
no PII leakage in event payloads
admin observability
rollback plan
```

---

## 6. Non-goals Now

Phase 61.2 does not implement:

```text
Redis pub/sub
Kafka
NATS
RabbitMQ
external queue
distributed event bridge
durable event stream
```
