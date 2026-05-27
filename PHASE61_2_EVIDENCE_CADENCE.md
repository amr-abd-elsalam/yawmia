# Phase 61.2 — Evidence Cadence Operationalization

> Project: Yawmia  
> Version posture: 0.57.0 unchanged  
> Status: Operational cadence, not externalization  
> Externalization posture: advisory-only  
> Pilot posture: blocked by default

---

## 1. Purpose

Phase 61.2 turns the Phase 60/61 evidence tools into a repeatable operating cadence.

The goal is not to implement PostgreSQL, an external queue, external search, Redis, object storage, Firebase, or any external provider.

The goal is:

```text
Evidence Cadence → Remediation Ownership → Rehearsal Discipline → Pilot Gate Confidence
```

Phase 61.2 keeps:

```text
file-backed JSON persistence
single-writer production discipline
read-only replica guard
docs-only repository contracts
pilotAllowed=false by default
implementationAllowed=false by default
```

---

## 2. Core Rule

If evidence is stale or missing:

```text
Do not decide pilot.
Do not externalize.
Do not infer PostgreSQL need.
Do not infer external queue need.
Do not infer external search need.
Recapture evidence first.
Link result to weekly ops review.
```

---

## 3. Weekly Evidence Cadence

Run weekly, preferably before the weekly ops review:

```bash
node scripts/phase61-1-remediation-status.js --json
node scripts/verify-data-json.js --strict --json
node scripts/find-null-json-files.js --json
node scripts/verify-queue.js --json
node scripts/repair-queue.js --dry-run --json
node scripts/compact-queue.js --dry-run --json
node scripts/measure-storage-pressure.js --json --persist
node scripts/verify-scale-thresholds.js --latest-only --persist --json
node scripts/benchmark-file-paths.js --json --persist
node scripts/capture-externalization-decision.js --persist --json
node scripts/capture-phase61-evidence.js --persist --json
node scripts/evaluate-pilot-gate.js --json
node scripts/ops-weekly-review.js --persist
```

The weekly ops review should reference the generated artifacts:

```text
remediation status
storage pressure snapshot
scale threshold evaluation
benchmark artifact
externalization decision snapshot
phase61 evidence snapshot
pilot gate result
queue verify result
JSON health result
null-byte result
```

---

## 4. Monthly Evidence Cadence

Run monthly, or before any Phase 62 readiness discussion:

```bash
node scripts/export-migration-snapshot.js --json
node scripts/validate-migration-snapshot.js --json
node scripts/run-migration-rehearsal.js --dry-run --json
node scripts/run-rollback-rehearsal.js --dry-run --json
node scripts/find-null-json-files.js --json
node scripts/run-backup-restore-drill.js --json
node scripts/verify-repository-contracts.js --json
```

Monthly rehearsal must remain non-mutating:

```text
sourceDataMutated=false
externalDbConnected=false
externalQueueConnected=false
externalSearchConnected=false
```

---

## 5. Predeploy Cadence

Before deployment:

```bash
node scripts/phase61-1-remediation-status.js --json
node scripts/verify-data-json.js --strict --json
node scripts/verify-queue.js --json
node scripts/verify-production-readiness.js --json
node scripts/predeploy-check.js --json
```

Deployment should be blocked or explicitly reviewed when:

```text
JSON integrity is failing
null-byte files are present
queue summary/location indexes are corrupt
queue repair is needed but only dry-run was executed
scale threshold latest artifact is missing
pilot gate is being interpreted as passed without required evidence
critical incidents are open
restore drill freshness is missing in production
```

---

## 6. Postdeploy Cadence

After deployment:

```bash
node scripts/postdeploy-smoke.js --json
node scripts/phase61-1-remediation-status.js --json
node scripts/evaluate-pilot-gate.js --json
```

Postdeploy smoke must not run heavy scans synchronously through HTTP readiness paths.

HTTP readiness and dashboard endpoints must remain:

```text
artifact-based by default
lightweight
non-blocking
degraded when artifacts are missing
never performing 80s scans synchronously
```

---

## 7. Evidence Freshness Rules

Recommended freshness windows:

| Evidence | Freshness |
|---|---:|
| remediation status | 7 days |
| storage pressure | 7 days |
| scale thresholds latest-only | 7 days |
| benchmark artifact | 7 days |
| externalization decision snapshot | 7 days |
| phase61 evidence snapshot | 7 days |
| weekly ops review | 7 days |
| migration snapshot validation | 30 days |
| migration rehearsal | 30 days |
| rollback rehearsal | 30 days |
| restore drill | 7 days in production |
| queue verify | 7 days |
| JSON strict verification | 7 days |
| null-byte scan | 30 days |

If freshness is exceeded, status should be:

```json
{
  "degraded": true,
  "artifactMissing": true,
  "recommendedAction": "Recapture evidence before any Pilot decision."
}
```

---

## 8. Decision Escalation

Single warning:

```text
status=monitor
pilotAllowed=false
implementationAllowed=false
```

Repeated warning:

```text
status=mitigate_file_based
pilotAllowed=false
implementationAllowed=false
```

Repeated critical after mitigation:

```text
status=rehearsal_required
pilotAllowed=false
implementationAllowed=false
```

Only after all gate requirements pass:

```text
pilotAllowed may be discussed for one bounded candidate
implementationAllowed remains false until explicit later phase approval
```

---

## 9. File-backed Architecture Sufficiency

The file-backed architecture remains sufficient when:

```text
storage pressure is ok or warning only
benchmarks are ok or isolated warning
queue verifies cleanly
queue repair is not required
JSON integrity passes
null-byte scan is clean
workroom/search/audit hygiene can be compacted or rebuilt
single-writer discipline is preserved
read-only replica guard blocks writes
restore drill is fresh
weekly ops review is current
```

Default decision:

```text
Stay file-backed.
```

---

## 10. Required Weekly Review Checklist

Every weekly ops review should answer:

```text
Were evidence artifacts refreshed?
Did remediation status show blockers?
Were blockers triaged?
Were dry-run repair commands executed first?
Was backup required before mutation?
Was any confirm command run?
Was post-repair verification run?
Did pilot gate remain blocked?
Is that blocked result expected and accepted?
Is Auth Addendum still docs-only?
```

---

## 11. Explicit Non-goals

Phase 61.2 does not implement:

```text
PostgreSQL
external DB
external queue
external search
Redis
Kafka/NATS/RabbitMQ
Elastic/OpenSearch
object storage migration
EventBus bridge
SSE fanout
runtime repository switch
dual-write
cutover
Firebase
Cequens
VictoryLink
dynamic OTP routing
unofficial WhatsApp APIs
```

---

## 12. Success Criteria

Phase 61.2 evidence cadence is successful when:

```text
weekly evidence is recaptured
weekly ops review links evidence
remediation status is reviewed
dry-run repair boundaries are respected
rollback rehearsal is practiced monthly
pilot gate remains blocked unless all requirements pass
externalization decision remains advisory
repository contracts remain docs-only
file-backed source of truth remains unchanged
```
