export type Role = 'admin' | 'ops_manager' | 'finance_officer' | 'field_officer' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleTitleAr: string;
  phone: string;
  department: string;
  avatar: string;
  active: boolean;
  assignedFundsCount?: number;
  activeTasksCount?: number;
}

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export type TaskStatus = 
  | 'new'
  | 'scheduled'
  | 'started'
  | 'in_progress'
  | 'paused'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'cancelled'
  | 'todo'       // backward compatibility
  | 'review'     // backward compatibility
  | 'completed'; // backward compatibility

export type TaskOutcome = 
  | 'completed'
  | 'partially_completed'
  | 'not_completed'
  | 'unable_to_execute'
  | 'needs_followup';

export type TaskOutcomeReason =
  | 'client_unavailable'
  | 'document_missing'
  | 'payment_pending'
  | 'needs_approval'
  | 'client_postponed'
  | 'weather_conditions'
  | 'technical_blocker'
  | 'other';

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export type TaskStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'deferred';

export interface TaskStep {
  id: string;
  title: string; // e.g. "مرحلة الشراء", "مرحلة التوريد", "مرحلة التسليم"
  status: TaskStepStatus;
  plannedTime?: string;
  completedAt?: string;
  nextStepDate?: string;
  notes?: string;
  order: number;
}

export interface SubTask {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  status: TaskStatus;
  requiresApproval?: boolean;
  isApproved?: boolean;
  approvedByManager?: boolean;
  dueDate?: string;
  notes?: string;
}

export interface TaskDailyUpdate {
  id: string;
  authorId: string;
  authorName: string;
  date: string;
  text: string;
  createdAt: string;
  timestamp?: string;
}

export interface TaskHistoryItem {
  id: string;
  action: string;
  performedBy: string;
  timestamp: string;
  by?: string;
  notes?: string;
}

export interface TaskChainNode {
  id: string;
  code?: string;
  title: string;
  status: TaskStatus;
  outcome?: TaskOutcome;
  outcomeReason?: string;
  date: string;
  assigneeName: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  size: string;
  type: string; // 'image' | 'pdf' | 'doc' | 'receipt' | 'other'
  uploadedBy: string;
  uploadedAt: string;
  location?: string; // موقع الرفع الفعلي
  geoCoordinates?: { lat: number; lng: number }; // إحداثيات الـ GPS عند الرفع
  accuracyMeters?: number;
  standingAccountId?: string; // ربط بالحساب المعتاد (مثل البقالة أو المورد)
  vendorName?: string;
  invoiceAmount?: number;
  notes?: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorRole?: string;
  text: string;
  createdAt: string;
  mentions?: string[];
  isInternal?: boolean;
}

export type TaskTypeClassification = 'administrative' | 'field' | 'financial' | 'visit';

export interface Task {
  id: string;
  code?: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string;
  assigneeName: string;
  assigneeAvatar?: string;
  supervisorId?: string;
  supervisorName?: string;
  creatorId?: string;
  creatorName?: string;
  supervisors?: Array<{ id: string; name: string; role?: string }>;
  dueDate: string;
  startDate: string;
  dueTime?: string; // e.g. "14:30"
  actualStartTime?: string;
  actualEndTime?: string;
  location: string;
  locationRequired?: boolean;
  mapsUrl?: string;
  geoCoordinates?: { lat: number; lng: number };
  category: string;
  taskType?: string; // e.g. "صيانة ميدانية", "تسليم معدات", "زيارة عميل", "تحصيل"
  taskTypeCategory?: TaskTypeClassification; // إداري، ميداني، مالي، زيارة
  clientName?: string;
  clientContact?: string;
  clientPhone?: string;
  proofRequired?: string; // e.g. "صورة الفاتورة", "توقيع العميل", "تقرير المعاينة"
  proofAttachmentUrl?: string;
  budget: number;
  spentAmount: number;
  tags: string[];
  checklist: TaskChecklistItem[];
  steps?: TaskStep[];
  subTasks?: SubTask[];
  dailyUpdates?: TaskDailyUpdate[];
  history: TaskHistoryItem[];
  fundId?: string;
  taskFundAmount?: number;
  taskFundSpent?: number;
  taskFundRemaining?: number;
  notes?: string;
  createdAt: string;
  
  // Execution Time & Pause Tracking
  timeSpentMinutes?: number;
  isTimerRunning?: boolean;
  timerStartedAt?: string;
  isPaused?: boolean;
  pausedAt?: string;
  pauseReason?: string;

  // Lifecycle Outcome
  outcome?: TaskOutcome;
  outcomeReason?: TaskOutcomeReason | string;
  outcomeNotes?: string;
  outcomeSubmittedAt?: string;
  approvalNotes?: string;
  rejectionReason?: string;

  // Task Chain & Linked Follow-ups
  parentTaskId?: string;
  chainFollowUpTaskId?: string;
  taskChain?: TaskChainNode[];

  // Attachments & Discussion
  attachments?: TaskAttachment[];
  comments?: TaskComment[];

  // Linked Vendor / Standing Account (مثل البقالة أو مورد معين)
  standingAccountId?: string;
  standingAccountName?: string;
}

export type FundStatus = 'active' | 'warning' | 'depleted' | 'closed';

export interface PettyCashFund {
  id: string;
  name: string;
  code: string;
  holderId: string;
  holderName: string;
  holderDepartment: string;
  totalAllocation: number;
  currentBalance: number;
  spentBalance: number;
  currency: string;
  status: FundStatus;
  warningThreshold: number; // e.g. 20%
  lastReplenishedDate: string;
  purpose: string;
  notes?: string;
  cashBoxBalance?: number; // السيولة النقدية الحالية بالصندوق
}

