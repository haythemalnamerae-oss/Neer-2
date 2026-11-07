import React, { useState } from 'react';
import {
  Clock,
  Layers,
  Calendar,
  User,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Phone,
  Search,
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatCurrency } from '../../lib/utils/format';

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

  const allTasks = dataStore.getTasks();

  // Tasks with chains or follow-up outcomes
  const chainTasks = allTasks.filter(
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
                <h3
                  onClick={() => onSelectTask(task)}
                  className="font-extrabold text-base text-slate-800 hover:text-emerald-800 transition cursor-pointer"
                >
                  {task.title}
                </h3>
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
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => onRecordOutcome(task)}
                  icon={<CheckCircle2 className="w-4 h-4 ml-1" />}
                >
                  تحديث النتيجة
                </Button>
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
