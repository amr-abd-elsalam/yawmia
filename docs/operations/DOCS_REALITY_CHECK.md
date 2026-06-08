# Yawmia Docs Reality Check

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Current date: 2026-06-03  
> Scope: `docs/**/*.md`  
> Status: Documentation reality map and governance baseline  
> Runtime posture: file-backed JSON source of truth  
> Externalization posture: advisory-only  
> Mutation posture: no data mutation, no script execution

---

## Purpose

This document maps the current documentation set and classifies each file by:

```text
- domain
- lifecycle role
- production relevance
- canonical vs historical status
- likely owner
- maintenance action
```

This is a docs reality check, not a deletion plan.

No documentation file is approved for deletion in this pass.

---

## Strategic Posture

Current project posture remains:

```text
Native Node.js 20+ ESM
zero-dependency operational tooling
file-backed JSON persistence
monthly sharding
secondary indexes
filesystem indexes
durable file-backed ops queue
file-backed scheduler registry
file-backed process locks
SSE / Admin SSE
PWA
no PostgreSQL
no Redis
no external queue
no external search
no new dependencies
```

Documentation must reflect that posture.

---

## Documentation Classes

| Class | Meaning |
|---|---|
| Canonical Runbook | Current operational source of truth |
| Canonical Reference | Current architecture/governance reference |
| Evidence Artifact | Historical measurement, review, smoke, or incident evidence |
| Phase Design | Forward-looking phase planning/design document |
| Historical Phase Artifact | Phase-specific artifact retained for evidence/history |
| Index | Navigation / map document |
| Template | Reusable template |
| Review Bundle | Generated code review bundle outside `docs/` |

---

## Maintenance Rules

1. Do not delete documentation only because it is old.
2. Historical evidence docs should be clearly labeled as evidence/history.
3. Canonical docs should be referenced from `docs/README.md`.
4. Phase docs should not imply runtime implementation unless code exists.
5. Externalization docs must remain advisory unless explicitly approved later.
6. Duplicate phase docs should be reviewed for drift before archive/merge.
7. Incident logs should be retained unless a retention policy explicitly says otherwise.
8. Script governance docs must stay synchronized with `scripts/*.js` and tests.
9. Docs that mention dangerous commands must prefer dry-run first.
10. No docs should recommend PostgreSQL, Redis, or external queue implementation as current work.

---

## Top-Level Documentation

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/README.md` | Index | Human navigation index for docs | Canonical docs index | Keep |
| `docs/architecture/PROJECT_MAP.md` | Canonical Reference | Project-wide repository / onboarding / architecture map | Canonical project-wide repository and onboarding reference; start-here map | Keep |
| `docs/architecture/PRODUCTION_FOUNDATION_RESET.md` | Canonical Reference / ADR | Production foundation reset and refactor-first architecture decision | Canonical production reset decision; explicitly not production approval or runtime migration approval | Keep |
| `docs/architecture/PAYMENT_LEDGER_MINIMUM_DESIGN.md` | Canonical Reference / Phase Design | Minimum payment ledger and receipt persistence design | Design target only; ledger not implemented yet; required before production-grade financial correctness | Keep |
| `docs/architecture/SYSTEMS_CATALOG.md` | Canonical Reference | Architecture / system inventory baseline | Canonical architecture reference | Keep |

| `docs/architecture/DATA_CATALOG.md` | Canonical Reference | Collection-level data architecture inventory | Canonical data architecture reference | Keep |
| `docs/architecture/SERVER_CATALOG.md` | Canonical Reference | Server/runtime lifecycle architecture inventory | Canonical server/runtime lifecycle architecture reference | Keep |
| `docs/architecture/EVENTS_CATALOG.md` | Canonical Reference | EventBus/events/fanout architecture inventory | Canonical EventBus/events/fanout architecture reference | Keep |
| `docs/architecture/ROUTES_CATALOG.md` | Canonical Reference | Route registry / handler / service ownership architecture inventory | Canonical route registry / handler / service ownership architecture reference | Keep |
| `docs/design/DESIGN_RESEARCH.md` | Canonical Reference | Product/design research and UX principles | Canonical design input | Keep |
| `docs/privacy/PRIVACY_DATA_MAP.md` | Canonical Reference | Privacy data mapping | Canonical privacy reference | Keep |


### PROJECT_MAP.md Authority Boundary

`docs/architecture/PROJECT_MAP.md` is the canonical project-wide repository / onboarding / architecture map.

It is:

```text
Canonical Reference
Project-wide repository / onboarding / architecture map
Start-here map for repository orientation
Keep
```

It is not:

```text
runtime authority
remediation approval
mutation approval
queue remediation approval
PM2 approval
migration approval
pilot approval
externalization approval
```

Runtime source files remain the source of truth.

Generated review bundles remain review artifacts only.

---

## Deployment Docs

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/deployment/DEPLOYMENT.md` | Canonical Runbook | Short deployment note | Possibly too thin vs runbook | Keep + review later |
| `docs/deployment/DEPLOYMENT_RUNBOOK.md` | Canonical Runbook | Deployment procedure | Canonical deployment runbook | Keep |

