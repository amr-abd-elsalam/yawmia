# Phase 60 Auth Provider Strategy Addendum

> Status: docs-first  
> Phase 61.2 posture: optional documentation, not implementation  
> Current provider: file-backed OTP  
> Active provider switching: not enabled

---

## 1. Purpose

This document describes current Yawmia auth and a future optional provider abstraction strategy.

It does not enable Firebase, Cequens, VictoryLink, dynamic provider routing, or any external OTP provider.

---

## 2. Current Auth Architecture

Current OTP lifecycle:

```text
auth.js generates OTP
auth.js hashes OTP
auth.js stores OTP hash in file-backed otp collection
auth.js verifies OTP
auth.js counts attempts
auth.js enforces expiry
auth.js deletes OTP on success
auth.js finds or creates Yawmia user
auth.js creates Yawmia session
sessions.js stores internal sessions
messaging.js only delivers OTP/message
```

Current Yawmia identity remains:

```text
Yawmia user id
Yawmia role
Yawmia internal session token
```

---

## 3. OTP Storage

OTP must not be stored raw.

Current expected storage:

```text
otpHash = sha256(otp)
attempts
createdAt
expiresAt
phone
role
```

Backward compatibility for old raw `otp` records may exist only to support old data cleanup.

New code must not introduce raw OTP storage.

---

## 4. Delivery Is Not Verification

Messaging providers are delivery channels only.

```text
WhatsApp/SMS/mock delivery may fail.
Verification remains based on the stored OTP hash.
Delivery failure does not create identity.
Delivery failure does not create session.
```

---

## 5. Session Ownership

Yawmia sessions are internal application sessions.

Do not replace Yawmia sessions with provider sessions.

Do not make Firebase the Yawmia identity.

Do not let an OTP provider create users or sessions.

---

## 6. Future Optional authProvider Seam

If explicitly approved later, the only allowed Phase 61.2-compatible seam is:

```javascript
export async function startOtpVerification(params)
export async function verifyOtpCode(params)
export function getActiveAuthProvider()
export function getAuthProviderCapabilities()
```

Initial active provider must be:

```text
file-backed
```

Allowed capabilities:

```text
generatesOtp=true
storesOtpHash=true
verifiesOtp=true
createsSession=false
createsUser=false
externalProvider=false
```

---

## 7. Forbidden Provider Behavior

Do not implement in Phase 61.2:

```text
Firebase Phone Auth
firebase-admin
Cequens integration
VictoryLink integration
Infobip replacement
dynamic OTP provider routing
automatic provider failover
telecom cost routing
provider health AI
unofficial WhatsApp APIs
whatsapp-web.js
Baileys
```

---

## 8. Future Provider Evaluation Criteria

A future provider can be evaluated only with:

```text
Egypt deliverability evidence
Sender ID compliance clarity
cost model
legal/privacy review
fallback behavior
user/session boundary preservation
rate-limit compatibility
abuse protections
no unofficial WhatsApp automation
```

---

## 9. Phase 61.2 Decision

Recommended current scope:

```text
docs-first only
no provider migration
no auth runtime behavior change
no new dependencies
current OTP regression tests
guardrail tests against unofficial WhatsApp packages
```

---

## 10. Success Criteria

Auth strategy is acceptable when:

```text
current OTP behavior is preserved
OTP hashing is preserved
attempt limits are preserved
expiry is preserved
Yawmia sessions remain internal
provider docs exist
no provider dependency is added
no unofficial WhatsApp API is used
```
