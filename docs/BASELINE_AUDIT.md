# Neer-2 — Baseline Engineering Audit

**Audit date:** 2026-11-12  
**Repository:** `haythemalnamerae-oss/Neer-2`  
**Work branch:** `main` only  
**Starting commit:** `1799a72d84a47166f3b2200316349a6de34b36a7`

## Repository baseline

- GitHub confirmed the exact repository, default branch `main`, and administrative/push permissions for the linked Neer2 account.
- The repository is public. No source changes were made before recording the starting SHA.
- Branch search returned `main`, `fix/vercel-routing-performance`, and `v0/mobile-responsive-fix`. No branch was created, deleted, or reset during this audit.
- Recent main commits include finance RPC-only write enforcement, finance RLS consolidation, removal of shared browser persistence for user identity/finance snapshots, and a main-only branch guard.
- Package scripts define Vite development, local `vite build`, preview, and TypeScript `lint`. The only workflow found by workflow-source search is `.github/workflows/main-only-branch-guard.yml`; no build/deploy workflow was found in the searched workflow sources.

## Architecture observed

- Frontend: React 19, TypeScript, Vite 8, Tailwind 4, PWA plugin.
- API: Express server in `api/server.ts`, versioned under `/api/v1`.
- Persistence: Supabase Auth + PostgREST + PostgreSQL; the API forwards the authenticated user's JWT and uses RLS as the final tenant boundary.
- Frontend entry: `src/main.tsx` mounts `ApiSessionGate`; authenticated snapshot loading occurs before the legacy application is imported.
- Main UI composition: `src/App.tsx`; views under `src/components/views`; modals under `src/components/modals`; API/session/storage logic under `src/lib` and `src/services`.
- Domain areas in code: identity/RBAC, tasks and field execution, petty cash/funds, expenses, receipts, settlements, standing accounts, notifications, audit, reports.
- No Android source module or Android manifest was found by targeted repository search. This audit therefore validates the web client and its API contract, not a separate Android application.

## Important repository control

The main-only guard workflow has write permission to repository contents and runs on branch creation, non-main pushes, and manual dispatch. It resets two named reserved branches to main and deletes other non-main branches. It was not run. Its deletion behavior is recorded as a repository governance risk; do not trigger it as part of ordinary audit/build work.

## Verification limits

- GitHub source and commit metadata were inspected remotely.
- Supabase catalog, policies, functions, migration ledger, bucket and row counts were inspected read-only.
- No cloud build, deployment, branch creation, pull request, schema migration, or business-data write was performed.
- No local TypeScript check, browser test, Android build, or end-to-end test was run; those require the owner's local environment.
- Repository root `README.md` and the requested `docs/` audit files were absent at audit start. The project-specific API and Supabase documentation exist.

## Baseline disposition

The project is a modular web monolith with a live Supabase backend. The backend has materially advanced beyond some existing architecture documentation: dedicated transactional task and finance workflows exist, while legacy synchronous store services still remain. The next phase must migrate remaining UI mutation paths without replacing current view contracts or weakening RLS.


## Follow-up deep-dive audit (2026-11-12)

- Expanded catalog review enumerated 28 public application tables, their columns, primary/foreign/check/unique constraints, indexes, RLS flags, 73 RLS policies, 21 public functions, 21 private functions, and 54 public-table trigger events.
- Confirmed all 28 public application tables have RLS and at least one policy; none has FORCE ROW LEVEL SECURITY enabled. Authenticated table grants are broader than policy access on several operational tables, so policy correctness remains the effective boundary.
- Read-only finance reconciliation queries returned zero current exceptions, but all operational and finance tables are empty. This is a zero-row structural check, not a live-data reconciliation proof.
- Transaction-scoped negative authorization checks for a non-member were completed against finance fund creation, finance expense creation, and task lifecycle RPCs; the paths rejected the request. No business rows were committed.
- The expanded UI trace identified local-only user creation, settings persistence, calendar rescheduling, notification read-state changes, and standing-account activation/deactivation.
- The Supabase setup README contained stale claims that no live project connection existed; the follow-up documentation corrects that operational record.
- No source behavior, schema, policy, role grant, or business record was changed during the follow-up audit.
