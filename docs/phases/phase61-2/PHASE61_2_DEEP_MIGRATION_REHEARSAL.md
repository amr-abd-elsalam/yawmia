# Phase 61.2 — Deep Migration Rehearsal Plan

> Status: non-mutating rehearsal plan  
> External DB: not connected  
> External queue: not connected  
> External search: not connected  
> Source data: not mutated

---

## 1. Purpose

This document defines a deeper migration rehearsal without implementing any external target.

The rehearsal validates whether Yawmia could prepare for future migration safely.

It does not migrate data.

It does not connect to PostgreSQL.

It does not connect to an external queue.

It does not connect to external search.

---

## 2. Required Rehearsal Guarantees

Every rehearsal report must include:

```text
sourceDataMutated=false
externalDbConnected=false
externalQueueConnected=false
externalSearchConnected=false
externalObjectStoreConnected=false
runtimeSwitchChanged=false
dualWriteEnabled=false
```

If any value is true, the rehearsal is invalid for Phase 61.2.

---

## 3. Inputs

Required inputs:

```text
migration snapshot path
manifest.json
collection NDJSON files
checksums
redaction policy
repository boundary matrix
rollback plan
queue pause/drain plan
postdeploy smoke plan
```

Optional inputs:

```text
latest storage pressure snapshot
latest benchmark artifact
latest externalization decision snapshot
latest Phase 61 evidence snapshot
latest restore drill reference
latest weekly ops review ID
```

---

## 4. Rehearsal Steps

### Step 1 — Snapshot presence

Validate:

```text
snapshot directory exists
manifest exists
declared collection files exist
manifest format is recognized
```

### Step 2 — Manifest and checksum validation

Run:

```bash
node scripts/validate-migration-snapshot.js --json
```

Must validate:

```text
manifest readable
collections declared
checksums present
sha256 checksum matches
counts reasonable
```

### Step 3 — NDJSON validation

Must validate:

```text
one JSON object per line
no invalid JSON line
no empty object if collection requires id
record id shape preserved
```

### Step 4 — Redaction validation

Must reject:

```text
token
secret
password
apiKey
api_key
authorization
vapidPrivateKey
raw base64 image payloads
```

### Step 5 — Referential sample validation

Sample check:

```text
jobs.employerId → users
applications.jobId → jobs
applications.workerId → users
payments.jobId → jobs
messages.jobId → jobs
messages.senderId → users
direct_offers.employerId → users
direct_offers.workerId → users
```

### Step 6 — Repository boundary mapping

For each candidate:

```text
users
jobs
applications
payments
messages
workrooms
ops_queue
audit
search
images
```

Map:

```text
source collection
indexes/sidecars
privacy constraints
read invariants
write invariants
rollback invariants
repair/rebuild strategy
```

### Step 7 — Adapter simulation without target

Simulation only:

```text
validate interface shape
validate required operations list
validate idempotency requirements
validate error semantics
validate privacy/anonymization behavior
```

No external target is created.

### Step 8 — Queue pause/drain plan validation

Validate plan exists for:

```text
pause queue workers
drain running jobs
handle stale leases
verify pending jobs
rebuild summary/location indexes
resume queue workers
```

### Step 9 — Rollback plan validation

Validate:

```text
backup reference exists
restore drill reference fresh
index repair plan exists
queue verify plan exists
postdeploy smoke plan exists
read-only replica behavior understood
maintenance mode plan exists
```

### Step 10 — Report generation

Report must include:

```text
status
blockers
warnings
validated collections
checksum status
redaction status
reference sample status
repository boundary status
rollback readiness
sourceDataMutated=false
externalDbConnected=false
externalQueueConnected=false
externalSearchConnected=false
```

---

## 5. Pass Conditions

A deep migration rehearsal passes only when:

```text
manifest exists
checksums pass
NDJSON parses
redaction passes
referential sample has no critical errors
repository boundary mapping is complete
rollback plan is complete
queue pause/drain plan is complete
postdeploy smoke plan is complete
sourceDataMutated=false
all external connection flags are false
```

---

## 6. Failure Conditions

The rehearsal fails if:

```text
manifest missing
checksum mismatch
invalid NDJSON
forbidden keys detected
raw base64 payload detected
critical references missing
rollback plan missing
backup reference missing
restore drill reference missing
external connection attempted
source data mutated
```

---

## 7. Pilot Relationship

A passed migration rehearsal does not allow pilot by itself.

Pilot also requires:

```text
repeated evidence
file-based mitigations attempted
rollback rehearsal passed
restore drill fresh
privacy review
admin approval
no critical open incidents
one bounded candidate only
```

---

## 8. Non-goals

This plan does not implement:

```text
PostgreSQL adapter
external queue adapter
external search adapter
object storage migration
dual-write
runtime repository switch
cutover
external read path
```
