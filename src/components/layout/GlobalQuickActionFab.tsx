import React, { useState } from 'react';
import { Plus, CheckSquare, Receipt, Target, FileCheck2, ShieldAlert, X } from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';

interface GlobalQuickActionFabProps {
  onOpenNewTask: () => void;
  onOpenNewExpense: () => void;
  onSelectView: (view: string) => void;
}

export const GlobalQuickActionFab: React.FC<GlobalQuickActionFabProps> = ({ onOpenNewTask, onOpenNewExpense, onSelectView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const user = dataStore.getCurrentUser();
  const actions = [
    { key: 'task-create', label: 'مهمة ميدانية جديدة', icon: CheckSquare, allowed: hasPermission(user.role, 'tasks', 'create'), run: onOpenNewTask },
    { key: 'expense-create', label: 'تسجيل فاتورة ومصروف', icon: Receipt, allowed: hasPermission(user.role, 'expenses', 'create'), run: onOpenNewExpense },
    { key: 'daily', label: 'مركز القيادة اليومي', icon: Target, allowed: hasPermission(user.role, 'dashboard', 'view'), run: () => onSelectView('daily') },
    { key: 'approvals', label: 'مركز الاعتمادات', icon: FileCheck2, allowed: hasPermission(user.role, 'tasks', 'approve'), run: () => onSelectView('approvals') },
    { key: 'sos', label: 'نداء استغاثة (SOS)', icon: ShieldAlert, allowed: true, run: () => {
      const reason = window.prompt('سبب طلب الدعم الميداني الطارئ:', 'عطل طارئ / بحاجة لمساندة فورية');
      if (reason) dataStore.addNotification({ title: 'نداء استغاثة طارئ (SOS)', message: `أرسل ${user.name} طلب مساعدة عاجل: ${reason}`, type: 'alert', targetView: 'daily' });
    } },
  ].filter((item) => item.allowed);

  return <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-4 z-20 flex flex-col items-start sm:bottom-6 sm:left-6" onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false); }}>
    {isOpen && <>
      <button aria-label="إغلاق قائمة الإجراءات" className="fixed inset-0 z-0 bg-slate-950/20 lg:hidden" onClick={() => setIsOpen(false)} />
      <div className="relative z-10 mb-3 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
        {actions.map(({ key, label, icon: Icon, run }) => <button key={key} onClick={() => { setIsOpen(false); run(); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          <Icon className="h-5 w-5 shrink-0 text-emerald-800"/><span>{label}</span>
        </button>)}
      </div>
    </>}
    <button aria-label={isOpen ? 'إغلاق الإجراءات السريعة' : 'فتح الإجراءات السريعة'} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)} className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-800 text-white shadow-lg transition hover:bg-emerald-900 sm:h-14 sm:w-14">
      {isOpen ? <X className="h-5 w-5"/> : <Plus className="h-6 w-6"/>}
    </button>
  </div>;
};
