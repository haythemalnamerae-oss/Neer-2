import React, { useState, useEffect } from 'react';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { ExpenseCategory, StandingAccount } from '../../types/domain';
import { formatCurrency, EXPENSE_CATEGORY_CONFIG } from '../../lib/utils/format';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { SmartSelect } from '../ui/SmartSelect';
import { NewStandingAccountModal } from './NewStandingAccountModal';
import { AlertTriangle, Tag, Plus } from 'lucide-react';

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTaskId?: string;
  preselectedTaskId?: string;
  initialFundId?: string;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({ 
  isOpen, 
  onClose,
  initialTaskId,
  preselectedTaskId,
  initialFundId
}) => {
  const currentUser = dataStore.getCurrentUser();
  const effectiveTaskId = initialTaskId || preselectedTaskId;
  const allFunds = dataStore.getFunds();
  const funds = currentUser.role === 'field_officer' ? allFunds.filter((fund) => fund.holderId === currentUser.id) : allFunds;
  const allTasks = dataStore.getTasks();
  const tasks = currentUser.role === 'field_officer' ? allTasks.filter((task) => task.assigneeId === currentUser.id) : allTasks;
  const canCreateExpense = hasPermission(currentUser.role, 'expenses', 'create');
  const canApproveExpense = hasPermission(currentUser.role, 'expenses', 'approve');
  const settings = dataStore.getSettings();
  const standingAccounts = dataStore.getStandingAccounts();
  void standingAccountsVersion;
  const expenses = dataStore.getExpenses();

  const [isAddStandingModalOpen, setIsAddStandingModalOpen] = useState(false);
  const [standingAccountsVersion, setStandingAccountsVersion] = useState(0);

  // Extract past vendors + routine vendors for smart search & autocomplete
  const pastVendors = Array.from(
    new Set([
      ...expenses.map((e) => e.vendorName),
      ...standingAccounts.map((a) => a.vendorName || a.name),
      'بقالة الحي ومستلزمات الموقع',
      'سوبرماركت المدينة',
      'شركة البرق للكهربائيات',
      'محطة وقود',
      'كافتيريا واستراحة الموقع',
      'مؤسسة التوريدات المعتمدة',
    ].filter((v): v is string => Boolean(v && v.trim())))
  );

  // Find best matching fund:
  const getInitialFundId = () => {
    if (initialFundId && funds.some((fund) => fund.id === initialFundId)) return initialFundId;
    if (effectiveTaskId) {
      const task = tasks.find((t) => t.id === effectiveTaskId);
      if (task?.fundId && funds.some((fund) => fund.id === task.fundId)) return task.fundId;
    }
    const userFund = funds.find((f) => f.holderId === currentUser.id);
    if (userFund) return userFund.id;
    return funds[0]?.id || '';
  };

  const [fundId, setFundId] = useState(getInitialFundId());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('materials');
  const [description, setDescription] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [taskId, setTaskId] = useState(effectiveTaskId || '');
  const [hasReceipt, setHasReceipt] = useState(false);

  // Blueprint: Standing Account & Cascade/Deficit States
  const [selectedStandingAccId, setSelectedStandingAccId] = useState('');
  const [coverageMethod, setCoverageMethod] = useState<'normal' | 'cascade' | 'deficit'>('normal');
  const [secondaryFundId, setSecondaryFundId] = useState('');
  const selectedStandingAccount = standingAccounts.find((account) => account.id === selectedStandingAccId);
  const isSupplierCredit = Boolean(selectedStandingAccount && (selectedStandingAccount.direction === 'payable' || selectedStandingAccount.direction === 'payable_by_us'));

  // Sync when initial values change
  useEffect(() => {
    if (effectiveTaskId) {
      setTaskId(effectiveTaskId);
      const task = tasks.find((t) => t.id === effectiveTaskId);
      if (task?.fundId && funds.some((fund) => fund.id === task.fundId) && !initialFundId) {
        setFundId(task.fundId);
      }
    }
    if (initialFundId && funds.some((fund) => fund.id === initialFundId)) {
      setFundId(initialFundId);
    } else if (!effectiveTaskId) {
      const userFund = funds.find((f) => f.holderId === currentUser.id);
      if (userFund) setFundId(userFund.id);
    }
  }, [effectiveTaskId, initialFundId, isOpen, currentUser.id]);

  useEffect(() => {
    if (!taskId) return;
    const linkedAccountId = dataStore.getTasks().find((task) => task.id === taskId)?.standingAccountId;
    const linkedAccount = dataStore.getStandingAccounts().find((account) => account.id === linkedAccountId && account.active !== false && (account.direction === 'payable' || account.direction === 'payable_by_us'));
    if (linkedAccount) setSelectedStandingAccId(linkedAccount.id);
  }, [taskId]);

  const numAmount = parseFloat(amount) || 0;
  const taxAmount = Number((numAmount * (settings.taxRate / 100)).toFixed(2));
  const totalWithTax = Number((numAmount + taxAmount).toFixed(2));

  const selectedFund = funds.find((f) => f.id === fundId);
  const exceedsLimit = totalWithTax > settings.singleExpenseLimit;
  const currentExpenseMonth = new Date().toISOString().slice(0, 7);
  const selectedAccountMonthTotal = selectedStandingAccount ? (
    expenses.filter((expense) => expense.standingAccountId === selectedStandingAccount.id && expense.status !== 'rejected' && (expense.expenseDate || expense.submittedAt?.slice(0, 10) || '').startsWith(currentExpenseMonth))
      .reduce((sum, expense) => sum + expense.totalWithTax, 0) +
    (selectedStandingAccount.entries || []).filter((entry) => entry.type === 'charge' && !entry.expenseId && entry.date.startsWith(currentExpenseMonth))
      .reduce((sum, entry) => sum + entry.amount, 0)
  ) : 0;
  const exceedsStandingMonthlyLimit = Boolean(selectedStandingAccount?.monthlyLimit && selectedAccountMonthTotal + totalWithTax > selectedStandingAccount.monthlyLimit);
  const availableBal = selectedFund ? selectedFund.currentBalance : 0;
  const exceedsBalance = !isSupplierCredit && totalWithTax > availableBal;
  const shortageAmount = Number((totalWithTax - availableBal).toFixed(2));

  // Available secondary funds for cascade deduction
  const otherFunds = funds.filter((f) => f.id !== fundId);
  const selectedSecondaryFund = otherFunds.find((fund) => fund.id === secondaryFundId);
  const secondaryCanCover = Boolean(selectedSecondaryFund && selectedSecondaryFund.currentBalance >= shortageAmount);

  const mapAccountCategory = (value: string): ExpenseCategory => {
    const supported: ExpenseCategory[] = ['transport', 'materials', 'hospitality', 'maintenance', 'government', 'fuel', 'tools', 'other'];
    if (supported.includes(value as ExpenseCategory)) return value as ExpenseCategory;
    return value === 'vendor' ? 'materials' : 'other';
  };

  // Handle Standing Account Quick Selection
  const handleSelectStandingAccount = (accId: string) => {
    setSelectedStandingAccId(accId);
    const acc = standingAccounts.find((a) => a.id === accId);
    if (acc) {
      setDescription(acc.name);
      setCategory(mapAccountCategory(acc.category));
      if (acc.defaultAmount && !amount) {
        setAmount(String(acc.defaultAmount));
      }
      setVendorName(acc.vendorName || acc.name);
    }
  };

  const handleStandingAccountCreated = (newAcc: StandingAccount) => {
    setStandingAccountsVersion((version) => version + 1);
    setSelectedStandingAccId(newAcc.id);
    setDescription(newAcc.name);
    setCategory(mapAccountCategory(newAcc.category));
    if (newAcc.defaultAmount && !amount) {
      setAmount(String(newAcc.defaultAmount));
    }
    setVendorName(newAcc.vendorName || newAcc.name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateExpense) { alert('لا تملك صلاحية تسجيل المصروفات.'); return; }
    if (!fundId || numAmount <= 0 || !description.trim() || !vendorName.trim() || (settings.requireInvoiceNumber && !invoiceNumber.trim())) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const selectedAccount = standingAccounts.find((account) => account.id === selectedStandingAccId);
    const supplierCredit = Boolean(selectedAccount && (selectedAccount.direction === 'payable' || selectedAccount.direction === 'payable_by_us'));

    if (exceedsBalance && coverageMethod === 'normal' && !supplierCredit) {
      alert('المبلغ المطلوب يتجاوز الرصيد الحالي المتوفر في هذه العهدة! يرجى اختيار إما "السحب المتسلسل من عهدتين" أو "تسجيل عجز سالب مؤقت".');
      return;
    }

    if (!supplierCredit && coverageMethod === 'cascade' && (!secondaryFundId || !secondaryCanCover)) {
      alert('حدد عهدة بديلة برصيد كافٍ لتغطية الفرق.');
      return;
    }

    const task = tasks.find((t) => t.id === taskId);
    const standingAcc = standingAccounts.find((a) => a.id === selectedStandingAccId);

    try {
      dataStore.addExpense({
        fundId,
        fundName: selectedFund?.name || 'العهدة النقدية',
        amount: numAmount,
        category,
        description,
        invoiceNumber,
        vendorName,
        hasReceipt,
        receiptUrl: undefined,
        expenseDate: new Date().toISOString().split('T')[0],
        taskId: taskId || undefined,
        taskTitle: task?.title,
        cascadeDeduction: !supplierCredit && coverageMethod === 'cascade',
        secondaryFundId: !supplierCredit && coverageMethod === 'cascade' ? secondaryFundId : undefined,
        allowDeficit: !supplierCredit && coverageMethod === 'deficit' && canApproveExpense,
        standingAccountId: standingAcc?.id,
        standingAccountName: standingAcc?.name,
        standingDirection: standingAcc?.direction,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر تسجيل المصروف. تحقق من البيانات والرصيد.');
      return;
    }

    onClose();
    // Reset
    setAmount('');
    setDescription('');
    setInvoiceNumber('');
    setVendorName('');
    setSelectedStandingAccId('');
    setCoverageMethod('normal');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تسجيل مصروف وفاتورة جديدة"
      description={`توثيق المصروف من العهدة واحتساب الضريبة حسب إعداد المنشأة (${settings.taxRate}%)`}
      maxWidth="xl"
    >
      {!canCreateExpense ? <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">لا تملك صلاحية تسجيل المصروفات.</div> : <form onSubmit={handleSubmit} className="space-y-4.5 text-xs sm:text-sm">
        {/* Quick Standing Accounts Selector */}
        <div className="space-y-2.5 p-4 neu-inset-sm rounded-2xl">
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-emerald-700" />
              <span>حسابات الموردين والمتاجر المعتادة (بقالة، بوفيه، وقود):</span>
            </span>
            <div className="flex items-center gap-2">
              {hasPermission(currentUser.role, 'funds', 'edit') && <button
                type="button"
                onClick={() => setIsAddStandingModalOpen(true)}
                className="neu-raised text-[11px] font-extrabold text-emerald-800 px-2.5 py-1 rounded-xl hover:text-emerald-950 flex items-center gap-1 cursor-pointer active:neu-inset transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة حساب معتاد جديد</span>
              </button>}
              {selectedStandingAccId && (
                <button
                  type="button"
                  onClick={() => setSelectedStandingAccId('')}
                  className="text-xs text-rose-700 font-bold hover:underline cursor-pointer px-1"
                >
                  إلغاء التحديد
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {standingAccounts.filter((acc) => acc.active !== false && (acc.direction === 'payable' || acc.direction === 'payable_by_us') && (acc.currency || settings.currency) === settings.currency).map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => handleSelectStandingAccount(acc.id)}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  (selectedStandingAccId === acc.id || (!selectedStandingAccId && selectedStandingAccount?.id === acc.id))
                    ? 'neu-inset text-emerald-800 bg-[#EAF0EC] font-black'
                    : 'neu-raised text-slate-700 hover:text-slate-900'
                }`}
              >
                <span>{acc.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-extrabold bg-amber-50 text-amber-800">آجل</span>
                <span className="text-[10px] font-mono text-slate-500">{formatCurrency(acc.currentBalance || 0, acc.currency || settings.currency)}</span>
              </button>
            ))}
          </div>
          {isSupplierCredit && <p className="text-[11px] text-emerald-800 font-semibold">سيُسجل هذا الشراء كالتزام على حساب المورد بعد الاعتماد، ولن يُخصم من رصيد العهدة إلا عند تسجيل السداد من كشف الحساب.</p>}
        </div>

        {/* Fund Selection via SmartSelect */}
        <SmartSelect
          label={isSupplierCredit ? 'العهدة المرجعية التي ستتم التسوية منها لاحقاً *' : 'العهدة النقدية المصروف منها *'}
          placeholder="اختر العهدة النقدية..."
          options={funds.map((f) => ({
            value: f.id,
            label: f.name,
            sublabel: `المسؤول: ${f.holderName}`,
            badge: `متاح: ${formatCurrency(f.currentBalance, f.currency)}`,
          }))}
          value={fundId}
          onChange={(val) => setFundId(val)}
          creatable={false}
          required
        />

        {/* Amount & Tax Live Calculation */}
        <div className="p-4 sm:p-5 neu-raised rounded-3xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              type="number"
              step="0.01"
              label={`المبلغ الأساسي قبل الضريبة (${settings.currency}) *`}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <SmartSelect
              label="تصنيف المصروف *"
              placeholder="اختر أو ابحث عن التصنيف..."
              options={Object.entries(EXPENSE_CATEGORY_CONFIG).map(([catKey, catVal]) => ({
                value: catKey,
                label: catVal.label,
                icon: '🏷️',
              }))}
              value={category}
              onChange={(val) => setCategory(val as ExpenseCategory)}
              creatable={false}
              required
            />
          </div>

          {/* Live Calculation Display */}
          <div className="flex items-center justify-between pt-3 border-t border-black/[0.04] text-xs sm:text-sm">
            <span className="text-slate-600 font-bold">
              ضريبة القيمة المضافة ({settings.taxRate}%): <span className="font-extrabold text-slate-800 dir-ltr">{formatCurrency(taxAmount, settings.currency)}</span>
            </span>
            <span className="text-sm sm:text-base font-black text-emerald-800">
              المجموع الإجمالي: <span className="dir-ltr font-mono">{formatCurrency(totalWithTax, settings.currency)}</span>
            </span>
          </div>

          {exceedsLimit && (
            <div className="flex items-center gap-2 text-xs text-amber-800 neu-inset-sm p-3 rounded-2xl">
              <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-amber-700" />
              <span>المصروف يتجاوز سقف الصرف الفردي المسموح به ({formatCurrency(settings.singleExpenseLimit, settings.currency)}). سيتطلب تدقيقاً خاصاً.</span>
            </div>
          )}
          {exceedsStandingMonthlyLimit && selectedStandingAccount?.monthlyLimit && (
            <div className="flex items-center gap-2 text-xs text-amber-800 neu-inset-sm p-3 rounded-2xl">
              <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-amber-700" />
              <span>هذا الشراء سيتجاوز الحد الشهري لحساب {selectedStandingAccount.name} ({formatCurrency(selectedStandingAccount.monthlyLimit, settings.currency)}). سيتطلب ملاحظة تدقيق عند الاعتماد.</span>
            </div>
          )}

          {/* Blueprint: Cascade Deduction & Deficit Options when balance is insufficient */}
          {exceedsBalance && !isSupplierCredit && (
            <div className="p-4 neu-inset-sm rounded-2xl space-y-3.5 text-xs sm:text-sm">
              <div className="flex items-start gap-2.5 text-rose-900">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <p className="font-extrabold">المبلغ المطلوب ({formatCurrency(totalWithTax, settings.currency)}) يتجاوز رصيد العهدة ({formatCurrency(availableBal, settings.currency)})!</p>
                  <p className="text-xs text-rose-700 mt-0.5">العجز المطلوب تغطيته: <strong>{formatCurrency(shortageAmount, settings.currency)}</strong></p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                <p className="font-extrabold text-slate-800">اختر آلية المعالجة المالية المعتمدة:</p>
                
                {/* Cascade Option */}
                <label className={`flex items-start gap-3 p-3.5 rounded-2xl transition-all cursor-pointer ${coverageMethod === 'cascade' ? 'neu-inset' : 'neu-raised hover:bg-black/[0.01]'}`}>
                  <input
                    type="radio"
                    name="coverageMethod"
                    value="cascade"
                    checked={coverageMethod === 'cascade'}
                    onChange={() => setCoverageMethod('cascade')}
                    className="mt-1 accent-[#345c47] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-extrabold text-slate-900 block">السحب المتسلسل من عهدتين (Cascade Deduction)</span>
                    <span className="text-xs text-slate-600 block mt-1 leading-relaxed">
                      استنزاف العهدة الحالية بالكامل ({formatCurrency(availableBal, settings.currency)}) ليصبح رصيدها صفراً، وسحب المتبقي ({formatCurrency(shortageAmount, settings.currency)}) تلقائياً من عهدة بديلة.
                    </span>
                    {coverageMethod === 'cascade' && (
                      <div className="mt-3 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">العهدة البديلة لتغطية الفارق:</label>
                        <select
                          value={secondaryFundId}
                          onChange={(e) => setSecondaryFundId(e.target.value)}
                          className="w-full neu-inset px-3.5 py-2 min-h-[42px] rounded-xl text-xs text-slate-900 font-semibold focus:outline-hidden"
                          required
                        >
                          <option value="">-- اختر العهدة الثانية --</option>
                          {otherFunds.map((of) => (
                            <option key={of.id} value={of.id}>
                              {of.name} (المتاح: {formatCurrency(of.currentBalance, of.currency)} - {of.holderName})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </label>

                {/* Deficit Option */}
                {canApproveExpense && <label className={`flex items-start gap-3 p-3.5 rounded-2xl transition-all cursor-pointer ${coverageMethod === 'deficit' ? 'neu-inset' : 'neu-raised hover:bg-black/[0.01]'}`}>
                  <input
                    type="radio"
                    name="coverageMethod"
                    value="deficit"
                    checked={coverageMethod === 'deficit'}
                    onChange={() => setCoverageMethod('deficit')}
                    className="mt-1 accent-[#345c47] cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-extrabold text-slate-900 block">تسجيل عجز مالي مؤقت بالسالب (Negative Balance / Deficit)</span>
                    <span className="text-xs text-slate-600 block mt-1 leading-relaxed">
                      السماح بالصرف للمهمة الميدانية وتسجيل عجز بقيمة ({formatCurrency(shortageAmount, settings.currency)}) كالتزام يظهر بالسالب لتتم تغطيته فور توريد نقد للصندوق.
                    </span>
                  </div>
                </label>}
              </div>
            </div>
          )}
        </div>

        {/* Invoice & Vendor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SmartSelect
            label="اسم المورد / المحل التجاري *"
            placeholder="ابحث أو اكتب اسم المورد / البقالة..."
            options={pastVendors}
            value={vendorName}
            onChange={(val) => setVendorName(val)}
            creatable={true}
            required
            helperText="يمكنك الاختيار من الموردين المعتادين أو كتابة مورد جديد مباشرة"
          />
          <Input
            label={settings.requireInvoiceNumber ? 'رقم الفاتورة الضريبية *' : 'رقم الفاتورة (اختياري)'}
            placeholder="مثال: INV-2026-884"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            required={settings.requireInvoiceNumber}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">بيان المصروف والأصناف المشتراة *</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="تفاصيل ما تم شراؤه وسبب الصرف الميداني..."
            className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
            required
          />
        </div>

        {/* Linked Task & Receipt */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <SmartSelect
            label="ربط بمهمة ميدانية (اختياري)"
            placeholder="ابحث برقم المهمة أو العنوان..."
            options={[
              { value: '', label: 'بدون ربط بمهمة' },
              ...tasks.map((t) => ({
                value: t.id,
                label: `${t.code || ''} - ${t.title}`,
                sublabel: `${t.location} | المكلف: ${t.assigneeName}`,
              })),
            ]}
            value={taskId}
            onChange={(val) => setTaskId(val)}
            creatable={false}
          />

          <label className="flex items-center gap-3 p-3 neu-inset-sm rounded-2xl cursor-pointer mt-6">
            <input
              type="checkbox"
              checked={hasReceipt}
              required={settings.requireReceiptForExpense}
              onChange={(e) => setHasReceipt(e.target.checked)}
              className="w-5 h-5 accent-[#345c47] rounded cursor-pointer"
            />
            <span className="text-xs sm:text-sm font-bold text-slate-700">أصل الفاتورة الورقي متوفر وتمت مراجعته (لا يعني رفع صورة إلكترونية)</span>
          </label>
        </div>

        <div className="pt-4 border-t border-black/[0.04] flex items-center justify-end gap-3">
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            إلغاء
          </Button>
          <Button 
            variant="primary" 
            size="md" 
            type="submit" 
            disabled={Boolean(exceedsBalance && coverageMethod === 'normal')}
          >
            {coverageMethod === 'cascade' ? 'اعتماد الصرف المتسلسل' : coverageMethod === 'deficit' ? 'تسجيل مع إقرار العجز' : 'تسجيل المصروف'}
          </Button>
        </div>
      </form>}

      {/* Routine / Standing Account Quick Add Modal */}
      {hasPermission(currentUser.role, 'funds', 'edit') && <NewStandingAccountModal
        isOpen={isAddStandingModalOpen}
        onClose={() => setIsAddStandingModalOpen(false)}
        onSuccess={handleStandingAccountCreated}
      />}
    </Modal>
  );
};
