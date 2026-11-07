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
    const expenses = dataStore.getExpenses().filter((e) => e.fundId === data.fundId);
    const selectedExpenseIds = data.expenseIds || expenses.map((e) => e.id);
    const totalExpenses = data.totalExpenses ?? expenses
      .filter((e) => selectedExpenseIds.includes(e.id))
      .reduce((sum, e) => sum + e.totalWithTax, 0);
    const advanceAmount = data.advanceAmount ?? (fund ? fund.totalAllocation : 0);
    const remainingAmount = data.remainingAmount ?? (fund ? fund.currentBalance : Math.max(0, advanceAmount - totalExpenses));

    return dataStore.addSettlement({
      fundId: data.fundId,
      fundName: fund ? fund.name : 'العهدة النقدية',
      holderName: fund ? fund.holderName : 'المسؤول الميداني',
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      advanceAmount,
      totalExpenses,
      remainingAmount,
      expenseIds: selectedExpenseIds,
      expensesCount: selectedExpenseIds.length,
      auditNotes: data.auditNotes || data.notes || '',
    });
  }

  public static approve(id: string, auditNotes?: string): void {
    dataStore.approveSettlement(id, auditNotes);
  }

  public static finalize(id: string): void {
    dataStore.approveSettlement(id, 'تم الإغلاق النهائي للأرشفة وتصفية الرصيد');
  }

  public static getSummary() {
    const settlements = dataStore.getSettlements();
    const totalSettledAmount = settlements
      .filter((s) => s.status === 'approved' || s.status === 'closed')
      .reduce((sum, s) => sum + s.totalExpenses, 0);
    const underReviewCount = settlements.filter((s) => s.status === 'under_review' || s.status === 'draft').length;

    return {
      totalCount: settlements.length,
      totalSettledAmount,
      underReviewCount,
    };
  }
}
