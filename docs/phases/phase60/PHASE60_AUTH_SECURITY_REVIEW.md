# Phase 60 Auth Security Review Addendum

> Status: documentation and regression checklist  
> Runtime changes: none  
> Provider migration: none

---

## 1. Current Security Model

Current auth security depends on:

```text
Egyptian phone validation
OTP generation using crypto.randomInt
OTP hash storage
OTP expiry
max attempts
per-phone OTP rate limit
per-IP OTP rate limit
session creation after successful verification
session metadata tracking
session TTL
logout and logout-all
```

---

## 2. OTP Requirements

OTP must remain:

```text
short-lived
single-use
hashed at rest
deleted after successful verification
attempt-limited
rate-limited per phone
rate-limited per IP
```

---

## 3. OTP Storage Requirements

Allowed:

```text
otpHash
phone
role
attempts
createdAt
expiresAt
```

Forbidden:

```text
raw OTP
provider token as Yawmia session
password-equivalent provider artifacts
long-lived auth secrets in OTP records
```

---

## 4. Verification Requirements

Verification must:

```text
load OTP record
check existence
check expiry
check max attempts
hash input code
compare with stored hash
increment attempts on failure
delete OTP on success
find or create user
create Yawmia session
return same response shape as current endpoint
```

---

## 5. Session Requirements

Yawmia sessions must remain:

```text
internal application sessions
stored in sessions collection
bound to userId and role
able to store IP/user-agent metadata
destroyable by logout
destroyable by logout-all
```

Do not replace these with provider sessions.

---

## 6. Rate-limit Requirements

Must preserve:

```text
per-phone OTP request window
per-IP OTP request window
global IP rate limit
authenticated per-user rate limit
penalty cooldown behavior
```

---

## 7. Messaging Requirements

Messaging is delivery only.

```text
Delivery failure does not block stored OTP verification.
Delivery success does not verify identity.
Provider message id is not an auth session.
```

---

## 8. Regression Tests Required Before Auth Changes

Required tests if auth code is touched:

```text
sendOtp stores otpHash not raw OTP
verifyOtp accepts correct OTP
verifyOtp rejects wrong OTP
attempts increment on wrong OTP
OTP is deleted after success
expired OTP is rejected and deleted
max attempts enforced
user creation unchanged
session creation unchanged
session metadata preserved
send-otp response shape unchanged
verify-otp response shape unchanged
no new dependencies
no unofficial WhatsApp package/import
```

---

## 9. Phase 61.2 Auth Decision

Recommended:

```text
Auth docs only.
No provider migration.
No Firebase.
No Cequens.
No VictoryLink.
No Infobip replacement.
No unofficial WhatsApp.
No runtime behavior change.
```
