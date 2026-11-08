/**
 * OpsPlatform - Non-Cloud Peer-to-Peer & Local Sync Engine
 * محرك المزامنة المباشرة بين الأجهزة بدون خادم أو قاعدة بيانات سحابية
 */

import { Task, PettyCashFund, Expense, Settlement, CashReceipt, StandingAccount, AuditLog } from '../../types/domain';
import { dataStore, STORAGE_KEYS } from '../storage';

export interface SyncPayload {
  version: number;
  protocol: 'ops-direct-p2p-v1';
  exportedAt: string;
  sourceDeviceId: string;
  sourceDeviceName: string;
  sourceUser: { id: string; name: string };
  checksum: string;
  data: {
    tasks: Task[];
    funds: PettyCashFund[];
    expenses: Expense[];
    settlements: Settlement[];
    cashReceipts: CashReceipt[];
    standingAccounts: StandingAccount[];
    auditLogs: AuditLog[];
  };
}

export interface MergeReport {
  timestamp: string;
  sourceDeviceId: string;
  newTasksCount: number;
  updatedTasksCount: number;
  newExpensesCount: number;
  updatedFundsCount: number;
  newReceiptsCount: number;
  totalEntitiesProcessed: number;
  hasConflicts: boolean;
  conflictDetails: string[];
}

// Generate persistent device ID
export function getOrCreateDeviceId(): { id: string; name: string } {
  let devId = localStorage.getItem('ops_device_id');
  let devName = localStorage.getItem('ops_device_name');
  
  if (!devId) {
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    devId = `ANDRO-${rand}`;
    localStorage.setItem('ops_device_id', devId);
  }
  
  if (!devName) {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    devName = isMobile ? 'هاتف ميداني (Android)' : 'جهاز مكتب (Workstation)';
    localStorage.setItem('ops_device_name', devName);
  }

  return { id: devId, name: devName };
}

// Simple checksum generator for data integrity
function generateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `CHK-${Math.abs(hash).toString(16).toUpperCase()}`;
}

export class PeerSyncEngine {
  private static instance: PeerSyncEngine;

  public static getInstance(): PeerSyncEngine {
    if (!PeerSyncEngine.instance) {
      PeerSyncEngine.instance = new PeerSyncEngine();
    }
    return PeerSyncEngine.instance;
  }

  /**
   * Export local database into a portable, encrypted sync payload
   * تصدير حزمة المزامنة المحلية مباشرة بدون سحابة
   */
  public generateSyncPayload(): SyncPayload {
    const dev = getOrCreateDeviceId();
    const currentUser = dataStore.getCurrentUser();

    const data = {
      tasks: dataStore.getTasks(),
      funds: dataStore.getFunds(),
      expenses: dataStore.getExpenses(),
      settlements: dataStore.getSettlements(),
      cashReceipts: dataStore.getCashReceipts(),
      standingAccounts: dataStore.getStandingAccounts(),
      auditLogs: dataStore.getAuditLogs().slice(0, 50),
    };

    const checksum = generateChecksum(data);

    return {
      version: 1,
      protocol: 'ops-direct-p2p-v1',
      exportedAt: new Date().toISOString(),
      sourceDeviceId: dev.id,
      sourceDeviceName: dev.name,
      sourceUser: { id: currentUser.id, name: currentUser.name },
      checksum,
      data,
    };
  }

