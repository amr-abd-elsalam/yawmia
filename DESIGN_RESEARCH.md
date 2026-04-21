# يوميّة (Yawmia) — Design Research Document
# بحث علمي: البساطة + الوضوح + الألفة
> آخر تحديث: 2026-04-21
> يُرفق مع كل تعديل في مراحل التطوير (Phase 26+)

---

## الهدف من هذا الملف

هذا الملف مرجع بحثي دائم يوثّق الأسس العلمية والعملية لقرارات التصميم في يوميّة.
كل قرار UX/UI لازم يكون مبني على واحد أو أكثر من المبادئ الموثّقة هنا.
الملف يُرفق مع ملفات الـ CODEBASE_PART في كل مرحلة تطوير.

**المبدأ الأساسي:** البساطة + الوضوح + الألفة = ثقة المستخدم = نجاح المنصة

---

## الجزء الأول: قوانين UX العلمية (Laws of UX)

### 1. قانون جاكوب (Jakob's Law) — الألفة

> "المستخدمين بيقضّوا معظم وقتهم على مواقع وتطبيقات تانية.
> ده معناه إنهم بيفضّلوا موقعك يشتغل بنفس الطريقة اللي متعودين عليها."

**المصدر:** https://lawsofux.com/jakobs-law/
**المصدر الأصلي:** https://www.nngroup.com/videos/jakobs-law-internet-ux/

**التطبيق في يوميّة:**
- نسخ patterns من WhatsApp و Facebook (اللي العمال اليومية متعودين عليهم)
- Lists + Detail pages بتكفي — لا maps معقدة ولا animations غير مألوفة
- الأزرار في أماكن متوقعة (أسفل البطاقة، أسفل الفورم)
- Navigation يشبه التطبيقات المألوفة (bottom nav, drawer)

**مقال مرجعي:**
https://medium.com/@shakindikithmini/jakobs-law-in-ux-design-why-familiarity-improves-user-experience-boosts-conversions-213c36e4c32b

---

### 2. قانون هيك (Hick's Law) — تقليل الاختيارات

> "الوقت اللازم لاتخاذ قرار بيزيد بشكل لوغاريتمي مع عدد الاختيارات المتاحة."

**المصدر:** https://lawsofux.com/hicks-law/
**المصدر العلمي:** https://www.parallelhq.com/blog/what-hick-s-law

**التطبيق في يوميّة:**
- بطاقة الفرصة تعرض 3 معلومات أساسية بس (المكان + الأجر + التاريخ)
- زر واحد أساسي (تقدّم / ابدأ / أنهِ) — مش 5 أزرار متساوية
- الفلاتر تكون quick filters ظاهرة — مش مخبّية ورا dropdown
- صفحة التسجيل: خطوة واحدة في كل شاشة (phone → OTP → profile)

**بحث ميداني مؤيد:**
شركة في تكساس قلّلت أخطاء الجدولة 60% بمجرد تبسيط الـ navigation:
https://ablemkr.com/features-blue-collar-app-needs/

---

### 3. قانون فيتس (Fitts's Law) — حجم الأزرار

> "الوقت اللازم للوصول لهدف يتناسب مع المسافة ويتناسب عكسياً مع حجم الهدف."

**المصدر الأكاديمي:** https://www.nngroup.com/articles/fitts-law/
**بحث Google:** https://research.google/pubs/ffitts-law-modeling-finger-touch-with-fitts-law/

**التطبيق في يوميّة:**
- Touch targets لا تقل عن 48×48dp (معيار Android)
- iOS تطلب 44×44 points minimum
- MIT study: متوسط عرض إصبع الإبهام 10-14mm
- أزرار الـ CTA الأساسية (تقدّم، سجّل حضور) تكون أكبر من الأزرار الثانوية
- Spacing بين الأزرار لا يقل عن 8dp

**مرجع تفصيلي:**
https://medium.com/design-bootcamp/what-is-fitts-law-and-how-to-apply-it-in-ux-design-63f386c968ad

---

