import { TaskPriority, TaskStatus, ExpenseCategory, ExpenseStatus, SettlementStatus, FundStatus } from '../../types/domain';

export function formatCurrency(amount: number, currency: string = 'AED'): string {
  return new Intl.NumberFormat('ar-AE', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ar-AE').format(num);
}

export function formatDate(dateString: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('ar-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('ar-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; badgeColor: string }> = {
  new: { label: 'جديدة', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200' },
  scheduled: { label: 'مجدولة', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  todo: { label: 'قيد الانتظار', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200', badgeColor: 'bg-slate-100 text-slate-700 border-slate-200' },
  started: { label: 'بدأت الآن', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  in_progress: { label: 'قيد التنفيذ', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200' },
  paused: { label: 'متوقفة مؤقتاً', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200' },
  review: { label: 'قيد المراجعة', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending_approval: { label: 'بانتظار الاعتماد', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', badgeColor: 'bg-purple-50 text-purple-700 border-purple-200' },
  approved: { label: 'معتمدة', color: 'text-emerald-800', bg: 'bg-emerald-100 border-emerald-300', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { label: 'مرفوضة', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200' },
  completed: { label: 'مكتملة', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  deferred: { label: 'مؤجلة / متابعة', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', badgeColor: 'bg-orange-50 text-orange-700 border-orange-200' },
  cancelled: { label: 'ملغاة', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dotColor: string; badgeColor: string }> = {
  urgent: { label: 'طارئ جداً', color: 'bg-rose-50 text-rose-700 border-rose-200', dotColor: 'bg-rose-500', badgeColor: 'bg-rose-50 text-rose-700 border-rose-200' },
  high: { label: 'عالي', color: 'bg-orange-50 text-orange-700 border-orange-200', dotColor: 'bg-orange-500', badgeColor: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { label: 'متوسط', color: 'bg-blue-50 text-blue-700 border-blue-200', dotColor: 'bg-blue-500', badgeColor: 'bg-blue-50 text-blue-700 border-blue-200' },
  low: { label: 'منخفض', color: 'bg-slate-50 text-slate-700 border-slate-200', dotColor: 'bg-slate-400', badgeColor: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export const EXPENSE_CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; iconName: string }> = {
  transport: { label: 'مواصلات وشحن', iconName: 'Truck' },
  materials: { label: 'مواد ومستلزمات', iconName: 'Package' },
  hospitality: { label: 'ضيافة واستقبال', iconName: 'Coffee' },
  maintenance: { label: 'صيانة وتشغيل', iconName: 'Wrench' },
  government: { label: 'رسوم حكومية', iconName: 'Building' },
  fuel: { label: 'وقود ومحروقات', iconName: 'Fuel' },
  tools: { label: 'أدوات ومعدات', iconName: 'Tool' },
  other: { label: 'نثريات أخرى', iconName: 'Tag' },
};

export const EXPENSE_STATUS_CONFIG: Record<ExpenseStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'مسودة', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200' },
  pending_approval: { label: 'بانتظار الاعتماد', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  approved: { label: 'معتمد', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  rejected: { label: 'مرفوض', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  settled: { label: 'تمت التسوية', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
};

export const SETTLEMENT_STATUS_CONFIG: Record<SettlementStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'مسودة تسوية', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200' },
  under_review: { label: 'قيد المراجعة', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  audited: { label: 'تم التدقيق', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  approved: { label: 'معتمدة نهائياً', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  closed: { label: 'مغلقة ومؤرشفة', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
};

export const FUND_STATUS_CONFIG: Record<FundStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'نشطة ومستقرة', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  warning: { label: 'تحذير رصيد منخفض', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  depleted: { label: 'رصيد مستنفد', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  closed: { label: 'مغلقة', color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200' },
};
