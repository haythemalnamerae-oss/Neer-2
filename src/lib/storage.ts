import { 
  User, 
  Task, 
  PettyCashFund, 
  Expense, 
  Settlement, 
  FollowUp, 
  AuditLog, 
  NotificationItem, 
  Role, 
  TaskStatus, 
  ExpenseStatus, 
  TaskOutcome, 
  TaskOutcomeReason, 
  TaskChainNode, 
  TaskAttachment, 
  TaskComment,
  CashReceipt,
  StandingAccount,
  StandingAccountEntry,
  TaskStep,
  SubTask,
  TaskDailyUpdate,
} from '../types/domain';
import { hasPermission } from './rbac/permissions';
import { 
  INITIAL_USERS, 
  INITIAL_FUNDS, 
  INITIAL_EXPENSES, 
  INITIAL_TASKS, 
  INITIAL_SETTLEMENTS, 
  INITIAL_FOLLOW_UPS, 
  INITIAL_AUDIT_LOGS, 
  INITIAL_NOTIFICATIONS,
  INITIAL_STANDING_ACCOUNTS,
  INITIAL_CASH_RECEIPTS,
} from './mockData';

export interface SystemSettings {
  // General
  appName: string;
  organizationName: string;
  taxRegistrationNumber: string;
  headquarters: string;
  supportEmail: string;
  supportPhone: string;

  // Finance Policies
  currency: string;
  taxRate: number; // e.g. 5%
  singleExpenseLimit: number; // e.g. 5000 AED
  fundWarningThresholdPercent: number; // e.g. 30%
  autoNotifyOnLowBalance: boolean;
  requireReceiptForExpense: boolean;
  requireInvoiceNumber: boolean;
  requireDualApprovalForSettlements: boolean;
  fiscalYearStartMonth: number; // 1 = January

  // Field Operations
  autoCaptureLocationWithoutApproval: boolean;
  defaultTaskDurationDays: number;
  requireFundForTaskExpenses: boolean;
  budgetOverrunTolerancePercent: number; // e.g. 10%
  autoFollowUpReminderHours: number; // e.g. 24
  allowOfflineTaskSync: boolean;

  // Notifications
  notifyOnUrgentTask: boolean;
  notifyOnExpenseRejected: boolean;
  notifyOnFundReplenished: boolean;
  notifyOnSettlementDue: boolean;
  enableSoundAlerts: boolean;

  // Preferences
  dateFormat: string;
  timeFormat: '12h' | '24h';
  numberFormatting: 'standard' | 'compact';
  themeAccent: 'indigo' | 'emerald' | 'blue' | 'purple' | 'amber';
}

const DEFAULT_SETTINGS: SystemSettings = {
  appName: 'منصة إدارة العمليات والعهد النقدية',
  organizationName: 'مجموعة الصقر لإدارة المنشآت والمشاريع الميدانية',
  taxRegistrationNumber: '100234567800003',
  headquarters: 'أبوظبي، مصفح الصناعية، مجمع الصقر للأعمال',
  supportEmail: 'ops-support@al-saqr.ae',
  supportPhone: '+971 2 600 5000',
  currency: 'AED',
  taxRate: 5,
  singleExpenseLimit: 5000,
  fundWarningThresholdPercent: 30,
  autoNotifyOnLowBalance: true,
  requireReceiptForExpense: true,
  requireInvoiceNumber: true,
  requireDualApprovalForSettlements: true,
  fiscalYearStartMonth: 1,
  autoCaptureLocationWithoutApproval: true,
  defaultTaskDurationDays: 7,
  requireFundForTaskExpenses: true,
  budgetOverrunTolerancePercent: 10,
  autoFollowUpReminderHours: 24,
  allowOfflineTaskSync: true,
  notifyOnUrgentTask: true,
  notifyOnExpenseRejected: true,
  notifyOnFundReplenished: true,
  notifyOnSettlementDue: true,
  enableSoundAlerts: false,
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '24h',
  numberFormatting: 'standard',
  themeAccent: 'indigo',
};

export const STORAGE_KEYS = {
  USERS: 'ops_users_v3',
  CURRENT_USER_ID: 'ops_current_user_id_v3',
  FUNDS: 'ops_funds_v3',
  EXPENSES: 'ops_expenses_v3',
  TASKS: 'ops_tasks_v3',
  SETTLEMENTS: 'ops_settlements_v3',
  FOLLOW_UPS: 'ops_follow_ups_v3',
  AUDIT_LOGS: 'ops_audit_logs_v3',
  NOTIFICATIONS: 'ops_notifications_v3',
  SETTINGS: 'ops_settings_v3',
  CASH_RECEIPTS: 'ops_cash_receipts_v3',
  STANDING_ACCOUNTS: 'ops_standing_accounts_v3',
};

