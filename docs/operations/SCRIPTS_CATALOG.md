# Yawmia Scripts Catalog

> Version: 0.57.0  
> Scope: `scripts/*.js` operational tooling  
> Status: Governance baseline  
> Last reviewed: 2026-06-02

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
| `scripts/scheduler-cadence-report.js` | Scheduler cadence visibility | Safe Read-Only | Low | Scheduler ops |
| `scripts/verify-admin-rbac.js` | Verify admin RBAC model | Safe Read-Only | Low | Governance |
| `scripts/verify-audit-index.js` | Verify audit index | Safe Read-Only | Low | Audit hygiene |
| `scripts/verify-marketplace-intelligence.js` | Verify product/marketplace rollups | Safe Read-Only | Low | Product ops |
| `scripts/verify-privacy-governance.js` | Verify privacy/governance workflows | Safe Read-Only | Low | Governance |
| `scripts/verify-repository-contracts.js` | Verify repository adapter contracts | Safe Read-Only | Low/Medium | Phase 61 readiness |
| `scripts/verify-scale-thresholds.js` | Verify scale thresholds | Safe Read-Only or metrics persist | Low/Medium | Phase 59 |
| `scripts/verify-workroom-indexes.js` | Verify workroom search indexes | Safe Read-Only unless repair mode exists | Low/High | Must document repair flags |

---

## Repair Scripts

| Script | Purpose | Safe Default | Confirm Required | Production | Risk | Decision |
|---|---|---:|---:|---|---|---|
| `scripts/repair-indexes.js` | Rebuild secondary indexes from source records | Yes | Yes | Approval Required | High | Keep |
| `scripts/repair-queue.js` | Repair queue summary/location index | Yes | Yes + approval id | Approval Required | High | Keep |
| `scripts/quarantine-corrupt-json.js` | Move corrupt JSON into quarantine | Must be dry-run first | Yes | Emergency Only | High | Keep after safety review |
| `scripts/recover-stale-running-jobs.js` | Recover stale running queue jobs | Must be dry-run first | Yes | Emergency Only | High/Critical | Keep after safety review |
| `scripts/queue-retry-dlq.js` | Retry dead-letter queue jobs | Must be dry-run first | Yes | Emergency Only | High | Keep |
| `scripts/queue-drain.js` | Drain queue | Must be dry-run first | Yes | Emergency Only | Critical | Keep only with strict controls |

---

## Recovery / Incident Scripts

| Script | Incident Class | Production | Risk | Decision |
|---|---|---|---|---|
| `scripts/cleanup-notification-flood.js` | Notification flood quarantine | Emergency Only | High | Keep + document |
| `scripts/quarantine-corrupt-json.js` | JSON corruption quarantine | Emergency Only | High | Keep + tests |
| `scripts/find-null-json-files.js` | JSON corruption diagnosis | Safe Read-Only | Low | Keep |
| `scripts/report-duplicate-records.js` | Duplicate physical record diagnosis | Safe Read-Only | Low | Keep |
| `scripts/inspect-predictive-scan-queue.js` | predictive_scan flood diagnosis | Safe Read-Only | Low | Keep |
| `scripts/recover-stale-running-jobs.js` | Queue stale running recovery | Emergency Only | High/Critical | Keep with approval |
| `scripts/export-incident-timeline.js` | Incident timeline export | Safe Read-Only | Low | Keep |

---

## Migration / Externalization Scripts

These are evidence and rehearsal tools only. They do **not** implement PostgreSQL, Redis, external queue, or external search.

