const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

export type ApiError = { error: { code: string; message?: string; details?: unknown } };

export class NeerApiError extends Error {
  constructor(public readonly status: number, public readonly payload: ApiError | unknown) {
    const message = (payload as ApiError)?.error?.message || `API request failed (${status}).`;
    super(message);
    this.name = 'NeerApiError';
  }
}

export type ApiContext = {
  accessToken: string;
  organizationId: string;
};

/** Typed REST client. Pass the current Supabase Auth access token; never a service-role key. */
export class NeerApiClient {
  constructor(private readonly context: ApiContext, private readonly baseUrl = API_BASE_URL) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.context.accessToken}`,
        'x-organization-id': this.context.organizationId,
        ...init.headers,
      },
    });
    if (!response.ok) {
      let payload: unknown;
      try { payload = await response.json(); } catch { payload = await response.text(); }
      throw new NeerApiError(response.status, payload);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  list<T>(resource: string, filters: Record<string, string | number | boolean> = {}) {
    const query = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
    return this.request<T[]>(`${resource}${query.size ? `?${query}` : ''}`);
  }

  get<T>(resource: string, id: string) {
    return this.request<T[]>(`${resource}/${encodeURIComponent(id)}`).then((rows) => rows[0]);
  }

  create<T>(resource: string, value: Record<string, unknown>) {
    return this.request<T>(resource, { method: 'POST', body: JSON.stringify(value) });
  }

  update<T>(resource: string, id: string, patch: Record<string, unknown>) {
    return this.request<T[]>(`${resource}/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }).then((rows) => rows[0]);
  }

  delete(resource: string, id: string) {
    return this.request<void>(`${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

export const apiResources = {
  tasks: 'tasks', checklist: 'task-checklist', steps: 'task-steps', subtasks: 'task-subtasks',
  updates: 'task-updates', history: 'task-history', attachments: 'task-attachments', comments: 'task-comments',
  funds: 'funds', expenses: 'expenses', settlements: 'settlements', settlementExpenses: 'settlement-expenses',
  cashReceipts: 'cash-receipts', standingAccounts: 'standing-accounts', followUps: 'follow-ups',
  notifications: 'notifications', auditLogs: 'audit-logs', users: 'users', roles: 'roles', settings: 'settings',
} as const;
