import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  ArrowRight, 
  Calendar, 
  User, 
  UploadCloud, 
  FileText,
  HelpCircle,
  Layers,
} from 'lucide-react';
import { Task, TaskOutcome, TaskOutcomeReason } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { Button } from '../ui/button';

interface TaskOutcomeModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onViewChain?: (task: Task) => void;
}

const OUTCOME_OPTIONS: Array<{
  id: TaskOutcome;
  title: string;
  desc: string;
  icon: React.ElementType;
  badgeBg: string;
  borderActive: string;
}> = [
  {
    id: 'completed',
    title: 'مكتملة بالكامل',
    desc: 'تم تنفيذ كافة البنود والمواصفات الميدانية بنجاح وجاهزة للاعتماد',
    icon: CheckCircle2,
    badgeBg: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    borderActive: 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20',
  },
  {
    id: 'partially_completed',
    title: 'مكتملة جزئياً',
    desc: 'تم إنجاز أجزاء من العمل وتوجد بنود معلقة تحتاج لاستكمال لاحق',
    icon: AlertTriangle,
    badgeBg: 'text-amber-700 bg-amber-50 border-amber-200',
    borderActive: 'border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20',
  },
  {
    id: 'needs_followup',
    title: 'تتطلب متابعة لاحقة',
    desc: 'تمت الزيارة الميدانية وتتطلب الإجراءات زيارة لاحقة أو موافقة إضافية',
    icon: Clock,
    badgeBg: 'text-blue-700 bg-blue-50 border-blue-200',
    borderActive: 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20',
  },
  {
    id: 'unable_to_execute',
    title: 'تعذر التنفيذ الميداني',
    desc: 'وجود مانع أمني، تقني، أو إغلاق الموقع حال دون البدء في العمل',
    icon: XCircle,
    badgeBg: 'text-rose-700 bg-rose-50 border-rose-200',
    borderActive: 'border-rose-600 bg-rose-50/50 ring-2 ring-rose-500/20',
  },
  {
    id: 'not_completed',
    title: 'غير منجزة / مؤجلة',
    desc: 'تأجيل المهمة بسبب طلب العميل أو نقص التوريدات والمعدات',
    icon: XCircle,
    badgeBg: 'neu-inset-sm text-slate-700',
    borderActive: 'neu-inset text-slate-800',
  },
];

const REASONS_LIST: Array<{ id: TaskOutcomeReason; label: string }> = [
  { id: 'client_unavailable', label: 'العميل غير متواجد / الموقع مغلق' },
  { id: 'document_missing', label: 'نقص تصاريح الدخول أو الوثائق الفنية' },
  { id: 'payment_pending', label: 'تعليق العمل بسبب تأخر الدفعة المالية' },
  { id: 'needs_approval', label: 'بانتظار موافقة الإدارة على أمر تغييري' },
  { id: 'client_postponed', label: 'طلب العميل تأجيل الموعد لوقت آخر' },
  { id: 'technical_blocker', label: 'مانع تقني أو عطل في المعدات' },
  { id: 'weather_conditions', label: 'ظروف جوية قاهرة أو حرارة شديدة' },
  { id: 'other', label: 'سبب آخر (تحديد يدوي)' },
];