| Script | Purpose | Production | Mutation | Risk | Decision |
|---|---|---|---|---|---|
| `scripts/export-migration-snapshot.js` | Export sanitized NDJSON snapshot | Manual With Caution | Writes snapshot artifacts | High | Keep |
| `scripts/validate-migration-snapshot.js` | Validate snapshot manifest/NDJSON/checksums/redaction | Safe Read-Only | No | Low | Keep |
| `scripts/run-migration-rehearsal.js` | Run safe migration rehearsal | Manual With Caution | Writes rehearsal report | Medium | Keep |
| `scripts/run-rollback-rehearsal.js` | Run rollback rehearsal | Manual With Caution | Writes rehearsal report | Medium | Keep |
| `scripts/capture-externalization-decision.js` | Capture advisory Phase 60 decision | Manual With Caution | Optional metrics snapshot | Medium | Keep |
| `scripts/capture-phase61-evidence.js` | Capture Phase 61 evidence cadence | Manual With Caution | Metrics snapshot | Medium | Keep |
| `scripts/evaluate-pilot-gate.js` | Evaluate Phase 61 pilot gate | Safe/Manual | Optional snapshot | Low/Medium | Keep |
| `scripts/phase61-1-remediation-status.js` | Phase 61.1 remediation status | Unknown | Unknown | Unknown | Keep until direct review |

---

## Backup / Restore Scripts

| Script | Purpose | Production | Risk | Notes |
|---|---|---|---|---|
| `scripts/backup.js` | Copy data directory to timestamped backup | Manual With Caution | Low/Medium | Should add `--json` + manifest |
| `scripts/run-backup-restore-drill.js` | Validate backup restore drill | Manual With Caution | Medium | Writes drill report/temp restore |

---

## Benchmark Scripts

| Script | Purpose | Production | Risk | Notes |
|---|---|---|---|---|
| `scripts/benchmark.js` | HTTP API benchmark against running server | Manual Only | Low | Add `--json` |
| `scripts/benchmark-file-paths.js` | File/service path benchmark evidence | Manual With Caution | Low/Medium | Good `--json`, optional persist |
| `scripts/list-benchmark-history.js` | List persisted benchmark artifacts | Safe Read-Only | Low | Keep |

---

## Export / Privacy Scripts

| Script | Purpose | Production | Risk | Controls |
|---|---|---|---|---|
| `scripts/export-user-data.js` | Export one user's data | Manual Only | Medium | Add explicit `--json` semantics |
| `scripts/anonymize-user-data.js` | Irreversible user anonymization | Approval Required | Critical | Default dry-run, confirm required; add backup/approval guard |
| `scripts/export-migration-snapshot.js` | Sanitized NDJSON migration export | Manual With Caution | High | Default dry-run, confirm required |

---

## Rebuild / Derived Artifact Scripts

| Script | Artifact | Production | Risk | Decision |
|---|---|---|---|---|
| `scripts/rebuild-audit-index.js` | Audit search index | Approval Required | High | Keep + add dry-run/json |
| `scripts/rebuild-counters.js` | Direct offer counter file | Approval Required | High | Keep + add dry-run/json |
| `scripts/rebuild-predictive-archive-index.js` | Predictive archive index | Manual With Caution | Medium/High | Keep |
| `scripts/rebuild-search-relevance.js` | Search/query indexes | Approval Required | High | Keep |
| `scripts/rebuild-workroom-search.js` | Workroom search indexes | Manual With Caution | Medium/High | Keep |
| `scripts/repair-indexes.js` | Secondary indexes | Approval Required | High | Keep |

---

## Queue Ops Scripts

