# API v1 contract

All paths require a Supabase Auth access token in `Authorization: Bearer ...` and a member organization in `x-organization-id`. Organization and role are derived from active membership; tenant IDs cannot be set in request bodies. RLS remains enabled as the final tenant boundary.

## RBAC management

- `GET /api/v1/admin/permissions` — admin only; returns `{ permissions, grants }`.
- `PUT /api/v1/admin/permissions/{roleKey}` — admin only; persist grants for a built-in non-admin role. Body: `{ "grants": [{ "permissionKey": "tasks.edit", "granted": true }] }`. Admin grants are intentionally protected.

Operational resource collections support `GET` and `POST`; item paths support `GET`, `PATCH`, and `DELETE`. The backend checks `module.action` grants from `role_permissions` before forwarding each operation. Financial resources (`funds`, `expenses`, `settlements`, `settlement-expenses`, `cash-receipts`, and `standing-accounts`) are intentionally read-only through generic CRUD: writes return `409 FINANCIAL_TRANSACTION_REQUIRED` until dedicated atomic, audited transaction workflows are implemented. Apply all SQL migrations before starting the API.

## Atomic finance workflows

Financial writes must use the dedicated POST workflows below; generic CRUD remains read-only for finance resources. Every request requires the authenticated finance_officer or admin membership and organization context. The server derives organization_id from membership and calls a single PostgreSQL transaction.

- POST /api/v1/finance/create-expense — { payload, idempotencyKey }
- POST /api/v1/finance/review-expense — { expenseId, approve, reason? }
- POST /api/v1/finance/replenish-fund — { fundId, amount, notes?, idempotencyKey }
- POST /api/v1/finance/standing-entry — { payload, idempotencyKey }
- POST /api/v1/finance/create-settlement — { fundId, periodStart, periodEnd, expenseIds?, idempotencyKey }
- POST /api/v1/finance/close-settlement — { settlementId, approve, notes? }

New expenses are pending and do not deduct the fund until approval. Approval locks the fund row and writes the fund ledger and expense status in one transaction. Settlement selection is guarded against already reserved expenses. Client-generated UUID idempotency keys are mandatory for create/replenish operations.

## Integration guidance

Future systems should use a dedicated server-side connector identity and OAuth/API token flow; do not expose service-role keys in browser code. Use versioned, validated connector contracts and idempotency keys. Financial workflows must use transactional database functions, not a series of generic CRUD requests.
