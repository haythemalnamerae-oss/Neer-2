import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { StandingAccount } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { formatCurrency } from '../../lib/utils/format';

interface StandingAccountDetailsModalProps {
  account: StandingAccount | null;
  onClose: () => void;
  canManage: boolean;
  canPostCharge: boolean;
}

export const StandingAccountDetailsModal: React.FC<StandingAccountDetailsModalProps> = ({ account, onClose, canManage, canPostCharge }) => {
  const [mode, setMode] = useState<'charge' | 'settlement'>(canPostCharge ? 'charge' : 'settlement');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [fundId, setFundId] = useState('');
  const [version, setVersion] = useState(0);
  if (!account) return null;

  const current = dataStore.getStandingAccounts().find((item) => item.id === account.id) || account;
  const entries = current.entries || [];
  const entryDelta = entries.reduce((sum, entry) => sum + (entry.type === 'charge' ? entry.amount : -entry.amount), 0);
  const openingBalance = current.openingBalance ?? Number(((current.currentBalance ?? 0) - entryDelta).toFixed(2));
  const balance = current.currentBalance ?? openingBalance + entryDelta;
  const currency = current.currency || dataStore.getSettings().currency;
  const isPayable = current.direction === 'payable' || current.direction === 'payable_by_us';
  const funds = dataStore.getFunds().filter((fund) => fund.currency === currency);
  const linkedExpenses = dataStore.getExpenses();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      window.alert('أدخل مبلغاً صحيحاً أكبر من صفر.');
      return;
    }
    try {
      if (mode === 'charge') {
        dataStore.addStandingAccountCharge(current.id, value, date, description, reference);
      } else {
        if (!fundId) {
          window.alert('حدد العهدة أو الصندوق الذي تمت منه التسوية.');
          return;
        }
        dataStore.settleStandingAccount(current.id, value, fundId, date, description || reference);
      }
      setAmount('');
      setDescription('');
      setReference('');
      setVersion((value) => value + 1);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر حفظ حركة الحساب.');
    }
  };

  return (
    <Modal isOpen={Boolean(account)} onClose={onClose} title={current.name} description={`دفتر حركة الحساب • ${current.code || current.id}`} maxWidth="2xl">
      <div className="space-y-5" key={version}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="neu-inset-sm rounded-2xl p-3">
            <span className="text-xs text-slate-500 block">الرصيد الافتتاحي</span>
            <strong className="font-mono text-lg">{formatCurrency(openingBalance, currency)}</strong>
          </div>
          <div className="neu-inset-sm rounded-2xl p-3">
            <span className="text-xs text-slate-500 block">{isPayable ? 'المبلغ المستحق علينا' : 'المبلغ المستحق لنا'}</span>
            <strong className={`font-mono text-lg ${balance > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{formatCurrency(balance, currency)}</strong>
          </div>
          <div className="neu-inset-sm rounded-2xl p-3">
            <span className="text-xs text-slate-500 block">عدد الحركات</span>
            <strong className="font-mono text-lg">{entries.length}</strong>
          </div>
        </div>

        {canManage && <form onSubmit={handleSubmit} className="neu-raised rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {canPostCharge && <button type="button" onClick={() => setMode('charge')} className={`px-4 py-2 rounded-xl text-xs font-bold ${mode === 'charge' ? 'neu-inset text-emerald-900' : 'neu-raised text-slate-600'}`}>
              {isPayable ? 'إضافة فاتورة معتمدة / رصيد سابق' : 'إضافة مستحق معتمد لنا'}
            </button>}
            <button type="button" onClick={() => setMode('settlement')} className={`px-4 py-2 rounded-xl text-xs font-bold ${mode === 'settlement' ? 'neu-inset text-emerald-900' : 'neu-raised text-slate-600'}`}>
              {isPayable ? 'تسجيل سداد للمورد' : 'تسجيل تحصيل'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700 space-y-1">
              <span>المبلغ ({currency}) *</span>
              <input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full neu-inset rounded-xl px-3 py-2.5" />
            </label>
            <label className="text-xs font-bold text-slate-700 space-y-1">
              <span>التاريخ *</span>
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full neu-inset rounded-xl px-3 py-2.5" />
            </label>
          </div>
          {mode === 'settlement' ? (
            <label className="block text-xs font-bold text-slate-700 space-y-1">
              <span>{isPayable ? 'العهدة التي سيتم السداد منها' : 'الصندوق الذي سيستلم التحصيل'} *</span>
              <select required value={fundId} onChange={(event) => setFundId(event.target.value)} className="w-full neu-inset rounded-xl px-3 py-2.5 bg-transparent">
                <option value="">اختر العهدة / الصندوق</option>
                {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name} — {isPayable ? formatCurrency(fund.currentBalance, currency) : 'استلام نقدي'}</option>)}
              </select>
            </label>
          ) : (
            <label className="block text-xs font-bold text-slate-700 space-y-1">
              <span>بيان الفاتورة أو الحركة *</span>
              <input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="مثال: مشتريات مواد غذائية / فاتورة توريد" className="w-full neu-inset rounded-xl px-3 py-2.5" />
            </label>
          )}
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            <span>{mode === 'charge' ? 'رقم الفاتورة / المرجع' : 'بيان السداد أو التحصيل'}</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="رقم الفاتورة أو ملاحظات" className="w-full neu-inset rounded-xl px-3 py-2.5" />
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="md">{mode === 'charge' ? 'تسجيل الحركة على الحساب' : (isPayable ? 'تأكيد السداد' : 'تأكيد التحصيل')}</Button>
          </div>
        </form>}

        <div className="space-y-2">
          <h4 className="font-black text-sm text-slate-800">كشف حركة الحساب</h4>
          {!canManage && <p className="text-xs text-slate-500">صلاحية العرض فقط؛ لا يمكنك إضافة حركات أو تسويات على هذا الحساب.</p>}
          {canManage && !canPostCharge && <p className="text-xs text-slate-500">إضافة فاتورة مباشرة تتطلب صلاحية اعتماد المصروفات؛ يمكنك تسجيل السداد أو التحصيل حسب صلاحياتك.</p>}
          {entries.length === 0 ? <p className="text-xs text-slate-500 neu-inset-sm rounded-xl p-4">لا توجد حركات بعد. سيظهر هنا كل شراء وفاتورة وسداد أو تحصيل.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead><tr className="border-b text-slate-500"><th className="p-2">التاريخ</th><th className="p-2">البيان</th><th className="p-2">المرجع</th><th className="p-2">إضافة</th><th className="p-2">تسوية</th><th className="p-2">الرصيد</th></tr></thead>
                <tbody>
                  {(() => {
                    let runningBalance = openingBalance;
                    const chronologicalRows = entries.slice().reverse().map((entry) => {
                      runningBalance += entry.type === 'charge' ? entry.amount : -entry.amount;
                      return { entry, balance: runningBalance };
                    });
                    return chronologicalRows.reverse().map(({ entry, balance: rowBalance }) => {
                      const expense = entry.expenseId ? linkedExpenses.find((item) => item.id === entry.expenseId) : undefined;
                      return <tr key={entry.id} className="border-b border-slate-200/70">
                        <td className="p-2 whitespace-nowrap">{entry.date}</td>
                        <td className="p-2 min-w-40">{entry.description}{expense && <span className="block text-[10px] text-slate-500">{expense.code}</span>}</td>
                        <td className="p-2">{entry.reference || '—'}</td>
                        <td className="p-2 font-mono">{entry.type === 'charge' ? formatCurrency(entry.amount, currency) : '—'}</td>
                        <td className="p-2 font-mono">{entry.type === 'settlement' ? formatCurrency(entry.amount, currency) : '—'}</td>
                        <td className="p-2 font-mono font-bold">{formatCurrency(rowBalance, currency)}</td>
                      </tr>;
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
