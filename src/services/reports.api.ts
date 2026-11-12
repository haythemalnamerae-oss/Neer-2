import { apiRequest, getSession } from '../lib/api/session';

export type ServerReportSummary = {
  source: 'supabase';
  generatedAt: string;
  tasks: { totalTasks: number; completedTasks: number; inProgressTasks: number; urgentTasks: number; taskCompletionRate: number };
  finance: null | {
    currency: string; totalAllocatedFunds: number; totalRemainingFunds: number; totalSpentFunds: number;
    fundsWarningCount: number; totalExpensesAmount: number; pendingExpensesCount: number;
    pendingExpensesAmount: number; totalSupplierPayables: number; totalReceivables: number;
    activeStandingAccountsCount: number; settlementsCount: number;
  };
  teamPerformance: Array<{ userId: string; name: string; department: string; assignedTasks: number; completedTasks: number; inProgressTasks: number; completionRate: number; actualWorkHours: number; onTimeRate: number }>;
  pagination: { strategy: string; pageSize: number; cappedAt: number };
};

export async function getServerReportSummary(): Promise<ServerReportSummary> {
  const session = getSession();
  if (!session) throw new Error('انتهت الجلسة. سجّل الدخول مجددًا.');
  return apiRequest<ServerReportSummary>(session, '/reports/summary');
}
