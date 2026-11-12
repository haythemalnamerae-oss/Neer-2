# تتبع الخدمات والواجهات — Neer-2

**تاريخ التدقيق:** 2026-11-12  
**المستودع:** `haythemalnamerae-oss/Neer-2`  
**فرع القراءة والكتابة:** `main`  
**SHA المرجعي قبل هذا التحديث:** `11fda875708b9f2b173294b3cfe55fc3e3a81c41`  
**نوع الفحص:** تتبع ساكن للمصدر من نقطة تشغيل التطبيق إلى الشاشات والمكونات والخدمات وواجهات API وطبقة Supabase.  
**حدود الفحص:** لم يتم تشغيل المتصفح أو بناء التطبيق أو إجراء عمليات أعمال على بيانات حقيقية.

## 1. خريطة تشغيل التطبيق

المسار الفعلي:

`src/main.tsx` → `ApiSessionGate` → تحميل ديناميكي لـ `src/App.tsx` → `dataStore` → المكونات والصفحات → الخدمات → `apiRequest` → `api/server.ts` → Supabase Auth / PostgREST / RPC / Storage.

- `ApiSessionGate` يتحقق من إعدادات Supabase، يعرض تسجيل الدخول، ينشئ جلسة من Supabase Auth، ثم يحمل لقطة المؤسسة قبل إظهار التطبيق.
- `signIn` يختار العضوية الافتراضية، أو أول عضوية نشطة عند غياب الافتراضية. لا توجد شاشة لاختيار المؤسسة أو تبديلها بعد الدخول.
- `authenticate` في API يعيد التحقق من JWT ومن عضوية المستخدم النشطة في المؤسسة المرسلة في `x-organization-id` في كل طلب.
- لا يستخدم API مفتاح service-role؛ يمرر JWT المستخدم إلى Supabase.
- عند غياب إعداد Supabase في بيئة التطوير يظهر وضع البيانات التجريبية. في الإنتاج يمنع `ApiSessionGate` عرض البيانات التجريبية عند غياب الإعدادات.
- لا يوجد Router بعناوين مستقلة؛ التنقل محلي عبر قيمة `currentView` في App.

## 2. جرد جميع الواجهات المركبة في App

تمت مطابقة كل شروط العرض في `src/App.tsx`: 18 واجهة.

| الواجهة | المكون | مصدر العرض | عمليات الخادم التي تم تتبعها |
|---|---|---|---|
| مركز القيادة | DailyCommandCenterView | dataStore / حسابات محلية | لا توجد عمليات كتابة مباشرة؛ انتقالات إلى الوحدات |
| الخريطة الميدانية | FieldMapView | مهام ومستخدمون من snapshot | بدء/إيقاف/استئناف المهمة وتسجيل أحداث GPS |
| تقييم الإنجازات | PerformanceEvaluationView | dataStore وتقارير محلية | تغطية العجز فقط عبر FinanceApiService |
| مركز الاعتمادات | ApprovalsCenterView | snapshot للمهام والمصروفات والتسويات | مراجعة المهمة والمصروف والتسوية عبر RPC |
| لوحة المؤشرات | DashboardView | ReportsService وAIService وdataStore | لا توجد كتابة؛ المؤشرات والتحليل محليان |
| المهام والمشاريع | TasksView | snapshot المهام والمستخدمين | الإلغاء عبر tasks.api؛ التفاصيل عبر TaskDetailsModal |
| المتابعة | FollowUpsView | مهام وسلاسل من snapshot | فتح تفاصيل المهمة والنتيجة والسلسلة |
| العهد والأرصدة | FundsView | snapshot مالي | تغذية، مقبوضات، عجز، تسوية وحسابات دائمة |
| المصروفات والفواتير | ExpensesView | snapshot مالي | اعتماد ورفض عبر RPC؛ الإنشاء عبر NewExpenseModal |
| التسويات | SettlementsView | snapshot مالي | مراجعة واعتماد ورفض عبر RPC؛ الطباعة محلية |
| التقويم | CalendarView | snapshot المهام | إعادة الجدولة عبر `rescheduleTaskOnServer` وPATCH محدود لحقول التاريخ/الوقت |
| التقارير | ReportsView | ReportsService من dataStore | تصدير CSV محلي |
| الفريق الميداني | TeamView | بيانات users/tasks/funds المحملة | عرض وبحث وتصفية محلية |
| المستخدمون | UsersView | dataStore snapshot | إنشاء المستخدم المحلي الوهمي معطل؛ provisioning الفعلي يتطلب دعوة Supabase Auth وربط العضوية والملف |
| الأدوار والصلاحيات | RolesView | permission_catalog وrole_permissions | قراءة وحفظ مصفوفة RBAC عبر API |
| سجل التدقيق | AuditLogsView | audit_logs من snapshot | قراءة وبحث محلي؛ لا توجد كتابة من الشاشة |
| إعدادات المنشأة | SettingsView | `system_settings` عبر RPC | القراءة والحفظ عبر RPCs بصلاحيات المؤسسة؛ لا يوجد زر لإعادة تهيئة بيانات الإنتاج |
| عارض الشيفرة | CodeRepositoryViewer | sourceRegistry ثابت | عرض أمثلة/مصادر محلية؛ ليس مستكشفًا حيًا للمستودع |

