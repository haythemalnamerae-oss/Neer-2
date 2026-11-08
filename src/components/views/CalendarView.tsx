import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Clock,
  CalendarDays,
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { Button } from '../ui/button';

interface CalendarViewProps {
  onSelectTask: (task: Task) => void;
  onOpenNewTask: () => void;
}

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectTask, onOpenNewTask }) => {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(today));
  const user = dataStore.getCurrentUser();
  const canCreate = hasPermission(user.role, 'tasks', 'create');
  const canReschedule = hasPermission(user.role, 'tasks', 'edit');
  const allTasks = dataStore.getTasks();
  const tasks = user.role === 'field_officer'
    ? allTasks.filter((task) => task.assigneeId === user.id)
    : allTasks;

  const monthLabel = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(visibleMonth);
  const days = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const offset = firstDay.getDay();
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - offset + 1);
      const key = toDateKey(date);
      return {
        date,
        key,
        dayNumber: date.getDate(),
        inMonth: date.getMonth() === visibleMonth.getMonth(),
        tasks: tasks.filter((task) => task.dueDate?.slice(0, 10) === key),
      };
    });
  }, [visibleMonth, tasks]);

  const selectedDayTasks = tasks.filter((task) => task.dueDate?.slice(0, 10) === selectedDate);
  const moveMonth = (offset: number) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (canReschedule) event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent, targetDate: string) => {
    if (!canReschedule) return;
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    const task = tasks.find((item) => item.id === taskId);
    if (task && task.dueDate?.slice(0, 10) !== targetDate) {
      dataStore.rescheduleTask(taskId, targetDate, 'تمت إعادة الجدولة عبر التقويم');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <section className="neu-raised-lg rounded-3xl p-5 sm:p-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#325A41] font-bold text-xs mb-1">
            <CalendarIcon className="h-5 w-5" />
            <span>التشغيل / الجدولة</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[#142B1D]">تقويم المهام والمواعيد</h1>
          <p className="mt-1 text-xs sm:text-sm text-[#4E6C5B]">عرض المواعيد الفعلية من سجل المهام، مع إعادة الجدولة حسب صلاحيتك.</p>
        </div>
        {canCreate && (
          <Button variant="primary" size="md" onClick={onOpenNewTask} icon={<Plus className="h-5 w-5" />} className="min-h-11">
            إضافة مهمة
          </Button>
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-start">
        <div className="xl:col-span-8 neu-raised-lg rounded-3xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-emerald-800" />
              <h2 className="font-black text-slate-900">{monthLabel}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => {
                const now = new Date();
                setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelectedDate(toDateKey(now));
              }} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">اليوم</button>
              <button type="button" aria-label="الشهر السابق" onClick={() => moveMonth(-1)} className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
              <button type="button" aria-label="الشهر التالي" onClick={() => moveMonth(1)} className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] sm:text-xs font-bold text-slate-500">
            {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((label) => <div key={label} className="py-2">{label}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map((day) => {
              const selected = selectedDate === day.key;
              const isToday = day.key === toDateKey(today);
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDate(day.key)}
                  onDragOver={handleDragOver}
                  onDrop={(event) => handleDrop(event, day.key)}
                  className={`min-h-[76px] sm:min-h-[105px] min-w-0 rounded-xl sm:rounded-2xl border p-1.5 sm:p-2 text-right flex flex-col transition ${selected ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700/15' : 'border-slate-100 bg-white hover:border-emerald-200'} ${day.inMonth ? '' : 'opacity-40'}`}
                >
                  <span className={`text-xs font-black ${isToday ? 'text-emerald-800' : 'text-slate-700'}`}>{day.dayNumber}</span>
                  {day.tasks.length > 0 && (
                    <span className="mt-1 rounded-md bg-slate-100 px-1 py-0.5 text-[9px] sm:text-[10px] font-bold text-slate-600 truncate">{day.tasks.length} مهام</span>
                  )}
                  <span className="mt-1 hidden sm:block space-y-1 w-full">
                    {day.tasks.slice(0, 2).map((task) => (
                      <span key={task.id} draggable={canReschedule} onDragStart={(event) => {
                        if (canReschedule) event.dataTransfer.setData('text/plain', task.id);
                      }} onClick={(event) => {
                        event.stopPropagation();
                        onSelectTask(task);
                      }} className={`block truncate rounded-md px-1 py-0.5 text-[10px] font-bold ${task.priority === 'urgent' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>
                        {task.title}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">{canReschedule ? 'يمكنك سحب المهمة إلى يوم آخر لتغيير موعدها.' : 'العرض فقط؛ لا تملك صلاحية إعادة جدولة المهام.'}</p>
        </div>

        <aside className="xl:col-span-4 neu-raised-lg rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-black text-slate-900">جدول اليوم المحدد</h2>
            <p className="mt-1 text-xs text-slate-500">{parseDateKey(selectedDate)?.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {selectedDayTasks.length} مهمة</p>
          </div>
          <div className="space-y-3">
            {selectedDayTasks.map((task) => (
              <button key={task.id} type="button" onClick={() => onSelectTask(task)} className="w-full rounded-xl border border-slate-100 p-3 text-right hover:border-emerald-200 hover:bg-emerald-50/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-slate-900">{task.title}</span>
                  <span className="shrink-0 text-[10px] font-bold text-amber-700">{task.priority}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{task.dueTime || 'وقت غير محدد'}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{task.location || 'موقع غير محدد'}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{task.assigneeName}</p>
              </button>
            ))}
            {selectedDayTasks.length === 0 && <div className="rounded-xl bg-slate-50 p-7 text-center text-xs text-slate-500">لا توجد مهام مستحقة في هذا اليوم.</div>}
          </div>
        </aside>
      </section>
    </div>
  );
};
