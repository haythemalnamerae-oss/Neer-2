# Neer-2 — Feature / Persistence Gap Matrix

**Audit date:** 2026-11-12  
**Interpretation:** “Server-backed” means a server/API/RPC path exists in source; it does not certify every UI button or live workflow has passed end-to-end testing.

| Area | Evidence in current source/schema | Baseline status | Main gap / next action |
|---|---|---|---|
| Login / session | Supabase email/password gate, refresh-token flow, membership resolution, JWT API gateway | Implemented, not E2E-tested | Test expiry, refresh, logout, account switching and multiple memberships locally |
| Organizations / membership | Tenant tables, composite keys, membership RLS | Implemented | Verify multiple-organization selection and isolation with test accounts |
| Users / roles | Five persisted role keys, permission catalog, 350 seeded grants, role management UI/API | Partial | Map required business roles; test every module/action and deny-by-default behavior |
| Task creation | `create_task_bundle` RPC and `/tasks/create-bundle` | Server transaction exists | Verify UI call sites, duplicate requests and failure recovery |
| Task lifecycle / GPS | `task_events`, `record_field_task_event`, location validation and immutable events | Server transaction exists | Test GPS accuracy, denied permissions, stale fixes, duplicate events and mobile background limits |
| Task outcomes / approval | `record_task_outcome_bundle`, `review_task_approval`, history/events | Server transaction exists | Verify every outcome, proof attachment, follow-up and reviewer role |
| Task children | Checklist, steps, subtasks, updates, comments, attachments, assignees, RLS and audit triggers | Partial | Legacy synchronous `TasksService` and `dataStore` methods still exist; inventory and migrate remaining UI mutation call sites |
| Follow-ups | Table, API resource and RLS | Partial | Verify create/update flows use server persistence and field-user assignment scope |
| Attachments | Private bucket, object policies, attachment registration RPC | Partial | Test upload, registration, signed/download access and unauthorized path attempts |
| Funds / expenses | Transactional RPC service and dedicated API workflows; generic CRUD blocked | Core server workflows exist | End-to-end test all create/approve/replenish/deficit workflows; validate ledger/balance equations once populated |
| Receipts / settlements | Dedicated finance service and RPC endpoints; tenant-scoped read policies | Partial-to-implemented | Verify every screen action, dual review sequence, expense reservation and reversal/rejection cases |
| Standing accounts | Account and entry tables, immutable ledger, dedicated create/entry/settlement APIs | Partial | Verify all charge/payment/advance/collection paths and balance calculation |
| Notifications | Table, snapshot loading and RLS | Partial | Verify generation, delivery/read state and user targeting |
| Audit | Audit table, task-child triggers and finance RPC audit writes | Partial | Verify coverage for every sensitive mutation; audit table currently has no rows |
| Reports | `ReportsService` and views calculate from the loaded store | Partial | Build server-side, permission-scoped reporting queries; do not treat browser-derived totals as accounting source of truth |
| Accounting / bank accounts | No chart-of-accounts, journal headers/lines or bank-account table found | Missing for full accounting scope | Separate future accounting-engine design from current petty-cash operations |
| Android client | No Android module or manifest found in this repository search | Not audited / not present in inspected repo | Identify separate Android repository and validate API contract compatibility there |

## Important frontend persistence boundary

The app loads an authenticated server snapshot into the legacy synchronous `dataStore`. The store still imports demo initial data and retains local-storage helpers and synchronous mutation methods. The latest changes reduce persistence of sensitive user identity/finance snapshots, but the existence of an API service does not prove every legacy screen uses it. Treat unverified `dataStore` mutations as local-only until call-site tracing confirms a server request and successful snapshot refresh.

## Role mapping target

Current persisted roles: `admin`, `ops_manager`, `finance_officer`, `field_officer`, `viewer`. Map supervisor to `ops_manager`, field employee to `field_officer`, accountant/custody manager to carefully scoped finance permissions, and auditor to a new read-only permission profile only if the business requires it. Do not grant broad finance writes to an auditor.

## Priorities for subsequent phases

1. Prove end-to-end persistence for every task/child/follow-up UI action.
2. Prove finance RPC authorization and transaction invariants using non-production test records.
3. Remove or isolate legacy local-only mutation call sites without breaking existing screens.
4. Implement server-side reports and formal accounting/bank domains only after requirements and data migration are designed.


## Follow-up UI-to-server trace (2026-11-12)