---

## Governance Docs

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/governance/ADMIN_RBAC_MODEL.md` | Canonical Reference | Admin RBAC role/capability model | Canonical governance reference | Keep |
| `docs/governance/DATA_GOVERNANCE_RUNBOOK.md` | Canonical Runbook | Data governance workflow | Canonical governance runbook | Keep |
| `docs/governance/PRIVACY_REQUEST_RUNBOOK.md` | Canonical Runbook | Privacy request workflow | Canonical privacy runbook | Keep |

---

## Incident Docs

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/incidents/INCIDENT_RUNBOOKS.md` | Canonical Runbook | Operational incident runbooks | Canonical incident runbook | Keep |
| `docs/incidents/POSTMORTEM_TEMPLATE.md` | Template | Postmortem template | Canonical template | Keep |

---

## Operations Docs

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/operations/ACTIVE_QUEUE_WORKER_FORENSIC_AUDIT_2026-05-31.md` | Evidence Artifact | Active worker forensic review | Historical evidence | Keep |
| `docs/operations/DATA_MIGRATION_FORMATS.md` | Canonical Reference | Migration data formats | Canonical reference | Keep |
| `docs/operations/DOCS_REALITY_CHECK.md` | Index / Governance | Current docs map | Canonical docs reality check | Keep |
| `docs/operations/EXPIRY_WARNING_NOTIFICATION_FLOOD_REVIEW_2026-06-02.md` | Evidence Artifact | Expiry warning flood review | Historical incident/product evidence | Keep |
| `docs/operations/EXTERNALIZATION_READINESS.md` | Canonical Reference | Advisory externalization readiness | Canonical but advisory-only | Keep |
| `docs/operations/LOCATION_DIRECTIONS_SMOKE_2026-05-29.md` | Evidence Artifact | Location/directions smoke review | Historical evidence | Keep |
| `docs/operations/MULTI_INSTANCE_BOUNDARY.md` | Canonical Reference | Multi-instance boundary | Canonical ops boundary | Keep |
| `docs/operations/OPERATIONS_RUNBOOK.md` | Canonical Runbook | Operations procedures | Canonical runbook | Keep |
| `docs/operations/PM2_MANAGED_YAWMIA_QUEUE_WORKER_RUNBOOK.md` | Canonical Runbook | PM2 queue worker handling | Canonical queue/PM2 runbook | Keep |
| `docs/operations/PREDICTIVE_SCAN_FLOOD_REVIEW_2026-05-31.md` | Evidence Artifact | Predictive scan flood review | Historical evidence | Keep |
| `docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md` | Evidence Artifact | Queue compaction dry-run evidence | Historical evidence | Keep |
| `docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md` | Evidence Artifact | Queue drain dry-run evidence | Historical evidence | Keep |
| `docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md` | Evidence Artifact | Queue dry-run review | Historical evidence | Keep |
| `docs/operations/QUEUE_REMEDIATION_APPROVAL_RUNBOOK.md` | Canonical Runbook | Queue remediation approval workflow | Canonical queue approval runbook | Keep |
| `docs/operations/QUEUE_REMEDIATION_LOG_2026-05-28.md` | Evidence Artifact | Queue remediation log | Historical evidence | Keep |
| `docs/operations/QUEUE_REPAIR_CONFIRM_REVIEW_2026-05-29.md` | Evidence Artifact | Queue repair confirm review | Historical evidence | Keep |
| `docs/operations/RATE_LIMIT_FALSE_POSITIVE_SMOKE_2026-05-30.md` | Evidence Artifact | Rate-limit false positive smoke | Historical evidence | Keep |
| `docs/operations/SCALE_LIMITS.md` | Canonical Reference | File-backed scale limits | Canonical scale reference | Keep |
| `docs/operations/SCRIPTS_CATALOG.md` | Canonical Reference | Script governance catalog | Canonical scripts governance source | Keep |
| `docs/operations/STALE_RUNNING_RECOVERY_DRY_RUN_2026-05-30.md` | Evidence Artifact | Stale running recovery dry-run | Historical evidence | Keep |
| `docs/operations/STALE_RUNNING_RECOVERY_OBSERVATION_2026-05-30.md` | Evidence Artifact | Stale running observation | Historical evidence | Keep |
| `docs/operations/STORAGE_PRESSURE_RUNBOOK.md` | Canonical Runbook | Storage pressure operations | Canonical storage runbook | Keep |
| `docs/operations/WORKROOM_MESSAGING_SMOKE_2026-05-28.md` | Evidence Artifact | Workroom messaging smoke | Historical evidence | Keep |

---

## Phase 60 Docs

Phase 60 docs are advisory/rehearsal-oriented. They must not imply that external runtime infrastructure has been implemented.

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/phases/phase60/PHASE60_AUTH_PROVIDER_STRATEGY.md` | Phase Design | Auth provider strategy | Docs-only planning | Keep |
| `docs/phases/phase60/PHASE60_AUTH_SECURITY_REVIEW.md` | Phase Design | Auth security review | Docs-only planning | Keep |
| `docs/phases/phase60/PHASE60_EGYPT_SENDER_ID_RUNBOOK.md` | Phase Design / Runbook | Egypt sender ID planning | Docs-only planning | Keep |
| `docs/phases/phase60/PHASE60_EVENT_BRIDGE_DESIGN.md` | Phase Design | Event bridge design | Docs-only planning | Keep |
| `docs/phases/phase60/PHASE60_EXTERNALIZATION_DECISION.md` | Phase Design | Externalization decision | Advisory-only | Keep |
| `docs/phases/phase60/PHASE60_EXTERNAL_QUEUE_DECISION.md` | Phase Design | External queue decision | Advisory-only; no external queue implemented | Keep |
| `docs/phases/phase60/PHASE60_EXTERNAL_SEARCH_DECISION.md` | Phase Design | External search decision | Advisory-only; no external search implemented | Keep |
| `docs/phases/phase60/PHASE60_MIGRATION_REHEARSAL.md` | Phase Design | Migration rehearsal | Advisory/rehearsal | Keep |
| `docs/phases/phase60/PHASE60_OBJECT_STORAGE_DECISION.md` | Phase Design | Object storage decision | Advisory-only | Keep |
| `docs/phases/phase60/PHASE60_REPOSITORY_BOUNDARIES.md` | Phase Design | Repository boundary planning | Docs-only boundaries | Keep |
| `docs/phases/phase60/PHASE60_ROLLBACK_PLAN.md` | Phase Design / Runbook | Rollback plan | Planning/runbook | Keep |
| `docs/phases/phase60/PHASE60_SSE_FANOUT_DESIGN.md` | Phase Design | SSE fanout design | Docs-only planning | Keep |

