# يوميّة — Phase 61 SSE Fanout Pilot Plan

> Design-only unless pilot gate passes.  
> Version: v0.57.0

---

## 1. Current SSE limitation

Current SSE connections are in-memory per process.

This affects:

```text
/api/notifications/stream
/api/admin/events
/api/jobs/live-feed
direct offer modal
instant match modal
```

---

## 2. User notification stream

Current behavior:

```text
server process holds user connections
notification:created sends locally
event replay buffer is local memory
```

Limitation:

```text
read-only replica or another writer cannot deliver to connections on another instance
```

---

## 3. Admin SSE

Current behavior:

```text
adminConnections map in adminSseHandler.js
EventBus listeners local only
```

Limitation:

```text
admins connected to replica may miss writer events
```

---

## 4. Live feed

Live feed is local:

```text
job_created
job_updated
instant_match_offer
direct_offer_received
direct_offer_status
```

---

## 5. Direct offer modal

Direct offers require timely delivery.

Fallbacks:

```text
push notification
in-app notification
dashboard refresh
```

But real-time modal requires fanout if multi-instance.

---

## 6. Instant match modal

Instant match is latency-sensitive.

Future fanout must support:

```text
low-latency delivery
candidate-specific messages
offer taken/expired events
idempotent modal close
```

---

## 7. Sticky sessions vs pub/sub

Short-term:

```text
single writer + sticky sessions
```

Future:

```text
pub/sub fanout
cross-instance replay
SSE token scoping
```

---

## 8. Short-lived SSE token recommendation

Future SSE should use:

```text
short-lived stream token
scoped to user/admin
not ADMIN_TOKEN in query except legacy/admin dev
expires quickly
revocable
```

---

## 9. No implementation by default

Phase 61 keeps SSE fanout design-only.

Implementation requires:

```text
pilot gate passed
approval
rollback rehearsal
candidate-specific need
```
