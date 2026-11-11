import express, { type NextFunction, type Request, type Response } from 'express';

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required by the API server.');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const resources = {
  tasks: { table: 'tasks', module: 'tasks' }, 'task-events': { table: 'task_events', module: 'tasks' }, 'task-assignees': { table: 'task_assignees', module: 'tasks' }, 'task-checklist': { table: 'task_checklist_items', module: 'tasks' },
  'task-steps': { table: 'task_steps', module: 'tasks' }, 'task-subtasks': { table: 'task_subtasks', module: 'tasks' },
  'task-updates': { table: 'task_daily_updates', module: 'tasks' }, 'task-history': { table: 'task_history', module: 'tasks' },
  'task-attachments': { table: 'task_attachments', module: 'tasks' }, 'task-comments': { table: 'task_comments', module: 'tasks' },
  funds: { table: 'funds', module: 'funds' }, expenses: { table: 'expenses', module: 'expenses' },
  settlements: { table: 'settlements', module: 'settlements' }, 'settlement-expenses': { table: 'settlement_expenses', module: 'settlements' },
  'cash-receipts': { table: 'cash_receipts', module: 'funds' }, 'standing-accounts': { table: 'standing_accounts', module: 'expenses' },
  'fund-transactions': { table: 'fund_transactions', module: 'funds' }, 'standing-account-entries': { table: 'standing_account_entries', module: 'expenses' },
  'follow-ups': { table: 'follow_ups', module: 'followUps' }, notifications: { table: 'notifications', module: 'dashboard' },
  'audit-logs': { table: 'audit_logs', module: 'audit' }, users: { table: 'app_users', module: 'users' },
  roles: { table: 'roles', module: 'roles' }, settings: { table: 'system_settings', module: 'settings' },
} as const;

type Role = 'admin' | 'ops_manager' | 'finance_officer' | 'field_officer' | 'viewer';
type AuthContext = { token: string; userId: string; organizationId: string; appUserId: string | null; role: Role };
type AuthenticatedRequest = Request & { auth: AuthContext };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;
const allowedFilters = new Set(['id','status','priority','assignee_id','fund_id','task_id','user_id','is_read','category','urgency','active','holder_id','scheduled_date','due_date','created_at','settlement_id','expense_id','standing_account_id','app_user_id']);
const permissionActions = new Set(['view','create','edit','delete','approve']);
// Financial balances and approvals must only change through atomic, audited database workflows.
const transactionOnlyResources = new Set(['funds','expenses','settlements','settlement-expenses','cash-receipts','standing-accounts','fund-transactions','standing-account-entries']);
const taskChildResources = new Set(['task-checklist','task-steps','task-subtasks','task-updates','task-history','task-attachments','task-comments','task-events','task-assignees']);

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
    const q = new URLSearchParams({ select: 'organization_id,role,active,app_user_id', auth_user_id: `eq.${user.id}`, organization_id: `eq.${orgId}`, active: 'eq.true', limit: '1' });
    const membershipResponse = await supabaseFetch(`/rest/v1/organization_members?${q}`, token);
    if (!membershipResponse.ok) throw new Error(`Membership lookup failed (${membershipResponse.status}).`);
    const rows = await membershipResponse.json() as Array<{ organization_id: string; role: Role; active: boolean; app_user_id: string | null }>;
    const member = rows[0];
    if (!member || !['admin','ops_manager','finance_officer','field_officer','viewer'].includes(member.role)) return res.status(403).json({ error: { code: 'NOT_ORG_MEMBER', message: 'No active membership for this organization.' } });
    (req as AuthenticatedRequest).auth = { token, userId: user.id, organizationId: member.organization_id, appUserId: member.app_user_id, role: member.role };
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

app.get('/api/v1/me', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  const query = new URLSearchParams({
    select: 'id,name,email,role,role_title_ar,phone,department,avatar,active,auth_user_id',
    organization_id: `eq.${auth.organizationId}`,
    auth_user_id: `eq.${auth.userId}`,
    limit: '1',
  });
  const response = await supabaseFetch(`/rest/v1/app_users?${query}`, auth.token);
  if (!response.ok) return sendDbError(res, response.status, await response.text());
  const rows = await response.json() as Array<Record<string, unknown>>;
  if (!rows[0]) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'No operational user profile is linked to this account.' } });
  return res.json(rows[0]);
});

