# قاعدة بيانات Neer على Supabase

## ما الذي يضيفه هذا المخطط؟

تُنشئ الهجرة `migrations/20261107000000_neer_unified_operations.sql` مخطط PostgreSQL مترابطاً لواجهة Neer: المؤسسات والعضويات والمستخدمون والأدوار والإعدادات، المهام وقوائم التحقق والمراحل والتعليقات والمرفقات وسجل التنفيذ، العهد والمصروفات والتسويات والمقبوضات والحسابات الدائمة، المتابعات والإشعارات وسجل التدقيق.

تستخدم الجداول مفاتيح نصية لسجلات التطبيق مثل `tsk-1` و`fund-1`، مع فصل بيانات كل مؤسسة بواسطة `organization_id`. تفعّل الهجرة RLS؛ ويقتصر الوصول المالي على المدير ومسؤول المالية. يرتبط تسجيل الدخول بمستخدمي Supabase Auth عبر `organization_members.auth_user_id`.

## تطبيق المخطط على مشروع Supabase المرتبط

لم يُتح في جلسة العمل اتصال إداري بمشروع Supabase أو بيانات اعتماده، لذلك لم أتمكن من تنفيذ الهجرة داخل المشروع نفسه. بعد ربط Supabase CLI بالمشروع الصحيح شغّل من جذر المستودع:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

راجع اسم المشروع ومعرّفه قبل `db push`؛ فهذا الأمر يطبّق التغييرات على قاعدة البيانات البعيدة.

يمكن أيضاً فتح ملف الهجرة وتشغيل SQL في Supabase Dashboard → SQL Editor، بعد التأكد من اختيار المشروع الصحيح.

## تهيئة أول مؤسسة ومدير

1. أنشئ حساب المدير من Supabase Authentication، ثم انسخ UUID الخاص به.
2. شغّل التالي من SQL Editor بعد تعديل القيم. أنشئ المؤسسة أولاً، ثم أضف العضوية والمستخدم:

```sql
with new_org as (
  insert into public.organizations (name)
  values ('اسم المؤسسة')
  returning id
)
insert into public.organization_members (organization_id, auth_user_id, role, active, is_default)
select id, 'AUTH_USER_UUID'::uuid, 'admin', true, true from new_org;

-- كرر باستخدام UUID المؤسسة الذي أُنشئ في الخطوة السابقة:
insert into public.app_users (id, organization_id, auth_user_id, name, email, role)
values ('usr-admin', 'ORGANIZATION_UUID'::uuid, 'AUTH_USER_UUID'::uuid,
        'اسم المدير', 'admin@example.com', 'admin');
```

أضف بقية أعضاء المؤسسة من حساب مدير؛ لا تضع `service_role` أو مفاتيح إدارية في الواجهة الأمامية.

## متغيرات التطبيق

أضف إلى `.env.local` قيم مشروعك (لا ترفع القيم السرية إلى GitHub):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

**مهم:** هذه الهجرة تنشئ قاعدة البيانات وسياسات الحماية، لكنها لا تستبدل بعدُ مخزن `localStorage` الحالي في الواجهة ولا تنقل بيانات `mockData.ts` تلقائياً. يلزم تنفيذ طبقة Supabase في التطبيق وربط تسجيل الدخول والمخزن بهذه الجداول قبل أن تقرأ الواجهة البيانات منها. لا تستخدم بيانات `mockData.ts` كبيانات إنتاجية.
