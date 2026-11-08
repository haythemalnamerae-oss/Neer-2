import React from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Flag,
  Plus,
  Receipt,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { formatCurrency, formatDate, TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG } from '../../lib/utils/format';

interface DailyCommandCenterViewProps {
  onOpenNewTask: () => void;
  onOpenNewExpense: (taskId?: string) => void;
  onSelectTask: (task: Task) => void;
  onRecordOutcome: (task: Task) => void;
  onViewChain: (task: Task) => void;
  onSelectView: (view: string) => void;
}

const CLOSED_TASK_STATUSES = new Set(['completed', 'approved', 'cancelled']);

const getLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTaskDateKey = (value?: string): string => {
  if (!value) return '';
  const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoDate) return isoDate[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : getLocalDateKey(parsed);
};

const MetricCard: React.FC<{
  label: string;
  value: number | string;
  detail: string;
  icon: React.ElementType;
  tone: 'green' | 'amber' | 'red' | 'blue';
  onClick?: () => void;
}> = ({ label, value, detail, icon: Icon, tone, onClick }) => {
  const tones = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    amber: 'bg-amber-50 text-amber-800 border-amber-100',
    red: 'bg-rose-50 text-rose-800 border-rose-100',
    blue: 'bg-sky-50 text-sky-800 border-sky-100',
  };
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-600">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tones[tone]}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-900 tabular-nums">{value}</div>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
      {content}
    </button>
  ) : (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{content}</div>
  );
};

