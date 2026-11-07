import { NeerApiClient, apiResources, type ApiContext } from './client';

/** Domain-facing repository modules keep UI code independent from transport details. */
export function createEngineApi(context: ApiContext) {
  const client = new NeerApiClient(context);
  const collection = <T>(resource: string) => ({
    list: (filters: Record<string, string | number | boolean> = {}) => client.list<T>(resource, filters),
    get: (id: string) => client.get<T>(resource, id),
    create: (record: Record<string, unknown>) => client.create<T>(resource, record),
    update: (id: string, patch: Record<string, unknown>) => client.update<T>(resource, id, patch),
    remove: (id: string) => client.delete(resource, id),
  });

  return {
    identity: { users: collection(apiResources.users), roles: collection(apiResources.roles), settings: collection(apiResources.settings) },
    operations: {
      tasks: collection(apiResources.tasks), checklist: collection(apiResources.checklist), steps: collection(apiResources.steps),
      subtasks: collection(apiResources.subtasks), updates: collection(apiResources.updates), history: collection(apiResources.history),
      attachments: collection(apiResources.attachments), comments: collection(apiResources.comments), followUps: collection(apiResources.followUps),
    },
    finance: {
      funds: collection(apiResources.funds), expenses: collection(apiResources.expenses), settlements: collection(apiResources.settlements),
      settlementExpenses: collection(apiResources.settlementExpenses), cashReceipts: collection(apiResources.cashReceipts), standingAccounts: collection(apiResources.standingAccounts),
    },
    collaboration: { notifications: collection(apiResources.notifications), auditLogs: collection(apiResources.auditLogs) },
    integrations: {
      /** Store connector state in your integration service; do not expose secrets in browser requests. */
      sendEvent: (provider: string, event: Record<string, unknown>, idempotencyKey: string) =>
        client.request('/integrations/events', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey, 'x-integration-provider': provider }, body: JSON.stringify(event) }),
      health: () => client.request<{ status: string; version: string }>('/integrations/health'),
    },
  };
}
