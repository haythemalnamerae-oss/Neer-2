import React, { useState } from 'react';
import {
  Plus,
  CheckSquare,
  Receipt,
  Target,
  FileCheck2,
  ShieldAlert,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';

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
  const currentUser = dataStore.getCurrentUser();

  const handleSos = () => {
    setIsOpen(false);
    const reason = window.prompt('سبب طلب الدعم الميداني الطارئ (SOS):', 'عطل طارئ / بحاجة لمساندة فورية');
    if (reason) {
      dataStore.addNotification({
        title: 'نداء استغاثة طارئ (SOS)',
        message: `أرسل ${currentUser.name} طلب مساعدة عاجل: ${reason}`,
        type: 'alert',
        targetView: 'daily',
      });
      alert('تم إرسال إشعار استغاثة عاجل لكافة المشرفين والمدراء.');
    }
  };

  return (
    <div className="fixed bottom-22 left-4 sm:bottom-6 sm:left-6 z-40 flex flex-col items-start select-none">
      {/* Expanded Menu Actions */}
      {isOpen && (
        <div className="mb-3.5 flex flex-col items-start gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-150">
          <button
            onClick={() => {
              setIsOpen(false);
              onOpenNewTask();
            }}
            className="flex items-center gap-3 px-4.5 py-3 rounded-2xl neu-raised hover:neu-inset text-[#162A1D] text-xs sm:text-sm font-bold transition cursor-pointer min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-xl neu-inset-sm text-[#245236] flex items-center justify-center shrink-0">
              <CheckSquare className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span>مهمة ميدانية جديدة</span>
          </button>

          <button
            onClick={() => {
              setIsOpen(false);
              onOpenNewExpense();
            }}
            className="flex items-center gap-3 px-4.5 py-3 rounded-2xl neu-raised hover:neu-inset text-[#162A1D] text-xs sm:text-sm font-bold transition cursor-pointer min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-xl neu-inset-sm text-[#245236] flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span>تسجيل فاتورة ومصروف</span>
          </button>

          <button
            onClick={() => {
              setIsOpen(false);
              onSelectView('daily');
            }}
            className="flex items-center gap-3 px-4.5 py-3 rounded-2xl neu-raised hover:neu-inset text-[#162A1D] text-xs sm:text-sm font-bold transition cursor-pointer min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-xl neu-inset-sm text-[#315671] flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span>مركز القيادة اليومي</span>
          </button>

          <button
            onClick={() => {
              setIsOpen(false);
              onSelectView('approvals');
            }}
            className="flex items-center gap-3 px-4.5 py-3 rounded-2xl neu-raised hover:neu-inset text-[#162A1D] text-xs sm:text-sm font-bold transition cursor-pointer min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-xl neu-inset-sm text-[#87541B] flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span>مركز الاعتمادات</span>
          </button>

          <button
            onClick={handleSos}
            className="flex items-center gap-3 px-4.5 py-3 rounded-2xl neu-raised text-[#9E392E] hover:neu-inset text-xs sm:text-sm font-bold transition cursor-pointer ring-1 ring-[#9E392E]/30 min-h-[48px]"
          >
            <div className="w-8 h-8 rounded-xl neu-inset-sm text-[#9E392E] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span>نداء استغاثة (SOS)</span>
          </button>
        </div>
      )}

      {/* Main Floating Trigger Button with Prominent Size */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl neu-button flex items-center justify-center transition-all cursor-pointer ${
          isOpen
            ? 'neu-inset text-[#162B1E] rotate-45'
            : 'text-[#285539] hover:scale-105 active:scale-95'
        }`}
        title="إجراءات سريعة"
      >
        <Plus className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
      </button>
    </div>
  );
};
