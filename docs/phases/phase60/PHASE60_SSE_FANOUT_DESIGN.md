# يوميّة — Phase 60 SSE Fanout Design

> Design only. No implementation by default.

## Current state

```text
User SSE is per process.
Admin SSE is per process.
Live feed is per process.
Direct offer modal delivery depends on local EventBus.
Instant match modal delivery depends on local EventBus.
```

## Required future fanout

Future multi-instance requires:

```text
pub/sub event fanout
connection registry or sticky sessions
safe replay for notification events
admin event fanout
live feed routing
direct offer modal fanout
instant match fanout
```

## Sticky sessions vs pub/sub

Sticky sessions are simpler but limited.

Pub/sub fanout is required if:

```text
multiple read replicas serve SSE
writer emits events to users connected elsewhere
admin dashboard connects to read replica
```

## Security

Current query token SSE auth should remain limited and reviewed.

Future:

```text
prefer short-lived SSE token
avoid ADMIN_TOKEN in URL when possible
avoid logging query tokens
```

## Phase 60 rule

No fanout implementation unless external event bridge is approved.
