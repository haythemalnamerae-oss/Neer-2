import { dataStore } from '../lib/storage';
import { PettyCashFund } from '../types/domain';
import { FinanceApiService } from './finance-api.service';

export class FundsService {
  public static getAll(): PettyCashFund[] { return dataStore.getFunds(); }
  public static getById(id: string): PettyCashFund | undefined { return dataStore.getFundById(id); }
  public static create(data: Omit<PettyCashFund, 'id' | 'code' | 'spentBalance' | 'currentBalance' | 'status' | 'lastReplenishedDate'>): Promise<PettyCashFund> {
    return FinanceApiService.createFund({ name: data.name, holderId: data.holderId, totalAllocation: data.totalAllocation, currency: data.currency, warningThreshold: data.warningThreshold, purpose: data.purpose, notes: data.notes });
  }
  public static replenish(fundId: string, amount: number, notes?: string): Promise<unknown> { return FinanceApiService.replenishFund(fundId, amount, notes); }
  public static getSummary() {
    const funds = dataStore.getFunds();
    return {
      totalAllocated: funds.reduce((sum, fund) => sum + fund.totalAllocation, 0),
      totalCurrentBalance: funds.reduce((sum, fund) => sum + fund.currentBalance, 0),
      totalSpent: funds.reduce((sum, fund) => sum + fund.spentBalance, 0),
      warningCount: funds.filter((fund) => fund.status === 'warning' || fund.status === 'depleted').length,
      count: funds.length,
    };
  }
}
