# Engines, APIs, and frontend connection

## Architecture

This application uses a **modular monolith**, not multiple independently deployed microservices. Supabase Postgres remains the source of truth; each domain is separated into an API engine/repository so boundaries can be extracted later without coupling screens to tables:

- **Identity**: Auth, organization membership, users, roles and settings.
- **Operations**: tasks and their checklist, steps, subtasks, progress, history, comments, attachments and follow-ups.
- **Finance**: funds, expenses, receipts, settlements and standing accounts.
- **Collaboration**: notifications and audit events.
- **Integrations**: versioned connector contract, idempotency and event delivery.

The authenticated gateway verifies the Supabase JWT, derives the role from `organization_members`, passes the same user JWT to PostgREST and relies on RLS as the final tenant boundary. API clients must never submit their own tenant identifier in the body. `src/lib/api/engines.ts` exposes domain-facing clients over the versioned transport in `client.ts`.

## Frontend connection in this increment

The entry point now displays a Supabase email/password sign-in gate. On successful sign-in, it resolves the user's active/default organization membership, fetches the organization snapshot through `/api/v1`, writes that snapshot under the legacy store's existing local-storage keys, and only then imports the application. This removes mock data as the initial source for the authenticated session.

Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (defaults to `/api/v1`), `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. In development run the API and Vite separately; Vite proxies `/api` to `http://localhost:8787` (override with `API_PROXY_TARGET`).

**Important migration boundary:** legacy view components still use synchronous `dataStore` actions. The authenticated snapshot is loaded from Supabase, but this increment does not yet convert every legacy mutation into an API call. In particular financial posting must not use generic CRUD: implement server-side transactional RPCs for expense/fund ledger changes and settlement approval before enabling those actions against production data. Until that is done, treat create/update/delete actions from legacy views as local-only and do not rely on them as persisted records. Next safe migration steps: move operations screens to async repositories, then finance screens to transaction RPCs, then remove local mock mutations.

## Integration contract

Future connectors should call only `/api/v1`, use the Supabase OAuth/JWT of a tenant member (or a separately provisioned server-side connector identity), include `x-organization-id`, and attach an idempotency key to event writes. The provider name is a stable slug such as `accounting_erp` or `field_service`; payloads should be versioned and carry an external record ID plus event timestamp. Store connector credentials in a server-side secret manager, never in `VITE_*` variables or source control. Add a connector adapter under `api/integrations/<provider>` and map its normalized events into domain APIs; do not let an integration write arbitrary SQL/table names.

API contract: `api/openapi.yaml`. API paths/resources: `api/README.md`. Migration and first organization setup: `supabase/README.md`.

## Field visit lifecycle (implemented)

Field and visit actions now use a dedicated operations boundary:

1. The browser requests a fresh high-accuracy GPS fix; a stale cached fix is not accepted for start, pause, resume, or completion.
2. The authenticated API checks the user's `tasks.edit` permission and calls the database lifecycle RPC.
3. The RPC appends an immutable `task_events` row and updates the task lifecycle/timer in the same database transaction. It derives the actor from `auth.uid()`, derives the tenant from the authenticated API context, and uses a client event UUID for duplicate protection.
4. RLS limits event inserts to the authenticated organization member and, for field officers, tasks assigned to their operational user identity. A database trigger rejects event updates and deletes.
5. While a field task is active in the foreground, the browser requests GPS updates and records a sample at most once per minute. GPS loss is recorded without fabricated coordinates, displayed to the user, and the browser watcher continues trying to recover.
6. The authenticated snapshot loads field events into the task history, including timestamp, actor label, coordinates, and accuracy.

Database migrations:
- `20261109000000_field_visit_event_log.sql`
- `20261109010000_field_location_samples.sql`
- `20261109020000_field_event_actor_index.sql`
- `20261109030000_field_event_actor_mapping.sql`
- `20261109040000_atomic_field_lifecycle.sql`
- `20261109050000_field_lifecycle_timer.sql`
- `20261109060000_field_event_actor_name.sql`

**Platform boundary:** a browser cannot switch Android GPS on, guarantee background location collection after the browser is suspended, or reliably identify/disable an active VPN application. The current browser workflow blocks field actions when it cannot obtain a fresh GPS fix. Enforced GPS settings, background tracking, and VPN detection require a trusted native Android wrapper/device-management integration; they must not be simulated in browser code.

## Remaining migration boundary

The field lifecycle is now persisted transactionally, but this does not mean every legacy screen is fully server-backed. Financial posting, supplier-account charges/payments/advances/collections, settlements, OCR confirmation, and some task/subtask/follow-up mutations still require dedicated server transactions and async repositories. Until those are migrated, legacy local-store mutations outside the implemented field lifecycle remain local-only and must not be treated as durable financial or operational records. Do not use generic CRUD for balance-changing financial workflows.
