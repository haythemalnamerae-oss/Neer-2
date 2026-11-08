import React, { useState } from 'react';
import { dataStore } from '../../lib/storage';
import { TaskPriority, TaskTypeClassification, TaskStep } from '../../types/domain';
import { Modal } from '../ui/modal';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { SmartSelect } from '../ui/SmartSelect';
import { Plus, Trash2, MapPin, Layers, Users, Clock } from 'lucide-react';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose }) => {
  const users = dataStore.getUsers();
  const funds = dataStore.getFunds();
  const currentUser = dataStore.getCurrentUser();
  const allExistingTasks = dataStore.getTasks();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskTypeCategory, setTaskTypeCategory] = useState<TaskTypeClassification>('field');
  const [taskType, setTaskType] = useState('صيانة ميدانية');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const standingAccounts = dataStore.getStandingAccounts();
  const [standingAccountId, setStandingAccountId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([users[0]?.id || '']);
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
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
  const [taskFundAmount, setTaskFundAmount] = useState('');
  const [secondaryFundId, setSecondaryFundId] = useState('');
  const [isSubTask, setIsSubTask] = useState(false);
  const [parentTaskId, setParentTaskId] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [checklistText, setChecklistText] = useState('فصل وتأمين الموقع\nفحص المكونات وتركيب القطع\nالتشغيل التجريبي وتوقيع المحضر');
  
  // Dynamic steps sequence (الخطوات التكميلية المتسلسلة)
  const [steps, setSteps] = useState<Array<{ title: string; order: number }>>([
    { title: 'مرحلة التجهيز والشراء', order: 1 },
    { title: 'مرحلة التوريد والتنفيذ الميداني', order: 2 },
    { title: 'مرحلة الفحص والتسليم النهائي', order: 3 },
  ]);
  const [newStepInput, setNewStepInput] = useState('');

  const recentTaskTypes: string[] = Array.from(
    new Set(allExistingTasks.map((t) => t.taskType).filter((type): type is string => Boolean(type)))
  ).slice(0, 5);
  const commonTaskTypes = [
    'صيانة وتشغيل ميداني',
    'زيارة عميل / تفتيش دوري',
    'توريد وتركيب معدات',
    'تحصيل وصرف مالي',
    'إيداع بنكي للمتحصلات',
    'شراء مواد ومستلزمات',
    'فحص سلامة وجودة HSE',
    'مهمة عاجلة وطارئة',
  ];
  const allSuggestedTypes = Array.from(new Set([...recentTaskTypes, ...commonTaskTypes]));

  const pastLocations = Array.from(
    new Set([
      ...allExistingTasks.map((t) => t.location),
      'المقر الرئيسي - أبوظبي',
      'مصفح الصناعية 4B',
      'موقع مشروع الريم',
      'فرع دبي - القوز',
      'مستودع الشارقة المركزي',
      'المكتب الرئيسي / عن بعد',
    ].filter((loc): loc is string => Boolean(loc && loc.trim())))
  );

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

    const primaryAssigneeId = assigneeIds[0] || users[0].id;
    const assignedUser = users.find((u) => u.id === primaryAssigneeId) || users[0];
    const supervisorUsers = users.filter((u) => supervisorIds.includes(u.id));

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

    // Build tags with additional assignees if multiple were picked
    const additionalAssigneesNames = users
      .filter((u) => assigneeIds.slice(1).includes(u.id))
      .map((u) => u.name);

    const numFundAmount = parseFloat(taskFundAmount) || 0;
    const selectedFund = funds.find((f) => f.id === fundId);
    let effectiveFundId = fundId || undefined;

    // Handle multi-fund depletion split if fund amount exceeds primary fund balance
    if (selectedFund && numFundAmount > 0) {
      if (numFundAmount > selectedFund.currentBalance && secondaryFundId) {
        const secondaryFund = funds.find((f) => f.id === secondaryFundId);
        const avail1 = selectedFund.currentBalance;
        const neededFromSecondary = numFundAmount - avail1;

        // Deduct full balance of fund 1
        dataStore.updateFund(selectedFund.id, {
          currentBalance: 0,
          spentBalance: selectedFund.spentBalance + avail1,
          status: 'depleted',
        });

        // Deduct remainder from fund 2
        if (secondaryFund) {
          const newBal2 = Math.max(0, secondaryFund.currentBalance - neededFromSecondary);
          dataStore.updateFund(secondaryFund.id, {
            currentBalance: newBal2,
            spentBalance: secondaryFund.spentBalance + neededFromSecondary,
            status: newBal2 <= 0 ? 'depleted' : (newBal2 / secondaryFund.totalAllocation) * 100 <= secondaryFund.warningThreshold ? 'warning' : 'active',
          });
        }
      } else if (numFundAmount <= selectedFund.currentBalance) {
        const newBal = selectedFund.currentBalance - numFundAmount;
        dataStore.updateFund(selectedFund.id, {
          currentBalance: newBal,
          spentBalance: selectedFund.spentBalance + numFundAmount,
          status: newBal <= 0 ? 'depleted' : (newBal / selectedFund.totalAllocation) * 100 <= selectedFund.warningThreshold ? 'warning' : 'active',
        });
      }
    }

    const createdTask = dataStore.addTask({
      title,
      description: additionalAssigneesNames.length > 0 
        ? `${description}\n[فريق العمل المشارك: ${additionalAssigneesNames.join('، ')}]`
        : description,
      priority,
      status: 'scheduled',
      taskTypeCategory,
      taskType,
      clientName: clientName || undefined,
      clientPhone: clientPhone || undefined,
      standingAccountId: standingAccountId || undefined,
      standingAccountName: standingAccounts.find((account) => account.id === standingAccountId)?.name,
      dueTime: dueTime || undefined,
      proofRequired: proofRequired || undefined,
      assigneeId: assignedUser.id,
      assigneeName: assignedUser.name,
      assigneeAvatar: assignedUser.avatar,
      creatorId: currentUser.id,
      creatorName: currentUser.name,
      supervisors: supervisorUsers.map((u) => ({ id: u.id, name: u.name, role: u.roleTitleAr || u.role })),
      locationRequired,
      dueDate,
      startDate: startDate || new Date().toISOString().split('T')[0],
      location: location || 'المكتب الرئيسي / عن بعد',
      category,
      budget: parseFloat(budget) || 0,
      tags: [
        taskType,
        category,
        location ? location.split('-')[0].trim() : 'إداري',
        ...(isSubTask ? ['مهمة فرعية'] : []),
        ...additionalAssigneesNames,
      ],
      checklist: checklistItems,
      steps: initialSteps,
      fundId: effectiveFundId,
      taskFundAmount: numFundAmount > 0 ? numFundAmount : undefined,
      taskFundSpent: 0,
      taskFundRemaining: numFundAmount > 0 ? numFundAmount : undefined,
      parentTaskId: isSubTask && parentTaskId ? parentTaskId : undefined,
    });

    // If sub-task of existing task, link to parent task's subtasks array as well!
    if (isSubTask && parentTaskId) {
      dataStore.addSubTask(parentTaskId, {
        title,
        assigneeId: assignedUser.id,
        assigneeName: assignedUser.name,
        status: 'scheduled',
        requiresApproval,
        isApproved: false,
        dueDate,
      });
    }

    onClose();
    // Reset form
    setTitle('');
    setDescription('');
    setLocation('');
    setClientName('');
    setClientPhone('');
    setStandingAccountId('');
    setProofRequired('');
    setTaskFundAmount('');
    setSecondaryFundId('');
    setIsSubTask(false);
    setParentTaskId('');
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
          <div className="space-y-1.5 sm:col-span-1">
            <SmartSelect
              label="نوع المهمة (بحث واقتراح ذكي) *"
              placeholder="ابحث أو اكتب نوع المهمة..."
              options={allSuggestedTypes}
              value={taskType}
              onChange={(val) => setTaskType(val)}
              creatable={true}
              required
              helperText="يمكنك اختيار نوع معتاد أو كتابة نوع جديد فوراً"
            />
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
          <SmartSelect
            label="المنشأة أو المورد المعتاد المرتبط بالمهمة"
            placeholder="ابحث باسم المنشأة أو المورد..."
            options={[{ value: '', label: 'بدون منشأة ثابتة' }, ...standingAccounts.map((account) => ({ value: account.id, label: account.name, sublabel: account.vendorName || account.category }))]}
            value={standingAccountId}
            onChange={(value) => setStandingAccountId(value)}
            creatable={false}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SmartSelect
            label="درجة الأولوية *"
            options={[
              { value: 'urgent', label: 'طارئ جداً (Urgent)', icon: '🚨' },
              { value: 'high', label: 'عالي (High)', icon: '⚡' },
              { value: 'medium', label: 'متوسط (Medium)', icon: '⚖️' },
              { value: 'low', label: 'منخفض (Low)', icon: '☕' },
            ]}
            value={priority}
            onChange={(val) => setPriority(val as TaskPriority)}
            creatable={false}
          />

          <div className="sm:col-span-2">
            <SmartSelect
              label="المسؤولون المكلفون بالتنفيذ (اختيار فردي أو متعدد) *"
              placeholder="ابحث واختر المكلفين بالعمل..."
              options={users.map((u) => ({
                value: u.id,
                label: u.name,
                sublabel: u.department,
                badge: u.roleTitleAr,
              }))}
              value={assigneeIds}
              onChange={(vals) => setAssigneeIds(Array.isArray(vals) ? vals : [vals])}
              isMulti={true}
              creatable={false}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SmartSelect
            label="المشرفون المتابعون (اختياري - اختيار متعدد)"
            placeholder="ابحث واختر المشرفين..."
            options={users.map((u) => ({
              value: u.id,
              label: u.name,
              sublabel: u.department,
              badge: u.roleTitleAr,
            }))}
            value={supervisorIds}
            onChange={(vals) => setSupervisorIds(Array.isArray(vals) ? vals : [vals])}
            isMulti={true}
            creatable={false}
          />

          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center gap-3 p-3.5 neu-inset-sm rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={locationRequired}
                onChange={(e) => setLocationRequired(e.target.checked)}
                className="w-5 h-5 accent-[#345c47] rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-700">توثيق الموقع الجغرافي إجباري عند التنفيذ الميداني</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <SmartSelect
            label={locationRequired ? 'موقع العمل الميداني المستهدف *' : 'موقع العمل (اختياري)'}
            placeholder="ابحث في المواقع السابقة أو اكتب موقعاً جديداً..."
            options={pastLocations}
            value={location}
            onChange={(val) => setLocation(val)}
            creatable={true}
            required={locationRequired}
            helperText="يمكنك اختيار موقع سابق أو كتابة موقع جديد واختياره فوراً"
          />
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

        {/* Sub-Task Options */}
        <div className="p-4 rounded-2xl neu-inset-sm space-y-3">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
            <input
              type="checkbox"
              checked={isSubTask}
              onChange={(e) => setIsSubTask(e.target.checked)}
              className="w-4 h-4 rounded-md accent-[#2A443B]"
            />
            <span>هل هذه مهمة فرعية تابعة لمهمة رئيسية؟</span>
          </label>

          {isSubTask && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-600">المهمة الرئيسية التابعة لها</label>
                <select
                  value={parentTaskId}
                  onChange={(e) => setParentTaskId(e.target.value)}
                  className="w-full neu-inset px-3 py-2 rounded-xl text-xs text-slate-800 font-semibold"
                >
                  <option value="">اختر المهمة الرئيسية...</option>
                  {allExistingTasks.filter((t) => !t.parentTaskId).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.code || 'TSK'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                    className="w-4 h-4 rounded-md accent-[#2A443B]"
                  />
                  <span>تتطلب موافقة واعتماد المدير</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            label="الميزانية التقديرية (AED)"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <Input
            type="number"
            label="المبلغ المسحوب من العهدة للمهمة (اختياري)"
            placeholder="0"
            value={taskFundAmount}
            onChange={(e) => setTaskFundAmount(e.target.value)}
          />
        </div>

        {/* Fund Allocation & Multi-Fund Depletion */}
        <div className="space-y-3">
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
                  {f.name} (الرصيد المتاح: {f.currentBalance} {f.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Cascade warning and second fund choice if fund amount > primary balance */}
          {fundId && parseFloat(taskFundAmount) > 0 && (() => {
            const f1 = funds.find((f) => f.id === fundId);
            const req = parseFloat(taskFundAmount);
            if (f1 && req > f1.currentBalance) {
              const shortage = req - f1.currentBalance;
              return (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️ رصيد {f1.name} الحالي هو {f1.currentBalance} {f1.currency} فقط (المبلغ المطلوب: {req} {f1.currency})</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    سيتم استهلاك رصيد {f1.name} كاملاً (يصبح رصيدها 0). يرجى اختيار عهدة ثانية لتغطية المتبقي ({shortage} {f1.currency}):
                  </p>
                  <select
                    value={secondaryFundId}
                    onChange={(e) => setSecondaryFundId(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="">اختر العهدة الثانوية البديلة...</option>
                    {funds.filter((f) => f.id !== fundId).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (المتاح: {f.currentBalance} {f.currency})
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            return null;
          })()}
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
