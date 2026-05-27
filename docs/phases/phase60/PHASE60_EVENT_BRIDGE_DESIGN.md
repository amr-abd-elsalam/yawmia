# يوميّة — Phase 60 EventBus Bridge Design

> Design only. No implementation in Phase 60.

## Current limitation

`eventBus.js` is in-memory and per-process.

This affects:

```text
cache invalidation
notifications
admin alerts
direct offer live events
instant match events
scheduler events
queue events
admin SSE
```

## Future bridge requirements

A future bridge must support:

```text
at-least-once delivery for operational events
best-effort allowed for low-priority UI hints
idempotent consumers
event type allowlist
PII-safe payloads
retry/dead-letter for critical operational events
metrics
admin visibility
```

## Event categories

| Category | Semantics |
|---|---|
| notification | at-least-once if user-facing critical |
| cache invalidation | at-least-once |
| admin alerts | at-least-once |
| analytics | best-effort acceptable |
| queue/scheduler | at-least-once |
| SSE fanout | best-effort + replay where possible |

## Security

```text
Do not publish secrets.
Do not publish raw session tokens.
Do not publish raw identity images.
Redact phone numbers unless already revealed by workflow.
```

## Phase 60 rule

```text
Do not implement bridge unless evidence + approval exists.
```
