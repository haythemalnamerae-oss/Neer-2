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
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { NewStandingAccountModal } from '../modals/NewStandingAccountModal';

export const SettingsView: React.FC = () => {
  const [companyName, setCompanyName] = useState('شركة الرؤية للخدمات والعمليات الميدانية ش.ذ.م.م');
  const [taxNumber, setTaxNumber] = useState('100234567800003');
  const [defaultCurrency, setDefaultCurrency] = useState('AED');
  const [vatRate, setVatRate] = useState('5');
  const [warningThreshold, setWarningThreshold] = useState('25');
  const [autoNotify, setAutoNotify] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountsVersion, setAccountsVersion] = useState(0);
  const accounts = dataStore.getStandingAccounts();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetData = () => {
    if (window.confirm('هل أنت متأكد من إعادة تعيين كافة البيانات إلى الحالة الافتراضية الأولية؟')) {
      dataStore.resetToDefault();
      window.location.reload();
    }
  };

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
              label="الرقم الضريبي (TRN - الهيئة الاتحادية للضرائب) *"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              required
            />
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
              </select>
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
              label="حد الإنذار المبكر للعهد (% المتبقي)"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(e.target.value)}
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
            <label className="flex items-center gap-3.5 p-3.5 rounded-2xl neu-inset-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoNotify}
                onChange={(e) => setAutoNotify(e.target.checked)}
                className="w-5 h-5 rounded-md accent-[#345c47] cursor-pointer"
              />
              <span className="text-xs sm:text-sm font-bold text-slate-700">
                إرسال إشعارات فورية عند انخفاض رصيد أي عهدة نقدية تحت حد الإنذار المحدد
              </span>
            </label>

            <div className="pt-4 border-t border-black/[0.04] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
            </div>
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