## 3. المكونات المشتركة

- `Sidebar`: التنقل الجانبي وإخفاء الوحدات وفق `hasPermission` التي تستخدم grants المحملة من `/permissions/me` للجلسة.
- `MobileBottomNav`: تنقل الهاتف ويستخدم المصفوفة الثابتة نفسها.
- `Header`: إجراءات سريعة، الخط، الإشعارات، تسجيل الخروج. قراءة الإشعارات وتحديدها كمقروءة عبر `notifications.api.ts` وAPI مع فلترة user_id.
- `GlobalQuickActionFab`: فتح نماذج المهام والمصروفات والتنقل.
- `ApiSessionGate`: المصادقة وتحميل اللقطة.
- App يشترك في تغييرات dataStore ويعيد العرض، ويشغّل/يوقف تتبع GPS للمهام الميدانية النشطة.

## 4. جرد النماذج ومساراتها

| النموذج | المسار الفعلي |
|---|---|
| NewTaskModal | `createTaskBundle` → `POST /tasks/create-bundle` → `create_task_bundle` |
| TaskOutcomeModal | رفع إثبات اختياري ثم `recordTaskOutcomeOnServer` → `POST /tasks/record-outcome` → `record_task_outcome_bundle` |
| NewExpenseModal | `FinanceApiService.createExpense` → `POST /finance/create-expense` → `finance_create_expense` |
| NewFundModal | `FinanceApiService.createFund` → `finance_create_fund` |
| NewSettlementModal | `SettlementsService.create` → `FinanceApiService.createSettlement` → `finance_create_settlement` |
| NewStandingAccountModal | `FinanceApiService.createStandingAccount` → `finance_create_standing_account` |
| TaskDetailsModal | بدء/إيقاف/استئناف، الخطوات، checklist، subtask، daily update، comments، attachments؛ أغلبها عبر tasks.api وRPC/REST |
| StandingAccountDetailsModal | charge وsettlement عبر finance RPC |
| TaskChainModal | عرض سلسلة المهام والتنقل بينها؛ لا يملك مسار كتابة مستقلًا |

## 5. تتبع خدمات المهام

الخدمة النشطة الأساسية: `src/services/tasks.api.ts`.

| العملية | نقطة API | مسار الخادم/القاعدة |
|---|---|---|
| إنشاء حزمة مهمة وخطواتها | `/tasks/create-bundle` | RPC ذري `create_task_bundle` |
| تسجيل نتيجة المهمة ومتابعة جديدة وحدث موقع | `/tasks/record-outcome` | RPC ذري `record_task_outcome_bundle` |
| بدء/إيقاف/استئناف مهمة غير ميدانية | `/tasks/lifecycle` | RPC `update_task_lifecycle` |
| اعتماد/رفض المهمة | `/tasks/review` | RPC `review_task_approval` |
| إلغاء المهمة | `/tasks/cancel` | RPC إلغاء مخصص؛ لا حذف فعلي |
| تحديث checklist | `PATCH /task-checklist` | مورد task_checklist_items مع RLS |
| تحديث حالة خطوة | `PATCH /task-steps` | مورد task_steps مع RLS |
| إضافة تقرير يومي | `POST /task-updates` | مورد task_daily_updates مع RLS |
| إضافة مهمة فرعية | `POST /task-subtasks` | مورد task_subtasks مع RLS |
| تحديث حالة المهمة الفرعية | `PATCH /task-subtasks` | مورد task_subtasks مع RLS |
| إضافة تعليق | `POST /task-comments` | مورد task_comments مع RLS |
| رفع مرفق | Supabase Storage ثم `/tasks/attach` | كائن خاص ثم RPC تسجيل metadata |
| رابط مرفق | Storage signed URL | رابط موقّع مؤقت |
| حذف مرفق | `DELETE /task-attachments` ثم Storage DELETE | حذف metadata ثم الكائن |
| حدث GPS عادي | `POST /task-events` | إدراج حدث append-only |
| دورة GPS الميدانية | `POST /task-events/lifecycle` | RPC `record_field_task_event` |

