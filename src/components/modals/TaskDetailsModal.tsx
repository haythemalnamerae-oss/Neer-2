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
  UploadCloud,
  FileText,
  Image,
  Trash2,
} from 'lucide-react';
import { Task, TaskStatus, TaskStepStatus } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import {
  addTaskComment, addTaskDailyUpdate, addTaskSubtask, configureTaskStep, reviewTaskStep, reviewTaskSubtask, deleteTaskAttachmentOnServer,
  getTaskAttachmentSignedUrl, refreshTaskSnapshot, setChecklistItem,
  setTaskStepStatus, updateTaskLifecycle, updateTaskSubtaskStatus, updateTaskStatusOnServer, uploadTaskAttachment,
} from '../../services/tasks.api';
import { captureRequiredLocation, ensureFieldVisitCanStart, recordFieldLifecycleEvent, recordTaskEvent, startFieldLocationTracking, stopFieldLocationTracking, type FieldEventType } from '../../lib/operations/fieldEvents';
import { formatCurrency, TASK_STATUS_CONFIG, TASK_PRIORITY_CONFIG } from '../../lib/utils/format';
import { hasPermission } from '../../lib/rbac/permissions';
import { FinanceApiService } from '../../services/finance-api.service';
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
  const [activeTab, setActiveTab] = useState<'details' | 'steps' | 'subtasks' | 'daily_updates' | 'checklist' | 'attachments' | 'comments' | 'history'>('details');
  const [isPausePromptOpen, setIsPausePromptOpen] = useState(false);
  const [pauseReasonInput, setPauseReasonInput] = useState('');
  const [dailyNoteInput, setDailyNoteInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [newSubTaskAssignee, setNewSubTaskAssignee] = useState('');
  const [stepNoteInputs, setStepNoteInputs] = useState<Record<string, string>>({});
  const [deferringStepId, setDeferringStepId] = useState<string | null>(null);
  const [deferredDateInput, setDeferredDateInput] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isReviewingTask, setIsReviewingTask] = useState(false);

  // Attachment states
  const [attachmentDocType, setAttachmentDocType] = useState('فاتورة شراء');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  if (!isOpen || !task) return null;

  const currentUser = dataStore.getCurrentUser();
  const canEditTask = hasPermission(currentUser.role, 'tasks', 'edit');
  const canApproveTask = hasPermission(currentUser.role, 'tasks', 'approve');
  const requiresFieldLocation = task.taskTypeCategory === 'field' || task.taskTypeCategory === 'visit';
  const users = dataStore.getUsers();
  const allExpenses = dataStore.getExpenses();
  const taskExpenses = allExpenses.filter((e) => e.taskId === task.id);

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

  const getFieldEventType = (action: 'started' | 'paused' | 'resumed' | 'completed'): Extract<FieldEventType, 'visit_started' | 'visit_paused' | 'visit_resumed' | 'visit_completed' | 'task_started' | 'task_paused' | 'task_resumed' | 'task_completed'> => {
    const visit = task.taskTypeCategory === 'visit';
    return visit
      ? ({ started: 'visit_started', paused: 'visit_paused', resumed: 'visit_resumed', completed: 'visit_completed' } as const)[action]
      : ({ started: 'task_started', paused: 'task_paused', resumed: 'task_resumed', completed: 'task_completed' } as const)[action];
  };

  const handleStartTask = async () => {
    setIsLocating(true);
    try {
      if (!requiresFieldLocation) {
        await updateTaskLifecycle(task.id, 'start');
      } else {
        await ensureFieldVisitCanStart();
        const location = await captureRequiredLocation();
        await recordFieldLifecycleEvent({
          taskId: task.id,
          eventType: getFieldEventType('started'),
          eventLabel: task.taskTypeCategory === 'visit' ? 'بدء الزيارة' : 'بدء المهمة الميدانية',
          location,
          details: { taskTitle: task.title },
        });
        await refreshTaskSnapshot();
        startFieldLocationTracking(task.id);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر توثيق الموقع والبدء.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleConfirmPause = async () => {
    if (!pauseReasonInput.trim()) {
      alert('يرجى تدوين سبب إيقاف المهمة مؤقتاً');
      return;
    }
    setIsLocating(true);
    try {
      if (!requiresFieldLocation) {
        await updateTaskLifecycle(task.id, 'pause', pauseReasonInput.trim());
      } else {
        const location = await captureRequiredLocation();
        await recordFieldLifecycleEvent({
          taskId: task.id,
          eventType: getFieldEventType('paused'),
          eventLabel: 'إيقاف مؤقت',
          location,
          details: { reason: pauseReasonInput.trim() },
        });
        await refreshTaskSnapshot();
        stopFieldLocationTracking(task.id);
      }
      setIsPausePromptOpen(false);
      setPauseReasonInput('');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر توثيق الإيقاف المؤقت.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleReviewTask = async (action: 'approve' | 'reject') => {
    if (!task || !canApproveTask || task.creatorId === currentUser.id || task.status !== 'pending_approval' || isReviewingTask) return;
    const reason = action === 'reject' ? window.prompt('اذكر سبب إعادة المهمة للتنفيذ:') : undefined;
    if (action === 'reject' && !reason?.trim()) return;
    setIsReviewingTask(true);
    try {
      await updateTaskStatusOnServer(task.id, action === 'approve' ? 'approved' : 'rejected', reason);
      await refreshTaskSnapshot();
      window.alert(action === 'approve' ? 'تم اعتماد إنجاز المهمة.' : 'أعيدت المهمة إلى التنفيذ مع حفظ سبب الرفض.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذرت مراجعة المهمة.');
    } finally {
      setIsReviewingTask(false);
    }
  };

  const handleResumeTask = async () => {
    setIsLocating(true);
    try {
      if (!requiresFieldLocation) {
        await updateTaskLifecycle(task.id, 'resume');
      } else {
        await ensureFieldVisitCanStart();
        const location = await captureRequiredLocation();
        await recordFieldLifecycleEvent({
          taskId: task.id,
          eventType: getFieldEventType('resumed'),
          eventLabel: 'استئناف العمل الميداني',
          location,
        });
        await refreshTaskSnapshot();
        startFieldLocationTracking(task.id);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر توثيق الاستئناف.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleAddDailyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyNoteInput.trim()) return;
    try {
      await addTaskDailyUpdate(task.id, dailyNoteInput.trim(), { id: currentUser.id, name: currentUser.name });
      setDailyNoteInput('');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر حفظ التقرير اليومي.');
    }
  };

  const handleStepStatusChange = async (stepId: string, status: TaskStepStatus, nextDate?: string, noteOverride?: string): Promise<boolean> => {
    try {
      const note = noteOverride ?? stepNoteInputs[stepId];
      await setTaskStepStatus(task.id, stepId, status, note, nextDate);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر تحديث المرحلة.');
      return false;
    }
  };

  const handleConfirmDeferStep = async (stepId: string) => {
    if (!deferredDateInput) {
      alert('يرجى تحديد تاريخ الخطوة القادمة');
      return;
    }
    const saved = await handleStepStatusChange(stepId, 'deferred', deferredDateInput, stepNoteInputs[stepId] || 'تم تأجيل الخطوة للموعد المحدد');
    if (!saved) return;
    setDeferringStepId(null);
    setDeferredDateInput('');
  };

  const handleAddSubTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTaskTitle.trim()) return;
    const assignee = users.find((u) => u.id === newSubTaskAssignee) || currentUser;
    try {
      const location = requiresFieldLocation ? await captureRequiredLocation() : null;
      await addTaskSubtask(task.id, {
        title: newSubTaskTitle.trim(),
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        status: 'scheduled',
        requiresApproval: true,
        isApproved: false,
      });
      const createdTitle = newSubTaskTitle.trim();
      setNewSubTaskTitle('');
      if (location) {
        try {
          await recordTaskEvent({
            taskId: task.id,
            standingAccountId: task.standingAccountId,
            eventType: 'subtask_created',
            eventLabel: 'إضافة مهمة فرعية أثناء التنفيذ',
            location,
            details: { title: createdTitle, assigneeId: assignee.id, assigneeName: assignee.name },
          });
        } catch (eventError) {
          window.alert(eventError instanceof Error
            ? `تم حفظ المهمة الفرعية، لكن تعذر تسجيل حدث الموقع: ${eventError.message}`
            : 'تم حفظ المهمة الفرعية، لكن تعذر تسجيل حدث الموقع.');
        }
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر حفظ المهمة الفرعية.');
    }
  };

  const handleToggleChecklist = async (itemId: string) => {
    const item = task.checklist.find((entry) => entry.id === itemId);
    if (!item) return;
    try {
      await setChecklistItem(task.id, itemId, !item.completed);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر تحديث بند الفحص.');
    }
  };

  const handleCoverDeficit = async (expenseId: string) => {
    try {
      await FinanceApiService.coverDeficit(expenseId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر تغطية العجز من الصندوق.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      await addTaskComment(task.id, commentInput.trim(), {
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar,
        role: currentUser.roleTitleAr || currentUser.role,
      }, [], isInternalComment);
      setCommentInput('');
      setIsInternalComment(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر حفظ التعليق.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleOpenAttachment = async (objectPath: string) => {
    const popup = window.open('about:blank', '_blank');
    try {
      const legacyUrl = objectPath.startsWith('https://') || objectPath.startsWith('http://') ||
        objectPath.startsWith('data:image/') || objectPath.startsWith('data:application/pdf');
      const url = legacyUrl ? objectPath : await getTaskAttachmentSignedUrl(objectPath);
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (error) {
      popup?.close();
      window.alert(error instanceof Error ? error.message : 'تعذر فتح المرفق.');
    }
  };

  const handleDeleteAttachment = async (attachmentId: string, objectPath: string) => {
    if (!window.confirm('هل تريد حذف هذا المرفق نهائياً؟')) return;
    try {
      await deleteTaskAttachmentOnServer(task.id, attachmentId, objectPath);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر حذف المرفق.');
    }
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
                  {task.geoCoordinates && (
                    <a
                      href={task.mapsUrl || `https://www.google.com/maps?q=${task.geoCoordinates.lat},${task.geoCoordinates.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] neu-raised text-emerald-800 hover:text-emerald-950 px-2 py-0.5 rounded-md font-extrabold flex items-center gap-1"
                      title="عرض موقع التنفيذ الميداني على خرائط جوجل"
                    >
                      <span>📍 موقع GPS موثق</span>
                    </a>
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
                  disabled={isLocating}
                  icon={<Play className="w-4 h-4 ml-1" />}
                >
                  {isLocating ? 'جارٍ تحديد الموقع...' : 'بدء المهمة'}
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

          {task.status === 'pending_approval' && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <strong className="block text-sm text-amber-950">المهمة بانتظار مراجعة الإنجاز</strong>
                <p className="text-xs text-amber-800 mt-1">لا تُعد المهمة مكتملة نهائيًا حتى يراجعها مسؤول مخوّل ويعتمدها أو يعيدها مع سبب واضح.</p>
              </div>
              {canApproveTask && task.creatorId !== currentUser.id ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="success" disabled={isReviewingTask} onClick={() => void handleReviewTask('approve')}>
                    {isReviewingTask ? 'جارٍ الحفظ...' : 'اعتماد الإنجاز'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isReviewingTask} onClick={() => void handleReviewTask('reject')}>
                    إعادة للتنفيذ
                  </Button>
                </div>
              ) : (
                <span className="text-xs font-bold text-amber-800">بانتظار مراجعة مستخدم مخوّل غير منشئ المهمة</span>
              )}
            </div>
          )}

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
                {task.assignees && task.assignees.length > 1 && (
                  <span className="block text-[10px] text-slate-500 mt-1">
                    فريق التنفيذ: {task.assignees.map((assignee) => users.find((user) => user.id === assignee.appUserId)?.name || assignee.name || assignee.appUserId).join('، ')}
                  </span>
                )}
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
            onClick={() => setActiveTab('attachments')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'attachments' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>المستندات والفواتير ({task.attachments ? task.attachments.length : 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('comments')}
            className={`py-2 px-3.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'comments' ? 'neu-raised text-emerald-800 font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>المناقشات ({task.comments?.length || 0})</span>
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

              {/* Linked Expenses Breakdown with Deficit Reconciliation */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  المصروفات والفواتير المرتبطة بالمهمة ({taskExpenses.length})
                </h4>

                {taskExpenses.length > 0 ? (
                  <div className="space-y-2">
                    {taskExpenses.map((exp) => (
                      <div key={exp.id} className="p-3.5 neu-raised rounded-2xl flex items-center justify-between flex-wrap gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs sm:text-sm text-slate-800">{exp.description}</span>
                            <span className="text-[11px] neu-inset-sm px-2 py-0.5 rounded-md text-slate-600 font-mono">
                              فاتورة #{exp.invoiceNumber}
                            </span>
                            {exp.isDeficit && !exp.isCoveredFromCash && (
                              <span className="text-[10px] bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-md font-black animate-pulse">
                                عجز سالب: {formatCurrency(exp.deficitAmount || 0)}
                              </span>
                            )}
                            {exp.isDeficit && exp.isCoveredFromCash && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md font-bold">
                                تمت التغطية من الصندوق
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                            <span>العهدة: {exp.fundName}</span>
                            <span>المورد: {exp.vendorName}</span>
                            <span>التاريخ: {exp.submittedAt}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono font-black text-sm text-slate-800 dir-ltr">
                            {formatCurrency(exp.totalWithTax)}
                          </span>
                          {exp.isDeficit && !exp.isCoveredFromCash && (
                            <button
                              type="button"
                              onClick={() => {
                                void handleCoverDeficit(exp.id);
                              }}
                              className="neu-raised px-3 py-1.5 rounded-xl text-xs font-black text-emerald-800 hover:text-emerald-950 active:neu-inset transition-all cursor-pointer"
                            >
                              تغطية المبلغ من الصندوق
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="neu-inset-sm p-4 rounded-2xl text-center text-xs text-slate-500">
                    لم يتم تسجيل مصروفات أو فواتير لهذه المهمة بعد.
                  </div>
                )}
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
                            <button
                              onClick={() => {
                                setDeferringStepId(step.id);
                                setDeferredDateInput(step.nextStepDate || new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                              }}
                              className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                                step.status === 'deferred'
                                  ? 'neu-inset text-amber-700'
                                  : 'neu-raised text-slate-600 hover:text-amber-700'
                              }`}
                              title="أُجلت (تحديد موعد الخطوة القادمة)"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Inline Deferral Date Picker if active */}
                        {deferringStepId === step.id && (
                          <div className="p-3 neu-inset-sm rounded-2xl space-y-2 mt-2 bg-amber-50/50">
                            <span className="text-xs font-bold text-amber-900 block">
                              تأجيل المرحلة وتحديد موعد الخطوة القادمة:
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="date"
                                value={deferredDateInput}
                                onChange={(e) => setDeferredDateInput(e.target.value)}
                                className="neu-inset px-3 py-1.5 rounded-xl text-xs text-slate-800 font-mono"
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleConfirmDeferStep(step.id)}
                              >
                                تأكيد التأجيل
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeferringStepId(null)}
                              >
                                إلغاء
                              </Button>
                            </div>
                          </div>
                        )}

                        {step.approvalStatus === 'pending' && (
                          <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3">
                            <span className="text-xs font-bold text-amber-900">المرحلة تنتظر الاعتماد</span>
                            {canApproveTask && <>
                              <Button size="sm" variant="primary" onClick={() => void reviewTaskStep(task.id, step.id, 'approve').catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر اعتماد المرحلة.'))}>اعتماد</Button>
                              <Button size="sm" variant="outline" onClick={() => { const reason = window.prompt('سبب رفض المرحلة:'); if (reason?.trim()) void reviewTaskStep(task.id, step.id, 'reject', reason).catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر رفض المرحلة.')); }}>إعادة للتنفيذ</Button>
                            </>}
                          </div>
                        )}
{canEditTask && canApproveTask && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl neu-inset-sm p-3">
                          <label className="text-[11px] font-bold text-slate-600">المسؤول عن المرحلة
                            <select className="mt-1 w-full" value={step.assignedTo || task.assigneeId} onChange={(e) => void configureTaskStep(task.id, step.id, { assigneeId: e.target.value || null, dependsOnStepId: step.dependsOnStepId || null, approvalRequired: Boolean(step.approvalRequired) }).catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر تعيين المرحلة.'))}>
                              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                            </select>
                          </label>
                          <label className="text-[11px] font-bold text-slate-600">تعتمد على مرحلة
                            <select className="mt-1 w-full" value={step.dependsOnStepId || ''} onChange={(e) => void configureTaskStep(task.id, step.id, { assigneeId: step.assignedTo || task.assigneeId, dependsOnStepId: e.target.value || null, approvalRequired: Boolean(step.approvalRequired) }).catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر حفظ الاعتمادية.'))}>
                              <option value="">لا توجد</option>
                              {task.steps?.filter((candidate) => candidate.id !== step.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                            <input type="checkbox" checked={Boolean(step.approvalRequired)} onChange={(e) => void configureTaskStep(task.id, step.id, { assigneeId: step.assignedTo || task.assigneeId, dependsOnStepId: step.dependsOnStepId || null, approvalRequired: e.target.checked }).catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر حفظ إعداد الاعتماد.'))}/>
                            تتطلب اعتمادًا بعد الإنجاز
                          </label>
                        </div>
                        )}



                        {/* Step Details & Notes */}
                        <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-black/[0.04] flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span>
                              {step.completedAt ? `تاريخ الإنجاز: ${step.completedAt}` : 'لم تكتمل بعد'}
                            </span>
                            {step.nextStepDate && (
                              <span className="text-amber-800 neu-raised px-2.5 py-0.5 rounded-lg font-bold">
                                📅 موعد الخطوة القادمة: {step.nextStepDate}
                              </span>
                            )}
                          </div>
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
                          onChange={async () => {
                            try { await updateTaskSubtaskStatus(task.id, st.id, st.status === 'completed' ? 'scheduled' : 'completed'); }
                            catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر تحديث المهمة الفرعية.'); }
                          }}
                          disabled={st.approvalStatus === 'pending' || st.approvalStatus === 'rejected'}
                          className="w-5 h-5 accent-[#345c47] rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <span className={`font-semibold ${st.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {st.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-xs">المكلف: <strong className="text-slate-700">{st.assigneeName}</strong></span>
                        {st.requiresApproval && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl ${st.approvalStatus === 'approved' || st.isApproved ? 'neu-raised text-emerald-800' : 'neu-inset-sm text-amber-800'}`}>
                            {st.approvalStatus === 'approved' || st.isApproved ? 'معتمد' : st.approvalStatus === 'rejected' ? 'مرفوض' : 'بانتظار الاعتماد'}
                          </span>
                        )}
                        {st.approvalStatus === 'pending' && canApproveTask && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="primary" onClick={() => void reviewTaskSubtask(task.id, st.id, 'approve').catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر اعتماد المهمة الفرعية.'))}>اعتماد</Button>
                            <Button size="sm" variant="outline" onClick={() => { const reason = window.prompt('سبب رفض المهمة الفرعية:'); if (reason?.trim()) void reviewTaskSubtask(task.id, st.id, 'reject', reason).catch((error) => window.alert(error instanceof Error ? error.message : 'تعذر رفض المهمة الفرعية.')); }}>رفض</Button>
                          </div>
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

          {/* TAB 6: Attachments & Documents */}
          {activeTab === 'attachments' && (
            <div className="space-y-5">
              <div className="p-4 sm:p-5 rounded-2xl neu-inset-sm space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-emerald-800" />
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-800">
                      رفع مستند للمهمة (فاتورة شراء، إشعار بنكي، محضر تسليم)
                    </h4>
                  </div>
                  <select
                    value={attachmentDocType}
                    onChange={(e) => setAttachmentDocType(e.target.value)}
                    className="neu-inset px-3 py-1.5 rounded-xl text-xs text-slate-700 font-semibold"
                  >
                    <option value="فاتورة شراء">فاتورة شراء</option>
                    <option value="إشعار بنكي">إشعار بنكي / إيداع</option>
                    <option value="محضر استلام وتسليم">محضر استلام وتسليم</option>
                    <option value="تقرير فحص ومعاينة">تقرير فحص ومعاينة</option>
                    <option value="مستند آخر">مستند آخر</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-emerald-800/30 hover:border-emerald-800/60 bg-white/60 transition cursor-pointer text-xs font-bold text-emerald-900">
                    <UploadCloud className="w-4 h-4 text-emerald-700" />
                    <span>اختر ملف من جهازك (صورة، فاتورة، PDF)...</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={isUploadingDoc}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setIsUploadingDoc(true);
                        try {
                          await uploadTaskAttachment(task.id, file, `${attachmentDocType} - ${file.name}`, currentUser.name);
                        } catch (error) {
                          window.alert(error instanceof Error ? error.message : 'تعذر رفع المرفق.');
                        } finally {
                          setIsUploadingDoc(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Attachments List */}
              <div className="space-y-3">
                <h5 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  المستندات المرفقة بهذه المهمة ({task.attachments ? task.attachments.length : 0}):
                </h5>

                {task.attachments && task.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {task.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="p-3.5 rounded-2xl neu-raised flex items-start gap-3 bg-white"
                      >
                        {att.type === 'image' && att.url.startsWith('data:') ? (
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-11 h-11 rounded-xl neu-inset-sm text-emerald-800 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-1">
                          <strong className="text-xs font-bold text-slate-800 block truncate">
                            {att.name}
                          </strong>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span>{att.size}</span>
                            <span>•</span>
                            <span>بواسطة: {att.uploadedBy}</span>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void handleOpenAttachment(att.url)}
                              className="text-[11px] font-bold text-emerald-800 hover:underline"
                            >
                              معاينة / تحميل
                            </button>
                            <button
                              onClick={() => void handleDeleteAttachment(att.id, att.url)}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer mr-auto"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    لم يتم إرفاق أي مستندات أو فواتير بعد. يمكنك رفع صورة الفاتورة أو إشعار البنك من المربع أعلاه.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: Comments */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {(task.comments || []).length > 0 ? task.comments!.map((comment) => (
                  <div key={comment.id} className="neu-raised rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-xs sm:text-sm text-slate-800">{comment.authorName}</strong>
                      <span className="text-[10px] text-slate-500">{comment.createdAt ? new Date(comment.createdAt).toLocaleString('ar') : ''}</span>
                    </div>
                    {comment.isInternal && <Badge variant="warning" size="sm">داخلي للإدارة</Badge>}
                    <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap">{comment.text}</p>
                  </div>
                )) : (
                  <div className="neu-inset-sm rounded-2xl p-5 text-center text-xs text-slate-500">لا توجد مناقشات مسجلة لهذه المهمة.</div>
                )}
              </div>
              <form onSubmit={handleAddComment} className="neu-inset-sm rounded-2xl p-4 space-y-3">
                <label className="block text-xs font-extrabold text-slate-700">إضافة تعليق أو تحديث للفريق</label>
                <textarea
                  rows={3}
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="اكتب ملاحظة أو استفساراً مرتبطاً بالمهمة..."
                  className="w-full neu-inset rounded-xl p-3 text-xs sm:text-sm text-slate-800"
                  required
                />
                {(currentUser.role === 'admin' || currentUser.role === 'ops_manager') && (
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={isInternalComment} onChange={(e) => setIsInternalComment(e.target.checked)} />
                    تعليق داخلي للإدارة فقط
                  </label>
                )}
                <div className="flex justify-end">
                  <Button type="submit" variant="primary" size="sm" disabled={!commentInput.trim() || isSubmittingComment}>{isSubmittingComment ? "جارٍ الإرسال..." : "إرسال التعليق"}</Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 8: History */}
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
