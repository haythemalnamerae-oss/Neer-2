import { dataStore } from '../lib/storage';
import { Expense } from '../types/domain';
import { FinanceApiService } from './finance-api.service';

export class ExpensesService {
  public static getAll(): Expense[] { return dataStore.getExpenses(); }
  public static getByFundId(fundId: string): Expense[] { return dataStore.getExpenses().filter((expense) => expense.fundId === fundId); }

  public static create(data: Omit<Expense, 'id' | 'code' | 'taxAmount' | 'totalWithTax' | 'status' | 'submittedAt' | 'submittedBy'>): Promise<Expense> {
    const taxAmount = Number((data.amount * (dataStore.getSettings().taxRate / 100)).toFixed(2));
    return FinanceApiService.createExpense({
      fundId: data.fundId, amount: data.amount, taxAmount, category: data.category, description: data.description,
      invoiceNumber: data.invoiceNumber, vendorName: data.vendorName, hasReceipt: data.hasReceipt,
      receiptUrl: data.receiptUrl, expenseDate: data.expenseDate, taskId: data.taskId,
      notes: data.notes, standingAccountId: data.standingAccountId,
    });
  }
  public static approve(id: string, notes?: string): Promise<Expense> { return FinanceApiService.reviewExpense(id, true, notes); }
  public static reject(id: string, reason: string): Promise<Expense> { return FinanceApiService.reviewExpense(id, false, reason); }

  public static getSummary() {
    const expenses = dataStore.getExpenses();
    const byCategory: Record<string, number> = {};
    expenses.forEach((expense) => { byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.totalWithTax; });
    return {
      totalCount: expenses.length,
      totalAmount: expenses.reduce((sum, expense) => sum + expense.totalWithTax, 0),
      pendingCount: expenses.filter((expense) => expense.status === 'pending_approval').length,
      pendingAmount: expenses.filter((expense) => expense.status === 'pending_approval').reduce((sum, expense) => sum + expense.totalWithTax, 0),
      approvedAmount: expenses.filter((expense) => expense.status === 'approved' || expense.status === 'settled').reduce((sum, expense) => sum + expense.totalWithTax, 0),
      byCategory,
    };
  }
}