function safeGet<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to persist key ${key}:`, e);
  }
}

export class OpsDataStore {
  private static instance: OpsDataStore;

  private users: User[];
  private currentUserId: string;
  private funds: PettyCashFund[];
  private expenses: Expense[];
  private tasks: Task[];
  private settlements: Settlement[];
  private followUps: FollowUp[];
  private auditLogs: AuditLog[];
  private notifications: NotificationItem[];
  private cashReceipts: CashReceipt[];
  private standingAccounts: StandingAccount[];
  private settings: SystemSettings;

  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.users = safeGet(STORAGE_KEYS.USERS, INITIAL_USERS);
    this.currentUserId = safeGet(STORAGE_KEYS.CURRENT_USER_ID, 'usr-1');
    this.funds = safeGet(STORAGE_KEYS.FUNDS, INITIAL_FUNDS);
    this.expenses = safeGet(STORAGE_KEYS.EXPENSES, INITIAL_EXPENSES);
    this.tasks = safeGet(STORAGE_KEYS.TASKS, INITIAL_TASKS);
    this.settlements = safeGet(STORAGE_KEYS.SETTLEMENTS, INITIAL_SETTLEMENTS);
    this.followUps = safeGet(STORAGE_KEYS.FOLLOW_UPS, INITIAL_FOLLOW_UPS);
    this.auditLogs = safeGet(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
    this.notifications = safeGet(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    this.cashReceipts = safeGet(STORAGE_KEYS.CASH_RECEIPTS, INITIAL_CASH_RECEIPTS);
    this.standingAccounts = safeGet(STORAGE_KEYS.STANDING_ACCOUNTS, INITIAL_STANDING_ACCOUNTS);
    const savedSettings = safeGet<Partial<SystemSettings>>(STORAGE_KEYS.SETTINGS, {});
    this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  }

  public static getInstance(): OpsDataStore {
    if (!OpsDataStore.instance) {
      OpsDataStore.instance = new OpsDataStore();
    }
    return OpsDataStore.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  // --- Users & Auth ---
  public getUsers(): User[] {
    return [...this.users];
  }

  public getCurrentUser(): User {
    const found = this.users.find((u) => u.id === this.currentUserId);
    return found || this.users[0];
  }

  public switchUser(userId: string): void {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      this.currentUserId = userId;
      safeSet(STORAGE_KEYS.CURRENT_USER_ID, userId);
      this.logAudit('تبديل المستخدم', 'auth', 'user', userId, `تم التبديل إلى المستخدم: ${user.name} (${user.roleTitleAr})`);
      this.notify();
    }
  }

  public addUser(user: Omit<User, 'id'>): User {
    const newUser: User = {
      ...user,
      id: `usr-${Date.now()}`,
    };
    this.users = [newUser, ...this.users];
    safeSet(STORAGE_KEYS.USERS, this.users);
    this.logAudit('إضافة مستخدم جديد', 'create', 'user', newUser.id, `تم إنشاء الحساب: ${newUser.name} بالدور: ${newUser.roleTitleAr}`);
    this.notify();
    return newUser;
  }

  public toggleUserStatus(userId: string): void {
    this.users = this.users.map((u) => (u.id === userId ? { ...u, active: !u.active } : u));
    safeSet(STORAGE_KEYS.USERS, this.users);
    this.logAudit('تعديل حالة حساب', 'update', 'user', userId, `تغيير حالة تفعيل المستخدم`);
    this.notify();
  }

  // --- Funds ---
  public getFunds(): PettyCashFund[] {
    return [...this.funds];
  }

  public getFundById(id: string): PettyCashFund | undefined {
    return this.funds.find((f) => f.id === id);
  }

  public addFund(fund: Omit<PettyCashFund, 'id' | 'code' | 'spentBalance' | 'currentBalance' | 'status' | 'lastReplenishedDate'>): PettyCashFund {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'create')) throw new Error('لا تملك صلاحية إنشاء عهدة.');
    if (!Number.isFinite(fund.totalAllocation) || fund.totalAllocation <= 0) throw new Error('مبلغ تخصيص العهدة غير صالح.');
    if (fund.currency !== this.settings.currency) throw new Error('عملة العهدة يجب أن تطابق عملة المنشأة؛ لا يتم التحويل بين العملات تلقائياً.');
    if (!Number.isFinite(fund.warningThreshold) || fund.warningThreshold < 0 || fund.warningThreshold > 100) throw new Error('نسبة تنبيه الرصيد يجب أن تكون بين 0 و100.');
    const holder = this.users.find((user) => user.id === fund.holderId && user.active);
    if (!holder) throw new Error('يجب اختيار أمين عهدة نشط.');
    const newFund: PettyCashFund = {
      ...fund,
      id: `fund-${Date.now()}`,
      code: `PCF-${new Date().getFullYear()}-${String(this.funds.length + 1).padStart(5, '0')}`,
      currentBalance: fund.totalAllocation,
      spentBalance: 0,
      status: 'active',
      lastReplenishedDate: new Date().toISOString().split('T')[0],
    };
    this.funds = [newFund, ...this.funds];
    safeSet(STORAGE_KEYS.FUNDS, this.funds);
    this.logAudit('تخصيص عهدة نقدية', 'create', 'fund', newFund.id, `إنشاء عهدة ${newFund.name} بقيمة ${newFund.totalAllocation} ${newFund.currency} بمسؤولية ${newFund.holderName}`);
    this.notify();
    return newFund;
  }

  public replenishFund(fundId: string, addedAmount: number, notes?: string): void {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'edit')) throw new Error('لا تملك صلاحية تغذية العهد.');
    if (!Number.isFinite(addedAmount) || addedAmount <= 0 || !this.funds.some((fund) => fund.id === fundId)) throw new Error('بيانات تغذية العهدة غير صالحة.');
    if (this.funds.find((fund) => fund.id === fundId)?.currency !== this.settings.currency) throw new Error('عملة العهدة تختلف عن عملة المنشأة؛ راجع إعداد العملة قبل تسجيل التغذية.');
    this.funds = this.funds.map((f) => {
      if (f.id === fundId) {
        const newBalance = f.currentBalance + addedAmount;
        const newStatus = newBalance <= 0 ? 'depleted' : (newBalance / f.totalAllocation) * 100 <= f.warningThreshold ? 'warning' : 'active';
        return {
          ...f,
          currentBalance: newBalance,
          status: newStatus,
          lastReplenishedDate: new Date().toISOString().split('T')[0],
          notes: notes ? `${f.notes ? f.notes + ' | ' : ''}إيداع تعويضي ${addedAmount}: ${notes}` : f.notes,
        };
      }
      return f;
    });
    safeSet(STORAGE_KEYS.FUNDS, this.funds);
    this.logAudit('تغذية عهدة مالية', 'update', 'fund', fundId, `إيداع مبلغ تعويضي ${addedAmount} ${this.settings.currency} في العهدة.`);
    this.notify();
  }

  public updateFund(fundId: string, updates: Partial<PettyCashFund>): void {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'edit')) throw new Error('لا تملك صلاحية تعديل العهد.');
    if (!this.funds.some((fund) => fund.id === fundId)) throw new Error('العهدة المحددة غير موجودة.');
    if (updates.currentBalance !== undefined && (!Number.isFinite(updates.currentBalance) || updates.currentBalance < 0)) throw new Error('رصيد العهدة غير صالح.');
    this.funds = this.funds.map((f) => {
      if (f.id === fundId) {
        return { ...f, ...updates };
      }
      return f;
    });
    safeSet(STORAGE_KEYS.FUNDS, this.funds);
    this.logAudit('تحديث بيانات عهدة', 'update', 'fund', fundId, 'تحديث رصيد أو حالة العهدة النقدية');
    this.notify();
  }

  // --- Expenses ---
  public getExpenses(): Expense[] {
    return [...this.expenses];
  }

  public addExpense(
    expenseData: Omit<Expense, 'id' | 'code' | 'taxAmount' | 'totalWithTax' | 'status' | 'submittedAt' | 'submittedBy'> & {
      cascadeDeduction?: boolean;
      secondaryFundId?: string;
      allowDeficit?: boolean;
    }
  ): Expense {
    if (!hasPermission(this.getCurrentUser().role, 'expenses', 'create')) throw new Error('لا تملك صلاحية تسجيل المصروفات.');
    if (!Number.isFinite(expenseData.amount) || expenseData.amount <= 0) throw new Error('مبلغ المصروف غير صالح.');
    if (!expenseData.vendorName?.trim() || !expenseData.description?.trim()) throw new Error('بيانات المورد وبيان المصروف مطلوبة.');
    if (this.settings.requireInvoiceNumber && !expenseData.invoiceNumber?.trim()) throw new Error('رقم الفاتورة مطلوب حسب سياسة المنشأة.');
    if (this.settings.requireReceiptForExpense && !expenseData.hasReceipt) throw new Error('لا يمكن تسجيل المصروف قبل تأكيد توفر أصل الفاتورة الورقي.');
    const duplicateInvoice = Boolean(expenseData.invoiceNumber?.trim()) && this.expenses.some((expense) => expense.status !== 'rejected' && expense.invoiceNumber.trim().toLowerCase() === expenseData.invoiceNumber.trim().toLowerCase() && expense.vendorName.trim().toLowerCase() === expenseData.vendorName.trim().toLowerCase());
    if (duplicateInvoice) throw new Error('رقم الفاتورة مسجل مسبقاً لهذا المورد. تحقق من الفواتير قبل إعادة الإدخال.');
    const taxRate = this.settings.taxRate / 100;
    const taxAmount = Number((expenseData.amount * taxRate).toFixed(2));
    const totalWithTax = Number((expenseData.amount + taxAmount).toFixed(2));
    const currentUser = this.getCurrentUser();

    const primaryFund = this.funds.find((f) => f.id === expenseData.fundId);
    if (!primaryFund) throw new Error('العهدة المحددة غير موجودة.');
    const previousFundStatuses = new Map(this.funds.map((fund) => [fund.id, fund.status]));
    if (primaryFund.currency !== this.settings.currency) throw new Error('عملة العهدة تختلف عن عملة المنشأة؛ لا يمكن تسجيل مصروف دون تسوية إعداد العملة.');
    if (currentUser.role === 'field_officer' && primaryFund.holderId !== currentUser.id) throw new Error('لا يمكنك تسجيل مصروف على عهدة غير مسندة إليك.');
    if (expenseData.taskId) {
      const linkedTask = this.tasks.find((task) => task.id === expenseData.taskId);
      if (!linkedTask) throw new Error('المهمة المرتبطة بالمصروف غير موجودة.');
      if (currentUser.role === 'field_officer' && linkedTask.assigneeId !== currentUser.id) throw new Error('لا يمكنك ربط المصروف بمهمة غير مسندة إليك.');
    }
    const linkedStandingAccount = expenseData.standingAccountId
      ? this.standingAccounts.find((account) => account.id === expenseData.standingAccountId)
      : undefined;
    if (expenseData.standingAccountId && (!linkedStandingAccount || linkedStandingAccount.active === false)) throw new Error('الحساب المرتبط بالمصروف غير موجود أو موقوف.');
    if (linkedStandingAccount && (linkedStandingAccount.currency || this.settings.currency) !== primaryFund.currency) throw new Error('عملة حساب المورد تختلف عن عملة العهدة.');
    if (linkedStandingAccount && linkedStandingAccount.direction !== 'payable' && linkedStandingAccount.direction !== 'payable_by_us') throw new Error('المصروفات لا تُسجل على حساب من نوع «لنا»؛ استخدم حساب مورد من نوع «علينا».');
    const isSupplierCredit = Boolean(linkedStandingAccount);
    if (isSupplierCredit && (expenseData.cascadeDeduction || expenseData.allowDeficit)) throw new Error('شراء الآجل على حساب المورد لا يستخدم السحب المتسلسل أو تسجيل العجز؛ تتم التسوية عند السداد.');
    const expenseMonth = (expenseData.expenseDate || new Date().toISOString().slice(0, 10)).slice(0, 7);
    const linkedAccountMonthTotal = linkedStandingAccount ? (
      this.expenses.filter((expense) => expense.standingAccountId === linkedStandingAccount.id && expense.status !== 'rejected' && (expense.expenseDate || expense.submittedAt.slice(0, 10)).startsWith(expenseMonth))
        .reduce((sum, expense) => sum + expense.totalWithTax, 0) +
      (linkedStandingAccount.entries || []).filter((entry) => entry.type === 'charge' && !entry.expenseId && entry.date.startsWith(expenseMonth))
        .reduce((sum, entry) => sum + entry.amount, 0)
    ) : 0;
    const exceedsStandingMonthlyLimit = Boolean(linkedStandingAccount?.monthlyLimit && linkedAccountMonthTotal + totalWithTax > linkedStandingAccount.monthlyLimit);
    const avail1 = primaryFund.currentBalance;

    let cascadeSplit: Expense['cascadeSplit'] = undefined;
    let isDeficit = false;
    let deficitAmount = 0;

    // Credit purchases are posted to the supplier ledger only after approval.
    // Do not consume petty-cash balance until an actual settlement is recorded.
    if (!isSupplierCredit) {
      // Check if cascade multi-fund deduction requested and primary fund balance is insufficient
      if (expenseData.cascadeDeduction && expenseData.secondaryFundId && totalWithTax > avail1) {
        const secondaryFund = this.funds.find((f) => f.id === expenseData.secondaryFundId);
        if (!secondaryFund || secondaryFund.id === primaryFund.id) throw new Error('العهدة البديلة غير صالحة.');
        if (secondaryFund.currency !== primaryFund.currency) throw new Error('لا يمكن السحب المتسلسل بين عهدتين بعملتين مختلفتين.');
        if (currentUser.role === 'field_officer' && secondaryFund.holderId !== currentUser.id) throw new Error('لا يمكنك استخدام عهدة بديلة غير مسندة إليك.');
        const neededFromSecondary = Number((totalWithTax - avail1).toFixed(2));
        if (secondaryFund.currentBalance < neededFromSecondary) throw new Error('رصيد العهدة البديلة لا يكفي لتغطية الفرق.');
        cascadeSplit = {
          primaryFundId: primaryFund?.id || expenseData.fundId,
          primaryFundName: primaryFund?.name || 'العهدة الأولى',
          primaryAmount: avail1,
          secondaryFundId: secondaryFund?.id || expenseData.secondaryFundId,
          secondaryFundName: secondaryFund?.name || 'العهدة البديلة',
          secondaryAmount: neededFromSecondary,
        };
  
        // Update primary fund (depleted to 0)
        this.funds = this.funds.map((f) => {
          if (f.id === expenseData.fundId) {
            return {
              ...f,
              currentBalance: 0,
              spentBalance: f.spentBalance + avail1,
              status: 'depleted',
            };
          }
          if (f.id === expenseData.secondaryFundId) {
            const newBal = Math.max(0, f.currentBalance - neededFromSecondary);
            const newSpent = f.spentBalance + neededFromSecondary;
            const pct = (newBal / f.totalAllocation) * 100;
            return {
              ...f,
              currentBalance: newBal,
              spentBalance: newSpent,
              status: newBal <= 0 ? 'depleted' : pct <= f.warningThreshold ? 'warning' : 'active',
            };
          }
          return f;
        });
        safeSet(STORAGE_KEYS.FUNDS, this.funds);
      } else if (expenseData.allowDeficit && totalWithTax > avail1) {
        if (!hasPermission(currentUser.role, 'expenses', 'approve')) throw new Error('تسجيل العجز يتطلب صلاحية اعتماد مالية.');
        // Deficit scenario (Negative balance)
        isDeficit = true;
        deficitAmount = Number((totalWithTax - avail1).toFixed(2));
  
        this.funds = this.funds.map((f) => {
          if (f.id === expenseData.fundId) {
            return {
              ...f,
              currentBalance: 0,
              spentBalance: f.spentBalance + totalWithTax,
              status: 'depleted',
            };
          }
          return f;
        });
        safeSet(STORAGE_KEYS.FUNDS, this.funds);
      } else {
        if (totalWithTax > avail1) throw new Error('رصيد العهدة غير كافٍ. اختر معالجة معتمدة قبل التسجيل.');
        // Normal single fund deduction
        this.funds = this.funds.map((f) => {
          if (f.id === expenseData.fundId) {
            const newBalance = Math.max(0, f.currentBalance - totalWithTax);
            const newSpent = f.spentBalance + totalWithTax;
            const percent = (newBalance / f.totalAllocation) * 100;
            const status = newBalance <= 0 ? 'depleted' : percent <= f.warningThreshold ? 'warning' : 'active';
            return {
              ...f,
              currentBalance: newBalance,
              spentBalance: newSpent,
              status,
            };
          }
          return f;
        });
        safeSet(STORAGE_KEYS.FUNDS, this.funds);
      }
  
    }


    const newExpense: Expense = {
      ...expenseData,
      fundName: primaryFund.name,
      taskTitle: expenseData.taskId ? this.tasks.find((task) => task.id === expenseData.taskId)?.title : undefined,
      receiptUrl: undefined,
      approvalNotes: undefined,
      rejectionReason: undefined,
      isCoveredFromCash: false,
      coveredBy: undefined,
      coveredAt: undefined,
      id: `exp-${Date.now()}`,
      code: `EXP-${new Date().getFullYear()}-${String(this.expenses.length + 1).padStart(6, '0')}`,
      taxAmount,
      totalWithTax,
      status: 'pending_approval',
      specialAuditRequired: totalWithTax > this.settings.singleExpenseLimit || exceedsStandingMonthlyLimit,
      submittedAt: new Date().toLocaleString('ar-AE'),
      expenseDate: expenseData.expenseDate || new Date().toISOString().split('T')[0],
      submittedBy: currentUser.name,
      cascadeSplit,
      isDeficit,
      deficitAmount: isDeficit ? deficitAmount : undefined,
      isSupplierCredit,
    };

    if (linkedStandingAccount) {
      newExpense.standingAccountName = linkedStandingAccount.name;
      newExpense.standingDirection = linkedStandingAccount.direction;
    }

    this.expenses = [newExpense, ...this.expenses];
    safeSet(STORAGE_KEYS.EXPENSES, this.expenses);

    if (this.settings.autoNotifyOnLowBalance) {
      this.funds.filter((fund) => (fund.status === 'warning' || fund.status === 'depleted') && previousFundStatuses.get(fund.id) !== fund.status)
        .forEach((fund) => this.addNotification({
          title: fund.status === 'depleted' ? 'نفاد رصيد العهدة' : 'انخفاض رصيد العهدة',
          message: `وصل رصيد عهدة ${fund.name} إلى ${fund.currentBalance} ${fund.currency}، وهي الآن في حالة ${fund.status === 'depleted' ? 'نفاد' : 'إنذار'}.`,
          type: 'warning', targetView: 'funds',
        }));
    }

    // If attached to a task, update task's spentAmount
    if (newExpense.taskId) {
      this.tasks = this.tasks.map((t) => {
        if (t.id === newExpense.taskId) {
          return {
            ...t,
            spentAmount: (t.spentAmount || 0) + totalWithTax,
          };
        }
        return t;
      });
      safeSet(STORAGE_KEYS.TASKS, this.tasks);
    }

    this.logAudit('تسجيل مصروف جديد', 'create', 'expense', newExpense.id, `فاتورة ${newExpense.invoiceNumber} بقيمة إجمالية ${totalWithTax} من المورد ${newExpense.vendorName}${cascadeSplit ? ' (سحب متسلسل من عهدتين)' : isDeficit ? ` (تسجيل عجز سالب بقيمة ${deficitAmount} د.إ)` : ''}`);
    this.addNotification({
      title: 'طلب اعتماد مصروف',
      message: `${currentUser.name} قام برفع فاتورة جديدة بمبلغ ${totalWithTax} ${this.settings.currency} من ${newExpense.fundName}.`,
      type: 'info',
      targetView: 'expenses',
    });

    this.notify();
    return newExpense;
  }

  public coverDeficitExpenseFromCash(expenseId: string, coveredBy: string): void {
    if (!hasPermission(this.getCurrentUser().role, 'expenses', 'approve')) throw new Error('تغطية العجز تتطلب صلاحية الاعتماد المالي.');
    const expense = this.expenses.find((e) => e.id === expenseId);
    if (!expense || !expense.isDeficit || expense.status !== 'approved' || expense.isCoveredFromCash) throw new Error('لا يمكن تغطية العجز قبل اعتماد الفاتورة أو بعد تسويتها.');
    const fund = this.funds.find((item) => item.id === expense.fundId);
    const deficitAmount = expense.deficitAmount || 0;
    if (!fund || (fund.cashBoxBalance || 0) < deficitAmount) throw new Error('رصيد الصندوق النقدي لا يكفي لتغطية العجز. سجّل المقبوضات في الصندوق أولاً.');

    this.expenses = this.expenses.map((e) => {
      if (e.id === expenseId) {
        return {
          ...e,
          isCoveredFromCash: true,
          coveredAt: new Date().toLocaleString('ar-AE'),
          coveredBy,
        };
      }
      return e;
    });
    safeSet(STORAGE_KEYS.EXPENSES, this.expenses);

    // Also deduct from fund's cashBoxBalance if available
    this.funds = this.funds.map((f) => {
      if (f.id === expense.fundId) {
        return {
          ...f,
          cashBoxBalance: Math.max(0, (f.cashBoxBalance || 0) - deficitAmount),
        };
      }
      return f;
    });
    safeSet(STORAGE_KEYS.FUNDS, this.funds);

    this.logAudit('تغطية عجز مصروف من الصندوق', 'update', 'expense', expenseId, `تم تسوية وتغطية مبلغ العجز ${expense.deficitAmount} د.إ من الصندوق النقدي`);
    this.notify();
  }

  // --- Cash Receipts & Cash Box ---
  public getCashReceipts(): CashReceipt[] {
    return [...this.cashReceipts];
  }

  public addCashReceipt(data: Omit<CashReceipt, 'id' | 'code' | 'createdAt'>): CashReceipt {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'edit')) throw new Error('لا تملك صلاحية تسجيل المقبوضات.');
    if (!Number.isFinite(data.amount) || data.amount <= 0) throw new Error('مبلغ المقبوض غير صالح.');
    if (!data.source?.trim() || !data.receivedBy?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('بيانات مصدر المقبوض أو المستلم أو التاريخ غير مكتملة.');
    if (data.type === 'cash_box' && !data.fundId) throw new Error('يجب تحديد الصندوق المستلم للمقبوض.');
    if (data.fundId && !this.funds.some((fund) => fund.id === data.fundId)) throw new Error('الصندوق المحدد غير موجود.');
    if (data.type === 'cash_box' && this.funds.find((fund) => fund.id === data.fundId)?.currency !== this.settings.currency) throw new Error('عملة الصندوق تختلف عن عملة المنشأة.');
    const newReceipt: CashReceipt = {
      ...data,
      id: `cr-${Date.now()}`,
      code: `REC-${new Date().getFullYear()}-${String(this.cashReceipts.length + 1).padStart(6, '0')}`,
      createdAt: new Date().toISOString(),
    };
    this.cashReceipts = [newReceipt, ...this.cashReceipts];
    safeSet(STORAGE_KEYS.CASH_RECEIPTS, this.cashReceipts);

    // Increase target fund's cashBoxBalance
    if (data.fundId && data.type === 'cash_box') {
      this.funds = this.funds.map((f) => {
        if (f.id === data.fundId) {
          const newCashBox = (f.cashBoxBalance || 0) + data.amount;
          return {
            ...f,
            cashBoxBalance: newCashBox,
          };
        }
        return f;
      });
      safeSet(STORAGE_KEYS.FUNDS, this.funds);
    }

    this.logAudit('تسجيل مقبوضات نقدية بالصندوق', 'create', 'fund', newReceipt.id, `توريد مبلغ ${data.amount} د.إ من مصدر: ${data.source}`);
    this.addNotification({
      title: 'توريد مبالغ مقبوضة للصندوق',
      message: `تم توريد واستلام مبلغ ${data.amount} د.إ من "${data.source}".`,
      type: 'success',
      targetView: 'funds',
    });

    this.notify();
    return newReceipt;
  }

  // --- Standing Recurring Accounts (حسابات المصروفات الاعتيادية والموردين) ---
  public getStandingAccounts(): StandingAccount[] {
    return this.standingAccounts.map((account) => ({
      ...account,
      entries: account.entries || [],
      currentBalance: this.calculateStandingAccountBalance(account),
    }));
  }

  private calculateStandingAccountBalance(account: StandingAccount): number {
    const opening = Number(account.openingBalance ?? account.currentBalance ?? 0);
    return Number(((account.entries || []).reduce((balance, entry) =>
      balance + (entry.type === 'charge' ? entry.amount : -entry.amount), opening)).toFixed(2));
  }

  private appendStandingAccountEntry(accountId: string, entry: Omit<StandingAccountEntry, 'id' | 'createdBy' | 'createdAt'>): StandingAccount {
    const account = this.standingAccounts.find((item) => item.id === accountId);
    if (!account) throw new Error('الحساب المرتبط غير موجود.');
    const nextEntry: StandingAccountEntry = {
      ...entry,
      id: `sae-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdBy: this.getCurrentUser().id,
      createdAt: new Date().toISOString(),
    };
    const updated = { ...account, entries: [nextEntry, ...(account.entries || [])], updatedAt: new Date().toISOString() };
    this.standingAccounts = this.standingAccounts.map((item) => item.id === accountId ? updated : item);
    safeSet(STORAGE_KEYS.STANDING_ACCOUNTS, this.standingAccounts);
    return updated;
  }

  public addStandingAccount(acc: Omit<StandingAccount, 'id'>): StandingAccount {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'edit')) throw new Error('لا تملك صلاحية إدارة الحسابات الدائمة.');
    if (!acc.name?.trim()) throw new Error('اسم الحساب مطلوب.');
    const openingBalance = Number(acc.openingBalance ?? acc.currentBalance ?? 0);
    if (!Number.isFinite(openingBalance) || openingBalance < 0) throw new Error('الرصيد الافتتاحي غير صالح.');
    const currency = acc.currency || this.settings.currency;
    const newAcc: StandingAccount = {
      ...acc,
      name: acc.name.trim(),
      vendorName: acc.vendorName?.trim() || undefined,
      openingBalance,
      currentBalance: openingBalance,
      currency,
      entries: acc.entries || [],
      id: `std-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: acc.code || `STD-${String(this.standingAccounts.length + 1).padStart(4, '0')}`,
      active: acc.active !== undefined ? acc.active : true,
      updatedAt: new Date().toISOString(),
    };
    this.standingAccounts = [newAcc, ...this.standingAccounts];
    safeSet(STORAGE_KEYS.STANDING_ACCOUNTS, this.standingAccounts);
    this.logAudit('إضافة حساب مورد / تعامل مستمر', 'create', 'fund', newAcc.id, `تم إنشاء حساب ${newAcc.name} برصيد افتتاحي ${openingBalance} ${currency}`);
    this.notify();
    return newAcc;
  }

  public updateStandingAccount(id: string, updates: Partial<StandingAccount>): void {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'edit')) throw new Error('لا تملك صلاحية تعديل الحسابات الدائمة.');
    const target = this.standingAccounts.find((account) => account.id === id);
    if (!target) throw new Error('الحساب غير موجود.');
    const hasFinancialHistory = Boolean((target.entries || []).length) || this.expenses.some((expense) => expense.standingAccountId === id);
    if (hasFinancialHistory && updates.direction !== undefined && updates.direction !== target.direction) throw new Error('لا يمكن تغيير طبيعة حساب لنا/علينا بعد وجود حركات مالية؛ أنشئ حساباً جديداً للتصنيف الصحيح.');
    if (hasFinancialHistory && updates.currency !== undefined && updates.currency !== (target.currency || this.settings.currency)) throw new Error('لا يمكن تغيير عملة حساب له حركات مالية.');
    const { entries: _entries, currentBalance: _balance, openingBalance: _opening, totalInvoiced: _total, ...safeUpdates } = updates;
    this.standingAccounts = this.standingAccounts.map((account) => account.id === id ? { ...account, ...safeUpdates, updatedAt: new Date().toISOString() } : account);
    safeSet(STORAGE_KEYS.STANDING_ACCOUNTS, this.standingAccounts);
    this.logAudit('تحديث بيانات حساب مورد', 'update', 'fund', id, 'تم تحديث البيانات التعريفية دون تعديل دفتر الحركة.');
    this.notify();
  }

  public addStandingAccountCharge(id: string, amount: number, date: string, description: string, reference?: string): StandingAccount {
    const user = this.getCurrentUser();
    if (!hasPermission(user.role, 'funds', 'edit') || !hasPermission(user.role, 'expenses', 'approve')) throw new Error('إضافة فاتورة معتمدة على حساب مورد تتطلب صلاحية إدارة مالية واعتماد المصروفات.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('مبلغ الحركة غير صالح.');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !description.trim() || !reference?.trim()) throw new Error('تاريخ الحركة وبيانها ورقم الفاتورة أو المرجع الداخلي مطلوبة.');
    const account = this.standingAccounts.find((item) => item.id === id);
    if (!account || account.active === false) throw new Error('الحساب غير موجود أو موقوف.');
    const normalizedReference = reference?.trim().toLowerCase();
    if (normalizedReference && (account.entries || []).some((entry) => entry.reference?.trim().toLowerCase() === normalizedReference)) throw new Error('رقم الفاتورة أو المرجع مسجل مسبقاً في دفتر هذا الحساب.');
    const updated = this.appendStandingAccountEntry(id, {
      type: 'charge', amount, date, description: description.trim(),
      reference: reference?.trim() || undefined,
    });
    this.logAudit('إضافة فاتورة / مستحق على حساب', 'create', 'fund', id, `إضافة مبلغ ${amount} ${account.currency || this.settings.currency} إلى حساب ${account.name}`);
    this.notify();
    return { ...updated, currentBalance: this.calculateStandingAccountBalance(updated) };
  }

  public settleStandingAccount(id: string, amount: number, fundId: string, date: string, notes?: string): StandingAccount {
    const user = this.getCurrentUser();
    if (!hasPermission(user.role, 'funds', 'edit')) throw new Error('تسوية حساب المورد تتطلب صلاحية إدارة مالية.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('مبلغ التسوية غير صالح.');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new Error('تاريخ التسوية غير صالح.');
    if (!notes?.trim()) throw new Error('رقم سند السداد أو التحصيل مطلوب لمنع تكرار الحركة.');
    const account = this.standingAccounts.find((item) => item.id === id);
    const fund = this.funds.find((item) => item.id === fundId);
    if (!account || !fund) throw new Error('الحساب أو العهدة/الصندوق المحدد غير موجود.');
    if (user.role === 'field_officer' && fund.holderId !== user.id) throw new Error('لا يمكنك تسوية حساب مورد من عهدة غير مسندة إليك.');
    if (fund.currency !== (account.currency || this.settings.currency)) throw new Error('عملة الحساب تختلف عن عملة العهدة المختارة.');
    const normalizedSettlementReference = notes.trim().toLowerCase();
    if ((account.entries || []).some((entry) => entry.reference?.trim().toLowerCase() === normalizedSettlementReference)) throw new Error('رقم سند السداد أو التحصيل مسجل مسبقاً لهذا الحساب.');
    const balance = this.calculateStandingAccountBalance(account);
    if (amount > balance) throw new Error('مبلغ التسوية أكبر من الرصيد المستحق.');
    const payable = account.direction === 'payable' || account.direction === 'payable_by_us';
    if (payable && amount > fund.currentBalance) throw new Error('رصيد العهدة لا يكفي لسداد المورد.');

    if (payable) {
      this.funds = this.funds.map((item) => item.id === fundId ? {
        ...item,
        currentBalance: Number((item.currentBalance - amount).toFixed(2)),
        spentBalance: Number((item.spentBalance + amount).toFixed(2)),
        status: item.currentBalance - amount <= 0 ? 'depleted' : ((item.currentBalance - amount) / Math.max(item.totalAllocation, 1)) * 100 <= item.warningThreshold ? 'warning' : 'active',
      } : item);
      safeSet(STORAGE_KEYS.FUNDS, this.funds);
    } else {
      this.funds = this.funds.map((item) => item.id === fundId ? { ...item, cashBoxBalance: Number(((item.cashBoxBalance || 0) + amount).toFixed(2)) } : item);
      safeSet(STORAGE_KEYS.FUNDS, this.funds);
      const receipt: CashReceipt = {
        id: `cr-${Date.now()}`,
        code: `REC-${new Date().getFullYear()}-${String(this.cashReceipts.length + 1).padStart(6, '0')}`,
        amount,
        source: `تحصيل من حساب ${account.name}`,
        type: 'cash_box',
        receivedBy: user.name,
        date,
        notes,
        fundId,
        fundName: fund.name,
        createdAt: new Date().toISOString(),
      };
      this.cashReceipts = [receipt, ...this.cashReceipts];
      safeSet(STORAGE_KEYS.CASH_RECEIPTS, this.cashReceipts);
    }

    const updated = this.appendStandingAccountEntry(id, {
      type: 'settlement', amount, date,
      description: payable ? 'سداد للمورد' : 'تحصيل من الطرف المدين',
      reference: notes?.trim() || undefined, fundId, fundName: fund.name,
    });
    this.logAudit(payable ? 'سداد حساب مورد' : 'تحصيل رصيد حساب', 'create', 'fund', id, `مبلغ ${amount} ${account.currency || this.settings.currency} عبر ${fund.name}`);
    this.notify();
    return { ...updated, currentBalance: this.calculateStandingAccountBalance(updated) };
  }

  public deleteStandingAccount(id: string): void {
    if (!hasPermission(this.getCurrentUser().role, 'funds', 'edit')) throw new Error('لا تملك صلاحية حذف الحسابات الدائمة.');
    const target = this.standingAccounts.find((account) => account.id === id);
    if (!target) throw new Error('الحساب غير موجود.');
    this.standingAccounts = this.standingAccounts.map((account) => account.id === id ? { ...account, active: false, updatedAt: new Date().toISOString() } : account);
    safeSet(STORAGE_KEYS.STANDING_ACCOUNTS, this.standingAccounts);
    this.logAudit('إيقاف حساب مورد', 'update', 'fund', id, `تم إيقاف الحساب ${target.name} دون حذف سجله.`);
    this.notify();
  }

  public updateExpenseStatus(expenseId: string, status: ExpenseStatus, reason?: string): void {
    const currentUser = this.getCurrentUser();
    if (!hasPermission(currentUser.role, 'expenses', 'approve')) throw new Error('لا تملك صلاحية اعتماد أو رفض المصروفات.');
    const targetExpense = this.expenses.find((expense) => expense.id === expenseId);
    if (!targetExpense || targetExpense.status !== 'pending_approval' || !['approved', 'rejected'].includes(status)) throw new Error('حالة المصروف لا تسمح بهذا الإجراء.');
    if (status === 'rejected' && !reason?.trim()) throw new Error('يجب تسجيل سبب رفض المصروف.');
    if (status === 'approved' && targetExpense.specialAuditRequired && !reason?.trim()) throw new Error('هذا المصروف تجاوز حد الصرف الفردي أو الشهري؛ أضف ملاحظة التدقيق قبل الاعتماد.');
    const linkedAccountForApproval = status === 'approved' && targetExpense.standingAccountId
      ? this.standingAccounts.find((item) => item.id === targetExpense.standingAccountId)
      : undefined;
    if (status === 'approved' && targetExpense.standingAccountId && (!linkedAccountForApproval || linkedAccountForApproval.active === false)) throw new Error('حساب المورد المرتبط غير موجود أو موقوف؛ لا يمكن اعتماد المصروف.');
    const existingAccountInvoice = linkedAccountForApproval
      ? (linkedAccountForApproval.entries || []).find((entry) =>
          entry.expenseId === targetExpense.id ||
          (Boolean(targetExpense.invoiceNumber?.trim()) && entry.reference?.trim().toLowerCase() === targetExpense.invoiceNumber.trim().toLowerCase()))
      : undefined;
    if (existingAccountInvoice?.expenseId && existingAccountInvoice.expenseId !== targetExpense.id) throw new Error('الفاتورة مرتبطة مسبقاً بمصروف آخر في دفتر المورد.');
    if (existingAccountInvoice && Math.abs(existingAccountInvoice.amount - targetExpense.totalWithTax) > 0.01) throw new Error('قيمة الفاتورة في دفتر المورد لا تطابق إجمالي المصروف؛ راجع الفاتورة قبل الاعتماد.');
    this.expenses = this.expenses.map((expense) => expense.id === expenseId ? {
      ...expense,
      status,
      approvedBy: status === 'approved' ? currentUser.name : expense.approvedBy,
      approvedAt: status === 'approved' ? new Date().toLocaleString('ar-AE') : expense.approvedAt,
      approvalNotes: status === 'approved' ? reason?.trim() : expense.approvalNotes,
      rejectionReason: status === 'rejected' ? reason : undefined,
    } : expense);
    safeSet(STORAGE_KEYS.EXPENSES, this.expenses);

    if (status === 'approved' && targetExpense.standingAccountId) {
      const account = linkedAccountForApproval!;
      if (existingAccountInvoice && !existingAccountInvoice.expenseId) {
        this.standingAccounts = this.standingAccounts.map((item) => item.id === account.id ? {
          ...item,
          entries: (item.entries || []).map((entry) => entry.id === existingAccountInvoice.id ? { ...entry, expenseId: targetExpense.id, fundId: targetExpense.fundId, fundName: targetExpense.fundName } : entry),
          updatedAt: new Date().toISOString(),
        } : item);
        safeSet(STORAGE_KEYS.STANDING_ACCOUNTS, this.standingAccounts);
      } else if (!existingAccountInvoice) {
        this.appendStandingAccountEntry(account.id, {
          type: 'charge', amount: targetExpense.totalWithTax,
          date: targetExpense.expenseDate || new Date().toISOString().slice(0, 10),
          description: targetExpense.description,
          reference: targetExpense.invoiceNumber || targetExpense.code,
          fundId: targetExpense.fundId, fundName: targetExpense.fundName,
          expenseId: targetExpense.id,
        });
      }
    }

    // Refund each source fund accurately, including split-funded expenses.
    if (status === 'rejected' && !targetExpense.isSupplierCredit) {
      const refunds = targetExpense.cascadeSplit
        ? [
            { fundId: targetExpense.cascadeSplit.primaryFundId, amount: targetExpense.cascadeSplit.primaryAmount, spentAmount: targetExpense.cascadeSplit.primaryAmount },
            { fundId: targetExpense.cascadeSplit.secondaryFundId, amount: targetExpense.cascadeSplit.secondaryAmount, spentAmount: targetExpense.cascadeSplit.secondaryAmount },
          ]
        : [{
            fundId: targetExpense.fundId,
            amount: targetExpense.isDeficit ? Math.max(0, targetExpense.totalWithTax - (targetExpense.deficitAmount || 0)) : targetExpense.totalWithTax,
            spentAmount: targetExpense.totalWithTax,
          }];
      this.funds = this.funds.map((fund) => {
        const refund = refunds.filter((item) => item.fundId === fund.id).reduce((sum, item) => sum + item.amount, 0);
        const spentReduction = refunds.filter((item) => item.fundId === fund.id).reduce((sum, item) => sum + item.spentAmount, 0);
        if (refund <= 0 && spentReduction <= 0) return fund;
        const newBalance = fund.currentBalance + refund;
        const newSpent = Math.max(0, fund.spentBalance - spentReduction);
        const percentage = fund.totalAllocation > 0 ? (newBalance / fund.totalAllocation) * 100 : 0;
        return { ...fund, currentBalance: newBalance, spentBalance: newSpent,
          status: newBalance <= 0 ? 'depleted' : percentage <= fund.warningThreshold ? 'warning' : 'active' };
      });
      safeSet(STORAGE_KEYS.FUNDS, this.funds);
      if (targetExpense.taskId) {
        this.tasks = this.tasks.map((task) => task.id === targetExpense.taskId
          ? { ...task, spentAmount: Math.max(0, (task.spentAmount || 0) - targetExpense.totalWithTax) }
          : task);
        safeSet(STORAGE_KEYS.TASKS, this.tasks);
      }
    }

    this.logAudit(
      status === 'approved' ? 'اعتماد مصروف' : status === 'rejected' ? 'رفض مصروف' : 'تحديث مصروف',
      status === 'approved' ? 'approve' : status === 'rejected' ? 'reject' : 'update',
      'expense',
      expenseId,
      status === 'rejected' ? `سبب الرفض: ${reason}` : `تم الاعتماد بواسطة ${currentUser.name}`
    );
    this.notify();
  }

  // --- Tasks ---
  public getTasks(): Task[] {
    return [...this.tasks];
  }

  public addTask(taskData: Omit<Task, 'id' | 'spentAmount' | 'history' | 'createdAt'>): Task {
    const currentUser = this.getCurrentUser();
    const newTask: Task = {
      ...taskData,
      id: `tsk-${Date.now()}`,
      spentAmount: 0,
      createdAt: new Date().toISOString().split('T')[0],
      history: [
        {
          id: `h-${Date.now()}`,
          action: `إنشاء المهمة وتكليف ${taskData.assigneeName}`,
          performedBy: currentUser.name,
          timestamp: new Date().toLocaleString('ar-AE'),
        }
      ],
    };
    this.tasks = [newTask, ...this.tasks];
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('إنشاء مهمة ميدانية', 'create', 'task', newTask.id, `المهمة: ${newTask.title} في الموقع ${newTask.location}`);
    this.addNotification({
      title: 'تكليف مهمة جديدة',
      message: `تم تكليف ${newTask.assigneeName} بالمهمة الميدانية "${newTask.title}".`,
      type: 'info',
      targetView: 'tasks',
    });
    this.notify();
    return newTask;
  }

  public updateTaskStatus(taskId: string, status: TaskStatus): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `تغيير الحالة إلى: ${status}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ],
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('تحديث حالة مهمة', 'update', 'task', taskId, `الحالة الجديدة: ${status}`);
    this.notify();
  }

  public startTask(taskId: string, coords?: { lat: number; lng: number }): void {
    const currentUser = this.getCurrentUser();
    const now = new Date().toISOString();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'in_progress',
          actualStartTime: now,
          isPaused: false,
          geoCoordinates: coords || t.geoCoordinates,
          mapsUrl: coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : t.mapsUrl,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: coords
                ? `بدء تنفيذ المهمة وتوثيق الوقت الفعلي وموقع التنفيذ GPS (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
                : 'بدء تنفيذ المهمة الميدانية وتوثيق وقت البدء الفعلي',
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ],
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('بدء مهمة', 'update', 'task', taskId, coords ? `بدء التنفيذ الفعلي مع إحداثيات GPS (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})` : 'بدء التنفيذ الفعلي للمهمة');
    this.notify();
  }

  public toggleTaskChecklistItem(taskId: string, checklistItemId: string): void {
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          checklist: t.checklist.map((c) => (c.id === checklistItemId ? { ...c, completed: !c.completed } : c)),
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public deleteTask(taskId: string): void {
    const t = this.tasks.find((task) => task.id === taskId);
    this.tasks = this.tasks.filter((task) => task.id !== taskId);
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('حذف مهمة', 'delete', 'task', taskId, `تم حذف ${t?.title || taskId}`);
    this.notify();
  }

  public updateTaskDetails(taskId: string, updates: Partial<Task>): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          ...updates,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `تحديث بيانات المهمة بواسطة ${currentUser.name}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public rescheduleTask(taskId: string, newDueDate: string, reason?: string): void {
    const currentUser = this.getCurrentUser();
    let oldDueDate = '';
    let taskTitle = '';

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        oldDueDate = t.dueDate;
        taskTitle = t.title;
        const actionDesc = reason
          ? `تأجيل الموعد من (${oldDueDate}) إلى (${newDueDate}) - السبب: ${reason}`
          : `تأجيل الموعد من (${oldDueDate}) إلى (${newDueDate})`;
        return {
          ...t,
          dueDate: newDueDate,
          startDate: newDueDate,
          status: t.status === 'completed' || t.status === 'approved' ? t.status : 'scheduled',
          outcomeReason: reason || t.outcomeReason,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: actionDesc,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            },
          ],
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('تأجيل موعد مهمة', 'update', 'task', taskId, `تم تأجيل "${taskTitle}" من ${oldDueDate} إلى ${newDueDate}`);
    this.addNotification({
      title: 'إعادة جدولة مهمة',
      message: `تم ترحيل موعد "${taskTitle}" إلى ${newDueDate}`,
      type: 'info',
      targetView: 'calendar',
    });
    this.notify();
  }

  public startTaskTimer(taskId: string): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const nextStatus: TaskStatus = t.status === 'new' || t.status === 'scheduled' || t.status === 'todo' ? 'started' : t.status;
        return {
          ...t,
          status: nextStatus,
          isTimerRunning: true,
          timerStartedAt: new Date().toISOString(),
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `بدء عداد وقت التنفيذ الميداني بواسطة ${currentUser.name}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('بدء مؤقت المهمة', 'update', 'task', taskId, 'بدء احتساب وقت العمل الميداني');
    this.notify();
  }

  public stopTaskTimer(taskId: string): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId && t.isTimerRunning && t.timerStartedAt) {
        const startedTime = new Date(t.timerStartedAt).getTime();
        const elapsedMinutes = Math.max(1, Math.round((Date.now() - startedTime) / 60000));
        const totalMinutes = (t.timeSpentMinutes || 0) + elapsedMinutes;
        return {
          ...t,
          isTimerRunning: false,
          timerStartedAt: undefined,
          timeSpentMinutes: totalMinutes,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `إيقاف المؤقت بعد تسجيل ${elapsedMinutes} دقيقة عمل (المجموع: ${totalMinutes} دقيقة)`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public pauseTask(taskId: string, reason: string): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        let elapsed = 0;
        if (t.isTimerRunning && t.timerStartedAt) {
          elapsed = Math.max(1, Math.round((Date.now() - new Date(t.timerStartedAt).getTime()) / 60000));
        }
        return {
          ...t,
          status: 'paused',
          isPaused: true,
          pausedAt: new Date().toLocaleString('ar-AE'),
          pauseReason: reason,
          isTimerRunning: false,
          timerStartedAt: undefined,
          timeSpentMinutes: (t.timeSpentMinutes || 0) + elapsed,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `إيقاف مؤقت للمهمة: ${reason}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('إيقاف مؤقت لمهمة', 'update', 'task', taskId, `سبب الإيقاف: ${reason}`);
    this.notify();
  }

  public resumeTask(taskId: string): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'in_progress',
          isPaused: false,
          isTimerRunning: true,
          timerStartedAt: new Date().toISOString(),
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: 'استئناف تنفيذ المهمة وتشغيل العداد الزمني',
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('استئناف مهمة', 'update', 'task', taskId, 'تم استئناف العمل الميداني');
    this.notify();
  }

  public addTaskDailyUpdate(taskId: string, text: string): void {
    const currentUser = this.getCurrentUser();
    const newUpdate: TaskDailyUpdate = {
      id: `du-${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      date: new Date().toISOString().split('T')[0],
      text,
      createdAt: new Date().toLocaleString('ar-AE'),
    };
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          dailyUpdates: [...(t.dailyUpdates || []), newUpdate],
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public updateTaskStepStatus(taskId: string, stepId: string, status: TaskStep['status'], notes?: string, nextStepDate?: string): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId && t.steps) {
        const updatedSteps = t.steps.map((s) => {
          if (s.id === stepId) {
            return {
              ...s,
              status,
              notes: notes !== undefined ? notes : s.notes,
              nextStepDate: nextStepDate !== undefined ? nextStepDate : s.nextStepDate,
              completedAt: status === 'completed' ? new Date().toLocaleString('ar-AE') : s.completedAt,
            };
          }
          return s;
        });
        return {
          ...t,
          steps: updatedSteps,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `تحديث مرحلة العمل [${t.steps.find((s) => s.id === stepId)?.title}]: ${status}${nextStepDate ? ` (موعد الخطوة القادمة: ${nextStepDate})` : ''}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public addSubTask(taskId: string, subTask: Omit<SubTask, 'id'>): void {
    const newSub: SubTask = {
      ...subTask,
      id: `sub-${Date.now()}`,
    };
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          subTasks: [...(t.subTasks || []), newSub],
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public updateSubTaskStatus(taskId: string, subTaskId: string, status: TaskStatus): void {
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId && t.subTasks) {
        return {
          ...t,
          subTasks: t.subTasks.map((s) => (s.id === subTaskId ? { ...s, status } : s)),
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  public recordTaskOutcome(
    taskId: string,
    payload: {
      outcome: TaskOutcome;
      reason?: string;
      notes?: string;
      proofUrl?: string;
      followUp?: {
        title: string;
        dueDate: string;
        dueTime?: string;
        reason?: string;
        notes?: string;
        assigneeId?: string;
        assigneeName?: string;
      };
    }
  ): { updatedTask: Task; followUpTask?: Task } {
    const currentUser = this.getCurrentUser();
    let updatedTaskRef: Task | undefined;
    let followUpTaskRef: Task | undefined;

    // 1. If timer was running, compute final time
    let extraMinutes = 0;
    const existing = this.tasks.find((t) => t.id === taskId);
    if (existing?.isTimerRunning && existing.timerStartedAt) {
      extraMinutes = Math.max(1, Math.round((Date.now() - new Date(existing.timerStartedAt).getTime()) / 60000));
    }

    const outcomeLabels: Record<TaskOutcome, string> = {
      completed: 'مكتملة بالكامل',
      partially_completed: 'مكتملة جزئياً',
      not_completed: 'غير مكتملة',
      unable_to_execute: 'تعذر التنفيذ الميداني',
      needs_followup: 'تتطلب متابعة لاحقة',
    };

    const isFullyDone = payload.outcome === 'completed';
    const targetStatus: TaskStatus = isFullyDone ? 'pending_approval' : 'deferred';

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const totalTime = (t.timeSpentMinutes || 0) + extraMinutes;
        const currentChain: TaskChainNode[] = t.taskChain || [
          {
            id: t.id,
            title: t.title,
            status: targetStatus,
            outcome: payload.outcome,
            outcomeReason: payload.reason,
            date: new Date().toISOString().split('T')[0],
            assigneeName: t.assigneeName,
          }
        ];

        const updated: Task = {
          ...t,
          status: targetStatus,
          outcome: payload.outcome,
          outcomeReason: payload.reason,
          outcomeNotes: payload.notes,
          outcomeSubmittedAt: new Date().toLocaleString('ar-AE'),
          proofAttachmentUrl: payload.proofUrl || t.proofAttachmentUrl,
          isTimerRunning: false,
          timerStartedAt: undefined,
          timeSpentMinutes: totalTime,
          taskChain: currentChain,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `تسجيل النتيجة الميدانية: ${outcomeLabels[payload.outcome]}${payload.reason ? ` (السبب: ${payload.reason})` : ''}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
        updatedTaskRef = updated;
        return updated;
      }
      return t;
    });

    // 2. If follow up task is requested, create it and link the task chain!
    if (payload.followUp && updatedTaskRef) {
      const parentTask = updatedTaskRef;
      const followUpAssigneeId = payload.followUp.assigneeId || parentTask.assigneeId;
      const followUpAssigneeName = payload.followUp.assigneeName || parentTask.assigneeName;

      const newFollowUpTask: Task = {
        id: `tsk-${Date.now()}-chain`,
        title: payload.followUp.title || `متابعة: ${parentTask.title}`,
        description: `مهمة متابعة مستمرة عن المهمة السابقة [${parentTask.title}]. السبب الرئيسي: ${payload.reason || payload.followUp.reason || 'متابعة ميدانية'}\n${payload.followUp.notes || ''}`,
        priority: parentTask.priority,
        status: 'scheduled',
        assigneeId: followUpAssigneeId,
        assigneeName: followUpAssigneeName,
        assigneeAvatar: parentTask.assigneeAvatar,
        dueDate: payload.followUp.dueDate || new Date().toISOString().split('T')[0],
        dueTime: payload.followUp.dueTime || '10:00',
        startDate: new Date().toISOString().split('T')[0],
        location: parentTask.location,
        mapsUrl: parentTask.mapsUrl,
        category: parentTask.category,
        taskType: 'متابعة لاحقة',
        clientName: parentTask.clientName,
        clientContact: parentTask.clientContact,
        clientPhone: parentTask.clientPhone,
        budget: Math.round(parentTask.budget * 0.5),
        spentAmount: 0,
        tags: [...parentTask.tags, 'سلسلة متابعة'],
        checklist: [
          { id: `chk-${Date.now()}-1`, text: `استكمال متطلبات المعالجة: ${payload.reason || 'متابعة الإجراء'}`, completed: false },
          { id: `chk-${Date.now()}-2`, text: 'فحص رضا العميل وتوقيع إشعار الإنجاز', completed: false },
        ],
        fundId: parentTask.fundId,
        createdAt: new Date().toISOString().split('T')[0],
        parentTaskId: parentTask.id,
        history: [
          {
            id: `h-${Date.now()}`,
            action: `إنشاء تلقائي ضمن سلسلة المتابعة من المهمة السابقة [${parentTask.title}]`,
            performedBy: currentUser.name,
            timestamp: new Date().toLocaleString('ar-AE'),
          }
        ],
        taskChain: [
          ...(parentTask.taskChain || []),
          {
            id: `tsk-${Date.now()}-chain`,
            title: payload.followUp.title,
            status: 'scheduled',
            date: payload.followUp.dueDate,
            assigneeName: followUpAssigneeName,
          }
        ]
      };

      // Link chain in parent task
      this.tasks = this.tasks.map((t) => {
        if (t.id === parentTask.id) {
          return {
            ...t,
            chainFollowUpTaskId: newFollowUpTask.id,
            taskChain: newFollowUpTask.taskChain,
          };
        }
        return t;
      });

      this.tasks = [newFollowUpTask, ...this.tasks];
      followUpTaskRef = newFollowUpTask;

      // Also create a record in this.followUps for visibility in the legacy follow-ups view
      const newFollowUpRecord: FollowUp = {
        id: `flw-${Date.now()}`,
        taskId: parentTask.id,
        taskTitle: parentTask.title,
        title: payload.followUp.title,
        urgency: 'high',
        assignedTo: followUpAssigneeName,
        scheduledDate: payload.followUp.dueDate,
        status: 'pending',
        notes: `سبب المتابعة: ${payload.reason || 'غير محدد'}. ${payload.followUp.notes || ''}`,
      };
      this.followUps = [newFollowUpRecord, ...this.followUps];
      safeSet(STORAGE_KEYS.FOLLOW_UPS, this.followUps);

      this.addNotification({
        title: 'مهمة متابعة جديدة متصلة',
        message: `تم توليد مهمة متابعة مجدولة "${newFollowUpTask.title}" للمسؤول ${followUpAssigneeName}.`,
        type: 'warning',
        targetView: 'daily',
      });
    }

    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit(
      'تسجيل نتيجة مهمة',
      'update',
      'task',
      taskId,
      `النتيجة: ${outcomeLabels[payload.outcome]} - ${payload.reason ? `السبب: ${payload.reason}` : 'بدون ملاحظات خاصة'}`
    );

    this.addNotification({
      title: isFullyDone ? 'مهمة جاهزة للاعتماد' : 'مهمة تتطلب المتابعة',
      message: `${currentUser.name} أنهى إجراءات المهمة "${existing?.title}" بنتيجة: ${outcomeLabels[payload.outcome]}.`,
      type: isFullyDone ? 'success' : 'alert',
      targetView: 'daily',
    });

    this.notify();
    return { updatedTask: updatedTaskRef!, followUpTask: followUpTaskRef };
  }

  public nudgeTask(taskId: string, senderName: string, customMessage?: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const message = customMessage || `تذكير عاجل من ${senderName}: يرجى سرعة إنجاز وتحديث المهمة "${task.title}"`;
    this.addNotification({
      title: `تنبيه ومتابعة: ${senderName}`,
      message,
      type: 'warning',
      targetView: 'daily',
    });
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `إرسال تنبيه واستعجال للمهمة بواسطة ${senderName}`,
              performedBy: senderName,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('إرسال تنبيه لمهمة', 'update', 'task', taskId, message);
    this.notify();
  }

  public requestTaskHelp(taskId: string, senderName: string, department: string, reason: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const message = `طلب مساعدة طارئة من ${senderName} في المهمة "${task.title}": [${department}] ${reason}`;
    this.addNotification({
      title: `نداء استغاثة ودعم ميداني (SOS)`,
      message,
      type: 'alert',
      targetView: 'daily',
    });
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `طلب إسناد ودعم طارئ: ${reason}`,
              performedBy: senderName,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('طلب دعم ميداني', 'update', 'task', taskId, message);
    this.notify();
  }

  // --- Task Approvals & Supervisions ---
  public approveTask(taskId: string, approvalNotes?: string): void {
    const currentUser = this.getCurrentUser();
    let targetTask: Task | undefined;

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const updated: Task = {
          ...t,
          status: 'completed',
          approvalNotes: approvalNotes || 'تم التحقق من الجودة والمطابقة والاعتماد النهائي',
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `اعتماد المهمة نهائياً بواسطة ${currentUser.name}${approvalNotes ? ` - ملاحظات: ${approvalNotes}` : ''}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
        targetTask = updated;
        return updated;
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('اعتماد مهمة ميدانية', 'approve', 'task', taskId, `تم الاعتماد والإغلاق بنجاح بواسطة ${currentUser.name}`);
    if (targetTask) {
      this.addNotification({
        title: 'تم اعتماد المهمة بنجاح',
        message: `قام ${currentUser.name} باعتماد وإغلاق المهمة الميدانية "${(targetTask as Task).title}".`,
        type: 'success',
        targetView: 'daily',
      });
    }
    this.notify();
  }

  public rejectTask(taskId: string, rejectionReason: string): void {
    const currentUser = this.getCurrentUser();
    let targetTask: Task | undefined;

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const updated: Task = {
          ...t,
          status: 'rejected',
          rejectionReason,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `رفض نتيجة المهمة من قِبل ${currentUser.name}: ${rejectionReason}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
        targetTask = updated;
        return updated;
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('رفض مهمة ميدانية', 'reject', 'task', taskId, `سبب الرفض: ${rejectionReason}`);
    if (targetTask) {
      this.addNotification({
        title: 'تم رفض مخرجات المهمة',
        message: `تم رفض المهمة "${(targetTask as Task).title}". السبب: ${rejectionReason}`,
        type: 'alert',
        targetView: 'daily',
      });
    }
    this.notify();
  }

  public sendTaskForRework(taskId: string, reworkInstructions: string): void {
    const currentUser = this.getCurrentUser();
    let targetTask: Task | undefined;

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const updated: Task = {
          ...t,
          status: 'in_progress',
          notes: `${t.notes || ''}\n[طلب إعادة عمل في ${new Date().toLocaleDateString('ar-AE')}]: ${reworkInstructions}`,
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `إعادة المهمة للتصحيح والاستكمال: ${reworkInstructions}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
        targetTask = updated;
        return updated;
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('إعادة مهمة للتصحيح', 'update', 'task', taskId, reworkInstructions);
    if (targetTask) {
      this.addNotification({
        title: 'إعادة مهمة للتصحيح الميداني',
        message: `أعاد ${currentUser.name} المهمة "${(targetTask as Task).title}" مع تعليمات: ${reworkInstructions}`,
        type: 'warning',
        targetView: 'daily',
      });
    }
    this.notify();
  }

  public bulkApproveTasks(taskIds: string[], notes?: string): void {
    taskIds.forEach((id) => this.approveTask(id, notes || 'اعتماد جماعي سريع'));
  }

  public bulkApproveExpenses(expenseIds: string[]): void {
    expenseIds.forEach((id) => this.updateExpenseStatus(id, 'approved'));
  }

  // --- Task Comments & Discussions ---
  public addTaskComment(taskId: string, text: string, isInternal: boolean = false, mentions: string[] = []): void {
    const currentUser = this.getCurrentUser();
    const comment: TaskComment = {
      id: `cmt-${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorRole: currentUser.role,
      text,
      createdAt: new Date().toLocaleString('ar-AE'),
      mentions,
      isInternal,
    };

    let targetTask: Task | undefined;
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const existingComments = t.comments || [];
        const updated: Task = {
          ...t,
          comments: [...existingComments, comment],
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `إضافة تعليق ومناقشة ${isInternal ? '(داخلي)' : ''}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
        targetTask = updated;
        return updated;
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('تعليق على مهمة', 'update', 'task', taskId, `${currentUser.name}: ${text.slice(0, 40)}...`);
    if (targetTask && (targetTask as Task).assigneeId !== currentUser.id) {
      this.addNotification({
        title: `تعليق جديد على المهمة "${(targetTask as Task).title}"`,
        message: `${currentUser.name}: ${text.slice(0, 60)}...`,
        type: 'info',
        targetView: 'daily',
      });
    }
    this.notify();
  }

  // --- Task Attachments Hub ---
  public addTaskAttachment(taskId: string, attachment: { name: string; url: string; size: string; type: string }): void {
    const currentUser = this.getCurrentUser();
    const newAttachment: TaskAttachment = {
      id: `att-${Date.now()}`,
      name: attachment.name,
      url: attachment.url,
      size: attachment.size,
      type: attachment.type,
      uploadedBy: currentUser.name,
      uploadedAt: new Date().toLocaleString('ar-AE'),
    };

    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId) {
        const existingAtt = t.attachments || [];
        return {
          ...t,
          attachments: [...existingAtt, newAttachment],
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `إرفاق مستند/إثبات: ${attachment.name}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.logAudit('إرفاق مستند لمهمة', 'update', 'task', taskId, `ملف: ${attachment.name}`);
    this.notify();
  }

  public deleteTaskAttachment(taskId: string, attachmentId: string): void {
    const currentUser = this.getCurrentUser();
    this.tasks = this.tasks.map((t) => {
      if (t.id === taskId && t.attachments) {
        return {
          ...t,
          attachments: t.attachments.filter((a) => a.id !== attachmentId),
          history: [
            ...t.history,
            {
              id: `h-${Date.now()}`,
              action: `حذف مرفق بواسطة ${currentUser.name}`,
              performedBy: currentUser.name,
              timestamp: new Date().toLocaleString('ar-AE'),
            }
          ]
        };
      }
      return t;
    });
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    this.notify();
  }

  // --- Settlements ---
  public getSettlements(): Settlement[] {
    return [...this.settlements];
  }

  public addSettlement(settlementData: Omit<Settlement, 'id' | 'code' | 'status' | 'submittedAt' | 'settledBy'>): Settlement {
    const currentUser = this.getCurrentUser();
    if (!hasPermission(currentUser.role, 'settlements', 'create')) throw new Error('لا تملك صلاحية إنشاء التسويات.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settlementData.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(settlementData.periodEnd) || settlementData.periodStart > settlementData.periodEnd) throw new Error('فترة التسوية غير صالحة.');
    const fund = this.funds.find((item) => item.id === settlementData.fundId);
    if (!fund) throw new Error('العهدة المحددة غير موجودة.');
    const selectedIds = [...new Set(settlementData.expenseIds)];
    const alreadyReserved = new Set(this.settlements.filter((item) => item.status !== 'rejected').flatMap((item) => item.expenseIds));
    if (selectedIds.some((id) => alreadyReserved.has(id))) throw new Error('إحدى الفواتير مرتبطة بطلب تسوية قائم بالفعل.');
    if (selectedIds.length === 0) throw new Error('لا توجد مصروفات معتمدة ضمن التسوية.');
    const selectedExpenses = selectedIds.map((id) => this.expenses.find((expense) => expense.id === id));
    if (selectedExpenses.some((expense) => !expense || expense.fundId !== fund.id || expense.status !== 'approved')) throw new Error('تحتوي التسوية على مصروف غير معتمد أو تابع لعهدة أخرى.');
    if (selectedExpenses.some((expense) => {
      const expenseDate = expense?.expenseDate || expense?.submittedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      return !expenseDate || expenseDate < settlementData.periodStart || expenseDate > settlementData.periodEnd;
    })) throw new Error('توجد فاتورة خارج فترة التسوية أو بلا تاريخ مصروف موثق.');
    const verifiedTotal = selectedExpenses.reduce((sum, expense) => sum + (expense?.totalWithTax || 0), 0);
    const newSettlement: Settlement = {
      ...settlementData,
      totalExpenses: verifiedTotal,
      expensesCount: selectedIds.length,
      expenseIds: selectedIds,
      id: `stl-${Date.now()}`,
      code: `STL-${new Date().getFullYear()}-${String(this.settlements.length + 1).padStart(5, '0')}`,
      status: 'under_review',
      submittedAt: new Date().toLocaleString('ar-AE'),
      settledBy: currentUser.name,
      settlementVoucherNumber: `VCH-STL-${new Date().getFullYear()}-${String(this.settlements.length + 1).padStart(5, '0')}`,
    };
    this.settlements = [newSettlement, ...this.settlements];
    safeSet(STORAGE_KEYS.SETTLEMENTS, this.settlements);

    // Expenses remain approved until the settlement is formally approved.

    this.logAudit('رفع تسوية عهدة', 'settle', 'settlement', newSettlement.id, `تسوية لعهدة ${newSettlement.fundName} بإجمالي مصروفات ${newSettlement.totalExpenses} ${this.settings.currency}`);
    this.addNotification({
      title: 'طلب تسوية عهدة قيد المراجعة',
      message: `تم رفع تسوية جديدة من قِبل ${newSettlement.holderName} لعهدة ${newSettlement.fundName}.`,
      type: 'info',
      targetView: 'settlements',
    });
    this.notify();
    return newSettlement;
  }

  public approveSettlement(settlementId: string, auditNotes?: string): void {
    const currentUser = this.getCurrentUser();
    if (!hasPermission(currentUser.role, 'settlements', 'approve')) throw new Error('لا تملك صلاحية اعتماد التسويات.');
    const settlement = this.settlements.find((item) => item.id === settlementId);
    if (!settlement || !['under_review', 'audited'].includes(settlement.status)) throw new Error('التسوية غير موجودة أو سبق اعتمادها.');
    const selected = settlement.expenseIds.map((id) => this.expenses.find((expense) => expense.id === id));
    if (selected.some((expense) => !expense || expense.status !== 'approved' || expense.fundId !== settlement.fundId)) throw new Error('تعذر الاعتماد: تغيرت حالة إحدى الفواتير أو لم تعد مطابقة للتسوية.');

    const notes = [settlement.auditNotes, auditNotes?.trim()].filter(Boolean).join(' | ');
    if (this.settings.requireDualApprovalForSettlements && settlement.status === 'under_review') {
      this.settlements = this.settlements.map((item) => item.id === settlementId ? {
        ...item,
        status: 'audited',
        auditedBy: currentUser.name,
        auditedById: currentUser.id,
        auditedAt: new Date().toLocaleString('ar-AE'),
        auditNotes: notes || item.auditNotes,
      } : item);
      safeSet(STORAGE_KEYS.SETTLEMENTS, this.settlements);
      this.logAudit('تدقيق تسوية - المرحلة الأولى', 'approve', 'settlement', settlementId, `تم التدقيق الأولي بواسطة ${currentUser.name}، وتنتظر اعتماداً نهائياً من مستخدم آخر.`);
      this.addNotification({
        title: 'تسوية جاهزة للاعتماد النهائي',
        message: `أكمل ${currentUser.name} التدقيق الأولي للتسوية ${settlement.code}. يلزم معتمد آخر لإغلاقها.`,
        type: 'info',
        targetView: 'settlements',
      });
      this.notify();
      return;
    }

    if (this.settings.requireDualApprovalForSettlements && settlement.status === 'audited') {
      if (!settlement.auditedBy) throw new Error('لا يوجد مدقق أول مسجل لهذه التسوية؛ أعد إرسالها للمراجعة.');
      if ((settlement.auditedById && settlement.auditedById === currentUser.id) || (!settlement.auditedById && settlement.auditedBy === currentUser.name)) throw new Error('يشترط أن يكون الاعتماد النهائي بواسطة مستخدم مختلف عن المدقق الأول.');
    }

    this.settlements = this.settlements.map((item) => item.id === settlementId ? {
      ...item,
      status: 'approved',
      approvedBy: currentUser.name,
      approvedAt: new Date().toLocaleString('ar-AE'),
      auditNotes: notes || item.auditNotes,
    } : item);
    const selectedIds = new Set(settlement.expenseIds);
    this.expenses = this.expenses.map((expense) => selectedIds.has(expense.id) ? { ...expense, status: 'settled' } : expense);
    safeSet(STORAGE_KEYS.SETTLEMENTS, this.settlements);
    safeSet(STORAGE_KEYS.EXPENSES, this.expenses);
    this.logAudit('اعتماد نهائي لتسوية عهدة', 'approve', 'settlement', settlementId, `تم الاعتماد النهائي وإغلاق التسوية بواسطة ${currentUser.name}`);
    this.notify();
  }

  public rejectSettlement(settlementId: string, reason: string): void {
    const currentUser = this.getCurrentUser();
    if (!hasPermission(currentUser.role, 'settlements', 'approve')) throw new Error('لا تملك صلاحية رفض التسويات.');
    if (!reason?.trim()) throw new Error('يجب تسجيل سبب رفض التسوية.');
    const settlement = this.settlements.find((item) => item.id === settlementId);
    if (!settlement || !['under_review', 'audited'].includes(settlement.status)) throw new Error('لا يمكن رفض هذه التسوية؛ ربما سبق اعتمادها أو رفضها.');
    this.settlements = this.settlements.map((item) => item.id === settlementId
      ? { ...item, status: 'rejected', auditNotes: reason.trim() }
      : item);
    safeSet(STORAGE_KEYS.SETTLEMENTS, this.settlements);
    this.logAudit('رفض تسوية عهدة', 'reject', 'settlement', settlementId, `سبب الرفض: ${reason.trim()}`);
    this.addNotification({
      title: 'رفض طلب تسوية عهدة',
      message: `تم رفض التسوية ${settlement.code} وإعادة فواتيرها إلى قائمة الفواتير المعتمدة غير المسواة.`,
      type: 'warning',
      targetView: 'settlements',
    });
    this.notify();
  }

  // --- Follow Ups ---
  public getFollowUps(): FollowUp[] {
    return [...this.followUps];
  }

  public addFollowUp(item: Omit<FollowUp, 'id' | 'status'>): FollowUp {
    const newFollowUp: FollowUp = {
      ...item,
      id: `flw-${Date.now()}`,
      status: 'pending',
    };
    this.followUps = [newFollowUp, ...this.followUps];
    safeSet(STORAGE_KEYS.FOLLOW_UPS, this.followUps);
    this.notify();
    return newFollowUp;
  }

  public updateFollowUpStatus(id: string, status: 'pending' | 'resolved' | 'escalated'): void {
    this.followUps = this.followUps.map((f) => (f.id === id ? { ...f, status } : f));
    safeSet(STORAGE_KEYS.FOLLOW_UPS, this.followUps);
    this.notify();
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs];
  }

  public logAudit(
    action: string,
    actionType: AuditLog['actionType'],
    entity: AuditLog['entity'],
    entityId: string,
    details: string
  ): void {
    const currentUser = this.getCurrentUser();
    const newLog: AuditLog = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action,
      actionType,
      entity,
      entityId,
      details,
      timestamp: new Date().toLocaleString('ar-AE'),
      ipAddress: '192.168.1.' + Math.floor(10 + Math.random() * 200),
    };
    this.auditLogs = [newLog, ...this.auditLogs.slice(0, 150)];
    safeSet(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs);
  }

  // --- Notifications ---
  public getNotifications(): NotificationItem[] {
    return [...this.notifications];
  }

  public addNotification(item: Omit<NotificationItem, 'id' | 'createdAt' | 'isRead'>): void {
    const newNotif: NotificationItem = {
      ...item,
      id: `notif-${Date.now()}`,
      createdAt: 'الآن',
      isRead: false,
    };
    this.notifications = [newNotif, ...this.notifications];
    safeSet(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    this.notify();
  }

  public markAllNotificationsRead(): void {
    this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
    safeSet(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    this.notify();
  }

  public markNotificationRead(id: string): void {
    this.notifications = this.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    safeSet(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    this.notify();
  }

  // --- Settings ---
  public getSettings(): SystemSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<SystemSettings>): void {
    if (!hasPermission(this.getCurrentUser().role, 'settings', 'edit')) throw new Error('لا تملك صلاحية تعديل إعدادات النظام.');
    if (newSettings.autoCaptureLocationWithoutApproval !== undefined && this.getCurrentUser().role !== 'admin') throw new Error('سياسة التقاط الموقع التلقائي متاحة لمدير النظام فقط.');
    const nextSettings = { ...this.settings, ...newSettings };
    if (!/^[A-Z]{3}$/.test(nextSettings.currency)) throw new Error('رمز العملة يجب أن يتكون من ثلاثة أحرف كبيرة.');
    if (!Number.isFinite(nextSettings.taxRate) || nextSettings.taxRate < 0 || nextSettings.taxRate > 100) throw new Error('نسبة الضريبة يجب أن تكون بين 0 و100.');
    if (!Number.isFinite(nextSettings.fundWarningThresholdPercent) || nextSettings.fundWarningThresholdPercent < 0 || nextSettings.fundWarningThresholdPercent > 100) throw new Error('حد إنذار العهد يجب أن يكون بين 0 و100.');
    if (!Number.isFinite(nextSettings.singleExpenseLimit) || nextSettings.singleExpenseLimit < 0) throw new Error('حد الصرف الفردي غير صالح.');
    if (newSettings.currency !== undefined && newSettings.currency !== this.settings.currency && this.funds.some((fund) => fund.currency !== nextSettings.currency)) throw new Error('لا يمكن تغيير عملة النظام مع وجود عهد بعملة مختلفة؛ يلزم إعداد خطة تحويل ومطابقة أرصدة قبل التغيير.');
    this.settings = nextSettings;
    safeSet(STORAGE_KEYS.SETTINGS, this.settings);
    this.logAudit('تحديث إعدادات النظام', 'update', 'system', 'sys-cfg', 'تم تحديث سياسات ومعايير التشغيل بنجاح.');
    this.notify();
  }

  // --- Database Stats & Backup Operations ---
  public getDatabaseStats() {
    const totalExpensesAmount = this.expenses.reduce((s, e) => s + e.totalWithTax, 0);
    const totalAllocation = this.funds.reduce((s, f) => s + f.totalAllocation, 0);
    const totalCurrentBalance = this.funds.reduce((s, f) => s + f.currentBalance, 0);
    const jsonStr = JSON.stringify({
      users: this.users,
      funds: this.funds,
      expenses: this.expenses,
      tasks: this.tasks,
      settlements: this.settlements,
      followUps: this.followUps,
      auditLogs: this.auditLogs,
      notifications: this.notifications,
      settings: this.settings,
    });
    const approximateSizeKb = Math.round((new Blob([jsonStr]).size / 1024) * 10) / 10;

    return {
      usersCount: this.users.length,
      fundsCount: this.funds.length,
      expensesCount: this.expenses.length,
      tasksCount: this.tasks.length,
      settlementsCount: this.settlements.length,
      followUpsCount: this.followUps.length,
      auditLogsCount: this.auditLogs.length,
      notificationsCount: this.notifications.length,
      totalExpensesAmount,
      totalAllocation,
      totalCurrentBalance,
      approximateSizeKb,
      lastUpdated: new Date().toLocaleString('ar-AE'),
    };
  }

  public exportDatabase(): string {
    const backupData = {
      exportVersion: '3.0',
      exportedAt: new Date().toISOString(),
      appName: this.settings.appName,
      data: {
        users: this.users,
        currentUserId: this.currentUserId,
        funds: this.funds,
        expenses: this.expenses,
        tasks: this.tasks,
        settlements: this.settlements,
        followUps: this.followUps,
        auditLogs: this.auditLogs,
        notifications: this.notifications,
        settings: this.settings,
      },
    };
    return JSON.stringify(backupData, null, 2);
  }

  public importDatabase(jsonStr: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonStr);
      const data = parsed.data || parsed;
      if (!data.funds && !data.expenses && !data.tasks) {
        return { success: false, error: 'الملف لا يحتوي على بنية بيانات نظام صالحة.' };
      }
      if (Array.isArray(data.users)) this.users = data.users;
      if (typeof data.currentUserId === 'string') this.currentUserId = data.currentUserId;
      if (Array.isArray(data.funds)) this.funds = data.funds;
      if (Array.isArray(data.expenses)) this.expenses = data.expenses;
      if (Array.isArray(data.tasks)) this.tasks = data.tasks;
      if (Array.isArray(data.settlements)) this.settlements = data.settlements;
      if (Array.isArray(data.followUps)) this.followUps = data.followUps;
      if (Array.isArray(data.auditLogs)) this.auditLogs = data.auditLogs;
      if (Array.isArray(data.notifications)) this.notifications = data.notifications;
      if (data.settings) this.settings = { ...DEFAULT_SETTINGS, ...data.settings };

      safeSet(STORAGE_KEYS.USERS, this.users);
      safeSet(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
      safeSet(STORAGE_KEYS.FUNDS, this.funds);
      safeSet(STORAGE_KEYS.EXPENSES, this.expenses);
      safeSet(STORAGE_KEYS.TASKS, this.tasks);
      safeSet(STORAGE_KEYS.SETTLEMENTS, this.settlements);
      safeSet(STORAGE_KEYS.FOLLOW_UPS, this.followUps);
      safeSet(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs);
      safeSet(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
      safeSet(STORAGE_KEYS.SETTINGS, this.settings);

      this.logAudit('استيراد قاعدة بيانات', 'create', 'system', 'sys-import', 'تم استيراد نسخة احتياطية بنجاح.');
      this.notify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'صيغة ملف JSON غير صالحة' };
    }
  }

  // --- Reset All Data ---
  public resetToDefault(): void {
    if (this.getCurrentUser().role !== 'admin') throw new Error('إعادة تهيئة البيانات متاحة لمدير النظام فقط.');
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    this.users = INITIAL_USERS;
    this.currentUserId = 'usr-1';
    this.funds = INITIAL_FUNDS;
    this.expenses = INITIAL_EXPENSES;
    this.tasks = INITIAL_TASKS;
    this.settlements = INITIAL_SETTLEMENTS;
    this.followUps = INITIAL_FOLLOW_UPS;
    this.auditLogs = INITIAL_AUDIT_LOGS;
    this.notifications = INITIAL_NOTIFICATIONS;
    this.cashReceipts = INITIAL_CASH_RECEIPTS;
    this.standingAccounts = INITIAL_STANDING_ACCOUNTS;
    this.settings = DEFAULT_SETTINGS;

    safeSet(STORAGE_KEYS.USERS, this.users);
    safeSet(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
    safeSet(STORAGE_KEYS.FUNDS, this.funds);
    safeSet(STORAGE_KEYS.EXPENSES, this.expenses);
    safeSet(STORAGE_KEYS.TASKS, this.tasks);
    safeSet(STORAGE_KEYS.SETTLEMENTS, this.settlements);
    safeSet(STORAGE_KEYS.FOLLOW_UPS, this.followUps);
    safeSet(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs);
    safeSet(STORAGE_KEYS.NOTIFICATIONS, this.notifications);
    safeSet(STORAGE_KEYS.CASH_RECEIPTS, this.cashReceipts);
    safeSet(STORAGE_KEYS.STANDING_ACCOUNTS, this.standingAccounts);
    safeSet(STORAGE_KEYS.SETTINGS, this.settings);

    this.notify();
  }
}

export const dataStore = OpsDataStore.getInstance();
