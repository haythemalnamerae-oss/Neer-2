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
  const users = dataStore.getUsers().filter((user) => user.active);
  const settings = dataStore.getSettings();

  const [name, setName] = useState('');
  const [holderId, setHolderId] = useState('');
  const [totalAllocation, setTotalAllocation] = useState('20000');
  const [warningThreshold, setWarningThreshold] = useState(String(settings.fundWarningThresholdPercent));
  const [purpose, setPurpose] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !holderId || !Number.isFinite(Number(totalAllocation)) || Number(totalAllocation) <= 0 || !Number.isFinite(Number(warningThreshold)) || Number(warningThreshold) < 0 || Number(warningThreshold) > 100) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    const holder = users.find((u) => u.id === holderId);
    if (!holder) return;

    try {
      dataStore.addFund({
        name,
        holderId: holder.id,
        holderName: holder.name,
        holderDepartment: holder.department,
        totalAllocation: Number(totalAllocation),
        currency: settings.currency,
        warningThreshold: Number(warningThreshold),
        purpose,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'تعذر إنشاء العهدة.');
      return;
    }

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
          placeholder="مثال: عهدة تشغيلية للموقع أو الفرع"
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
            min="0.01"
            step="0.01"
            label={`سقف التخصيص الإجمالي (${settings.currency}) *`}
            value={totalAllocation}
            onChange={(e) => setTotalAllocation(e.target.value)}
            required
          />
          <Input
            type="number"
            min="0"
            max="100"
            step="1"
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
