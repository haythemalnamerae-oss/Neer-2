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

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Hero Operational Banner: Soft UI Neumorphic Master Card */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-8 relative overflow-hidden transition-all">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex items-center gap-2 text-[#315E43] font-bold text-xs sm:text-sm uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-[#315E43] animate-pulse" />
              <span>مركز العمليات الميدانية والسيطرة اليومية</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-[#132A1C] font-serif-display tracking-tight leading-snug">
              جدول مهام اليوم وحلقات المتابعة المتصلة
            </h2>
            <p className="text-xs sm:text-base text-[#466554] leading-relaxed font-medium">
              متابعة مباشرة لتنفيذ المهام الميدانية، تسجيل مخرجات ونواتج الزيارات، إدارة سلاسل المتابعة وتوثيق المصاريف.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
            <Button
              variant="outline"
              size="md"
              onClick={() => onOpenNewExpense()}
              className="flex-1 sm:flex-initial text-xs sm:text-sm font-bold min-h-[44px]"
            >
              تسجيل فاتورة
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onOpenNewTask}
              icon={<Plus className="w-5 h-5 stroke-[2.5]" />}
              className="flex-1 sm:flex-initial text-xs sm:text-sm font-bold min-h-[44px]"
            >
              مهمة جديدة
            </Button>
          </div>
        </div>

        {/* Floating Quick Stats in Banner with Inset Tactile Wells */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-[#C8D3CC]/50 text-xs sm:text-sm">
          <div className="neu-inset rounded-2xl p-4 sm:p-5 transition">
            <span className="text-[#4E6C5B] block text-xs sm:text-sm font-bold">المهام النشطة الآن</span>
            <span className="text-2xl sm:text-3xl font-black text-[#142B1D] font-mono mt-1.5 block">
              {inProgressToday}
            </span>
          </div>
          <div className="neu-inset rounded-2xl p-4 sm:p-5 transition">
            <span className="text-[#994537] block text-xs sm:text-sm font-bold">مهام طارئة وحرجة</span>
            <span className="text-2xl sm:text-3xl font-black text-[#994537] font-mono mt-1.5 block">
              {urgentTasks.length}
            </span>
          </div>
          <div className="neu-inset rounded-2xl p-4 sm:p-5 transition">
            <span className="text-[#255639] block text-xs sm:text-sm font-bold">المكتملة اليوم</span>
            <span className="text-2xl sm:text-3xl font-black text-[#255639] font-mono mt-1.5 block">
              {completedToday}
            </span>
          </div>
          <div className="neu-inset rounded-2xl p-4 sm:p-5 transition">
            <span className="text-[#513665] block text-xs sm:text-sm font-bold">حلقات المتابعة</span>
            <span className="text-2xl sm:text-3xl font-black text-[#513665] font-mono mt-1.5 block">
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
          {/* Filter Bar with Inset Tabs */}
          <div className="neu-raised rounded-3xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-[#547261] stroke-[2.2]" />
                <span className="text-xs sm:text-sm font-bold text-[#1D3627]">تصفية المهام:</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'active', label: 'النشطة' },
                  { id: 'urgent', label: 'الطارئة' },
                  { id: 'completed', label: 'المكتملة' },
                  { id: 'all', label: 'الكل' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setSelectedStatusFilter(st.id)}
                    className={`text-xs sm:text-sm px-4 py-2 rounded-2xl font-bold transition cursor-pointer min-h-[42px] ${
                      selectedStatusFilter === st.id
                        ? 'neu-inset text-[#142B1E] font-black'
                        : 'neu-button text-[#446352] hover:text-[#183122]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs sm:text-sm text-[#547261] font-mono">
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
