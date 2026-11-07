import { dataStore } from '../lib/storage';
import { PettyCashFund } from '../types/domain';

export class FundsService {
  public static getAll(): PettyCashFund[] {
    return dataStore.getFunds();
  }

  public static getById(id: string): PettyCashFund | undefined {
    return dataStore.getFundById(id);
  }

  public static create(data: Omit<PettyCashFund, 'id' | 'code' | 'spentBalance' | 'currentBalance' | 'status' | 'lastReplenishedDate'>): PettyCashFund {
    return dataStore.addFund(data);
  }

  public static replenish(fundId: string, amount: number, notes?: string): void {
    dataStore.replenishFund(fundId, amount, notes);
  }

  public static getSummary() {
    const funds = dataStore.getFunds();
    const totalAllocated = funds.reduce((sum, f) => sum + f.totalAllocation, 0);
    const totalCurrentBalance = funds.reduce((sum, f) => sum + f.currentBalance, 0);
    const totalSpent = funds.reduce((sum, f) => sum + f.spentBalance, 0);
    const warningCount = funds.filter((f) => f.status === 'warning' || f.status === 'depleted').length;

    return {
      totalAllocated,
      totalCurrentBalance,
      totalSpent,
      warningCount,
      count: funds.length,
    };
  }
}