### 4. نظرية الحمل المعرفي (Cognitive Load Theory) — البساطة تقلل الأخطاء

> "تقليل الحمل المعرفي الزائد يؤدي لأخطاء أقل، تعلّم أسرع، ورضا أعلى."

**المصدر:** https://www.nngroup.com/articles/minimize-cognitive-load/
**بحث أكاديمي:** https://www.researchgate.net/publication/399036000_Interface_Design_Based_on_Cognitive_Load_Theory

**التطبيق في يوميّة:**
- لا تعرض كل المعلومات مرة واحدة — استخدم Progressive Disclosure
- بطاقة الفرصة تعرض الأساسيات فقط — التفاصيل عند الضغط
- Form fields تظهر تدريجياً حسب الدور (عامل vs صاحب عمل)
- استخدم icons مع النصوص — مش نصوص لوحدها

**مرجع إضافي:**
https://medium.com/design-bootcamp/cognitive-load-theory-in-ux-designing-for-simplicity-a48c7b55e50d

---

### 5. الإفصاح التدريجي (Progressive Disclosure) — اعرض اللي محتاجه بس

> "أجّل الوظائف المتقدمة أو نادرة الاستخدام لشاشة ثانوية."

**المصدر:** https://www.nngroup.com/articles/progressive-disclosure/
**تعريف شامل:** https://ixdf.org/literature/topics/progressive-disclosure

**التطبيق في يوميّة:**
- الأزرار الثانوية (نسخ، بلّغ، رسائل) مخفية جزئياً (opacity أقل) لحد الـ hover/focus
- Inline panels (طلبات، حضور، رسائل) تفتح عند الطلب — مش ظاهرة دايماً
- Cost preview يظهر فقط بعد ملء حقول العمال والأجر والمدة
- تفاصيل الدفع والنزاع تظهر داخل البطاقة عند الحاجة فقط

---

### 6. تأثير الجمالية على الاستخدامية (Aesthetic-Usability Effect)

> "المستخدمين بيعتبروا التصميم الجميل أسهل في الاستخدام — حتى لو الوظائف متساوية."

**المصدر:** https://www.nngroup.com/articles/aesthetic-usability-effect/
**Laws of UX:** https://lawsofux.com/aesthetic-usability-effect/

**التطبيق في يوميّة:**
- التصميم الجميل مش رفاهية — هو بيزوّد الثقة والاستخدام
- ألوان متناسقة + spacing مريح + typography واضحة = "التطبيق ده سهل"
- الاهتمام بالتفاصيل الصغيرة (icons, transitions, empty states) بيعمل فرق كبير في الانطباع

---

### 7. مجموعة Laws of UX الكاملة (مرجع سريع)

**المصدر الشامل:** https://lawsofux.com/
**شرح الـ 21 قانون:** https://www.uxdesigninstitute.com/blog/laws-of-ux/
**PDF مرجعي:** https://promptcraze.com/wp-content/uploads/2025/02/lawsofux.pdf

---

## الجزء الثاني: أبحاث خاصة بالعمالة اليومية (Blue-Collar UX)

### 8. مقال ABLEMKR — 5 مميزات لازم تكون في أي تطبيق عمالة

> "60%+ من العمال بيفضّلوا تطبيقات بتصميم بسيط وواضح على تطبيقات مليانة features."

**المصدر الكامل:** https://ablemkr.com/features-blue-collar-app-needs/

**الـ 5 مميزات:**
1. **أزرار كبيرة وواضحة** — العمال بيشتغلوا بأيادي خشنة وأحياناً بـ gloves
2. **Navigation بسيط** — أي task حرجة في 1-2 taps من الـ home
3. **شغل بدون إنترنت** — مواقع العمل أحياناً مفيهاش شبكة
4. **دعم لغات متعددة** — icons و visual cues أهم من النصوص الطويلة
5. **تسجيل سريع ومطابقة فورية** — أقل paperwork ممكنة

**نتائج ميدانية مذكورة:**
- شركة في تكساس: navigation بسيط → أخطاء الجدولة قلّت 60%، overtime costs قلّت 30%