export const DailyCommandCenterView: React.FC<DailyCommandCenterViewProps> = ({
  onOpenNewTask,
  onOpenNewExpense,
  onSelectTask,
  onSelectView,
}) => {
  const user = dataStore.getCurrentUser();
  const tasksPermission = hasPermission(user.role, 'tasks', 'view');
  const fundsPermission = hasPermission(user.role, 'funds', 'view');
  const expensesPermission = hasPermission(user.role, 'expenses', 'view');
  const followUpsPermission = hasPermission(user.role, 'followUps', 'view');
  const canCreateTask = hasPermission(user.role, 'tasks', 'create');
  const canCreateExpense = hasPermission(user.role, 'expenses', 'create');
  const canReviewTasks = hasPermission(user.role, 'tasks', 'approve');
  const canReviewExpenses = hasPermission(user.role, 'expenses', 'approve');
  const canReviewSettlements = hasPermission(user.role, 'settlements', 'approve');
  const canOpenApprovals = canReviewTasks || canReviewExpenses || canReviewSettlements;

  const today = getLocalDateKey(new Date());
  const allTasks = tasksPermission ? dataStore.getTasks() : [];
  const tasks = user.role === 'field_officer'
    ? allTasks.filter((task) => task.assigneeId === user.id)
    : allTasks;
  const funds = fundsPermission ? dataStore.getFunds() : [];
  const expenses = expensesPermission ? dataStore.getExpenses() : [];
  const followUps = followUpsPermission ? dataStore.getFollowUps() : [];
  const settings = dataStore.getSettings();

  const openTasks = tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status));
  const overdueTasks = openTasks.filter((task) => {
    const dueDate = getTaskDateKey(task.dueDate);
    return dueDate !== '' && dueDate < today;
  });
  const urgentTasks = openTasks.filter((task) => task.priority === 'urgent');
  const pendingTaskApprovals = canReviewTasks
    ? tasks.filter((task) => task.status === 'pending_approval')
    : [];
  const pendingExpenses = expenses.filter((expense) => expense.status === 'pending_approval');
  const pendingExpenseApprovals = canReviewExpenses ? pendingExpenses : [];
  const pendingSettlementApprovals = canReviewSettlements
    ? dataStore.getSettlements().filter((settlement) => settlement.status === 'under_review' || settlement.status === 'audited')
    : [];
  const totalApprovals = pendingTaskApprovals.length + pendingExpenseApprovals.length + pendingSettlementApprovals.length;

  const lowFunds = funds.filter((fund) => {
    if (fund.status === 'closed' || fund.totalAllocation <= 0) return false;
    const remainingPercent = (fund.currentBalance / fund.totalAllocation) * 100;
    return fund.status === 'depleted' || fund.status === 'warning' || remainingPercent <= fund.warningThreshold;
  });

  const pendingFollowUps = followUps.filter((item) => item.status !== 'resolved');
  const dueFollowUps = pendingFollowUps.filter((item) => {
    const dueDate = getTaskDateKey(item.scheduledDate);
    return item.status === 'escalated' || (dueDate !== '' && dueDate <= today);
  });

  const attentionTasks = [...openTasks]
    .sort((a, b) => {
      const aOverdue = getTaskDateKey(a.dueDate) !== '' && getTaskDateKey(a.dueDate) < today;
      const bOverdue = getTaskDateKey(b.dueDate) !== '' && getTaskDateKey(b.dueDate) < today;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return getTaskDateKey(a.dueDate).localeCompare(getTaskDateKey(b.dueDate));
    })
    .slice(0, 5);

  const greetingDate = new Intl.DateTimeFormat('ar', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const roleHeading = user.role === 'finance_officer'
    ? 'ملخص الرقابة المالية'
    : user.role === 'field_officer'
      ? 'ملخص مهامك الميدانية'
      : user.role === 'viewer'
        ? 'لوحة المتابعة والاطلاع'
        : 'نظرة تنفيذية على سير العمل';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <section className="overflow-hidden rounded-3xl bg-[#203D32] p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              <span>مركز القيادة التنفيذي</span>
              <span className="text-white/40">•</span>
              <span>{greetingDate}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{roleHeading}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              مرحباً {user.name}، هذه أهم المؤشرات والاستثناءات التي تحتاج إلى متابعة، مع روابط مباشرة إلى تفاصيلها.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canCreateTask && (
              <button type="button" onClick={onOpenNewTask} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#203D32] transition hover:bg-emerald-50">
                <Plus className="h-4 w-4" /> مهمة جديدة
              </button>
            )}
            {canCreateExpense && (
              <button type="button" onClick={() => onOpenNewExpense()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20">
                <Receipt className="h-4 w-4" /> تسجيل مصروف
              </button>
            )}
          </div>
        </div>
      </section>

      <section aria-label="المؤشرات الرئيسية" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tasksPermission && (
          <MetricCard label="المهام المفتوحة" value={openTasks.length} detail={`${tasks.length} مهمة ضمن نطاق العرض`} icon={ClipboardCheck} tone="blue" onClick={() => onSelectView('tasks')} />
        )}
        {tasksPermission && (
          <MetricCard label="المهام المتأخرة" value={overdueTasks.length} detail="تجاوزت تاريخ الاستحقاق ولم تُغلق" icon={CalendarClock} tone={overdueTasks.length ? 'red' : 'green'} onClick={() => onSelectView('tasks')} />
        )}
        {tasksPermission && (
          <MetricCard label="المهام العاجلة" value={urgentTasks.length} detail="أولوية طارئة وما زالت مفتوحة" icon={Flag} tone={urgentTasks.length ? 'amber' : 'green'} onClick={() => onSelectView('tasks')} />
        )}
        {canOpenApprovals && (
          <MetricCard label="بانتظار اعتمادك" value={totalApprovals} detail="مهام وفواتير وتسويات معلقة" icon={FileText} tone={totalApprovals ? 'amber' : 'green'} onClick={() => onSelectView('approvals')} />
        )}
        {fundsPermission && (
          <MetricCard label="العهد منخفضة الرصيد" value={lowFunds.length} detail="بحسب حالة العهدة وحد التنبيه المسجل" icon={Wallet} tone={lowFunds.length ? 'red' : 'green'} onClick={() => onSelectView('funds')} />
        )}
        {followUpsPermission && (
          <MetricCard label="متابعات مستحقة" value={dueFollowUps.length} detail={`${pendingFollowUps.length} متابعة غير مغلقة`} icon={Clock3} tone={dueFollowUps.length ? 'amber' : 'green'} onClick={() => onSelectView('followUps')} />
        )}
        {expensesPermission && (
          <MetricCard label="فواتير بانتظار الاعتماد" value={pendingExpenses.length} detail="فواتير بانتظار المراجعة" icon={Receipt} tone={pendingExpenses.length ? 'amber' : 'green'} onClick={canReviewExpenses ? () => onSelectView('approvals') : () => onSelectView('expenses')} />
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {tasksPermission && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-black text-slate-900">مهام تحتاج إلى انتباه</h2>
                <p className="mt-1 text-xs text-slate-500">الأولوية للمتأخرة ثم الأعلى خطورة واستحقاقاً</p>
              </div>
              <button type="button" onClick={() => onSelectView('tasks')} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                جميع المهام <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {attentionTasks.map((task) => {
                const overdue = getTaskDateKey(task.dueDate) !== '' && getTaskDateKey(task.dueDate) < today;
                const status = TASK_STATUS_CONFIG[task.status];
                const priority = TASK_PRIORITY_CONFIG[task.priority];
                return (
                  <button key={task.id} type="button" onClick={() => onSelectTask(task)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-right transition hover:border-emerald-200 hover:bg-emerald-50/40">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-900">{task.title}</span>
                        {overdue && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">متأخرة</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{task.assigneeName}</span>
                        <span>{task.dueDate ? formatDate(task.dueDate) : 'دون موعد محدد'}</span>
                        <span className={status?.color || 'text-slate-500'}>{status?.label || task.status}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${priority?.badgeColor || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      {priority?.label || task.priority}
                    </span>
                  </button>
                );
              })}
              {attentionTasks.length === 0 && (
                <div className="rounded-xl bg-emerald-50/70 px-4 py-8 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700" />
                  <p className="mt-2 text-sm font-bold text-emerald-900">لا توجد مهام مفتوحة ضمن نطاقك</p>
                  <p className="mt-1 text-xs text-emerald-800/70">ستظهر هنا المهام فور تسجيلها</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {canOpenApprovals && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-amber-700" />
                  <h2 className="font-black text-slate-900">صندوق الاعتمادات</h2>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">{totalApprovals}</span>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                {canReviewTasks && <div className="flex justify-between"><span>اعتماد مهام</span><strong>{pendingTaskApprovals.length}</strong></div>}
                {canReviewExpenses && <div className="flex justify-between"><span>اعتماد فواتير</span><strong>{pendingExpenseApprovals.length}</strong></div>}
                {canReviewSettlements && <div className="flex justify-between"><span>مراجعة تسويات</span><strong>{pendingSettlementApprovals.length}</strong></div>}
              </div>
              <button type="button" onClick={() => onSelectView('approvals')} className="mt-4 min-h-10 w-full rounded-xl bg-[#203D32] px-3 text-xs font-bold text-white hover:bg-[#294E40]">
                فتح مركز الاعتمادات
              </button>
            </div>
          )}

          {fundsPermission && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-800" />
                  <h2 className="font-black text-slate-900">مراقبة العهد</h2>
                </div>
                <button type="button" onClick={() => onSelectView('funds')} className="text-xs font-bold text-emerald-800 hover:underline">التفاصيل</button>
              </div>
              {lowFunds.slice(0, 3).map((fund) => {
                const ratio = fund.totalAllocation > 0 ? Math.max(0, Math.min(100, (fund.currentBalance / fund.totalAllocation) * 100)) : 0;
                return (
                  <div key={fund.id} className="mb-3 last:mb-0">
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <span className="truncate font-bold text-slate-700">{fund.name}</span>
                      <strong className="shrink-0 text-rose-700">{formatCurrency(fund.currentBalance, fund.currency || settings.currency)}</strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${ratio <= 15 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${ratio}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{fund.holderName} · المتبقي {Math.round(ratio)}%</p>
                  </div>
                );
              })}
              {lowFunds.length === 0 && <p className="py-3 text-center text-xs text-slate-500">لا توجد عهد منخفضة الرصيد حالياً</p>}
            </div>
          )}

          {followUpsPermission && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-700" />
                  <h2 className="font-black text-slate-900">المتابعات المستحقة</h2>
                </div>
                <button type="button" onClick={() => onSelectView('followUps')} className="text-xs font-bold text-emerald-800 hover:underline">عرض الكل</button>
              </div>
              {dueFollowUps.slice(0, 3).map((item) => (
                <div key={item.id} className="mb-2 rounded-xl bg-amber-50/70 p-3 last:mb-0">
                  <p className="text-xs font-bold text-slate-800">{item.title}</p>
                  <p className="mt-1 text-[11px] text-slate-600">{item.assignedTo} · {item.scheduledDate ? formatDate(item.scheduledDate) : 'موعد غير محدد'}</p>
                </div>
              ))}
              {dueFollowUps.length === 0 && <p className="py-3 text-center text-xs text-slate-500">لا توجد متابعات مستحقة</p>}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="اختصارات الأقسام">
        {tasksPermission && <button type="button" onClick={() => onSelectView('tasks')} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-900"><span className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> إدارة المهام</span><ArrowLeft className="h-4 w-4" /></button>}
        {fundsPermission && <button type="button" onClick={() => onSelectView('funds')} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-900"><span className="flex items-center gap-2"><Wallet className="h-4 w-4" /> العهد والأرصدة</span><ArrowLeft className="h-4 w-4" /></button>}
        {expensesPermission && <button type="button" onClick={() => onSelectView('expenses')} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-900"><span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> المصروفات</span><ArrowLeft className="h-4 w-4" /></button>}
        {followUpsPermission && <button type="button" onClick={() => onSelectView('followUps')} className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-900"><span className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> المتابعة</span><ArrowLeft className="h-4 w-4" /></button>}
      </section>
    </div>
  );
};
