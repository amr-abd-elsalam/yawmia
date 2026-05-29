# Location / Address / Directions Smoke — 2026-05-29

> Phase 61.4B — Job Location and Directions UX  
> Scope: product-quality smoke only  
> No map SDK. No new dependencies. No data reset. No externalization.

---

## هدف التحقق

التأكد أن تحسينات Location / Address / Directions UX تعمل بشكل واضح للمستخدمين:

- صاحب العمل يقدر ينشر فرصة بعنوان مفهوم بدون معرفة `lat/lng`.
- صاحب العمل يقدر يستخدم موقعه الحالي اختياريًا.
- العامل يرى عنوان مكان العمل بوضوح.
- العامل يقدر يفتح الاتجاهات.
- العامل يقدر ينسخ العنوان.
- attendance GPS behavior ما زال يعمل.
- proximity matching ما زال يعمل.
- لا توجد map SDK dependencies.

---

## Architectural Guardrails

```text
No Google Maps SDK.
No Leaflet.
No map npm dependency.
No external geocoding service.
No new dependencies.
No change to attendance GPS logic.
No change to file-backed source of truth.
No externalization.
```

---

## Backend Fields

New additive fields:

```text
area
address
landmark
locationNotes
```

Existing preserved fields:

```text
location
governorate
lat
lng
```

Expected behavior:

```text
- New fields are optional/additive at storage level.
- UI requires address OR area OR landmark for employer clarity.
- lat/lng remain optional enhancement.
- location remains backward-compatible summary.
```

---

## Manual Smoke Matrix

### 1. Employer — Create Job with Address

Actor:

```text
employer
```

Steps:

```text
1. Open dashboard.html.
2. Go to create job form.
3. Confirm these fields exist:
   - المنطقة أو المركز
   - عنوان مكان العمل
   - علامة مميزة
   - ملاحظات تساعد العامل يوصل بسهولة
   - استخدم موقعي الحالي
4. Fill required job fields.
5. Fill address fields.
6. Submit job.
```

Expected:

```text
- Job is created successfully.
- No raw lat/lng required.
- Address fields are preserved in job detail.
```

Result:

```text
Not run yet.
```

---

### 2. Employer — Create Job Without Address/Area/Landmark

Steps:

```text
1. Fill normal job fields.
2. Leave address, area, and landmark empty.
3. Submit.
```

Expected:

```text
- UI blocks submission.
- Message appears:
  اكتب عنوان مكان العمل أو المنطقة أو علامة مميزة
```

Result:

```text
Not run yet.
```

---

### 3. Employer — Use Current Location

Steps:

```text
1. Press استخدم موقعي الحالي.
2. Allow browser geolocation.
3. Submit job with address text.
```

Expected:

```text
- Button changes to تم حفظ الموقع ✓.
- lat/lng are saved as hidden enhancement.
- No raw coordinate typing needed.
```

Result:

```text
Not run yet.
```

---

### 4. Worker — Job Detail Location Section

Actor:

```text
worker
```

Steps:

```text
1. Open /job.html?id=JOB_ID.
2. Find section: مكان العمل.
```

Expected:

```text
- Area is visible if provided.
- Address is visible if provided.
- Landmark is visible if provided.
- Location notes are visible if provided.
- Copy address button exists.
- Directions button exists.
```

Result:

```text
Not run yet.
```

---

### 5. Worker — Open Directions

Steps:

```text
1. Press افتح الاتجاهات.
```

Expected:

```text
If lat/lng exist:
- Opens Google Maps directions URL:
  https://www.google.com/maps/dir/?api=1&destination=LAT,LNG

If lat/lng do not exist:
- Opens Google Maps search URL with encoded address:
  https://www.google.com/maps/search/?api=1&query=...
```

Result:

```text
Not run yet.
```

---

### 6. Worker — Copy Address

Steps:

```text
1. Press انسخ العنوان.
```

Expected:

```text
- Clipboard receives composed address.
- Toast appears: تم نسخ العنوان
```

Result:

```text
Not run yet.
```

---

### 7. Regression — Attendance GPS

Steps:

```text
1. Start a job.
2. Worker attempts check-in.
```

Expected:

```text
- Existing GPS check-in behavior still works.
- Attendance radius logic remains unchanged.
```

Result:

```text
Not run yet.
```

---

### 8. Regression — Jobs List / Nearby / Talent Radar

Steps:

```text
1. Browse jobs list.
2. Use filters.
3. Use nearby jobs.
4. Use Talent Radar.
```

Expected:

```text
- Jobs list still works.
- Proximity remains based on lat/lng/governorate fallback.
- Talent Radar unaffected.
```

Result:

```text
Not run yet.
```

---

## Known Non-Goals

```text
No map preview.
No draggable pin.
No geocoding.
No address verification.
No route optimization.
No map SDK.
No provider integration.
No externalization.
```

---

## Follow-up If Smoke Passes

```text
1. Record this document as passed.
2. Run focused tests.
3. Recapture Phase 61 evidence.
4. Include in weekly ops review.
```

---

## Follow-up If Smoke Fails

Classify:

| Type | Action |
|---|---|
| Bug prevents job creation | fix immediately before evidence recapture |
| Directions URL wrong | fix in jobDetail only |
| Copy address failure | improve fallback |
| UX wording confusion | copy polish only |
| GPS denied confusion | improve helper text |

---

## Current Status

```text
Status: pending manual smoke
Source commit: ab72ee8
No data mutation: true
No externalization: true
No new dependencies: true
```