---

### 9. تجربة Aasaanjobs — سنة في التصميم لعمال يومية في الهند

> "Not every user is John Doe; Neither all products are social media applications."

**المصدر الكامل:** https://medium.com/building-aasaanjobs/a-year-in-designing-for-blue-collar-jobseekers-in-india-2c2635efaa1f

**الدروس الخمسة:**
1. **ركّز على طريقة القراءة** — المستخدمين مش بيقرأوا جمل كاملة. بيدوروا على كلمات مألوفة. كلمة "Active 2 days ago" فهموها غلط → غيّروها لـ "⚡ Active" → التقديمات زادت 30%
2. **انسخ patterns من WhatsApp** — Lists + detail pages بتكفي. لا تخترع تفاعلات جديدة
3. **ساعد المستخدم يخلّص مهمته** — اعرض المحتوى upfront. Quick filters ظاهرة مش مخبّية
4. **الكتابة = أخطاء** — وفّر بدائل للـ typing. اختيارات جاهزة, dropdowns, checkboxes
5. **اعتني بالـ Power Users** — هم اللي بينشروا التطبيق في مجتمعاتهم

---

### 10. Workit — UX/UI Case Study لتطبيق عمالة (Behance)

**المصدر:** https://www.behance.net/gallery/164958855/Workit-Blue-Collar-Job-Booking-App-(UXUI-Case-Study)

**ملاحظات تصميمية:**
- Dark theme مع accents دافئة (أخضر + برتقالي)
- Cards كبيرة بمعلومات محدودة
- أزرار CTA واضحة ومميّزة بصرياً
- Typography جريئة للعناوين

---

### 11. Rozgar — Case Study للعمالة في الهند

**المصدر:** https://medium.com/@ashishsauparna/rozgar-ux-case-study-jan-2022-49dfe9f33ae3
**Case Study تاني:** https://www.behance.net/gallery/137883009/UX-Case-Study-Job-Portal-For-Blue-Collar-Workers

---

### 12. بحث عن تقليل الـ Churn Rate في منصة عمالة

**المصدر:** https://medium.com/design-bootcamp/elevating-user-experience-to-counter-churn-rate-on-a-blue-collar-job-search-platform-a-case-study-635cede6dba0

---

## الجزء الثالث: تصميم للأسواق الناشئة (Next Billion Users)

### 13. مبادرة Google — Next Billion Users

> "عند التصميم للمليار المستخدم القادم، خلّيها بسيطة."

**المصدر الأساسي:** https://design.google/library/connectivity-culture-and-credit
**إطار عمل بحثي:** https://research.google/pubs/a-framework-for-technology-design-for-emerging-markets/
**مدونة Google:** https://blog.google/innovation-and-ai/technology/next-billion-users/how-insights-user-research-help-us-build-next-billion-users/
**UX Spot ملخص:** https://uxspot.io/nbu.html

**المبادئ التسعة:**
1. تصميم لسرعات إنترنت بطيئة ومتقطعة
2. تقليل استهلاك البيانات
3. واجهات بسيطة تعتمد على الأيقونات
4. دعم لغات متعددة
5. التصميم لهواتف منخفضة المواصفات
6. مراعاة ثقافة الاستخدام المحلية
7. محتوى قابل للمشاركة (WhatsApp, Facebook)
8. Onboarding بدون عوائق
9. الوضوح فوق الإبداع

**مقال شامل:**
https://medium.com/@leonidstasivskyi/design-for-next-billion-users-how-to-build-products-for-everyone-not-just-silicon-valley-c47decf52e94

---

### 14. Microsoft Research — واجهات لمحدودي التعليم

> "Text-Free UIs: مبادئ تصميم تسمح لشخص غير متعلم باستخدام الواجهة من أول مرة."

**المصدر:** https://www.microsoft.com/en-us/research/project/uis-low-literate-users/
**بحث أكاديمي:** https://dl.acm.org/doi/10.1145/3449210
**NN/G:** https://www.nngroup.com/articles/writing-for-lower-literacy-users/

