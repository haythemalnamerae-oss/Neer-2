import React, { useState } from 'react';
import { Plus, CheckSquare, Receipt, Target, FileCheck2, X } from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';

interface GlobalQuickActionFabProps {
  onOpenNewTask: () => void;
  onOpenNewExpense: () => void;
  onSelectView: (view: string) => void;
}

export const GlobalQuickActionFab: React.FC<GlobalQuickActionFabProps> = ({
  onOpenNewTask,
  onOpenNewExpense,
  onSelectView,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const user = dataStore.getCurrentUser();
  const actions = [
    {
      key: 'task-create',
      label: 'مهمة ميدانية جديدة',
      icon: CheckSquare,
      allowed: hasPermission(user.role, 'tasks', 'create'),
      run: onOpenNewTask,
    },
    {
      key: 'expense-create',
      label: 'تسجيل فاتورة ومصروف',
      icon: Receipt,
      allowed: hasPermission(user.role, 'expenses', 'create'),
      run: onOpenNewExpense,
    },
    {
      key: 'daily',
      label: 'مركز القيادة اليومي',
      icon: Target,
      allowed: hasPermission(user.role, 'dashboard', 'view'),
      run: () => onSelectView('daily'),
    },
    {
      key: 'approvals',
      label: 'مركز الاعتمادات',
      icon: FileCheck2,
      allowed: hasPermission(user.role, 'tasks', 'approve'),
      run: () => onSelectView('approvals'),
    },

  ].filter((item) => item.allowed);

  return (
    <div
      className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-start sm:bottom-6 sm:left-6"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setIsOpen(false);
      }}
    >
      {isOpen && (
        <>
          <button
            aria-label="إغلاق قائمة الإجراءات"
            className="fixed inset-0 z-0 bg-black/40 backdrop-blur-xs lg:hidden cursor-pointer"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="relative z-10 mb-3 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-1.5 rounded-[24px] bg-[#F4F7F5] p-2.5 border border-white/60 animate-in fade-in duration-150"
            style={{
              boxShadow: '0 16px 36px rgba(22, 44, 34, 0.22), 0 3px 8px rgba(0, 0, 0, 0.08)',
            }}
          >
            {actions.map(({ key, label, icon: Icon, run }) => (
              <button
                key={key}
                onClick={() => {
                  setIsOpen(false);
                  run();
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-xs font-bold font-sans-inter text-slate-800 hover:bg-[#2A443B] hover:text-white transition-all cursor-pointer group"
              >
                <Icon className="h-4.5 w-4.5 shrink-0 text-emerald-800 group-hover:text-emerald-300 transition-colors" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Floating Action Button */}
      <button
        aria-label={isOpen ? 'إغلاق الإجراءات السريعة' : 'فتح الإجراءات السريعة'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="relative z-10 flex h-13 w-13 items-center justify-center rounded-full bg-[#2A443B] text-white shadow-xl transition-all hover:bg-[#21372f] hover:scale-105 active:scale-95 cursor-pointer border-2 border-white/30"
        style={{
          boxShadow: '0 10px 25px rgba(22, 44, 34, 0.35)',
        }}
      >
        {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6 stroke-[2.5]" />}
      </button>
    </div>
  );
};
