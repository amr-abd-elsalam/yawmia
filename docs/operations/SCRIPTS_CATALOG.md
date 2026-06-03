# Yawmia Scripts Catalog

> Version: 0.57.0  
> Scope: `scripts/*.js` operational tooling  
> Status: Governance baseline  
> Last reviewed: 2026-06-03

---

## Purpose

This catalog classifies every script under `scripts/` by operational purpose, production safety, mutation risk, and lifecycle decision.

The project does **not** have a script-count problem by itself.  
The real operational risk is unsafe or undocumented scripts without ownership, dry-run behavior, confirmation controls, JSON output, tests, or runbook coverage.

This catalog is the source of truth for script governance.

---

## Safety Legend

| Term | Meaning |
|---|---|
| Safe Default | Script does not mutate source data unless explicitly confirmed |
| Dry Run | Script can preview impact without mutation |
| Confirm Required | Script requires `--confirm` before mutation |
| Approval Required | Script requires explicit operational/admin approval before production mutation |
| Backup Guard | Script should require or strongly verify recent backup evidence before irreversible mutation |
| Derived Artifact | Script writes rebuildable/index/metrics artifacts, not source marketplace data |
| Source Data Mutation | Script changes user/job/payment/message/notification/queue source records |
| Never Production | Script must not run against production data except under exceptional approved incident procedure |

---

## Production Safety Classes

| Class | Meaning |
|---|---|
| Safe Read-Only | Can be run in production as diagnostic/reporting |
| Manual With Caution | Can be run manually in production; review output first |
| Approval Required | Mutates production or derived runtime artifacts; approval/runbook required |
| Emergency Only | Incident response only |
| Dev Only | Must not run on production data |
| CI/Bundle Only | Used for review/build automation, not runtime ops |

---

## Core Operational Scripts

These scripts are expected to remain long-term.

| Script | Category | Safe Default | Production | Mutation | Risk | Owner/Use |
|---|---|---:|---|---|---|---|
| `scripts/backup.js` | Backup | Yes | Manual With Caution | Writes backup copy only | Low/Medium | Ops |
| `scripts/verify-data-json.js` | Verify | Yes | Safe Read-Only | No | Low | Ops / Deploy |
| `scripts/verify-file-health.js` | Verify | Yes | Safe Read-Only | No | Low | Ops / Deploy |
| `scripts/verify-production-readiness.js` | Verify | Yes | Safe Read-Only | No | Low | Deploy |
| `scripts/verify-queue.js` | Verify / Queue Ops | Yes | Safe Read-Only | No | Low | Ops |
| `scripts/predeploy-check.js` | Verify / Deploy | Yes | Safe Read-Only | No | Low | Deploy |
| `scripts/postdeploy-smoke.js` | Verify / Smoke | Yes | Safe Read-Only | No | Low | Deploy |
| `scripts/measure-storage-pressure.js` | Verify / Metrics | Partial | Manual With Caution | Writes metrics snapshot by default | Medium | Ops / Scale |
| `scripts/ops-weekly-review.js` | Governance / Maintenance | Partial | Manual With Caution | Optional ops review record | Medium | Ops Review |

---

## Verification Scripts

| Script | Purpose | Production | Risk | Notes |
|---|---|---|---|---|
| `scripts/find-null-json-files.js` | Detect JSON files containing NUL bytes | Safe Read-Only | Low | Specialized corruption scanner |
| `scripts/inspect-predictive-scan-queue.js` | Read-only predictive_scan queue flood diagnostics | Safe Read-Only / Emergency | Low | Must not mutate queue |
| `scripts/list-benchmark-history.js` | List benchmark evidence artifacts | Safe Read-Only | Low | Phase 60 evidence |
| `scripts/report-duplicate-records.js` | Report duplicate physical records | Safe Read-Only | Low | Incident diagnostic |
| `scripts/scheduler-cadence-report.js` | Scheduler cadence visibility | Manual With Caution | Medium | Reviewed: `--json`; may register default scheduler records via `registerDefaultSchedulerJobs()` |
| `scripts/verify-admin-rbac.js` | Verify admin RBAC model | Safe Read-Only | Low | Governance |
| `scripts/verify-audit-index.js` | Verify audit index | Safe Read-Only | Low | Audit hygiene |
| `scripts/verify-marketplace-intelligence.js` | Verify product/marketplace rollups | Manual With Caution | Medium | Reviewed: `--json`; may capture dashboard rollup if no persisted rollup exists |
| `scripts/verify-privacy-governance.js` | Verify privacy/governance workflows | Safe Read-Only | Low | Governance |
| `scripts/verify-repository-contracts.js` | Verify repository adapter contracts | Safe Read-Only | Low | Reviewed: `--json`; docs/contracts readiness only |
| `scripts/verify-scale-thresholds.js` | Verify scale thresholds | Safe Read-Only by default; optional metrics persist | Low/Medium | Reviewed: latest-only by default; `--persist` writes scale-threshold artifact |
| `scripts/verify-workroom-indexes.js` | Verify workroom search indexes | Safe Read-Only; repair requires `--confirm` | Low/High | Hardened: verify read-only + repair confirm + json |

---

## Repair Scripts

| Script | Purpose | Safe Default | Confirm Required | Production | Risk | Decision |
|---|---|---:|---:|---|---|---|
| `scripts/repair-indexes.js` | Rebuild secondary indexes from source records | Yes | Yes | Approval Required | High | Keep |
| `scripts/repair-queue.js` | Repair queue summary/location index | Yes | Yes + approval id | Approval Required | High | Keep |
| `scripts/quarantine-corrupt-json.js` | Move corrupt JSON into quarantine | Yes — dry-run default | Yes | Emergency Only | High | Hardened: dry-run default + confirm + json; moves, never deletes |
| `scripts/recover-stale-running-jobs.js` | Audit stale running queue jobs | Yes — dry-run auditor only | Confirm intentionally blocked | Emergency Read-Only | Low now / High future | Keep + document; no mutation implemented |
| `scripts/queue-retry-dlq.js` | Retry dead-letter queue jobs | Yes — dry-run default | Yes | Emergency Only | High | Hardened: dry-run default + confirm + json |
| `scripts/queue-drain.js` | Process due queue jobs | Yes — dry-run default | Yes + active-worker preflight | Emergency Only | Critical | Hardened: dry-run default + confirm + json + PM2/server preflight |

