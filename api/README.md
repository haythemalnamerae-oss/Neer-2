# API v1 contract

All paths require a Supabase Auth access token in `Authorization: Bearer ...` and a member organization in `x-organization-id`. Organization and role are derived from active membership; tenant IDs cannot be set in request bodies. RLS remains enabled as the final tenant boundary.

## RBAC management

- `GET /api/v1/admin/permissions` — admin only; returns `{ permissions, grants }`.
- `PUT /api/v1/admin/permissions/{roleKey}` — admin only; persist grants for a built-in non-admin role. Body: `{ "grants": [{ "permissionKey": "tasks.edit", "granted": true }] }`. Admin grants are intentionally protected.

Resource collections support `GET` and `POST`; item paths support `GET`, `PATCH`, and `DELETE`. The backend checks `module.action` grants from `role_permissions` before forwarding each operation. Apply all SQL migrations before starting the API.

## Integration guidance

Future systems should use a dedicated server-side connector identity and OAuth/API token flow; do not expose service-role keys in browser code. Use versioned, validated connector contracts and idempotency keys. Financial workflows must use transactional database functions, not a series of generic CRUD requests.
