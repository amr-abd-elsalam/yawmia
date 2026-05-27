# Phase 61.2 — Pilot Candidate Decision Discipline

> Default: no pilot  
> Default: no externalization  
> Status: decision framework only

---

## 1. Default Decision

The default decision is:

```text
Stay file-backed.
Continue evidence cadence.
Continue remediation ownership.
Do not start Phase 62.
```

---

## 2. Pilot Gate Defaults

```text
pilotAllowed=false
implementationAllowed=false
externalizationAllowed=false
```

This is the correct safe behavior.

Admin copy should say:

```text
Pilot غير مسموح الآن — وهذا سلوك صحيح لحماية المنصة.
```

---

## 3. Why One Warning Is Not Enough

A single warning may be caused by:

```text
stale queue summary
corrupt JSON
temporary traffic spike
uncompacted audit token index
stale Workroom sidecar
missing benchmark artifact
cold filesystem cache
```

Therefore:

```text
one warning → monitor
one critical → diagnose and mitigate
repeated warning → mitigate_file_based
repeated critical after mitigation → rehearsal_required
```

Never:

```text
one warning → pilot
one warning → PostgreSQL
one warning → external queue
one warning → external search
```

---

## 4. Candidate Ranking

Candidate ranking is conditional and evidence-based.

### 0. Stay file-backed

Preferred when:

```text
warnings are isolated
benchmarks are acceptable
repair/compact resolves pressure
single-writer operation remains stable
```

### 1. Object storage candidate

Only if:

```text
image/object pressure is sustained
largest binary/object files exceed thresholds repeatedly
verification/workroom attachments become dominant storage pressure
privacy deletion/anonymization behavior is preserved in rehearsal design
```

No object storage pilot in Phase 61.2.

### 2. External search candidate

Only if:

```text
search/audit/workroom search indexes remain pressured after rebuild/compaction
Arabic search quality depends on larger index fanout
benchmark p95 remains repeatedly critical
repair and compaction did not resolve pressure
```

No external search pilot in Phase 61.2.

### 3. External queue candidate

Only if:

```text
queue pending/DLQ/stale-running pressure repeats after verify/repair/compaction
queue summary/location index is healthy
DLQ root causes were fixed
file-backed queue remains operational bottleneck after mitigation
```

No external queue pilot in Phase 61.2.

### 4. External DB / PostgreSQL candidate

Only if:

```text
core entity collections show repeated critical pressure
p95 read/write benchmarks remain critical
JSON integrity is healthy
indexes are repaired
sharding/compaction has been attempted
repository contracts pass
migration and rollback rehearsals pass
privacy workflows are preserved
```

No PostgreSQL pilot in Phase 61.2.

---

## 5. Required Conditions for Any Future Pilot Discussion

A candidate may be discussed only if all are true:

```text
repeated evidence exists
file-based mitigations were attempted
migration rehearsal passed
rollback rehearsal passed
restore drill fresh and passed
privacy review exists
admin approval exists
no critical open incidents
no overdue critical postmortem actions
one bounded candidate only
```

---

## 6. Pilot Scope Constraints

If a future phase ever approves a pilot, it must be:

```text
one candidate
bounded dataset
read-only or shadow validation first
no cutover
no dual-write until separately approved
no user-visible dependency
rollback rehearsal already passed
privacy export/anonymization preserved
```

---

## 7. Phase 61.2 Decision

Phase 61.2 decision is:

```text
No pilot.
No Phase 62.
No externalization.
Operationalize cadence first.
```

---

## 8. Explicit Non-goals

Phase 61.2 does not implement:

```text
PostgreSQL
external queue
external search
object storage migration
runtime repository switch
dual-write
cutover
external read path
distributed locks
EventBus bridge
SSE fanout
```
