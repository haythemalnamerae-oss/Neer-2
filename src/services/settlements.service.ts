import { dataStore } from '../lib/storage';
import { Settlement } from '../types/domain';

export interface CreateSettlementPayload {
  fundId: string;
  periodStart: string;
  periodEnd: string;
  auditNotes?: string;
  notes?: string;
  expenseIds?: string[];
  advanceAmount?: number;
  totalExpenses?: number;
  remainingAmount?: number;
}

export class SettlementsService {
  public static getAll(): Settlement[] {
    return dataStore.getSettlements();
  }

  public static getById(id: string): Settlement | undefined {
    return dataStore.getSettlements().find((s) => s.id === id);
  }

  public static create(data: CreateSettlementPayload): Settlement {
    const fund = dataStore.getFundById(data.fundId);
    if (!fund) throw new Error('العهدة المحددة غير موجودة.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(data.periodEnd) || data.periodStart > data.periodEnd) {
      throw new Error('حدد فترة تسوية صحيحة.');
    }
    const activeSettlementIds = new Set(
      dataStore.getSettlements()
        .filter((settlement) => settlement.status !== 'rejected')
        .flatMap((settlement) => settlement.expenseIds)
    );
    const eligibleExpenses = dataStore.getExpenses().filter((expense) =>
      expense.fundId === data.fundId &&
      expense.status === 'approved' &&
      (expense.expenseDate || expense.submittedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '') >= data.periodStart &&
      (expense.expenseDate || expense.submittedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '') <= data.periodEnd &&
      !activeSettlementIds.has(expense.id)
    );
    const selectedExpenseIds = data.expenseIds?.length
      ? data.expenseIds
      : eligibleExpenses.map((expense) => expense.id);
    const selected = selectedExpenseIds.map((id) => eligibleExpenses.find((expense) => expense.id === id));
    if (!selected.length || selected.some((expense) => !expense)) {
      throw new Error('لا توجد فواتير معتمدة وغير مسواة ضمن الفترة المحددة، أو أن بعض الفواتير محجوزة في تسوية أخرى.');
    }
    const totalExpenses = selected.reduce((sum, expense) => sum + (expense?.totalWithTax || 0), 0);

    return dataStore.addSettlement({
      fundId: data.fundId,
      fundName: fund.name,
      holderName: fund.holderName,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      advanceAmount: fund.totalAllocation,
      totalExpenses,
      remainingAmount: fund.currentBalance,
      expenseIds: selectedExpenseIds,
      expensesCount: selectedExpenseIds.length,
      auditNotes: data.auditNotes || data.notes || '',
    });
  }

  public static approve(id: string, auditNotes?: string): void {
    dataStore.approveSettlement(id, auditNotes);
  }

  public static reject(id: string, reason: string): void {
    dataStore.rejectSettlement(id, reason);
  }

  public static finalize(id: string): void {
    dataStore.approveSettlement(id, 'تم الإغلاق النهائي للأرشفة وتصفية الرصيد');
  }

  public static getSummary() {
    const settlements = dataStore.getSettlements();
    const totalSettledAmount = settlements
      .filter((s) => s.status === 'approved' || s.status === 'closed')
      .reduce((sum, s) => sum + s.totalExpenses, 0);
    const underReviewCount = settlements.filter((s) => s.status === 'under_review' || s.status === 'audited').length;

    return {
      totalCount: settlements.length,
      totalSettledAmount,
      underReviewCount,
    };
  }
}
