# Phase 60 Egypt Sender ID Runbook

> Status: documentation only  
> Active integration changes: none  
> Current SMS adapter: Infobip SMS adapter remains unchanged  
> WhatsApp adapter: Meta WhatsApp Cloud API template adapter remains unchanged

---

## 1. Purpose

This runbook documents what must be reviewed before any future Egypt OTP sender/provider change.

It does not replace the current Infobip adapter.

It does not add Cequens, VictoryLink, Firebase, or a new provider.

---

## 2. Current Delivery Channels

Current code supports:

```text
mock OTP delivery when MESSAGING.enabled=false
WhatsApp Cloud API adapter when explicitly enabled
Infobip SMS adapter when explicitly enabled
SMS fallback if configured
```

Verification remains file-backed and hash-based.

---

## 3. Sender ID Review

Before changing SMS sender behavior, document:

```text
registered sender name
country coverage
Egypt operator support
template requirements
DLT/NTRA/regulatory expectations if applicable
pricing
delivery reports
rate limits
support SLA
data retention
PII handling
```

---

## 4. Compliance Checklist

A provider must support:

```text
official APIs
documented OTP use case
clear sender registration path
legal business account setup
auditability
reasonable delivery reports
no screen scraping
no unofficial WhatsApp automation
```

---

## 5. Forbidden Paths

Do not use:

```text
whatsapp-web.js
Baileys
WhatsApp Web automation
unofficial WhatsApp APIs
personal WhatsApp numbers for production OTP
browser automation for auth
```

---

## 6. Future Provider Comparison

Any future comparison should include:

```text
deliverability in Egypt
price per OTP
setup complexity
template approval process
support response time
retry behavior
fallback behavior
data residency or retention notes
security model
```

---

## 7. Current Recommendation

Current recommendation:

```text
Keep current file-backed OTP verification.
Keep current messaging adapters unchanged.
Do not introduce dynamic provider routing.
Document evidence before provider work.
```

---

## 8. Success Criteria

Sender ID readiness is acceptable when:

```text
provider compliance is documented
no unofficial API is used
Yawmia sessions remain internal
OTP storage remains hashed
delivery failure does not bypass verification
no new dependency is added
```
