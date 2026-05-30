# Rate Limit False-Positive Smoke Checklist — 2026-05-30

## Context

Phase 61.4 reduced false-positive temporary blocking caused by normal dashboard,
Workroom, notification, presence, SSE, and Talent Radar activity being treated too
similarly to high-risk user actions.

This smoke checklist verifies that normal worker/employer usage is no longer
penalized while strict protections remain in place for OTP and admin writes.

## Scope

This smoke is for:

- worker dashboard background activity
- employer dashboard background activity
- Workroom realtime messaging
- unread badge refresh
- presence heartbeat
- SSE reconnect behavior
- Talent Radar polling
- OTP abuse protection
- admin write protection

This smoke is not for:

- Queue repair
- Queue drain
- Queue compaction
- external queue
- Redis
- Firebase
- Auth provider migration
- PostgreSQL
- external search
- externalization
- version rollback

## Current Safety Posture

Expected posture after patch:

```text
RATE_LIMIT.enabled remains true.
SSE endpoints are relaxed/separately bucketed.
Presence heartbeat does not trigger penalty.
Background reads are relaxed and do not trigger penalty.
Low-risk writes are relaxed and do not trigger penalty.
OTP remains strict.
Admin writes remain strict.
High-risk marketplace writes remain protected.
No new dependencies.
No Queue mutation.
No Auth architecture change.
No version rollback.
```

## Relevant Runtime Areas

Backend:

```text
server/middleware/rateLimit.js
server/middleware/auth.js
server/services/auth.js
server/services/presenceService.js
server/services/sseManager.js
```

Frontend:

```text
frontend/assets/js/app.js
frontend/assets/js/jobs.js
frontend/assets/js/profile.js
frontend/assets/js/workroom.js
frontend/assets/js/livePresence.js
frontend/assets/js/talentRadar.js
```

## Expected User-Facing Messages

### Soft throttle

```text
الاتصال سريع جدًا حاليًا. استنى ثواني وجرب تاني.
```

### Real penalty cooldown

```text
تم إيقاف الطلبات مؤقتًا بسبب محاولات كثيرة جدًا. حاول بعد دقائق.
```

### OTP throttle

```text
تم تجاوز الحد المسموح من طلبات كود التحقق. حاول بعد قليل.
```

### Admin throttle

```text
تم تجاوز الحد المسموح من عمليات الأدمن. حاول بعد قليل.
```

Avoid using “تم حظرك” for normal temporary throttling.

## Automated Test Baseline

Before manual smoke, run:

```bash
node --test --test-concurrency=1 tests/phase61-4-rate-limit-false-positive-static.test.js
node --test --test-concurrency=1 tests/phase61-*.test.js
```

Expected:

```text
phase61-4-rate-limit-false-positive-static.test.js: pass
phase61-*.test.js: pass
```

Last known successful result:

```text
tests/phase61-4-rate-limit-false-positive-static.test.js
pass 11 / fail 0

tests/phase61-*.test.js
pass 117 / fail 0
```

## Worker Smoke

### Steps

```text
1. Login as worker.
2. Open dashboard.
3. Wait 2 minutes with the tab visible.
4. Confirm presence status remains stable.
5. Open Workroom list.
6. Open a Workroom conversation.
7. Send one message.
8. Confirm optimistic bubble appears.
9. Confirm message resolves to sent state.
10. Wait for unread badge refresh.
11. Keep tab open for another minute.
```

### Expected

```text
No false temporary blocking.
No unexpected 429 during dashboard idle state.
No penalty cooldown.
Presence heartbeat remains functional.
SSE notification stream remains functional.
Workroom realtime remains functional.
Unread badge refresh remains functional.
Message send works normally.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## Employer Smoke

### Steps

```text
1. Login as employer.
2. Open dashboard.
3. Open Talent Radar.
4. Wait 2 minutes with the tab visible.
5. Confirm Talent Radar keeps refreshing.
6. Open Workroom list if available.
7. Open job applications panel if available.
8. Open attendance panel if available.
9. Keep tab open for another minute.
```

### Expected

```text
No false temporary blocking.
No unexpected 429 during dashboard idle state.
No penalty cooldown.
Talent Radar polling remains functional.
Workroom list remains functional.
Applications and attendance panels remain functional.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## Workroom Realtime Smoke

