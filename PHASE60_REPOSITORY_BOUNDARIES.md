# يوميّة — Phase 60 Repository Boundaries

> Phase 60 documents boundaries. It does not replace file storage.

---

## 1. Current coupling

Most services call `database.js` directly:

```text
readJSON
atomicWrite
getRecordPath
getWriteRecordPath
listJSON
getFromSetIndex
addToSetIndex
```

This is acceptable for file-backed single-writer mode, but future externalization needs repository boundaries.

---

## 2. Rule

```text
File-backed adapters remain source of truth in Phase 60.
No external implementation switch.
No PostgreSQL default.
No Redis/default external queue.
```

---

## 3. Proposed repositories

```text
UserRepository
SessionRepository
JobRepository
ApplicationRepository
PaymentRepository
MessageRepository
WorkroomRepository
NotificationRepository
AuditRepository
QueueRepository
MetricsRepository
GovernanceRepository
SearchIndexRepository
ImageObjectStore
```

---

## 4. Interface shape

Example future shape:

```javascript
export async function findById(id)
export async function create(record)
export async function update(id, patch)
export async function deleteById(id)
export async function list(options)
export async function listByIndex(indexName, key, options)
export async function appendEvent(record)
```

---

## 5. Candidate-specific boundaries

### UserRepository
Must preserve:
- phone index
- anonymization
- privacy export
- no raw session token exposure

### JobRepository
Must preserve:
- monthly shards
- employer index
- query index
- lifecycle transitions

### ApplicationRepository
Must preserve:
- job applications index
- worker applications index
- accepted-equivalent semantics

### PaymentRepository
Must preserve:
- financial audit
- no blind deletion
- dispute lifecycle

### MessageRepository / WorkroomRepository
Must preserve:
- workroom access rules
- receipts
- search sidecars
- pins/checklists
- attachments metadata only

### AuditRepository
Must preserve:
- append-only
- indexed search rebuildability
- retention events

### QueueRepository
Must preserve:
- idempotency
- claim lease
- retry/backoff
- DLQ
- cancellation

### ImageObjectStore
Must preserve:
- content hash
- metadata
- delete by ref
- anonymization deletion

---

## 6. Testing strategy

Before implementing any adapter:

```text
contract tests
file-backed adapter tests
migration snapshot tests
rollback tests
privacy tests
idempotency tests
```

---

## 7. What not to implement yet

```text
No runtime repository switch.
No external DB adapter.
No external queue adapter.
No external search adapter.
No object storage adapter.
```
