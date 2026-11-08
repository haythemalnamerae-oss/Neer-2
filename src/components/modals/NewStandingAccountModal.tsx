import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { dataStore } from '../../lib/storage';
import { StandingAccount } from '../../types/domain';
import { SmartSelect } from '../ui/SmartSelect';
import { Store, Phone, DollarSign, FileText } from 'lucide-react';

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
  const [direction, setDirection] = useState<'payable' | 'receivable'>('payable');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [notes, setNotes] = useState('');

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

    const created = dataStore.addStandingAccount({
      name: name.trim(),
      vendorName: vendorName.trim() || undefined,
      category,
      contactPhone: contactPhone.trim() || undefined,
      direction,
      defaultAmount: defaultAmount ? parseFloat(defaultAmount) : undefined,
      monthlyLimit: monthlyLimit ? parseFloat(monthlyLimit) : undefined,
      notes: notes.trim() || undefined,
      active: true,
    });

    onSuccess?.(created);
    onClose();

    // Reset
    setName('');
    setVendorName('');
    setContactPhone('');
    setDefaultAmount('');
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
            label="المبلغ الاعتيادي المعتاد (AED)"
            placeholder="مثال: 75.00"
            value={defaultAmount}
            onChange={(e) => setDefaultAmount(e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            label="الحد الشهري الأقصى للصرف (AED)"
            placeholder="مثال: 1500.00"
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
          />
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
