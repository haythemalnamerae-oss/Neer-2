# Secure account provisioning and RBAC

## Account credentials

Do not commit passwords, Auth tokens, or service-role keys to source control, `.env.example`, frontend code, migrations, or issue comments. Credentials pasted into a chat or repository task should be considered exposed: reset those passwords in Supabase Auth and enable MFA for the owner/admin account. This implementation deliberately does not create accounts or set the supplied passwords.

Provision owner/admin and initial users through Supabase Dashboard → Authentication → Users (or a trusted server-side provisioning workflow), set a unique temporary password or invite link, require a password reset, and verify the email. Then link each Auth UUID to `organization_members` and `app_users` for the intended organization. For the first administrator, use the Auth UUID and organization UUID only after the organization exists:

```sql
insert into public.organization_members (organization_id, auth_user_id, app_user_id, role, active, is_default)
values ('ORGANIZATION_UUID'::uuid, 'OWNER_AUTH_UUID'::uuid, 'usr-owner', 'admin', true, true);

insert into public.app_users (id, organization_id, auth_user_id, name, email, role, role_title_ar, active)
values ('usr-owner', 'ORGANIZATION_UUID'::uuid, 'OWNER_AUTH_UUID'::uuid,
        'Owner', 'OWNER_EMAIL', 'admin', 'مدير النظام', true);
```

Run the SQL with a trusted Supabase admin connection after substituting real UUIDs. Do not execute it from the browser.

## Normalized permissions

Migration `20261107010000_normalized_rbac.sql` creates a normalized permission catalog and per-organization `role_permissions` grants, initializes sensible defaults for all current roles, and automatically seeds new organizations. The UI role matrix reads and writes this catalog through the admin-only `/api/v1/admin/permissions` API. The API checks role grants for every resource/action; Supabase RLS remains a second access-control layer.

Apply both schema migrations using the Supabase CLI after linking the intended project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

The app's administrative page is already available under the existing “الأدوار” navigation item. Only active `admin` membership can modify grants. The built-in admin role cannot be edited to avoid accidental lockout. Custom role assignment is not enabled yet because `organization_members.role` currently supports the five built-in role keys.