app.post('/api/v1/tasks/create-bundle', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    if (!(await allowed(auth, 'tasks', 'create'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission tasks.create.' } });
    }
    if (!auth.appUserId) {
      return res.status(403).json({ error: { code: 'OPERATIONAL_PROFILE_REQUIRED', message: 'A linked operational user profile is required.' } });
    }
    const body = req.body as Record<string, any> | undefined;
    const task = body?.task;
    const checklist = body?.checklist ?? [];
    const steps = body?.steps ?? [];
    const subtask = body?.subtask ?? null;
    if (!body || !task || typeof task !== 'object' || Array.isArray(task) ||
        !idPattern.test(String(task.id || '')) || typeof task.title !== 'string' || !task.title.trim() ||
        typeof task.assigneeId !== 'string' || !idPattern.test(task.assigneeId) ||
        !Array.isArray(checklist) || checklist.length > 500 ||
        !Array.isArray(steps) || steps.length > 250 ||
        (subtask !== null && (typeof subtask !== 'object' || Array.isArray(subtask)))) {
      return res.status(400).json({ error: { code: 'INVALID_TASK_BUNDLE', message: 'Task, assignee, checklist and steps payload is invalid.' } });
    }
    if (auth.role === 'field_officer' && task.assigneeId !== auth.appUserId) {
      return res.status(403).json({ error: { code: 'TASK_ASSIGNMENT_FORBIDDEN', message: 'Field officers may only assign tasks to themselves.' } });
    }
    const response = await supabaseFetch('/rest/v1/rpc/create_task_bundle', auth.token, {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: auth.organizationId,
        p_task: task,
        p_checklist: checklist,
        p_steps: steps,
        p_subtask: subtask,
      }),
    });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.status(201).json(await response.json());
  } catch (error) {
    console.error('Atomic task creation failed:', error);
    return res.status(503).json({ error: { code: 'TASK_CREATION_FAILED', message: 'The task bundle could not be saved. No local task was created.' } });
  }
});

app.post('/api/v1/tasks/record-outcome', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    if (!(await allowed(auth, 'tasks', 'edit'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission tasks.edit.' } });
    }
    const body = req.body as Record<string, any> | undefined;
    const taskId = body?.taskId;
    const requestId = body?.requestId;
    const outcome = body?.outcome;
    const followUp = body?.followUp ?? null;
    const event = body?.event ?? null;
    if (!body || typeof taskId !== 'string' || !idPattern.test(taskId) ||
        typeof requestId !== 'string' || !uuidPattern.test(requestId) ||
        !['completed','partially_completed','not_completed','unable_to_execute','needs_followup'].includes(outcome) ||
        (followUp !== null && (
          typeof followUp !== 'object' || Array.isArray(followUp) ||
          typeof followUp.id !== 'string' || !idPattern.test(followUp.id) ||
          typeof followUp.title !== 'string' || !followUp.title.trim() || followUp.title.length > 240 ||
          typeof followUp.assigneeId !== 'string' || !idPattern.test(followUp.assigneeId) ||
          typeof followUp.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(followUp.dueDate)
        )) ||
        (event !== null && (
          typeof event !== 'object' || Array.isArray(event) ||
          typeof event.clientEventId !== 'string' || !uuidPattern.test(event.clientEventId) ||
          !Number.isFinite(event.latitude) || !Number.isFinite(event.longitude) || !Number.isFinite(event.accuracyMeters)
        ))) {
      return res.status(400).json({ error: { code: 'INVALID_TASK_OUTCOME', message: 'Task outcome payload is invalid.' } });
    }
    if (auth.role === 'field_officer' && followUp?.assigneeId && followUp.assigneeId !== auth.appUserId) {
      return res.status(403).json({ error: { code: 'FOLLOW_UP_ASSIGNMENT_FORBIDDEN', message: 'Field officers may only assign follow-up tasks to themselves.' } });
    }
    const response = await supabaseFetch('/rest/v1/rpc/record_task_outcome_bundle', auth.token, {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: auth.organizationId,
        p_task_id: taskId,
        p_request_id: requestId,
        p_outcome: outcome,
        p_reason: body.reason || null,
        p_notes: body.notes || null,
        p_proof_url: body.proofUrl || null,
        p_follow_up: followUp,
        p_event: event,
      }),
    });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.status(200).json(await response.json());
  } catch (error) {
    console.error('Atomic task outcome failed:', error);
    return res.status(503).json({ error: { code: 'TASK_OUTCOME_FAILED', message: 'The task outcome could not be saved.' } });
  }
});

