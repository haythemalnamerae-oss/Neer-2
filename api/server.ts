import express, { type NextFunction, type Request, type Response } from 'express';

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required by the API server.');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const resources = {
  tasks: { table: 'tasks', module: 'tasks' }, 'task-checklist': { table: 'task_checklist_items', module: 'tasks' },
  'task-steps': { table: 'task_steps', module: 'tasks' }, 'task-subtasks': { table: 'task_subtasks', module: 'tasks' },
  'task-updates': { table: 'task_daily_updates', module: 'tasks' }, 'task-history': { table: 'task_history', module: 'tasks' },
  'task-attachments': { table: 'task_attachments', module: 'tasks' }, 'task-comments': { table: 'task_comments', module: 'tasks' },
  funds: { table: 'funds', module: 'funds' }, expenses: { table: 'expenses', module: 'expenses' },
  settlements: { table: 'settlements', module: 'settlements' }, 'settlement-expenses': { table: 'settlement_expenses', module: 'settlements' },
  'cash-receipts': { table: 'cash_receipts', module: 'funds' }, 'standing-accounts': { table: 'standing_accounts', module: 'expenses' },
  'follow-ups': { table: 'follow_ups', module: 'followUps' }, notifications: { table: 'notifications', module: 'dashboard' },
  'audit-logs': { table: 'audit_logs', module: 'audit' }, users: { table: 'app_users', module: 'users' },
  roles: { table: 'roles', module: 'roles' }, settings: { table: 'system_settings', module: 'settings' },
} as const;

type Role = 'admin' | 'ops_manager' | 'finance_officer' | 'field_officer' | 'viewer';
type AuthContext = { token: string; userId: string; organizationId: string; role: Role };
type AuthenticatedRequest = Request & { auth: AuthContext };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const allowedFilters = new Set(['id','status','priority','assignee_id','fund_id','task_id','user_id','is_read','category','urgency','active','holder_id','scheduled_date','due_date','created_at']);
const permissionActions = new Set(['view','create','edit','delete','approve']);