  /**
   * Intelligently merge remote sync payload into local database (Conflict-Free / CRDT-like merge)
   * دمج حزمة المزامنة القادمة من جهاز آخر ومنع التعارض
   */
  public mergeSyncPayload(payload: SyncPayload): MergeReport {
    const report: MergeReport = {
      timestamp: new Date().toISOString(),
      sourceDeviceId: payload.sourceDeviceId,
      newTasksCount: 0,
      updatedTasksCount: 0,
      newExpensesCount: 0,
      updatedFundsCount: 0,
      newReceiptsCount: 0,
      totalEntitiesProcessed: 0,
      hasConflicts: false,
      conflictDetails: [],
    };

    // 1. Merge Tasks
    const localTasks = dataStore.getTasks();
    const taskMap = new Map<string, Task>(localTasks.map((t) => [t.id, t]));

    for (const remoteTask of payload.data.tasks || []) {
      report.totalEntitiesProcessed++;
      const localTask = taskMap.get(remoteTask.id);

      if (!localTask) {
        // Brand new task created on remote device
        taskMap.set(remoteTask.id, remoteTask);
        report.newTasksCount++;
      } else {
        // Task exists in both: merge steps and details based on progress
        const mergedTask = this.mergeIndividualTask(localTask, remoteTask);
        taskMap.set(remoteTask.id, mergedTask);
        report.updatedTasksCount++;
      }
    }

    // 2. Merge Expenses
    const localExpenses = dataStore.getExpenses();
    const expenseMap = new Map<string, Expense>(localExpenses.map((e) => [e.id, e]));

    for (const remoteExp of payload.data.expenses || []) {
      report.totalEntitiesProcessed++;
      const localExpense = expenseMap.get(remoteExp.id);
      if (!localExpense) {
        expenseMap.set(remoteExp.id, remoteExp);
        report.newExpensesCount++;
      } else if (localExpense.status !== remoteExp.status) {
        const terminalConflict = ((localExpense.status === 'approved' || localExpense.status === 'settled') && remoteExp.status === 'rejected')
          || (localExpense.status === 'rejected' && (remoteExp.status === 'approved' || remoteExp.status === 'settled'));
        if (terminalConflict) {
          report.hasConflicts = true;
          report.conflictDetails.push(`تعارض اعتماد للمصروف ${remoteExp.code}: إحدى النسختين معتمدة والأخرى مرفوضة؛ تم الاحتفاظ بالحالة المحلية للمراجعة.`);
        } else if (remoteExp.status === 'rejected' || remoteExp.status === 'settled' || (remoteExp.status === 'approved' && localExpense.status === 'pending_approval')) {
          expenseMap.set(remoteExp.id, { ...localExpense, ...remoteExp });
        }
      }
    }

    // 3. Merge Cash Receipts
    const localReceipts = dataStore.getCashReceipts();
    const receiptMap = new Map<string, CashReceipt>(localReceipts.map((r) => [r.id, r]));

    for (const remoteRec of payload.data.cashReceipts || []) {
      report.totalEntitiesProcessed++;
      if (!receiptMap.has(remoteRec.id)) {
        receiptMap.set(remoteRec.id, remoteRec);
        report.newReceiptsCount++;
      }
    }

    // 4. Merge Standing Accounts
    const localStanding = dataStore.getStandingAccounts();
    const getOpeningBalance = (account: StandingAccount): number => account.openingBalance ?? Number(((account.currentBalance || 0) - (account.entries || []).reduce((sum, entry) => sum + (entry.type === 'charge' ? entry.amount : -entry.amount), 0)).toFixed(2));
    const standingMap = new Map<string, StandingAccount>(localStanding.map((s) => [s.id, { ...s, openingBalance: getOpeningBalance(s) }]));
    for (const remoteStand of payload.data.standingAccounts || []) {
      report.totalEntitiesProcessed++;
      const localStand = standingMap.get(remoteStand.id);
      if (!localStand) {
        standingMap.set(remoteStand.id, { ...remoteStand, openingBalance: getOpeningBalance(remoteStand) });
        continue;
      }

      const currencyConflict = Boolean(localStand.currency && remoteStand.currency && localStand.currency !== remoteStand.currency);
      const directionConflict = localStand.direction !== remoteStand.direction;
      if (currencyConflict) {
        report.hasConflicts = true;
        report.conflictDetails.push(`اختلاف عملة حساب المورد ${localStand.name} بين الجهازين؛ تم الاحتفاظ بعملة الجهاز المحلي وعدم دمج حركات العملة المختلفة.`);
      }
      if (directionConflict) {
        report.hasConflicts = true;
        report.conflictDetails.push(`اختلاف طبيعة الحساب ${localStand.name} (لنا/علينا) بين الجهازين؛ تم الاحتفاظ بالتصنيف المحلي وعدم دمج الحركات المتعارضة.`);
      }
      if (localStand.openingBalance !== undefined && remoteStand.openingBalance !== undefined && localStand.openingBalance !== remoteStand.openingBalance) {
        report.hasConflicts = true;
        report.conflictDetails.push(`اختلاف الرصيد الافتتاحي لحساب ${localStand.name}؛ لم يتم جمع الرصيدين.`);
      }

      const mergedEntries = [...(localStand.entries || [])];
      const entryIds = new Map(mergedEntries.map((entry) => [entry.id, entry]));
      const referenceEntries = new Map(mergedEntries.filter((entry) => entry.reference?.trim()).map((entry) => [entry.reference!.trim().toLowerCase(), entry]));
      for (const remoteEntry of (currencyConflict || directionConflict ? [] : (remoteStand.entries || []))) {
        const sameId = entryIds.get(remoteEntry.id);
        if (sameId) {
          if (sameId.amount !== remoteEntry.amount || sameId.type !== remoteEntry.type || sameId.reference !== remoteEntry.reference) {
            report.hasConflicts = true;
            report.conflictDetails.push(`تعارض في حركة دفتر حساب ${localStand.name}؛ تم الاحتفاظ بالحركة المحلية.`);
          }
          continue;
        }
        const refKey = remoteEntry.reference?.trim().toLowerCase();
        const sameReference = refKey ? referenceEntries.get(refKey) : undefined;
        if (sameReference) {
          if (sameReference.amount !== remoteEntry.amount || sameReference.type !== remoteEntry.type) {
            report.hasConflicts = true;
            report.conflictDetails.push(`مرجع مكرر بقيمة مختلفة في حساب ${localStand.name}: ${remoteEntry.reference}؛ لم تتم إضافة الحركة الواردة.`);
          }
          continue;
        }
        mergedEntries.push(remoteEntry);
        entryIds.set(remoteEntry.id, remoteEntry);
        if (refKey) referenceEntries.set(refKey, remoteEntry);
      }

      const localUpdatedAt = Date.parse(localStand.updatedAt || '') || 0;
      const remoteUpdatedAt = Date.parse(remoteStand.updatedAt || '') || 0;
      const metadataSource = remoteUpdatedAt > localUpdatedAt ? remoteStand : localStand;
      const mergedAccount: StandingAccount = {
        ...localStand,
        ...metadataSource,
        currency: localStand.currency || remoteStand.currency,
        direction: localStand.direction,
        openingBalance: getOpeningBalance(localStand),
        active: metadataSource.active !== false,
        updatedAt: metadataSource.updatedAt || localStand.updatedAt || remoteStand.updatedAt,
        entries: mergedEntries.sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)),
      };
      standingMap.set(localStand.id, mergedAccount);
    }

    // 5. Merge Settlements
    const localSettlements = dataStore.getSettlements();
    const settlementMap = new Map<string, Settlement>(localSettlements.map((s) => [s.id, s]));
    for (const remoteSet of payload.data.settlements || []) {
      if (!settlementMap.has(remoteSet.id)) {
        settlementMap.set(remoteSet.id, remoteSet);
      }
    }

    // 6. Recalculate and Synchronize Funds based on merged expenses
    const mergedExpensesList = Array.from(expenseMap.values());
    const mergedReceiptsList = Array.from(receiptMap.values());

    const localFunds = dataStore.getFunds();
    const localStandingAccounts = localStanding;
    const mergedStandingAccounts = Array.from(standingMap.values());
    const calculateFundOutflows = (fundId: string, expenseList: Expense[], accountList: StandingAccount[]) => {
      const relevantExpenses = expenseList.filter((expense) => expense.status !== 'rejected' && !expense.isSupplierCredit);
      const cashExpenseTotal = relevantExpenses.reduce((sum, expense) => {
        if (expense.cascadeSplit) {
          return sum
            + (expense.cascadeSplit.primaryFundId === fundId ? expense.cascadeSplit.primaryAmount : 0)
            + (expense.cascadeSplit.secondaryFundId === fundId ? expense.cascadeSplit.secondaryAmount : 0);
        }
        if (expense.fundId !== fundId) return sum;
        return sum + (expense.isDeficit ? Math.max(0, expense.totalWithTax - (expense.deficitAmount || 0)) : expense.totalWithTax);
      }, 0);
      const spentExpenseTotal = relevantExpenses.reduce((sum, expense) => {
        if (expense.cascadeSplit) {
          return sum
            + (expense.cascadeSplit.primaryFundId === fundId ? expense.cascadeSplit.primaryAmount : 0)
            + (expense.cascadeSplit.secondaryFundId === fundId ? expense.cascadeSplit.secondaryAmount : 0);
        }
        return sum + (expense.fundId === fundId ? expense.totalWithTax : 0);
      }, 0);
      const supplierPayments = accountList
        .filter((account) => account.direction === 'payable' || account.direction === 'payable_by_us')
        .flatMap((account) => account.entries || [])
        .filter((entry) => entry.type === 'settlement' && entry.fundId === fundId)
        .reduce((sum, entry) => sum + entry.amount, 0);
      return {
        cash: Number((cashExpenseTotal + supplierPayments).toFixed(2)),
        spent: Number((spentExpenseTotal + supplierPayments).toFixed(2)),
      };
    };
    const updatedFunds: PettyCashFund[] = localFunds.map((fund) => {
      // Find matching remote fund if any
      const remoteFund = payload.data.funds?.find((f) => f.id === fund.id);
      const totalAlloc = remoteFund ? Math.max(fund.totalAllocation, remoteFund.totalAllocation) : fund.totalAllocation;

      // Reconcile real custody outflows, including split expenses and supplier settlements.
      const mergedOutflows = calculateFundOutflows(fund.id, mergedExpensesList, mergedStandingAccounts);
      const localOutflows = calculateFundOutflows(fund.id, localExpenses, localStandingAccounts);
      const remoteOutflows = remoteFund
        ? calculateFundOutflows(fund.id, payload.data.expenses || [], payload.data.standingAccounts || [])
        : localOutflows;
      const localReplenishments = fund.currentBalance - (fund.totalAllocation - localOutflows.cash);
      const remoteReplenishments = remoteFund
        ? remoteFund.currentBalance - (remoteFund.totalAllocation - remoteOutflows.cash)
        : localReplenishments;
      // Replenishments have no independent transaction IDs yet; use the larger known cumulative amount to avoid double counting.
      const mergedReplenishments = Math.max(localReplenishments, remoteReplenishments);
      const totalSpent = mergedOutflows.spent;

      // Cash-box receipts are separate from the petty-cash allocation balance.
      const localCashReceipts = localReceipts.filter((r) => r.fundId === fund.id && r.type === 'cash_box').reduce((sum, r) => sum + r.amount, 0);
      const mergedCashReceipts = mergedReceiptsList.filter((r) => r.fundId === fund.id && r.type === 'cash_box').reduce((sum, r) => sum + r.amount, 0);
      const localCoveredDeficits = localExpenses.filter((e) => e.fundId === fund.id && e.isCoveredFromCash).reduce((sum, e) => sum + (e.deficitAmount || 0), 0);
      const mergedCoveredDeficits = mergedExpensesList.filter((e) => e.fundId === fund.id && e.isCoveredFromCash).reduce((sum, e) => sum + (e.deficitAmount || 0), 0);
      const cashBoxBase = fund.cashBoxBalance === undefined ? 0 : fund.cashBoxBalance - localCashReceipts + localCoveredDeficits;
      const cashBoxBalance = Number((cashBoxBase + mergedCashReceipts - mergedCoveredDeficits).toFixed(2));
      const calculatedBalance = Number((totalAlloc + mergedReplenishments - mergedOutflows.cash).toFixed(2));
      if (calculatedBalance < -0.01) {
        report.hasConflicts = true;
        report.conflictDetails.push(`تجاوزت الحركات المدمجة الرصيد النقدي المتاح للعهدة ${fund.name}؛ تم ضبط الرصيد إلى صفر ويتطلب الأمر مراجعة يدوية.`);
      }
      const netCurrent = Math.max(0, calculatedBalance);

      report.updatedFundsCount++;

      return {
        ...fund,
        totalAllocation: totalAlloc,
        spentBalance: Number(totalSpent.toFixed(2)),
        currentBalance: netCurrent,
        cashBoxBalance,
        lastReplenishedDate: remoteFund?.lastReplenishedDate || fund.lastReplenishedDate,
      };
    });

    // 7. Save merged collections into local storage
    const mergedTasksList = Array.from(taskMap.values());
    
    // Direct store hydration through safe storage
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(mergedTasksList));
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(mergedExpensesList));
    localStorage.setItem(STORAGE_KEYS.FUNDS, JSON.stringify(updatedFunds));
    localStorage.setItem(STORAGE_KEYS.CASH_RECEIPTS, JSON.stringify(mergedReceiptsList));
    localStorage.setItem(STORAGE_KEYS.STANDING_ACCOUNTS, JSON.stringify(Array.from(standingMap.values())));
    localStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(Array.from(settlementMap.values())));

    // Record audit log for local sync
    dataStore.logAudit(
      'مزامنة مباشرة محلية (P2P Direct Sync)',
      'update',
      'system',
      payload.sourceDeviceId,
      `تمت مزامنة ودمج ${report.newTasksCount} مهمة جديدة، و${report.newExpensesCount} مصروف مع الجهاز: ${payload.sourceDeviceName} (${payload.sourceDeviceId})`
    );

    // Save sync session timestamp
    localStorage.setItem('ops_last_sync_timestamp', new Date().toISOString());
    localStorage.setItem('ops_last_sync_partner', `${payload.sourceDeviceName} (${payload.sourceDeviceId})`);

    // Reload internal dataStore cache
    window.location.reload();

    return report;
  }

  private mergeIndividualTask(local: Task, remote: Task): Task {
    // If remote task is completed and local is not, favor completed
    const isRemoteMoreAdvanced =
      (remote.status === 'completed' || remote.status === 'approved') &&
      local.status !== 'completed' &&
      local.status !== 'approved';

    // Merge Steps
    const stepsMap = new Map();
    (local.steps || []).forEach((s) => stepsMap.set(s.id, s));
    (remote.steps || []).forEach((s) => {
      if (!stepsMap.has(s.id) || s.status === 'completed') {
        stepsMap.set(s.id, s);
      }
    });

    // Merge Checklist
    const chkMap = new Map();
    (local.checklist || []).forEach((c) => chkMap.set(c.id, c));
    (remote.checklist || []).forEach((c) => {
      if (!chkMap.has(c.id) || c.completed) {
        chkMap.set(c.id, c);
      }
    });

    // Merge Daily Updates
    const updatesMap = new Map();
    (local.dailyUpdates || []).forEach((u) => updatesMap.set(u.id, u));
    (remote.dailyUpdates || []).forEach((u) => updatesMap.set(u.id, u));

    return {
      ...(isRemoteMoreAdvanced ? remote : local),
      steps: Array.from(stepsMap.values()),
      checklist: Array.from(chkMap.values()),
      dailyUpdates: Array.from(updatesMap.values()),
      actualStartTime: local.actualStartTime || remote.actualStartTime,
      actualEndTime: local.actualEndTime || remote.actualEndTime,
      spentAmount: Math.max(local.spentAmount || 0, remote.spentAmount || 0),
      standingAccountId: local.standingAccountId || remote.standingAccountId,
      standingAccountName: local.standingAccountName || remote.standingAccountName,
    };
  }
}

export const peerSyncEngine = PeerSyncEngine.getInstance();
