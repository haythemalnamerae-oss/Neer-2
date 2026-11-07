import React, { useState } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Clock,
  User,
  CheckSquare,
  DollarSign,
  Phone,
  Layers,
  CheckCircle2,
  AlertTriangle,
  History,
  Tag,
  Play,
  Pause,
  RotateCcw,
  MessageSquare,
  Plus,
  ShieldAlert,
  Send,
  Building,
  Check,
} from 'lucide-react';
import { Task, TaskStatus, TaskStepStatus } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { formatCurrency, TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '../../lib/utils/format';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface TaskDetailsModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onRecordOutcome: (task: Task) => void;
  onViewChain: (task: Task) => void;
  onAddExpense: (taskId: string, fundId?: string) => void;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({
  task,
  isOpen,
  onClose,
  onRecordOutcome,
  onViewChain,
  onAddExpense,
}) => {
  if (!isOpen || !task) return null;

  const [activeTab, setActiveTab] = useState<'details' | 'steps' | 'subtasks' | 'daily_updates' | 'checklist' | 'history'>('details');
  const [isPausePromptOpen, setIsPausePromptOpen] = useState(false);
  const [pauseReasonInput, setPauseReasonInput] = useState('');
  const [dailyNoteInput, setDailyNoteInput] = useState('');
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [newSubTaskAssignee, setNewSubTaskAssignee] = useState('');
  const [stepNoteInputs, setStepNoteInputs] = useState<Record<string, string>>({});

  const currentUser = dataStore.getCurrentUser();
  const users = dataStore.getUsers();

  const statusCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, badgeColor: 'neu-inset-sm text-slate-700' };
  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority] || { label: task.priority, badgeColor: 'neu-raised text-slate-700' };

  // Task Category Tag
  const categoryLabels: Record<string, { label: string; color: string; icon: string }> = {
    field: { label: 'مهمة ميدانية', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: '🛠️' },
    administrative: { label: 'مهمة إدارية', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: '📋' },
    financial: { label: 'مهمة مالية', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '💰' },
    visit: { label: 'زيارة وتفتيش', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: '🚗' },
  };

  const catCfg = categoryLabels[task.taskTypeCategory || 'field'] || categoryLabels.field;

  const handleStartTask = () => {
    dataStore.startTask(task.id);
  };

  const handleConfirmPause = () => {
    if (!pauseReasonInput.trim()) {
      alert('يرجى تدوين سبب إيقاف المهمة مؤقتاً');
      return;
    }
    dataStore.pauseTask(task.id, pauseReasonInput.trim());
    setIsPausePromptOpen(false);
    setPauseReasonInput('');
  };

  const handleResumeTask = () => {
    dataStore.resumeTask(task.id);
  };

  const handleAddDailyUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyNoteInput.trim()) return;
    dataStore.addTaskDailyUpdate(task.id, dailyNoteInput.trim());
    setDailyNoteInput('');
  };

  const handleStepStatusChange = (stepId: string, status: TaskStepStatus) => {
    const note = stepNoteInputs[stepId];
    dataStore.updateTaskStepStatus(task.id, stepId, status, note);
  };

  const handleAddSubTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTaskTitle.trim()) return;
    const assignee = users.find((u) => u.id === newSubTaskAssignee) || currentUser;
    dataStore.addSubTask(task.id, {
      title: newSubTaskTitle.trim(),
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      status: 'scheduled',
      requiresApproval: true,
      isApproved: false,
    });
    setNewSubTaskTitle('');
  };

  const handleToggleChecklist = (itemId: string) => {
    dataStore.toggleTaskChecklistItem(task.id, itemId);
  };

  const hasChain = (task.taskChain && task.taskChain.length > 0) || Boolean(task.parentTaskId);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-black/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs font-extrabold text-emerald-800 neu-inset-sm px-3 py-1 rounded-xl">
              {task.code}
            </span>
            <span className={`text-xs font-bold px-3 py-1 rounded-xl neu-raised flex items-center gap-1.5`}>
              <span>{catCfg.icon}</span>
              <span>{catCfg.label}</span>
            </span>
            <span className={`text-xs font-bold px-3 py-1 rounded-xl neu-inset-sm text-slate-700`}>
              {statusCfg.label}
            </span>
            <span className={`text-xs font-bold px-3 py-1 rounded-xl neu-raised text-slate-700`}>
              {priorityCfg.label}
            </span>

            {task.isPaused && (
              <span className="text-xs font-extrabold neu-raised text-amber-800 px-3 py-1 rounded-xl animate-pulse flex items-center gap-1.5">
                <Pause className="w-4 h-4 text-amber-600" />
                <span>متوقفة مؤقتاً</span>
              </span>
            )}

            {hasChain && (
              <button
                onClick={() => onViewChain(task)}
                className="flex items-center gap-1.5 text-xs font-extrabold neu-raised text-emerald-800 px-3 py-1 rounded-xl active:neu-inset transition-all cursor-pointer"
              >
                <Layers className="w-4 h-4 text-emerald-700" />
                <span>سلسلة المتابعة</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl neu-raised text-slate-500 hover:text-slate-800 active:neu-inset flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title, Timeline & People Hierarchy */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-800 font-serif leading-snug">
                {task.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 mt-2.5 text-xs sm:text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                  <span className="font-semibold">{task.location}</span>
                  {task.locationRequired && (
                    <span className="text-[10px] neu-raised text-emerald-800 px-2 py-0.5 rounded-md font-bold">
                      موقع إجباري
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  <span>الاستحقاق: <strong className="text-slate-800">{task.dueDate}</strong> {task.dueTime ? `(${task.dueTime})` : ''}</span>
                </div>
                {task.actualStartTime && (
                  <div className="flex items-center gap-1.5 text-emerald-800 neu-inset-sm px-2.5 py-0.5 rounded-lg font-bold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>بدأ التنفيذ: {new Date(task.actualStartTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Execution Lifecycle Buttons */}
            <div className="flex items-center gap-2.5 shrink-0">
              {task.status !== 'in_progress' && task.status !== 'completed' && task.status !== 'approved' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartTask}
                  icon={<Play className="w-4 h-4 ml-1" />}
                >
                  بدء المهمة
                </Button>
              )}

              {task.status === 'in_progress' && !task.isPaused && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPausePromptOpen(true)}
                  icon={<Pause className="w-4 h-4 ml-1 text-amber-700" />}
                >
                  إيقاف مؤقت
                </Button>
              )}

              {task.isPaused && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleResumeTask}
                  icon={<RotateCcw className="w-4 h-4 ml-1" />}
                >
                  استئناف العمل
                </Button>
              )}

              {task.status !== 'completed' && task.status !== 'approved' && (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onRecordOutcome(task);
                  }}
                  icon={<CheckCircle2 className="w-4 h-4 ml-1" />}
                >
                  إنهاء المهمة
                </Button>
              )}
            </div>
          </div>

          {/* Pause Reason Warning if active */}
          {task.isPaused && task.pauseReason && (
            <div className="mt-3 p-3.5 neu-inset-sm rounded-2xl flex items-start gap-2.5 text-xs sm:text-sm text-amber-900">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>العمل متوقف مؤقتاً:</strong> {task.pauseReason}
                <span className="text-amber-700 mr-2 text-xs">({task.pausedAt})</span>
              </div>
            </div>
          )}

          {/* Pause Prompt dialog */}
          {isPausePromptOpen && (
            <div className="mt-3 p-4 neu-raised rounded-2xl space-y-2.5">
              <label className="block text-xs font-extrabold text-slate-800">
                تدوين سبب الإيقاف المؤقت والعوائق الميدانية:
              </label>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="مثال: انقطاع التيار بانتظار تصريح شركة الكهرباء / تأخر توريد القطعة..."
                  value={pauseReasonInput}
                  onChange={(e) => setPauseReasonInput(e.target.value)}
                  className="flex-1 neu-inset rounded-2xl px-4 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                  autoFocus
                />
                <Button variant="outline" size="sm" onClick={() => setIsPausePromptOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="primary" size="sm" onClick={handleConfirmPause}>
                  تأكيد الإيقاف
                </Button>
              </div>
            </div>
          )}

          {/* Key People Line (الهيكل الإداري: المنشئ، المشرف، المنفذ) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4 pt-3.5 border-t border-black/[0.04] text-xs sm:text-sm">
            <div className="flex items-center gap-3 p-3 rounded-2xl neu-inset-sm">
              <div className="w-8 h-8 rounded-xl neu-raised text-slate-600 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">المنفذ المكلّف</span>
                <strong className="text-slate-800 font-extrabold">{task.assigneeName}</strong>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl neu-inset-sm">
              <div className="w-8 h-8 rounded-xl neu-raised text-emerald-800 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-emerald-700" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">المشرف المتابع</span>
                <strong className="text-slate-800 font-extrabold">
                  {task.supervisors && task.supervisors.length > 0 ? task.supervisors.map((s) => s.name).join(', ') : 'الإدارة العامة'}
                </strong>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-2xl neu-inset-sm">
              <div className="w-8 h-8 rounded-xl neu-raised text-slate-600 flex items-center justify-center">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">المنشئ / الاعتماد</span>
                <strong className="text-slate-800 font-extrabold">{task.creatorName || 'المدير العام'}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-black/[0.04] px-6 gap-2 sm:gap-3 overflow-x-auto py-2">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'details' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            التفاصيل والمالية
          </button>
          
          <button
            onClick={() => setActiveTab('steps')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'steps' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>المراحل التكميلية ({task.steps ? task.steps.filter((s) => s.status === 'completed').length : 0}/{task.steps ? task.steps.length : 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('subtasks')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'subtasks' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>المهام الفرعية ({task.subTasks ? task.subTasks.length : 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('daily_updates')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'daily_updates' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>التقارير اليومية ({task.dailyUpdates ? task.dailyUpdates.length : 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'checklist' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>الفحص ({task.checklist.filter((c) => c.completed).length}/{task.checklist.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>السجل ({task.history.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* TAB 1: Details & Finance */}
          {activeTab === 'details' && (
            <>
              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">نطاق العمل والتعليمات التنفيذية</h4>
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed neu-inset p-4.5 rounded-2xl">
                  {task.description || 'لا يوجد وصف إضافي مسجل.'}
                </p>
              </div>

              {/* Client & Proof info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {task.clientName && (
                  <div className="p-4 neu-raised rounded-2xl space-y-1.5">
                    <span className="text-xs font-bold text-slate-500 block">الجهة المستفيدة / العميل</span>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-800 block">{task.clientName}</span>
                    {task.clientPhone && (
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-emerald-800 font-bold mt-1">
                        <Phone className="w-4 h-4 text-emerald-700" />
                        <span className="font-mono">{task.clientPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                {task.proofRequired && (
                  <div className="p-4 neu-raised rounded-2xl space-y-1.5">
                    <span className="text-xs font-bold text-amber-800 block">الإثبات المشترط عند التسليم (Proof Requirement)</span>
                    <span className="text-xs sm:text-sm text-slate-800 font-semibold leading-relaxed block">{task.proofRequired}</span>
                  </div>
                )}
              </div>

              {/* Financial Box */}
              <div className="p-5 neu-raised rounded-3xl flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="text-xs text-slate-500 block font-bold">الميزانية التقديرية</span>
                  <strong className="text-base sm:text-lg font-black text-slate-800 dir-ltr font-mono">{formatCurrency(task.budget)}</strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block font-bold">المصروف الفعلي حتى الآن</span>
                  <strong className="text-base sm:text-lg font-black text-slate-800 dir-ltr font-mono">{formatCurrency(task.spentAmount)}</strong>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block font-bold">فارق الميزانية</span>
                  <strong className={`text-base sm:text-lg font-black dir-ltr font-mono ${task.spentAmount > task.budget ? 'text-rose-700' : 'text-emerald-800'}`}>
                    {formatCurrency(task.budget - task.spentAmount)}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => onAddExpense(task.id, task.fundId)}
                  className="neu-raised px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold text-emerald-800 hover:text-emerald-900 active:neu-inset flex items-center gap-2 cursor-pointer transition-all"
                >
                  <DollarSign className="w-4 h-4 text-emerald-700" />
                  <span>ربط مصروف / فاتورة</span>
                </button>
              </div>

              {/* Tags */}
              {task.tags && task.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Tag className="w-4 h-4 text-slate-500" />
                  {task.tags.map((tag, idx) => (
                    <Badge key={idx} variant="default" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 2: Steps Timeline (الخطوات التكميلية المتسلسلة) */}
          {activeTab === 'steps' && (
            <div className="space-y-4">
              <div className="neu-inset-sm p-4 rounded-2xl text-xs sm:text-sm text-slate-800">
                <strong>خطوات الإنجاز الزمنية التكميلية:</strong> مراحل متعاقبة داخل المهمة (مثل: مرحلة الشراء ⬅️ مرحلة التوريد ⬅️ مرحلة التسليم).
              </div>

              <div className="space-y-3.5">
                {task.steps && task.steps.length > 0 ? (
                  task.steps.map((step) => {
                    const stepStatusLabels: Record<TaskStepStatus, { label: string; badge: string }> = {
                      pending: { label: 'معلقة', badge: 'neu-inset-sm text-slate-600' },
                      in_progress: { label: 'قيد التنفيذ', badge: 'neu-raised text-blue-700' },
                      completed: { label: 'أنجزت', badge: 'neu-raised text-emerald-800 font-black' },
                      blocked: { label: 'تعثرت', badge: 'neu-raised text-rose-700 font-bold' },
                      deferred: { label: 'أُجلت', badge: 'neu-raised text-amber-700 font-bold' },
                    };

                    const cfg = stepStatusLabels[step.status] || stepStatusLabels.pending;

                    return (
                      <div key={step.id} className="p-4 sm:p-5 rounded-2xl neu-raised space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-xl neu-raised text-emerald-800 text-xs font-black flex items-center justify-center shrink-0">
                              {step.order}
                            </span>
                            <h4 className="text-sm sm:text-base font-extrabold text-slate-800">{step.title}</h4>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                          </div>

                          {/* Quick status selector */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStepStatusChange(step.id, 'completed')}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                                step.status === 'completed'
                                  ? 'neu-inset text-emerald-800'
                                  : 'neu-raised text-slate-600 hover:text-emerald-700'
                              }`}
                              title="أنجزت"
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                            </button>
                            <button
                              onClick={() => handleStepStatusChange(step.id, 'in_progress')}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                                step.status === 'in_progress'
                                  ? 'neu-inset text-blue-700'
                                  : 'neu-raised text-slate-600 hover:text-blue-700'
                              }`}
                              title="قيد التنفيذ"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleStepStatusChange(step.id, 'blocked')}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                                step.status === 'blocked'
                                  ? 'neu-inset text-rose-700'
                                  : 'neu-raised text-slate-600 hover:text-rose-700'
                              }`}
                              title="تعثرت"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Step Details & Notes */}
                        <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-black/[0.04]">
                          <span>
                            {step.completedAt ? `تاريخ الإنجاز: ${step.completedAt}` : 'لم تكتمل بعد'}
                          </span>
                          {step.notes && (
                            <span className="text-slate-800 neu-inset-sm px-3 py-1 rounded-xl font-medium">
                              ملاحظات: {step.notes}
                            </span>
                          )}
                        </div>

                        {/* Add note input */}
                        <div className="flex gap-2.5 pt-1">
                          <input
                            type="text"
                            placeholder="تدوين ملاحظة سريعة لهذه المرحلة..."
                            value={stepNoteInputs[step.id] || ''}
                            onChange={(e) => setStepNoteInputs({ ...stepNoteInputs, [step.id]: e.target.value })}
                            className="flex-1 neu-inset rounded-2xl px-3.5 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                          />
                          <button
                            onClick={() => {
                              handleStepStatusChange(step.id, step.status);
                              setStepNoteInputs({ ...stepNoteInputs, [step.id]: '' });
                            }}
                            className="neu-raised px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold text-slate-700 hover:text-slate-900 active:neu-inset transition-all cursor-pointer"
                          >
                            حفظ الملاحظة
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    لا توجد خطوات تكميلية محددة لهذه المهمة.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Independent Sub-tasks (المهام الفرعية المستقلة) */}
          {activeTab === 'subtasks' && (
            <div className="space-y-4">
              <div className="neu-inset-sm p-4 rounded-2xl text-xs sm:text-sm text-slate-800">
                <strong>المهام الفرعية المستقلة:</strong> مهام قائمة بذاتها تتبع المهمة الرئيسية وتتطلب تكليفاً وموافقة إدارية مسبقة.
              </div>

              {/* Add Subtask form */}
              <form onSubmit={handleAddSubTask} className="p-4 sm:p-5 neu-raised rounded-2xl space-y-3">
                <span className="text-xs font-extrabold text-slate-800 block">إضافة مهمة فرعية جديدة:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    placeholder="عنوان المهمة الفرعية (مثال: طلب عروض أسعار من الموردين)..."
                    value={newSubTaskTitle}
                    onChange={(e) => setNewSubTaskTitle(e.target.value)}
                    className="sm:col-span-2 neu-inset rounded-2xl px-4 py-2 text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                  />
                  <select
                    value={newSubTaskAssignee}
                    onChange={(e) => setNewSubTaskAssignee(e.target.value)}
                    className="neu-inset rounded-2xl px-3 py-2 text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
                  >
                    <option value="">المسؤول التنفيذي...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" variant="primary" size="sm">
                    <Plus className="w-4 h-4 ml-1" />
                    إسناد المهمة الفرعية
                  </Button>
                </div>
              </form>

              {/* Subtasks list */}
              <div className="space-y-2.5">
                {task.subTasks && task.subTasks.length > 0 ? (
                  task.subTasks.map((st) => (
                    <div key={st.id} className="p-3.5 rounded-2xl neu-raised flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={st.status === 'completed'}
                          onChange={() => dataStore.updateSubTaskStatus(task.id, st.id, st.status === 'completed' ? 'scheduled' : 'completed')}
                          className="w-5 h-5 accent-[#345c47] rounded cursor-pointer"
                        />
                        <span className={`font-semibold ${st.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {st.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-xs">المكلف: <strong className="text-slate-700">{st.assigneeName}</strong></span>
                        {st.requiresApproval && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl ${st.isApproved ? 'neu-raised text-emerald-800' : 'neu-inset-sm text-amber-800'}`}>
                            {st.isApproved ? 'معتمد' : 'بانتظار إذن المدير'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-slate-400">
                    لا توجد مهام فرعية مضافة حتى الآن.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Daily Updates (التقارير اليومية المتراكمة) */}
          {activeTab === 'daily_updates' && (
            <div className="space-y-4">
              <div className="neu-inset-sm p-4 rounded-2xl text-xs sm:text-sm text-slate-800">
                <strong>التقرير اليومي التراكمي:</strong> تدوين ملاحظات دورية لبناء تقرير إنجاز متكامل يرفع تلقائياً للإدارة في نهاية اليوم.
              </div>

              {/* Add Daily Update Input */}
              <form onSubmit={handleAddDailyUpdate} className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="تدوين تحديث ميداني أو ملاحظة للإنجاز اليومي..."
                  value={dailyNoteInput}
                  onChange={(e) => setDailyNoteInput(e.target.value)}
                  className="flex-1 neu-inset rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                />
                <Button type="submit" variant="primary" size="md">
                  <Send className="w-4 h-4 ml-1" />
                  تسجيل التقرير
                </Button>
              </form>

              {/* Thread of daily updates */}
              <div className="space-y-3">
                {task.dailyUpdates && task.dailyUpdates.length > 0 ? (
                  task.dailyUpdates.map((up) => (
                    <div key={up.id} className="p-4 neu-raised rounded-2xl space-y-1.5">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <strong className="text-emerald-800 font-extrabold">{up.authorName}</strong>
                        <span className="text-xs text-slate-500">{up.timestamp || up.createdAt || up.date}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{up.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    لم يتم تسجيل أي ملاحظات إنجاز يومية بعد.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Checklist */}
          {activeTab === 'checklist' && (
            <div className="space-y-3.5">
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                قائمة بنود الفحص الميداني والتأكد من إنجاز متطلبات الجودة والسلامة:
              </p>
              <div className="space-y-2.5">
                {task.checklist.map((item) => (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3.5 p-4 rounded-2xl cursor-pointer transition-all ${
                      item.completed
                        ? 'neu-inset text-emerald-900'
                        : 'neu-raised hover:bg-black/[0.01] text-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => handleToggleChecklist(item.id)}
                      className="mt-0.5 w-5 h-5 accent-[#345c47] rounded cursor-pointer"
                    />
                    <span className={`text-xs sm:text-sm font-semibold ${item.completed ? 'line-through text-slate-400' : ''}`}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: History */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="border-r-2 border-emerald-800/20 pr-4 mr-2 space-y-4">
                {task.history.map((h, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -right-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-700" />
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <strong className="text-slate-800 font-extrabold">{h.action}</strong>
                      <span className="text-xs text-slate-500">{h.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">بواسطة: {h.by}</p>
                    {h.notes && (
                      <p className="text-xs text-slate-700 neu-inset-sm p-3 rounded-xl mt-1.5">
                        {h.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4.5 border-t border-black/[0.04] flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">
              المهمة: <strong className="text-slate-800 font-mono">{task.code}</strong>
            </span>
          </div>

          <Button variant="outline" size="md" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  );
};