---

## Recovery / Incident Scripts

| Script | Incident Class | Production | Risk | Decision |
|---|---|---|---|---|
| `scripts/cleanup-notification-flood.js` | Notification flood quarantine | Emergency Only | High | Keep + document |
| `scripts/quarantine-corrupt-json.js` | JSON corruption quarantine | Emergency Only | High | Hardened: dry-run default + confirm + json; moves, never deletes |
| `scripts/find-null-json-files.js` | JSON corruption diagnosis | Safe Read-Only | Low | Keep |
| `scripts/report-duplicate-records.js` | Duplicate physical record diagnosis | Safe Read-Only | Low | Keep |
| `scripts/inspect-predictive-scan-queue.js` | predictive_scan flood diagnosis | Safe Read-Only | Low | Keep |
| `scripts/recover-stale-running-jobs.js` | Queue stale running dry-run audit | Emergency Read-Only | Low now / High future | Keep + document; confirm not implemented |
| `scripts/export-incident-timeline.js` | Incident timeline export | Safe Read-Only | Low | Hardened: read-only + `--json` + mutationPerformed=false |

---

## Migration / Externalization Scripts

These are evidence and rehearsal tools only. They do **not** implement PostgreSQL, Redis, external queue, or external search.

| Script | Purpose | Production | Mutation | Risk | Decision |
|---|---|---|---|---|---|
| `scripts/export-migration-snapshot.js` | Export sanitized NDJSON snapshot | Manual With Caution | Writes snapshot artifacts | High | Keep |
| `scripts/validate-migration-snapshot.js` | Validate snapshot manifest/NDJSON/checksums/redaction | Safe Read-Only | No | Low | Keep |
| `scripts/run-migration-rehearsal.js` | Run safe migration rehearsal | Manual With Caution | Writes rehearsal report | Medium | Keep |
| `scripts/run-rollback-rehearsal.js` | Run rollback rehearsal | Manual With Caution | Writes rehearsal report | Medium | Keep |
| `scripts/capture-externalization-decision.js` | Capture advisory Phase 60 decision | Safe by default / Manual With Caution when `--persist` | Optional decision snapshot | Low/Medium | Reviewed: keep |
| `scripts/capture-phase61-evidence.js` | Capture Phase 61 evidence cadence | Safe by default / Manual With Caution when `--persist` | Optional evidence snapshot | Low/Medium | Reviewed: keep |
| `scripts/evaluate-pilot-gate.js` | Evaluate Phase 61 pilot gate | Safe by default / Manual With Caution when `--persist` | Optional pilot gate snapshot | Low/Medium | Reviewed: keep; default may exit non-zero when pilot is blocked |
| `scripts/phase61-1-remediation-status.js` | Phase 61.1 remediation status aggregator | Safe Read-Only | No mutation; runs diagnostics and dry-runs only | Low/Medium | Reviewed: keep |

---

## Backup / Restore Scripts

| Script | Purpose | Production | Risk | Notes |
|---|---|---|---|---|
| `scripts/backup.js` | Copy data directory to timestamped backup | Manual With Caution | Low/Medium | Should add `--json` + manifest |
| `scripts/run-backup-restore-drill.js` | Validate backup restore drill | Manual With Caution | Medium | Hardened: dry-run default + confirm + json; source data not mutated |

---

## Benchmark Scripts

| Script | Purpose | Production | Risk | Notes |
|---|---|---|---|---|
| `scripts/benchmark.js` | HTTP API benchmark against running server | Manual Only | Low | Hardened: read-only + `--json` + mutationPerformed=false |
| `scripts/benchmark-file-paths.js` | File/service path benchmark evidence | Manual With Caution | Medium | Reviewed: `--json`, optional `--persist`; beware service-layer lazy expiry through jobs service |
| `scripts/list-benchmark-history.js` | List persisted benchmark artifacts | Safe Read-Only | Low | Keep |

---

## Export / Privacy Scripts

| Script | Purpose | Production | Risk | Controls |
|---|---|---|---|---|
| `scripts/export-user-data.js` | Export one user's data | Manual Only | Medium | Hardened: explicit `--json`, sourceDataMutated=false, artifact-only writes |
| `scripts/anonymize-user-data.js` | Irreversible user anonymization | Approval Required | Critical | Hardened: dry-run default + confirm + json + approvalId + backupRef |
| `scripts/export-migration-snapshot.js` | Sanitized NDJSON migration export | Manual With Caution | High | Default dry-run, confirm required |

---

## Rebuild / Derived Artifact Scripts

