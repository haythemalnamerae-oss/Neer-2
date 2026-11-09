import { dataStore } from '../lib/storage';
import { Settlement } from '../types/domain';
import { FinanceApiService } from './finance-api.service';

export interface CreateSettlementPayload {
  fundId: string; periodStart: string; periodEnd: string; auditNotes?: string; notes?: string; expenseIds?: string[];
}
export class SettlementsService {
  public static getAll(): Settlement[] { return dataStore.getSettlements(); }
  public static getById(id: string): Settlement | undefined { return dataStore.getSettlements().find((settlement) => settlement.id === id); }
  public static create(data: CreateSettlementPayload): Promise<Settlement> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(data.periodEnd) || data.periodStart > data.periodEnd) {
      throw new Error('حدد فترة تسوية صحيحة.');
    }
    const fund = dataStore.getFundById(data.fundId);
    if (!fund) throw new Error('العهدة المحددة غير موجودة.');
    const selected = data.expenseIds?.length ? data.expenseIds : dataStore.getExpenses()
      .filter((expense) => expense.fundId === data.fundId && expense.status === 'approved')
      .filter((expense) => (expense.expenseDate || expense.submittedAt.slice(0,10)) >= data.periodStart && (expense.expenseDate || expense.submittedAt.slice(0,10)) <= data.periodEnd)
      .map((expense) => expense.id);
    return FinanceApiService.createSettlement(data.fundId, data.periodStart, data.periodEnd, selected);
  }
  public static approve(id: string, notes?: string): Promise<Settlement> {
    const settlement = this.getById(id);
    return FinanceApiService.reviewSettlement(id, settlement?.status === 'under_review' && dataStore.getSettings().requireDualApprovalForSettlements ? 'audit' : 'approve', notes);
  }
  public static reject(id: string, reason: string): Promise<Settlement> { return FinanceApiService.reviewSettlement(id, 'reject', reason); }
  public static finalize(id: string): Promise<Settlement> { return FinanceApiService.reviewSettlement(id, 'approve', 'تم الإغلاق النهائي للأرشفة وتصفية الرصيد'); }
  public static getSummary() {
    const settlements = dataStore.getSettlements();
    return {
      totalCount: settlements.length,
      totalSettledAmount: settlements.filter((settlement) => settlement.status === 'approved' || settlement.status === 'closed').reduce((sum, settlement) => sum + settlement.totalExpenses, 0),
      underReviewCount: settlements.filter((settlement) => settlement.status === 'under_review' || settlement.status === 'audited').length,
    };
  }
}
