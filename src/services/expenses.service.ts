import { dataStore } from '../lib/storage';
import { Expense, ExpenseStatus, ExpenseCategory } from '../types/domain';

export class ExpensesService {
  public static getAll(): Expense[] {
    return dataStore.getExpenses();
  }

  public static getByFundId(fundId: string): Expense[] {
    return dataStore.getExpenses().filter((e) => e.fundId === fundId);
  }

  public static create(data: Omit<Expense, 'id' | 'code' | 'taxAmount' | 'totalWithTax' | 'status' | 'submittedAt' | 'submittedBy'>): Expense {
    return dataStore.addExpense(data);
  }

  public static approve(id: string): void {
    dataStore.updateExpenseStatus(id, 'approved');
  }

  public static reject(id: string, reason: string): void {
    dataStore.updateExpenseStatus(id, 'rejected', reason);
  }

  public static getSummary() {
    const expenses = dataStore.getExpenses();
    const totalCount = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + e.totalWithTax, 0);
    const pendingCount = expenses.filter((e) => e.status === 'pending_approval').length;
    const pendingAmount = expenses
      .filter((e) => e.status === 'pending_approval')
      .reduce((sum, e) => sum + e.totalWithTax, 0);
    const approvedAmount = expenses
      .filter((e) => e.status === 'approved' || e.status === 'settled')
      .reduce((sum, e) => sum + e.totalWithTax, 0);

    const byCategory: Record<string, number> = {};
    expenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.totalWithTax;
    });

    return {
      totalCount,
      totalAmount,
      pendingCount,
      pendingAmount,
      approvedAmount,
      byCategory,
    };
  }
}