ملاحظات:
- `TaskOutcomeModal` يحتفظ بمعرّف طلب النتيجة في حالة النموذج لتكرار المحاولة بنفس request ID.
- تسجيل نتيجة المهمة عملية ذرية في قاعدة البيانات، لكن رفع الإثبات يحدث قبل RPC النتيجة؛ إذا فشل تسجيل النتيجة قد يبقى ملف مرفوع غير مرتبط.
- إضافة subtask ثم تسجيل حدث الموقع عمليتان منفصلتان؛ فشل الحدث لا يلغي subtask الذي حُفظ.
- حذف metadata للمرفق يسبق حذف كائن Storage؛ فشل حذف الكائن بعد حذف metadata قد يترك كائنًا يتيمًا.
- `mutateTaskResource` يرفع خطأً واضحًا إذا نجحت الكتابة وفشل تحديث snapshot؛ يجب عدم إعادة العملية عند ظهور رسالة الحفظ مع فشل التحديث.
- تحديث اللقطة يجلب حتى 500 سجل لكل مجموعة دون pagination.

## 6. تتبع الخدمات المالية

الخدمة النشطة: `src/services/finance-api.service.ts`، والوسيط `api/server.ts` يوجهها إلى RPCs.

| عملية الواجهة | Workflow | RPC |
|---|---|---|
| إنشاء عهدة | create-fund | finance_create_fund |
| تغذية عهدة | replenish-fund | finance_replenish_fund |
| إنشاء مصروف | create-expense | finance_create_expense |
| اعتماد/رفض مصروف | review-expense | finance_review_expense |
| تغطية عجز | cover-deficit | finance_cover_deficit |
| إنشاء تسوية | create-settlement | finance_create_settlement |
| مراجعة تسوية | review-settlement | finance_review_settlement |
| تسجيل مقبوض | create-cash-receipt | finance_create_cash_receipt |
| إنشاء حساب دائم | create-standing-account | finance_create_standing_account |
| تسجيل قيد charge | standing-entry | finance_create_standing_entry |
| تسوية حساب دائم | settle-standing-account | finance_settle_standing_account |

- السجلات المالية محمية من CRUD العام في API؛ الكتابة تمر عبر workflow مخصص.
- كل عملية ذات مفتاح idempotency تولد حاليًا UUID جديدًا عند كل استدعاء من المتصفح.
- `workflow()` ينتظر تحديث snapshot بعد نجاح RPC ولا يميز للمستخدم بوضوح بين فشل العملية وفشل تحديث العرض؛ إعادة المحاولة تنشئ مفتاحًا جديدًا وقد تكرر عملية نجحت بالفعل.
- صلاحية إنشاء المصروف لغير الأدوار المالية تعتمد على grant `expenses.create`; بقية workflows المالية مقيدة إلى admin وfinance_officer.
- فحوص المبالغ والقيود النهائية موجودة في RPCs؛ التحقق من جهة الواجهة وحده غير كافٍ.

## 7. جرد API

### المسارات المخصصة

- GET `/health`
- GET `/api/v1`
- GET `/api/v1/me`
- POST `/api/v1/tasks/create-bundle`
- POST `/api/v1/tasks/record-outcome`
- POST `/api/v1/tasks/review`
- POST `/api/v1/tasks/cancel`
- POST `/api/v1/tasks/attach`
- POST `/api/v1/tasks/lifecycle`
- GET `/api/v1/admin/permissions`
- PUT `/api/v1/admin/permissions/:roleKey`
- POST `/api/v1/task-events/lifecycle`
- POST `/api/v1/finance/:workflow`
- ALL `/api/v1/:resource/:id?` لموارد CRUD المسموح بها

### موارد CRUD العامة (24)

tasks, task-events, task-assignees, task-checklist, task-steps, task-subtasks, task-updates, task-history, task-attachments, task-comments, funds, expenses, settlements, settlement-expenses, cash-receipts, standing-accounts, fund-transactions, standing-account-entries, follow-ups, notifications, audit-logs, users, roles, settings.

