import React, { useState } from 'react';
import { dataStore } from '../../lib/storage';
import { SettlementsService } from '../../services/settlements.service';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { formatCurrency } from '../../lib/utils/format';

interface NewSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewSettlementModal: React.FC<NewSettlementModalProps> = ({ isOpen, onClose }) => {
  const funds = dataStore.getFunds();
  const expenses = dataStore.getExpenses();

  const [fundId, setFundId] = useState(funds[0]?.id || '');
  const [periodStart, setPeriodStart] = useState('2026-09-01');
  const [periodEnd, setPeriodEnd] = useState('2026-09-15');
  const [notes, setNotes] = useState('تسوية الدورة النصف شهرية الأولى لشهر سبتمبر 2026');

  const selectedFund = funds.find((f) => f.id === fundId);

  // Calculate expenses for this fund that are approved
  const eligibleExpenses = expenses.filter(
    (e) => e.fundId === fundId && (e.status === 'approved' || e.status === 'pending_approval')
  );
  const totalExpensesAmount = eligibleExpenses.reduce((s, e) => s + e.totalWithTax, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundId || !periodStart || !periodEnd) {
      alert('يرجى تحديد العهدة وتواريخ دورة التسوية');
      return;
    }

    SettlementsService.create({
      fundId,
      periodStart,
      periodEnd,
      notes,
    });

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إنهاء ورفع تسوية عهدة دورية"
      description="مطابقة الفواتير المعتمدة خلال الفترة وإصدار سند التصفية المحاسبي"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4.5 text-xs sm:text-sm">
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">العهدة المراد تسويتها *</label>
          <select
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
            className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            required
          >
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} - المسؤول: {f.holderName} (المتبقي: {formatCurrency(f.currentBalance, f.currency)})
              </option>
            ))}
          </select>
        </div>

        {selectedFund && (
          <div className="p-4 sm:p-5 neu-raised rounded-3xl space-y-2.5">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-slate-600 font-medium">سلفة التخصيص الأولية:</span>
              <span className="font-extrabold text-slate-800 dir-ltr font-mono">{formatCurrency(selectedFund.totalAllocation)}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-slate-600 font-medium">إجمالي الفواتير قيد التسوية:</span>
              <span className="font-extrabold text-emerald-800 dir-ltr font-mono">
                {eligibleExpenses.length} فواتير - {formatCurrency(totalExpensesAmount)}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm pt-2.5 border-t border-black/[0.04]">
              <span className="font-bold text-slate-700">الرصيد المتبقي لإعادة التغذية:</span>
              <span className="font-black text-emerald-800 dir-ltr font-mono text-sm sm:text-base">
                {formatCurrency(selectedFund.currentBalance)}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="date"
            label="بداية فترة التسوية *"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            required
          />
          <Input
            type="date"
            label="نهاية فترة التسوية *"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">ملاحظات التدقيق والمطابقة</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
          />
        </div>

        <div className="pt-4 border-t border-black/[0.04] flex items-center justify-end gap-3">
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" size="md" type="submit">
            تقديم طلب التسوية
          </Button>
        </div>
      </form>
    </Modal>
  );
};