async function supabaseFetch(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${supabaseUrl}${path}`, { ...init, headers: { apikey: supabaseAnonKey!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
}

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Bearer access token required.' } });
  try {
    const userResponse = await supabaseFetch('/auth/v1/user', token);
    if (!userResponse.ok) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Supabase session is invalid or expired.' } });
    const user = await userResponse.json() as { id?: string };
    if (!user.id) return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Authenticated user was not returned.' } });
    const orgId = req.header('x-organization-id');
    if (!orgId || !uuidPattern.test(orgId)) return res.status(400).json({ error: { code: 'ORGANIZATION_REQUIRED', message: 'Provide a valid x-organization-id header.' } });
    const q = new URLSearchParams({ select: 'organization_id,role,active', auth_user_id: `eq.${user.id}`, organization_id: `eq.${orgId}`, active: 'eq.true', limit: '1' });
    const membershipResponse = await supabaseFetch(`/rest/v1/organization_members?${q}`, token);
    if (!membershipResponse.ok) throw new Error(`Membership lookup failed (${membershipResponse.status}).`);
    const rows = await membershipResponse.json() as Array<{ organization_id: string; role: Role; active: boolean }>;
    const member = rows[0];
    if (!member || !['admin','ops_manager','finance_officer','field_officer','viewer'].includes(member.role)) return res.status(403).json({ error: { code: 'NOT_ORG_MEMBER', message: 'No active membership for this organization.' } });
    (req as AuthenticatedRequest).auth = { token, userId: user.id, organizationId: member.organization_id, role: member.role };
    return next();
  } catch (error) {
    console.error('API authentication failed:', error);
    return res.status(502).json({ error: { code: 'AUTH_PROVIDER_ERROR', message: 'Could not verify the session with Supabase.' } });
  }
}

async function allowed(auth: AuthContext, module: string, action: string) {
  if (auth.role === 'admin') return true;
  const key = `${module}.${action}`;
  const query = new URLSearchParams({ select: 'granted', organization_id: `eq.${auth.organizationId}`, role_key: `eq.${auth.role}`, permission_key: `eq.${key}`, limit: '1' });
  const response = await supabaseFetch(`/rest/v1/role_permissions?${query}`, auth.token);
  if (!response.ok) throw new Error(`Permission lookup failed (${response.status}); apply the RBAC migration.`);
  const rows = await response.json() as Array<{ granted: boolean }>;
  return rows[0]?.granted === true;
}

function sendDbError(res: Response, status: number, body: string) {
  let details: unknown = body;
  try { details = JSON.parse(body); } catch { /* use text */ }
  return res.status([400,401,403,404,409,422].includes(status) ? status : 502).json({ error: { code: 'DATABASE_REQUEST_FAILED', details } });
}

app.get('/health', (_req, res) => res.json({ status: 'ok', api: 'neer-v1' }));
app.use('/api/v1', authenticate);
app.get('/api/v1', (_req, res) => res.json({ version: 'v1', resources: Object.keys(resources).map((key) => `/api/v1/${key}`), admin: ['/api/v1/admin/permissions'] }));

app.get('/api/v1/admin/permissions', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  if (auth.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin role required.' } });
  try {
    const [catalog, grants] = await Promise.all([
      supabaseFetch('/rest/v1/permission_catalog?select=permission_key,module_key,action_key,label_ar&order=module_key,action_key', auth.token),
      supabaseFetch(`/rest/v1/role_permissions?${new URLSearchParams({ select: 'role_key,permission_key,granted', organization_id: `eq.${auth.organizationId}` })}`, auth.token),
    ]);
    if (!catalog.ok) return sendDbError(res, catalog.status, await catalog.text());
    if (!grants.ok) return sendDbError(res, grants.status, await grants.text());
    return res.json({ permissions: await catalog.json(), grants: await grants.json() });
  } catch (error) { console.error(error); return res.status(502).json({ error: { code: 'RBAC_READ_FAILED', message: 'Unable to load role permissions.' } }); }
});

app.put('/api/v1/admin/permissions/:roleKey', async (req, res) => {
  const auth = (req as unknown as AuthenticatedRequest).auth;
  if (auth.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin role required.' } });
  const roleKey = req.params.roleKey;
  if (!['ops_manager','finance_officer','field_officer','viewer'].includes(roleKey)) return res.status(400).json({ error: { code: 'PROTECTED_ROLE', message: 'The administrator role is protected.' } });
  const grants = req.body?.grants;
  if (!Array.isArray(grants) || grants.length > 200 || grants.some((item: any) => typeof item?.permissionKey !== 'string' || typeof item?.granted !== 'boolean')) return res.status(400).json({ error: { code: 'INVALID_GRANTS', message: 'Provide a list of { permissionKey, granted } entries.' } });
  try {
    const catalogResponse = await supabaseFetch('/rest/v1/permission_catalog?select=permission_key', auth.token);
    if (!catalogResponse.ok) return sendDbError(res, catalogResponse.status, await catalogResponse.text());
    const allowedKeys = new Set((await catalogResponse.json() as Array<{ permission_key: string }>).map((p) => p.permission_key));
    if (grants.some((item: any) => !allowedKeys.has(item.permissionKey))) return res.status(400).json({ error: { code: 'UNKNOWN_PERMISSION', message: 'A permission key is not in the catalog.' } });
    const rows = [...new Map(grants.map((item: any) => [item.permissionKey, { organization_id: auth.organizationId, role_key: roleKey, permission_key: item.permissionKey, granted: item.granted }])).values()];
    const query = new URLSearchParams({ on_conflict: 'organization_id,role_key,permission_key' });
    const response = await supabaseFetch(`/rest/v1/role_permissions?${query}`, auth.token, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(rows) });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.json({ roleKey, grants: await response.json() });
  } catch (error) { console.error(error); return res.status(502).json({ error: { code: 'RBAC_WRITE_FAILED', message: 'Unable to save permissions.' } }); }
});

app.all('/api/v1/:resource/:id?', async (req, res) => {
  const auth = (req as unknown as AuthenticatedRequest).auth;
  const resource = resources[req.params.resource as keyof typeof resources];
  if (!resource) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Unknown API resource.' } });
  if (req.params.id && !idPattern.test(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid record id.' } });
  const action = req.method === 'GET' ? 'view' : req.method === 'POST' ? 'create' : req.method === 'PATCH' ? 'edit' : req.method === 'DELETE' ? 'delete' : '';
  if (!permissionActions.has(action)) { res.setHeader('Allow', 'GET, POST, PATCH, DELETE'); return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } }); }
  try {
    if (!(await allowed(auth, resource.module, action))) return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission ${resource.module}.${action}.` } });
  } catch (error) { console.error(error); return res.status(503).json({ error: { code: 'PERMISSIONS_UNAVAILABLE', message: 'Permission service is unavailable. Apply the RBAC migration.' } }); }
  if (req.method === 'POST' && req.params.id) return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Create records on the collection path.' } });
  if ((req.method === 'PATCH' || req.method === 'DELETE') && !req.params.id) return res.status(400).json({ error: { code: 'ID_REQUIRED', message: 'Update/delete requires a record id.' } });

  const query = new URLSearchParams({ select: '*', organization_id: `eq.${auth.organizationId}` });
  if (req.params.id) query.set('id', `eq.${req.params.id}`);
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'limit' || key === 'offset') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 5000) return res.status(400).json({ error: { code: 'INVALID_PAGINATION', message: 'limit/offset must be 0–5000.' } });
      query.set(key, String(n));
    } else if (allowedFilters.has(key) && typeof value === 'string') query.set(key, `eq.${value}`);
    else return res.status(400).json({ error: { code: 'INVALID_FILTER', message: `Filter '${key}' is not supported.` } });
  }
  const body = req.body as Record<string, unknown> | undefined;
  if ((req.method === 'POST' || req.method === 'PATCH') && (!body || typeof body !== 'object' || Array.isArray(body))) return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'JSON object required.' } });
  if (body && ('organization_id' in body || 'organizationId' in body)) return res.status(400).json({ error: { code: 'PROTECTED_FIELD', message: 'Organization id is server controlled.' } });
  const response = await supabaseFetch(`/rest/v1/${resource.table}?${query}`, auth.token, {
    method: req.method,
    headers: req.method === 'POST' || req.method === 'PATCH' ? { Prefer: 'return=representation' } : {},
    ...(req.method === 'POST' || req.method === 'PATCH' ? { body: JSON.stringify({ ...body, organization_id: auth.organizationId }) } : {}),
  });
  if (!response.ok) return sendDbError(res, response.status, await response.text());
  if (response.status === 204) return res.status(204).end();
  return res.status(req.method === 'POST' ? 201 : 200).type('application/json').send((await response.text()) || '[]');
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } });
});

// Vercel Functions must export the Express handler and must not start a long-lived listener.
if (process.env.VERCEL !== '1') app.listen(port, '0.0.0.0', () => console.log(`Neer API listening on http://0.0.0.0:${port}`));

export { app };
export default app;