القيود:
- كل طلب API (باستثناء health) يمر عبر authenticate.
- يفرض API organization_id من جلسة العضوية ولا يقبل organization_id من body.
- يفرض permission lookup في role_permissions للموارد العامة.
- يطبق نطاقًا إضافيًا لمستخدم field_officer على المهام والأبناء والمتابعات والعهد والإشعارات.
- لا يسمح CRUD العام بالكتابة المالية.
- task-history غير قابل للإضافة من الواجهة العامة؛ المرفقات لها مسار تسجيل مخصص؛ حذف المهمة يتحول إلى workflow إلغاء.
- بعض حقول body غير المالية لا تملك allowlist تفصيلية على مستوى API؛ تعتمد على RLS وقيود قاعدة البيانات. يلزم توثيق حقول كل مورد واختبارها.

## 8. الفجوات المؤكدة في الواجهات

### P0 — تؤثر على صحة البيانات/التشغيل

1. **Provisioning المستخدمين غير متاح داخل الواجهة:** تم تعطيل الإضافة المحلية الوهمية وإزالة الأدوار غير المدعومة. يلزم بناء دعوة Supabase Auth موثوقة وربط app_users وorganization_members قبل تمكين إنشاء المستخدم من الواجهة. معروف وقد يؤدي إلى قراءة `ROLE_LABELS[u.role].badgeColor` من قيمة غير موجودة.
2. **إعدادات محلية:** `SettingsView` يحفظ عبر `dataStore.updateSettings` إلى localStorage؛ لا يستدعي مورد settings أو system_settings. لقطة الخادم لا تحمل الإعدادات ولا تستبدلها، ولذلك قد تبقى إعدادات متصفح قديمة من مؤسسة أخرى. قيم الخادم الافتراضية للمالية قد تختلف عن المعروض في الواجهة.
3. **تم إصلاح التقويم:** `CalendarView` يستدعي `rescheduleTaskOnServer`، وAPI يسمح فقط بتعديل due_date/start_date/due_time ويترك تغييرات الحالة لمسارات lifecycle/outcome/review.
4. **إيقاف الحساب الدائم محلي:** أزرار الإيقاف في FundsView وSettingsView تستدعي `dataStore.deleteStandingAccount` الذي يغير active في الذاكرة/localStorage فقط. المورد المالي لا يسمح CRUD عام للتعديل ولا يوجد workflow مخصص للتفعيل/الإيقاف.
5. **تضارب الصلاحيات:** `RolesView` يقرأ ويكتب grants من Supabase، لكن `hasPermission` في `src/lib/rbac/permissions.ts` يقرأ `ROLE_PERMISSIONS` ثابتة. Sidebar وMobileBottomNav ومعظم أزرار العرض تستخدم هذه المصفوفة، بينما API يفحص role_permissions الفعلية. قد تظهر شاشة أو تختفي على خلاف صلاحية الخادم. لا تتحدث واجهة المستخدم فور تغيير grants.
6. **التقارير غير مكتملة خادميًا:** ReportsService وDashboard وPerformanceEvaluation تحسب في المتصفح من dataStore. لا توجد استعلامات تجميع server-side أو pagination للتقارير؛ النتائج قد تكون ناقصة فوق حد 500 سجل لكل collection.

### P1 — اتساق وتوثيق وتجربة

