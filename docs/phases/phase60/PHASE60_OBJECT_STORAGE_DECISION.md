# يوميّة — Phase 60 Object Storage Decision

## Current imageStore

```text
content-addressed files
SHA-256 filenames
bucketed directories
metadata sidecar
imageRef in records
no raw base64 in workroom messages
```

## Pressure signals

Object storage review requires:

```text
repeated image total size warnings
largest binary file warnings
backup/restore slowdown
orphan attachment growth
anonymization deletion risk
```

## File-based mitigation first

```bash
node scripts/cleanup-attachments.js
node scripts/verify-file-health.js --strict
node scripts/run-backup-restore-drill.js
```

## Privacy requirements

Future object store must support:

```text
delete by imageRef
delete verification images on anonymization
metadata deletion
audit of deletion
idempotent deletes
no public bucket exposure
```

## Decision

One image warning = monitor.  
Repeated critical + backup impact = rehearsal_required.
