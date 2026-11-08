import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  User,
  Plus,
  ArrowRight,
  Layers,
  Sparkles,
  Phone,
  Flame,
  Filter,
  Wallet,
  Receipt,
  Play,
  Pause,
} from 'lucide-react';
import { Task } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';

interface DailyCommandCenterViewProps {
  onOpenNewTask: () => void;
  onOpenNewExpense: (taskId?: string) => void;
  onSelectTask: (task: Task) => void;
  onRecordOutcome: (task: Task) => void;
  onViewChain: (task: Task) => void;
  onSelectView: (view: string) => void;
}

export const DailyCommandCenterView: React.FC<DailyCommandCenterViewProps> = ({
  onOpenNewTask,
  onOpenNewExpense,
  onSelectTask,
  onRecordOutcome,
  onViewChain,
  onSelectView,
}) => {
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('active');
  const [dailyScore, setDailyScore] = useState<number | null>(8);

  const currentUser = dataStore.getCurrentUser();
  const tasks = dataStore.getTasks();
  const funds = dataStore.getFunds();
  const expenses = dataStore.getExpenses();

  // Find critical fund for current user or overall team
  const userFund = funds.find((f) => f.holderId === currentUser.id);
  const criticalFund = userFund && (userFund.status === 'warning' || userFund.status === 'depleted')
    ? userFund
    : funds.find((f) => f.status === 'warning' || f.status === 'depleted');

  // Daily statistics
  const totalTasks = tasks.length;
  const completedToday = tasks.filter((t) => (t.status === 'completed' || t.status === 'approved')).length;
  const inProgressToday = tasks.filter((t) => t.status === 'in_progress' || t.status === 'started').length;
  const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed' && t.status !== 'approved');
  const followUpTasks = tasks.filter((t) => t.taskChain && t.taskChain.length > 0);
  const pendingApprovals = tasks.filter((t) => t.status === 'pending_approval');

  // Filter tasks for the main daily feed
  const filteredTasks = tasks.filter((task) => {
    if (selectedPriorityFilter !== 'all' && task.priority !== selectedPriorityFilter) return false;
    if (selectedStatusFilter === 'active') {
      return task.status !== 'completed' && task.status !== 'approved' && task.status !== 'cancelled';
    }
    if (selectedStatusFilter === 'completed') {
      return task.status === 'completed' || task.status === 'approved';
    }
    if (selectedStatusFilter === 'urgent') {
      return task.priority === 'urgent';
    }
    return true;
  });

  const handleStartTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dataStore.startTask(taskId);
  };

  const handlePauseTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const reason = window.prompt('يرجى كتابة سبب الإيقاف المؤقت (مثال: انتظار استلام المواد):', 'انتظار الموافقة / توريد المواد');
    if (reason !== null) {
      dataStore.pauseTask(taskId, reason);
    }
  };

  const handleResumeTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dataStore.resumeTask(taskId);
  };

  const handleAddDailyNote = () => {
    const note = window.prompt(
      'أدخل ملخص الإنجاز اليومي أو المعوقات الميدانية لرفعها في التقرير:',
      'تم تنفيذ كافة المهام الميدانية وفق الجدول المعتمد وتسوية الفواتير.'
    );
    if (note) {
      dataStore.addNotification({
        title: 'تقرير إنجاز يومي جديد',
        message: `رفع ${currentUser.name} تقييم العمليات اليومية (${dailyScore || 8}/10): ${note}`,
        type: 'info',
        targetView: 'daily',
      });
      alert('تم حفظ تقرير الإنجاز اليومي وإرساله للإدارة بنجاح!');
    }
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Hero Operational Banner: Forest Green Master Card */}
      <div
        className="rounded-[28px] p-6 sm:p-8 relative overflow-hidden transition-all text-white shadow-xl"
        style={{
          backgroundColor: '#2A443B',
          boxShadow: '0 20px 45px rgba(22, 44, 34, 0.28), 0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Subtle radial emerald ambient glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>مركز العمليات الميدانية والسيطرة اليومية</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white font-serif-hero tracking-tight leading-[1.15]">
              جدول مهام اليوم وحلقات المتابعة والرقابة المالية
            </h1>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed font-sans-inter">
              متابعة حية ومباشرة لتنفيذ المهام، رصد وقت البداية والانتهاء الفعلي، تسوية المصروفات، وتغطية العهد النقدية لحظياً.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto z-10">
            <button
              onClick={() => onOpenNewExpense()}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-bold font-sans-inter transition-all border border-white/20 cursor-pointer shadow-xs active:scale-95"
            >
              <span>تسجيل فاتورة</span>
            </button>
            <button
              onClick={onOpenNewTask}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#F4F7F5] hover:bg-white text-[#2A443B] text-xs sm:text-sm font-bold font-sans-inter transition-all shadow-md cursor-pointer active:scale-95"
            >
              <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
              <span>مهمة جديدة</span>
            </button>
          </div>
        </div>

        {/* Floating Quick Stats in Banner with Translucent Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/15 text-xs sm:text-sm relative z-10">
          <div className="rounded-2xl p-4 bg-white/10 border border-white/10 backdrop-blur-xs transition hover:bg-white/15">
            <span className="text-white/70 block text-xs font-medium">المهام النشطة الآن</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-sans-inter mt-1.5 block">
              {inProgressToday}
            </span>
          </div>
          <div className="rounded-2xl p-4 bg-white/10 border border-white/10 backdrop-blur-xs transition hover:bg-white/15">
            <span className="text-amber-300 block text-xs font-medium">مهام طارئة وحرجة</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-300 font-sans-inter mt-1.5 block">
              {urgentTasks.length}
            </span>
          </div>
          <div className="rounded-2xl p-4 bg-white/10 border border-white/10 backdrop-blur-xs transition hover:bg-white/15">
            <span className="text-emerald-300 block text-xs font-medium">المكتملة اليوم</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-sans-inter mt-1.5 block">
              {completedToday}
            </span>
          </div>
          <div className="rounded-2xl p-4 bg-white/10 border border-white/10 backdrop-blur-xs transition hover:bg-white/15">
            <span className="text-sky-300 block text-xs font-medium">حلقات المتابعة</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-sky-300 font-sans-inter mt-1.5 block">
              {followUpTasks.length}
            </span>
          </div>
        </div>
      </div>

      {/* Urgent Warning Alert (if any) */}
      {urgentTasks.length > 0 && (
        <div className="neu-inset rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-4 text-[#8A3A30]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl neu-button text-[#9C3F33] flex items-center justify-center shrink-0">
              <Flame className="w-6 h-6 stroke-[2.2] animate-pulse" />
            </div>
            <div>
              <h4 className="font-bold text-sm sm:text-base text-[#752820]">
                تنبيه تشغيلي: {urgentTasks.length} مهام ميدانية ذات أولوية قصوى تتطلب إنجازاً عاجلاً اليوم
              </h4>
              <p className="text-xs sm:text-sm text-[#8D4136] mt-1 font-medium">
                أقرب استحقاق: {urgentTasks[0].title} للمسؤول {urgentTasks[0].assigneeName} ({urgentTasks[0].location})
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setSelectedPriorityFilter('urgent')}
            className="text-xs sm:text-sm shrink-0 font-bold min-h-[42px]"
          >
            تصفية الطارئة
          </Button>
        </div>
      )}

      {/* Petty Cash Liquidity Warning Alert (if any fund is critical) */}
      {criticalFund && (
        <div className="neu-inset rounded-3xl p-4 sm:p-5 flex items-center justify-between gap-4 text-[#734A15]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl neu-button text-[#84561C] flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-3 py-1 rounded-full neu-raised-sm text-[#84561C] uppercase">
                  إنذار سيولة عهدة
                </span>
                <h4 className="font-bold text-sm sm:text-base truncate text-[#643E0F]">
                  رصيد عهدة "{criticalFund.name}" قارب على النفاد ({criticalFund.holderName})
                </h4>
              </div>
              <p className="text-xs sm:text-sm text-[#7D521E] mt-1 font-medium">
                الرصيد المتبقي: <strong className="font-mono">{formatCurrency(criticalFund.currentBalance, criticalFund.currency)}</strong> من أصل {formatCurrency(criticalFund.totalAllocation, criticalFund.currency)} (استهلاك {Math.round((criticalFund.spentBalance / (criticalFund.totalAllocation || 1)) * 100)}%).
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectView('funds')}
            className="text-xs sm:text-sm shrink-0 font-bold min-h-[42px]"
          >
            إدارة وتغذية
          </Button>
        </div>
      )}

      {/* Main Grid: Daily Tasks List + Left Operational Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* Daily Tasks Feed (8 Cols) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Filter Bar with florest-style pill tabs and circular count badges */}
          <div className="inner-white-card p-3.5 sm:p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 pl-2 text-xs font-bold text-slate-700">
                <Filter className="w-4 h-4 text-[#2A443B] stroke-[2.2]" />
                <span className="hidden sm:inline">تصفية:</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'active', label: 'النشطة', count: inProgressToday },
                  { id: 'urgent', label: 'الطارئة', count: urgentTasks.length },
                  { id: 'completed', label: 'المكتملة', count: completedToday },
                  { id: 'all', label: 'الكل', count: totalTasks },
                ].map((st) => {
                  const isSelected = selectedStatusFilter === st.id;
                  return (
                    <button
                      key={st.id}
                      onClick={() => setSelectedStatusFilter(st.id)}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold font-sans-inter transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#2A443B] text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                      }`}
                    >
                      <span>{st.label}</span>
                      <span
                        className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          isSelected
                            ? 'bg-white text-[#2A443B]'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {st.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-xs text-slate-500 font-sans-inter pr-2">
              عرض <strong>{filteredTasks.length}</strong> من {totalTasks}
            </div>
          </div>

          {/* Task Cards Feed */}
          <div className="space-y-5">
            {filteredTasks.map((task) => {
              const statusCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, badgeColor: 'text-[#445E50]' };
              const priorityCfg = TASK_PRIORITY_CONFIG[task.priority] || { label: task.priority, badgeColor: 'text-[#445E50]' };
              const completedChecklist = task.checklist.filter((c) => c.completed).length;
              const completedSteps = task.steps ? task.steps.filter((s) => s.status === 'completed').length : 0;
              const totalSteps = task.steps ? task.steps.length : 0;
              const hasChain = Boolean(task.parentTaskId) || (task.taskChain && task.taskChain.length > 0);

              const categoryIcons: Record<string, { label: string; icon: string }> = {
                field: { label: 'ميداني', icon: '🛠️' },
                administrative: { label: 'إداري', icon: '📋' },
                financial: { label: 'مالي', icon: '💰' },
                visit: { label: 'زيارة', icon: '🚗' },
              };
              const catInfo = categoryIcons[task.taskTypeCategory || 'field'] || categoryIcons.field;

              return (
                <div
                  key={task.id}
                  className={`neu-raised rounded-3xl p-5 sm:p-7 space-y-4 transition-all duration-200 ${
                    task.priority === 'urgent' ? 'ring-2 ring-[#C2584A]/30' : ''
                  }`}
                >
                  {/* Top Row: Badges & Chain Link */}
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-mono font-bold text-[#234D35] neu-inset-sm px-3 py-1.5 rounded-full">
                        {task.code}
                      </span>
                      <span className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full neu-raised-sm text-[#355743] flex items-center gap-1.5">
                        <span className="text-sm">{catInfo.icon}</span>
                        <span>{catInfo.label}</span>
                      </span>
                      <span className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full neu-inset-sm text-[#1F412F]">
                        {statusCfg.label}
                      </span>
                      <span className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full neu-raised-sm text-[#743F17]">
                        {priorityCfg.label}
                      </span>
                      {totalSteps > 0 && (
                        <span className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full neu-inset-sm text-[#2C5271]">
                          مراحل: {completedSteps}/{totalSteps}
                        </span>
                      )}
                      {task.isPaused && (
                        <span className="text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full neu-inset-sm text-[#87541B] animate-pulse">
                          متوقفة مؤقتاً
                        </span>
                      )}
                    </div>

                    {hasChain && (
                      <button
                        onClick={() => onViewChain(task)}
                        className="flex items-center gap-2 text-xs sm:text-sm font-bold neu-button text-[#58336D] px-3.5 py-2 rounded-2xl transition cursor-pointer min-h-[40px]"
                      >
                        <Layers className="w-4.5 h-4.5 stroke-[2.2]" />
                        <span>سلسلة متابعة ({task.taskChain?.length || 1})</span>
                      </button>
                    )}
                  </div>

                  {/* Task Title & Description */}
                  <div>
                    <h3
                      onClick={() => onSelectTask(task)}
                      className="text-lg sm:text-xl font-black text-[#14291D] hover:text-[#2A573B] transition cursor-pointer leading-snug font-serif-display"
                    >
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs sm:text-sm text-[#4E6A5A] mt-1.5 line-clamp-2 leading-relaxed font-normal">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Steps Timeline (if steps exist) */}
                  {task.steps && task.steps.length > 0 && (
                    <div className="pt-2">
                      <div className="text-xs sm:text-sm font-bold text-[#3B5B49] mb-2.5 flex items-center justify-between">
                        <span>المراحل الزمنية المكتملة:</span>
                        <span className="font-mono">{completedSteps} من {totalSteps}</span>
                      </div>
                      <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5">
                        {task.steps.map((st, sIdx) => (
                          <div
                            key={st.id || sIdx}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm shrink-0 transition min-h-[40px] ${
                              st.status === 'completed'
                                ? 'neu-inset font-bold text-[#1F482F]'
                                : st.status === 'blocked' || st.status === 'deferred'
                                ? 'neu-inset text-[#8C3F36] font-bold'
                                : 'neu-raised-sm text-[#557363]'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-current" />
                            <span>{st.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pause Alert if active */}
                  {task.isPaused && task.pauseReason && (
                    <div className="p-3.5 neu-inset rounded-2xl text-xs sm:text-sm text-[#834914] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-[#9E591B] stroke-[2.2] shrink-0" />
                        <span><strong>سبب التوقف:</strong> {task.pauseReason}</span>
                      </div>
                    </div>
                  )}

                  {/* Outcome Reason Banner if incomplete */}
                  {task.outcomeReason && (
                    <div className="p-3.5 neu-inset rounded-2xl text-xs sm:text-sm text-[#834914] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-[#9E591B] stroke-[2.2] shrink-0" />
                        <span><strong>سبب المتابعة:</strong> {task.outcomeReason}</span>
                      </div>
                      {task.outcome && (
                        <span className="text-xs font-bold neu-raised-sm text-[#834914] px-2.5 py-1 rounded-full">
                          {task.outcome}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Location, Due Date, Client Info */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm text-[#4E6A59] pt-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4.5 h-4.5 text-[#3F6650] stroke-[2.2]" />
                      <span>{task.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4.5 h-4.5 text-[#3F6650] stroke-[2.2]" />
                      <span>{task.dueDate} {task.dueTime ? `(${task.dueTime})` : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4.5 h-4.5 text-[#3F6650] stroke-[2.2]" />
                      <span className="font-bold text-[#183122]">{task.assigneeName}</span>
                    </div>
                    {task.clientPhone && (
                      <a
                        href={`tel:${task.clientPhone}`}
                        className="flex items-center gap-2 text-[#285339] hover:underline font-mono font-bold"
                      >
                        <Phone className="w-4 h-4 stroke-[2.2]" />
                        <span>{task.clientPhone}</span>
                      </a>
                    )}
                  </div>

                  {/* Task Expenses Indicator Banner */}
                  {(() => {
                    const taskExpenses = expenses.filter((e) => e.taskId === task.id);
                    if (taskExpenses.length === 0) return null;
                    const hasRejected = taskExpenses.some((e) => e.status === 'rejected');
                    const hasPending = taskExpenses.some((e) => e.status === 'pending_approval');
                    const totalExpenses = taskExpenses.reduce((sum, e) => sum + e.totalWithTax, 0);

                    return (
                      <div className="flex items-center gap-2.5 flex-wrap pt-1">
                        {hasRejected && (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full neu-inset-sm text-[#99372C] flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
                            <span>فاتورة مرفوضة من التدقيق</span>
                          </span>
                        )}
                        {hasPending && (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full neu-inset-sm text-[#5E3672] flex items-center gap-1.5">
                            <Clock className="w-4 h-4 stroke-[2.2]" />
                            <span>فواتير بانتظار الاعتماد ({taskExpenses.filter((e) => e.status === 'pending_approval').length})</span>
                          </span>
                        )}
                        <span className="text-xs font-bold px-3 py-1.5 rounded-full neu-raised-sm text-[#1F4F33] flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 stroke-[2.2]" />
                          <span>إجمالي النفقات: {formatCurrency(totalExpenses)}</span>
                        </span>
                      </div>
                    );
                  })()}

                  {/* Checklist Progress Bar & Card Footer Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-[#C8D3CC]/50 flex-wrap gap-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs sm:text-sm text-[#4E6A5A] font-semibold">
                        قائمة الفحص: <strong>{completedChecklist}/{task.checklist.length}</strong>
                      </span>
                      <div className="w-24 sm:w-36 neu-inset-sm h-3 rounded-full overflow-hidden p-0.5">
                        <div
                          className="bg-[#315E43] h-full rounded-full transition-all"
                          style={{
                            width: `${task.checklist.length > 0 ? (completedChecklist / task.checklist.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Card Action Buttons with Neumorphic Controls & Large Touch Targets */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Task Execution Timers */}
                      {task.status !== 'completed' && task.status !== 'approved' && (
                        <>
                          {(task.status === 'new' || task.status === 'todo' || task.status === 'scheduled') && (
                            <button
                              onClick={(e) => handleStartTask(task.id, e)}
                              className="neu-button px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-[#204F34] flex items-center gap-2 cursor-pointer min-h-[44px]"
                              title="تسجيل وقت البدء الفعلي"
                            >
                              <Play className="w-4.5 h-4.5 fill-current stroke-[2]" />
                              <span>بدء المهمة</span>
                            </button>
                          )}

                          {(task.status === 'in_progress' || task.status === 'started') && !task.isPaused && (
                            <button
                              onClick={(e) => handlePauseTask(task.id, e)}
                              className="neu-button px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-[#815016] flex items-center gap-2 cursor-pointer min-h-[44px]"
                              title="إيقاف مؤقت مع تدوين السبب"
                            >
                              <Pause className="w-4.5 h-4.5 stroke-[2.2]" />
                              <span>إيقاف مؤقت</span>
                            </button>
                          )}

                          {task.isPaused && (
                            <button
                              onClick={(e) => handleResumeTask(task.id, e)}
                              className="neu-button px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-[#1E4D31] flex items-center gap-2 cursor-pointer min-h-[44px]"
                              title="استئناف التنفيذ"
                            >
                              <Play className="w-4.5 h-4.5 fill-current stroke-[2]" />
                              <span>استئناف</span>
                            </button>
                          )}
                        </>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenNewExpense(task.id)}
                        icon={<Receipt className="w-4.5 h-4.5 text-[#2E5A40] stroke-[2.2]" />}
                        className="text-xs sm:text-sm font-bold min-h-[44px]"
                      >
                        فاتورة
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectTask(task)}
                        className="text-xs sm:text-sm font-bold min-h-[44px]"
                      >
                        التفاصيل
                      </Button>
                      <Button
                        variant={task.status === 'completed' ? 'outline' : 'success'}
                        size="sm"
                        onClick={() => onRecordOutcome(task)}
                        icon={<CheckCircle2 className="w-4.5 h-4.5 stroke-[2.2]" />}
                        className="text-xs sm:text-sm font-bold min-h-[44px]"
                      >
                        {task.status === 'completed' ? 'تعديل النتيجة' : 'إنهاء النتيجة'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="neu-raised rounded-3xl p-8 sm:p-12 text-center space-y-3">
                <Clock className="w-10 h-10 text-[#5B7967] mx-auto stroke-[2.2]" />
                <h4 className="text-base font-bold text-[#1A3123]">لا توجد مهام مطابقة للتصفية الحالية</h4>
                <p className="text-xs sm:text-sm text-[#547362]">يمكنك إنشاء مهمة جديدة أو تعديل معايير التصفية</p>
              </div>
            )}

            {/* Interactive Daily Operations Rating & Feedback Card */}
            <div className="inner-white-card p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-serif-hero text-base sm:text-lg font-bold text-slate-900">
                    كيف تقيّم وتيرة وانضباط إنجاز العمليات اليوم؟
                  </h3>
                  <p className="text-xs text-slate-500 font-sans-inter mt-0.5">
                    قيّم أداء الفريق الميداني من 1 (عوائق وبطء) إلى 10 (إنجاز فائق وانسيابية تامة)
                  </p>
                </div>
                {dailyScore && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#2A443B] text-white">
                    التقييم: {dailyScore}/10
                  </span>
                )}
              </div>

              {/* 1 to 10 Circular Interactive Buttons */}
              <div className="grid grid-cols-10 gap-1.5 sm:gap-2 pt-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setDailyScore(num)}
                    className={`w-full aspect-square rounded-full flex items-center justify-center text-xs sm:text-sm font-bold font-sans-inter transition-all cursor-pointer ${
                      dailyScore === num
                        ? 'bg-[#2A443B] text-white shadow-md scale-105 ring-2 ring-[#2A443B]/30'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80 shadow-2xs'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Footer with note prompt */}
              <button
                type="button"
                onClick={handleAddDailyNote}
                className="w-full pt-3 border-t border-slate-200/70 flex items-center justify-between text-xs font-bold text-slate-700 hover:text-[#2A443B] transition-colors cursor-pointer group"
              >
                <span className="flex items-center gap-2 group-hover:underline">
                  <Sparkles className="w-4 h-4 text-emerald-700" />
                  <span>أضف تقرير أو ملاحظات الإنجاز اليومي للإدارة</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  تدوين تقرير اليوم
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Left Panels: Quick Approvals + Funds Watch (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Approvals Box */}
          <div className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#C8D3CC]/50">
              <h3 className="text-base font-black text-[#142A1D] font-serif-display">
                اعتمادات معلقة عاجلة
              </h3>
              <button
                onClick={() => onSelectView('approvals')}
                className="text-xs sm:text-sm text-[#2C573E] hover:text-[#132F20] font-bold flex items-center gap-1.5 cursor-pointer py-1 px-2 rounded-xl"
              >
                <span>عرض الكل</span>
                <ArrowRight className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
            <div className="space-y-3">
              {pendingApprovals.slice(0, 3).map((pa) => (
                <div key={pa.id} className="p-3.5 rounded-2xl neu-inset text-xs sm:text-sm flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#152B1E] truncate">{pa.title}</p>
                    <p className="text-xs text-[#506E5E] mt-0.5">{pa.assigneeName} - {pa.location}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSelectView('approvals')}
                    className="text-xs h-9 px-3 shrink-0 font-bold"
                  >
                    اعتماد
                  </Button>
                </div>
              ))}
              {pendingApprovals.length === 0 && (
                <p className="text-xs sm:text-sm text-[#5D7A6B] text-center py-5">
                  لا توجد طلبات اعتماد معلقة حالياً
                </p>
              )}
            </div>
          </div>

          {/* Petty Cash Watch Card */}
          <div className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#C8D3CC]/50">
              <h3 className="text-base font-black text-[#142A1D] font-serif-display">
                أرصدة العهد النقدية الحالية
              </h3>
              <button
                onClick={() => onSelectView('funds')}
                className="text-xs sm:text-sm text-[#2C573E] hover:text-[#132F20] font-bold flex items-center gap-1.5 cursor-pointer py-1 px-2 rounded-xl"
              >
                <span>إدارة العهد</span>
                <ArrowRight className="w-4 h-4 stroke-[2.2]" />
              </button>
            </div>
            <div className="space-y-4">
              {funds.map((f) => {
                const ratio = Math.round((f.currentBalance / f.totalAllocation) * 100);
                const isWarning = ratio <= f.warningThreshold;
                return (
                  <div key={f.id} className="space-y-2 text-xs sm:text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#152B1E] truncate">{f.name}</span>
                      <span className={`font-mono font-bold dir-ltr ${isWarning ? 'text-[#963F33]' : 'text-[#255639]'}`}>
                        {formatCurrency(f.currentBalance, f.currency)}
                      </span>
                    </div>
                    <div className="w-full neu-inset-sm h-3 rounded-full overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all ${
                          ratio <= 20 ? 'bg-[#9E392E]' : ratio <= 40 ? 'bg-[#915B1F]' : 'bg-[#315E43]'
                        }`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-[#597867]">
                      <span>الأمين: {f.holderName}</span>
                      <span>المتبقي: {ratio}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
