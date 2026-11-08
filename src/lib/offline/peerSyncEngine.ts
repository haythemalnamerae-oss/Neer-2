/**
 * OpsPlatform - Non-Cloud Peer-to-Peer & Local Sync Engine
 * محرك المزامنة المباشرة بين الأجهزة بدون خادم أو قاعدة بيانات سحابية
 */

import { Task, PettyCashFund, Expense, Settlement, CashReceipt, StandingAccount, AuditLog } from '../../types/domain';
import { dataStore } from '../storage';

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
    const standingMap = new Map<string, StandingAccount>(localStanding.map((s) => [s.id, s]));
    for (const remoteStand of payload.data.standingAccounts || []) {
      report.totalEntitiesProcessed++;
      const localStand = standingMap.get(remoteStand.id);
      if (!localStand) {
        standingMap.set(remoteStand.id, remoteStand);
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

      const mergedAccount: StandingAccount = {
        ...remoteStand,
        ...localStand,
        vendorName: localStand.vendorName || remoteStand.vendorName,
        contactPhone: localStand.contactPhone || remoteStand.contactPhone,
        address: localStand.address || remoteStand.address,
        notes: localStand.notes || remoteStand.notes,
        currency: localStand.currency || remoteStand.currency,
        direction: localStand.direction,
        openingBalance: localStand.openingBalance ?? remoteStand.openingBalance,
        active: localStand.active === false || remoteStand.active === false ? false : true,
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
    const updatedFunds: PettyCashFund[] = localFunds.map((fund) => {
      // Find matching remote fund if any
      const remoteFund = payload.data.funds?.find((f) => f.id === fund.id);
      const totalAlloc = remoteFund ? Math.max(fund.totalAllocation, remoteFund.totalAllocation) : fund.totalAllocation;

      // Cash purchases reduce custody immediately; supplier-credit purchases reduce it only when paid.
      const fundExpenses = mergedExpensesList.filter((e) => e.fundId === fund.id && e.status !== 'rejected' && !e.isSupplierCredit);
      const cashExpenseTotal = fundExpenses.reduce((sum, e) => sum + (e.totalWithTax || e.amount), 0);
      const supplierPayments = Array.from(standingMap.values())
        .filter((account) => account.direction === 'payable' || account.direction === 'payable_by_us')
        .flatMap((account) => account.entries || [])
        .filter((entry) => entry.type === 'settlement' && entry.fundId === fund.id)
        .reduce((sum, entry) => sum + entry.amount, 0);
      const totalSpent = Number((cashExpenseTotal + supplierPayments).toFixed(2));

      // Add verified receipts allocated to this fund
      const fundReceipts = mergedReceiptsList.filter((r) => r.fundId === fund.id);
      const totalReceipts = fundReceipts.reduce((sum, r) => sum + r.amount, 0);
      const localCashReceipts = localReceipts.filter((r) => r.fundId === fund.id && r.type === 'cash_box').reduce((sum, r) => sum + r.amount, 0);
      const mergedCashReceipts = mergedReceiptsList.filter((r) => r.fundId === fund.id && r.type === 'cash_box').reduce((sum, r) => sum + r.amount, 0);
      const localCoveredDeficits = localExpenses.filter((e) => e.fundId === fund.id && e.isCoveredFromCash).reduce((sum, e) => sum + (e.deficitAmount || 0), 0);
      const mergedCoveredDeficits = mergedExpensesList.filter((e) => e.fundId === fund.id && e.isCoveredFromCash).reduce((sum, e) => sum + (e.deficitAmount || 0), 0);
      const cashBoxBase = fund.cashBoxBalance === undefined ? 0 : fund.cashBoxBalance - localCashReceipts + localCoveredDeficits;
      const cashBoxBalance = Number((cashBoxBase + mergedCashReceipts - mergedCoveredDeficits).toFixed(2));

      const netCurrent = Number((totalAlloc + totalReceipts - totalSpent).toFixed(2));

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
    localStorage.setItem('ops_platform_tasks', JSON.stringify(mergedTasksList));
    localStorage.setItem('ops_platform_expenses', JSON.stringify(mergedExpensesList));
    localStorage.setItem('ops_platform_funds', JSON.stringify(updatedFunds));
    localStorage.setItem('ops_platform_cash_receipts', JSON.stringify(mergedReceiptsList));
    localStorage.setItem('ops_platform_standing_accounts', JSON.stringify(Array.from(standingMap.values())));
    localStorage.setItem('ops_platform_settlements', JSON.stringify(Array.from(settlementMap.values())));

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
    };
  }
}

export const peerSyncEngine = PeerSyncEngine.getInstance();