| Script | Artifact | Production | Risk | Decision |
|---|---|---|---|---|
| `scripts/rebuild-audit-index.js` | Audit search index | Approval Required | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-counters.js` | Direct offer counter file | Approval Required | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-predictive-archive-index.js` | Predictive archive index | Approval Required | Medium/High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-search-relevance.js` | Process-local search/query indexes | Manual With Caution | Medium | Hardened: dry-run default + confirm + json; process-local only |
| `scripts/rebuild-workroom-search.js` | Workroom search indexes | Approval Required | Medium/High | Hardened: dry-run default + confirm + json |
| `scripts/repair-indexes.js` | Secondary indexes | Approval Required | High | Keep |

---

## Queue Ops Scripts

| Script | Purpose | Production | Risk | Policy |
|---|---|---|---|---|
| `scripts/verify-queue.js` | Verify queue health | Safe Read-Only | Low | Safe |
| `scripts/repair-queue.js` | Repair queue summary/index | Approval Required | High | Dry-run first, approval id for confirm |
| `scripts/compact-queue.js` | Archive/compact queue | Approval Required | High | Dry-run first |
| `scripts/queue-retry-dlq.js` | Retry DLQ | Emergency Only | High | Hardened: dry-run default + confirm + json |
| `scripts/queue-drain.js` | Process due queue jobs | Emergency Only | Critical | Hardened: dry-run default + confirm + json + active-worker preflight |
| `scripts/recover-stale-running-jobs.js` | Audit stale running jobs | Emergency Read-Only | Low now / High future | Confirm intentionally not implemented; no queue mutation |
| `scripts/inspect-predictive-scan-queue.js` | Read-only flood inspection | Safe Read-Only | Low | Safe |

---

## Dev-Only Scripts

| Script | Purpose | Production | Risk | Policy |
|---|---|---|---|---|
| `scripts/reset-dev-data.js` | Reset local/dev data | Never Production | Critical | Dev only, confirm required, production blocked |
| `scripts/bundle-for-review.js` | Generate `CODEBASE_PART*.md` | CI/Bundle Only | Medium | Keep |
| `scripts/generate-vapid-keys.js` | Generate VAPID keys | Manual Setup | Low | Keep |

---

## Full Inventory Table

| Script | Category | Safe Default | Production | Mutation | Deletes/Moves | Queue Touch | Risk | Recommendation |
|---|---|---:|---|---:|---:|---:|---|---|
| `scripts/anonymize-user-data.js` | Privacy / Destructive | Yes | Approval Required | Yes with `--confirm` + `--approvalId` + `--backupRef` | Possible verification image/session cleanup via service | No | Critical | Hardened: dry-run default + confirm + json + approval/backup guard |
| `scripts/backup.js` | Backup | Yes | Manual With Caution | Backup only | No | No | Low/Medium | Keep |
| `scripts/benchmark-file-paths.js` | Benchmark | Partial | Manual With Caution | Optional benchmark artifact with `--persist`; possible lazy job expiry through jobs service | No | Reads queue only | Medium | Keep + Document service-layer side effects |
| `scripts/benchmark.js` | Benchmark | Yes | Manual Only | No | No | No | Low | Hardened: read-only + json |
| `scripts/bundle-for-review.js` | Bundle/Review | Partial | CI/Bundle Only | Writes bundles | Overwrites bundles | No | Medium | Keep |
| `scripts/capture-externalization-decision.js` | Migration Evidence | Yes | Manual | Optional decision snapshot with `--persist` | No | No | Low/Medium | Reviewed: Keep |
| `scripts/capture-phase61-evidence.js` | Migration Evidence | Yes | Manual | Optional evidence snapshot with `--persist` | No | No | Low/Medium | Reviewed: Keep |
| `scripts/cleanup-attachments.js` | Maintenance | Yes | Approval Required | Yes with `--confirm` | Possible delete with `--confirm` | No | High | Hardened: dry-run default + confirm + json |
| `scripts/cleanup-notification-flood.js` | Incident Recovery | Yes | Emergency Only | Yes | Moves quarantine | No | High | Keep + tests/docs |
| `scripts/compact-counters.js` | Maintenance | Yes | Approval Required | Derived write with `--confirm` | No | No | High | Hardened: dry-run default + confirm + json |
| `scripts/compact-predictive-signals.js` | Maintenance / Retention | Yes | Approval Required | Archive with `--confirm` | Possible archive artifact changes | No | High | Hardened: dry-run default + confirm + json |
| `scripts/compact-queue.js` | Queue Ops | Yes | Approval Required | Yes | Archive | Yes | High | Keep |
| `scripts/compact-workrooms.js` | Maintenance | Yes | Approval Required | Workroom sidecar mutation with `--confirm` | Possible derived cleanup | No | High | Hardened: dry-run default + confirm + json |
| `scripts/evaluate-pilot-gate.js` | Governance | Yes | Manual | Optional pilot decision snapshot with `--persist` | No | No | Low/Medium | Reviewed: Keep; default may exit non-zero when pilot is blocked |
| `scripts/export-incident-timeline.js` | Incident Export | Yes | Safe Read-Only | No | No | No | Low | Hardened: read-only + json |
| `scripts/export-migration-snapshot.js` | Migration Export | Yes | Manual With Caution | Artifact write | Can overwrite output | No | High | Keep |
| `scripts/export-user-data.js` | Privacy Export | Yes | Manual | Export artifact only with `--out` | No | No | Medium | Hardened: explicit json semantics + sourceDataMutated=false |
| `scripts/find-null-json-files.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/generate-vapid-keys.js` | Setup | Yes | Manual Setup | No | No | No | Low | Keep |
| `scripts/inspect-predictive-scan-queue.js` | Queue Diagnostic | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/list-benchmark-history.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/measure-storage-pressure.js` | Verify / Metrics | Partial | Manual With Caution | Storage pressure metrics snapshot by default unless `--no-persist` | No | No | Medium | Reviewed: Keep |
| `scripts/migrate.js` | Migration | Partial | Manual/Startup | Yes | No | No | High | Keep + json/docs |
| `scripts/ops-weekly-review.js` | Governance | Partial | Manual With Caution | Optional markdown via `--out`; optional ops review record via `--persist` | No | Reads queue only | Medium | Keep + Add `--json` later |
| `scripts/phase61-1-remediation-status.js` | Verify / Incident / Recovery Diagnostic | Yes | Safe Read-Only | No mutation; runs safe diagnostics and dry-runs only | No | Reads queue via child diagnostics | Low/Medium | Reviewed: Keep |
| `scripts/postdeploy-smoke.js` | Smoke | Yes | Safe Read-Only | No source mutation; HTTP GET smoke only | No | No | Low | Reviewed: Keep |
| `scripts/predeploy-check.js` | Deploy Verify / Governance Gate | Partial | Manual With Caution | No source mutation; child checks may write registry/evidence artifacts | No | Reads queue via child checks | Medium | Reviewed: Keep + Document side effects |
| `scripts/quarantine-corrupt-json.js` | Recovery | Yes | Emergency Only | Yes with `--confirm` | Moves quarantine, never deletes | No | High | Hardened: dry-run default + confirm + json |
| `scripts/queue-drain.js` | Queue Ops / Due Job Processing | Yes | Emergency Only | Yes with `--confirm` | No direct deletion | Yes | Critical | Hardened: dry-run default + confirm + json + active-worker preflight |
| `scripts/queue-retry-dlq.js` | Queue Recovery | Yes | Emergency Only | Yes with `--confirm` | No | Yes | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-audit-index.js` | Rebuild Index | Yes | Approval Required | Derived write with `--confirm` | No | No | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-counters.js` | Rebuild Counters | Yes | Approval Required | Derived write with `--confirm` | No | No | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-predictive-archive-index.js` | Rebuild Index | Yes | Approval Required | Derived write with `--confirm` | No | No | Medium/High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-search-relevance.js` | Rebuild In-Memory Index | Yes | Manual With Caution | Process-local only with `--confirm` | No | No | Medium | Hardened: dry-run default + confirm + json; does not update running server |
| `scripts/rebuild-workroom-search.js` | Rebuild Index | Yes | Approval Required | Derived write with `--confirm` | No | No | Medium/High | Hardened: dry-run default + confirm + json |
| `scripts/recover-stale-running-jobs.js` | Queue Recovery / Auditor | Yes | Emergency Read-Only | No current mutation | No | Reads queue only | Low now / High future | Keep + document; confirm intentionally not implemented |
| `scripts/repair-indexes.js` | Repair Index | Yes | Approval Required | Yes | No | No | High | Keep + json/tests |
| `scripts/repair-queue.js` | Queue Repair | Yes | Approval Required | Yes | No | Yes | High | Keep + tests |
| `scripts/report-duplicate-records.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Keep |
| `scripts/reset-dev-data.js` | Dev Destructive | Yes | Dev Only / Never Production | Yes | Yes | No | Critical | Keep dev only |
| `scripts/rollup-product-intelligence.js` | Rollup | Yes | Manual/Scheduler Equivalent | Metrics artifact with `--confirm` | No | No | Medium | Hardened: dry-run default + confirm + json |
| `scripts/rollup-trust-snapshots.js` | Rollup / Retention | Yes | Approval Required | Metrics/archive artifacts with `--confirm` | Possible derived cleanup | No | Medium/High | Hardened: dry-run default + confirm + json |
| `scripts/run-backup-restore-drill.js` | Backup Verify | Yes | Manual With Caution | Drill report/temp restore with `--confirm` | Temp cleanup | No | Medium | Hardened: dry-run default + confirm + json |
| `scripts/run-migration-rehearsal.js` | Migration Rehearsal | Unknown | Manual | Report | No source mutation expected | No | Medium | Direct review |
| `scripts/run-rollback-rehearsal.js` | Rollback Rehearsal | Unknown | Manual | Report | No source mutation expected | No | Medium | Direct review |
| `scripts/run-trust-calibration.js` | Trust Calibration | Yes | Manual/Scheduler Equivalent | Metrics artifacts with `--confirm` | No | No | Medium | Hardened: dry-run default + confirm + json |
| `scripts/scheduler-cadence-report.js` | Verify / Scheduler Ops | Partial | Manual With Caution | May register default scheduler records | No | No direct queue mutation | Medium | Reviewed: Keep + Document registry side effect |
| `scripts/validate-migration-snapshot.js` | Verify | Unknown | Safe Read-Only | No | No | No | Low | Direct review |
| `scripts/verify-admin-rbac.js` | Verify | Unknown | Safe Read-Only | No | No | No | Low | Direct review |
| `scripts/verify-audit-index.js` | Verify | Unknown | Safe Read-Only | No | No | No | Low | Direct review |
| `scripts/verify-data-json.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-file-health.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-marketplace-intelligence.js` | Verify / Product Intelligence | Partial | Manual With Caution | May capture marketplace dashboard rollup if missing | No | No | Medium | Reviewed: Keep + Document rollup side effect |
| `scripts/verify-privacy-governance.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Direct review |
| `scripts/verify-production-readiness.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-queue.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-repository-contracts.js` | Verify / Governance | Yes | Safe Read-Only | No mutation | No | No | Low | Reviewed: Keep |
| `scripts/verify-scale-thresholds.js` | Verify / Metrics | Yes | Safe Read-Only by default | Optional scale-threshold artifact with `--persist` | No | No | Low/Medium | Reviewed: Keep |
| `scripts/verify-workroom-indexes.js` | Verify / Repair Derived Index | Yes | Safe Read-Only unless `--repair --confirm` | Repair writes derived index only | No | No | Low/High | Hardened: verify read-only + repair confirm + json |

