import React, { useState } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  Eye,
  X,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { ReportsService } from '../../services/reports.service';
import { formatCurrency, EXPENSE_CATEGORY_CONFIG } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface ExpensesViewProps {
  onOpenNewExpense: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ onOpenNewExpense }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  const currentUser = dataStore.getCurrentUser();
  const settings = dataStore.getSettings();
  const canCreateExpense = hasPermission(currentUser.role, 'expenses', 'create');
  const canApproveExpense = hasPermission(currentUser.role, 'expenses', 'approve');
  const canExportExpenses = currentUser.role === 'admin' || currentUser.role === 'finance_officer';
  const allExpenses = dataStore.getExpenses();
  const funds = dataStore.getFunds();
  const expenses = currentUser.role === 'field_officer'
    ? allExpenses.filter((expense) => expense.submittedBy === currentUser.name || funds.some((fund) => fund.id === expense.fundId && fund.holderId === currentUser.id))
    : allExpenses;

  const activeFinancialExpenses = expenses.filter((expense) => expense.status !== 'rejected');
  const totalAmount = activeFinancialExpenses.reduce((sum, expense) => sum + expense.totalWithTax, 0);
  const totalTax = activeFinancialExpenses.reduce((sum, expense) => sum + expense.taxAmount, 0);

  const filteredExpenses = expenses.filter((e) => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        e.vendorName.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        e.invoiceNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExportCSV = () => {
    const csvData = ReportsService.exportExpensesToCSV();
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Expenses_VAT_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApprove = (id: string) => {
    try {
      dataStore.updateExpenseStatus(id, 'approved');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر اعتماد الفاتورة.');
    }
  };

  const handleReject = (id: string) => {
    const reason = window.prompt('سبب رفض الفاتورة:', 'نقص في بيانات الفاتورة');
    if (reason?.trim()) {
      try {
        dataStore.updateExpenseStatus(id, 'rejected', reason.trim());
      } catch (error) {
        alert(error instanceof Error ? error.message : 'تعذر رفض الفاتورة.');
      }
    }
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#2F5A3E] font-bold text-xs uppercase mb-1">
            <Receipt className="w-5 h-5 stroke-[2.2]" />
            <span>سجل الفواتير والمصروفات اليومية والضريبة (VAT {settings.taxRate}%)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">
            توثيق المصروفات والضريبة المضافة
          </h2>
          <p className="text-xs sm:text-sm text-[#4F6C5B] mt-1 font-medium">
            إجمالي المبالغ المسجلة: <strong className="text-[#152B1E] font-mono dir-ltr">{formatCurrency(totalAmount, settings.currency)}</strong> (بما فيها <strong className="dir-ltr font-mono">{formatCurrency(totalTax, settings.currency)}</strong> ضريبة {settings.taxRate}%)
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canExportExpenses && <Button
            variant="outline"
            size="md"
            onClick={handleExportCSV}
            icon={<Download className="w-4.5 h-4.5 stroke-[2.2]" />}
            className="text-xs sm:text-sm font-bold min-h-[44px]"
          >
            تصدير تقرير CSV
          </Button>}
          {canCreateExpense && <Button
            variant="primary"
            size="md"
            onClick={onOpenNewExpense}
            icon={<Plus className="w-5 h-5 stroke-[2.5]" />}
            className="text-xs sm:text-sm font-bold min-h-[44px]"
          >
            فاتورة جديدة
          </Button>}
        </div>
      </div>

      {/* Filter Bar with Inset Inputs */}
      <div className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute right-3.5 text-[#547362] stroke-[2.2] pointer-events-none" />
            <input
              type="text"
              placeholder="البحث بالمورد، البيان، رقم الفاتورة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-11 pl-4 text-xs sm:text-sm"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full text-xs sm:text-sm font-semibold"
          >
            <option value="all">كافة التصنيفات</option>
            {Object.entries(EXPENSE_CATEGORY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full text-xs sm:text-sm font-semibold"
          >
            <option value="all">كافة الحالات</option>
            <option value="pending_approval">قيد الاعتماد</option>
            <option value="approved">معتمدة</option>
            <option value="rejected">مرفوضة</option>
            <option value="settled">مسواة في تقرير دوري</option>
          </select>
        </div>
      </div>

      {/* Main Expenses Table */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead className="text-[#4E6C5C] font-bold border-b border-[#C8D3CC]/50">
              <tr>
                <th className="p-4">الكود والفاتورة</th>
                <th className="p-4">المورد والبيان</th>
                <th className="p-4">العهدة والمستفيد</th>
                <th className="p-4">المبلغ الأساسي</th>
                <th className="p-4">الضريبة ({settings.taxRate}%)</th>
                <th className="p-4">الإجمالي</th>
                <th className="p-4">الحالة</th>
                <th className="p-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D3CC]/30">
              {filteredExpenses.map((exp) => {
                const catCfg = EXPENSE_CATEGORY_CONFIG[exp.category] || { label: exp.category };

                return (
                  <tr key={exp.id} className="hover:neu-inset transition">
                    <td className="p-4">
                      <span className="font-mono font-bold text-[#152B1E] block text-sm">{exp.code}</span>
                      <span className="text-xs text-[#5C7969] font-mono block mt-1">
                        رقم: {exp.invoiceNumber}
                      </span>
                    </td>

                    <td className="p-4 max-w-xs">
                      <span className="font-bold text-[#132A1C] block text-sm">{exp.vendorName}</span>
                      <span className="text-xs text-[#506E5D] block truncate mt-1">{exp.description}</span>
                      <span className="text-xs text-[#285539] font-bold block mt-1">
                        {catCfg.label}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className="font-bold text-[#183122] block truncate">{exp.fundName}</span>
                      <span className="text-xs text-[#5C7969] block mt-1">بواسطة: {exp.submittedBy}</span>
                    </td>

                    <td className="p-4 font-mono font-semibold text-[#1C3527]">
                      {formatCurrency(exp.amount, settings.currency)}
                    </td>

                    <td className="p-4 font-mono text-[#547363]">
                      {formatCurrency(exp.taxAmount, settings.currency)}
                    </td>

                    <td className="p-4 font-mono font-black text-[#132A1C] text-base">
                      {formatCurrency(exp.totalWithTax, settings.currency)}
                    </td>

                    <td className="p-4">
                      <Badge
                        variant={
                          exp.status === 'approved'
                            ? 'success'
                            : exp.status === 'rejected'
                            ? 'danger'
                            : 'warning'
                        }
                        size="md"
                      >
                        {exp.status === 'approved'
                          ? 'معتمد'
                          : exp.status === 'rejected'
                          ? 'مرفوض'
                          : exp.status === 'settled'
                          ? 'مسوّى'
                          : exp.status === 'draft'
                          ? 'مسودة'
                          : 'قيد الاعتماد'}
                      </Badge>
                    </td>

                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        {exp.receiptUrl && (
                          <button
                            onClick={() => setPreviewReceiptUrl(exp.receiptUrl!)}
                            className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#2A523A] cursor-pointer"
                            title="معاينة الإيصال"
                          >
                            <Eye className="w-5 h-5 stroke-[2.2]" />
                          </button>
                        )}
                        {canApproveExpense && exp.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => handleApprove(exp.id)}
                              className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#205133] cursor-pointer"
                              title="اعتماد"
                            >
                              <CheckCircle2 className="w-5 h-5 stroke-[2.2]" />
                            </button>
                            <button
                              onClick={() => handleReject(exp.id)}
                              className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#96372B] cursor-pointer"
                              title="رفض"
                            >
                              <XCircle className="w-5 h-5 stroke-[2.2]" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-[#547363]">
                    لا توجد فواتير مطابقة للبحث والتصفية الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal Preview */}
      {previewReceiptUrl && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-[#14261B]/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewReceiptUrl(null)}
        >
          <div
            className="neu-raised-lg bg-[#EAF0EC] rounded-3xl p-6 max-w-lg w-full space-y-4 border-none animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#C8D3CC]/50">
              <span className="font-black text-base text-[#142B1D] font-serif-display">معاينة صورة الفاتورة / الإيصال</span>
              <button
                onClick={() => setPreviewReceiptUrl(null)}
                className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#3D5C4A]"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden max-h-[70vh] flex items-center justify-center neu-inset p-2">
              <img
                src={previewReceiptUrl}
                alt="Receipt"
                className="max-h-[65vh] w-auto object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
