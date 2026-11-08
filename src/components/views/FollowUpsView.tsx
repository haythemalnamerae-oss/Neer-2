import React, { useState } from 'react';
import {
  Clock,
  Layers,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { Button } from '../ui/button';

interface FollowUpsViewProps {
  onSelectTask: (task: Task) => void;
  onRecordOutcome: (task: Task) => void;
  onViewChain: (task: Task) => void;
}

export const FollowUpsView: React.FC<FollowUpsViewProps> = ({
  onSelectTask,
  onRecordOutcome,
  onViewChain,
}) => {
  const [filterReason, setFilterReason] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const user = dataStore.getCurrentUser();
  const canEditTasks = hasPermission(user.role, 'tasks', 'edit');
  const allTasks = dataStore.getTasks();
  const scopedTasks = user.role === 'field_officer'
    ? allTasks.filter((task) => task.assigneeId === user.id)
    : allTasks;

  // Tasks with chains or follow-up outcomes
  const chainTasks = scopedTasks.filter(
    (t) =>
      Boolean(t.parentTaskId) ||
      (t.taskChain && t.taskChain.length > 0) ||
      t.outcome === 'needs_followup' ||
      t.outcome === 'partially_completed' ||
      t.outcome === 'unable_to_execute' ||
      Boolean(t.outcomeReason)
  );

  const filtered = chainTasks.filter((t) => {
    if (filterReason !== 'all' && t.outcomeReason !== filterReason) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (Boolean(t.code) && t.code!.toLowerCase().includes(q)) ||
        (t.outcomeReason && t.outcomeReason.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Banner */}
      <div className="neu-raised-lg p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs uppercase mb-1">
            <Clock className="w-5 h-5 text-emerald-700" />
            <span className="tracking-wide">مركز المتابعات والمهام المتصلة (Task Chains)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 font-serif">سلاسل المتابعة والمهام المرحّلة</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            تتبع المهام التي تعثرت أو تطلبت زيارات لاحقة، ورؤية تسلسل إغلاق الحلقات الميدانية
          </p>
        </div>

        <span className="neu-raised text-emerald-800 font-extrabold px-4 py-2 rounded-2xl text-xs sm:text-sm">
          {chainTasks.length} مهام في سلاسل متابعة
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <label className="relative block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ابحث بعنوان المهمة أو الكود أو سبب المتابعة" className="min-h-11 w-full rounded-xl border border-slate-200 pr-9 pl-3 text-sm" />
        </label>
        <select value={filterReason} onChange={(event) => setFilterReason(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm">
          <option value="all">كل أسباب المتابعة</option>
          <option value="client_unavailable">العميل غير متاح</option>
          <option value="document_missing">مستند ناقص</option>
          <option value="payment_pending">دفعة معلقة</option>
          <option value="needs_approval">تحتاج اعتماد</option>
          <option value="client_postponed">تأجيل من العميل</option>
          <option value="weather_conditions">ظروف جوية</option>
          <option value="technical_blocker">عائق فني</option>
          <option value="other">أخرى</option>
        </select>
      </div>

      {/* Grid of Follow-up Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((task) => {
          const chainLength = task.taskChain ? task.taskChain.length : 1;

          return (
            <div key={task.id} className="neu-raised p-5 sm:p-6 rounded-3xl space-y-4 hover:translate-y-[-2px] transition-all">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-emerald-800 neu-inset-sm px-3 py-1 rounded-xl">
                  {task.code}
                </span>
                <button
                  onClick={() => onViewChain(task)}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 neu-raised px-3.5 py-1.5 rounded-xl active:neu-inset transition-all cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-emerald-700" />
                  <span>سلسلة المتابعة ({chainLength})</span>
                </button>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onSelectTask(task)}
                  className="block w-full text-right font-extrabold text-base text-slate-800 hover:text-emerald-800 transition cursor-pointer"
                >
                  {task.title}
                </button>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.location} - {task.clientName}</p>
              </div>

              {/* Outcome Reason Pill */}
              {task.outcomeReason && (
                <div className="p-3.5 neu-inset-sm rounded-2xl text-xs sm:text-sm text-amber-900 flex items-center gap-2.5">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">سبب عدم الاكتمال: </span>
                    <span>{task.outcomeReason}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-black/[0.04] text-xs sm:text-sm text-slate-600 font-medium">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <span>{task.assigneeName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>{task.dueDate}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelectTask(task)}
                >
                  عرض التفاصيل
                </Button>
                {canEditTasks && <Button
                  variant="success"
                  size="sm"
                  onClick={() => onRecordOutcome(task)}
                  icon={<CheckCircle2 className="w-4 h-4 ml-1" />}
                >
                  تحديث النتيجة
                </Button>}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-2 neu-inset p-12 rounded-3xl text-center text-slate-500 text-sm font-bold">
            لا توجد مهام متابعة مطابقة
          </div>
        )}
      </div>
    </div>
  );
};