---

## Phase 61 Docs

Phase 61 docs define evidence cadence, rollback rehearsal, repository contracts, and pilot gating.

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/phases/phase61/PHASE61_DEEP_MIGRATION_REHEARSAL.md` | Phase Design | Deep migration rehearsal | Planning/evidence | Keep |
| `docs/phases/phase61/PHASE61_EVENT_BRIDGE_PILOT_PLAN.md` | Phase Design | Event bridge pilot plan | Docs-only planning | Keep |
| `docs/phases/phase61/PHASE61_EVIDENCE_CADENCE.md` | Canonical Reference / Phase Design | Phase 61 evidence cadence | Canonical phase evidence doc | Keep |
| `docs/phases/phase61/PHASE61_PILOT_CANDIDATE_DECISION.md` | Phase Design | Pilot candidate decision | Advisory gate | Keep |
| `docs/phases/phase61/PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md` | Phase Design | Repository adapter contracts | Docs-only contracts | Keep |
| `docs/phases/phase61/PHASE61_ROLLBACK_REHEARSAL_REPORT.md` | Evidence Artifact | Rollback rehearsal report | Historical/evidence | Keep |
| `docs/phases/phase61/PHASE61_SSE_FANOUT_PILOT_PLAN.md` | Phase Design | SSE fanout pilot plan | Docs-only planning | Keep |

---

## Phase 61.2 Docs

Phase 61.2 docs appear to extend or supersede some Phase 61 docs. They should be checked for drift, not deleted automatically.

| Doc | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `docs/phases/phase61-2/PHASE61_2_DEEP_MIGRATION_REHEARSAL.md` | Phase Design | Deep migration rehearsal v2 | Potential superseding doc | Keep + compare with Phase 61 equivalent |
| `docs/phases/phase61-2/PHASE61_2_EVENT_BRIDGE_PILOT_PLAN.md` | Phase Design | Event bridge pilot v2 | Potential superseding doc | Keep + compare |
| `docs/phases/phase61-2/PHASE61_2_EVIDENCE_CADENCE.md` | Canonical Reference / Phase Design | Evidence cadence v2 | Potential canonical successor | Keep + compare |
| `docs/phases/phase61-2/PHASE61_2_PILOT_CANDIDATE_DECISION.md` | Phase Design | Pilot candidate decision v2 | Potential superseding doc | Keep + compare |
| `docs/phases/phase61-2/PHASE61_2_REMEDIATION_OPERATIONS.md` | Canonical Runbook / Phase Design | Remediation operations | Likely important current ops doc | Keep |
| `docs/phases/phase61-2/PHASE61_2_REPOSITORY_ADAPTER_CONTRACTS.md` | Phase Design | Repository contracts v2 | Potential superseding doc | Keep + compare |
| `docs/phases/phase61-2/PHASE61_2_ROLLBACK_REHEARSAL_REPORT.md` | Evidence Artifact | Rollback rehearsal report v2 | Historical/evidence | Keep |
| `docs/phases/phase61-2/PHASE61_2_SSE_FANOUT_PILOT_PLAN.md` | Phase Design | SSE fanout pilot v2 | Potential superseding doc | Keep + compare |

---

## Root Review Bundles

These are intentionally outside `docs/`.

| Artifact | Class | Purpose | Reality Status | Action |
|---|---|---|---|---|
| `CODEBASE_PART1.md` | Review Bundle | Config + server core + router | Generated review artifact | Keep at root |
| `CODEBASE_PART2.md` | Review Bundle | Backend services | Generated review artifact | Keep at root |
| `CODEBASE_PART3.md` | Review Bundle | Middleware + handlers | Generated review artifact | Keep at root |
| `CODEBASE_PART4.md` | Review Bundle | Frontend + scripts | Generated review artifact | Keep at root |

---

## Docs Duplication / Drift Watchlist

No deletion is recommended now.

| Area | Potential Issue | Why It Matters | Next Action |
|---|---|---|---|
| `docs/phases/phase61/` vs `docs/phases/phase61-2/` | Similar document families | Phase 61.2 may supersede Phase 61, but both may hold evidence | Compare and mark canonical/superseded later |
| Queue review logs in `docs/operations/QUEUE_*` | Many evidence artifacts | Useful incident trail but can clutter navigation | Keep; optionally add evidence index later |
| Phase 60 externalization docs | Many advisory docs | Must not be misread as implementation approval | Keep advisory-only disclaimers |
| Deployment docs | `DEPLOYMENT.md` is much smaller than `DEPLOYMENT_RUNBOOK.md` | Thin docs may confuse operators | Later: make `DEPLOYMENT.md` a pointer |
| Scripts governance docs | Rapidly changing | Must stay synced with scripts/tests | Continue tests-first catalog maintenance |

---

## Canonical Docs Recommended Index

These should be linked from `docs/README.md` as primary docs:

```text
docs/operations/DOCS_REALITY_CHECK.md
docs/architecture/PROJECT_MAP.md
docs/architecture/PRODUCTION_FOUNDATION_RESET.md
docs/architecture/PAYMENT_LEDGER_MINIMUM_DESIGN.md
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
docs/operations/SCRIPTS_CATALOG.md
docs/operations/OPERATIONS_RUNBOOK.md
docs/operations/STORAGE_PRESSURE_RUNBOOK.md
docs/operations/SCALE_LIMITS.md
docs/operations/MULTI_INSTANCE_BOUNDARY.md
docs/operations/EXTERNALIZATION_READINESS.md
docs/operations/QUEUE_REMEDIATION_APPROVAL_RUNBOOK.md
docs/operations/PM2_MANAGED_YAWMIA_QUEUE_WORKER_RUNBOOK.md
docs/deployment/DEPLOYMENT_RUNBOOK.md
docs/incidents/INCIDENT_RUNBOOKS.md
docs/governance/ADMIN_RBAC_MODEL.md
docs/governance/DATA_GOVERNANCE_RUNBOOK.md
docs/governance/PRIVACY_REQUEST_RUNBOOK.md
docs/privacy/PRIVACY_DATA_MAP.md
docs/design/DESIGN_RESEARCH.md
```

---

## Docs Reality Risks

| Risk | Status | Recommendation |
|---|---|---|
| Runtime externalization ambiguity | Controlled | Keep advisory-only language |
| Phase duplication / drift | Present | Compare Phase 61 vs Phase 61.2 later |
| Incident evidence clutter | Present but acceptable | Add evidence index later if needed |
| Script docs drift | Actively controlled by tests | Continue static catalog tests |
| Thin deployment pointer docs | Present | Convert thin docs to pointer docs later |
| Missing docs-wide inventory test | Present | Add test in this patch |

---

## Next Docs Governance Steps

Recommended next patches:

```text
Patch 8A: Add this docs reality check.
Patch 8B: Add static docs inventory test.
Patch 8C: Link this file from docs/README.md.
Patch 8D: Later compare phase61 vs phase61-2 for drift.
Patch 8E: Later create operations evidence index if needed.
```

---

## Final Position

No docs deletion now.

No archival now.

No runtime changes.

No source data mutation.

No externalization.

No new dependencies.

This file is the checkpoint before returning to lower-risk script audit.
