import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  MapPin,
  Clock,
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { Button } from '../ui/button';

interface CalendarViewProps {
  onSelectTask: (task: Task) => void;
  onOpenNewTask: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onSelectTask, onOpenNewTask }) => {
  const [selectedDate, setSelectedDate] = useState<string>('2026-09-21');
  const tasks = dataStore.getTasks();

  // Simple September 2026 calendar days
  const daysInMonth = Array.from({ length: 30 }, (_, i) => {
    const dayNum = i + 1;
    const dateStr = `2026-09-${dayNum < 10 ? '0' + dayNum : dayNum}`;
    const dayTasks = tasks.filter((t) => t.dueDate === dateStr);
    return { dayNum, dateStr, tasks: dayTasks };
  });

  const selectedDayTasks = tasks.filter((t) => t.dueDate === selectedDate);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        dataStore.rescheduleTask(taskId, targetDate, 'تمت إعادة الجدولة عبر التقويم الميداني');
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#325A41] font-bold text-xs uppercase mb-1">
            <CalendarIcon className="w-5 h-5 stroke-[2.2]" />
            <span>التقويم الميداني وجدولة المهام</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">سبتمبر 2026</h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            يمكنك سحب وإفلات المهام لتغيير موعد الاستحقاق الميداني، أو النقر على أي يوم لاستعراض مهامه
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={onOpenNewTask}
          icon={<Plus className="w-5 h-5 stroke-[2.5]" />}
          className="text-xs sm:text-sm font-bold min-h-[44px]"
        >
          إضافة مهمة بالتقويم
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* Calendar Grid (8 Cols) */}
        <div className="lg:col-span-8 neu-raised-lg rounded-3xl p-5 sm:p-7 space-y-4">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs sm:text-sm text-[#506E5D] pb-3 border-b border-[#C8D3CC]/50">
            <div>الأحد</div>
            <div>الإثنين</div>
            <div>الثلاثاء</div>
            <div>الأربعاء</div>
            <div>الخميس</div>
            <div>الجمعة</div>
            <div>السبت</div>
          </div>

          {/* Days Cells */}
          <div className="grid grid-cols-7 gap-2">
            {daysInMonth.map((d) => {
              const isSelected = selectedDate === d.dateStr;
              const hasTasks = d.tasks.length > 0;

              return (
                <div
                  key={d.dateStr}
                  onClick={() => setSelectedDate(d.dateStr)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, d.dateStr)}
                  className={`min-h-[92px] p-2.5 rounded-2xl transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'neu-inset text-[#142B1D] font-bold ring-2 ring-[#325A41]/30'
                      : 'neu-raised-sm hover:neu-inset text-[#284835]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs sm:text-sm font-bold font-mono ${
                        isSelected ? 'text-[#142B1D] font-black' : 'text-[#355743]'
                      }`}
                    >
                      {d.dayNum}
                    </span>
                    {hasTasks && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2E583F]" />
                    )}
                  </div>

                  <div className="space-y-1 mt-1">
                    {d.tasks.slice(0, 2).map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, t.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTask(t);
                        }}
                        className={`text-xs font-bold p-1 rounded-xl truncate ${
                          t.priority === 'urgent'
                            ? 'neu-inset-sm text-[#943B2E]'
                            : 'neu-raised-sm text-[#254A34]'
                        }`}
                      >
                        {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Agenda (4 Cols) */}
        <div className="lg:col-span-4 neu-raised-lg rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="border-b border-[#C8D3CC]/50 pb-3.5">
            <h3 className="font-black text-base text-[#142B1D] font-serif-display">
              مهام يوم: {selectedDate}
            </h3>
            <p className="text-xs text-[#527060] mt-0.5">
              إجمالي المهام المجدولة: {selectedDayTasks.length} مهمة
            </p>
          </div>

          <div className="space-y-3">
            {selectedDayTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="p-4 rounded-2xl neu-raised-sm hover:neu-inset transition cursor-pointer space-y-2 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-[#234D35] neu-inset-sm px-2.5 py-0.5 rounded-full text-xs">
                    {task.code}
                  </span>
                  <span className="text-xs font-bold text-[#743F17]">
                    {task.priority}
                  </span>
                </div>
                <h4 className="font-bold text-[#142B1D] leading-snug">{task.title}</h4>
                <div className="flex items-center justify-between text-xs text-[#547363] pt-2 border-t border-[#C8D3CC]/40 font-medium">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{task.location}</span>
                  </span>
                  <span>{task.assigneeName}</span>
                </div>
              </div>
            ))}

            {selectedDayTasks.length === 0 && (
              <div className="p-8 text-center text-xs sm:text-sm text-[#5C7A6A] neu-inset rounded-2xl">
                لا توجد مهام مجدولة لهذا اليوم
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
