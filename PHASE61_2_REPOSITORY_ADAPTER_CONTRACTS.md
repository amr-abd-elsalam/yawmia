# Phase 61.2 — Repository Adapter Contracts Readiness

> Mode: docs/tests first  
> Source of truth: file-backed JSON  
> runtimeSwitchEnabled=false  
> docsOnly=true

---

## 1. Purpose

Repository contracts define future adapter boundaries without implementing external adapters.

They help ensure that if Yawmia ever externalizes a subsystem, behavior and safety rules are already documented.

---

## 2. Current Required Posture

```text
docsOnly=true
runtimeSwitchEnabled=false
contractTestsEnabled=true
externalAdapterImplemented=false
fileBackedSourceOfTruth=true
```

---

## 3. No Runtime Switch

Phase 61.2 must not add:

```text
runtime repository switching
dual-read
dual-write
external read path
PostgreSQL adapter
external queue adapter
external search adapter
object storage adapter
```

---

## 4. Candidate Contracts

Repository candidates:

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

---

## 5. Contract Invariants

Every repository contract must document:

```text
identity and id format
read behavior
write behavior
atomicity expectations
idempotency expectations
secondary indexes
repair/rebuild path
privacy export behavior
privacy anonymization behavior
retention behavior
rollback behavior
error semantics
```

---

## 6. File-backed Invariants

The current file-backed implementation guarantees or expects:

```text
atomic writes through unique temp-file writes
JSON records on disk
monthly sharding for high-volume collections
secondary set indexes
safe/tolerant list paths where required
repair/rebuild scripts for indexes
single-writer production discipline
process locks as guardrails only
```

---

## 7. Privacy Invariants

Any future adapter must preserve:

```text
user data export
user anonymization
verification image deletion on anonymize
session deletion on anonymize
message export inclusion rules
audit reference exclusion rules
no token/secret leakage
```

---

## 8. Queue Invariants

Any future queue adapter must preserve:

```text
durable job record
idempotency key
atomic claim
lease/visibility timeout
retry attempts
backoff
dead letter
manual retry
cancel
repair/verify
summary/location visibility
```

No external queue adapter is implemented in Phase 61.2.

---

## 9. Audit/Search Invariants

Any future audit/search adapter must preserve:

```text
append-only audit records
retention behavior
indexed search correctness
fallback correctness
token index rebuildability
Arabic normalization behavior for marketplace search
privacy-safe search analytics
no raw query storage by default
```

No external search adapter is implemented in Phase 61.2.

---

## 10. Rollback Invariants

Any future adapter plan must include rollback:

```text
restore file-backed source of truth
rebuild secondary indexes
verify queue integrity
run postdeploy smoke
preserve audit logs
preserve privacy workflow integrity
```

---

## 11. Phase 61.2 Contract Test Expectations

Tests should confirm:

```text
docsOnly=true
runtimeSwitchEnabled=false
externalAdapterImplemented=false
file-backed source remains source of truth
no new external dependencies
no PostgreSQL adapter files
no external queue adapter files
no external search adapter files
```

---

## 12. Success Criteria

Repository contract readiness is successful when:

```text
contracts are documented
runtime switch remains disabled
external adapters are not implemented
file-backed source remains source of truth
contract tests verify guardrails
future adapter risks are explicit
```
