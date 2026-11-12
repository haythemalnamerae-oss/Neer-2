# قاعدة بيانات Neer-2 على Supabase

## الحالة الحية

قاعدة Supabase المرتبطة بمشروع Neer-2 متصلة ونشطة. فحص 2026-11-12 أكد PostgreSQL 17.11، و30 جدول تطبيق في public، وRLS على جميعها، و75 سياسة، و35 ترحيلاً مطبقاً حتى `20261112144750`.

قاعدة البيانات هي مصدر الحقيقة للمؤسسة والمهام والعمليات المالية. لا تعتمد على mockData.ts أو localStorage كسجلات إنتاجية. إضافة إلى مسارات المهام والمالية، أصبح إنشاء طلبات المهام واعتمادها والمهام الفرعية والخطوات والتقارير الملخصة ودعوات المستخدمين لها مسارات خادمية؛ دعوات Auth تتطلب مفتاح service-role على الخادم فقط.

## بنية البيانات

تشمل الجداول المؤسسات والعضويات والمستخدمين والأدوار والصلاحيات، والمهام ومكلفيها وخطواتها وتعليقاتها ومرفقاتها وأحداثها، والعهد والمصروفات والمقبوضات والتسويات والحسابات الدائمة، والمتابعات والإشعارات والتدقيق.

جميع جداول التطبيق الـ28 تستخدم organization_id وعزل RLS. تغييرات المالية تمر عبر RPCs ذرية؛ لا تستخدم REST CRUD العام لتغيير أرصدة أو قيود مالية. سجلات fund_transactions وstanding_account_entries وtask_events محمية من UPDATE/DELETE.

## مشروع Supabase المرتبط

معرّف المشروع المرتبط: xtfuvxomfhlfjtpljofh.

قبل أي ترحيل جديد:
1. تأكد أن المشروع المرتبط هو Neer-2.
2. قارن supabase_migrations.schema_migrations مع ملفات supabase/migrations؛ سجل الخادم يحتوي 34 ترحيلاً حتى `20261112144750`. تمت استعادة/مطابقة ملفي هذين الترحيلين مع إصداريهما البعيدين، كما تمت مطابقة أسماء الملفات الأخرى التي اختلفت أوقاتها مع سجل الخادم. نُقل ملف إنشاء مهمة تجريبي غير مطبق إلى `supabase/archive` حتى لا يطبقه مشغل الترحيلات. نفّذ `supabase migration list` محليًا وتأكد من عدم وجود pending migrations غير مقصودة قبل `db push`.
3. خذ نسخة احتياطية قابلة للاستعادة.
4. راجع SQL وخطة التراجع، خصوصاً أي تغيير يمس RLS أو المالية.
5. لا تعدل أو تعيد كتابة البيانات المالية التاريخية.
6. لا تشغّل بناءً أو نشراً سحابياً ضمن سير العمل؛ البناء النهائي محلي.

أوامر CLI للاستخدام المحلي بعد مراجعة المشروع:
- supabase login
- supabase link --project-ref xtfuvxomfhlfjtpljofh
- supabase migration list
- supabase db push

لا تنفذ db push قبل مطابقة سجل الترحيلات وأخذ نسخة احتياطية ومراجعة التغييرات المقترحة.

## تهيئة المستخدمين والأدوار

إنشاء حساب الدخول يتم عبر Supabase Auth أو إجراء provisioning موثوق من الخادم. بعد ذلك يُربط UUID الخاص بـAuth بمؤسسة موجودة في organizations عبر organization_members وملف app_users. يجب أن يتطابق organization_id وauth_user_id في السجلين. أنشئ ملف app_users أولاً ثم العضوية إذا كان app_user_id مطلوباً كمفتاح أجنبي.

الأدوار الحالية فقط:
- admin
- ops_manager
- finance_officer
- field_officer
- viewer

الأذونات التفصيلية في permission_catalog وrole_permissions. لا تمنح مفاتيح service-role للمتصفح أو تخزن كلمات مرور ومفاتيح في Git.

## متغيرات التطبيق

للتطوير المحلي فقط، أضف إلى .env.local القيم الخاصة بالمشروع ولا ترفعها إلى Git:
- VITE_SUPABASE_URL=https://xtfuvxomfhlfjtpljofh.supabase.co
- VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
- VITE_API_URL=/api/v1
- SUPABASE_URL=https://xtfuvxomfhlfjtpljofh.supabase.co
- SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY

لا تستخدم service-role key في المتصفح. خادم API يمرر JWT المستخدم إلى PostgREST وتعتمد RLS كحد عزل نهائي. أضف `SUPABASE_SERVICE_ROLE_KEY` إلى بيئة الخادم فقط إذا أردت تشغيل دعوات Auth؛ لا تضفه إلى `VITE_*` ولا تضعه في Git.

## حدود معروفة

- `system_settings` ما زال فارغًا حتى الآن؛ واجهة Settings أصبحت تقرأ وتحفظ عبر RPC، لكن يلزم إدخال إعدادات المنشأة الفعلية من الواجهة بعد تسجيل الدخول.
- جداول tasks/task_requests/task_subtasks/task_steps ما زالت فارغة؛ مسارات الحوكمة موجودة لكن لم تُختبر على سجلات تشغيلية.
- loadUiSnapshot يجلب 500 سجل كحد لكل مجموعة ولا يطبق pagination حالياً؛ endpoint التقارير الجديد يستخدم صفحات متتابعة حتى 50,000 سجل.
- لا يوجد دفتر أستاذ عام مزدوج القيد أو جدول حسابات بنكية في المخطط الحالي.
- قاعدة البيانات التشغيلية والمالية كانت فارغة عند تدقيق 2026-11-12؛ لا تعتبر نجاح فحوص الصفر دليلاً على صحة كل سيناريو مالي.
- راجع docs/DEEP_DIVE_AUDIT.md وdocs/SECURITY_AUDIT.md قبل تغيير المخطط أو الصلاحيات.
