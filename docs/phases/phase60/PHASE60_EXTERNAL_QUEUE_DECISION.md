# يوميّة — Phase 60 External Queue Decision

## Current strengths

Current file queue supports:

```text
durable jobs
idempotency
retry/backoff
DLQ
segmented storage
summary/location index
manual retry/cancel
single-writer safety
```

## Evidence needed

```text
pending trend
DLQ trend
claim latency p95
stale running rate
scheduler delay
single-writer bottleneck
```

## Mitigation first

```bash
node scripts/verify-queue.js
node scripts/repair-queue.js
node scripts/compact-queue.js
node scripts/queue-retry-dlq.js --dry-run
```

## Required external semantics

Future external queue must support:

```text
atomic claim
visibility timeout
retry/backoff
DLQ
idempotency
manual retry
cancel
admin visibility
metrics
```

## Drain-before-migration

Preferred:

```text
pause schedulers
drain pending queue
verify queue
snapshot idempotency/DLQ if needed
cut over only after rehearsal
```

## Phase 60 rule

No external queue implementation without repeated evidence and approval.
