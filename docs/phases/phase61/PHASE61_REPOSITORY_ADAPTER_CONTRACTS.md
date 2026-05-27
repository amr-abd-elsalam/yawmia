# يوميّة — Phase 61 Repository Adapter Contracts

> Contracts only. No runtime switch.  
> Version: v0.57.0

---

## 1. Current `database.js` direct coupling

Current services directly use:

```javascript
readJSON()
atomicWrite()
getRecordPath()
getWriteRecordPath()
getCollectionPath()
listJSON()
addToSetIndex()
getFromSetIndex()
```

This is acceptable because file-backed storage remains source of truth.

---

## 2. Why contracts matter

Repository contracts help future bounded pilots by documenting:

```text
what must remain true
what indexes must be preserved
what privacy guarantees must hold
what rollback must restore
```

---

## 3. Contract interface shape

Example:

```javascript
{
  name: 'UserRepository',
  sourceOfTruth: 'file-backed-json',
  runtimeSwitchEnabled: false,
  requiredOperations: [
    'findById',
    'findByPhone',
    'create',
    'update',
    'softDelete',
    'anonymize',
    'exportUserData'
  ],
  guarantees: [
    'phone index consistency',
    'no raw session token export',
    'anonymization is idempotent'
  ]
}
```

---

## 4. File-backed adapter remains source of truth

Phase 61 does not introduce:

```text
external DB adapter
external queue adapter
external search adapter
runtime repository switch
dual-write
cutover
```

---

## 5. Contract tests required

Contract tests must verify:

```text
sourceOfTruth=file-backed-json
runtimeSwitchEnabled=false
no external adapter by default
candidate guarantees documented
privacy guarantees documented
queue idempotency documented
audit append-only documented
image delete-by-ref documented
```

---

## 6. Candidate-specific guarantees

### UserRepository

```text
phone-index consistency
soft-delete retention
privacy export without session tokens
anonymization idempotent
```

### JobRepository

```text
sharded jobs readable by id
query indexes repairable
job lifecycle preserved
```

### ApplicationRepository

```text
worker/job secondary indexes
accepted-equivalent statuses preserved
```

### QueueRepository

```text
idempotency keys
claim/lease semantics
retry/backoff/DLQ
segmented storage compatibility
```

### AuditRepository

```text
append-only log
retention emits audit:deleted for index coherence
indexed search fallback remains correct
```

### WorkroomRepository

```text
messages, receipts, pins, checklist, search sidecars
sidecar compaction
attachments by imageRef only
```

### ImageObjectStore

```text
content-addressed images
metadata sidecar
delete by imageRef
no raw base64 in messages
```

---

## 7. No runtime switch

```text
REPOSITORY_CONTRACTS.runtimeSwitchEnabled = false
```

Any future switch requires:

```text
pilot gate passed
rollback rehearsal passed
approval
privacy review
```

---

## 8. No external adapter in Phase 61 by default

No PostgreSQL, Redis, S3, Elastic, OpenSearch, Kafka, RabbitMQ implementation in Phase 61.
