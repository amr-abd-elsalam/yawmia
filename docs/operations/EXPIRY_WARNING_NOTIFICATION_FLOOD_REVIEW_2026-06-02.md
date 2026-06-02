# Expiry Warning Notification Flood Review — 2026-06-02

## Summary

On 2026-06-02, Yawmia production/dev data showed a severe `job_expiry_warning`
notification flood.

The root cause was duplicate physical job JSON records for the same logical job ID,
combined with a non-durable notification deduplication layer and an expiry-warning
sweep that read from actual walked file paths but wrote the idempotency flag through
`getRecordPath()`.

## Confirmed Evidence

Duplicate physical job record:

```text
job_f83506a537b1
```

Before remediation, it existed at:

```text
data/jobs/2026-05/job_f83506a537b1.json
data/jobs/job_f83506a537b1.json
```

The two files had diverged:

```text
data/jobs/2026-05/job_f83506a537b1.json status=open
data/jobs/job_f83506a537b1.json         status=expired
```

Notification flood evidence:

```text
totalNotificationFiles: 1382
jobExpiryWarningFiles: 1370
```

Top flood groups:

```text
usr_333696d502f9 + job_f83506a537b1 + worker expiry message
count: 869

usr_ccb610f840ef + job_f83506a537b1 + employer expiry message
count: 501
```

## Root Cause

`server/services/jobs.js` previously used this unsafe pattern in sweep operations:

```text
read from entry.filePath
write to getRecordPath('jobs', job.id)
```

In sharded storage, `getRecordPath()` may resolve to a different physical file from
the one scanned, especially when root legacy files and shard files both exist.

This allowed `expiryWarningNotified` to remain unset on the repeatedly scanned copy,
causing repeated `job:expiry_warning` events.

## Amplifiers

- `checkExpiryWarnings()` runs on startup.
- `checkExpiryWarnings()` also runs every 30 minutes in the legacy periodic cleanup timer.
- Notification deduplication was in-memory only.
- Notification deduplication window was only 5 minutes.
- In-memory deduplication does not survive restarts.
- In-memory deduplication does not work across multiple Node processes.

## Recovery Performed

Backup completed:

```text
backups/yawmia-backup-2026-06-02T03-36-38
```

Duplicate job records were canonicalized before this document:

```text
physicalCount: 2
logicalUniqueCount: 2
duplicateIdCount: 0
```

Notification flood cleanup was performed using:

```bash
node scripts/cleanup-notification-flood.js \
  --type job_expiry_warning \
  --job-id job_f83506a537b1 \
  --keep latest \
  --confirm
```

Cleanup result:

```text
quarantined duplicate notification files: 1368
remaining notification files: 14
remaining job_expiry_warning files: 2
```

Quarantine location:

```text
data/ops/quarantine/notification-flood/2026-06-02
```

The quarantine contains original notification files plus `.meta.json` sidecars.
This intentionally doubles the quarantine file count for traceability.

## Code Fixes

Commit:

```text
3fe3426 fix: dedupe job expiry sweeps and prevent warning floods
```

Main changes:

- `checkExpiryWarnings()` now processes unique logical jobs.
- `checkExpiryWarnings()` writes flags to the selected scanned/canonical physical path.
- `checkExpiryWarnings()` creates a durable file-backed idempotency marker.
- `enforceExpiredJobs()` now processes unique logical jobs.
- `enforceExpiredJobs()` writes to canonical scanned physical path.
- `listAll()` returns logical unique jobs.
- `safeReadJSON()` is shard-aware on ENOENT.
- `setupNotificationListeners()` is guarded against same-process duplicate registration.
- `repair-indexes.js` is dry-run by default and requires `--confirm`.

Commit:

```text
ef3e03b chore: add safe duplicate and notification flood diagnostics
```

Main additions:

- `scripts/cleanup-notification-flood.js`
- `scripts/report-duplicate-records.js`

## Verification After Recovery

Index repair verification:

```text
node scripts/repair-indexes.js --dry-run
Done! 0 indexes would be repaired/rebuilt.
```

JSON verification:

```text
node scripts/verify-data-json.js --strict --json
ok: true
invalid: 0
zeroByte: 0
nullByte: 0
```

Null byte scan:

```text
node scripts/find-null-json-files.js --json
ok: true
nulFileCount: 0
```

## Operational Guidance

Do not delete duplicated files directly.

Correct workflow:

1. Run duplicate report.
2. Take backup.
3. Decide canonical record.
4. Quarantine duplicate records, do not delete.
5. Repair indexes.
6. Verify JSON integrity.
7. Run tests.
8. Restart only after process/multi-writer evidence is captured.

## Commands That Must Not Be Used

```bash
rm -rf data
rm data/jobs/*.json
rm -rf data/jobs/2026-*
node scripts/reset-dev-data.js
node scripts/quarantine-corrupt-json.js --confirm --json
node scripts/repair-indexes.js --confirm
pkill node
killall node
kill -9 <pid>
```

`repair-indexes.js --confirm` is allowed only after backup and when the dry-run output is understood.

## Remaining Follow-Up

- Add automated regression tests for duplicate physical records and expiry warning idempotency.
- Move legacy cleanup timers toward scheduler/process-lock guarded execution.
- Add Admin UI cards showing:
  - physical job files
  - logical unique jobs
  - duplicate IDs
  - notification flood groups
  - safe next action