export const TaskOutcomeModal: React.FC<TaskOutcomeModalProps> = ({
  task,
  isOpen,
  onClose,
  onSuccess,
  onViewChain,
}) => {
  if (!isOpen || !task) return null;

  const users = dataStore.getUsers();
  const [selectedOutcome, setSelectedOutcome] = useState<TaskOutcome>('completed');
  const [selectedReason, setSelectedReason] = useState<string>('client_unavailable');
  const [customReasonText, setCustomReasonText] = useState('');
  const [notes, setNotes] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Follow-up chain toggle & form
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const tomorrowDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [followUpTitle, setFollowUpTitle] = useState(`متابعة: ${task.title}`);
  const [followUpDate, setFollowUpDate] = useState(tomorrowDate);
  const [followUpTime, setFollowUpTime] = useState('10:00');
  const [followUpAssigneeId, setFollowUpAssigneeId] = useState(task.assigneeId);
  const [followUpNotes, setFollowUpNotes] = useState('');

  // Auto-enable follow up suggestion when outcome is incomplete
  const handleSelectOutcome = (outcome: TaskOutcome) => {
    setSelectedOutcome(outcome);
    if (outcome !== 'completed') {
      setCreateFollowUp(true);
      const reasonLabel = REASONS_LIST.find((r) => r.id === selectedReason)?.label || '';
      setFollowUpTitle(`متابعة: ${task.title} - ${reasonLabel}`);
    } else {
      setCreateFollowUp(false);
    }
  };

  const handleReasonChange = (reasonId: string) => {
    setSelectedReason(reasonId);
    const reasonObj = REASONS_LIST.find((r) => r.id === reasonId);
    if (reasonObj) {
      setFollowUpTitle(`متابعة: ${task.title} (${reasonObj.label})`);
    }
  };

  const handleSimulateUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      setProofUrl('https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop&q=80');
    }, 600);
  };

  const [createdSuccessInfo, setCreatedSuccessInfo] = useState<{
    updatedTask: Task;
    followUpTask?: Task;
  } | null>(null);

  const handleCloseModal = () => {
    setCreatedSuccessInfo(null);
    onClose();
    if (onSuccess) onSuccess();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isNonCompleted = selectedOutcome !== 'completed';
    const finalReason = isNonCompleted
      ? selectedReason === 'other'
        ? customReasonText || 'أسباب تشغيلية'
        : REASONS_LIST.find((r) => r.id === selectedReason)?.label || selectedReason
      : undefined;

    const followUpPayload = (isNonCompleted && createFollowUp) ? {
      title: followUpTitle || `متابعة: ${task.title}`,
      dueDate: followUpDate,
      dueTime: followUpTime,
      reason: finalReason,
      notes: followUpNotes,
      assigneeId: followUpAssigneeId,
      assigneeName: users.find((u) => u.id === followUpAssigneeId)?.name || task.assigneeName,
    } : undefined;

    const res = dataStore.recordTaskOutcome(task.id, {
      outcome: selectedOutcome,
      reason: finalReason,
      notes,
      proofUrl,
      followUp: followUpPayload,
    });

    if (res.followUpTask && onViewChain) {
      setCreatedSuccessInfo(res);
    } else {
      handleCloseModal();
    }
  };

  if (createdSuccessInfo) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl neu-raised text-emerald-800 flex items-center justify-center mx-auto">
            <Layers className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 font-serif">تم تسجيل النتيجة وتوليد مهمة المتابعة!</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              تم توثيق نتيجة المهمة وإدراجها ضمن شجرة المتابعة المتصلة بنجاح، وتكليف المهمة الجديدة للمسؤول الميداني.
            </p>
          </div>

          <div className="p-4 neu-inset-sm rounded-2xl text-right text-xs sm:text-sm space-y-2">
            <div className="flex justify-between items-center text-slate-600">
              <span>المهمة الأصلية:</span>
              <strong className="text-slate-800">{task.title}</strong>
            </div>
            {createdSuccessInfo.followUpTask && (
              <div className="flex justify-between items-center text-slate-600 pt-2 border-t border-black/[0.04]">
                <span>المهمة المجدولة الجديدة:</span>
                <strong className="text-emerald-800">{createdSuccessInfo.followUpTask.title}</strong>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                const targetTask = createdSuccessInfo.updatedTask || task;
                setCreatedSuccessInfo(null);
                onClose();
                if (onViewChain) onViewChain(targetTask);
              }}
              className="px-5 py-3 neu-raised rounded-2xl text-xs sm:text-sm font-extrabold text-emerald-800 hover:text-emerald-900 active:neu-inset flex items-center gap-2 cursor-pointer transition-all"
            >
              <Layers className="w-4 h-4" />
              <span>معاينة سلسلة المهام المتصلة ➔</span>
            </button>
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-5 py-3 neu-raised rounded-2xl text-xs sm:text-sm font-bold text-slate-600 hover:text-slate-800 active:neu-inset cursor-pointer transition-all"
            >
              العودة لجدول اليوم
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        id="task-outcome-modal"
        className="neu-raised-lg bg-[#EAF0EC] rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-black/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl neu-raised text-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-slate-800 font-serif">تسجيل مخرجات ونواتج المهمة الميدانية</h3>
              <p className="text-xs text-slate-600 line-clamp-1 max-w-md">{task.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl neu-raised text-slate-500 hover:text-slate-800 active:neu-inset flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Requirement Info */}
          {task.proofRequired && (
            <div className="p-4 neu-inset-sm rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-slate-800">
              <HelpCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold text-slate-900">الإثبات المطلوب عند الإنجاز: </span>
                {task.proofRequired}
              </div>
            </div>
          )}

          {/* Outcome Options Selection */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2.5">
              الحالة النهائية لتنفيذ المهمة <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {OUTCOME_OPTIONS.map((opt) => {
                const IconComponent = opt.icon;
                const isSelected = selectedOutcome === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectOutcome(opt.id)}
                    className={`text-right p-4 rounded-2xl transition-all flex items-start gap-3.5 cursor-pointer ${
                      isSelected
                        ? 'neu-inset text-emerald-900 bg-[#EAF0EC]'
                        : 'neu-raised hover:bg-black/[0.01]'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl neu-raised shrink-0 text-emerald-800">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm text-slate-800 flex items-center justify-between">
                        <span>{opt.title}</span>
                        {isSelected && (
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mandatory Reason for Incomplete Outcomes */}
          {selectedOutcome !== 'completed' && (
            <div className="p-4 neu-raised rounded-2xl space-y-3 animate-in fade-in duration-200">
              <label className="block text-xs font-extrabold text-slate-800">
                سبب عدم الإكمال أو التعثر (إلزامي للتوثيق والمتابعة) <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedReason}
                onChange={(e) => handleReasonChange(e.target.value)}
                className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
              >
                {REASONS_LIST.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              {selectedReason === 'other' && (
                <input
                  type="text"
                  placeholder="أدخل السبب بالتفصيل..."
                  value={customReasonText}
                  onChange={(e) => setCustomReasonText(e.target.value)}
                  className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                  required
                />
              )}
            </div>
          )}

          {/* Follow-up Chain Section */}
          {selectedOutcome !== 'completed' && (
            <div className="p-4 sm:p-5 neu-raised rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl neu-raised text-emerald-800 flex items-center justify-center">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">
                      إنشاء حلقة متابعة مجدولة تلقائياً (Task Chain)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      ترحيل العمل لموعد لاحق وربطه بسلسلة المهمة الأصلية
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createFollowUp}
                    onChange={(e) => setCreateFollowUp(e.target.checked)}
                    className="w-5 h-5 accent-[#345c47] rounded cursor-pointer"
                  />
                </label>
              </div>

              {createFollowUp && (
                <div className="space-y-3.5 pt-3 border-t border-black/[0.04] animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      عنوان مهمة المتابعة المجدولة
                    </label>
                    <input
                      type="text"
                      value={followUpTitle}
                      onChange={(e) => setFollowUpTitle(e.target.value)}
                      className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        تاريخ المتابعة
                      </label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        الوقت المقترح
                      </label>
                      <input
                        type="time"
                        value={followUpTime}
                        onChange={(e) => setFollowUpTime(e.target.value)}
                        className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        المسؤول المكلّف
                      </label>
                      <select
                        value={followUpAssigneeId}
                        onChange={(e) => setFollowUpAssigneeId(e.target.value)}
                        className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 font-semibold focus:outline-hidden"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.roleTitleAr})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      ملاحظات خاصة لمسؤول المتابعة
                    </label>
                    <input
                      type="text"
                      placeholder="تعليمات إضافية لإنجاز المهمة..."
                      value={followUpNotes}
                      onChange={(e) => setFollowUpNotes(e.target.value)}
                      className="w-full neu-inset px-4 py-2.5 min-h-[46px] rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proof / Document Attachment */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              إرفاق صورة الإثبات أو محضر الاستلام
            </label>
            {proofUrl ? (
              <div className="p-3.5 neu-raised rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-emerald-800 font-bold">
                  <FileText className="w-4.5 h-4.5 text-emerald-700" />
                  <span>تم إرفاق مستند الإثبات الميداني بنجاح</span>
                </div>
                <button
                  type="button"
                  onClick={() => setProofUrl('')}
                  className="text-xs text-rose-600 hover:text-rose-800 font-extrabold neu-raised px-3 py-1.5 rounded-xl cursor-pointer"
                >
                  حذف
                </button>
              </div>
            ) : (
              <div 
                onClick={handleSimulateUpload}
                className="neu-inset p-5 rounded-2xl text-center cursor-pointer transition-all"
              >
                <UploadCloud className="w-7 h-7 text-emerald-700 mx-auto mb-1.5" />
                <p className="text-xs sm:text-sm font-bold text-slate-800">
                  {isUploading ? 'جاري رفع الملف...' : 'اضغط لإرفاق صورة أو مستند الإثبات'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">PNG, JPG, PDF حتى 10 ميغابايت</p>
              </div>
            )}
          </div>

          {/* General Notes */}
          <div>
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
              ملاحظات وتفاصيل التتقرير النهائي
            </label>
            <textarea
              rows={2}
              placeholder="اكتب ملخصاً لما تم إنجازه في الموقع أو الإشكاليات الميدانية..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full neu-inset px-4 py-3 rounded-2xl text-xs sm:text-sm text-slate-800 focus:outline-hidden"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4.5 border-t border-black/[0.04] flex items-center justify-between">
          <Button
            variant="outline"
            size="md"
            type="button"
            onClick={onClose}
          >
            إلغاء
          </Button>
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={handleSubmit}
            icon={<CheckCircle2 className="w-4 h-4 ml-1" />}
          >
            {selectedOutcome === 'completed'
              ? 'تأكيد الإنجاز ورفع للاعتماد'
              : createFollowUp
              ? 'حفظ النتيجة وإنشاء مهمة المتابعة'
              : 'حفظ وتحديث النتيجة'}
          </Button>
        </div>
      </div>
    </div>
  );
};
