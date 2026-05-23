# يوميّة — Privacy Request Runbook
> Phase 58 — User Data Export and Anonymization

---

## User data export workflow

1. Verify request identity.
2. Create privacy request:

type = user_data_export
status = requested

3. Queue export job.
4. Generate JSON export.
5. Exclude secrets/tokens/raw images.
6. Persist export for limited retention.
7. Mark request completed.
8. Audit all actions.

---

## User anonymization workflow

1. Verify request identity.
2. Take backup before destructive action:

node scripts/backup.js

3. Create privacy request:

type = user_anonymization
status = requested

4. Create/consume approval if required.
5. Run preview:

node scripts/anonymize-user-data.js --userId=usr_x --dry-run

6. Queue anonymization job or run confirmed CLI:

node scripts/anonymize-user-data.js --userId=usr_x --confirm

7. Destroy sessions.
8. Remove phone/name/location.
9. Delete verification image refs if configured.
10. Preserve financial/audit records safely.
11. Complete request.
12. Audit all actions.

---

## Phase 59 storage pressure and privacy operations

Privacy workflows can create export files and queue jobs. Monitor:

```bash
node scripts/measure-storage-pressure.js
node scripts/verify-scale-thresholds.js
node scripts/verify-privacy-governance.js --strict
```

Admin:

```text
/api/admin/storage-pressure
/api/admin/privacy/requests
/api/admin/ops-queue/jobs
```

If privacy export/anonymization jobs are stuck:

1. Review queue job.
2. Review privacy request status.
3. Do not rerun anonymization blindly.
4. Use preview before destructive action.
5. Document in ops review if SLA is missed.

If storage pressure is critical because of exports:

```bash
node scripts/backup.js
node scripts/verify-data-json.js --strict
node scripts/verify-file-health.js --strict
```

Then review export retention and cleanup.

---

## Do not

Do not delete financial records blindly.
Do not delete audit records blindly.
Do not expose another user’s PII in export.
Do not include raw secrets/tokens.
Do not export raw identity images by default.
Do not run anonymization without preview.
Do not run anonymization without approval if approval is required.
Do not include raw session tokens or raw identity images in migration snapshots.
Do not publish migration snapshots or export files publicly.

---

## Export contents

Allowed:

user profile
own applications
own jobs
attendance involving user
payments involving user
ratings given/received
reports involving user
verification metadata
notifications
direct offers involving user
workrooms/messages involving user if enabled

Excluded:

session tokens
ADMIN_TOKEN
raw identity images
webhook secrets
VAPID private key
unrevealed third-party phones

---

## Emergency privacy failure

If privacy export leaks sensitive data:

1. Disable export download.
2. Expire export file.
3. Open incident.
4. Create postmortem if severity is critical.
For high severity, create postmortem if user privacy impact is confirmed.
5. Rotate any leaked secrets.
