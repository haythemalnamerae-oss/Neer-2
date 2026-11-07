import React, { useState } from 'react';
import { dataStore } from '../../lib/storage';
import { TaskPriority, TaskTypeClassification, TaskStep } from '../../types/domain';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Plus, Trash2, MapPin, Layers, Users, Clock } from 'lucide-react';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskTypeCategory, setTaskTypeCategory] = useState<TaskTypeClassification>('field');
  const [taskType, setTaskType] = useState('صيانة ميدانية');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [locationRequired, setLocationRequired] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('14:00');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [proofRequired, setProofRequired] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('صيانة وتشغيل');
  const [budget, setBudget] = useState('2000');
  const [fundId, setFundId] = useState('');
  const [checklistText, setChecklistText] = useState('فصل وتأمين الموقع\nفحص المكونات وتركيب القطع\nالتشغيل التجريبي وتوقيع المحضر');
  
  // Dynamic steps sequence (الخطوات التكميلية المتسلسلة)
  const [steps, setSteps] = useState<Array<{ title: string; order: number }>>([
    { title: 'مرحلة التجهيز والشراء', order: 1 },
    { title: 'مرحلة التوريد والتنفيذ الميداني', order: 2 },
    { title: 'مرحلة الفحص والتسليم النهائي', order: 3 },
  ]);
  const [newStepInput, setNewStepInput] = useState('');

  const users = dataStore.getUsers();
  const funds = dataStore.getFunds();
  const currentUser = dataStore.getCurrentUser();

  const handleAddStep = () => {
    if (!newStepInput.trim()) return;
    setSteps([...steps, { title: newStepInput.trim(), order: steps.length + 1 }]);
    setNewStepInput('');
  };

  const handleRemoveStep = (index: number) => {
    const updated = steps.filter((_, i) => i !== index).map((s, idx) => ({ ...s, order: idx + 1 }));
    setSteps(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate || (locationRequired && !location.trim())) {
      alert('يرجى ملء جميع الحقول الإلزامية');
      return;
    }

    const assignedUser = users.find((u) => u.id === (assigneeId || users[0].id)) || users[0];
    const supervisorUser = users.find((u) => u.id === supervisorId);

    const checklistItems = checklistText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((text, idx) => ({
        id: `chk-${Date.now()}-${idx}`,
        text,
        completed: false,
      }));

    const initialSteps: TaskStep[] = steps.map((s, idx) => ({
      id: `step-${Date.now()}-${idx}`,
      title: s.title,
      order: s.order,
      status: 'pending',
    }));

    dataStore.addTask({
      title,
      description,
      priority,
      status: 'scheduled',
      taskTypeCategory,
      taskType,
      clientName: clientName || undefined,
      clientPhone: clientPhone || undefined,
      dueTime: dueTime || undefined,
      proofRequired: proofRequired || undefined,
      assigneeId: assignedUser.id,
      assigneeName: assignedUser.name,
      assigneeAvatar: assignedUser.avatar,
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      supervisors: supervisorUser ? [{ id: supervisorUser.id, name: supervisorUser.name, role: supervisorUser.role }] : [],
      locationRequired,
      dueDate,
      startDate: startDate || new Date().toISOString().split('T')[0],
      location: location || 'المكتب الرئيسي / عن بعد',
      category,
      budget: parseFloat(budget) || 0,
      tags: [taskType, category, location ? location.split('-')[0].trim() : 'إداري'],
      checklist: checklistItems,
      steps: initialSteps,
      fundId: fundId || undefined,
    });

    onClose();
    // Reset form
    setTitle('');
    setDescription('');
    setLocation('');
    setClientName('');
    setClientPhone('');
    setProofRequired('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إنشاء بطاقة مهمة ذكية جديدة"
      description="تحديد نطاق العمل والنوع والمسؤولين والخطوات التكميلية والميزانية"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4.5 text-xs sm:text-sm">
        {/* Task Classification (النوع: إداري، ميداني، مالي، زيارة) */}
        <div>
          <label className="block text-xs font-extrabold text-slate-700 mb-2">تصنيف نوع المهمة الأساسي *</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { id: 'field', label: 'ميداني (Field)', icon: '🛠️' },
              { id: 'administrative', label: 'إداري (Admin)', icon: '📋' },
              { id: 'financial', label: 'مالي (Finance)', icon: '💰' },
              { id: 'visit', label: 'زيارة / تفتيش', icon: '🚗' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setTaskTypeCategory(cat.id as TaskTypeClassification)}
                className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                  taskTypeCategory === cat.id
                    ? 'neu-inset text-emerald-800 bg-[#EAF0EC] font-black'
                    : 'neu-raised text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="text-base">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Input
              label="عنوان المهمة *"
              placeholder="مثال: توريد واستبدال قواطع كهربائية رئيسية"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">التصنيف الفرعي *</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="صيانة ميدانية">صيانة وتشغيل ميداني</option>
              <option value="زيارة عميل / تفتيش">زيارة عميل / تفتيش دوري</option>
              <option value="تسليم وتركيب معدات">توريد وتركيب معدات</option>
              <option value="تحصيل ومتابعة مالية">تحصيل وصرف مالي</option>
              <option value="فحص سلامة HSE">فحص سلامة وجودة HSE</option>
              <option value="أعمال طارئة">مهمة عاجلة وطارئة</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="اسم العميل / الجهة المستفيدة"
            placeholder="مثال: شركة بترول أبوظبي الوطنية"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
          <Input
            label="رقم هاتف الاتصال الميداني"
            placeholder="مثال: 0501234567"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">وصف المهمة والتعليمات التفصيلية</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="اشرح نطاق العمل والإجراءات المطلوبة..."
            className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden transition"
          />
        </div>

        <div className="space-y-1.5">
          <Input
            label="الإثبات المطلوب عند الإنجاز (Proof Requirement)"
            placeholder="مثال: صورة العداد بعد الصيانة + توقيع مسؤول الموقع"
            value={proofRequired}
            onChange={(e) => setProofRequired(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">الأولوية</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="urgent">طارئ جداً (Urgent)</option>
              <option value="high">عالي (High)</option>
              <option value="medium">متوسط (Medium)</option>
              <option value="low">منخفض (Low)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">المسؤول التنفيذي المكلّف *</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="">اختر مسؤولاً تنفيذياً...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} - {u.roleTitleAr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">المشرف المتابع (اختياري)</label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="">بدون مشرف متابع محدد</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} - {u.roleTitleAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center gap-3 p-3 neu-inset-sm rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={locationRequired}
                onChange={(e) => setLocationRequired(e.target.checked)}
                className="w-5 h-5 accent-[#345c47] rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700">توثيق الموقع الجغرافي إجباري عند التنفيذ</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Input
              label={locationRequired ? 'موقع العمل الميداني المستهدف *' : 'موقع العمل (اختياري)'}
              placeholder="مثال: مصفح 4B، أبوظبي / أو عنوان المنشأة"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required={locationRequired}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 neu-inset-sm p-4 rounded-2xl">
          <div>
            <Input
              type="date"
              label="تاريخ البدء المخطط"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Input
              type="time"
              label="وقت البدء المستهدف"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <Input
              type="date"
              label="تاريخ التسليم *"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              type="time"
              label="وقت التسليم المحدد"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </div>
        </div>

        {/* Steps Builder (الخطوات التكميلية المتسلسلة) */}
        <div className="space-y-3 neu-raised p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-emerald-700" />
              <span>الخطوات التكميلية المتسلسلة (Steps Timeline)</span>
            </label>
            <span className="text-xs text-emerald-800 font-bold">مراحل زمنية متعاقبة داخل المهمة</span>
          </div>
          
          <div className="space-y-2">
            {steps.map((st, idx) => (
              <div key={idx} className="flex items-center gap-3 neu-inset-sm px-3.5 py-2.5 rounded-xl">
                <span className="w-6 h-6 rounded-xl neu-raised text-emerald-800 text-xs font-extrabold flex items-center justify-center shrink-0">
                  {st.order}
                </span>
                <span className="text-xs font-bold text-slate-800 flex-1">{st.title}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveStep(idx)}
                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg neu-raised active:neu-inset cursor-pointer transition-all"
                  title="حذف الخطوة"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <input
              type="text"
              placeholder="إضافة مرحلة جديدة (مثال: مرحلة الاعتماد النهائي وتوقيع العميل)..."
              value={newStepInput}
              onChange={(e) => setNewStepInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddStep();
                }
              }}
              className="flex-1 neu-inset rounded-2xl px-4 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleAddStep}
              className="neu-raised px-4 py-2.5 rounded-2xl text-xs font-extrabold text-emerald-800 hover:text-emerald-900 active:neu-inset flex items-center gap-1 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            label="الميزانية التقديرية (AED)"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">العهدة النقدية المرتبطة (اختياري)</label>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
            >
              <option value="">بدون عهدة محددة</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (الرصيد: {f.currentBalance} {f.currency})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700">
            قائمة التحقق والفحص (Checklist) - كل بند في سطر
          </label>
          <textarea
            rows={2}
            value={checklistText}
            onChange={(e) => setChecklistText(e.target.value)}
            className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
          />
        </div>

        <div className="pt-4 border-t border-black/[0.04] flex items-center justify-end gap-3">
          <Button variant="outline" size="md" type="button" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" size="md" type="submit">
            إنشاء البطاقة الذكية
          </Button>
        </div>
      </form>
    </Modal>
  );
};