7. **الإشعارات:** تُحمّل من Supabase، لكن Header يحدّث isRead محليًا فقط عبر dataStore؛ لا يوجد طلب PATCH أو endpoint مخصص لتثبيت حالة القراءة في قاعدة البيانات.
8. **سجل التدقيق:** AuditLogsView يقرأ snapshot الخادمي، لكن عمليات dataStore.logAudit المحلية لا تتحول تلقائيًا إلى audit_logs. يجب عدم عرض سجل محلي على أنه سجل تدقيق مركزي.
9. **Dashboard metrics:** `DashboardView` يحمّل metrics وAI analysis داخل useEffect بلا dependencies؛ لا يعيد حساب هذه الحالات بعد تغير dataStore ما دام المكون mounted.
10. **AIService ليس نموذج AI:** هو قواعد if/else محلية بقيم ثابتة، ويتضمن عبارة توافق ضريبي 100% ونصائح توفير وأرقامًا افتراضية لا تستند إلى بيانات مقيّمة. يجب إعادة تسميته كمحلل قواعد أو ربطه بمصدر AI حقيقي مع إظهار المصدر والقيود.
11. **لقطة البيانات:** `loadUiSnapshot` يجلب limit=500 لكل collection بلا pagination. كما أن أدوار ops_manager وviewer تظهر لها بعض الوحدات حسب ROLE_PERMISSIONS لكن لقطة finance لا تحمل مجموعات المالية لهذين الدورين؛ ينتج عن ذلك صفحات مالية فارغة أو غير مكتملة حسب grants.
12. **قائمة المستخدمين والفريق:** تحميل دليل المستخدمين مقتصر على admin وops_manager؛ الأدوار الأخرى تتلقى ملف المستخدم الحالي فقط. يجب جعل نطاق الواجهة مقصودًا وواضحًا بدل عرض فريق ناقص كأنه القائمة الكاملة.
13. **تبديل المؤسسة:** اختيار المؤسسة تلقائيًا عند الدخول ولا يوجد switcher. تغيير العضوية أو الدور في قاعدة البيانات لا يحدث role في session المخزنة حتى إعادة الدخول، مع أن API يعيد التحقق من العضوية الفعلية في كل طلب.
14. **رسائل أخطاء API:** sendDbError يرسل تفاصيل PostgREST داخل error.details، لكن apiRequest يعرض error.message فقط؛ غالبًا يفقد المستخدم تفاصيل سبب الرفض.
15. **تحديث task child:** بعد نجاح mutation قد يفشل snapshot refresh ويُبتلع الخطأ؛ يجب إظهار حالة "حُفظ على الخادم، فشل تحديث العرض" بدل إظهار شاشة قديمة بصمت.
16. **GPS والخرائط:** FieldMapView يحتاج `VITE_GOOGLE_MAPS_API_KEY`، كما يتطلب GPS إذن المتصفح واتصالًا ملائمًا. لم يتم اختبار سلوك الرفض أو فقد الإشارة على جهاز فعلي.
17. **البيانات التجريبية:** dataStore يبدأ من mockData/localStorage. بوابة الإنتاج تمنع العرض قبل الدخول عند وجود إعدادات Supabase، لكن يجب استمرار فصل وضع العرض التجريبي عن مسارات الإنتاج.
18. **Reset:** زر Settings يستدعي resetToDefault ويمسح localStorage ويعيد mock data محليًا؛ لا يحذف قاعدة Supabase. النصوص يجب أن تفرق صراحة بين إعادة ضبط العرض المحلي وإجراء إداري على بيانات المؤسسة.

## 9. الخدمات القديمة أو غير المستخدمة في مسار الواجهة

- `TasksService` ينفذ create/update/delete محليًا على dataStore؛ لم يظهر له استدعاء نشط من صفحات App في بحث المراجع. لا تستخدمه في الواجهات المتصلة دون إعادة ربطه بـtasks.api.
- `NotificationsService` واجهة محلية فوق dataStore، ولم يظهر استدعاء نشط لها؛ Header يتعامل مع dataStore مباشرة.
- `FundsService` و`ExpensesService` طبقات wrappers؛ لم يظهر لها استدعاء نشط من صفحات App في بحث المراجع. الكتابة المالية النشطة تتم عبر FinanceApiService.
- `SettlementsService` مستخدمة في NewSettlementModal، وتفوض الإنشاء والمراجعة إلى FinanceApiService.
- `sourceRegistry` يحتوي أمثلة/نسخًا قديمة من الخدمات والـRBAC؛ CodeRepositoryViewer يعرضها كمحتوى ثابت، ولا تعتبر مصدرًا حيًا لحالة التنفيذ.

## 10. نتائج التغطية والحدود

- تتبع ساكن للواجهات المركبة: 18/18.
- تتبع المكونات المشتركة ومسار التشغيل والمصادقة: مكتمل على مستوى المصدر.
- تتبع workflows المالية الـ11: مكتمل على مستوى ربط client → API → RPC.
- تتبع مسارات المهام والملفات وGPS: مكتمل على مستوى ربط client → API → RPC/REST/Storage.
- جرد مسارات API المخصصة وموارد CRUD: مكتمل على مستوى المصدر.
- التحقق من أن كل زر يعمل فعليًا في المتصفح، وأن كل حالة خطأ تظهر بشكل صحيح: غير مثبت دون تشغيل محلي واختبارات متصفح.
- التحقق من صلاحيات كل دور بمستخدم حقيقي، والـcross-tenant، وGPS على جهاز، وStorage upload/delete، وسيناريوهات timeout/retry: غير مكتمل دون حسابات اختبار وتشغيل تكاملي.
- لم يتم تشغيل lint/build أو نشر سحابي أو تعديل business data في هذه الجولة.

**الحكم:** تغطية التتبع الساكن للمصدر وصلت إلى كامل قائمة الواجهات والمسارات المكتشفة. لا يعني ذلك اكتمال التنفيذ الوظيفي 100%؛ الفجوات أعلاه موثقة وتحتاج معالجة واختبارات تشغيلية قبل اعتماد النظام.
