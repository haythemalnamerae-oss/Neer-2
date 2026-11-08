import React, { useState } from 'react';
import {
  FileCheck2,
  Plus,
  Eye,
  Printer,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Settlement } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { SettlementsService } from '../../services/settlements.service';
import { formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface SettlementsViewProps {
  onOpenNewSettlement: () => void;
}

export const SettlementsView: React.FC<SettlementsViewProps> = ({ onOpenNewSettlement }) => {
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [previewSettlement, setPreviewSettlement] = useState<Settlement | null>(null);

  const currentUser = dataStore.getCurrentUser();
  const settings = dataStore.getSettings();
  const canCreateSettlement = hasPermission(currentUser.role, 'settlements', 'create');
  const canApproveSettlement = hasPermission(currentUser.role, 'settlements', 'approve');
  const requiresDualApproval = settings.requireDualApprovalForSettlements;
  const allSettlements = dataStore.getSettlements();
  const settlements = currentUser.role === 'field_officer'
    ? allSettlements.filter((settlement) => settlement.settledBy === currentUser.name)
    : allSettlements;

  const handlePrint = (st: Settlement) => {
    setSelectedSettlement(st);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleReject = (id: string) => {
    const reason = window.prompt('سبب رفض التسوية وإعادة فواتيرها إلى قائمة التسوية:', 'توجد ملاحظات تحتاج إلى تصحيح');
    if (!reason?.trim()) return;
    try {
      SettlementsService.reject(id, reason.trim());
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر رفض التسوية.');
    }
  };

  const handleApprove = (id: string) => {
    const notes = window.prompt('ملاحظات التدقيق والمطابقة:', `تمت مراجعة الفواتير والتحقق من الضريبة ${settings.taxRate}%`);
    try {
      SettlementsService.approve(id, notes || undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر اعتماد التسوية.');
    }
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#4E2B68] font-bold text-xs uppercase mb-1">
            <FileCheck2 className="w-5 h-5 stroke-[2.2]" />
            <span>التسويات الدورية وسندات التصفية (Settlements & Vouchers)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">
            سجل تسويات العهد النقدية
          </h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            مطابقة الفواتير الدورية، احتساب سلف التخصيص وإصدار سندات التصفية الرسمية للطباعة
          </p>
        </div>

        {canCreateSettlement && <Button
          variant="primary"
          size="md"
          onClick={onOpenNewSettlement}
          icon={<Plus className="w-5 h-5 stroke-[2.5]" />}
          className="text-xs sm:text-sm font-bold min-h-[44px]"
        >
          إنشاء تسوية دورية
        </Button>}
      </div>

      {/* Grid of Settlements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settlements.map((st) => (
          <div key={st.id} className="neu-raised rounded-3xl p-6 sm:p-7 space-y-5 transition-all">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[#55316B] neu-inset-sm px-3 py-1 rounded-full">
                {st.code}
              </span>
              <Badge
                variant={st.status === 'approved' || st.status === 'closed' ? 'success' : st.status === 'rejected' ? 'danger' : 'warning'}
                size="md"
              >
                {st.status === 'approved' || st.status === 'closed' ? 'معتمدة ومقفلة' : st.status === 'rejected' ? 'مرفوضة — الفواتير متاحة لإعادة التسوية' : st.status === 'audited' ? 'مدققة بانتظار الاعتماد' : 'قيد المراجعة التدقيقية'}
              </Badge>
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-black text-[#142B1D] font-serif-display">{st.fundName}</h3>
              <p className="text-xs text-[#527060] mt-1 font-medium">
                دورة التسوية: {st.periodStart} إلى {st.periodEnd}
              </p>
            </div>

            {/* Financial Box Inset */}
            <div className="p-4 sm:p-5 neu-inset rounded-2xl space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between text-[#446251]">
                <span>سلفة التخصيص الأساسية:</span>
                <strong className="font-mono text-[#142B1D] font-bold">{formatCurrency(st.advanceAmount, settings.currency)}</strong>
              </div>
              <div className="flex justify-between text-[#446251]">
                <span>إجمالي المصروفات المنفقة:</span>
                <strong className="font-mono text-[#9E392E] font-bold">{formatCurrency(st.totalExpenses, settings.currency)}</strong>
              </div>
              <div className="flex justify-between text-[#142B1D] font-black pt-2.5 border-t border-[#C8D3CC]/50">
                <span>الرصيد المتبقي لإعادة التغذية:</span>
                <strong className="font-mono text-[#235337]">{formatCurrency(st.remainingAmount, settings.currency)}</strong>
              </div>
            </div>

            {st.auditedBy && (
              <div className="text-xs text-slate-500">المدقق الأول: <strong>{st.auditedBy}</strong>{st.auditedAt ? ` — ${st.auditedAt}` : ''}</div>
            )}
            {st.auditNotes && (
              <div className="p-3.5 neu-inset rounded-2xl text-xs sm:text-sm text-[#502E68]">
                <strong>ملاحظات التدقيق:</strong> {st.auditNotes}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3.5 border-t border-[#C8D3CC]/50 flex-wrap gap-2.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewSettlement(st)}
                  icon={<Eye className="w-4 h-4 text-[#2D5A3E] stroke-[2.2]" />}
                  className="text-xs sm:text-sm font-bold min-h-[40px]"
                >
                  معاينة السند
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePrint(st)}
                  icon={<Printer className="w-4 h-4 text-[#506E5D] stroke-[2.2]" />}
                  className="text-xs sm:text-sm font-bold min-h-[40px]"
                >
                  طباعة
                </Button>
              </div>

              {canApproveSettlement && ['under_review', 'audited'].includes(st.status) && (
                <>
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handleApprove(st.id)}
                  disabled={requiresDualApproval && st.status === 'audited' && st.auditedBy === currentUser.name}
                  icon={<CheckCircle2 className="w-4.5 h-4.5 stroke-[2.2]" />}
                  className="text-xs sm:text-sm font-bold min-h-[40px]"
                >
                  {requiresDualApproval ? (st.status === 'audited' ? 'الاعتماد النهائي' : 'التدقيق الأولي') : 'اعتماد التسوية'}
                </Button>
                {requiresDualApproval && st.status === 'audited' && st.auditedBy === currentUser.name && <span className="text-xs text-amber-700">يلزم معتمد مختلف عن المدقق الأول</span>}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleReject(st.id)}
                  icon={<X className="w-4 h-4" />}
                  className="text-xs sm:text-sm font-bold min-h-[40px]"
                >
                  رفض وإعادة الفواتير
                </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {settlements.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            لا توجد تسويات ضمن نطاق صلاحيتك حتى الآن.
          </div>
        )}
      </div>

      {/* On-Screen Modal for Official Settlement Voucher Preview */}
      {previewSettlement && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#14261B]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh] border-none">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#C8D3CC]/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="w-6 h-6 text-[#55306B] stroke-[2.2]" />
                <h3 className="font-black text-base text-[#142B1D] font-serif-display">
                  معاينة سند تصفية وتسوية العهدة النقدية الرسمية
                </h3>
              </div>
              <button
                onClick={() => setPreviewSettlement(null)}
                className="w-9 h-9 rounded-xl neu-button flex items-center justify-center text-[#3D5B49]"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Voucher Body (A4 Style Preview in Soft UI) */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-[#152B1E]">
              <div className="border-b-2 border-[#1E3B29] pb-4 flex justify-between items-start">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-[#132A1C] font-serif-display">
                    منظومة العمليات الميدانية والعهد - OpsPlatform
                  </h1>
                  <h2 className="text-base font-bold text-[#4E2B68] mt-1">سند تصفية وتسوية عهدة نقدية رسمية</h2>
                  <p className="text-xs text-[#527060] mt-0.5 font-mono">رقم السند: {previewSettlement.voucherNumber || previewSettlement.code}</p>
                </div>
                <div className="text-left font-mono text-xs text-[#4F6C5B] space-y-1">
                  <p>تاريخ الإصدار: {new Date().toISOString().split('T')[0]}</p>
                  <p>كود الحركة: {previewSettlement.code}</p>
                  <p className="text-[#215435] font-bold">الحالة: {previewSettlement.status === 'approved' || previewSettlement.status === 'closed' ? 'معتمد رسمياً' : previewSettlement.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm neu-inset p-5 rounded-2xl">
                <div className="space-y-1.5">
                  <p><strong>اسم العهدة:</strong> {previewSettlement.fundName}</p>
                  <p><strong>المسؤول / أمين العهدة:</strong> {previewSettlement.settledBy || 'مسؤول العمليات الميدانية'}</p>
                </div>
                <div className="space-y-1.5 text-left sm:text-right">
                  <p><strong>فترة دورة التسوية:</strong> من {previewSettlement.periodStart} إلى {previewSettlement.periodEnd}</p>
                  <p><strong>عدد الفواتير المرفقة:</strong> {previewSettlement.expenseIds?.length || 0} فواتير</p>
                </div>
              </div>

              {/* Accounting Summary Table */}
              <div className="neu-raised rounded-2xl overflow-hidden p-4">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-[#4E6C5C]">
                      <th className="p-3 text-right font-bold">البند المحاسبي</th>
                      <th className="p-3 text-center font-bold">المبلغ ({settings.currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 font-medium">سلفة التخصيص الأساسية للعهدة (Advance Allocation)</td>
                      <td className="p-3 text-center font-mono font-bold text-[#142B1D]">{formatCurrency(previewSettlement.advanceAmount, settings.currency)}</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-medium">إجمالي المصروفات والفواتير الميدانية المنفقة والمدققة</td>
                      <td className="p-3 text-center font-mono font-bold text-[#9E392E]">{formatCurrency(previewSettlement.totalExpenses, settings.currency)}</td>
                    </tr>
                    <tr className="font-bold">
                      <td className="p-3">صافي الرصيد المستحق لإعادة التعويض والتغذية (Reimbursement Due)</td>
                      <td className="p-3 text-center font-mono text-base text-[#4E2B68] font-black">{formatCurrency(previewSettlement.totalExpenses, settings.currency)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {previewSettlement.auditNotes && (
                <div className="p-4 neu-inset rounded-2xl text-xs sm:text-sm text-[#4E2B68]">
                  <strong>ملاحظات التدقيق والمطابقة:</strong> {previewSettlement.auditNotes}
                </div>
              )}

              {/* Signatures Row */}
              <div className="pt-6 grid grid-cols-3 gap-6 text-center text-xs sm:text-sm">
                <div className="space-y-6">
                  <p className="font-bold text-[#152B1E]">أمين العهدة المستلم</p>
                  <div className="border-t border-[#A8B8AD] pt-1.5 text-xs text-[#527060]">التوقيع والتاريخ</div>
                </div>
                <div className="space-y-6">
                  <p className="font-bold text-[#152B1E]">رئيس التدقيق المحاسبي</p>
                  <div className="border-t border-[#A8B8AD] pt-1.5 text-xs text-[#527060]">التوقيع والتاريخ</div>
                </div>
                <div className="space-y-6">
                  <p className="font-bold text-[#152B1E]">اعتماد الإدارة العامة</p>
                  <div className="border-t border-[#A8B8AD] pt-1.5 text-xs text-[#527060]">الختم والمصادقة</div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#C8D3CC]/50 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewSettlement(null)}
                className="text-xs sm:text-sm font-bold min-h-[42px]"
              >
                إغلاق
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const target = previewSettlement;
                  setPreviewSettlement(null);
                  handlePrint(target);
                }}
                icon={<Printer className="w-5 h-5 stroke-[2.2]" />}
                className="text-xs sm:text-sm font-bold min-h-[44px]"
              >
                طباعة السند الرسمي الآن (Print)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Official Printable Liquidation Voucher (Rendered during window.print) */}
      {selectedSettlement && (
        <div className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50 text-right dir-rtl">
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black">منظومة العمليات الميدانية والعهد - OpsPlatform</h1>
              <h2 className="text-lg font-bold mt-1">سند تصفية وتسوية عهدة نقدية رسمية</h2>
              <p className="text-xs mt-0.5">رقم السند: {selectedSettlement.voucherNumber || selectedSettlement.code}</p>
            </div>
            <div className="text-left font-mono text-xs">
              <p>تاريخ السند: {new Date().toISOString().split('T')[0]}</p>
              <p>كود التسوية: {selectedSettlement.code}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
            <div>
              <p><strong>اسم العهدة:</strong> {selectedSettlement.fundName}</p>
              <p><strong>أمين العهدة المسؤول:</strong> {selectedSettlement.settledBy || 'المسؤول الميداني'}</p>
            </div>
            <div>
              <p><strong>فترة الدورة:</strong> من {selectedSettlement.periodStart} إلى {selectedSettlement.periodEnd}</p>
              <p><strong>حالة الاعتماد:</strong> {selectedSettlement.status === 'approved' || selectedSettlement.status === 'closed' ? 'معتمد ومصادق عليه' : 'قيد المراجعة — غير معتمد'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