app.post('/api/v1/tasks/review', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    if (!(await allowed(auth, 'tasks', 'approve'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission tasks.approve.' } });
    }
    const body = req.body as Record<string, any> | undefined;
    if (!body || typeof body.taskId !== 'string' || !idPattern.test(body.taskId) ||
        !['approve','reject'].includes(body.action) ||
        (body.action === 'reject' && (typeof body.reason !== 'string' || !body.reason.trim()))) {
      return res.status(400).json({ error: { code: 'INVALID_TASK_REVIEW', message: 'Task review payload is invalid.' } });
    }
    const response = await supabaseFetch('/rest/v1/rpc/review_task_approval', auth.token, {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: auth.organizationId,
        p_task_id: body.taskId,
        p_action: body.action,
        p_notes: body.reason || body.notes || null,
      }),
    });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.status(200).json(await response.json());
  } catch (error) {
    console.error('Task review failed:', error);
    return res.status(503).json({ error: { code: 'TASK_REVIEW_FAILED', message: 'The task review could not be saved.' } });
  }
});

app.post('/api/v1/tasks/lifecycle', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    if (!(await allowed(auth, 'tasks', 'edit'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission tasks.edit.' } });
    }
    const body = req.body as Record<string, any> | undefined;
    if (!body || typeof body.taskId !== 'string' || !idPattern.test(body.taskId) ||
        !['start','pause','resume'].includes(body.action) ||
        (body.action === 'pause' && (typeof body.reason !== 'string' || !body.reason.trim()))) {
      return res.status(400).json({ error: { code: 'INVALID_TASK_LIFECYCLE', message: 'Task lifecycle payload is invalid.' } });
    }
    const response = await supabaseFetch('/rest/v1/rpc/update_task_lifecycle', auth.token, {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: auth.organizationId,
        p_task_id: body.taskId,
        p_action: body.action,
        p_reason: body.reason || null,
      }),
    });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.status(200).json(await response.json());
  } catch (error) {
    console.error('Task lifecycle update failed:', error);
    return res.status(503).json({ error: { code: 'TASK_LIFECYCLE_FAILED', message: 'The task lifecycle update could not be saved.' } });
  }
});

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

app.post('/api/v1/task-events/lifecycle', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  try {
    if (!(await allowed(auth, 'tasks', 'edit'))) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Missing permission tasks.edit.' } });
    }
    const body = req.body as Record<string, unknown> | undefined;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!body || typeof body.task_id !== 'string' || !idPattern.test(body.task_id) ||
        typeof body.event_type !== 'string' || typeof body.event_label !== 'string' ||
        typeof body.latitude !== 'number' || typeof body.longitude !== 'number' ||
        typeof body.accuracy_meters !== 'number' || typeof body.client_event_id !== 'string' ||
        !uuid.test(body.client_event_id) || !body.details || typeof body.details !== 'object' || Array.isArray(body.details)) {
      return res.status(400).json({ error: { code: 'INVALID_FIELD_EVENT', message: 'A task, lifecycle event, valid GPS fix, idempotency key and JSON details are required.' } });
    }
    const response = await supabaseFetch('/rest/v1/rpc/record_field_task_event', auth.token, {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: auth.organizationId,
        p_task_id: body.task_id,
        p_event_type: body.event_type,
        p_event_label: body.event_label,
        p_latitude: body.latitude,
        p_longitude: body.longitude,
        p_accuracy_meters: body.accuracy_meters,
        p_details: body.details,
        p_client_event_id: body.client_event_id,
      }),
    });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.status(200).json({ eventId: await response.json() });
  } catch (error) {
    console.error('Field lifecycle transaction failed:', error);
    return res.status(503).json({ error: { code: 'FIELD_EVENT_FAILED', message: 'Could not save the field event and task state atomically.' } });
  }
});


