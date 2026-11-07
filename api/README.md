# API architecture and integration

The API is a versioned Express REST layer over Supabase PostgREST. The browser sends the signed-in Supabase user's access token; the API verifies it with Supabase Auth, checks the requested organization membership, and forwards database requests using that same JWT. Row Level Security remains the final authorization boundary. No service-role credential is used by this server or browser.

## Start locally

1. Apply the database migration and create an Auth user plus an `organization_members` row as described in `supabase/README.md`.
2. Configure server-only environment variables (keep these out of the browser bundle):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
API_PORT=8787
```

3. Configure the frontend's API origin if it is not same-origin:

```dotenv
VITE_API_URL=http://localhost:8787/api/v1
```

4. Run `npm run api` and the Vite app in separate terminals (`npm run dev`). The API health check is `GET http://localhost:8787/health`.

Every `/api/v1/*` call requires `Authorization: Bearer <supabase-access-token>` and `x-organization-id: <organization-uuid>`. Do not send the user's email, role, or organization membership as authorization proof.

## Resource paths

Collections support `GET` and `POST`; item paths `/:id` support `GET`, `PATCH`, and `DELETE`. GET filters are deliberately allow-listed; pagination uses `limit` and `offset` (0–5000).

| Path | Supabase table | API role scope |
| --- | --- | --- |
| `/api/v1/tasks` | `tasks` | active organization member |
| `/api/v1/task-checklist`, `/task-steps`, `/task-subtasks`, `/task-updates`, `/task-history`, `/task-attachments`, `/task-comments` | task child tables | active organization member |
| `/api/v1/funds`, `/expenses`, `/settlements`, `/settlement-expenses`, `/cash-receipts`, `/standing-accounts` | finance tables | admin, finance officer |
| `/api/v1/follow-ups`, `/notifications` | follow-up and notification tables | active organization member |
| `/api/v1/audit-logs` | `audit_logs` | admin, operations manager, finance officer |
| `/api/v1/users`, `/roles` | user/role metadata | active organization member (write rules remain RLS/admin-controlled) |
| `/api/v1/settings` | `system_settings` | admin |

Use snake_case field names from the database schema in JSON bodies. The `organization_id` is injected by the server, and clients cannot set it. API errors use `{ "error": { "code", "message" } }`.

## Example from the browser

Construct `NeerApiClient` only after Supabase Auth has a valid session and the user selected an organization they belong to. Session and org selection are not currently provided by the legacy localStorage UI, so do not pass mock users or mock tokens:

```ts
const api = new NeerApiClient({ accessToken: session.access_token, organizationId });
const tasks = await api.list('tasks', { status: 'eq.in_progress', limit: 100 });
```

The `src/lib/api/client.ts` module is the versioned frontend transport. Existing screens still read/write `dataStore` synchronously; migrating those screens and their mutation flows to async API repositories requires auth/session UI and is not silently emulated with demo data. Until that UI migration is complete, the new endpoints are available but the legacy UI remains local-only.

## Important workflow note

CRUD routes are not a substitute for business transactions. Expense posting/refunds, fund ledger changes, and settlement approvals must be implemented as audited SQL RPC operations (or transaction-backed backend services) before production use; do not model those multi-row financial workflows as a sequence of separate browser requests.
