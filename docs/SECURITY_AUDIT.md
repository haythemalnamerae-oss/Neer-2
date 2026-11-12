# Neer-2 — Security Audit

**Audit date:** 2026-11-12  
**Scope:** Supabase RLS, policies, privileged functions, storage, API authentication and branch workflow.  
**Changes:** read-only inspection only.

## Positive controls verified

- RLS is enabled on all 28 application tables in `public`.
- No public application table without RLS, or RLS-enabled application table without a policy, was returned by the catalog coverage query.
- Policies consistently use active organization membership, role checks, task access predicates, and/or assigned-field-user scope.
- The API verifies the bearer token through Supabase Auth, resolves the active membership for the requested organization, derives the role from the membership row, and forwards the same user JWT to PostgREST.
- The browser does not use a service-role key. API configuration uses the Supabase anon/publishable key plus the caller's JWT.
- Finance generic CRUD writes are blocked by the API. Dedicated transactional RPCs are used for finance mutations; direct authenticated write policies were removed by the latest migration.
- Task event, fund transaction, and standing-account entry ledgers have UPDATE/DELETE rejection triggers.
- The `task-attachments` bucket is private. Storage access is scoped to the organization/task path and task permission.
- Privileged helpers are placed in a non-exposed `private` schema with restricted schema usage.

## Findings requiring follow-up

### High-priority review — 18 authenticated SECURITY DEFINER RPCs

Supabase Security Advisor reports 18 `SECURITY DEFINER` functions callable by `authenticated` users. These appear to be intended transactional API endpoints (task bundles/lifecycle/outcomes and finance workflows), not automatically exploitable vulnerabilities. However, every callable function must independently enforce `auth.uid()`, active membership, tenant match, role/permission, input validation and idempotency where relevant. The advisor warning must remain open until a complete function-by-function review and negative cross-tenant/unauthorized-role tests are completed.

Several functions have an explicitly fixed `search_path`; helper functions in `private` are also security-definer. The exact function ACL and body must be considered together; do not revoke access indiscriminately because the frontend currently depends on RPC endpoints.

### Auth configuration

Supabase Security Advisor reports leaked-password protection disabled. This is an Auth dashboard configuration item, not a source-code defect. Enable it after the owner reviews the Auth impact and supported password policy.

### Role model mismatch

The database/API currently uses five role keys: `admin`, `ops_manager`, `finance_officer`, `field_officer`, and `viewer`. The desired business roles mentioned in the project brief include supervisor, employee, accountant, custody manager and auditor concepts. These concepts are not all separate persisted roles today; map them deliberately through the permission catalog before introducing new role keys. A dedicated auditor role is not currently present.

### Branch guard workflow

`.github/workflows/main-only-branch-guard.yml` has `contents: write` and can delete non-reserved branches when triggered. It was not executed. Keep this workflow from being manually dispatched or triggered by experimental branch creation; review whether automatic deletion is an acceptable governance policy.

## Advisor snapshot

- Security: 18 authenticated SECURITY DEFINER findings; 1 leaked-password-protection warning.
- Performance: 30 unused-index informational findings. These are not grounds for dropping indexes: the operational tables are currently empty and usage statistics are not representative.
- Health: no advisor findings returned.

## Not yet proven

No authenticated-user integration tests were run for cross-tenant reads/writes, unauthorized approvals, role escalation, storage path traversal, or direct RPC invocation. Static policy presence is not a substitute for those tests. No security control was weakened during this audit.
