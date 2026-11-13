# تنفيذ Android للموقع — Neer-2

**التاريخ:** 2026-11-13  
**الحالة:** عقد JavaScript bridge معرف في الويب؛ تنفيذ Android أصلي غير موجود في هذا المستودع.

## واجهة الربط التي يتوقعها الويب
`window.NeerNative`:
- `getVpnStatus()`
- `ensureLocationServices()`
- `requestLocationPermission()`
- `getCurrentLocation()`
- `openVpnSettings()`
- `openLocationSettings()`
- `startBackgroundLocationTracking(taskId)`
- `stopBackgroundLocationTracking(taskId)`

## السلوك الحالي
- عند غياب الجسر الأصلي، يرفض مسار بدء الزيارة/المهمة الميدانية توثيق الموقع بدلاً من ادعاء نجاح GPS.
- قراءة الموقع من جسر Android فقط لأحداث التنفيذ الميداني.
- واجهة الويب لا تضمن استمرار GPS بعد تعليق WebView أو إغلاق التطبيق.

## ما يلزم في مشروع Android منفصل
- تنفيذ موفر موقع موثوق مع الدقة والوقت والمصدر.
- أذونات الموقع الدقيق/التقريبي وأذونات Foreground Service المناسبة لإصدار Android.
- إشعار خدمة واضح، إيقاف الخدمة عند pause/complete/cancel، واحترام قيود البطارية.
- تخزين طابور دائم آمن وربطه بمستخدم ومؤسسة وجهاز؛ عدم نقل الأحداث عند تبديل الحساب.
- اختبار ميداني على جهاز حقيقي وإعادة تشغيل الجهاز وانقطاع الشبكة.


## سجل تعذر الموقع
- عند تعذر التقاط الموقع من Android أو رفض الإذن/تعطيل الخدمات/انتهاء المهلة، يمكن للواجهة إرسال `location_unavailable` مع حالة السبب وإحداثيات NULL.
- لا يعتبر هذا بديلاً عن GPS الأصلي؛ إنه سجل تدقيق يثبت أن محاولة التوثيق تعذرت، ولا يسمح ببدء التنفيذ الميداني دون موقع صحيح.


## قرار نطاق Android
- المستودع `smp000011-ux/med-joy-flow` أزال `android-mobile` من `main` في commit `8eea0942380ca4fc618a2f7fba4f37ca3e29f3b7` بعنوان `chore(android): remove legacy android-mobile application from main`.
- لا يعاد إنشاء/استرجاع تطبيق Android أو جسره الأصلي ضمن Neer-2 دون توجيه منفصل؛ سجل GPS في الويب لا يدعي أنه خدمة خلفية أصلية.
