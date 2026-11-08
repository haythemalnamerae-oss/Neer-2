import React, { useMemo, useState } from 'react';
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
  const existingSettlements = dataStore.getSettlements();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = `${today.slice(0, 7)}-01`;

  const [fundId, setFundId] = useState(funds[0]?.id || '');
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [notes, setNotes] = useState('');

  const selectedFund = funds.find((f) => f.id === fundId);
  const alreadyIncludedIds = useMemo(() => new Set(
    existingSettlements.filter((settlement) => settlement.status !== 'rejected')
      .flatMap((settlement) => settlement.expenseIds)
  ), [existingSettlements]);
  const eligibleExpenses = useMemo(() => expenses.filter((expense) =>
    expense.fundId === fundId &&
    expense.status === 'approved' &&
    (expense.expenseDate || expense.submittedAt.match(/^\\d{4}-\\d{2}-\\d{2}/)?.[0] || '') >= periodStart &&
    (expense.expenseDate || expense.submittedAt.match(/^\\d{4}-\\d{2}-\\d{2}/)?.[0] || '') <= periodEnd &&
    !alreadyIncludedIds.has(expense.id)
  ), [expenses, fundId, periodStart, periodEnd, alreadyIncludedIds]);
  const totalExpensesAmount = eligibleExpenses.reduce((sum, expense) => sum + expense.totalWithTax, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundId || !periodStart || !periodEnd || periodStart > periodEnd || eligibleExpenses.length === 0) {
      alert('تحقق من العهدة والفترة، وتأكد من وجود فواتير معتمدة غير مسواة ضمنها.');
      return;
    }

    try {
      SettlementsService.create({
        fundId,
        periodStart,
        periodEnd,
        notes,
        expenseIds: eligibleExpenses.map((expense) => expense.id),
      });
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر إنشاء طلب التسوية.');
    }
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
              <span className="text-slate-600 font-medium">الفواتير المعتمدة غير المسواة:</span>
              <span className="font-extrabold text-emerald-800 dir-ltr font-mono">
                {eligibleExpenses.length} فاتورة - {formatCurrency(totalExpensesAmount)}
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm pt-2.5 border-t border-black/[0.04]">
              <span className="font-bold text-slate-700">الرصيد الحالي للعهدة:</span>
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
            min={periodStart}
            required
          />
        </div>
        <p className="text-xs text-slate-500">تُضمّن الفواتير المعتمدة فقط التي يقع تاريخ تسجيلها أو تاريخ مصروفها داخل الفترة، وتُستبعد الفواتير المرفوضة أو المعلقة أو المحجوزة في تسوية أخرى.</p>

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
          <Button variant="primary" size="md" type="submit" disabled={eligibleExpenses.length === 0 || periodStart > periodEnd}>
            تقديم طلب التسوية ({eligibleExpenses.length})
          </Button>
        </div>
      </form>
    </Modal>
  );
};
