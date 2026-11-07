export interface SourceFile {
  path: string;
  category: 'services' | 'pages' | 'finance' | 'admin' | 'database';
  name: string;
  description: string;
  code: string;
}

export const OPS_SOURCE_REGISTRY: SourceFile[] = [
  {
    path: 'database/schema.sql',
    category: 'database',
    name: 'schema.sql',
    description: 'مخطط قاعدة بيانات PostgreSQL / Supabase بالكامل مع القيود و RLS والفهارس',
    code: `-- ============================================================
-- OpsPlatform Database Schema (PostgreSQL / Supabase)
-- ============================================================

-- Custom Enum Types
CREATE TYPE role_type AS ENUM ('admin', 'ops_manager', 'finance_officer', 'field_officer', 'viewer');
CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');
CREATE TYPE task_status AS ENUM ('new', 'scheduled', 'started', 'in_progress', 'paused', 'pending_approval', 'approved', 'rejected', 'deferred', 'cancelled', 'todo', 'review', 'completed');
CREATE TYPE fund_status AS ENUM ('active', 'warning', 'depleted', 'closed');
CREATE TYPE expense_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'settled');
CREATE TYPE settlement_status AS ENUM ('draft', 'under_review', 'audited', 'approved', 'closed');

-- 1. Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role role_type NOT NULL DEFAULT 'field_officer',
  phone VARCHAR(50),
  department VARCHAR(100),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Petty Cash Funds (العهد النقدية)
CREATE TABLE petty_cash_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  holder_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  total_allocation DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  current_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  spent_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'AED',
  status fund_status DEFAULT 'active',
  warning_threshold_percent INT DEFAULT 30,
  last_replenished_at DATE DEFAULT CURRENT_DATE,
  purpose TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Operational Tasks (المهام الميدانية)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority task_priority DEFAULT 'medium',
  status task_status DEFAULT 'scheduled',
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  fund_id UUID REFERENCES petty_cash_funds(id) ON DELETE SET NULL,
  due_date DATE,
  start_date DATE DEFAULT CURRENT_DATE,
  location VARCHAR(255),
  client_name VARCHAR(255),
  budget DECIMAL(12, 2) DEFAULT 0.00,
  spent_amount DECIMAL(12, 2) DEFAULT 0.00,
  time_spent_minutes INT DEFAULT 0,
  proof_required TEXT,
  proof_attachment_url TEXT,
  outcome VARCHAR(50),
  outcome_reason TEXT,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_chain JSONB DEFAULT '[]'::jsonb,
  checklist JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Expenses & Invoices (المصروفات والفواتير والضريبة 5%)
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  fund_id UUID REFERENCES petty_cash_funds(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  amount DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0.00,
  total_with_tax DECIMAL(12, 2) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  invoice_number VARCHAR(100),
  vendor_name VARCHAR(255) NOT NULL,
  receipt_url TEXT,
  status expense_status DEFAULT 'pending_approval',
  submitted_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Financial Settlements (التسويات وسندات التصفية)
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  fund_id UUID REFERENCES petty_cash_funds(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  advance_amount DECIMAL(12, 2) NOT NULL,
  total_expenses DECIMAL(12, 2) NOT NULL,
  remaining_amount DECIMAL(12, 2) NOT NULL,
  status settlement_status DEFAULT 'under_review',
  expense_ids UUID[] NOT NULL,
  settled_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  settlement_voucher_number VARCHAR(100),
  audit_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Audit Logs (سجل التدقيق الأمني)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  details TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_expenses_fund ON expenses(fund_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_settlements_fund ON settlements(fund_id);`,
  },
  {
    path: 'database/seed.sql',
    category: 'database',
    name: 'seed.sql',
    description: 'بيانات أولية تجريبية واقعية جاهزة للتنفيذ في Supabase أو PostgreSQL',
    code: `-- ============================================================
-- OpsPlatform Initial Seed Data (PostgreSQL / Supabase)
-- ============================================================

INSERT INTO users (id, name, email, role, phone, department) VALUES 
  ('a1111111-1111-1111-1111-111111111111', 'سلطان المنصوري', 'sultan@ops.ae', 'admin', '+971 50 123 4567', 'الإدارة العامة'),
  ('a2222222-2222-2222-2222-222222222222', 'راشد النعيمي', 'rashed@ops.ae', 'ops_manager', '+971 50 987 6543', 'إدارة العمليات'),
  ('a3333333-3333-3333-3333-333333333333', 'فاطمة الزعابي', 'fatima@ops.ae', 'finance_officer', '+971 52 345 6789', 'المالية والتدقيق'),
  ('a4444444-4444-4444-4444-444444444444', 'أحمد الشامسي', 'ahmed@ops.ae', 'field_officer', '+971 55 456 7890', 'العمليات الميدانية'),
  ('a5555555-5555-5555-5555-555555555555', 'خالد المري', 'khaled@ops.ae', 'field_officer', '+971 56 678 1234', 'العمليات والصيانة')
ON CONFLICT (email) DO NOTHING;

INSERT INTO petty_cash_funds (id, code, name, holder_id, total_allocation, current_balance, spent_balance, currency, status, purpose) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'PCF-2026-001', 'عهدة العمليات الميدانية - المنطقة الغربية A', 'a4444444-4444-4444-4444-444444444444', 25000.00, 8450.00, 16550.00, 'AED', 'warning', 'تغطية مصاريف الصيانة السريعة وقطع الغيار الطارئة'),
  ('b2222222-2222-2222-2222-222222222222', 'PCF-2026-002', 'عهدة الصيانة الطارئة - فرع دبي', 'a5555555-5555-5555-5555-555555555555', 15000.00, 10850.00, 4150.00, 'AED', 'active', 'مستلزمات صيانة فورية لفرع دبي')
ON CONFLICT (code) DO NOTHING;`,
  },
  {
    path: 'services/tasks.service.ts',
    category: 'services',
    name: 'tasks.service.ts',
    description: 'خدمة إدارة المهام الميدانية والفلترة وتحديث الحالات',
    code: `import { dataStore } from '../lib/storage';
import { Task, TaskPriority, TaskStatus } from '../types/domain';

export class TasksService {
  public static getAll(): Task[] {
    return dataStore.getTasks();
  }

  public static getById(id: string): Task | undefined {
    return dataStore.getTasks().find((t) => t.id === id);
  }

  public static create(data: Omit<Task, 'id' | 'spentAmount' | 'history' | 'createdAt'>): Task {
    return dataStore.addTask(data);
  }

  public static updateStatus(id: string, status: TaskStatus): void {
    dataStore.updateTaskStatus(id, status);
  }

  public static toggleChecklist(taskId: string, itemId: string): void {
    dataStore.toggleTaskChecklistItem(taskId, itemId);
  }

  public static delete(id: string): void {
    dataStore.deleteTask(id);
  }

  public static filter(params: {
    status?: TaskStatus | 'all';
    priority?: TaskPriority | 'all';
    assigneeId?: string;
    search?: string;
  }): Task[] {
    let tasks = dataStore.getTasks();
    if (params.status && params.status !== 'all') {
      tasks = tasks.filter((t) => t.status === params.status);
    }
    if (params.priority && params.priority !== 'all') {
      tasks = tasks.filter((t) => t.priority === params.priority);
    }
    if (params.assigneeId) {
      tasks = tasks.filter((t) => t.assigneeId === params.assigneeId);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.location.toLowerCase().includes(q)
      );
    }
    return tasks;
  }
}`,
  },
  {
    path: 'services/funds.service.ts',
    category: 'services',
    name: 'funds.service.ts',
    description: 'خدمة إدارة العهد النقدية، التغذية التعويضية ومراقبة نسب السيولة',
    code: `import { dataStore } from '../lib/storage';
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
}`,
  },
  {
    path: 'services/expenses.service.ts',
    category: 'services',
    name: 'expenses.service.ts',
    description: 'خدمة تسجيل الفواتير، احتساب ضريبة 5%، الاعتماد والرفض مع استرداد رصيد العهدة',
    code: `import { dataStore } from '../lib/storage';
import { Expense, ExpenseStatus } from '../types/domain';

export class ExpensesService {
  public static getAll(): Expense[] {
    return dataStore.getExpenses();
  }

  public static create(data: Omit<Expense, 'id' | 'code' | 'taxAmount' | 'totalWithTax' | 'status' | 'submittedAt' | 'submittedBy'>): Expense {
    return dataStore.addExpense(data);
  }

  public static approve(id: string): void {
    dataStore.updateExpenseStatus(id, 'approved');
  }

  public static reject(id: string, reason: string): void {
    dataStore.updateExpenseStatus(id, 'rejected', reason);
  }

  public static getSummary() {
    const expenses = dataStore.getExpenses();
    const totalAmount = expenses.reduce((sum, e) => sum + e.totalWithTax, 0);
    const pendingCount = expenses.filter((e) => e.status === 'pending_approval').length;
    const pendingAmount = expenses
      .filter((e) => e.status === 'pending_approval')
      .reduce((sum, e) => sum + e.totalWithTax, 0);

    return {
      totalCount: expenses.length,
      totalAmount,
      pendingCount,
      pendingAmount,
    };
  }
}`,
  },
  {
    path: 'services/settlements.service.ts',
    category: 'services',
    name: 'settlements.service.ts',
    description: 'خدمة إدارة التسويات الدورية للعهد وتوليد سند الصرف الرسمي',
    code: `import { dataStore } from '../lib/storage';
import { Settlement } from '../types/domain';

export class SettlementsService {
  public static getAll(): Settlement[] {
    return dataStore.getSettlements();
  }

  public static create(data: any): Settlement {
    return dataStore.addSettlement(data);
  }

  public static approve(id: string, auditNotes?: string): void {
    dataStore.approveSettlement(id, auditNotes);
  }
}`,
  },
  {
    path: 'rbac/permissions.ts',
    category: 'admin',
    name: 'permissions.ts',
    description: 'مصفوفة صلاحيات الوصول القائمة على الأدوار (RBAC)',
    code: `import { Role } from '../../types/domain';
export const ROLE_PERMISSIONS: Record<Role, Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean }>> = {
  admin: {
    dashboard: { view: true, create: true, edit: true, delete: true, approve: true },
    tasks: { view: true, create: true, edit: true, delete: true, approve: true },
    funds: { view: true, create: true, edit: true, delete: true, approve: true },
    expenses: { view: true, create: true, edit: true, delete: true, approve: true },
    settlements: { view: true, create: true, edit: true, delete: true, approve: true },
    reports: { view: true, create: true, edit: true, delete: true, approve: true },
    users: { view: true, create: true, edit: true, delete: true, approve: true },
    roles: { view: true, create: true, edit: true, delete: true, approve: true },
    audit: { view: true, create: false, edit: false, delete: false, approve: false },
    settings: { view: true, create: true, edit: true, delete: true, approve: true },
  },
  // Additional roles: ops_manager, finance_officer, field_officer, viewer
};`,
  },
];
