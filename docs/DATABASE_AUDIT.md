# Neer-2 — Database Audit

**Audit date:** 2026-11-12  
**Supabase project:** `xtfuvxomfhlfjtpljofh` (Neer2 linked project)  
**Database:** PostgreSQL 17.11, project status `ACTIVE_HEALTHY`  
**Method:** catalog and read-only SQL inspection; no DDL or DML executed.

## Schema inventory

The `public` schema contains 28 application tables. All 28 have RLS enabled and primary keys. The tenant boundary is based on `organization_id`; composite foreign keys are used for task children and finance references to prevent cross-organization references.

| Domain | Tables |
|---|---|
| Tenant / identity | `organizations`, `organization_members`, `app_users`, `roles`, `system_settings` |
| RBAC | `permission_catalog`, `role_permissions` |
| Tasks / execution | `tasks`, `task_assignees`, `task_checklist_items`, `task_steps`, `task_subtasks`, `task_daily_updates`, `task_history`, `task_attachments`, `task_comments`, `task_events`, `follow_ups` |
| Finance / custody | `funds`, `fund_transactions`, `expenses`, `cash_receipts`, `settlements`, `settlement_expenses`, `standing_accounts`, `standing_account_entries` |
| Collaboration / audit | `notifications`, `audit_logs` |

## Data state observed

- 1 organization, 1 active membership, and 1 application user.
- RBAC seed/catalog data: 70 permission-catalog entries and 350 organization role-permission entries.
- No task, task-event, fund, fund-transaction, expense, receipt, settlement, standing-account, standing-account-entry, notification, or audit-log rows were present at the time of the audit.
- Consequently, no historical finance balances or posted operational records were available to reconcile. This is an empty operational/finance dataset, not proof that future posting/reconciliation logic is correct.

## Migration ledger

The remote `supabase_migrations.schema_migrations` ledger contains 24 application migrations, from `20261107000000` through `20261112123539`. The latest recorded migrations are:

- `consolidate_finance_rls_and_fk_indexes`
- `enforce_finance_rpc_only_writes`

The database therefore has applied schema changes beyond the older setup notes in `supabase/README.md`. The README was found to contain obsolete statements that the database was not connected and the initial migration had not been applied; the audit records that discrepancy for correction.

## Constraints, indexes, triggers and storage

- Composite tenant-aware primary/foreign keys are present across task and finance relationships.
- Finance and task event ledger tables have append-only UPDATE/DELETE guard triggers.
- Task child changes have audit triggers; task state transitions have a guard trigger.
- `task_events` records actor auth ID/name, event type, server timestamp, latitude/longitude, accuracy, location status and idempotency UUID.
- Storage contains one private `task-attachments` bucket. Three authenticated object policies govern SELECT, INSERT and DELETE using organization/task path segments and task access checks.
- The catalog inspection found no public table lacking RLS and no RLS-enabled public table lacking a policy.

## Finance integrity

The finance tables were empty: 0 funds, 0 fund transactions, 0 expenses, 0 receipts, 0 settlements, 0 standing accounts, and 0 standing-account entries. No historical balance mutation or repair was attempted. Balance reconciliation must be rerun after real data exists, using the immutable transaction/entry ledgers as the evidence source.

## Structural gaps to track

- No general-ledger chart-of-accounts or journal-entry/ledger-line model was found in the application schema; current finance is petty-cash, expense, settlement and standing-account operations, not a full double-entry accounting engine.
- No dedicated bank-account table was found.
- Approvals are represented through workflow status/approval fields and transactional RPCs rather than a separately normalized approval-case table.
- Location history is represented in task fields and `task_events`, not a standalone location entity/table.
- Schema coverage is strong for the current operations scope, but the live business data is almost entirely unpopulated.