app.post('/api/v1/finance/:workflow', async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth;
  if (!['admin','finance_officer'].includes(auth.role) && req.params.workflow !== 'create-expense') {
    return res.status(403).json({ error: { code: 'FINANCE_ROLE_REQUIRED', message: 'Finance officer or administrator role required.' } });
  }
  if (req.params.workflow === 'create-expense' && !(await allowed(auth, 'expenses', 'create'))) {
    return res.status(403).json({ error: { code: 'EXPENSE_CREATE_FORBIDDEN', message: 'Missing permission expenses.create.' } });
  }
  const body = req.body as Record<string, any> | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'JSON object required.' } });
  }
  const workflows: Record<string, { rpc: string; args: (value: Record<string, any>) => Record<string, unknown> }> = {
    'create-fund': { rpc: 'finance_create_fund', args: (v) => ({ p_org: auth.organizationId, p_payload: v.payload, p_idempotency: v.idempotencyKey }) },
    'create-standing-account': { rpc: 'finance_create_standing_account', args: (v) => ({ p_org: auth.organizationId, p_payload: v.payload, p_idempotency: v.idempotencyKey }) },
    'create-cash-receipt': { rpc: 'finance_create_cash_receipt', args: (v) => ({ p_org: auth.organizationId, p_payload: v.payload, p_idempotency: v.idempotencyKey }) },
    'cover-deficit': { rpc: 'finance_cover_deficit', args: (v) => ({ p_org: auth.organizationId, p_expense_id: v.expenseId, p_idempotency: v.idempotencyKey }) },
    'settle-standing-account': { rpc: 'finance_settle_standing_account', args: (v) => ({ p_org: auth.organizationId, p_account_id: v.accountId, p_amount: v.amount, p_fund_id: v.fundId, p_entry_date: v.entryDate, p_reference: v.reference, p_idempotency: v.idempotencyKey }) },
    'review-settlement': { rpc: 'finance_review_settlement', args: (v) => ({ p_org: auth.organizationId, p_settlement_id: v.settlementId, p_action: v.action, p_notes: v.notes ?? null }) },
    'create-expense': { rpc: 'finance_create_expense', args: (v) => ({ p_org: auth.organizationId, p_payload: v.payload, p_idempotency: v.idempotencyKey }) },
    'review-expense': { rpc: 'finance_review_expense', args: (v) => ({ p_org: auth.organizationId, p_expense_id: v.expenseId, p_approve: v.approve, p_reason: v.reason ?? null }) },
    'replenish-fund': { rpc: 'finance_replenish_fund', args: (v) => ({ p_org: auth.organizationId, p_fund_id: v.fundId, p_amount: v.amount, p_notes: v.notes ?? null, p_idempotency: v.idempotencyKey }) },
    'standing-entry': { rpc: 'finance_create_standing_entry', args: (v) => ({ p_org: auth.organizationId, p_payload: v.payload, p_idempotency: v.idempotencyKey }) },
    'create-settlement': { rpc: 'finance_create_settlement', args: (v) => ({ p_org: auth.organizationId, p_fund_id: v.fundId, p_period_start: v.periodStart, p_period_end: v.periodEnd, p_expense_ids: v.expenseIds ?? null, p_idempotency: v.idempotencyKey }) },
  };
  const workflow = workflows[req.params.workflow];
  if (!workflow) return res.status(404).json({ error: { code: 'FINANCE_WORKFLOW_NOT_FOUND' } });
  if (['create-fund','create-standing-account','create-cash-receipt','settle-standing-account','cover-deficit','create-expense','replenish-fund','standing-entry','create-settlement'].includes(req.params.workflow) &&
      (typeof body.idempotencyKey !== 'string' || !uuidPattern.test(body.idempotencyKey))) {
    return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Provide a UUID idempotencyKey.' } });
  }
  if (req.params.workflow === 'cover-deficit' && typeof body.expenseId !== 'string') return res.status(400).json({ error: { code: 'INVALID_DEFICIT_COVERAGE' } });
  if (req.params.workflow === 'review-settlement' && (typeof body.settlementId !== 'string' || !['audit','approve','reject'].includes(body.action))) return res.status(400).json({ error: { code: 'INVALID_SETTLEMENT_ACTION' } });
  if (req.params.workflow === 'settle-standing-account' && (typeof body.accountId !== 'string' || typeof body.fundId !== 'string' || typeof body.amount !== 'number' || typeof body.reference !== 'string')) return res.status(400).json({ error: { code: 'INVALID_ACCOUNT_SETTLEMENT' } });
  if (req.params.workflow === 'review-expense' && (typeof body.expenseId !== 'string' || typeof body.approve !== 'boolean')) return res.status(400).json({ error: { code: 'INVALID_REVIEW' } });
  try {
    const response = await supabaseFetch('/rest/v1/rpc/' + workflow.rpc, auth.token, { method: 'POST', body: JSON.stringify(workflow.args(body)) });
    if (!response.ok) return sendDbError(res, response.status, await response.text());
    return res.status(200).json(await response.json());
  } catch (error) {
    console.error('Finance workflow failed:', error);
    return res.status(503).json({ error: { code: 'FINANCE_WORKFLOW_FAILED', message: 'The financial transaction could not be completed.' } });
  }
});

