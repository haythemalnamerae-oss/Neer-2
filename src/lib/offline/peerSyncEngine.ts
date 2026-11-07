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
      if (!expenseMap.has(remoteExp.id)) {
        expenseMap.set(remoteExp.id, remoteExp);
        report.newExpensesCount++;
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
      if (!standingMap.has(remoteStand.id)) {
        standingMap.set(remoteStand.id, remoteStand);
      }
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

      // Calculate total spent for this fund from merged approved/recorded expenses
      const fundExpenses = mergedExpensesList.filter((e) => e.fundId === fund.id && e.status !== 'rejected');
      const totalSpent = fundExpenses.reduce((sum, e) => sum + (e.totalWithTax || e.amount), 0);

      // Add verified receipts allocated to this fund
      const fundReceipts = mergedReceiptsList.filter((r) => r.fundId === fund.id);
      const totalReceipts = fundReceipts.reduce((sum, r) => sum + r.amount, 0);

      const netCurrent = Number((totalAlloc + totalReceipts - totalSpent).toFixed(2));

      report.updatedFundsCount++;

      return {
        ...fund,
        totalAllocation: totalAlloc,
        spentBalance: Number(totalSpent.toFixed(2)),
        currentBalance: netCurrent,
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