### Steps

```text
1. Open worker and employer sessions in two browsers/devices.
2. Open the same Workroom conversation.
3. Send message from worker.
4. Confirm employer receives realtime message without full reload.
5. Send message from employer.
6. Confirm worker receives realtime message without full reload.
7. Confirm duplicate bubbles do not appear.
8. Confirm unread badge updates outside active conversation.
```

### Expected

```text
Realtime append works.
Optimistic pending/sent/failed states work.
No duplicate realtime bubbles.
No false rate-limit block.
No penalty cooldown.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## SSE Reconnect Smoke

### Steps

```text
1. Open worker dashboard.
2. Disable network briefly.
3. Re-enable network.
4. Wait for EventSource reconnect.
5. Repeat 2-3 times.
```

### Expected

```text
SSE reconnect does not trigger global penalty.
No false temporary blocking.
Notifications stream resumes.
Live feed resumes for worker if enabled.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## Presence Heartbeat Smoke

### Steps

```text
1. Login as worker.
2. Enable accepting jobs.
3. Keep dashboard open for 3 minutes.
4. Switch tab to background for 2 minutes.
5. Return to tab.
```

### Expected

```text
Presence heartbeat works.
Service-level heartbeat throttle may return throttled=true internally.
No user-facing penalty.
No false temporary blocking.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## OTP Abuse Smoke

### Steps

```text
1. Use unauthenticated phone login screen.
2. Request OTP repeatedly beyond configured limit.
3. Observe response.
```

### Expected

```text
OTP throttle still appears.
Phone-level OTP limiter remains active.
Dashboard users are not affected.
```

Expected message:

```text
تم تجاوز الحد المسموح من طلبات كود التحقق. حاول بعد قليل.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## Admin Write Smoke

### Steps

```text
1. Login/open admin dashboard with admin token.
2. Perform repeated admin write operations beyond the admin write limit.
3. Observe response.
```

Examples of admin writes:

```text
POST /api/admin/alerts/test-webhook
POST /api/admin/counters/rebuild?async=1
POST /api/admin/audit-index/verify
```

Use safe/non-destructive endpoints only.

Do not run queue mutation commands.

### Expected

```text
Admin write throttle still works.
Admin write abuse remains protected.
```

Expected message:

```text
تم تجاوز الحد المسموح من عمليات الأدمن. حاول بعد قليل.
```

### Result

```text
Status: PENDING_MANUAL_SMOKE
Tester:
Device:
Browser:
Network:
Notes:
```

## Forbidden During This Smoke

Do not run:

```bash
node scripts/repair-queue.js --confirm --json
node scripts/queue-drain.js --confirm --json
node scripts/compact-queue.js --confirm --json
node scripts/reset-dev-data.js --confirm --reinit --json
node scripts/quarantine-corrupt-json.js --confirm --json
```

Do not introduce:

```text
Redis
external rate limiter
Firebase
external queue
external search
Auth provider migration
version rollback
RATE_LIMIT.enabled=false
OTP weakening
admin write weakening
```

## Final Smoke Summary

```text
Worker dashboard smoke: PENDING
Employer dashboard smoke: PENDING
Workroom realtime smoke: PENDING
SSE reconnect smoke: PENDING
Presence heartbeat smoke: PENDING
OTP abuse smoke: PENDING
Admin write smoke: PENDING
```

## Operational Conclusion

The rate-limit false-positive patch is code-complete and static-test verified.
Manual smoke remains required before marking operational adoption complete.

The expected production behavior is:

```text
Normal dashboard, Workroom, notification, presence, SSE, and Talent Radar activity
should not trigger temporary penalty blocking for workers or employers.

OTP and admin write protections must remain strict.
```

No new dependencies.
No external rate limiter.
No Redis.
No Firebase/Auth provider migration.
No Queue mutation.
No rate-limit disable as permanent fix.
No OTP weakening.
No admin write weakening.
No version rollback.
