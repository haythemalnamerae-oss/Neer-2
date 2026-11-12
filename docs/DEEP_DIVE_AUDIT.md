# Neer-2 — Deep-Dive Engineering Audit

**Date:** 2026-11-12  
**Repository:** haythemalnamerae-oss/Neer-2  
**Branch:** main only  
**Starting baseline:** 1799a72d84a47166f3b2200316349a6de34b36a7  
**Scope:** live schema, policies, privileges, functions, triggers, finance invariants, UI-to-API persistence, and operational security.

## 1. Live schema inventory

- 28 public application tables; all 28 have RLS and a primary key.
- 73 public RLS policies: 28 SELECT, 17 INSERT, 15 UPDATE, 13 DELETE.
- 21 public functions and 21 private helper functions inspected.
- 54 trigger event registrations on public tables.
- Every table has at least one policy; no table has FORCE RLS.
- Tenant identity is represented by organization_id; task and finance references use composite tenant-aware foreign keys.
- 24 remote migrations; ledger range 20261107000000–20261112123539.
- Storage: one private task-attachments bucket; 10 MiB maximum; JPEG, PNG, WebP, GIF and PDF only; SELECT/INSERT/DELETE object policies bind the organization/task path.

## 2. Live data snapshot

| Dataset | Rows |
|---|---:|
| Organizations | 1 |
| Active memberships | 1 |
| App users | 1 |
| Permission catalog | 70 |
| Role permission grants | 350 |
| Roles table | 0 |
| System settings | 0 |
| Tasks / task events | 0 / 0 |
| Funds / fund transactions | 0 / 0 |
| Expenses / cash receipts | 0 / 0 |
| Settlements / settlement links | 0 / 0 |
| Standing accounts / entries | 0 / 0 |
| Notifications / audit logs | 0 / 0 |

The database is structurally initialized but operationally unpopulated. A zero-error reconciliation on zero rows does not prove transaction behavior against real data.

## 3. RLS and grants

All 73 policy definitions were retrieved. Membership helpers use auth.uid(), active membership, organization ID, role grants, and task assignment scope. The authenticated role has SQL privileges on some tables where RLS policies are expected to deny the operation; therefore, preserving and testing RLS is essential. Finance direct-table writes are revoked for authenticated and finance reads remain tenant/role scoped.

A non-member test transaction was denied by finance fund creation, finance expense creation, and task lifecycle RPC paths. The test transaction was rolled back. A separate membership helper test returned false for a non-member organization. No cross-tenant business row was created.

## 4. High-priority finance integrity findings

### 4.1 Deficit coverage ledger mismatch

finance_cover_deficit subtracts deficit_amount from funds.cash_box_balance and inserts a fund_transactions row with negative balance_delta, but does not change funds.current_balance. This can break the invariant:

funds.current_balance = opening balance + sum(fund_transactions.balance_delta)

after the first deficit-coverage transaction. No current data exists to reproduce it.

### 4.2 Standing-account non-cash entries can be misused

finance_create_standing_entry accepts charge, payment, advance, and collection. It appends a standing-account ledger row, but does not post a corresponding fund transaction or cash receipt for payment/advance/collection. The currently observed frontend wrapper uses charge; direct RPC callers can still submit the other accepted types. Restrict this endpoint or route cash-affecting types through a complete atomic workflow.

### 4.3 Incomplete financial audit coverage

Function-body review found audit writes in some fund/expense/settlement operations, but no corresponding audit insert in the bodies of cash-receipt creation, fund replenishment, standing-account creation, standing-entry creation, and deficit coverage. Some existing finance audit records hard-code actor role values rather than deriving the actual membership role.

### 4.4 Approval separation

finance_review_expense verifies finance organization access and pending status but does not compare the reviewer identity to the submitting identity. If maker-checker is required, the database RPC must enforce it; UI hiding is insufficient.

### 4.5 Settings mismatch

The system_settings table is empty. loadUiSnapshot does not fetch it, and SettingsView saves to local dataStore. Server finance RPCs read database settings and fall back to tax 5%, single-expense limit 5000, invoice required and receipt required. The policy values displayed/edited in the browser therefore are not authoritative server settings.

### 4.6 Idempotency retry behavior

The browser generates a fresh UUID for each finance call. A retry after an ambiguous network outcome can create a new request key and duplicate a logical operation. Preserve a key through retry/reconciliation and bind it to a payload hash or request record.

