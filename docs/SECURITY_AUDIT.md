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


## Follow-up security findings (2026-11-12)

### Verified controls and bounded negative tests

- All 28 public tables have RLS enabled and policies; 73 policies were enumerated with full USING/WITH CHECK expressions. The private helper functions for membership, role and task access check active organization membership, auth.uid(), role grants and task scope.
- Table grants are not uniformly least-privilege: authenticated has SQL privileges on several tables where RLS currently denies writes by policy. This is not itself a bypass, but the security guarantee depends on preserving every policy and its helper.
- The task-attachments bucket is private, capped at 10 MiB, and restricts JPEG/PNG/WebP/GIF/PDF. Three storage policies bind object paths to organization/task access.
- A transaction-scoped non-member exercise was denied by finance creation and task lifecycle RPC authorization. The test transaction was rolled back; no production row was retained.
- Security Advisor still reports 18 authenticated-callable SECURITY DEFINER functions and leaked-password protection disabled. Each privileged RPC remains a code-level trust boundary.

### High-risk issues to remediate in a controlled migration

1. audit_logs has an INSERT policy whose check is only private.is_org_member(organization_id). The policy design permits any authenticated organization member to attempt direct audit-event insertion. A targeted transaction test did not produce a successful forged insert, so exploitability was not established; nevertheless, the policy is broader than a trusted audit-writer model and should be narrowed to server-owned audit paths.
2. finance_create_standing_entry accepts charge, payment, advance, and collection, but its body only appends a standing-account entry; it does not create the corresponding fund transaction or cash receipt for payment/advance/collection. Restrict the generic endpoint to charge entries or route cash-affecting types through fully atomic settlement workflows.
3. finance_cover_deficit decreases funds.cash_box_balance and appends a negative fund_transactions.balance_delta, but does not change funds.current_balance. This can make the current-balance/transaction-ledger equation diverge after the first deficit-coverage operation. No rows exist to reproduce the mismatch today.
4. Expense review does not visibly enforce submitter/approver separation. finance_review_expense allows an authorized finance member to approve a pending expense without checking that the reviewer differs from the submitter. Add maker-checker enforcement if required by the control policy.
5. Several finance RPC audit records hard-code user_role (for example, fund creation logs admin; expense/settlement records log finance_officer) instead of deriving the actual membership role. Other finance RPCs (cash receipt, replenishment, standing-account create/entry, deficit coverage) do not write a corresponding audit log in their function body.
6. Finance idempotency keys are generated anew by the browser for each call. A retry after an ambiguous network outcome can therefore become a new operation rather than replaying the original key. Keep a request key stable across retries and bind it to the operation payload.
7. system_settings is empty and the Settings UI is local-only; server-side finance functions use database defaults. This creates policy drift between what the UI displays and what the server enforces.
8. Role permission editing is persisted through the API, but most view visibility checks use the hard-coded ROLE_PERMISSIONS map. A saved DB grant change is not necessarily reflected by the client-side permission map.
9. The main-only branch guard has contents: write and can delete non-reserved branches on its trigger conditions. It was not executed.

Do not change these controls piecemeal without a migration that preserves legitimate UI/API contracts, adds rollback, and includes non-production negative tests.
