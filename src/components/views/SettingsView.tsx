import React, { useState } from 'react';
import {
  Settings,
  Building,
  DollarSign,
  Bell,
  Database,
  RotateCcw,
  CheckCircle2,
  Plus,
  Store,
  FileImage,
  Trash2,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NewStandingAccountModal } from '../modals/NewStandingAccountModal';

export const SettingsView: React.FC = () => {
  const initialSettings = dataStore.getSettings();
  const currentUser = dataStore.getCurrentUser();
  const canEditSettings = hasPermission(currentUser.role, 'settings', 'edit');
  const canResetData = currentUser.role === 'admin';
  const canManageLocationPolicy = currentUser.role === 'admin';
  const [companyName, setCompanyName] = useState(initialSettings.organizationName);
  const [taxNumber, setTaxNumber] = useState(initialSettings.taxRegistrationNumber);
  const [headquarters, setHeadquarters] = useState(initialSettings.headquarters);
  const [defaultCurrency, setDefaultCurrency] = useState(initialSettings.currency);
  const [vatRate, setVatRate] = useState(String(initialSettings.taxRate));
  const [warningThreshold, setWarningThreshold] = useState(String(initialSettings.fundWarningThresholdPercent));
  const [singleExpenseLimit, setSingleExpenseLimit] = useState(String(initialSettings.singleExpenseLimit));
  const [autoNotify, setAutoNotify] = useState(initialSettings.autoNotifyOnLowBalance);
  const [requireReceipt, setRequireReceipt] = useState(initialSettings.requireReceiptForExpense);
  const [requireInvoiceNumber, setRequireInvoiceNumber] = useState(initialSettings.requireInvoiceNumber);
  const [requireDualApproval, setRequireDualApproval] = useState(initialSettings.requireDualApprovalForSettlements);
  const [autoCaptureLocation, setAutoCaptureLocation] = useState(initialSettings.autoCaptureLocationWithoutApproval);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountsVersion, setAccountsVersion] = useState(0);
  const accounts = dataStore.getStandingAccounts();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const tax = Number(vatRate);
    const threshold = Number(warningThreshold);
    const expenseLimit = Number(singleExpenseLimit);
    if (!companyName.trim() || !taxNumber.trim() || !Number.isFinite(tax) || tax < 0 || tax > 100 || !Number.isFinite(threshold) || threshold < 0 || threshold > 100 || !Number.isFinite(expenseLimit) || expenseLimit < 0) {
      alert('تحقق من اسم المنشأة والرقم الضريبي ونسب الضريبة والإنذار وحد الصرف.');
      return;
    }
    try {
      dataStore.updateSettings({
        organizationName: companyName.trim(), taxRegistrationNumber: taxNumber.trim(), headquarters: headquarters.trim(),
        currency: defaultCurrency, taxRate: tax, fundWarningThresholdPercent: threshold, singleExpenseLimit: expenseLimit,
        autoNotifyOnLowBalance: autoNotify, requireReceiptForExpense: requireReceipt, requireInvoiceNumber,
        requireDualApprovalForSettlements: requireDualApproval,
        ...(canManageLocationPolicy ? { autoCaptureLocationWithoutApproval: autoCaptureLocation } : {}),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر حفظ الإعدادات.');
      return;
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetData = () => {
    if (!canResetData) return;
    const confirmation = window.prompt('تحذير: سيؤدي هذا الإجراء إلى حذف جميع بيانات Neer-2 المحلية وإعادة البيانات التجريبية. اكتب RESET للمتابعة:');
    if (confirmation === 'RESET') {
      try { dataStore.resetToDefault(); window.location.reload(); }
      catch (error) { alert(error instanceof Error ? error.message : 'تعذر إعادة تهيئة البيانات.'); }
    }
  };

  if (!canEditSettings) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">لا تملك صلاحية تعديل إعدادات النظام.</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Banner */}
      <div className="neu-raised-lg p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs uppercase mb-1">
            <Settings className="w-5 h-5 text-emerald-700" />
            <span className="tracking-wide">إعدادات النظام والسياسات المالية</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 font-serif">السياسات المالية والتشغيلية</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            ضبط معدلات ضريبة القيمة المضافة، حدود إنذار العهد النقدية، وإعدادات المنشأة
          </p>
        </div>

        {savedSuccess && (
          <span className="text-xs font-bold text-emerald-800 neu-raised px-4 py-2 rounded-2xl flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" />
            تم حفظ الإعدادات بنجاح
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Company Settings */}
        <div className="neu-raised-lg p-5 sm:p-6 rounded-3xl space-y-4">
          <div className="pb-3 border-b border-black/[0.04] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl neu-raised text-emerald-700 flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800">بيانات المنشأة والترخيص التجاري</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="اسم المنشأة / الشركة *"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
            <Input
              label="الرقم الضريبي / رقم التسجيل الضريبي *"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              required
            />
            <Input label="المقر / العنوان الرئيسي" value={headquarters} onChange={(e) => setHeadquarters(e.target.value)} />
          </div>
        </div>

        {/* Standing accounts */}
        <section key={accountsVersion} className="neu-raised-lg p-5 sm:p-6 rounded-3xl space-y-4" aria-labelledby="standing-accounts-title">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/[0.04]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl neu-raised text-emerald-700 flex items-center justify-center"><Store className="w-5 h-5" /></div>
              <div><h3 id="standing-accounts-title" className="text-sm sm:text-base font-extrabold text-slate-800">المنشآت والحسابات الثابتة</h3><p className="text-xs text-slate-500 mt-0.5">تظهر تلقائياً عند إنشاء المصروف أو المهمة</p></div>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={() => setIsAccountModalOpen(true)} icon={<Plus className="w-4 h-4" />}>إضافة منشأة</Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accounts.map((account) => (
              <div key={account.id} className="neu-inset-sm rounded-2xl p-3 flex items-center gap-3 min-w-0">
                {account.imageUrl ? <img src={account.imageUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" /> : <div className="w-11 h-11 rounded-xl neu-raised flex items-center justify-center shrink-0"><Store className="w-5 h-5 text-emerald-700" /></div>}
                <div className="min-w-0 flex-1"><p className="font-extrabold text-xs text-slate-800 truncate">{account.name}</p><p className="text-[11px] text-slate-500 truncate">{account.vendorName || account.category}</p>{account.referenceImageUrl && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-1"><FileImage className="w-3 h-3" /> مستند مرجعي محفوظ</span>}</div>
                <button type="button" aria-label={`حذف ${account.name}`} onClick={() => dataStore.deleteStandingAccount(account.id)} className="p-2 text-rose-600 rounded-xl neu-button"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>

        {/* Financial Settings */}
        <div className="neu-raised-lg p-5 sm:p-6 rounded-3xl space-y-4">
          <div className="pb-3 border-b border-black/[0.04] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl neu-raised text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800">السياسات المالية والضريبية</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">العملة الأساسية للنظام</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
              >
                <option value="AED">درهم إماراتي (AED)</option>
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="YER">ريال يمني (YER)</option>
              </select>
              <p className="text-[11px] leading-relaxed text-slate-500">لا يتم تحويل أرصدة العهد تلقائياً. إذا كانت هناك عهد بعملة أخرى، يجب تسويتها وتحويلها بخطة معتمدة قبل تغيير عملة النظام.</p>
            </div>

            <Input
              type="number"
              label="نسبة ضريبة القيمة المضافة (VAT %)"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              required
            />

            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              label="حد الإنذار المبكر للعهد (% المتبقي)"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(e.target.value)}
              required
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              label={`حد الصرف الفردي (${defaultCurrency})`}
              value={singleExpenseLimit}
              onChange={(e) => setSingleExpenseLimit(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Notifications & System Maintenance */}
        <div className="neu-raised-lg p-5 sm:p-6 rounded-3xl space-y-4">
          <div className="pb-3 border-b border-black/[0.04] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl neu-raised text-emerald-700 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800">التنبيهات التلقائية وصيانة النظام</h3>
          </div>
          <div className="space-y-4">
            <label className="flex items-start gap-3.5 p-3.5 rounded-2xl neu-inset-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoNotify}
                onChange={(e) => setAutoNotify(e.target.checked)}
                className="w-5 h-5 rounded-md accent-[#345c47] cursor-pointer mt-0.5 shrink-0"
              />
              <span className="text-xs sm:text-sm font-bold text-slate-700">
                إرسال إشعارات فورية عند انخفاض رصيد أي عهدة نقدية تحت حد الإنذار المحدد
              </span>
            </label>

            {canManageLocationPolicy && (            <label className="flex items-start gap-3.5 p-3.5 rounded-2xl neu-inset-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoCaptureLocation}
                onChange={(e) => setAutoCaptureLocation(e.target.checked)}
                className="w-5 h-5 rounded-md accent-[#345c47] cursor-pointer mt-0.5 shrink-0"
              />
              <span className="text-xs sm:text-sm font-bold text-slate-700">
                حفظ موقع تنفيذ الخطوة تلقائياً عند بدء المهمة دون طلب موافقة الموظف
                <span className="block text-[11px] font-normal text-slate-500 mt-1">
                  يتحكم بهذا الخيار مالك النظام أو المدير المخول فقط، ويُسجل التغيير في سجل التدقيق.
                </span>
              </span>
            </label>)}
            <label className="flex items-start gap-3.5 p-3.5 rounded-2xl neu-inset-sm cursor-pointer">
              <input type="checkbox" checked={requireReceipt} onChange={(e) => setRequireReceipt(e.target.checked)} className="w-5 h-5 rounded-md accent-[#345c47] mt-0.5 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-700">اشتراط توفر أصل الفاتورة الورقي قبل تسجيل المصروف</span>
            </label>
            <label className="flex items-start gap-3.5 p-3.5 rounded-2xl neu-inset-sm cursor-pointer">
              <input type="checkbox" checked={requireInvoiceNumber} onChange={(e) => setRequireInvoiceNumber(e.target.checked)} className="w-5 h-5 rounded-md accent-[#345c47] mt-0.5 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-700">اشتراط إدخال رقم الفاتورة لكل مصروف</span>
            </label>
            <label className="flex items-start gap-3.5 p-3.5 rounded-2xl neu-inset-sm cursor-pointer">
              <input type="checkbox" checked={requireDualApproval} onChange={(e) => setRequireDualApproval(e.target.checked)} className="w-5 h-5 rounded-md accent-[#345c47] mt-0.5 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-700">اشتراط مدقق أول ومعتمد نهائي مختلفين لإغلاق التسوية</span>
            </label>

            {canResetData && <div className="pt-4 border-t border-black/[0.04] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs sm:text-sm font-extrabold text-rose-700 block">إعادة تهيئة البيانات الافتراضية</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  استعادة المهام والعهد والفواتير النموذجية الأولية للاختبار والتجربة
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetData}
                className="neu-raised px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-rose-700 hover:text-rose-800 active:neu-inset transition-all flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-rose-600" />
                <span>إعادة تعيين البيانات</span>
              </button>
            </div>}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" size="lg" type="submit" className="text-sm font-extrabold px-8">
            حفظ التغييرات
          </Button>
        </div>
      </form>
      <NewStandingAccountModal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} onSuccess={() => { setIsAccountModalOpen(false); setAccountsVersion((version) => version + 1); }} />
    </div>
  );
};
