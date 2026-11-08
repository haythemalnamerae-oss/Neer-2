import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { dataStore } from '../../lib/storage';
import { StandingAccount } from '../../types/domain';
import { SmartSelect } from '../ui/SmartSelect';

interface NewStandingAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (account: StandingAccount) => void;
}

export const NewStandingAccountModal: React.FC<NewStandingAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [category, setCategory] = useState('materials');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [direction, setDirection] = useState<'payable' | 'receivable'>('payable');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const settings = dataStore.getSettings();
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');

  const readImage = (file: File, setter: (value: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => setter(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  const categoryOptions = [
    { value: 'materials', label: 'بقالة ومستلزمات استهلاكية', icon: '🛒' },
    { value: 'vendor', label: 'مورد معتمد وقطع غيار', icon: '🏭' },
    { value: 'hospitality', label: 'بوفيه وضيافة واجتماعات', icon: '☕' },
    { value: 'transport', label: 'مواصلات ونقل وباصات', icon: '🚌' },
    { value: 'fuel', label: 'محطة وقود وبنزين مركبات', icon: '⛽' },
    { value: 'maintenance', label: 'صيانة دورية ومعدات', icon: '🔧' },
    { value: 'other', label: 'مصروفات أخرى معتادة', icon: '📑' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('يرجى كتابة اسم الحساب أو المورد المعتاد');
      return;
    }

    let created: StandingAccount;
    try {
      created = dataStore.addStandingAccount({
      name: name.trim(),
      vendorName: vendorName.trim() || undefined,
      category,
      contactPhone: contactPhone.trim() || undefined,
      address: address.trim() || undefined,
      direction,
      openingBalance: openingBalance ? Number(openingBalance) : 0,
      currentBalance: openingBalance ? Number(openingBalance) : 0,
      currency: settings.currency,
      accountType: category === 'materials' ? 'grocery' : category === 'hospitality' ? 'hospitality' : category === 'transport' ? 'transport' : category === 'maintenance' ? 'maintenance' : category === 'vendor' ? 'vendor' : category === 'fuel' ? 'utility' : 'other',
      defaultAmount: defaultAmount ? parseFloat(defaultAmount) : undefined,
      monthlyLimit: monthlyLimit ? parseFloat(monthlyLimit) : undefined,
      notes: notes.trim() || undefined,
      imageUrl: imageUrl || undefined,
      referenceImageUrl: referenceImageUrl || undefined,
      active: true,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر إنشاء الحساب. تحقق من البيانات والصلاحيات.');
      return;
    }

    onSuccess?.(created);
    onClose();

    // Reset
    setName('');
    setVendorName('');
    setContactPhone('');
    setAddress('');
    setDefaultAmount('');
    setOpeningBalance('0');
    setMonthlyLimit('');
    setNotes('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إضافة حساب مصروف اعتيادي / مورد معتاد"
      description="إنشاء حساب دائم للمصروفات المتكررة كالبقالة، بوفيه الموقع، أو الشراء من أحد الموردين المعتادين"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
        {/* Name & Quick Vendor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="اسم الحساب الاعتيادي / البقالة *"
            placeholder="مثال: بقالة السعادة / سوبرماركت النور / بوفيه الموقع"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="اسم المورد المعتاد أو صاحب المحل"
            placeholder="مثال: مؤسسة التوريدات الكهربائية السريعة"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
          />
        </div>

        {/* Category & Contact Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SmartSelect
            label="نوع وتصنيف المصروف الاعتيادي *"
            options={categoryOptions}
            value={category}
            onChange={(val) => setCategory(val)}
            isMulti={false}
            creatable={false}
            required
          />
          <Input
            label="رقم هاتف التواصل المباشر"
            placeholder="مثال: 0501234567"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>

        <Input
          label="عنوان المتجر / المورد أو موقع الزيارة"
          placeholder="الحي، الشارع، أو وصف الوصول للموقع"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        {/* Financial Direction (لنا / علينا) */}
        <div className="space-y-1.5 p-3.5 neu-raised rounded-2xl">
          <label className="block text-xs font-black text-slate-800">
            طبيعة الحساب والموقف المالي (لنا / علينا) *
          </label>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDirection('payable')}
              className={`p-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                direction === 'payable'
                  ? 'neu-inset text-amber-900 bg-amber-50/80 font-black'
                  : 'neu-raised text-slate-700 hover:text-slate-900'
              }`}
            >
              <span>🔴</span>
              <div className="text-right">
                <span className="block">علينا (مستحق سداده)</span>
                <span className="text-[10px] text-slate-500 font-normal">ندفع له مقابل مشتريات دورية</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDirection('receivable')}
              className={`p-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
                direction === 'receivable'
                  ? 'neu-inset text-emerald-900 bg-emerald-50/80 font-black'
                  : 'neu-raised text-slate-700 hover:text-slate-900'
              }`}
            >
              <span>🟢</span>
              <div className="text-right">
                <span className="block">لنا (مستحق تحصيله)</span>
                <span className="text-[10px] text-slate-500 font-normal">أرصدة أو مبالغ مستردة لصالحنا</span>
              </div>
            </button>
          </div>
        </div>

        {/* Amounts & Limits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            step="0.01"
            label={`المبلغ الاعتيادي المعتاد (${settings.currency})`}
            placeholder="مثال: 75.00"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            label={`الحد الشهري الأقصى (${settings.currency})`}
            placeholder="مثال: 1500.00"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            step="0.01"
            label={`الرصيد الافتتاحي المستحق (${settings.currency})`}
            placeholder="0.00"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
          <div className="rounded-xl neu-inset-sm p-3 text-xs text-slate-600 flex items-center">
            العملة المعتمدة لهذا الحساب: <strong className="mx-1">{settings.currency}</strong>. يبدأ كشف الحساب من الرصيد الافتتاحي ثم تتراكم الفواتير والسدادات والتحصيلات.
          </div>
        </div>

        {/* Account and reference documents */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5 block">
            <span className="block text-xs font-bold text-slate-700">صورة تعريف المنشأة أو الشعار</span>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0], setImageUrl)} className="w-full text-xs" />
          </label>
          <label className="space-y-1.5 block">
            <span className="block text-xs font-bold text-slate-700">صورة فاتورة أو سند أو طلبية مرجعية</span>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && readImage(e.target.files[0], setReferenceImageUrl)} className="w-full text-xs" />
          </label>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">ملاحظات ونطاق التعامل</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="شروط الدفع، فترات السداد، أصناف المشتريات المعتادة..."
            className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
          />
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-black/[0.04] flex items-center justify-end gap-3">
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" size="md" type="submit">
            حفظ الحساب الاعتيادي
          </Button>
        </div>
      </form>
    </Modal>
  );
};