export interface CashReceipt {
  id: string;
  code: string;
  amount: number;
  source: string; // "صندوق نقدي", "دفعة عميل / قيمة طلبية", "مبالغ مخصصة للشراء", "توريد بنكي"
  type?: 'order_payment' | 'cash_box' | 'purchase_advance' | 'other';
  receivedBy: string;
  date: string;
  notes?: string;
  fundId?: string;
  fundName?: string;
  createdAt: string;
}

export interface StandingAccountInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  date: string;
  imageUrl?: string;
  location?: string;
  geoCoordinates?: { lat: number; lng: number };
  taskId?: string;
  taskTitle?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  notes?: string;
  expenseId?: string;
}

export interface StandingAccountEntry {
  id: string;
  type: 'charge' | 'settlement';
  amount: number;
  date: string;
  description: string;
  reference?: string;
  fundId?: string;
  fundName?: string;
  expenseId?: string;
  createdBy: string;
  createdAt: string;
}

export interface StandingAccount {
  id: string;
  code?: string;
  name: string; // e.g. "بقالة ومستلزمات", "بوفية وضيافة", "مواصلات ومترو", "باص ونقل", "بنزين ووقود", "شحن وتوصيل", "مؤسسة التوريدات السريعة"
  category: string;
  vendorName?: string; // اسم المورد المعتاد أو صاحب المحل
  contactPhone?: string; // رقم هاتف التواصل المباشر
  address?: string; // عنوان المتجر أو المورد
  imageUrl?: string; // صورة تعريف المنشأة أو شعارها
  referenceImageUrl?: string; // صورة فاتورة أو سند أو طلبية مرجعية
  accountType?: 'grocery' | 'vendor' | 'transport' | 'hospitality' | 'utility' | 'maintenance' | 'other';
  direction: 'receivable' | 'payable' | 'receivable_for_us' | 'payable_by_us'; // "لنا" / "علينا"
  monthlyLimit?: number;
  defaultAmount?: number;
  currentBalance?: number;
  openingBalance?: number;
  currency?: string;
  notes?: string;
  active?: boolean;
  updatedAt?: string;
  invoices?: StandingAccountInvoice[];
  entries?: StandingAccountEntry[];
  totalInvoiced?: number;
}

export type ExpenseCategory = 
  | 'transport'
  | 'materials'
  | 'hospitality'
  | 'maintenance'
  | 'government'
  | 'fuel'
  | 'tools'
  | 'other';

export type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'settled';

export interface Expense {
  id: string;
  code: string;
  fundId: string;
  fundName: string;
  amount: number;
  taxAmount: number;
  totalWithTax: number;
  category: ExpenseCategory;
  description: string;
  invoiceNumber: string;
  vendorName: string;
  merchantName?: string;
  expenseDate?: string;
  taskCode?: string;
  registeredByName?: string;
  receiptUrl?: string;
  hasReceipt: boolean;
  status: ExpenseStatus;
  submittedBy: string;
  submittedAt: string;
  auditedBy?: string;
  auditedById?: string;
  auditedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  specialAuditRequired?: boolean;
  rejectionReason?: string;
  taskId?: string;
  taskTitle?: string;
  notes?: string;

  // Deficit & Negative Balance
  isDeficit?: boolean;
  deficitAmount?: number;
  isCoveredFromCash?: boolean;
  coveredAt?: string;
  coveredBy?: string;

  // Cascade Multi-Fund Deduction
  cascadeSplit?: {
    primaryFundId: string;
    primaryFundName: string;
    primaryAmount: number;
    secondaryFundId: string;
    secondaryFundName: string;
    secondaryAmount: number;
  };

  // Standing Recurring Accounts (لنا / علينا)
  standingAccountId?: string;
  standingAccountName?: string;
  standingDirection?: 'receivable' | 'payable' | 'receivable_for_us' | 'payable_by_us';
  standingAccountEntryIds?: string[];
  isSupplierCredit?: boolean;
  isStandingAccountPayment?: boolean;
}

export type SettlementStatus = 'draft' | 'under_review' | 'audited' | 'approved' | 'closed' | 'rejected';

export interface Settlement {
  id: string;
  code: string;
  fundId: string;
  fundName: string;
  holderName: string;
  periodStart: string;
  periodEnd: string;
  advanceAmount: number;
  totalExpenses: number;
  remainingAmount: number;
  status: SettlementStatus;
  expenseIds: string[];
  expensesCount: number;
  submittedAt: string;
  settledBy: string;
  approvedBy?: string;
  approvedAt?: string;
  auditNotes?: string;
  settlementVoucherNumber?: string;
  voucherNumber?: string;
  settledByName?: string;
}

export interface FollowUp {
  id: string;
  taskId?: string;
  taskTitle?: string;
  title: string;
  urgency: 'critical' | 'high' | 'normal';
  assignedTo: string;
  scheduledDate: string;
  status: 'pending' | 'resolved' | 'escalated';
  notes: string;
  lastContactDate?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  action: string;
  actionType: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'settle' | 'auth';
  entity: 'task' | 'expense' | 'fund' | 'settlement' | 'user' | 'system';
  entityId: string;
  details: string;
  timestamp: string;
  ipAddress: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  isRead: boolean;
  createdAt: string;
  targetView?: string;
}

export interface PermissionRule {
  module: string;
  moduleAr: string;
  actions: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    approve: boolean;
  };
}
