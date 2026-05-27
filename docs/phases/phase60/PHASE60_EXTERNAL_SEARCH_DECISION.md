# يوميّة — Phase 60 External Search Decision

## Current search stack

```text
Arabic normalizer
Arabic Search Tokens V2
search index
query index
audit token index
weighted relevance
matching intelligence explanations
search analytics
zero-result analytics
```

## Evidence needed

```text
audit token file pressure
slow query telemetry
fallback frequency
candidate cap exceeded
search p95 critical
zero-result trend
index rebuild failures
```

## Mitigation first

```bash
node scripts/rebuild-audit-index.js
node scripts/verify-audit-index.js
node scripts/rebuild-search-relevance.js
node scripts/benchmark-file-paths.js --json
```

## Future external search requirements

```text
Arabic normalization
Arabic tokenization
weighted ranking
explainability
privacy-safe query analytics
zero-result analytics
rebuild strategy
fallback strategy
```

## Safety

```text
No black-box punitive ranking.
No auto-ban from search/matching signals.
No public PII leakage.
```

## Phase 60 rule

No external search by default.
