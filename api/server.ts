import express, { type NextFunction, type Request, type Response } from 'express';

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required by the API server.');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const resources = {
  tasks: { table: 'tasks', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-checklist': { table: 'task_checklist_items', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-steps': { table: 'task_steps', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-subtasks': { table: 'task_subtasks', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-updates': { table: 'task_daily_updates', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-history': { table: 'task_history', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-attachments': { table: 'task_attachments', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'task-comments': { table: 'task_comments', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  funds: { table: 'funds', roles: ['admin', 'finance_officer'] },
  expenses: { table: 'expenses', roles: ['admin', 'finance_officer'] },
  settlements: { table: 'settlements', roles: ['admin', 'finance_officer'] },
  'settlement-expenses': { table: 'settlement_expenses', roles: ['admin', 'finance_officer'] },
  'cash-receipts': { table: 'cash_receipts', roles: ['admin', 'finance_officer'] },
  'standing-accounts': { table: 'standing_accounts', roles: ['admin', 'finance_officer'] },
  'follow-ups': { table: 'follow_ups', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  notifications: { table: 'notifications', roles: ['admin', 'ops_manager', 'field_officer', 'finance_officer', 'viewer'] },
  'audit-logs': { table: 'audit_logs', roles: ['admin', 'ops_manager', 'finance_officer'] },
  users: { table: 'app_users', roles: ['admin', 'ops_manager', 'finance_officer', 'field_officer', 'viewer'] },
  roles: { table: 'roles', roles: ['admin', 'ops_manager', 'finance_officer', 'field_officer', 'viewer'] },
  settings: { table: 'system_settings', roles: ['admin'] },
} as const;

type Role = 'admin' | 'ops_manager' | 'finance_officer' | 'field_officer' | 'viewer';
type AuthContext = { token: string; userId: string; organizationId: string; role: Role };
type AuthenticatedRequest = Request & { auth: AuthContext };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const allowedFilters = new Set([
  'id', 'status', 'priority', 'assignee_id', 'fund_id', 'task_id', 'user_id',
  'is_read', 'category', 'urgency', 'active', 'holder_id', 'scheduled_date',
  'due_date', 'created_at', 'organization_id',
]);

async function supabaseFetch(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Bearer access token required.' } });

  try {
    const userResponse = await supabaseFetch('/auth/v1/user', token);
    if (!userResponse.ok) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Supabase session is invalid or expired.' } });
    const user = await userResponse.json() as { id?: string };
    if (!user.id) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Authenticated user was not returned.' } });

    const requestedOrg = req.header('x-organization-id');
    if (!requestedOrg || !uuidPattern.test(requestedOrg)) {
      return res.status(400).json({ error: { code: 'ORGANIZATION_REQUIRED', message: 'Provide a valid x-organization-id header.' } });
    }

    const membershipUrl = `/rest/v1/organization_members?select=organization_id,role,active&auth_user_id=eq.${encodeURIComponent(user.id)}&organization_id=eq.${encodeURIComponent(requestedOrg)}&active=eq.true&limit=1`;
    const membershipResponse = await supabaseFetch(membershipUrl, token);
    if (!membershipResponse.ok) throw new Error(`Membership lookup failed (${membershipResponse.status}).`);
    const memberships = await membershipResponse.json() as Array<{ organization_id: string; role: Role; active: boolean }>;
    const membership = memberships[0];
    if (!membership || !['admin', 'ops_manager', 'finance_officer', 'field_officer', 'viewer'].includes(membership.role)) {
      return res.status(403).json({ error: { code: 'NOT_ORG_MEMBER', message: 'No active membership for this organization.' } });
    }

    (req as AuthenticatedRequest).auth = {
      token,
      userId: user.id,
      organizationId: membership.organization_id,
      role: membership.role,
    };
    return next();
  } catch (error) {
    console.error('API authentication failed:', error);
    return res.status(502).json({ error: { code: 'AUTH_PROVIDER_ERROR', message: 'Could not verify the session with Supabase.' } });
  }
}

function sendSupabaseError(res: Response, status: number, body: string) {
  let parsed: unknown = body;
  try { parsed = JSON.parse(body); } catch { /* retain provider text */ }
  const safeStatus = [400, 401, 403, 404, 409, 422].includes(status) ? status : 502;
  return res.status(safeStatus).json({ error: { code: 'DATABASE_REQUEST_FAILED', details: parsed } });
}

app.get('/health', (_req, res) => res.json({ status: 'ok', api: 'neer-v1' }));
app.use('/api/v1', authenticate);

app.get('/api/v1', (_req, res) => res.json({
  version: 'v1',
  resources: Object.keys(resources).map((resource) => `/api/v1/${resource}`),
}));

app.all('/api/v1/:resource/:id?', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const resource = resources[req.params.resource as keyof typeof resources];
  if (!resource) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Unknown API resource.' } });
  if (!(resource.roles as readonly string[]).includes(auth.role)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Your organization role cannot access this resource.' } });
  }
  if (req.params.id && !idPattern.test(req.params.id)) {
    return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid record id.' } });
  }

  const query = new URLSearchParams({ select: '*', organization_id: `eq.${auth.organizationId}` });
  if (req.params.id) query.set('id', `eq.${req.params.id}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'limit' || key === 'offset') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 5000) return res.status(400).json({ error: { code: 'INVALID_PAGINATION', message: 'limit/offset must be an integer from 0 to 5000.' } });
      query.set(key, String(n));
    } else if (allowedFilters.has(key) && typeof value === 'string') {
      if (key !== 'organization_id') query.set(key, `eq.${value}`);
    } else {
      return res.status(400).json({ error: { code: 'INVALID_FILTER', message: `Filter '${key}' is not supported.` } });
    }
  }

  const method = req.method;
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET, POST, PATCH or DELETE.' } });
  }
  if (method === 'POST' && req.params.id) return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Create records on the collection path.' } });
  if ((method === 'PATCH' || method === 'DELETE') && !req.params.id) return res.status(400).json({ error: { code: 'ID_REQUIRED', message: 'Update/delete requires a record id.' } });

  const body = req.body as Record<string, unknown> | undefined;
  if ((method === 'POST' || method === 'PATCH') && (!body || typeof body !== 'object' || Array.isArray(body))) {
    return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object.' } });
  }
  if (body && ('organization_id' in body || 'organizationId' in body || 'role' in body && resource.table === 'organization_members')) {
    return res.status(400).json({ error: { code: 'PROTECTED_FIELD', message: 'Tenant and membership authorization fields are server controlled.' } });
  }

  const headers: Record<string, string> = {};
  if (method === 'POST' || method === 'PATCH') headers.Prefer = 'return=representation';
  const requestUrl = `/rest/v1/${resource.table}?${query.toString()}`;
  const response = await supabaseFetch(requestUrl, auth.token, {
    method,
    headers,
    ...(method === 'POST' || method === 'PATCH' ? { body: JSON.stringify({ ...body, organization_id: auth.organizationId }) } : {}),
  });
  if (!response.ok) return sendSupabaseError(res, response.status, await response.text());
  if (response.status === 204) return res.status(204).end();
  const payload = await response.text();
  return res.status(method === 'POST' ? 201 : 200).type('application/json').send(payload || '[]');
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } });
});

app.listen(port, '0.0.0.0', () => console.log(`Neer API listening on http://0.0.0.0:${port}`));
