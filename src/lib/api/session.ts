import type { Role, PettyCashFund, Expense, Settlement, CashReceipt, StandingAccount, StandingAccountEntry, TaskAssignee } from '../../types/domain';
import { dataStore } from '../storage';
import { setLivePermissionGrants } from '../rbac/permissions';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const SESSION_KEY = 'neer_api_session_v1';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export type ApiSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
  organizationId: string;
  appUserId?: string;
  role: Role;
};

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string; email?: string };
};

export class SessionError extends Error {
  constructor(message: string) { super(message); this.name = 'SessionError'; }
}

function requireConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new SessionError('أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY إلى إعدادات البيئة.');
  }
}

async function authRequest<T>(path: string, body: unknown): Promise<T> {
  requireConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new SessionError(payload.msg || payload.message || payload.error_description || 'تعذر تسجيل الدخول إلى Supabase.');
  return payload as T;
}

function readStoredSession(): ApiSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ApiSession;
    if (!value || typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string' ||
        typeof value.userId !== 'string' || typeof value.organizationId !== 'string' ||
        typeof value.expiresAt !== 'number') return null;
    return value;
  } catch { return null; }
}

export function getSession(): ApiSession | null {
  const value = readStoredSession();
  if (!value) return null;
  // Keep expired sessions when a refresh token exists so the gate can renew them
  // instead of incorrectly forcing the user to sign in again.
  if (value.expiresAt < Date.now() && !value.refreshToken) {
    clearSession();
    return null;
  }
  return value;
}

function saveSession(value: ApiSession) { localStorage.setItem(SESSION_KEY, JSON.stringify(value)); }
let refreshInFlight: Promise<ApiSession> | null = null;
export function clearSession() { localStorage.removeItem(SESSION_KEY); setLivePermissionGrants(null, null); }

