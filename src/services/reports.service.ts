import { dataStore } from '../lib/storage';
import { EXPENSE_CATEGORY_CONFIG } from '../lib/utils/format';
import { hasPermission } from '../lib/rbac/permissions';

const toCsvCell = (value: unknown): string => {
  const raw = String(value ?? '');
  const safe = typeof value === 'string' && /^\s*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
};

export class ReportsService {
  public static getDashboardMetrics() {
    const tasks = dataStore.getTasks();
    const funds = dataStore.getFunds();
    const expenses = dataStore.getExpenses();
    const settlements = dataStore.getSettlements();
    const currency = dataStore.getSettings().currency;
    const currencyFundIds = new Set(funds.filter((fund) => fund.currency === currency).map((fund) => fund.id));
    const currencyExpenses = expenses.filter((expense) => currencyFundIds.has(expense.fundId));
    const currencyFunds = funds.filter((fund) => fund.currency === currency);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'approved').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'started').length;
    const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'approved').length;

    const totalAllocatedFunds = currencyFunds.reduce((sum, f) => sum + f.totalAllocation, 0);
    const totalRemainingFunds = currencyFunds.reduce((sum, f) => sum + f.currentBalance, 0);
    const totalSpentFunds = currencyFunds.reduce((sum, f) => sum + f.spentBalance, 0);
    const fundsWarningCount = currencyFunds.filter((f) => f.status === 'warning' || f.status === 'depleted').length;

    const totalExpensesAmount = currencyExpenses.filter((expense) => expense.status !== 'rejected').reduce((sum, expense) => sum + expense.totalWithTax, 0);
    const pendingExpensesCount = currencyExpenses.filter((e) => e.status === 'pending_approval').length;
    const pendingExpensesAmount = currencyExpenses
      .filter((e) => e.status === 'pending_approval')
      .reduce((sum, e) => sum + e.totalWithTax, 0);

    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const fundLiquidityRate = totalAllocatedFunds > 0 ? Math.round((totalRemainingFunds / totalAllocatedFunds) * 100) : 0;

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      urgentTasks,
      taskCompletionRate,
      totalAllocatedFunds,
      totalRemainingFunds,
      totalSpentFunds,
      fundLiquidityRate,
      fundsWarningCount,
      totalExpensesAmount,
      pendingExpensesCount,
      pendingExpensesAmount,
      settlementsCount: settlements.length,
    };
  }

  public static getExpenseCategoryBreakdown() {
    const currency = dataStore.getSettings().currency;
    const funds = new Map(dataStore.getFunds().map((fund) => [fund.id, fund]));
    const expenses = dataStore.getExpenses().filter((expense) => expense.status !== 'rejected' && funds.get(expense.fundId)?.currency === currency);
    const totals: Record<string, { label: string; amount: number; count: number }> = {};

    expenses.forEach((exp) => {
      const catKey = exp.category;
      const catConfig = EXPENSE_CATEGORY_CONFIG[catKey] || { label: catKey };
      if (!totals[catKey]) {
        totals[catKey] = { label: catConfig.label, amount: 0, count: 0 };
      }
      totals[catKey].amount += exp.totalWithTax;
      totals[catKey].count += 1;
    });

    return Object.entries(totals).map(([key, val]) => ({
      category: key,
      label: val.label,
      amount: val.amount,
      count: val.count,
    }));
  }

  public static exportExpensesToCSV(): string {
    const currentUser = dataStore.getCurrentUser();
    if (!hasPermission(currentUser.role, 'reports', 'create')) throw new Error('لا تملك صلاحية تصدير التقارير المالية.');
    const expenses = dataStore.getExpenses();
    const settings = dataStore.getSettings();
    const headers = [
      'رمز المصروف',
      'العهدة النقدية',
      'المبلغ الأساسي',
      `ضريبة القيمة المضافة (${settings.taxRate}%)`,
      'الإجمالي شامل الضريبة',
      'العملة',
      'التصنيف',
      'المورد / المحل',
      'رقم الفاتورة الضريبية',
      'حالة الاعتماد',
      'يتطلب تدقيقاً خاصاً',
      'ملاحظة التدقيق',
      'تاريخ الرفع',
      'المسؤول'
    ];

    const rows = expenses.map((e) => [
      e.code,
      e.fundName,
      e.amount,
      e.taxAmount,
      e.totalWithTax,
      dataStore.getFundById(e.fundId)?.currency || settings.currency,
      EXPENSE_CATEGORY_CONFIG[e.category]?.label || e.category,
      e.vendorName,
      e.invoiceNumber,
      e.status,
      e.specialAuditRequired ? 'نعم' : 'لا',
      e.approvalNotes || '',
      e.submittedAt,
      e.submittedBy,
    ]);

    const csvContent = '\uFEFF' + [headers.map(toCsvCell).join(','), ...rows.map((row) => row.map(toCsvCell).join(','))].join('\n');
    return csvContent;
  }

  public static getTeamPerformance() {
    const users = dataStore.getUsers();
    const tasks = dataStore.getTasks();
    const expenses = dataStore.getExpenses();

    return users
      .map((user) => {
        const userTasks = tasks.filter((t) => t.assigneeId === user.id);
        const completedTasks = userTasks.filter((t) => t.status === 'completed' || t.status === 'approved').length;
        const inProgressTasks = userTasks.filter((t) => t.status === 'in_progress').length;
        const userExpenses = expenses.filter((e) => e.submittedBy === user.name && e.status !== 'rejected');
        const totalSpent = userExpenses.reduce((sum, e) => sum + e.totalWithTax, 0);
        const completionRate = userTasks.length > 0 ? Math.round((completedTasks / userTasks.length) * 100) : 100;

        // Calculate actual worked hours from logged start and end times
        let actualWorkMinutes = 0;
        let onTimeCount = 0;

        userTasks.forEach((t) => {
          if (t.actualStartTime) {
            const start = new Date(t.actualStartTime).getTime();
            const end = t.actualEndTime ? new Date(t.actualEndTime).getTime() : Date.now();
            if (!isNaN(start) && !isNaN(end) && end > start) {
              actualWorkMinutes += Math.min(24 * 60, Math.round((end - start) / 60000));
            }
          }
          if ((t.status === 'completed' || t.status === 'approved') && t.actualEndTime && t.dueDate) {
            const endDay = t.actualEndTime.split('T')[0];
            if (endDay <= t.dueDate) {
              onTimeCount++;
            }
          }
        });

        const actualWorkHours = Number((actualWorkMinutes / 60).toFixed(1));
        const onTimeRate = completedTasks > 0 ? Math.round((onTimeCount / completedTasks) * 100) : 100;

        return {
          userId: user.id,
          name: user.name,
          avatar: user.avatar,
          department: user.department,
          assignedTasks: userTasks.length,
          completedTasks,
          inProgressTasks,
          completionRate,
          actualWorkHours,
          onTimeRate,
          totalSpent,
        };
      })
      .sort((a, b) => b.completedTasks - a.completedTasks || b.actualWorkHours - a.actualWorkHours);
  }

  public static getCustodyTrackingReport() {
    const funds = dataStore.getFunds();
    const expenses = dataStore.getExpenses();
    const receipts = dataStore.getCashReceipts();

    return funds.map((f) => {
      const allFundExpenses = expenses.filter((expense) => expense.fundId === f.id);
      const fundExpenses = allFundExpenses.filter((expense) => expense.status !== 'rejected');
      const rejectedExpenses = allFundExpenses.filter((expense) => expense.status === 'rejected');
      const fundReceipts = receipts.filter((receipt) => receipt.fundId === f.id);
      const cascadeExpenses = expenses.filter((expense) => expense.cascadeSplit?.secondaryFundId === f.id && expense.status !== 'rejected');
      const openDeficitExpenses = fundExpenses.filter((e) => e.isDeficit && !e.isCoveredFromCash);

      return {
        fund: f,
        expensesCount: fundExpenses.length,
        rejectedExpensesCount: rejectedExpenses.length,
        rejectedExpenses,
        totalExpenses: fundExpenses.reduce((sum, expense) => sum + expense.totalWithTax, 0),
        receiptsCount: fundReceipts.length,
        totalReceipts: fundReceipts.reduce((sum, r) => sum + r.amount, 0),
        fundExpenses,
        fundReceipts,
        cascadeExpenses,
        openDeficitExpenses,
      };
    });
  }
}
