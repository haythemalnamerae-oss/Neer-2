# Neer-2 — Execution Roadmap After Baseline

**Baseline reference:** `1799a72d84a47166f3b2200316349a6de34b36a7`  
**Current branch policy:** `main` only; no new branches, PRs, cloud builds or deployments.  
**Data policy:** no destructive schema work and no historical finance rewrites without explicit owner approval, backup and rollback plan.

## Phase 2 — Persistence contract and UI call-site audit

- Trace each task, checklist, step, subtask, comment, follow-up and attachment control from UI event to API/RPC to database.
- Mark every `dataStore` synchronous mutation as server-backed, local-only, or intentionally offline.
- Add safe async repositories while preserving current component props, route/view identifiers and domain DTOs.
- Ensure mutation success is not shown before server confirmation; handle “saved but refresh failed” without duplicate submissions.
- Validate tenant and role restrictions at both API and RLS layers.

## Phase 3 — Task execution and location integrity

- Verify task create bundle, assignment, checklist/steps, lifecycle, GPS samples, pause/resume, outcome, approval and follow-up flows.
- Test event idempotency, actor identity, timestamp source, accuracy thresholds, proof-file ownership and append-only history.
- Document browser limitations for background GPS; use native Android capability only in its own approved client scope.

## Phase 4 — Finance workflow verification

- Test every finance RPC and API endpoint with authorized and unauthorized roles.
- Verify transaction atomicity, idempotency, duplicate invoice protection, settlement expense reservation, approval separation and append-only ledgers.
- Define balance equations from opening balances plus immutable ledger deltas; run reconciliation only after real records exist.
- Keep generic finance CRUD blocked. Never repair historical balances by directly rewriting ledger or balance columns.

## Phase 5 — RBAC, audit and tenant isolation

- Map business job titles to the existing five role keys and permission catalog.
- Add a read-only auditor profile only if required; avoid broad administrator or finance permissions.
- Run negative cross-tenant, role-escalation, storage path and direct-RPC tests.
- Review all authenticated SECURITY DEFINER functions individually and resolve the 18 advisor warnings by proving intended authorization or tightening grants safely.
- Enable leaked-password protection after Auth policy review.

## Phase 6 — Reporting, performance and operational readiness

- Move critical totals and reports to permission-scoped server queries.
- Reassess the 30 unused-index notices after realistic workload; do not drop indexes based only on an empty database.
- Add test coverage, monitoring, backup/restore rehearsal and documented local release steps.
- Review the branch-guard workflow's branch-deletion behavior before any manual dispatch or experimental branch activity.

## Phase exit gates

A phase is complete only when code paths, authorization, data persistence and error recovery are verified with repeatable tests. A source file or visible button alone is not acceptance evidence. Final browser/mobile build and device validation remain local owner tasks; do not use cloud build/deploy as a substitute.
