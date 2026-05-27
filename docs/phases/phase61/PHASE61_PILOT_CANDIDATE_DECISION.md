# يوميّة — Phase 61 Pilot Candidate Decision Gate

> Pilot is not default.  
> Version: v0.57.0

---

## 1. Pilot is not default

Phase 61 does not implement a pilot by default.

Default:

```json
{
  "pilotAllowed": false,
  "implementationAllowed": false
}
```

---

## 2. Candidate must be bounded

A pilot candidate must be one bounded subsystem:

```text
ops_queue
audit/search
images
messages/workrooms
jobs/applications
users
payments
```

Never migrate all data at once.

---

## 3. One pilot candidate max

```text
maxPilotCandidatesAtOnce = 1
```

If more than one candidate appears:

```text
pilotAllowed=false
blocker=TOO_MANY_CANDIDATES
```

---

## 4. Evidence requirements

Required:

```text
repeated evidence
storage pressure history
benchmark history
scale threshold evaluations
externalization decision snapshots
weekly ops review
```

Rules:

```text
one warning → monitor
repeated warnings → mitigate_file_based
repeated criticals after mitigation → rehearsal_required
```

---

## 5. Rehearsal requirements

Before pilot:

```text
migration rehearsal passed
deep rehearsal report exists
snapshot validation passed
```

---

## 6. Rollback requirements

Before pilot:

```text
rollback rehearsal passed
restore drill fresh
backup reference exists
index repair plan exists
queue verify plan exists
smoke plan exists
```

---

## 7. Approval requirements

Before pilot:

```text
admin approval approved
approval not expired
approval matches candidate/action
dangerous admin action rules respected
```

---

## 8. Privacy requirements

Before pilot:

```text
privacy review recorded
no raw tokens exported
no raw identity images
user export/anonymization semantics preserved
```

---

## 9. No file-backed fallback removal

Even with pilot:

```text
file-backed source of truth remains
rollback path remains
no cutover
no dual-write by default
no multi-writer production
```

---

## 10. Decision statuses

| Status | Meaning |
|---|---|
| `blocked` | blockers exist |
| `monitor` | evidence insufficient |
| `mitigate_file_based` | mitigation before rehearsal |
| `rehearsal_required` | run migration + rollback rehearsal |
| `approval_required` | rehearsals passed but approvals missing |
| `pilot_candidate` | bounded candidate may be considered |
| `deferred` | explicitly deferred |
