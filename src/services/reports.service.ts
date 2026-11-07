import { dataStore } from '../lib/storage';
import { EXPENSE_CATEGORY_CONFIG } from '../lib/utils/format';

export class ReportsService {
  public static getDashboardMetrics() {
    const tasks = dataStore.getTasks();
    const funds = dataStore.getFunds();
    const expenses = dataStore.getExpenses();
    const settlements = dataStore.getSettlements();

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'approved').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress' || t.status === 'started').length;
    const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'approved').length;

    const totalAllocatedFunds = funds.reduce((sum, f) => sum + f.totalAllocation, 0);
    const totalRemainingFunds = funds.reduce((sum, f) => sum + f.currentBalance, 0);
    const totalSpentFunds = funds.reduce((sum, f) => sum + f.spentBalance, 0);
    const fundsWarningCount = funds.filter((f) => f.status === 'warning' || f.status === 'depleted').length;

    const totalExpensesAmount = expenses.reduce((sum, e) => sum + e.totalWithTax, 0);
    const pendingExpensesCount = expenses.filter((e) => e.status === 'pending_approval').length;
    const pendingExpensesAmount = expenses
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
    const expenses = dataStore.getExpenses();
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
    const expenses = dataStore.getExpenses();
    const headers = [
      'رمز المصروف',
      'العهدة النقدية',
      'المبلغ الأساسي (AED)',
      'ضريبة القيمة المضافة 5%',
      'الإجمالي شامل الضريبة',
      'التصنيف',
      'المورد / المحل',
      'رقم الفاتورة الضريبية',
      'حالة الاعتماد',
      'تاريخ الرفع',
      'المسؤول'
    ];

    const rows = expenses.map((e) => [
      e.code,
      `"${e.fundName}"`,
      e.amount,
      e.taxAmount,
      e.totalWithTax,
      EXPENSE_CATEGORY_CONFIG[e.category]?.label || e.category,
      `"${e.vendorName}"`,
      `"${e.invoiceNumber}"`,
      e.status,
      e.submittedAt,
      `"${e.submittedBy}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    return csvContent;
  }

  public static getTeamPerformance() {
    const users = dataStore.getUsers();
    const tasks = dataStore.getTasks();
    const expenses = dataStore.getExpenses();

    return users.map((user) => {
      const userTasks = tasks.filter((t) => t.assigneeId === user.id);
      const completedTasks = userTasks.filter((t) => t.status === 'completed' || t.status === 'approved').length;
      const userExpenses = expenses.filter((e) => e.submittedBy === user.name);
      const totalSpent = userExpenses.reduce((sum, e) => sum + e.totalWithTax, 0);
      const completionRate = userTasks.length > 0 ? Math.round((completedTasks / userTasks.length) * 100) : 100;

      return {
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        department: user.department,
        assignedTasks: userTasks.length,
        completedTasks,
        completionRate,
        totalSpent,
      };
    });
  }
}
