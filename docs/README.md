# Yawmia Documentation Index

> Project: يوميّة — Yawmia  
> Version posture: v0.57.0  
> Architecture posture: file-backed JSON source of truth  
> Phase posture: Phase 61.3 cleanup and organization  
> Externalization posture: advisory-only  
> Pilot posture: blocked by default

---

## Purpose

This directory organizes Yawmia operational, architecture, governance, design, and phase documentation.

Start with `docs/architecture/PROJECT_MAP.md` for repository orientation, onboarding, and safe source-tree navigation.

`PROJECT_MAP.md` is the start-here map for:

```text
repo layout
backend/frontend/scripts/tests/docs orientation
canonical catalog selection
safe review workflow
source files vs generated CODEBASE_PART bundles
documentation update scope
```

Current docs reality map:

```text
docs/operations/DOCS_REALITY_CHECK.md
```

Use it to distinguish canonical runbooks, phase design docs, and historical evidence artifacts before editing or archiving documentation.

Phase 61.3 keeps generated review bundles in the repository root:

```text
CODEBASE_PART1.md
CODEBASE_PART2.md
CODEBASE_PART3.md
CODEBASE_PART4.md
```

They remain at root intentionally for review workflows.

---

## Architecture / Project, System, Data, Server, Events & Routes Maps

```text
docs/architecture/PROJECT_MAP.md
docs/architecture/PRODUCTION_FOUNDATION_RESET.md
docs/architecture/PAYMENT_LEDGER_MINIMUM_DESIGN.md
docs/architecture/POSTGRESQL_PAYMENT_LEDGER_SCHEMA_DRAFT.md
docs/architecture/PAYMENT_REPOSITORY_BOUNDARY_PREPARATION.md
docs/architecture/SYSTEMS_CATALOG.md
docs/architecture/DATA_CATALOG.md
docs/architecture/SERVER_CATALOG.md
docs/architecture/EVENTS_CATALOG.md
docs/architecture/ROUTES_CATALOG.md
```

`PROJECT_MAP.md` is the canonical project-wide repository/onboarding map.

`PRODUCTION_FOUNDATION_RESET.md` is the canonical production foundation reset ADR.

`PAYMENT_LEDGER_MINIMUM_DESIGN.md` is the minimum payment ledger and persisted receipt design target. It is not implemented yet and does not approve production readiness.

`POSTGRESQL_PAYMENT_LEDGER_SCHEMA_DRAFT.md` is the PostgreSQL schema draft for the future payment ledger implementation. It is migration preparation only and does not execute or approve a migration.

`PAYMENT_REPOSITORY_BOUNDARY_PREPARATION.md` defines the repository and transaction boundaries needed before a future payment runtime migration. It is design-only and does not switch storage.

`SYSTEMS_CATALOG.md` is the canonical system-level architecture inventory baseline.

It maps current runtime systems across:

```text
routes
handlers
services
data collections
events
operational scripts
source vs derived data boundaries
risks
```

`DATA_CATALOG.md` is the canonical collection-level data architecture inventory baseline.

It maps current data architecture across:

```text
collections
paths
record prefixes
source vs derived boundaries
sharding
secondary indexes
filesystem indexes
queue storage
metrics/evidence artifacts
governance artifacts
repair/rebuild ownership
privacy sensitivity
operational risks
```

`SERVER_CATALOG.md` is the canonical server/runtime lifecycle architecture inventory baseline.

It maps current server runtime behavior across:

```text
server.js startup lifecycle
middleware ordering
static-before-API serving
router registry
route-specific middleware
handler ownership
EventBus bootstrap
timers and intervals
queue worker lifecycle
scheduler registry lifecycle
process lock lifecycle
SSE/Admin SSE lifecycle
maintenance and read-only replica guards
graceful shutdown
```

All architecture catalogs are documentation-only.

They do not authorize:

```text
runtime changes
data mutation
queue remediation
notification quarantine execution
index repair execution
migration execution
externalization
PostgreSQL
Redis
external queue
external search
```

`EVENTS_CATALOG.md` is the canonical EventBus/events/fanout architecture inventory baseline.

It maps current event architecture across:

```text
EventBus model
event emitters
event listeners
listener bootstrap order
event durability classes
notifications
SSE/Admin SSE/Live Feed fanout
Web Push
admin alerts
incident triggers
direct offer counters
analytics cache invalidation
queue/scheduler/governance visibility events
event risks and invariants
```

`ROUTES_CATALOG.md` is the canonical route registry / handler / service ownership architecture inventory baseline.

`PROJECT_MAP.md` maps repository structure, onboarding paths, source tree, backend/frontend/scripts/tests/docs maps, and safe review workflows.

It maps current routing architecture across:

```text
server/router.js routes[] registry
route definition format
global middleware vs route-specific middleware
route auth/role/admin/capability protection
handler ownership
service ownership
read/write/SSE/download classification
source collections touched by route group
derived artifacts touched by route group
read-only replica route posture
maintenance mode route posture
query-token download exceptions
route risks and invariants
```
---

## Design

```text
docs/design/DESIGN_RESEARCH.md
```

Design principles:

```text
Arabic-first
RTL
mobile-first
low-literacy UX
dark rounded high-contrast UI
large touch targets
progressive disclosure
action-first admin dashboards
```

---

## Phase 60

```text
docs/phases/phase60/
```

Phase 60 documents are advisory and rehearsal-oriented.

They do not implement:

```text
PostgreSQL
external queue
external search
object storage migration
runtime repository switching
dual-write
cutover
Firebase
Cequens
VictoryLink
dynamic OTP routing
```

Auth docs remain docs-first.

---

## Phase 61

```text
docs/phases/phase61/
```

Phase 61 documents define:

```text
evidence cadence
pilot gate
rollback rehearsal
repository contract readiness
EventBus/SSE planning
```

Default posture:

```text
pilotAllowed=false
implementationAllowed=false
runtimeSwitchEnabled=false
docsOnly=true
```

---

## Phase 61.2

```text
docs/phases/phase61-2/
```

Phase 61.2 operationalizes:

```text
evidence cadence
remediation ownership
deep migration rehearsal planning
rollback rehearsal discipline
pilot candidate decision discipline
repository adapter contracts
EventBus bridge planning
SSE fanout planning
auth strategy documentation
```

No runtime externalization is enabled.

---

## Operations

```text
docs/operations/
docs/deployment/
docs/incidents/
```

Operational docs cover:

```text
deployment
production readiness
incident runbooks
postmortems
storage pressure
scale limits
multi-instance boundary
externalization readiness
migration data formats
```

Important principle:

```text
Heavy scans must remain script/queue/manual operations.
HTTP readiness and dashboards should be lightweight and artifact-based.
```

---

## Governance and Privacy

```text
docs/governance/
docs/privacy/
```

Governance docs cover:

```text
admin RBAC
dangerous action approval
privacy requests
privacy data map
data governance
```

Privacy requirements:

```text
no token leakage
no raw OTP storage
no raw search query storage by default
privacy export/anonymization workflows preserved
```

---

## Review Bundles

Review bundles remain at repository root by design:

```text
CODEBASE_PART1.md
CODEBASE_PART2.md
CODEBASE_PART3.md
CODEBASE_PART4.md
```

Generate them with:

```bash
node scripts/bundle-for-review.js
```

---

## Phase 61.3 Cleanup Rules

Phase 61.3 may:

```text
organize docs under docs/
update references
stabilize tests
add safe reset workflow
recapture evidence
```

Phase 61.3 must not:

```text
delete data without separate approval
externalize data
add PostgreSQL
add external queue
add external search
add Firebase/Cequens/VictoryLink
add new dependencies
change OTP runtime architecture
enable pilot
```

---

## Safe Data Reset

Development data reset is dry-run-first:

```bash
node scripts/reset-dev-data.js --dry-run --json
```

Mutation requires explicit confirm:

```bash
node scripts/reset-dev-data.js --confirm --json
```

Backups and logs are opt-in:

```bash
node scripts/reset-dev-data.js --confirm --include-backups --include-logs --json
```

Production reset is blocked by default.

---

## Current Strategic Decision

```text
Stay file-backed.
Continue evidence cadence.
Continue remediation ownership.
Do not start Phase 62.
Do not externalize.
Do not implement auth provider runtime.
```
