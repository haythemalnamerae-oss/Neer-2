import React from 'react';
import { 
  X, 
  Layers, 
  ArrowDown, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { Button } from '../ui/button';

interface TaskChainModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectTask: (task: Task) => void;
}

export const TaskChainModal: React.FC<TaskChainModalProps> = ({
  task,
  isOpen,
  onClose,
  onSelectTask,
}) => {
  if (!isOpen || !task) return null;

  const allTasks = dataStore.getTasks();

  // Find root task
  const findRoot = (t: Task): Task => {
    if (!t.parentTaskId) return t;
    const parent = allTasks.find((p) => p.id === t.parentTaskId);
    return parent ? findRoot(parent) : t;
  };

  const rootTask = findRoot(task);

  // Find all descendants in order
  const getChain = (current: Task): Task[] => {
    const directChildren = allTasks.filter((t) => t.parentTaskId === current.id);
    let results = [current];
    for (const child of directChildren) {
      results = results.concat(getChain(child));
    }
    return results;
  };

  const chain = getChain(rootTask);

  const getStatusBadge = (t: Task) => {
    if (t.status === 'completed' || t.status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          مكتملة
        </span>
      );
    }
    if (t.status === 'in_progress' || t.status === 'started') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
          <Clock className="w-3 h-3" />
          قيد التنفيذ
        </span>
      );
    }
    if (t.outcome === 'unable_to_execute' || t.outcome === 'not_completed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
          <AlertTriangle className="w-3 h-3" />
          تعثرت ({t.outcomeReason || 'غير منجزة'})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
        <Clock className="w-3 h-3" />
        مجدولة
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl neu-raised text-emerald-800 flex items-center justify-center">
              <Layers className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-800 font-serif">شجرة وسلسلة المتابعة الميدانية</h3>
              <p className="text-xs text-slate-600">
                تسلسل مراحل المهمة من الإنشاء الأولي وحتى الإنجاز الكامل
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl neu-raised text-slate-500 hover:text-slate-800 active:neu-inset flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chain Timeline Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="p-4 neu-inset-sm rounded-2xl text-xs sm:text-sm text-slate-800 flex items-center justify-between">
            <span>
              إجمالي حلقات السلسلة: <strong className="text-emerald-800">{chain.length} مراحل</strong>
            </span>
            <span className="font-mono font-bold text-emerald-800">{rootTask.code}</span>
          </div>

          <div className="relative border-r-2 border-emerald-800/20 pr-6 mr-3 space-y-5">
            {chain.map((item, index) => {
              const isCurrent = item.id === task.id;
              const isFirst = index === 0;
              const isLast = index === chain.length - 1;

              return (
                <div key={item.id} className="relative group">
                  {/* Timeline bullet */}
                  <div
                    className={`absolute -right-[31px] top-2.5 w-4 h-4 rounded-full transition-all ${
                      isCurrent
                        ? 'bg-emerald-700 ring-4 ring-emerald-500/20'
                        : item.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-slate-400'
                    }`}
                  />

                  {/* Card item */}
                  <div
                    onClick={() => {
                      onSelectTask(item);
                      onClose();
                    }}
                    className={`p-4 sm:p-5 rounded-2xl transition-all cursor-pointer ${
                      isCurrent
                        ? 'neu-inset'
                        : 'neu-raised hover:bg-black/[0.01]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-extrabold text-slate-500">
                            #{index + 1} {item.code}
                          </span>
                          {isFirst && (
                            <span className="text-[10px] neu-inset-sm text-slate-700 px-2 py-0.5 rounded-md font-bold">
                              المهمة الأصلية
                            </span>
                          )}
                          {isLast && chain.length > 1 && (
                            <span className="text-[10px] neu-raised text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                              آخر مرحلة
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] neu-raised text-emerald-800 px-2 py-0.5 rounded-md font-black">
                              المهمة الحالية
                            </span>
                          )}
                        </div>
                        <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-800 transition-colors">
                          {item.title}
                        </h4>
                        {item.outcomeReason && (
                          <p className="text-xs text-rose-700 mt-1 neu-inset-sm px-2.5 py-1 rounded-md inline-block font-semibold">
                            سبب المتابعة: {item.outcomeReason}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">{getStatusBadge(item)}</div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/[0.04] text-xs text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{item.dueDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>{item.assigneeName}</span>
                      </div>
                      <div className="mr-auto flex items-center gap-1 text-emerald-800 font-extrabold group-hover:underline">
                        <span>فتح التفاصيل</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/[0.04] flex justify-end">
          <Button
            variant="outline"
            size="md"
            onClick={onClose}
          >
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  );
};