---

## Approval Rules

### Safe Read-Only

May run without approval:

```bash
node scripts/verify-data-json.js --strict --json
node scripts/verify-file-health.js --strict --json
node scripts/verify-production-readiness.js --json
node scripts/verify-queue.js --json
node scripts/find-null-json-files.js --json
```

### Approval Required

Must run dry-run first and preserve output:

```bash
node scripts/repair-indexes.js --dry-run
node scripts/repair-queue.js --dry-run --json
node scripts/compact-queue.js --dry-run --json
node scripts/queue-retry-dlq.js --dry-run --json
node scripts/queue-drain.js --dry-run --json
node scripts/rebuild-predictive-archive-index.js --dry-run --json
node scripts/rebuild-workroom-search.js --all --dry-run --json
node scripts/verify-workroom-indexes.js --jobId=job_x --repair --dry-run --json
node scripts/compact-predictive-signals.js --dry-run --json
node scripts/rollup-product-intelligence.js --dry-run --json
node scripts/rollup-trust-snapshots.js --dry-run --json
node scripts/run-trust-calibration.js --snapshots --dry-run --json
node scripts/run-backup-restore-drill.js --dry-run --json
node scripts/export-migration-snapshot.js --dry-run --json
```

### Emergency Only / Critical

Never run without explicit incident approval:

```bash
node scripts/queue-drain.js --confirm --json
node scripts/anonymize-user-data.js --userId=usr_x --confirm --approvalId=apr_x --backupRef=brd_or_backup_reference --json
node scripts/reset-dev-data.js --confirm --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

---

## Dry-Run / Confirm Policy

All scripts that mutate production data or runtime-derived artifacts should follow:

```text
Default: dry-run
Mutation: requires --confirm
Automation: supports --json
High/Critical: writes operation report
Irreversible: requires approval + backup evidence
```

---

## Scripts Recommended for Archival Review

No script is approved for deletion now.

Potential future archival candidates after direct review:

| Script | Condition |
|---|---|
| `scripts/phase61-1-remediation-status.js` | Keep after Patch 10 review unless superseded by a newer remediation aggregator/runbook |
| `scripts/cleanup-notification-flood.js` | After incident retention and if flood class permanently resolved |
| `scripts/inspect-predictive-scan-queue.js` | After predictive scan flood risk stabilizes |
| `scripts/benchmark.js` | If replaced by `benchmark-file-paths.js` + `postdeploy-smoke.js` |

---

## Patch 2 Hardening Status — Maintenance Scripts

The following high-risk maintenance scripts were hardened after the initial catalog baseline:

| Script | Dry Run Default | Confirm Required | JSON Output | Mutation Scope |
|---|---:|---:|---:|---|
| `scripts/compact-counters.js` | Yes | Yes | Yes | Derived direct-offer counter file |
| `scripts/rebuild-counters.js` | Yes | Yes | Yes | Derived direct-offer counter file |
| `scripts/rebuild-audit-index.js` | Yes | Yes | Yes | Derived audit search index |
| `scripts/cleanup-attachments.js` | Yes | Yes | Yes | Orphan workroom attachments |
| `scripts/compact-workrooms.js` | Yes | Yes | Yes | Derived workroom sidecars |

Policy:

- Default mode performs no mutation.
- `--confirm` is required before any mutation.
- `--json` emits parseable operational evidence.
- Output includes `mutationPerformed`.
- Output includes `confirmCommand`.

---

## Patch 4 Queue / Recovery Safety Status

The following Queue / Recovery scripts were reviewed and synchronized after Patch 4.

| Script | Safety Status | Dry Run Default | Confirm Required | JSON Output | Mutation Scope | Risk | Recommendation |
|---|---|---:|---:|---:|---|---|---|
| `scripts/queue-drain.js` | Hardened | Yes | Yes + active-worker preflight | Yes | Confirmed mode calls `queueWorkers.processDueJobs()` and can claim/process due queue jobs | Critical | Keep as Emergency Only with strict runbook |
| `scripts/queue-retry-dlq.js` | Hardened | Yes | Yes | Yes | Confirmed mode calls `opsQueue.retryJob()` for dead-letter jobs | High | Keep as Emergency Only |
| `scripts/recover-stale-running-jobs.js` | Hardened read-only auditor | Yes | Confirm intentionally not implemented | Yes | No queue mutation; audits stale running jobs only | Low now / High future | Keep as diagnostic/recovery planning tool |
| `scripts/quarantine-corrupt-json.js` | Hardened | Yes | Yes | Yes | Confirmed mode moves corrupt JSON files into `data/quarantine`; never deletes | High | Keep as JSON corruption incident tool |

Policy:

- `queue-drain` is not stale-running recovery.
- `queue-drain --confirm` can process due pending jobs.
- `queue-retry-dlq --confirm` mutates dead-letter queue state.
- `recover-stale-running-jobs` is dry-run/audit only; confirm workflow is intentionally blocked.
- `quarantine-corrupt-json --confirm` moves files to quarantine and writes a manifest; it must never delete files.
- Queue/Recovery scripts must be tested whenever safety flags change.

---

## Queue / Recovery Dependency Map

| Script | Imports Services | Reads | Writes / Mutates | Queue Touch | Runtime Impact |
|---|---|---|---|---|---|
| `scripts/queue-drain.js` | `server/services/database.js`, `server/services/opsQueue.js`, `server/services/queueWorkers.js` | Queue stats, due jobs through worker service, `/proc`, optional PM2 state | Confirmed mode can claim/process due jobs through `processDueJobs()` | Yes — pending/running/completed/failed/dead-letter through worker processing | Critical; never run confirmed while server/worker is active |
| `scripts/queue-retry-dlq.js` | `server/services/database.js`, `server/services/opsQueue.js` | Dead-letter queue jobs via `listJobs()` | Confirmed mode retries DLQ jobs through `retryJob()` | Yes — dead-letter to pending/runnable queue state | High; emergency recovery only |
| `scripts/recover-stale-running-jobs.js` | `config.js`, `server/services/database.js`, `server/services/queueStorageIndex.js` | Running queue records, `/proc`, optional PM2 state | None | Read-only queue audit | Diagnostic only; no mutation implemented |
| `scripts/quarantine-corrupt-json.js` | `config.js`, `server/services/database.js` for `atomicWrite()` | JSON files under `data/` | Confirmed mode uses `rename()` to move corrupt JSON to `data/quarantine` and writes manifest | No direct queue service calls | High if confirmed; JSON corruption incident tool |

Duplication note:

- Some standalone filesystem scanning in `quarantine-corrupt-json.js` is acceptable because it is an incident recovery tool that may need to work even when higher-level services are partially affected.
- Queue mutation scripts should call queue services rather than reimplementing queue lifecycle transitions.
- `recover-stale-running-jobs.js` intentionally mirrors queue staleness classification but does not mutate records.

---

## Patch 5 Privacy / Destructive Safety Status

The following privacy/destructive scripts were reviewed after Patch 5.

| Script | Safety Status | Dry Run Default | Confirm Required | JSON Output | Mutation Scope | Risk | Recommendation |
|---|---|---:|---:|---:|---|---|---|
| `scripts/anonymize-user-data.js` | Hardened critical privacy mutation | Yes | Yes + `--approvalId` + `--backupRef` | Yes | Confirmed mode calls `userAnonymization.anonymizeUserData()` and consumes `privacy_anonymize` approval | Critical | Keep as Approval Required only |
| `scripts/reset-dev-data.js` | Hardened dev-only destructive reset | Yes | Yes + production double-guard if overridden | Yes | Deletes dev/runtime artifact paths only when confirmed; production blocked by default | Critical | Keep Dev Only / Never Production |
| `scripts/export-user-data.js` | Hardened privacy export | N/A read-only source data | No for stdout; `--out` writes artifact only | Yes | Optional export artifact write; sourceDataMutated=false | Medium | Keep |
| `scripts/verify-privacy-governance.js` | Read-only verifier | Yes | No | Yes | No mutation | Low | Keep |

Policy:

- `anonymize-user-data --confirm` must not run without approval and backup evidence.
- Prefer the admin privacy request workflow for production anonymization.
- `export-user-data` may write a sensitive export artifact; protect its output path.
- `reset-dev-data` is Dev Only / Never Production despite strong guards.
- `verify-privacy-governance` must remain read-only.

---

## Privacy / Destructive Dependency Map

| Script | Imports Services | Reads | Writes / Mutates | Privacy Impact | Runtime Impact |
|---|---|---|---|---|---|
| `scripts/anonymize-user-data.js` | `server/services/database.js`, `server/services/userAnonymization.js`, `server/services/adminApprovals.js` | User-related records through anonymization service; approval records | Confirmed mode mutates user-related records and consumes approval | Critical irreversible privacy mutation | High; approval + backup evidence required |
| `scripts/reset-dev-data.js` | `server/services/database.js` only when `--reinit` | Target path metadata | Confirmed mode deletes dev/runtime artifact directories; production blocked by default | Critical if misused | Dev only; never normal production |
| `scripts/export-user-data.js` | `server/services/database.js`, `server/services/userDataExport.js` | User-related records through export service | Optional `--out` writes export artifact only | Medium; export contains user data | Source data read-only |
| `scripts/verify-privacy-governance.js` | `config.js`, `server/services/database.js` | Config, docs, governance directory existence | None | Low | Read-only verification |

---

## Patch 6 Rebuild / Derived Artifact Safety Status

The following rebuild/derived artifact scripts were reviewed after Patch 6.

| Script | Safety Status | Dry Run Default | Confirm Required | JSON Output | Mutation Scope | Risk | Recommendation |
|---|---|---:|---:|---:|---|---|---|
| `scripts/rebuild-predictive-archive-index.js` | Hardened derived artifact rebuild | Yes | Yes | Yes | Confirmed mode rebuilds predictive archive index artifacts only | Medium/High | Keep as Approval Required |
| `scripts/rebuild-search-relevance.js` | Hardened process-local rebuild | Yes | Yes | Yes | Confirmed mode rebuilds in-memory indexes inside CLI process only; no persistent artifact | Medium | Keep + document process-local limitation |
| `scripts/rebuild-workroom-search.js` | Hardened derived artifact rebuild | Yes | Yes | Yes | Confirmed mode rebuilds workroom search index artifacts only | Medium/High | Keep as Approval Required |
| `scripts/verify-workroom-indexes.js` | Hardened verifier/repair tool | Yes for repair mode | Repair requires `--confirm` | Yes | Verify is read-only; repair writes derived workroom search index only | Low/High | Keep |

Policy:

- Derived artifact rebuild scripts must default to dry-run.
- Confirmed rebuilds must not mutate source data.
- `rebuild-search-relevance.js` is process-local and does not update an already-running server.
- Workroom search repair must require `--repair --confirm`.
- Any confirmed `--all` workroom rebuild must be treated as Approval Required.

---

## Rebuild / Derived Artifact Dependency Map

| Script | Imports Services | Reads | Writes / Mutates | Source of Truth | Runtime Impact |
|---|---|---|---|---|---|
| `scripts/rebuild-predictive-archive-index.js` | `server/services/database.js`, `server/services/predictiveArchiveIndex.js` | Predictive signal archive files through service | Confirmed mode writes predictive archive index artifacts | Predictive archive files | Medium/High; rebuildable derived index |
| `scripts/rebuild-search-relevance.js` | `server/services/database.js`, `server/services/searchIndex.js`, `server/services/queryIndex.js` | Jobs/ads through process-local service rebuilds | No persistent artifact; confirmed mode mutates CLI process memory only | Jobs/ads JSON files | Medium; does not affect running server |
| `scripts/rebuild-workroom-search.js` | `server/services/database.js`, `server/services/workroomSearch.js`, `server/services/jobs.js` | Jobs and workroom messages through services | Confirmed mode writes workroom search index artifacts | Messages JSON files | Medium/High when `--all` |
| `scripts/verify-workroom-indexes.js` | `server/services/database.js`, `server/services/workroomIndexHealth.js` | Workroom messages and search indexes | Verify is read-only; confirmed repair writes workroom search index artifact | Messages JSON files | Low for verify, High for repair |

---

## Patch 7 Rollup / Retention / Restore Safety Status

The following rollup, retention, calibration, and restore drill scripts were reviewed after Patch 7.

| Script | Safety Status | Dry Run Default | Confirm Required | JSON Output | Mutation Scope | Risk | Recommendation |
|---|---|---:|---:|---:|---|---|---|
| `scripts/compact-predictive-signals.js` | Hardened retention/archive tool | Yes | Yes | Yes | Confirmed mode archives old resolved predictive signals | High | Keep as Approval Required |
| `scripts/rollup-product-intelligence.js` | Hardened metrics rollup | Yes | Yes | Yes | Confirmed mode writes marketplace/product intelligence rollup artifact | Medium | Keep |
| `scripts/rollup-trust-snapshots.js` | Hardened rollup/retention tool | Yes | Yes | Yes | Confirmed mode writes trust rollup and may cleanup old derived trust/calibration artifacts | Medium/High | Keep as Approval Required |
| `scripts/run-trust-calibration.js` | Hardened calibration artifact tool | Yes | Yes | Yes | Confirmed mode writes trust snapshots or calibration report artifacts | Medium | Keep |
| `scripts/run-backup-restore-drill.js` | Hardened restore drill tool | Yes | Yes | Yes | Confirmed mode writes drill report and temporary restore target; source data not mutated | Medium | Keep |

Policy:

- Rollup and retention scripts must default to dry-run.
- Confirmed rollups must not mutate source marketplace/user/job/payment data.
- `run-backup-restore-drill` must be dry-run-first even though it does not mutate source data, because it copies backup data and writes drill reports.
- Trust calibration snapshots/reports are derived evidence artifacts.
- Predictive signal retention can archive old resolved signals and must remain Approval Required.

---

## Rollup / Retention / Restore Dependency Map

| Script | Imports Services | Reads | Writes / Mutates | Source of Truth | Runtime Impact |
|---|---|---|---|---|---|
| `scripts/compact-predictive-signals.js` | `server/services/database.js`, `server/services/predictiveSignalRetention.js` | Predictive signal state and precision stats through service | Confirmed mode archives old resolved signals | Predictive signal records / archives | High; retention/archive operation |
| `scripts/rollup-product-intelligence.js` | `server/services/database.js`, `server/services/marketplaceIntelligenceRollups.js` | Search/product/workroom/payment/direct-offer analytics through services | Confirmed mode writes product intelligence rollup artifact | Source analytics/event records | Medium |
| `scripts/rollup-trust-snapshots.js` | `server/services/database.js`, `server/services/trustSnapshotRollups.js` | Trust snapshots/calibration reports through service | Confirmed mode writes rollup and may cleanup old derived artifacts | Trust snapshots/reports | Medium/High |
| `scripts/run-trust-calibration.js` | `server/services/database.js`, `server/services/trustCalibration.js` | Users/outcomes/trust inputs through service | Confirmed mode writes trust snapshots or calibration report artifacts | User/job/payment/attendance/report data remains source | Medium |
| `scripts/run-backup-restore-drill.js` | `server/services/database.js`, `server/services/backupRestoreDrill.js` | Backup directory and restored JSON copy | Confirmed mode writes drill report and temp restore copy | Backup directory | Medium; source data not mutated |

---

## Patch 9 Read-Only Diagnostics / Export Safety Status

The following lower-risk diagnostic/export scripts were reviewed after Patch 9.

| Script | Safety Status | JSON Output | Mutation Scope | Risk | Recommendation |
|---|---|---:|---|---|---|
| `scripts/benchmark.js` | Hardened read-only HTTP benchmark | Yes | No mutation; HTTP GET benchmark only | Low | Keep |
| `scripts/export-incident-timeline.js` | Hardened read-only incident export | Yes | No mutation; reads incident records only | Low | Keep |
| `scripts/list-benchmark-history.js` | Read-only benchmark history list | Yes | No mutation | Low | Keep |
| `scripts/validate-migration-snapshot.js` | Read-only snapshot validation | Yes | No source data mutation | Low | Keep |
| `scripts/find-null-json-files.js` | Read-only JSON corruption diagnostic | Yes | No mutation | Low | Keep |
| `scripts/report-duplicate-records.js` | Read-only duplicate physical record inspector | Emits JSON | No mutation | Low | Keep |

Policy:

- Read-only scripts must not call destructive filesystem operations.
- Read-only scripts should expose `--json` or emit JSON by default.
- Incident export scripts should include `mutationPerformed:false`.
- Benchmark scripts should be treated as diagnostics and must not mutate server or data state.

---

## Read-Only Diagnostics Dependency Map

| Script | Imports Services | Reads | Writes / Mutates | Runtime Impact |
|---|---|---|---|---|
| `scripts/benchmark.js` | None server-side; uses HTTP `fetch()` | Running server HTTP endpoints | None | Low; external read-only load on running server |
| `scripts/export-incident-timeline.js` | `server/services/database.js`, `server/services/incidentTimeline.js` | Incident records | None | Low |
| `scripts/list-benchmark-history.js` | `server/services/benchmarkHistory.js` | Benchmark artifacts | None | Low |
| `scripts/validate-migration-snapshot.js` | `server/services/migrationSnapshotValidation.js` | Migration snapshot files | None | Low |
| `scripts/find-null-json-files.js` | `config.js` | JSON files under data path | None | Low/Medium depending scan size |
| `scripts/report-duplicate-records.js` | None service-side; standalone fs scanner | Selected collection files | None | Low |

---

## Patch 10 Remaining Low-Risk / Diagnostic Scripts Reality Check

The following lower-risk, diagnostic, deployment, and governance scripts were reviewed after Patch 10.

| Script | Safety Status | JSON Output | Mutation Scope | Risk | Recommendation |
|---|---|---:|---|---|---|
| `scripts/postdeploy-smoke.js` | Read-only HTTP smoke | Yes | No source mutation; HTTP GET checks only | Low | Keep |
| `scripts/predeploy-check.js` | Deployment gate with child diagnostics | Yes | No source mutation; may touch scheduler registry/evidence through child/service checks | Medium | Keep + document side effects |
| `scripts/ops-weekly-review.js` | Governance review generator | No | Optional markdown via `--out`; optional ops review record via `--persist` | Medium | Keep + add `--json` later |
| `scripts/capture-phase61-evidence.js` | Evidence cadence reporter | Yes | Default read-only; `--persist` writes evidence snapshot | Low/Medium | Keep |
| `scripts/capture-externalization-decision.js` | Phase 60 advisory decision reporter | Yes | Default read-only; `--persist` writes decision snapshot | Low/Medium | Keep |
| `scripts/evaluate-pilot-gate.js` | Phase 61 pilot gate evaluator | Yes | Default read-only; `--persist` writes pilot gate snapshot | Low/Medium | Keep |
| `scripts/phase61-1-remediation-status.js` | Phase 61.1 safe remediation status aggregator | Yes | No mutation; runs diagnostics and dry-run scripts only | Low/Medium | Keep |
| `scripts/benchmark-file-paths.js` | File/service path benchmark | Yes | Optional benchmark artifact with `--persist`; possible service-layer lazy expiry through jobs service | Medium | Keep + document side effects |
| `scripts/measure-storage-pressure.js` | Storage pressure measurement | Yes | Persists storage pressure snapshot by default unless `--no-persist` | Medium | Keep |
| `scripts/verify-scale-thresholds.js` | Scale threshold verifier | Yes | Default latest-only read; optional artifact with `--persist` | Low/Medium | Keep |
| `scripts/verify-marketplace-intelligence.js` | Marketplace intelligence verifier | Yes | May capture dashboard rollup if missing | Medium | Keep + document side effects |
| `scripts/verify-repository-contracts.js` | Repository contract verifier | Yes | No mutation | Low | Keep |
| `scripts/scheduler-cadence-report.js` | Scheduler cadence reporter | Yes | May register default scheduler records | Medium | Keep + document side effects |

Policy:

- These scripts are not deletion candidates.
- Default read-only claims must distinguish source data mutation from metrics/registry/report artifact writes.
- Scripts that write metrics/reports without `--confirm` remain acceptable only when clearly documented as artifact writers.
- `ops-weekly-review.js` should gain `--json` in a future low-risk polish patch.
- `verify-marketplace-intelligence.js` should avoid on-demand dashboard capture in a future hardening patch or keep the side effect documented.
- `scheduler-cadence-report.js` should keep its default registration side effect documented unless a future `--no-register` mode is added.
- `benchmark-file-paths.js` should document that service-layer reads may trigger lazy expiry in the jobs service.

## Patch 10 Low-Risk / Diagnostic Dependency Map

| Script | Imports / Calls | Reads | Writes / Mutates | Runtime Impact |
|---|---|---|---|---|
| `scripts/postdeploy-smoke.js` | Native `fetch()` only | HTTP GET endpoints | None | Low; read-only smoke against running server |
| `scripts/predeploy-check.js` | `productionReadiness`, `phase61EvidenceCadence`, `pilotDecisionGate`, `repositoryContractReport`, child scripts | Config, docs, JSON/file health, governance, scale/evidence artifacts | No source mutation; child/service checks may write scheduler registry/evidence artifacts | Medium deployment gate |
| `scripts/ops-weekly-review.js` | `productionReadiness`, `opsQueue`, `metricsRollups`, `scaleHygiene`, `backupRestoreDrill`, marketplace/trust/payment services | Ops/product/trust/payment evidence | Optional markdown file via `--out`; optional ops review record via `--persist` | Medium governance artifact writer |
| `scripts/capture-phase61-evidence.js` | `phase61EvidenceCadence` | Latest persisted evidence | Optional evidence cadence snapshot with `--persist` | Low/Medium |
| `scripts/capture-externalization-decision.js` | `externalizationDecision` | Evidence snapshots and benchmark history through service | Optional externalization decision snapshot with `--persist` | Low/Medium |
| `scripts/evaluate-pilot-gate.js` | `pilotDecisionGate` | Evidence, approvals, incidents, reviews through service | Optional pilot decision snapshot with `--persist` | Low/Medium |
| `scripts/phase61-1-remediation-status.js` | Child diagnostic scripts through `spawnSync()` | JSON health, NUL scan, queue verify, dry-run queue repair, stale recovery dry-run, predictive queue inspect, scale latest, pilot gate | None; dry-run children only | Low/Medium remediation status aggregator |
| `scripts/benchmark-file-paths.js` | `database`, `users`, `jobs`, `auditLogSearch`, `opsQueue`, `workroomSearch`, `benchmarkHistory` | File/service paths | Optional benchmark artifact; possible lazy job expiry through jobs service | Medium benchmark side effects |
| `scripts/measure-storage-pressure.js` | `storagePressure` | Filesystem/storage pressure | Storage pressure snapshot by default unless `--no-persist` | Medium metrics artifact writer |
| `scripts/verify-scale-thresholds.js` | `storagePressure`, `scaleThresholds` | Latest storage pressure by default | Optional scale-threshold artifact with `--persist` | Low/Medium |
| `scripts/verify-marketplace-intelligence.js` | Marketplace/product intelligence services | Product/search/workroom/payment intelligence | May capture dashboard rollup if missing | Medium |
| `scripts/verify-repository-contracts.js` | `repositoryContractReport` | Repository contract docs/config/report | None | Low |
| `scripts/scheduler-cadence-report.js` | `schedulerRegistry` | Scheduler registry/history | May register default scheduler records | Medium |

## Maintenance Rules

1. Any new `scripts/*.js` must be added here in the same PR.
2. Any High/Critical script must include:
   - safe default
   - dry-run
   - confirm
   - json
   - docs/runbook entry
   - test coverage
3. No production destructive script may run without approval evidence.
4. No script may introduce external dependencies.
5. No script may bypass file-backed storage discipline.
6. Queue scripts must clearly state whether they touch:
   - pending
   - running
   - failed
   - cancelled
   - dead-letter
   - idempotency
   - summary
   - archive
7. Incident scripts may keep limited standalone filesystem logic if it improves recovery reliability during service-layer corruption.

---

## Commands That Must Not Be Run Without Explicit Incident Procedure

```bash
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
node scripts/repair-indexes.js --confirm
node scripts/repair-queue.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/queue-retry-dlq.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/rebuild-predictive-archive-index.js --confirm --json
node scripts/rebuild-workroom-search.js --all --confirm --json
node scripts/verify-workroom-indexes.js --jobId=job_x --repair --confirm --json
node scripts/compact-predictive-signals.js --confirm --json
node scripts/rollup-trust-snapshots.js --confirm --json
node scripts/run-trust-calibration.js --snapshots --confirm --json
node scripts/run-backup-restore-drill.js --confirm --json
node scripts/cleanup-notification-flood.js --confirm
node scripts/anonymize-user-data.js --userId=usr_x --confirm --approvalId=apr_x --backupRef=brd_or_backup_reference --json
```

Also forbidden:

```bash
rm -rf data
rm data/**/*.json
rm -rf data/jobs/2026-*
pkill node
killall node
kill -9 <pid>
```