app.all('/api/v1/:resource/:id?', async (req, res) => {
  const auth = (req as unknown as AuthenticatedRequest).auth;
  const resource = resources[req.params.resource as keyof typeof resources];
  if (!resource) return res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Unknown API resource.' } });
  if (req.params.id && !idPattern.test(req.params.id)) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid record id.' } });
  const action = (req.params.resource === 'task-events' && req.method === 'POST') || (['task-attachments','task-assignees'].includes(req.params.resource) && req.method === 'DELETE') ? 'edit' : req.method === 'GET' ? 'view' : req.method === 'POST' ? 'create' : req.method === 'PATCH' ? 'edit' : req.method === 'DELETE' ? 'delete' : '';
  if (action !== 'view' && transactionOnlyResources.has(req.params.resource)) {
    return res.status(409).json({ error: { code: 'FINANCIAL_TRANSACTION_REQUIRED', message: 'Financial records are read-only through generic CRUD. Use a dedicated transactional workflow so balances, approvals, and audit records remain atomic.' } });
  }
  if (!permissionActions.has(action)) { res.setHeader('Allow', 'GET, POST, PATCH, DELETE'); return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED' } }); }
  try {
    if (!(await allowed(auth, resource.module, action))) return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Missing permission ${resource.module}.${action}.` } });
  } catch (error) { console.error(error); return res.status(503).json({ error: { code: 'PERMISSIONS_UNAVAILABLE', message: 'Permission service is unavailable. Apply the RBAC migration.' } }); }
  if (req.params.resource === 'task-events' && req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: { code: 'APPEND_ONLY', message: 'Field events can only be read or appended.' } });
  if (req.params.id && req.params.resource === 'task-events' && req.method !== 'GET') return res.status(405).json({ error: { code: 'APPEND_ONLY', message: 'Field events cannot be changed or deleted.' } });
  if (req.params.resource === 'tasks' && req.method === 'PATCH') {
    const requestedStatus = (req.body as Record<string, unknown> | undefined)?.status;
    if (['completed','approved','rejected'].includes(String(requestedStatus)) && !(await allowed(auth, 'tasks', 'approve'))) {
      return res.status(403).json({ error: { code: 'TASK_APPROVAL_FORBIDDEN', message: 'A task approval permission is required for this status transition.' } });
    }
  }
  if (req.method === 'POST' && req.params.id) return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Create records on the collection path.' } });
  if ((req.method === 'PATCH' || req.method === 'DELETE') && !req.params.id) return res.status(400).json({ error: { code: 'ID_REQUIRED', message: 'Update/delete requires a record id.' } });

  const query = new URLSearchParams({ select: '*', organization_id: `eq.${auth.organizationId}` });
  if (req.params.id) query.set('id', `eq.${req.params.id}`);

  // Enforce field-officer row scope at the API boundary as defense in depth.
  // The database RLS policies remain authoritative; this prevents broad snapshot
  // requests from returning another field officer's tasks and related records.
  if (auth.role === 'field_officer') {
    if (!auth.appUserId) return res.status(403).json({ error: { code: 'FIELD_PROFILE_REQUIRED', message: 'A linked operational user profile is required.' } });
    if (req.params.resource === 'tasks') {
      if (req.method === 'POST') {
        const requestedAssignee = (req.body as Record<string, unknown> | undefined)?.assignee_id;
        if (requestedAssignee !== auth.appUserId) return res.status(403).json({ error: { code: 'TASK_ASSIGNMENT_FORBIDDEN', message: 'Field officers may only create tasks assigned to themselves.' } });
      }
      if (req.method === 'PATCH') {
        const requestedAssignee = (req.body as Record<string, unknown> | undefined)?.assignee_id;
        if (requestedAssignee !== undefined && requestedAssignee !== auth.appUserId) {
          return res.status(403).json({ error: { code: 'TASK_REASSIGNMENT_FORBIDDEN', message: 'Field officers cannot reassign tasks.' } });
        }
      }
      // RLS scopes primary and secondary assignments. A forced assignee_id filter would hide collaborators.
    } else if (taskChildResources.has(req.params.resource)) {
      const [assignedResponse, collaboratorResponse] = await Promise.all([
        supabaseFetch(`/rest/v1/tasks?${new URLSearchParams({
          select: 'id', organization_id: `eq.${auth.organizationId}`,
          assignee_id: `eq.${auth.appUserId}`, limit: '500',
        })}`, auth.token),
        supabaseFetch(`/rest/v1/task_assignees?${new URLSearchParams({
          select: 'task_id', organization_id: `eq.${auth.organizationId}`,
          app_user_id: `eq.${auth.appUserId}`, limit: '500',
        })}`, auth.token),
      ]);
      if (!assignedResponse.ok) return sendDbError(res, assignedResponse.status, await assignedResponse.text());
      if (!collaboratorResponse.ok) return sendDbError(res, collaboratorResponse.status, await collaboratorResponse.text());
      const assignedTasks = await assignedResponse.json() as Array<{ id: string }>;
      const collaboratorTasks = await collaboratorResponse.json() as Array<{ task_id: string }>;
      const assignedIds = [...new Set([
        ...assignedTasks.map((task) => task.id),
        ...collaboratorTasks.map((task) => task.task_id),
      ])].filter((id) => idPattern.test(id));
      const assignedFilter = assignedIds.length ? `in.(${assignedIds.join(',')})` : 'eq.__no_assigned_task__';
      if (req.params.resource === 'task-assignees' && req.method === 'GET') query.set('app_user_id', `eq.${auth.appUserId}`);
      if (req.method === 'GET' || req.method === 'PATCH' || req.method === 'DELETE') query.set('task_id', assignedFilter);
      if (req.method === 'POST' || req.method === 'PATCH') {
        const requestedTaskId = (req.body as Record<string, unknown> | undefined)?.task_id;
        if (req.method === 'POST' && (typeof requestedTaskId !== 'string' || !assignedIds.includes(requestedTaskId))) {
          return res.status(403).json({ error: { code: 'TASK_ACCESS_FORBIDDEN', message: 'The related task is not assigned to this field officer.' } });
        }
        if (req.method === 'PATCH' && requestedTaskId !== undefined && (typeof requestedTaskId !== 'string' || !assignedIds.includes(requestedTaskId))) {
          return res.status(403).json({ error: { code: 'TASK_ACCESS_FORBIDDEN', message: 'The related task is not assigned to this field officer.' } });
        }
      }
    } else if (req.params.resource === 'follow-ups') {
      if (req.method === 'GET' || req.method === 'PATCH' || req.method === 'DELETE') query.set('assigned_to', `eq.${auth.appUserId}`);
      const requestedAssignee = (req.body as Record<string, unknown> | undefined)?.assigned_to;
      if (req.method === 'POST' && requestedAssignee !== auth.appUserId) {
        return res.status(403).json({ error: { code: 'FOLLOW_UP_ASSIGNMENT_FORBIDDEN', message: 'Field officers may only create follow-ups assigned to themselves.' } });
      }
      if (req.method === 'PATCH' && requestedAssignee !== undefined && requestedAssignee !== auth.appUserId) {
        return res.status(403).json({ error: { code: 'FOLLOW_UP_REASSIGNMENT_FORBIDDEN', message: 'Field officers cannot reassign follow-ups.' } });
      }
    } else if (req.method === 'GET' && req.params.resource === 'funds') {
      query.set('holder_id', `eq.${auth.appUserId}`);
    } else if (req.method === 'GET' && req.params.resource === 'notifications') {
      query.set('or', `(user_id.eq.${auth.appUserId},user_id.is.null)`);
    }
  }
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'limit' || key === 'offset') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 5000) return res.status(400).json({ error: { code: 'INVALID_PAGINATION', message: 'limit/offset must be 0–5000.' } });
      query.set(key, String(n));
    } else if (allowedFilters.has(key) && typeof value === 'string') {
      const serverScopedFilter =
        auth.role === 'field_officer' &&
        ((req.params.resource === 'tasks' && key === 'assignee_id') ||
          (taskChildResources.has(req.params.resource) && key === 'task_id') ||
          (req.params.resource === 'funds' && key === 'holder_id'));
      if (!serverScopedFilter) query.set(key, `eq.${value}`);
    }
    else return res.status(400).json({ error: { code: 'INVALID_FILTER', message: `Filter '${key}' is not supported.` } });
  }
  const body = req.body as Record<string, unknown> | undefined;
  if ((req.method === 'POST' || req.method === 'PATCH') && (!body || typeof body !== 'object' || Array.isArray(body))) return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'JSON object required.' } });
  if (body && ('organization_id' in body || 'organizationId' in body)) return res.status(400).json({ error: { code: 'PROTECTED_FIELD', message: 'Organization id is server controlled.' } });
  let trustedBody = body;
  if (body && req.method === 'POST' && ['task-updates','task-comments','task-history','task-attachments','task-assignees'].includes(req.params.resource)) {
    if (!auth.appUserId) return res.status(403).json({ error: { code: 'OPERATIONAL_PROFILE_REQUIRED', message: 'A linked operational profile is required.' } });
    const profileQuery = new URLSearchParams({ select: 'id,name,role_title_ar,avatar', organization_id: `eq.${auth.organizationId}`, id: `eq.${auth.appUserId}`, limit: '1' });
    const profileResponse = await supabaseFetch(`/rest/v1/app_users?${profileQuery}`, auth.token);
    if (!profileResponse.ok) return sendDbError(res, profileResponse.status, await profileResponse.text());
    const profiles = await profileResponse.json() as Array<{ id: string; name: string; role_title_ar?: string; avatar?: string }>;
    const profile = profiles[0];
    if (!profile) return res.status(403).json({ error: { code: 'OPERATIONAL_PROFILE_REQUIRED', message: 'A linked operational profile is required.' } });
    if (req.params.resource === 'task-updates') trustedBody = { ...body, author_id: profile.id, author_name: profile.name };
    if (req.params.resource === 'task-comments') trustedBody = { ...body, author_id: profile.id, author_name: profile.name, author_avatar: profile.avatar || null, author_role: profile.role_title_ar || auth.role };
    if (req.params.resource === 'task-history') trustedBody = { ...body, performed_by: profile.name };
    if (req.params.resource === 'task-attachments') trustedBody = { ...body, uploaded_by: profile.name };
    if (req.params.resource === 'task-assignees') trustedBody = { ...body, assigned_by: profile.id };
  }
  const response = await supabaseFetch(`/rest/v1/${resource.table}?${query}`, auth.token, {
    method: req.method,
    headers: req.method === 'POST' || req.method === 'PATCH' ? { Prefer: 'return=representation' } : {},
    ...(req.method === 'POST' || req.method === 'PATCH' ? { body: JSON.stringify({ ...trustedBody, organization_id: auth.organizationId, ...(req.params.resource === 'task-events' ? { actor_auth_user_id: auth.userId, occurred_at: new Date().toISOString() } : {}) }) } : {}),
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