| UI action / domain | Observed path | Persistence finding |
|---|---|---|
| Create task bundle | NewTaskModal → createTaskBundle → API/RPC | Server-backed |
| Task outcome / follow-up chain | TaskOutcomeModal → recordTaskOutcomeOnServer → atomic RPC | Server-backed; stable request UUID retained in modal state |
| Field visit start/pause/resume | Native GPS bridge → task-events/lifecycle → record_field_task_event | Server-backed atomic event/state RPC |
| Task checklist, steps, subtasks, comments, daily updates | tasks.api.ts → generic task-child API resources | Server-backed, subject to RLS |
| Attachment upload | Private Storage object → registration RPC → signed URL | Server-backed; object cleanup/retry edges need testing |
| Finance fund/expense/receipt/settlement/standing-account actions | FinanceApiService → finance workflow API → transactional RPC | Server-backed for mapped workflows; identified RPC integrity gaps are in SECURITY_AUDIT.md |
| User creation | UsersView | Local-only creation disabled; UI now explains that real provisioning requires Supabase Auth invitation and organization membership |
| Settings save | SettingsView → settings.api → `save_organization_settings` RPC | Server-backed; tenant derived from authenticated API membership; local demo reset removed |
| Calendar reschedule | CalendarView → `rescheduleTaskOnServer` → `PATCH /tasks/:id` | Server-backed; API allows only due_date/start_date/due_time on generic task PATCH |
| Notification read state | Header → `notifications.api.ts` → scoped `PATCH /notifications/:id` | Server-backed; API filters by authenticated app user and permits only `is_read=true` |
| Standing-account activation/deactivation | FundsView / SettingsView → FinanceApiService → `set_standing_account_active` RPC | Server-backed; audited status change, ledger history retained |
| Dashboard and reports | ReportsService aggregates hydrated dataStore collections | Client-derived; no server-side reporting engine |
| Audit display | AuditLogsView reads the loaded snapshot | Server read exists; write policy requires narrowing and complete audit coverage |

### Snapshot limits

loadUiSnapshot fetches each collection with limit=500 and no pagination loop. Larger organizations can receive incomplete task, event, finance, notification or audit snapshots. Reports based on that snapshot may be understated. Implement stable cursor/range pagination before production data grows beyond this limit.

### Additional client-side persistence observations

- dataStore still initializes from mockData and legacy localStorage. Authenticated hydration replaces selected operational/finance collections, but Settings are not hydrated from the server.
- PeerSyncEngine and sourceRegistry contain legacy/offline/demo material; the targeted code search found no active import of PeerSyncEngine. Treat embedded legacy schema/source snippets as documentation/demo, not the live Supabase schema.
- The authenticated UI is not proof that every visible action is server-backed. The local-only rows above must be migrated before operational acceptance.


## Complete UI and service trace (2026-11-12)

The full static source trace of all 18 views mounted by App and the custom API/finance/task paths is documented in `docs/SERVICE_UI_TRACE.md`.

Newly confirmed P0 gaps:
- UsersView adds only to local dataStore; no Supabase Auth + app_users + organization_members provisioning. Its selector offers unsupported role values supervisor/manager, which can cause an undefined ROLE_LABELS access in the user table.
- SettingsView persists locally; system_settings is neither loaded nor saved. Browser settings can persist across organization/account changes.
- CalendarView drag/drop rescheduling only changes local dueDate; there is no server reschedule endpoint.
- Standing-account activation/deactivation now uses a dedicated permission-checked RPC and writes an audit record without changing balances or ledger entries.
- Role editor writes role_permissions, but navigation and most button gates still use hard-coded ROLE_PERMISSIONS; client/server authorization can disagree.
- ReportsService, DashboardView, and PerformanceEvaluationView derive reports in the browser; no server-side aggregate/pagination path exists.
- Dashboard AIService is a deterministic local rule set, not an AI model, and emits unsupported hard-coded claims such as 100% tax compliance.
- loadUiSnapshot is capped at 500 rows per collection without pagination; ops_manager/viewer can have visible finance modules but finance collections are omitted from their snapshot.
- Notification read-state is local; audit screen reads server audit logs while local dataStore audit writes do not become central audit records.
- FinanceApiService generates a new idempotency key for every attempt and throws if post-commit snapshot refresh fails; this can make a successful operation look failed and a retry use a new key.

Legacy service classes and unused wrappers are also catalogued in `docs/SERVICE_UI_TRACE.md`. Source tracing is complete for all discovered mounted views and paths; runtime behavior remains unverified without local browser/device tests.