**التطبيق في يوميّة:**
- Icons مع كل نص مهم (📍 للموقع، 💰 للأجر، 📅 للتاريخ)
- ألوان status واضحة (أخضر = مقبول، أحمر = مرفوض، أصفر = في الانتظار)
- أزرار بنصوص قصيرة (كلمة أو كلمتين)
- تجنّب الاختصارات والمصطلحات التقنية

---

## الجزء الرابع: علم نفس التصميم

### 15. الأشكال المستديرة = أمان وثقة (Rounded Corners)

> "الأشكال المستديرة تتطلب طاقة معرفية أقل من العقل البشري لمعالجتها."

**المصادر:**
- https://medium.com/design-bootcamp/why-round-corners-are-more-efficient-for-human-consumption-20a82a2bcf39
- **بحث أكاديمي (2025):** https://uxpajournal.org/wp-content/uploads/sites/7/pdf/UXPA_Zhuo_05012025.pdf
- **بحث جامعة تورنتو:** https://www.artsci.utoronto.ca/news/new-psychology-research-why-do-we-prefer-curves-over-straight-edges
- https://www.webbb.ai/blog/why-rounded-corners-dominate-ui-trends

**النتائج العلمية:**
- الأشكال المستديرة يتم معالجتها أسرع في الدماغ
- توحي بالأمان والودّ (rounded = safe, angular = threatening)
- YouTube, Apple, Google كلهم انتقلوا لـ rounded corners أكتر
- **بحث UXPA 2025**: التصميم الدافئ (rounded + warm colors) يزيد الثقة المُدركة

**التطبيق في يوميّة:**
- Radius 12-16px للـ cards (مش 6-8px زي الـ brutalist)
- أزرار مستديرة (8-10px radius)
- Badges مستديرة بالكامل (pill shape)

---

### 16. علم نفس الألوان (Color Psychology)

> "الأزرق يبني الثقة. الأخضر يشير للنجاح. البرتقالي يوحي بالدفء والحماس."

**المصادر:**
- https://www.smashingmagazine.com/2025/08/psychology-color-ux-design-digital-products/
- https://uxplanet.org/color-psychology-in-ui-design-more-than-meets-the-eye-72da5051e51e
- https://supercharge.design/blog/color-psychology-in-ux-design

