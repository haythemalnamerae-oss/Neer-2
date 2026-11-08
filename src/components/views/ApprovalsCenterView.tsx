import React, { useState } from 'react';
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  Receipt,
  CheckSquare,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface ApprovalsCenterViewProps {
  onSelectView: (view: string) => void;
}

export const ApprovalsCenterView: React.FC<ApprovalsCenterViewProps> = ({ onSelectView }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'expenses' | 'tasks' | 'settlements'>('all');

  const currentUser = dataStore.getCurrentUser();
  const settings = dataStore.getSettings();
  const canReviewExpenses = hasPermission(currentUser.role, 'expenses', 'approve');
  const canReviewTasks = hasPermission(currentUser.role, 'tasks', 'approve');
  const canReviewSettlements = hasPermission(currentUser.role, 'settlements', 'approve');
  const tasks = dataStore.getTasks();
  const expenses = dataStore.getExpenses();
  const settlements = dataStore.getSettlements();

  const pendingExpenses = canReviewExpenses ? expenses.filter((expense) => expense.status === 'pending_approval') : [];
  const pendingTasks = canReviewTasks ? tasks.filter((task) => task.status === 'pending_approval') : [];
  const pendingSettlements = canReviewSettlements ? settlements.filter((settlement) => settlement.status === 'under_review' || settlement.status === 'audited') : [];

  const totalPending = pendingExpenses.length + pendingTasks.length + pendingSettlements.length;

  const handleApproveExpense = (id: string) => {
    try { dataStore.updateExpenseStatus(id, 'approved'); }
    catch (error) { alert(error instanceof Error ? error.message : 'تعذر اعتماد الفاتورة.'); }
  };

  const handleRejectExpense = (id: string) => {
    const reason = window.prompt('سبب رفض الفاتورة أو المستند:', 'نقص في بيانات الفاتورة الضريبية أو عدم مطابقة البنود');
    if (reason?.trim()) {
      try { dataStore.updateExpenseStatus(id, 'rejected', reason.trim()); }
      catch (error) { alert(error instanceof Error ? error.message : 'تعذر رفض الفاتورة.'); }
    }
  };

  const handleApproveTask = (id: string) => {
    dataStore.updateTaskStatus(id, 'completed');
  };

  const handleRejectTask = (id: string) => {
    const reason = window.prompt('سبب رفض اعتماد المهمة:', 'إعادة الفحص الميداني لوجود ملاحظات جودة');
    if (reason) {
      dataStore.updateTaskStatus(id, 'rejected');
    }
  };

  const handleApproveSettlement = (id: string) => {
    const notes = window.prompt('ملاحظات التدقيق والمصادقة على التسوية:', `تم تدقيق الفواتير ومطابقة الرصيد والتحقق من الضريبة ${settings.taxRate}%`);
    try { dataStore.approveSettlement(id, notes || undefined); }
    catch (error) { alert(error instanceof Error ? error.message : 'تعذر اعتماد التسوية.'); }
  };

  const handleRejectSettlement = (id: string) => {
    const reason = window.prompt('سبب رفض التسوية وإعادة الفواتير إلى قائمة التسوية:', 'توجد ملاحظات تحتاج إلى تصحيح');
    if (!reason?.trim()) return;
    try { dataStore.rejectSettlement(id, reason.trim()); }
    catch (error) { alert(error instanceof Error ? error.message : 'تعذر رفض التسوية.'); }
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#355F47] font-bold text-xs uppercase mb-1">
            <FileCheck2 className="w-5 h-5 stroke-[2.2]" />
            <span>مركز الاعتمادات والرقابة المالية</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">
            مراجعة واعتماد المعاملات المعلقة
          </h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            إجمالي المعاملات بانتظار الموافقة: <strong className="text-[#142B1D] font-black">{totalPending} معاملة</strong>
          </p>
        </div>

        {/* Filter Tabs with Neumorphic Inset Well */}
        <div className="neu-inset-sm p-1.5 rounded-2xl flex items-center gap-2 flex-wrap text-xs sm:text-sm font-bold">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer min-h-[40px] ${
              activeTab === 'all' ? 'neu-button text-[#142B1D] font-black' : 'text-[#506E5D] hover:text-[#193223]'
            }`}
          >
            الكل ({totalPending})
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer min-h-[40px] ${
              activeTab === 'expenses' ? 'neu-button text-[#142B1D] font-black' : 'text-[#506E5D] hover:text-[#193223]'
            }`}
          >
            فواتير ({pendingExpenses.length})
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer min-h-[40px] ${
              activeTab === 'tasks' ? 'neu-button text-[#142B1D] font-black' : 'text-[#506E5D] hover:text-[#193223]'
            }`}
          >
            مهام ({pendingTasks.length})
          </button>
          <button
            onClick={() => setActiveTab('settlements')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer min-h-[40px] ${
              activeTab === 'settlements' ? 'neu-button text-[#142B1D] font-black' : 'text-[#506E5D] hover:text-[#193223]'
            }`}
          >
            تسويات ({pendingSettlements.length})
          </button>
        </div>
      </div>

      {/* Grid of Sections */}
      <div className="space-y-6">
        {/* Pending Expenses Section */}
        {(activeTab === 'all' || activeTab === 'expenses') && pendingExpenses.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#142B1D] font-serif-display flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#2B563C] stroke-[2.2]" />
              <span>فواتير ومصروفات نقدية تنتظر الاعتماد ({pendingExpenses.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pendingExpenses.map((exp) => (
                <div key={exp.id} className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#1E4B33] neu-inset-sm px-3 py-1 rounded-full">
                      {exp.code}
                    </span>
                    <span className="text-base font-black text-[#142B1D] font-mono dir-ltr">
                      {formatCurrency(exp.totalWithTax, settings.currency)}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-[#142B1D]">{exp.vendorName}</h4>
                    <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1">{exp.description}</p>
                  </div>

                  <div className="p-4 neu-inset rounded-2xl text-xs sm:text-sm space-y-1.5 text-[#3C5B49]">
                    <div className="flex justify-between">
                      <span>العهدة:</span>
                      <strong className="text-[#142B1D]">{exp.fundName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>رقم الفاتورة:</span>
                      <strong className="font-mono text-[#142B1D]">{exp.invoiceNumber}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>الضريبة ({settings.taxRate}%):</span>
                      <strong className="font-mono text-[#142B1D]">{formatCurrency(exp.taxAmount, settings.currency)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>المسؤول:</span>
                      <span className="font-semibold text-[#183223]">{exp.submittedBy}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#C8D3CC]/50">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRejectExpense(exp.id)}
                      className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                    >
                      رفض
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleApproveExpense(exp.id)}
                      icon={<CheckCircle2 className="w-4.5 h-4.5 stroke-[2.2]" />}
                      className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                    >
                      اعتماد المصروف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Tasks Section */}
        {(activeTab === 'all' || activeTab === 'tasks') && pendingTasks.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#142B1D] font-serif-display flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-[#2A523A] stroke-[2.2]" />
              <span>مهام ميدانية تتطلب اعتماد الإنجاز ({pendingTasks.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pendingTasks.map((t) => (
                <div key={t.id} className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#1F4C33] neu-inset-sm px-3 py-1 rounded-full">
                      {t.code}
                    </span>
                    <Badge variant="purple" size="md">
                      بانتظار الاعتماد
                    </Badge>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-[#142B1D]">{t.title}</h4>
                    <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1">{t.location} - {t.assigneeName}</p>
                  </div>

                  {t.proofRequired && (
                    <div className="p-3.5 neu-inset rounded-2xl text-xs sm:text-sm text-[#7D4916]">
                      <strong>الإثبات المطلوب:</strong> {t.proofRequired}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#C8D3CC]/50">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRejectTask(t.id)}
                      className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                    >
                      إعادة للمراجعة
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleApproveTask(t.id)}
                      icon={<CheckCircle2 className="w-4.5 h-4.5 stroke-[2.2]" />}
                      className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                    >
                      اعتماد الإنجاز
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Settlements Section */}
        {(activeTab === 'all' || activeTab === 'settlements') && pendingSettlements.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#142B1D] font-serif-display flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-[#4D2967] stroke-[2.2]" />
              <span>تسويات دورية بانتظار الاعتماد التدقيقي ({pendingSettlements.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {pendingSettlements.map((s) => (
                <div key={s.id} className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#55306B] neu-inset-sm px-3 py-1 rounded-full">
                      {s.code}
                    </span>
                    <Badge variant="warning" size="md">
                      قيد المراجعة
                    </Badge>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-[#142B1D]">{s.fundName}</h4>
                    <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1">الدورة: {s.periodStart} إلى {s.periodEnd}</p>
                  </div>

                  <div className="p-4 neu-inset rounded-2xl text-xs sm:text-sm space-y-1.5 text-[#3B5A47]">
                    <div className="flex justify-between">
                      <span>سلفة التخصيص:</span>
                      <strong className="font-mono text-[#142B1D]">{formatCurrency(s.advanceAmount, settings.currency)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>إجمالي المصروفات المنفقة:</span>
                      <strong className="font-mono text-[#9E392E] font-bold">{formatCurrency(s.totalExpenses, settings.currency)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#C8D3CC]/50">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRejectSettlement(s.id)}
                      className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                    >
                      رفض وإعادة الفواتير
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleApproveSettlement(s.id)}
                      icon={<CheckCircle2 className="w-4.5 h-4.5 stroke-[2.2]" />}
                      className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                    >
                      اعتماد التسوية
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalPending === 0 && (
          <div className="neu-raised rounded-3xl p-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#2B563C] mx-auto stroke-[2.2]" />
            <h3 className="text-lg font-black text-[#142B1D] font-serif-display">
              لا توجد طلبات اعتماد معلقة حالياً
            </h3>
            <p className="text-xs sm:text-sm text-[#506E5E]">
              لا توجد معاملات بانتظار المراجعة ضمن نطاق صلاحياتك.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
