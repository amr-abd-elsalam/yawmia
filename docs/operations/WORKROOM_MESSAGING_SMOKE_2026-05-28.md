# Workroom Messaging Smoke Checklist — 2026-05-28

> Phase 61.4 Operational Adoption — Messaging/Product Quality  
> Scope: Workroom realtime messaging smoke + inbox polish verification  
> No external realtime service. No new dependencies. No data reset. No externalization.

---

## هدف الفحص

التأكد أن Workroom Messaging أصبحت قابلة للاعتماد اليومي بين العامل وصاحب العمل:

- الرسائل تصل بدون refresh.
- المرسل يرى pending ثم sent.
- فشل الإرسال واضح.
- لا يوجد duplicate bubble.
- notification click يفتح المحادثة الصحيحة.
- unread badge يتحدث ويختفي بعد القراءة.
- mobile bottom nav واضح.

---

## Preconditions

- حساب Employer نشط.
- حساب Worker نشط.
- فرصة بها worker accepted أو worker_confirmed.
- Workroom متاح للفرصة.
- يفضل فتح جلستين:
  - Browser A: Employer
  - Browser B: Worker

---

## Smoke 1 — Worker → Employer realtime

1. افتح `/job.html?id=JOB_ID#workroom-messages` عند صاحب العمل.
2. افتح نفس Workroom عند العامل.
3. العامل يرسل رسالة نصية.
4. تحقق:
   - صاحب العمل يرى الرسالة بدون refresh.
   - لا تظهر الرسالة مرتين.
   - badge يتحدث إذا كان صاحب العمل خارج المحادثة.
   - لا يتم كشف phone أو token أو raw attachment payload في SSE.

Expected:

```text
PASS: message appears live once.
```

---

## Smoke 2 — Employer → Worker realtime

1. صاحب العمل يرسل رسالة.
2. العامل يراها بدون refresh.
3. إذا العامل خارج المحادثة:
   - يظهر toast "رسالة جديدة — افتح المحادثة".
   - يظهر bottomWorkroomBadge.
   - notification drawer item يفتح المحادثة.

Expected:

```text
PASS: realtime + notification route works.
```

---

## Smoke 3 — Optimistic send success

1. افتح Workroom messages.
2. اكتب رسالة واضغط إرسال.
3. تحقق:
   - الرسالة تظهر فورًا بحالة "جاري الإرسال..."
   - تتحول إلى "تم الإرسال"
   - لا يتم تكرارها عند وصول SSE أو response.

Expected:

```text
PASS: pending → sent, no duplicate.
```

---

## Smoke 4 — Failed send UX

1. افصل الشبكة أو عطّل السيرفر مؤقتًا في بيئة dev فقط.
2. حاول إرسال رسالة.
3. تحقق:
   - تظهر الرسالة كـ failed.
   - النص "تعذّر إرسال الرسالة" واضح.
   - زر "أعد المحاولة" ظاهر.
   - عند retry بعد عودة الشبكة، يتم إرسال الرسالة.

Expected:

```text
PASS: failed state is visible and recoverable.
```

---

## Smoke 5 — Notification deep-link

1. أرسل رسالة لمستخدم خارج Workroom.
2. افتح notification drawer.
3. اضغط الرسالة.
4. تحقق:
   - يفتح `/job.html?id=JOB_ID#workroom-messages`
   - تبويب الرسائل يظهر.
   - يتم mark read.
   - unread badge يقل أو يختفي.

Expected:

```text
PASS: exact conversation opens and badge resets.
```

---

## Smoke 6 — Mobile bottom nav

1. افتح dashboard على viewport mobile.
2. تحقق:
   - bottom nav يحتوي "المحادثات".
   - badge واضح.
   - الضغط يفتح قائمة محادثات مفهومة.
   - touch targets مريحة.

Expected:

```text
PASS: mobile conversations entry is clear.
```

---

## Smoke 7 — Reconnect behavior

1. افتح Workroom.
2. اقطع الاتصال مؤقتًا ثم أعده.
3. أرسل رسالة جديدة من الطرف الآخر.
4. تحقق:
   - الاتصال يعود تلقائيًا.
   - الرسائل الجديدة تصل.
   - لا يحدث duplicate flood.
   - badge لا يبقى stale.

Expected:

```text
PASS: SSE reconnect remains usable.
```

---

## Privacy Checks

Realtime payload must not include:

```text
phone
token
authorization
otp
raw base64
nationalIdImage
selfieImage
```

Allowed payload examples:

```text
messageId
jobId
senderId
senderRole
text/preview capped
source
templateKey
attachments metadata with imageRef
createdAt
```

---

## Result Template

```text
Date:
Tester:
Browser:
Device:
Employer user:
Worker user:
Job ID:

Smoke 1:
Smoke 2:
Smoke 3:
Smoke 4:
Smoke 5:
Smoke 6:
Smoke 7:

Issues:
Screenshots/Notes:
Final result: PASS / WARNING / FAIL
```

---

## Operational Notes

- هذا الفحص لا يتطلب reset.
- لا تشغّل queue repair confirm أثناء smoke.
- لا تستخدم بيانات إنتاج حساسة.
- لا تضف external realtime service.
- لا تضف dependencies.
