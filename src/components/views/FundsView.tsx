import React, { useState } from 'react';
import {
  Wallet,
  Plus,
  RefreshCw,
  AlertTriangle,
  ArrowDownLeft,
  CheckCircle2,
  BadgeAlert,
  CreditCard,
  X,
  Search,
  Trash2,
  Phone,
  Store,
} from 'lucide-react';
import { PettyCashFund, StandingAccount } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { NewStandingAccountModal } from '../modals/NewStandingAccountModal';
import { StandingAccountDetailsModal } from '../modals/StandingAccountDetailsModal';

interface FundsViewProps {
  onOpenNewFund: () => void;
  onOpenNewSettlement: () => void;
  onSelectView: (view: string) => void;
}

export const FundsView: React.FC<FundsViewProps> = ({
  onOpenNewFund,
  onOpenNewSettlement,
  onSelectView,
}) => {
  const [activeTab, setActiveTab] = useState<'funds' | 'receipts' | 'deficit' | 'standing'>('funds');
  
  // Replenish Fund State
  const [replenishModalFund, setReplenishModalFund] = useState<PettyCashFund | null>(null);
  const [replenishAmount, setReplenishAmount] = useState('10000');
  const [replenishNotes, setReplenishNotes] = useState('');

  // New Cash Receipt State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptSource, setReceiptSource] = useState('');
  const [receiptType, setReceiptType] = useState<'order_payment' | 'cash_box' | 'purchase_advance' | 'other'>('cash_box');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptFundId, setReceiptFundId] = useState('');

  // New Standing Account State
  const [isStandingModalOpen, setIsStandingModalOpen] = useState(false);
  const [selectedStandingAccount, setSelectedStandingAccount] = useState<StandingAccount | null>(null);
  const [standingSearch, setStandingSearch] = useState('');
  const [standingFilter, setStandingFilter] = useState<'all' | 'payable' | 'receivable'>('all');

  const currentUser = dataStore.getCurrentUser();
  const settings = dataStore.getSettings();
  const canCreateFund = hasPermission(currentUser.role, 'funds', 'create');
  const canEditFund = hasPermission(currentUser.role, 'funds', 'edit');
  const canCreateExpense = hasPermission(currentUser.role, 'expenses', 'create');
  const canApproveExpense = hasPermission(currentUser.role, 'expenses', 'approve');
  const canCreateSettlement = hasPermission(currentUser.role, 'settlements', 'create');
  const allFunds = dataStore.getFunds();
  const funds = currentUser.role === 'field_officer'
    ? allFunds.filter((fund) => fund.holderId === currentUser.id)
    : allFunds;
  const allExpenses = dataStore.getExpenses();
  const expenses = currentUser.role === 'field_officer'
    ? allExpenses.filter((expense) => expense.submittedBy === currentUser.name || funds.some((fund) => fund.id === expense.fundId))
    : allExpenses;
  const allCashReceipts = dataStore.getCashReceipts();
  const cashReceipts = currentUser.role === 'field_officer'
    ? allCashReceipts.filter((receipt) => receipt.receivedBy === currentUser.name || funds.some((fund) => fund.id === receipt.fundId))
    : allCashReceipts;
  const standingAccounts = dataStore.getStandingAccounts();

  // Deficit / Negative balance expenses
  const deficitExpenses = expenses.filter((expense) => expense.isDeficit && expense.status !== 'rejected');
  const pendingDeficitExpenses = deficitExpenses.filter((expense) => !expense.isCoveredFromCash && expense.status === 'approved');

  // Financial aggregates
  const totalAllocated = funds.reduce((s, f) => s + f.totalAllocation, 0);
  const totalBalance = funds.reduce((s, f) => s + f.currentBalance, 0);
  const totalReceipts = cashReceipts.reduce((s, r) => s + r.amount, 0);
  const totalPendingDeficit = pendingDeficitExpenses.reduce((s, e) => s + (e.deficitAmount || e.totalWithTax), 0);
  const fundCurrencyForExpense = (fundId: string) => funds.find((fund) => fund.id === fundId)?.currency || settings.currency;

  const handleConfirmReplenish = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(replenishAmount);
    if (!replenishModalFund || !Number.isFinite(amount) || amount <= 0) return;
    try {
      dataStore.replenishFund(replenishModalFund.id, amount, replenishNotes || 'تغذية رصيد تعويضية للعهدة النقدية');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر تغذية العهدة.');
      return;
    }
    setReplenishModalFund(null);
    setReplenishAmount('10000');
    setReplenishNotes('');
  };

  const handleCreateCashReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(receiptAmount);
    if (!amt || amt <= 0 || !receiptSource.trim()) {
      alert('يرجى إدخال مبلغ صحيح وتحديد المصدر');
      return;
    }

    if (receiptType === 'cash_box' && !receiptFundId) {
      alert('حدد العهدة أو الصندوق الذي سيُضاف إليه المبلغ المقبوض.');
      return;
    }

    try {
      dataStore.addCashReceipt({
      amount: amt,
      source: receiptSource.trim(),
      type: receiptType,
      receivedBy: currentUser.name,
      date: new Date().toISOString().split('T')[0],
      notes: receiptNotes || undefined,
      fundId: receiptType === 'cash_box' ? receiptFundId : undefined,
      fundName: receiptType === 'cash_box' ? funds.find((fund) => fund.id === receiptFundId)?.name : undefined,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر تسجيل المقبوض.');
      return;
    }

    setIsReceiptModalOpen(false);
    setReceiptAmount('');
    setReceiptSource('');
    setReceiptNotes('');
    setReceiptFundId('');
  };

  const handleCoverDeficit = (expenseId: string) => {
    try {
      dataStore.coverDeficitExpenseFromCash(expenseId, currentUser.name);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر تغطية العجز من الصندوق.');
    }
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Banner: Forest Green Master Card */}
      <div
        className="rounded-[28px] p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 text-white shadow-xl"
        style={{
          backgroundColor: '#2A443B',
          boxShadow: '0 20px 45px rgba(22, 44, 34, 0.28), 0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div>
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase mb-1">
            <Wallet className="w-4 h-4" />
            <span>المنظومة المالية المدمجة وإدارة العهد والصندوق</span>
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white font-serif-hero tracking-tight">
            سجل العهد، السيولة، المقبوضات وتغطية العجز
          </h2>
          <p className="text-xs sm:text-sm text-white/75 mt-1 font-sans-inter">
            الرقابة المالية الذكية: تتبع استنزاف العهد المتعددة، تسوية الرصيد السالب، والمقبوضات النقدية
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {canEditFund && <button
            onClick={() => setIsReceiptModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold font-sans-inter transition-all border border-white/20 cursor-pointer shadow-xs active:scale-95"
          >
            <ArrowDownLeft className="w-4 h-4 ml-1" />
            <span>توريد مقبوضات</span>
          </button>}
          {canCreateSettlement && <button
            onClick={onOpenNewSettlement}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold font-sans-inter transition-all border border-white/20 cursor-pointer shadow-xs active:scale-95"
          >
            <span>طلب تسوية</span>
          </button>}
          {canCreateFund && <button
            onClick={onOpenNewFund}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-[#F4F7F5] hover:bg-white text-[#2A443B] text-xs font-bold font-sans-inter transition-all shadow-md cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>عهدة جديدة</span>
          </button>}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="inner-white-card p-5 space-y-1">
          <span className="text-xs font-semibold text-slate-500 block">إجمالي المخصصات المعتمدة</span>
          <span className="text-2xl font-black text-slate-900 block font-sans-inter dir-ltr">
            {formatCurrency(totalAllocated, settings.currency)}
          </span>
          <span className="text-[11px] text-slate-400 block font-medium">{funds.length} عهد مسجلة</span>
        </div>

        <div className="inner-white-card p-5 space-y-1">
          <span className="text-xs font-semibold text-slate-500 block">الرصيد المتاح في العهد</span>
          <span className="text-2xl font-black text-emerald-800 block font-sans-inter dir-ltr">
            {formatCurrency(totalBalance, settings.currency)}
          </span>
          <span className="text-[11px] text-emerald-700 font-bold block">
            نسبة السيولة: {totalAllocated > 0 ? Math.round((totalBalance / totalAllocated) * 100) : 0}%
          </span>
        </div>

        <div className="inner-white-card p-5 space-y-1">
          <span className="text-xs font-semibold text-slate-500 block">إجمالي المقبوضات المسجلة</span>
          <span className="text-2xl font-black text-sky-800 block font-sans-inter dir-ltr">
            {formatCurrency(totalReceipts, settings.currency)}
          </span>
          <span className="text-[11px] text-sky-700 font-bold block">
            {cashReceipts.length} مقبوض مسجل
          </span>
        </div>

        <div className={`inner-white-card p-5 space-y-1 ${pendingDeficitExpenses.length > 0 ? 'ring-2 ring-rose-400/40' : ''}`}>
          <span className="text-xs font-bold text-rose-700 block">عجز معلق تغطيته (رصيد سالب)</span>
          <span className="text-2xl font-black text-rose-700 block font-sans-inter dir-ltr">
            {formatCurrency(totalPendingDeficit, settings.currency)}
          </span>
          <span className="text-[11px] text-rose-600 font-medium block">
            {pendingDeficitExpenses.length} فواتير تتطلب تسوية من الصندوق
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs with circular notification count badges */}
      <div className="inner-white-card p-2 flex items-center gap-2 overflow-x-auto text-xs sm:text-sm font-bold no-scrollbar">
        {[
          { id: 'funds', label: 'العهد النقدية والمخصصات', icon: Wallet, count: funds.length },
          { id: 'deficit', label: 'العجز والرصيد السالب', icon: AlertTriangle, count: pendingDeficitExpenses.length, alert: pendingDeficitExpenses.length > 0 },
          { id: 'receipts', label: 'مقبوضات الصندوق', icon: ArrowDownLeft, count: cashReceipts.length },
          { id: 'standing', label: 'حسابات الصرف الدائمة', icon: CreditCard, count: standingAccounts.length },
        ].map((tab) => {
          const isSelected = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-full transition cursor-pointer flex items-center gap-2 shrink-0 ${
                isSelected
                  ? 'bg-[#2A443B] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80'
              }`}
            >
              <Icon className="w-4 h-4 stroke-[2]" />
              <span>{tab.label}</span>
              <span
                className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  isSelected
                    ? 'bg-white text-[#2A443B]'
                    : tab.alert
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Petty Cash Funds Grid */}
      {activeTab === 'funds' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {funds.map((fund) => {
            const ratio = fund.totalAllocation > 0 ? Math.round((fund.currentBalance / fund.totalAllocation) * 100) : 0;
            const isWarning = ratio <= fund.warningThreshold;
            const isDepleted = fund.currentBalance <= 0;

            return (
              <div key={fund.id} className="neu-raised rounded-3xl p-6 sm:p-7 space-y-5 transition-all">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#2A543A] neu-inset-sm px-2.5 py-1 rounded-full">
                        {fund.code}
                      </span>
                      {isDepleted ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-inset-sm text-[#A03E33]">
                          منفذة بالكامل (0.00)
                        </span>
                      ) : isWarning ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-inset-sm text-[#915B1F]">
                          تنبيه: رصيد منخفض
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-raised-sm text-[#275338]">
                          نشطة ومستقرة
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-black text-[#1A2E22] font-serif-display">{fund.name}</h3>
                    <p className="text-xs text-[#537060] mt-0.5 font-medium">{fund.purpose || 'تغطية المصاريف الميدانية اليومية'}</p>
                  </div>

                  <div className="text-left shrink-0">
                    <span className="text-xs text-[#5D7B6B] block font-medium">الرصيد المتاح</span>
                    <strong className="text-xl font-black text-[#192E21] dir-ltr block font-mono">
                      {formatCurrency(fund.currentBalance, fund.currency)}
                    </strong>
                  </div>
                </div>

                {/* Progress Bar with Inset Track */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-[#4F6C5B]">
                    <span>نسبة الرصيد المتبقي: <strong className="font-mono">{ratio}%</strong></span>
                    <span>المخصص: <strong className="dir-ltr font-mono">{formatCurrency(fund.totalAllocation, fund.currency)}</strong></span>
                  </div>
                  <div className="w-full neu-inset-sm h-3 rounded-full overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isDepleted ? 'bg-[#A03E33]' : isWarning ? 'bg-[#9C6322]' : 'bg-[#3D694E]'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(ratio, 0))}%` }}
                    />
                  </div>
                </div>

                {/* Info Grid Inset Card */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 neu-inset rounded-2xl text-xs text-[#3C5747]">
                  <div>
                    <span className="text-[#648071] block text-[11px] font-semibold">أمين العهدة المسؤول</span>
                    <strong className="text-[#192E21]">{fund.holderName}</strong>
                    <span className="text-[10px] text-[#648071] block">{fund.holderDepartment}</span>
                  </div>
                  <div>
                    <span className="text-[#648071] block text-[11px] font-semibold">آخر تغذية رصيد</span>
                    <strong className="text-[#192E21] font-mono">{fund.lastReplenishedDate}</strong>
                    <span className="text-[10px] text-[#648071] block">حد التنبيه: {fund.warningThreshold}%</span>
                  </div>
                  <div>
                    <span className="text-[#648071] block text-[11px] font-semibold">رصيد الصندوق النقدي</span>
                    <strong className="text-[#192E21] font-mono">{formatCurrency(fund.cashBoxBalance || 0, fund.currency)}</strong>
                    <span className="text-[10px] text-[#648071] block">متاح لتغطية العجز المسجل</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#C8D3CC]/50 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectView('expenses')}
                    className="text-xs"
                  >
                    عرض الفواتير
                  </Button>
                  <div className="flex items-center gap-2">
                    {canCreateExpense && <Button variant="outline" size="sm" onClick={() => onSelectView('expenses')} className="text-xs">تسجيل فاتورة</Button>}
                    {canEditFund && <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setReplenishModalFund(fund)}
                      icon={<RefreshCw className="w-3.5 h-3.5 ml-1" />}
                      className="text-xs font-bold"
                    >
                      تغذية الرصيد
                    </Button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Deficit Expenses & Immediate Cash Box Reconciliation */}
      {activeTab === 'deficit' && (
        <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#C8D3CC]/50">
            <div>
              <h3 className="text-base sm:text-lg font-black text-[#1A2E22] font-serif-display flex items-center gap-2">
                <BadgeAlert className="w-5 h-5 text-[#A03E33]" />
                <span>حسابات العجز والمصروفات السالبة (Negative Balance Ledger)</span>
              </h3>
              <p className="text-xs text-[#526F5E] mt-0.5">
                تتيح للمنفذ تسجيل المصروف الميداني عند نفاد العهدة مؤقتاً، مع تسوية وتغطية فورية بضغطة زر عند دخول أموال جديدة للصندوق
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-[#557161] font-bold border-b border-[#C8D3CC]/50">
                <tr>
                  <th className="p-3.5">الكود والتاريخ</th>
                  <th className="p-3.5">البيان والمهمة المرتبطة</th>
                  <th className="p-3.5">المسؤول المنفذ</th>
                  <th className="p-3.5">مبلغ العجز (سالب)</th>
                  <th className="p-3.5">الحالة والتغطية</th>
                  <th className="p-3.5 text-center">إجراء التسوية الفورية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C8D3CC]/30">
                {deficitExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:neu-inset transition">
                    <td className="p-3.5 font-mono">
                      <strong className="text-[#1A2E22] block">{exp.code}</strong>
                      <span className="text-[10px] text-[#638070]">{exp.submittedAt}</span>
                    </td>

                    <td className="p-3.5 max-w-xs">
                      <strong className="text-[#192D21] block">{exp.vendorName}</strong>
                      <span className="text-[11px] text-[#556F60] block truncate">{exp.notes || exp.description || exp.category}</span>
                      {exp.taskTitle && (
                        <span className="text-[10px] text-[#2F593F] font-bold block mt-0.5">
                          مهمة: {exp.taskTitle}
                        </span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <strong className="text-[#203628]">{exp.submittedBy}</strong>
                    </td>

                    <td className="p-3.5 font-mono">
                      <span className="text-[#A03E33] font-black text-sm dir-ltr block">
                        -{formatCurrency(exp.deficitAmount || exp.totalWithTax, fundCurrencyForExpense(exp.fundId))}
                      </span>
                    </td>

                    <td className="p-3.5">
                      {exp.isCoveredFromCash ? (
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-raised-sm text-[#275538] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            تمت التغطية من الصندوق
                          </span>
                          <span className="text-[10px] text-[#648071] block">
                            بواسطة {exp.coveredBy} ({exp.coveredAt})
                          </span>
                        </div>
                      ) : exp.status === 'pending_approval' ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-inset-sm text-amber-800">
                          بانتظار اعتماد الفاتورة
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-inset-sm text-[#A03E33]">
                          عجز معتمد بانتظار التغطية
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      {!exp.isCoveredFromCash && exp.status === 'approved' && canApproveExpense ? (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleCoverDeficit(exp.id)}
                          icon={<CheckCircle2 className="w-4.5 h-4.5 ml-1 stroke-[2.2]" />}
                          className="text-xs sm:text-sm font-bold min-h-[42px] px-4"
                        >
                          تغطية المبلغ من الصندوق
                        </Button>
                      ) : exp.isCoveredFromCash ? (
                        <span className="text-[#597565] text-xs font-medium">الحساب مسوّى</span>
                      ) : (
                        <span className="text-slate-500 text-xs">بانتظار اعتماد الفاتورة</span>
                      )}
                    </td>
                  </tr>
                ))}

                {deficitExpenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-xs text-[#638071]">
                      لا توجد فواتير عجز أو رصيد سالب معلقة. جميع الحسابات منتظمة!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Cash Receipts & Box Log */}
      {activeTab === 'receipts' && (
        <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-[#C8D3CC]/50">
            <div>
              <h3 className="text-base sm:text-lg font-black text-[#1A2E22] font-serif-display flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-[#2C593E]" />
                <span>سجل المقبوضات النقدية والصندوق (Cash Inflow & Orders)</span>
              </h3>
              <p className="text-xs text-[#526F5E] mt-0.5">
                توثيق أي مبالغ تم استلامها نقدياً، قيمة طلبيات، أو تحويلات مخصصة للشراء مع تحديد المصدر بدقة
              </p>
            </div>

            {canEditFund && <Button
              variant="primary"
              size="sm"
              onClick={() => setIsReceiptModalOpen(true)}
              icon={<Plus className="w-3.5 h-3.5 ml-1" />}
              className="text-xs font-bold"
            >
              تسجيل مقبوض جديد
            </Button>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-[#557161] font-bold border-b border-[#C8D3CC]/50">
                <tr>
                  <th className="p-3.5">الكود والتاريخ</th>
                  <th className="p-3.5">المبلغ المقبوض</th>
                  <th className="p-3.5">المصدر والجهة الموردة</th>
                  <th className="p-3.5">التصنيف والنوع</th>
                  <th className="p-3.5">المستلم الميداني</th>
                  <th className="p-3.5">ملاحظات وسند التوريد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C8D3CC]/30">
                {cashReceipts.map((rc) => {
                  const typeLabels: Record<string, string> = {
                    order_payment: 'دفعة قيمة طلبية / مبيعات',
                    cash_box: 'توريد سيولة نقدية للصندوق',
                    purchase_advance: 'مبلغ مخصص لمهمة شراء',
                    other: 'مقبوضات أخرى',
                  };

                  return (
                    <tr key={rc.id} className="hover:neu-inset transition">
                      <td className="p-3.5 font-mono">
                        <strong className="text-[#192E21] block">{rc.code}</strong>
                        <span className="text-[10px] text-[#638071]">{rc.date}</span>
                      </td>

                      <td className="p-3.5 font-mono">
                        <strong className="text-[#255237] font-black text-sm dir-ltr block">
                          +{formatCurrency(rc.amount, settings.currency)}
                        </strong>
                      </td>

                      <td className="p-3.5">
                        <strong className="text-[#1A2E22] block">{rc.source}</strong>
                      </td>

                      <td className="p-3.5">
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-inset-sm text-[#275338]">
                          {rc.type && typeLabels[rc.type] ? typeLabels[rc.type] : 'توريد سيولة للصندوق'}
                        </span>
                      </td>

                      <td className="p-3.5 text-[#243B2E] font-medium">
                        {rc.receivedBy}
                      </td>

                      <td className="p-3.5 text-[#556F60]">
                        {rc.notes || '—'}
                      </td>
                    </tr>
                  );
                })}

                {cashReceipts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-xs text-[#638071]">
                      لا توجد مقبوضات نقدية مسجلة بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Standing Accounts (حسابات الصرف الدائمة) */}
      {activeTab === 'standing' && (
        <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#C8D3CC]/50">
            <div>
              <h3 className="text-base sm:text-lg font-black text-[#1A2E22] font-serif-display flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#2E5577]" />
                <span>حسابات المصروفات الاعتيادية والموردين المعتادين (Standing Accounts)</span>
              </h3>
              <p className="text-xs text-[#526F5E] mt-0.5">
                حسابات دائمة ومحلات معتادة (بقالة، بوفيه، قطع غيار، وقود، مواصلات) مع ضبط الموقف المالي (لنا / علينا)
              </p>
            </div>

            {canEditFund && <Button
              variant="primary"
              size="sm"
              onClick={() => setIsStandingModalOpen(true)}
              icon={<Plus className="w-3.5 h-3.5 ml-1" />}
              className="text-xs font-bold"
            >
              إضافة حساب معتاد / مورد جديد
            </Button>}
          </div>

          {/* Search and Filters Bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث بالاسم، المورد، أو التصنيف..."
                value={standingSearch}
                onChange={(e) => setStandingSearch(e.target.value)}
                className="w-full neu-inset pr-10 pl-4 py-2 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-1.5 neu-inset-sm p-1 rounded-2xl text-xs font-bold">
              {[
                { id: 'all', label: `الكل (${standingAccounts.length})` },
                { id: 'payable', label: 'علينا (سداد للمورد)' },
                { id: 'receivable', label: 'لنا (تحصيل)' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStandingFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    standingFilter === f.id
                      ? 'neu-raised text-emerald-900 font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="text-[#557161] font-bold border-b border-[#C8D3CC]/50">
                <tr>
                  <th className="p-3.5">كود واسم الحساب / البقالة</th>
                  <th className="p-3.5">المورد المعتاد والتواصل</th>
                  <th className="p-3.5">التصنيف</th>
                  <th className="p-3.5">الموقف المالي (لنا / علينا)</th>
                  <th className="p-3.5">الرصيد المستحق</th>
                  <th className="p-3.5">الحد الشهري / المعتاد</th>
                  <th className="p-3.5">ملاحظات</th>
                  <th className="p-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C8D3CC]/30">
                {standingAccounts
                  .filter((acc) => {
                    if (standingFilter !== 'all') {
                      if (standingFilter === 'payable' && acc.direction !== 'payable' && (acc.direction as string) !== 'payable_by_us') return false;
                      if (standingFilter === 'receivable' && acc.direction !== 'receivable' && (acc.direction as string) !== 'receivable_for_us') return false;
                    }
                    if (!standingSearch.trim()) return true;
                    const q = standingSearch.toLowerCase().trim();
                    return (
                      acc.name.toLowerCase().includes(q) ||
                      (acc.vendorName && acc.vendorName.toLowerCase().includes(q)) ||
                      acc.category.toLowerCase().includes(q) ||
                      (acc.notes && acc.notes.toLowerCase().includes(q))
                    );
                  })
                  .map((acc) => (
                    <tr key={acc.id} className="hover:neu-inset transition">
                      <td className="p-3.5">
                        <span className="font-mono text-[#2B543B] neu-inset-sm px-2 py-0.5 rounded text-[11px] font-bold ml-1">
                          {acc.code || 'STD'}
                        </span>
                        <strong className="text-[#1A2E22]">{acc.name}</strong>
                        {acc.active === false && <span className="block text-[10px] text-rose-700 mt-1">حساب موقوف — السجل محفوظ</span>}
                      </td>

                      <td className="p-3.5 text-slate-700 font-medium">
                        {acc.vendorName ? (
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-900 block">{acc.vendorName}</span>
                            {acc.contactPhone && (
                              <span className="text-[11px] text-emerald-800 font-mono flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {acc.contactPhone}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-3.5 text-[#3D5B4A] font-medium">
                        {acc.category}
                      </td>

                      <td className="p-3.5">
                        {acc.direction === 'payable' || (acc.direction as string) === 'payable_by_us' ? (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-inset-sm text-[#915B1F]">
                            علينا (مستحق سداده للطرف الآخر)
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full neu-raised-sm text-[#275338]">
                            لنا (مستحق تحصيله لصالحنا)
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono font-black text-[#192E21]">
                        {formatCurrency(acc.currentBalance ?? acc.openingBalance ?? 0, acc.currency || settings.currency)}
                      </td>

                      <td className="p-3.5 font-mono text-[#192E21] font-bold">
                        {acc.monthlyLimit ? formatCurrency(acc.monthlyLimit, acc.currency || settings.currency) : acc.defaultAmount ? formatCurrency(acc.defaultAmount, acc.currency || settings.currency) : 'بدون سقف محدد'}
                      </td>

                      <td className="p-3.5 text-[#556F60]">
                        {acc.notes || '—'}
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => setSelectedStandingAccount(acc)} className="px-3 py-2 rounded-xl neu-raised text-emerald-800 font-bold whitespace-nowrap" title="فتح كشف الحساب">كشف الحساب</button>
                          {canEditFund && acc.active !== false && <button type="button" onClick={() => {
                            if (window.confirm(`سيتم إيقاف حساب ${acc.name} مع الاحتفاظ بجميع حركاته. هل تريد المتابعة؟`)) {
                              try { dataStore.deleteStandingAccount(acc.id); } catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر إيقاف الحساب.'); }
                            }
                          }} className="w-8 h-8 rounded-xl neu-raised text-rose-600 hover:text-rose-800 active:neu-inset inline-flex items-center justify-center transition cursor-pointer" title="إيقاف الحساب">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Quick Replenish Fund */}
      {replenishModalFund && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#182B20]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 border-none">
            <div className="flex items-center justify-between pb-3 border-b border-[#C8D3CC]/50">
              <div>
                <h3 className="font-black text-base text-[#192E21] font-serif-display">
                  تغذية العهدة النقدية: {replenishModalFund.name}
                </h3>
                <p className="text-xs text-[#526F5E] mt-0.5">
                  إضافة رصيد تعويضي لإعادة السيولة إلى مستواها المعتمد
                </p>
              </div>
              <button
                onClick={() => setReplenishModalFund(null)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#3D5B4A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReplenish} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">المبلغ المضاف ({dataStore.getSettings().currency}) *</label>
                <input
                  type="number"
                  value={replenishAmount}
                  onChange={(e) => setReplenishAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">بيان وسند التغذية</label>
                <input
                  type="text"
                  value={replenishNotes}
                  onChange={(e) => setReplenishNotes(e.target.value)}
                  placeholder="مثال: تحويل مصرفي سند رقم TRF-9901"
                  className="w-full px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#C8D3CC]/50">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setReplenishModalFund(null)}
                >
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  icon={<RefreshCw className="w-3.5 h-3.5 ml-1" />}
                >
                  تأكيد التغذية
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Cash Receipt */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#182B20]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 border-none">
            <div className="flex items-center justify-between pb-3 border-b border-[#C8D3CC]/50">
              <div>
                <h3 className="font-black text-base text-[#192E21] font-serif-display">
                  تسجيل مقبوضات نقدية بالصندوق
                </h3>
                <p className="text-xs text-[#526F5E] mt-0.5">
                  إثبات مبالغ مستلمة نقدياً أو طلبيات أو تحويلات واردة
                </p>
              </div>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#3D5B4A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCashReceipt} className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">المبلغ المقبوض ({dataStore.getSettings().currency}) *</label>
                <input
                  type="number"
                  value={receiptAmount}
                  onChange={(e) => setReceiptAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 text-sm font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">الصندوق أو العهدة المستلمة للمبلغ</label>
                <select value={receiptFundId} onChange={(e) => setReceiptFundId(e.target.value)} className="w-full px-3.5 py-2.5 text-sm">
                  <option value="">غير محدد</option>
                  {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name} — {fund.holderName}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">المصدر / الجهة المسلمة للمبلغ *</label>
                <input
                  type="text"
                  value={receiptSource}
                  onChange={(e) => setReceiptSource(e.target.value)}
                  placeholder="مثال: اسم العميل أو الجهة الموردة"
                  className="w-full px-3.5 py-2.5 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">تصنيف المقبوض</label>
                <select
                  value={receiptType}
                  onChange={(e) => setReceiptType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-sm"
                >
                  <option value="cash_box">توريد سيولة نقدية عامة للصندوق</option>
                  <option value="order_payment">دفعة نقدية لقيمة طلبية / مبيعات</option>
                  <option value="purchase_advance">مبلغ مخصص لمهمة شراء ميداني</option>
                  <option value="other">مقبوضات أخرى</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#233B2D]">ملاحظات وسند الاستلام</label>
                <input
                  type="text"
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="رقم سند القبض أو تفاصيل إضافية"
                  className="w-full px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#C8D3CC]/50">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                >
                  إلغاء
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  icon={<Plus className="w-3.5 h-3.5 ml-1" />}
                >
                  حفظ في الصندوق
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Standing Account / Routine Vendor */}
      <NewStandingAccountModal
        isOpen={isStandingModalOpen}
        onClose={() => setIsStandingModalOpen(false)}
      />
      <StandingAccountDetailsModal account={selectedStandingAccount} onClose={() => setSelectedStandingAccount(null)} />
    </div>
  );
};
