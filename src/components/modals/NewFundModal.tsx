import React, { useState } from 'react';
import { dataStore } from '../../lib/storage';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface NewFundModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewFundModal: React.FC<NewFundModalProps> = ({ isOpen, onClose }) => {
  const users = dataStore.getUsers();
  const settings = dataStore.getSettings();

  const [name, setName] = useState('');
  const [holderId, setHolderId] = useState('');
  const [totalAllocation, setTotalAllocation] = useState('20000');
  const [warningThreshold, setWarningThreshold] = useState('25');
  const [purpose, setPurpose] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !holderId || parseFloat(totalAllocation) <= 0) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const holder = users.find((u) => u.id === holderId);
    if (!holder) return;

    dataStore.addFund({
      name,
      holderId: holder.id,
      holderName: holder.name,
      holderDepartment: holder.department,
      totalAllocation: parseFloat(totalAllocation),
      currency: settings.currency,
      warningThreshold: parseInt(warningThreshold) || 25,
      purpose,
    });

    onClose();
    setName('');
    setPurpose('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تخصيص عهدة نقدية جديدة"
      description="تحديد السقف المالي للمخصص وأمين العهدة المسؤول والغرض التشغيلي"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4.5 text-xs sm:text-sm">
        <Input
          label="اسم العهدة *"
          placeholder="مثال: عهدة طوارئ فرع رأس الخيمة"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">أمين العهدة المسؤول *</label>
          <select
            value={holderId}
            onChange={(e) => setHolderId(e.target.value)}
            className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            required
          >
            <option value="">اختر مسؤول العهدة...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.department} - {u.roleTitleAr})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            label="سقف التخصيص الإجمالي (AED) *"
            value={totalAllocation}
            onChange={(e) => setTotalAllocation(e.target.value)}
            required
          />
          <Input
            type="number"
            label="نسبة تنبيه انخفاض الرصيد (%)"
            value={warningThreshold}
            onChange={(e) => setWarningThreshold(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">الغرض التشغيلي من العهدة</label>
          <textarea
            rows={3}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="مثال: شراء قطع غيار ومستلزمات صيانة عاجلة ووقود للمهام..."
            className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
          />
        </div>

        <div className="pt-4 border-t border-black/[0.04] flex items-center justify-end gap-3">
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" size="md" type="submit">
            تخصيص العهدة
          </Button>
        </div>
      </form>
    </Modal>
  );
};