## 5. Frontend persistence trace

| Area | Current path | Result |
|---|---|---|
| Task bundle creation | UI → typed API → atomic RPC | Server-backed |
| Field task lifecycle | native GPS → lifecycle event API → RPC | Server-backed atomic event/state |
| Task outcome and follow-up | UI → outcome API → atomic RPC | Server-backed |
| Checklist, steps, subtasks, comments, daily updates | task API → resource/RLS | Server-backed |
| Attachment upload/registration | private Storage + registration RPC | Server-backed; retry/cleanup edges remain |
| Finance mapped workflows | FinanceApiService → API → RPC | Server-backed; see finance findings |
| User creation | UsersView → local dataStore | Local-only; no Auth account/membership created |
| Settings | SettingsView → local dataStore | Local-only; no system_settings persistence |
| Calendar reschedule | CalendarView → local dataStore | Local-only |
| Notification read state | Header → local dataStore | Local-only |
| Standing-account active state | FundsView/SettingsView → local dataStore | Local-only |
| Reports/dashboard | ReportsService aggregates hydrated collections | Client-derived, not server-authoritative |
| Audit viewer | server snapshot | Read path exists; audit write policy/coverage needs work |

### Snapshot pagination

loadUiSnapshot requests limit=500 for each collection and has no pagination loop. Once a tenant exceeds 500 rows in a collection, the client snapshot and client-derived reports can be incomplete.

### Local and legacy code

dataStore still initializes from mock/localStorage sources. Authenticated hydration replaces selected operational and finance collections, but does not hydrate Settings. PeerSyncEngine had no active import in the targeted code search. sourceRegistry embeds legacy demo schema/service code and must not be treated as the live schema.

## 6. RBAC model

Five persisted roles are in use: admin, ops_manager, finance_officer, field_officer, and viewer. Current seeded grants per role:

| Role | Granted | Denied | Total |
|---|---:|---:|---:|
| admin | 66 | 4 | 70 |
| ops_manager | 30 | 40 | 70 |
| finance_officer | 27 | 43 | 70 |
| field_officer | 12 | 58 | 70 |
| viewer | 9 | 61 | 70 |

Role editing persists DB grants, but client visibility still uses a hard-coded ROLE_PERMISSIONS map in src/lib/rbac/permissions.ts. The client map and database grant matrix can drift.

## 7. Supabase Advisor

- Security: 18 authenticated-callable SECURITY DEFINER findings; leaked-password protection disabled.
- Performance: 30 unused-index notices. Do not drop indexes on an empty database; re-evaluate under representative load.
- Health: no findings returned.

All callable SECURITY DEFINER functions must remain individually reviewed for actor, active membership, tenant, role/permission, validation and idempotency. Their existence is not automatically a vulnerability.

## 8. Migration and documentation drift

The live remote migration ledger now reports 29 applied migrations through `20261112141004`. Four additional migrations were applied during the current execution: task approval maker-checker, organization settings persistence, organization settings read, and selected-organization scoping for both settings RPCs.

Two earlier applied migrations (`20261112123426` and `20261112123539`) were not found as matching files during targeted repository path/search checks. Do not run `supabase db push` until those source files are restored or the migration history is reconciled from an authoritative backup. The current applied database state is live and verified; repository migration reproducibility is not yet 100%.

## 9. Verification boundaries

- Live catalog checks confirm 28 public application tables, RLS enabled on all 28, and 73 policies.
- Live SQL checks confirm the task approval RPC includes maker-checker and settings read/write RPCs exist.
- The task, settings, notification and audit tables were empty at the latest check; positive business E2E cannot be demonstrated against production records.
- No financial business rows were changed.
- Four additive DDL migrations were applied as part of this execution; no historical finance DML was run.
- No local lint/build/browser/mobile E2E, cloud build, or deployment was run. The owner must pull main and validate locally.
- The UI/API changes were reviewed statically; compile/runtime behavior remains unverified until local validation.

## 10. Acceptance assessment

The schema inventory and static policy/function/UI source trace are substantially complete. End-to-end verification is not 100% because operational tables are empty, real user roles beyond admin are not provisioned, there is no test tenant dataset, and browser/device integration tests cannot be run in this remote audit. The unresolved items above must be fixed and tested before claiming full operational/security acceptance.