**ألوان يوميّة (مبنية على علم نفس الألوان):**
- **أزرق (#2563eb)** — الثقة، الاحترافية، الأمان. مثالي لـ primary brand color في marketplace
- **أخضر (#22c55e)** — النجاح، القبول، الأجر. للحالات الإيجابية (مقبول، تم الدفع)
- **Amber/Orange (#f59e0b)** — الدفء، الانتباه. للتحذيرات والحالات المعلّقة
- **أحمر (#ef4444)** — الخطر، الرفض. للأخطاء والإلغاء فقط (يُستخدم بحذر)

---

### 17. المساحة البيضاء (White Space) تزيد الفهم

> "المساحة البيضاء بين الفقرات والهوامش تزيد الفهم بنسبة تصل إلى 20%."

**المصادر:**
- https://uxplanet.org/the-power-of-whitespace-a1a95e45f82b
- https://www.ux-bulletin.com/whitespace-improves-readability-trust-conversions/
- **بحث أكاديمي 2026:** https://www.researchgate.net/publication/399655873
- https://www.loop11.com/the-power-of-white-space-in-ux-design/

**التطبيق في يوميّة:**
- Padding كريم داخل البطاقات (1.5rem minimum)
- Gap بين البطاقات (1.25rem minimum)
- لا تزاحم عناصر — كل section يتنفس

---

### 18. الوضع الداكن (Dark Mode) — البحث العلمي

**المصادر:**
- https://loop11.medium.com/why-dark-mode-isnt-always-the-best-choice-a-ux-perspective-0ca96d2f23f1
- **بحث منهجي 2025:** https://www.researchgate.net/publication/393055215
- https://viralpatelstudio.in/blogs/dark-mode-2-accessibility-aesthetic-modern-apps-2025
- https://www.theseus.fi/bitstream/10024/896088/2/Laine_Jere.pdf

**النتائج:**
- Dark mode يقلل إجهاد العين في الإضاءة المنخفضة
- يوفّر بطارية على شاشات OLED (معظم هواتف العمال)
- **مهم:** contrast ratio لازم يكون 4.5:1 minimum (WCAG AA)
- **مهم:** لا تستخدم أسود نقي (#000) — استخدم dark gray (#0f1117 أو أقرب)
- Optimal contrast ratios (4.5:1 - 7:1) تحسّن سرعة القراءة 27%

**قرار يوميّة:** Dark mode كـ default (يناسب العمال اللي بيشوفوا الهاتف في مواقع عمل مشمسة + يوفّر بطارية)

---

## الجزء الخامس: تصميم الـ RTL والعربية

### 19. تصميم تطبيقات عربية (RTL)

**المصادر:**
- https://medium.com/design-bootcamp/what-to-know-while-designing-an-arabic-app-in-right-to-left-fc78f076a536
- https://uxdesign.cc/mobile-app-design-for-right-to-left-languages-57c63f136749
- https://blue.me/blog/cultural-design-middle-east
- https://userq.com/5-essential-considerations-for-ui-ux-in-arabic-interfaces/
- https://medium.com/@omrankhleifat/arabic-app-aesthetics-navigating-the-sands-of-right-to-left-design-0b5a7c29fc31

**المبادئ الأساسية:**
- Mirror الـ layout بالكامل (CSS logical properties)
- الأرقام تبقى LTR (أرقام هندية أو عربية — يوميّة تستخدم عربية)
- Icons مش محتاجة mirroring (إلا arrows)
- Font: Cairo — مصمم خصيصاً للعربية مع دعم أوزان متعددة
- الأزرار وال CTAs أحسن تكون في الطرف الأيمن (مكان الإبهام في RTL)

---

## الجزء السادس: المنافسون والمرجعيات

### 20. bluworks (مصر) — أقرب منافس

**الموقع:** https://bluworks.io/
**المميزات:** https://bluworks.io/en/products-features/
**مراجعة:** https://bluworks.io/en/blogs/bluworks-review/
**تمويل:** $1M (ديسمبر 2025) — https://www.techinafrica.com/egyptian-hr-tech-startup-bluworks-raises-1-million-to-drive-expansion-across-mena-region/
**تغطية صحفية:** https://egyptianstreets.com/2025/12/02/the-platform-making-egypts-blue-collar-workers-feel-seen-and-paid-fairly/

**ملاحظات تصميمية:**
- Mobile-first
- واجهة نظيفة وبسيطة
- تركيز على الـ scheduling + attendance + payroll
- ألوان هادئة ومريحة

---

### 21. Instawork (أمريكا) — الأكبر عالمياً

**الموقع:** https://www.instawork.com/
**واجهة العامل:** https://app.instawork.com/worker
**Play Store:** https://play.google.com/store/apps/details?id=com.instaworkmobile
**App Store:** https://apps.apple.com/us/app/instawork-work-when-you-want/id1123819773
**مقارنات:** https://www.instawork.com/blog/on-demand-staffing-app

**ملاحظات تصميمية:**
- بطاقة الـ shift: 3 معلومات (مكان + وقت + أجر) + زر واحد
- Navigation: 4 tabs في الـ bottom bar
- ألوان: أبيض + أخضر + رمادي

---

### 22. Wonolo (أمريكا)

**الموقع:** https://www.wonolo.com/
**Play Store:** https://play.google.com/store/apps/details?id=com.wonolodroid
**تقرير:** https://info.wonolo.com/report-the-rise-of-blue-collar-gig-workers/

---

### 23. منصات مقارنة أخرى

- **WorkWhile:** https://www.instawork.com/compared-to/workwhile
- **Shiftsmart, Veryable, Qwick:** https://www.instawork.com/blog/on-demand-staffing-app
- **Trade Hounds (حرف يدوية):** https://apps.apple.com/us/app/trade-hounds/id1438568937
- **Tanqeeb Egypt:** https://play.google.com/store/apps/details?id=com.Izam.tanqeebEgypt

---

## الجزء السابع: Design Systems مرجعية (Open Source)

### 24. Vanilla CSS Design System

**الريبو:** https://github.com/pattespatte/vanilla-css-design-system
**Demo:** https://pattespatte.github.io/vanilla-css-design-system/examples/

**لماذا مرجعي:**
- Pure CSS (zero dependencies) — نفس قيود يوميّة
- Token-based (CSS variables)
- Dark mode support
- Modular components (cards, buttons, forms, alerts, toasts, badges, modals)
- Mobile-first responsive

---

### 25. VoltAgent Awesome Design MD

**الريبو:** https://github.com/VoltAgent/awesome-design-md
**الفكرة:** DESIGN.md files — وثيقة تصميم واحدة بتوصف الـ visual language

**لماذا مرجعي:**
- ممكن نعمل DESIGN.md خاص بيوميّة
- الـ AI agents بتفهم الملف وتولّد UI متسق
- 55k stars — مثبت فعاليته

---

### 26. Material Design 3 (Google) — مرجع Components

**المصدر:** https://m3.material.io/
**Cards:** https://m3.material.io/components/cards/guidelines
**Buttons:** https://m3.material.io/components/buttons/overview
**Dark Theme:** https://m2.material.io/design/color/dark-theme.html

**لماذا مرجعي:**
- أكبر design system في العالم
- مبني على بحث مكثف
- Dark theme guidelines محددة (dark gray NOT pure black)
- Card types (elevated, filled, outlined) — نمط واضح

---

## الجزء الثامن: مبادئ WhatsApp (النموذج الملهم)

### 27. لماذا WhatsApp نجح مع 3 مليار مستخدم

**المصادر:**
- https://hbr.org/2016/07/whatsapp-grew-to-one-billion-users-by-focusing-on-product-not-technology
- https://www.analyse.asia/building-whatsapp-for-3-billion-users-with-alice-newton-rex/
- https://techcrunch.com/2025/05/01/whatsapp-now-has-more-than-3-billion-users/

**المبادئ الثلاثة:**
1. **Simple** — واجهة بسيطة جداً. لا tutorial محتاج
2. **Reliable** — يشتغل حتى على إنترنت بطيء
3. **Private** — الثقة أساسية

**التطبيق في يوميّة:**
- بطاقة الفرصة تكون بسيطة زي رسالة WhatsApp — المعلومات الأساسية واضحة فوراً
- التطبيق يشتغل بسرعة (file-based, in-memory cache)
- Trust signals ظاهرة (verification badges, ratings, trust scores)

---

## الجزء التاسع: خلاصة المبادئ التصميمية ليوميّة

### المبادئ العشرة (مبنية على كل البحث أعلاه)

| # | المبدأ | الأساس العلمي | المصدر |
|---|--------|---------------|--------|
| 1 | **أزرار كبيرة (48dp+)** | Fitts's Law + ABLEMKR research | NN/G, Google Research |
| 2 | **اختيارات قليلة** — زر واحد أساسي لكل بطاقة | Hick's Law | lawsofux.com |
| 3 | **Design مألوف** — يشبه WhatsApp و Facebook | Jakob's Law | NN/G |
| 4 | **محتوى upfront** — لا تخبّي المعلومات | Cognitive Load + Aasaanjobs | NN/G, Medium |
| 5 | **Icons مع النصوص** — لمحدودي التعليم | Microsoft Research, Google NBU | microsoft.com |
| 6 | **Rounded corners (12-16px)** — دفء وثقة | Shape Psychology, Toronto Research | UXPA Journal |
| 7 | **ألوان دالّة** — أزرق=ثقة، أخضر=نجاح، amber=انتظار | Color Psychology | Smashing Magazine |
| 8 | **Spacing كريم** — المساحة البيضاء تزيد الفهم 20% | White Space Research | UX Planet |
| 9 | **Progressive Disclosure** — اعرض الأساسي، أخفِ التفاصيل | NN/G | nngroup.com |
| 10 | **جمال = سهولة** — التصميم الجميل يوحي بسهولة الاستخدام | Aesthetic-Usability Effect | NN/G, Laws of UX |

---

## الجزء العاشر: روابط سريعة (Quick Reference)

### قوانين UX
- Laws of UX (الموقع الكامل): https://lawsofux.com/
- Jakob's Law: https://lawsofux.com/jakobs-law/
- Hick's Law: https://lawsofux.com/hicks-law/
- Fitts's Law: https://www.nngroup.com/articles/fitts-law/
- Aesthetic-Usability Effect: https://lawsofux.com/aesthetic-usability-effect/

### أبحاث Blue-Collar
- ABLEMKR (5 Features): https://ablemkr.com/features-blue-collar-app-needs/
- Aasaanjobs (India): https://medium.com/building-aasaanjobs/a-year-in-designing-for-blue-collar-jobseekers-in-india-2c2635efaa1f
- Workit (Behance): https://www.behance.net/gallery/164958855/Workit-Blue-Collar-Job-Booking-App-(UXUI-Case-Study)

### Next Billion Users
- Google Design: https://design.google/library/connectivity-culture-and-credit
- Google Research: https://research.google/pubs/a-framework-for-technology-design-for-emerging-markets/
- Microsoft Low-Literacy: https://www.microsoft.com/en-us/research/project/uis-low-literate-users/
- ACM Guidelines: https://dl.acm.org/doi/10.1145/3449210

### منافسون
- bluworks (Egypt): https://bluworks.io/
- Instawork (USA): https://www.instawork.com/
- Wonolo (USA): https://www.wonolo.com/

### Design Systems
- Vanilla CSS DS: https://github.com/pattespatte/vanilla-css-design-system
- VoltAgent DESIGN.md: https://github.com/VoltAgent/awesome-design-md
- Material Design 3: https://m3.material.io/
- Material Dark Theme: https://m2.material.io/design/color/dark-theme.html

### علم نفس التصميم
- Rounded Corners: https://uxpajournal.org/wp-content/uploads/sites/7/pdf/UXPA_Zhuo_05012025.pdf
- Color Psychology: https://www.smashingmagazine.com/2025/08/psychology-color-ux-design-digital-products/
- White Space: https://www.researchgate.net/publication/399655873
- Cognitive Load: https://www.nngroup.com/articles/minimize-cognitive-load/
- Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/

### RTL / Arabic
- Arabic App Design: https://medium.com/design-bootcamp/what-to-know-while-designing-an-arabic-app-in-right-to-left-fc78f076a536
- RTL Mobile Design: https://uxdesign.cc/mobile-app-design-for-right-to-left-languages-57c63f136749
- MENA Cultural Design: https://blue.me/blog/cultural-design-middle-east
- Arabic UI/UX Essentials: https://userq.com/5-essential-considerations-for-ui-ux-in-arabic-interfaces/

### Dark Mode Research
- UX Perspective: https://loop11.medium.com/why-dark-mode-isnt-always-the-best-choice-a-ux-perspective-0ca96d2f23f1
- Systematic Study: https://www.researchgate.net/publication/393055215
- Dark Mode 2.0: https://viralpatelstudio.in/blogs/dark-mode-2-accessibility-aesthetic-modern-apps-2025

---

## سجل التحديثات

| التاريخ | التعديل |
|---------|---------|
| 2026-04-21 | الإصدار الأول — بحث شامل مع 27 مصدر رئيسي + 50+ رابط |

---

> **هذا الملف يُرفق مع كل CODEBASE_PART ويُحدَّث مع كل مرحلة تطوير جديدة.**
> **كل قرار تصميم لازم يرجع لمبدأ أو أكتر من المبادئ الموثّقة هنا.**