| Script | Purpose | Production | Risk | Policy |
|---|---|---|---|---|
| `scripts/verify-queue.js` | Verify queue health | Safe Read-Only | Low | Safe |
| `scripts/repair-queue.js` | Repair queue summary/index | Approval Required | High | Dry-run first, approval id for confirm |
| `scripts/compact-queue.js` | Archive/compact queue | Approval Required | High | Dry-run first |
| `scripts/queue-retry-dlq.js` | Retry DLQ | Emergency Only | High | Dry-run first |
| `scripts/queue-drain.js` | Drain queue | Emergency Only | Critical | Never without explicit approval |
| `scripts/recover-stale-running-jobs.js` | Recover stale running | Emergency Only | High/Critical | Dry-run and quiet-state proof required |
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
| `scripts/anonymize-user-data.js` | Privacy / Destructive | Yes | Approval Required | Yes | Possible | No | Critical | Keep + backup/approval/tests |
| `scripts/backup.js` | Backup | Yes | Manual With Caution | Backup only | No | No | Low/Medium | Keep |
| `scripts/benchmark-file-paths.js` | Benchmark | Yes | Manual With Caution | Optional metrics | No | Read only | Low/Medium | Keep |
| `scripts/benchmark.js` | Benchmark | Yes | Manual Only | No | No | No | Low | Keep + json |
| `scripts/bundle-for-review.js` | Bundle/Review | Partial | CI/Bundle Only | Writes bundles | Overwrites bundles | No | Medium | Keep |
| `scripts/capture-externalization-decision.js` | Migration Evidence | Yes | Manual | Optional metrics | No | No | Medium | Keep |
| `scripts/capture-phase61-evidence.js` | Migration Evidence | Unknown | Manual | Metrics | No | No | Medium | Keep |
| `scripts/cleanup-attachments.js` | Maintenance | Yes | Approval Required | Yes with `--confirm` | Possible delete with `--confirm` | No | High | Hardened: dry-run default + confirm + json |
| `scripts/cleanup-notification-flood.js` | Incident Recovery | Yes | Emergency Only | Yes | Moves quarantine | No | High | Keep + tests/docs |
| `scripts/compact-counters.js` | Maintenance | Yes | Approval Required | Derived write with `--confirm` | No | No | High | Hardened: dry-run default + confirm + json |
| `scripts/compact-predictive-signals.js` | Maintenance | Partial | Approval Required | Archive | Possible | No | High | Add dry-run/json |
| `scripts/compact-queue.js` | Queue Ops | Yes | Approval Required | Yes | Archive | Yes | High | Keep |
| `scripts/compact-workrooms.js` | Maintenance | Yes | Approval Required | Workroom sidecar mutation with `--confirm` | Possible derived cleanup | No | High | Hardened: dry-run default + confirm + json |
| `scripts/evaluate-pilot-gate.js` | Governance | Yes | Manual | Optional persist | No | No | Low/Medium | Keep |
| `scripts/export-incident-timeline.js` | Incident Export | Yes | Safe Read-Only | No | No | No | Low | Add json |
| `scripts/export-migration-snapshot.js` | Migration Export | Yes | Manual With Caution | Artifact write | Can overwrite output | No | High | Keep |
| `scripts/export-user-data.js` | Privacy Export | Partial | Manual | Output file only | No | No | Medium | Keep + json |
| `scripts/find-null-json-files.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/generate-vapid-keys.js` | Setup | Yes | Manual Setup | No | No | No | Low | Keep |
| `scripts/inspect-predictive-scan-queue.js` | Queue Diagnostic | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/list-benchmark-history.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/measure-storage-pressure.js` | Verify / Metrics | Partial | Manual With Caution | Metrics write | No | No | Medium | Keep |
| `scripts/migrate.js` | Migration | Partial | Manual/Startup | Yes | No | No | High | Keep + json/docs |
| `scripts/ops-weekly-review.js` | Governance | Partial | Manual | Optional review write | No | Read only | Medium | Keep |
| `scripts/phase61-1-remediation-status.js` | Verify/Incident | Unknown | Unknown | Unknown | Unknown | Unknown | Unknown | Direct review |
| `scripts/postdeploy-smoke.js` | Smoke | Unknown | Safe Read-Only | No expected | No | No | Low | Keep |
| `scripts/predeploy-check.js` | Deploy Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Keep |
| `scripts/quarantine-corrupt-json.js` | Recovery | Unknown | Emergency Only | Yes | Moves quarantine | No | High | Direct review + tests |
| `scripts/queue-drain.js` | Queue Ops / Destructive | Unknown | Emergency Only | Yes | Possible | Yes | Critical | Strict approval |
| `scripts/queue-retry-dlq.js` | Queue Recovery | Unknown | Emergency Only | Yes | No | Yes | High | Direct review |
| `scripts/rebuild-audit-index.js` | Rebuild Index | Yes | Approval Required | Derived write with `--confirm` | No | No | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-counters.js` | Rebuild Counters | Yes | Approval Required | Derived write with `--confirm` | No | No | High | Hardened: dry-run default + confirm + json |
| `scripts/rebuild-predictive-archive-index.js` | Rebuild Index | Unknown | Manual | Derived write | No | No | Medium/High | Direct review |
| `scripts/rebuild-search-relevance.js` | Rebuild Index | Unknown | Approval Required | Derived write | No | No | High | Direct review |
| `scripts/rebuild-workroom-search.js` | Rebuild Index | Unknown | Manual | Derived write | No | No | Medium/High | Direct review |
| `scripts/recover-stale-running-jobs.js` | Queue Recovery | Unknown | Emergency Only | Yes | No | Yes | High/Critical | Direct review |
| `scripts/repair-indexes.js` | Repair Index | Yes | Approval Required | Yes | No | No | High | Keep + json/tests |
| `scripts/repair-queue.js` | Queue Repair | Yes | Approval Required | Yes | No | Yes | High | Keep + tests |
| `scripts/report-duplicate-records.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Keep |
| `scripts/reset-dev-data.js` | Dev Destructive | Yes | Dev Only / Never Production | Yes | Yes | No | Critical | Keep dev only |
| `scripts/rollup-product-intelligence.js` | Rollup | Unknown | Manual/Scheduler Equivalent | Metrics write | No | No | Medium | Direct review |
| `scripts/rollup-trust-snapshots.js` | Rollup | Unknown | Manual/Scheduler Equivalent | Metrics/archive | Possible | No | Medium/High | Direct review |
| `scripts/run-backup-restore-drill.js` | Backup Verify | Unknown | Manual With Caution | Report/temp restore | Temp cleanup | No | Medium | Direct review |
| `scripts/run-migration-rehearsal.js` | Migration Rehearsal | Unknown | Manual | Report | No source mutation expected | No | Medium | Direct review |
| `scripts/run-rollback-rehearsal.js` | Rollback Rehearsal | Unknown | Manual | Report | No source mutation expected | No | Medium | Direct review |
| `scripts/run-trust-calibration.js` | Trust Calibration | Unknown | Manual/Scheduler Equivalent | Metrics | No | No | Medium | Direct review |
| `scripts/scheduler-cadence-report.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Direct review |
| `scripts/validate-migration-snapshot.js` | Verify | Unknown | Safe Read-Only | No | No | No | Low | Direct review |
| `scripts/verify-admin-rbac.js` | Verify | Unknown | Safe Read-Only | No | No | No | Low | Direct review |
| `scripts/verify-audit-index.js` | Verify | Unknown | Safe Read-Only | No | No | No | Low | Direct review |
| `scripts/verify-data-json.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-file-health.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-marketplace-intelligence.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Direct review |
| `scripts/verify-privacy-governance.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Direct review |
| `scripts/verify-production-readiness.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-queue.js` | Verify | Yes | Safe Read-Only | No | No | No | Low | Keep |
| `scripts/verify-repository-contracts.js` | Verify | Unknown | Safe Read-Only | No expected | No | No | Low | Direct review |
| `scripts/verify-scale-thresholds.js` | Verify | Unknown | Safe/Metric | Optional persist | No | No | Low/Medium | Direct review |
| `scripts/verify-workroom-indexes.js` | Verify | Unknown | Safe unless repair | Unknown | No | No | Low/High | Direct review |

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
node scripts/export-migration-snapshot.js --dry-run --json
```

### Emergency Only / Critical

Never run without explicit incident approval:

```bash
node scripts/queue-drain.js --confirm --json
node scripts/anonymize-user-data.js --userId=usr_x --confirm
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
| `scripts/phase61-1-remediation-status.js` | If confirmed one-time and no docs/tests reference it |
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
node scripts/queue-drain.js --confirm --json
node scripts/cleanup-notification-flood.js --confirm
node scripts/anonymize-user-data.js --confirm
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