async function getMemberships(userId: string, token: string) {
  requireConfig();
  const query = new URLSearchParams({
    select: 'organization_id,app_user_id,role,active,is_default',
    auth_user_id: `eq.${userId}`,
    active: 'eq.true',
    order: 'is_default.desc',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/organization_members?${query}`, {
    headers: { apikey: supabaseAnonKey!, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new SessionError('تعذر جلب عضويات المستخدم؛ تأكد من تطبيق ترحيل قاعدة البيانات وسياسات RLS.');
  return response.json() as Promise<Array<{ organization_id: string; app_user_id: string | null; role: Role; active: boolean; is_default: boolean }>>;
}

export async function signIn(email: string, password: string): Promise<ApiSession> {
  const auth = await authRequest<AuthResponse>('token?grant_type=password', { email, password });
  const memberships = await getMemberships(auth.user.id, auth.access_token);
  const membership = memberships.find((item) => item.active && item.is_default) || memberships.find((item) => item.active);
  if (!membership) throw new SessionError('تم تسجيل الدخول، لكن الحساب غير مرتبط بمؤسسة. اطلب من مدير النظام إضافتك.');
  const session: ApiSession = {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    expiresAt: Date.now() + auth.expires_in * 1000,
    userId: auth.user.id,
    email: auth.user.email || email,
    organizationId: membership.organization_id,
    appUserId: membership.app_user_id || undefined,
    role: membership.role,
  };
  saveSession(session);
  return session;
}

export async function refreshSession(session: ApiSession): Promise<ApiSession> {
  if (refreshInFlight) return refreshInFlight;

  const stored = readStoredSession();
  const base = stored && stored.userId === session.userId &&
    stored.organizationId === session.organizationId ? stored : session;

  if (base.expiresAt >= Date.now() + 30_000) return base;
  if (!base.refreshToken) {
    clearSession();
    throw new SessionError('انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  }

  refreshInFlight = (async () => {
    const auth = await authRequest<AuthResponse>('token?grant_type=refresh_token', { refresh_token: base.refreshToken });
    const next = {
      ...base,
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      expiresAt: Date.now() + auth.expires_in * 1000,
      userId: auth.user.id || base.userId,
      email: auth.user.email || base.email,
    };
    saveSession(next);
    return next;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiRequest<T>(session: ApiSession, path: string, init: RequestInit = {}): Promise<T> {
  const current = session.expiresAt < Date.now() + 30_000 ? await refreshSession(session) : session;
  const response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${current.accessToken}`,
      'x-organization-id': current.organizationId,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) clearSession();
    throw new SessionError(payload.error?.message || payload.message || `فشل طلب API (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const asDomainUser = (row: Record<string, any>) => ({
  id: row.id, name: row.name, email: row.email, role: row.role,
  roleTitleAr: row.role_title_ar || '', phone: row.phone || '', department: row.department || '',
  avatar: row.avatar || '', active: row.active ?? true,
});

const fromSnake = (row: Record<string, any>) => {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[camel] = value;
  }
  return result;
};

/** Loads the initial server snapshot before importing the legacy synchronous UI store. */
export async function loadUiSnapshot(session: ApiSession): Promise<void> {
  const permissionState = await apiRequest<{ role: Role; grants: Record<string, boolean> | null }>(session, '/permissions/me');
  if (permissionState.role !== session.role) throw new SessionError('تعذر مطابقة صلاحيات الجلسة مع عضوية المؤسسة.');
  setLivePermissionGrants(permissionState.role, permissionState.grants);
  const common = ['tasks','task-checklist','task-steps','task-subtasks','task-updates','task-history','task-attachments','task-comments','task-events','task-assignees','follow-ups','notifications'];
  const finance = ['funds','expenses','settlements','settlement-expenses','cash-receipts','standing-accounts','fund-transactions','standing-account-entries'];
  const canReadUserDirectory = session.role === 'admin' || session.role === 'ops_manager';
  const canReadFinance = session.role === 'admin' || session.role === 'finance_officer';
  const canReadFieldFinance = session.role === 'field_officer';
  const canReadAudit = session.role === 'admin' || session.role === 'ops_manager' || session.role === 'finance_officer';
  const financeCollections = canReadFinance ? finance : canReadFieldFinance ? ['funds','expenses','standing-accounts'] : [];
  const settingsCollections = session.role === 'admin' ? ['settings'] : [];
  const collections = [...common, ...financeCollections, ...settingsCollections, ...(canReadUserDirectory ? ['users'] : []), ...(canReadAudit ? ['audit-logs'] : [])];
  const values = await Promise.all(collections.map(async (name) => [name, await apiRequest<Record<string, any>[]>(session, `/${name}?limit=500`)] as const));
  const data = Object.fromEntries(values);

  const users = (data.users || []).map(asDomainUser);
  const userNamesById = new Map(users.map((user) => [user.id, user.name]));
  let currentProfileId: string | undefined;
  if (!session.appUserId || users.length === 0) {
    const currentProfile = await apiRequest<Record<string, any>>(session, '/me');
    currentProfileId = typeof currentProfile.id === 'string' ? currentProfile.id : undefined;
    if (users.length === 0) users.push(asDomainUser(currentProfile));
  }
  const byId = (rows: Record<string, any>[] = []) => new Map(rows.map((row) => [row.id, fromSnake(row)]));
  const checklist = byId(data['task-checklist']);
  const steps = byId(data['task-steps']);
  const subtasks = byId(data['task-subtasks']);
  const updates = byId(data['task-updates']);
  const histories = byId(data['task-history']);
  const fieldEvents = data['task-events'] || [];
  const authUserNames = new Map((data.users || []).map((user: Record<string, any>) => [user.auth_user_id, user.name]));
  const attachments = byId(data['task-attachments']);
  const comments = byId(data['task-comments']);
  const assignees = byId(data['task-assignees']);
  const children = (map: Map<string, any>, taskId: string) => [...map.values()].filter((item) => item.taskId === taskId);

  const tasks = (data.tasks || []).map((raw) => {
    const task = fromSnake(raw);
    task.checklist = children(checklist, task.id).map((item) => ({ id: item.id, text: item.text, completed: item.completed }));
    task.steps = children(steps, task.id).map((item) => ({ id: item.id, title: item.title, status: item.status, plannedTime: item.plannedTime, completedAt: item.completedAt, notes: item.notes, order: item.sortOrder }));
    task.subTasks = children(subtasks, task.id).map((item) => ({ id: item.id, title: item.title, assigneeId: item.assigneeId || '', assigneeName: item.assigneeName, status: item.status, requiresApproval: item.requiresApproval, isApproved: item.isApproved, approvedByManager: item.approvedByManager, dueDate: item.dueDate, notes: item.notes }));
    task.dailyUpdates = children(updates, task.id).map((item) => ({ id: item.id, authorId: item.authorId || '', authorName: item.authorName, date: item.updateDate, text: item.text, createdAt: item.createdAt }));
    const storedHistory = children(histories, task.id).map((item) => ({ id: item.id, action: item.action, performedBy: item.performedBy, timestamp: item.createdAt, notes: item.notes }));
    const auditedEventIds = new Set(storedHistory
      .filter((item) => item.id.startsWith('hist-event-'))
      .map((item) => item.id.slice('hist-event-'.length)));
    const eventHistory = fieldEvents.filter((event: Record<string, any>) =>
      event.task_id === task.id && !auditedEventIds.has(event.id)
    ).map((event: Record<string, any>) => ({
      id: event.id,
      action: event.event_label || event.event_type,
      performedBy: event.actor_name || authUserNames.get(event.actor_auth_user_id) || 'مستخدم النظام',
      timestamp: event.occurred_at,
      notes: event.location_status === 'captured'
        ? `GPS: ${event.latitude}, ${event.longitude} • الدقة ${event.accuracy_meters ?? 'غير محددة'}م`
        : `الموقع: ${event.location_status}`,
    }));
    task.history = [...storedHistory, ...eventHistory].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    task.attachments = children(attachments, task.id).map((item) => ({ id: item.id, name: item.name, url: item.url, size: item.size, type: item.type, uploadedBy: item.uploadedBy, uploadedAt: item.createdAt }));
    task.comments = children(comments, task.id).map((item) => ({ id: item.id, authorId: item.authorId || '', authorName: item.authorName, authorAvatar: item.authorAvatar, authorRole: item.authorRole, text: item.text, createdAt: item.createdAt, mentions: item.mentions, isInternal: item.isInternal }));
    task.assignees = children(assignees, task.id).map((item) => ({
      id: item.id,
      appUserId: item.appUserId,
      name: item.appUserName || userNamesById.get(item.appUserId) || (item.appUserId === session.appUserId ? (users[0]?.name || task.assigneeName) : undefined),
      isPrimary: Boolean(item.isPrimary),
      assignedBy: item.assignedBy,
      assignedAt: item.createdAt,
    })) as TaskAssignee[];
    return task;
  });

  const funds = (data.funds || []).map((row: Record<string, any>) => fromSnake(row)) as PettyCashFund[];
  const fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const expenses = (data.expenses || []).map((row: Record<string, any>) => ({
    ...fromSnake(row), fundName: fundById.get(row.fund_id)?.name || '', submittedBy: row.submitted_by || '',
  })) as Expense[];
  const settlementLinks = data['settlement-expenses'] || [];
  const settlements = (data.settlements || []).map((row: Record<string, any>) => ({
    ...fromSnake(row), fundName: fundById.get(row.fund_id)?.name || '',
    expenseIds: settlementLinks.filter((item: Record<string, any>) => item.settlement_id === row.id).map((item: Record<string, any>) => item.expense_id),
    expensesCount: row.expenses_count || 0, voucherNumber: row.settlement_voucher_number || row.code,
  })) as Settlement[];
  const cashReceipts = (data['cash-receipts'] || []).map((row: Record<string, any>) => ({
    ...fromSnake(row), date: row.receipt_date, fundName: fundById.get(row.fund_id)?.name,
  })) as CashReceipt[];
  const entryRows = (data['standing-account-entries'] || []) as Record<string, any>[];
  const standingAccounts = (data['standing-accounts'] || []).map((row: Record<string, any>) => {
    const entries = entryRows.filter((entry) => entry.standing_account_id === row.id).map((entry) => ({
      id: entry.id, type: entry.entry_type === 'charge' ? 'charge' : 'settlement',
      entryType: entry.entry_type, balanceEffect: Number(entry.balance_effect), amount: Number(entry.amount),
      date: entry.entry_date, description: entry.description || '', reference: entry.reference || undefined,
      fundId: entry.fund_id || undefined, fundName: fundById.get(entry.fund_id)?.name,
      expenseId: entry.expense_id || undefined, createdBy: entry.created_by || '', createdAt: entry.created_at,
    })) as StandingAccountEntry[];
    const currentBalance = Number((Number(row.opening_balance || 0) + entries.reduce((sum, entry) => sum + (entry.balanceEffect || 0), 0)).toFixed(2));
    return { ...fromSnake(row), entries, currentBalance };
  }) as StandingAccount[];
  const followUps = (data['follow-ups'] || []).map((row) => ({ ...fromSnake(row), assignedTo: row.assigned_to, scheduledDate: row.scheduled_date, lastContactDate: row.last_contact_date }));
  const notifications = (data.notifications || []).map(fromSnake);

  // The server snapshot replaces in-memory operational state. Do not persist shared
  // records to localStorage: that cache is not authoritative and can resurrect stale data.
  const auditLogs = (data['audit-logs'] || []).map(fromSnake);
  dataStore.hydrateOperationalData({ tasks, followUps, notifications, auditLogs });
  const savedSettings = (data.settings || [])[0]?.settings;
  if (session.role === 'admin' && savedSettings && typeof savedSettings === 'object' && !Array.isArray(savedSettings)) {
    dataStore.hydrateSettings(savedSettings);
  }
  dataStore.hydrateFinanceData({ funds: canReadFinance || canReadFieldFinance ? funds : [], expenses: canReadFinance || canReadFieldFinance ? expenses : [], settlements: canReadFinance ? settlements : [], cashReceipts: canReadFinance ? cashReceipts : [], standingAccounts: canReadFinance || canReadFieldFinance ? standingAccounts : [], users, currentUserId: session.appUserId || currentProfileId });
}
