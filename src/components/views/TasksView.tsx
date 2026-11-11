import React, { useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  MapPin,
  Layers,
  Trash2,
} from 'lucide-react';
import { Task, TaskStatus } from '../../types/domain';
import { dataStore } from '../../lib/storage';
import { hasPermission } from '../../lib/rbac/permissions';
import { TASK_PRIORITY_CONFIG, TASK_STATUS_CONFIG, formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { deleteTaskOnServer } from '../../services/tasks.api';

interface TasksViewProps {
  onOpenNewTask: () => void;
  onSelectTask: (task: Task) => void;
  onRecordOutcome: (task: Task) => void;
  onViewChain: (task: Task) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  onOpenNewTask,
  onSelectTask,
  onRecordOutcome,
  onViewChain,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const currentUser = dataStore.getCurrentUser();
  const canCreateTask = hasPermission(currentUser.role, 'tasks', 'create');
  const canDeleteTask = hasPermission(currentUser.role, 'tasks', 'delete');
  const canRecordOutcome = hasPermission(currentUser.role, 'tasks', 'edit');
  const allTasks = dataStore.getTasks();
  const tasks = currentUser.role === 'field_officer'
    ? allTasks.filter((task) => task.assigneeId === currentUser.id || task.assignees?.some((assignee) => assignee.appUserId === currentUser.id))
    : allTasks;
  const users = dataStore.getUsers();

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (assigneeFilter !== 'all' && task.assigneeId !== assigneeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        task.title.toLowerCase().includes(q) ||
        task.location.toLowerCase().includes(q) ||
        (Boolean(task.code) && task.code!.toLowerCase().includes(q)) ||
        (task.clientName && task.clientName.toLowerCase().includes(q)) ||
        task.assigneeName.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!canDeleteTask) return;
    if (!window.confirm('هل تريد إلغاء هذه المهمة؟ ستبقى محفوظة في السجل للمراجعة والتدقيق.')) return;
    try { await deleteTaskOnServer(taskId); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'تعذر حذف المهمة.'); }
  };

  const kanbanColumns: { id: TaskStatus; label: string }[] = [
    { id: 'scheduled', label: 'مجدولة / للتنفيذ' },
    { id: 'in_progress', label: 'قيد التنفيذ الميداني' },
    { id: 'pending_approval', label: 'بانتظار الاعتماد' },
    { id: 'completed', label: 'مكتملة ومعتمدة' },
  ];

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Header & Actions Bar */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">
            سجل المهام الميدانية والمشاريع
          </h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            إدارة وتتبع تنفيذ المهام الميدانية، قوائم الفحص الفنية وسلاسل المتابعة
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center neu-inset-sm p-1.5 rounded-2xl">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-xl transition cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center ${
                viewMode === 'list' ? 'neu-button text-[#142B1D]' : 'text-[#587363] hover:text-[#193223]'
              }`}
              title="عرض قائمة"
            >
              <List className="w-5 h-5 stroke-[2.2]" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 rounded-xl transition cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center ${
                viewMode === 'kanban' ? 'neu-button text-[#142B1D]' : 'text-[#587363] hover:text-[#193223]'
              }`}
              title="عرض كانبان"
            >
              <LayoutGrid className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>

          {canCreateTask && <Button
            variant="primary"
            size="md"
            onClick={onOpenNewTask}
            icon={<Plus className="w-5 h-5 stroke-[2.5]" />}
            className="text-xs sm:text-sm font-bold min-h-[44px]"
          >
            مهمة جديدة
          </Button>}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="neu-raised rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute right-3.5 text-[#547362] stroke-[2.2] pointer-events-none" />
            <input
              type="text"
              placeholder="البحث بالاسم، الكود، الموقع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-11 pl-4 text-xs sm:text-sm"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full text-xs sm:text-sm font-semibold"
          >
            <option value="all">كافة الحالات</option>
            <option value="scheduled">مجدولة</option>
            <option value="in_progress">قيد التنفيذ</option>
            <option value="pending_approval">بانتظار الاعتماد</option>
            <option value="completed">مكتملة</option>
            <option value="rejected">مرفوضة / متعثرة</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full text-xs sm:text-sm font-semibold"
          >
            <option value="all">كافة الأولويات</option>
            <option value="urgent">طارئ جداً (Urgent)</option>
            <option value="high">عالي</option>
            <option value="medium">متوسط</option>
            <option value="low">منخفض</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="w-full text-xs sm:text-sm font-semibold"
          >
            <option value="all">كافة المسؤولين الميدانيين</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between text-xs sm:text-sm text-[#547363] pt-1">
          <span>نتائج البحث: <strong>{filteredTasks.length}</strong> مهمة</span>
          {(statusFilter !== 'all' || priorityFilter !== 'all' || assigneeFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setPriorityFilter('all');
                setAssigneeFilter('all');
                setSearchQuery('');
              }}
              className="text-[#255237] hover:underline font-bold cursor-pointer"
            >
              إعادة تعيين التصفية
            </button>
          )}
        </div>
      </div>

      {/* Mode 1: Table List View */}
      {viewMode === 'list' && (
        <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs sm:text-sm">
              <thead className="text-[#4E6C5C] font-bold border-b border-[#C8D3CC]/50">
                <tr>
                  <th className="p-4">الكود والنوع</th>
                  <th className="p-4">عنوان المهمة والموقع</th>
                  <th className="p-4">المسؤول الميداني</th>
                  <th className="p-4">تاريخ الاستحقاق</th>
                  <th className="p-4">الأولوية والحالة</th>
                  <th className="p-4">الميزانية والمصروف</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C8D3CC]/30">
                {filteredTasks.map((task) => {
                  const statusCfg = TASK_STATUS_CONFIG[task.status] || { label: task.status, badgeColor: 'text-[#486857]' };
                  const priorityCfg = TASK_PRIORITY_CONFIG[task.priority] || { label: task.priority, badgeColor: 'text-[#486857]' };
                  const hasChain = Boolean(task.parentTaskId) || (task.taskChain && task.taskChain.length > 0);

                  return (
                    <tr
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className="hover:neu-inset transition cursor-pointer"
                    >
                      <td className="p-4">
                        <span className="font-mono font-bold text-[#1F4C33] neu-inset-sm px-2.5 py-1 rounded-full text-xs block w-fit">
                          {task.code}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-xs text-[#506E5E] font-bold">
                            {task.taskTypeCategory === 'administrative' ? '📋 إداري' :
                             task.taskTypeCategory === 'financial' ? '💰 مالي' :
                             task.taskTypeCategory === 'visit' ? '🚗 زيارة' : '🛠️ ميداني'}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 max-w-xs">
                        <span className="font-bold text-[#142A1D] block truncate text-sm sm:text-base">{task.title}</span>
                        <span className="text-xs text-[#567464] block mt-1 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-[#3A644D]" />
                          {task.location}
                        </span>
                        {task.standingAccountName && (
                          <span className="text-xs text-[#2A563B] font-bold block mt-1 truncate">حساب معتاد: {task.standingAccountName}</span>
                        )}
                        {task.steps && task.steps.length > 0 && (
                          <span className="text-xs text-[#2A563B] font-bold block mt-1">
                            مراحل: {task.steps.filter((s) => s.status === 'completed').length}/{task.steps.length}
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={task.assigneeAvatar}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover shadow-xs"
                          />
                          <span className="font-bold text-[#183122]">{task.assigneeName}</span>
                        </div>
                        {task.assignees && task.assignees.length > 1 && (
                          <span className="text-[10px] text-[#547362] block mt-1">
                            فريق ({task.assignees.length}): {task.assignees.slice(1).map((assignee) => users.find((user) => user.id === assignee.appUserId)?.name || assignee.name || assignee.appUserId).join('، ')}
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-mono text-[#4A6857] text-xs sm:text-sm">
                        {task.dueDate} {task.dueTime && <span className="text-xs text-[#638070] block font-normal">({task.dueTime})</span>}
                      </td>

                      <td className="p-4 space-y-1.5">
                        <span className="text-xs font-bold px-3 py-1 rounded-full neu-inset-sm text-[#1A442E] block w-fit">
                          {statusCfg.label}
                        </span>
                        {task.isPaused ? (
                          <span className="text-xs font-bold px-3 py-1 rounded-full neu-inset-sm text-[#87541B] block w-fit">
                            متوقفة مؤقتاً
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-3 py-1 rounded-full neu-raised-sm text-[#743F17] block w-fit">
                            {priorityCfg.label}
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-mono">
                        <span className="text-[#132A1C] font-black block text-sm">{formatCurrency(task.budget)}</span>
                        <span className="text-xs text-[#597566] block mt-0.5">منفق: {formatCurrency(task.spentAmount)}</span>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {hasChain && (
                            <button
                              onClick={() => onViewChain(task)}
                              className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#55316A] cursor-pointer"
                              title="سلسلة المتابعة"
                            >
                              <Layers className="w-5 h-5 stroke-[2.2]" />
                            </button>
                          )}
                          {canRecordOutcome && <Button
                            variant="success"
                            size="sm"
                            onClick={() => onRecordOutcome(task)}
                            className="text-xs font-bold min-h-[38px] px-3.5"
                          >
                            النتيجة
                          </Button>}
                          {canDeleteTask && <button
                            onClick={(e) => handleDeleteTask(e, task.id)}
                            className="w-10 h-10 rounded-xl neu-button flex items-center justify-center text-[#96372B] cursor-pointer"
                            title="حذف المهمة"
                          >
                            <Trash2 className="w-4.5 h-4.5 stroke-[2.2]" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-sm text-[#547363]">
                      لا توجد مهام مطابقة للبحث والتصفية.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mode 2: Kanban Board View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {kanbanColumns.map((col) => {
            const colTasks = filteredTasks.filter((t) => {
              if (col.id === 'scheduled') return t.status === 'scheduled' || t.status === 'new' || t.status === 'todo';
              if (col.id === 'in_progress') return t.status === 'in_progress' || t.status === 'started';
              if (col.id === 'pending_approval') return t.status === 'pending_approval';
              if (col.id === 'completed') return t.status === 'completed' || t.status === 'approved';
              return false;
            });

            return (
              <div key={col.id} className="neu-raised rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#C8D3CC]/50">
                  <h3 className="font-bold text-sm sm:text-base text-[#142B1D] font-serif-display">{col.label}</h3>
                  <span className="text-xs font-black neu-inset-sm px-3 py-1 rounded-full text-[#234C34]">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3.5 max-h-[600px] overflow-y-auto">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTask(t)}
                      className="neu-raised-sm hover:neu-inset rounded-2xl p-4 space-y-2.5 cursor-pointer transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-[#234D35] neu-inset-sm px-2.5 py-1 rounded-full">
                          {t.code}
                        </span>
                        <span className="text-xs font-bold neu-raised-sm text-[#743F17] px-2.5 py-1 rounded-full">
                          {t.priority}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-[#142B1D] line-clamp-2">{t.title}</h4>

                      <div className="flex items-center justify-between text-xs text-[#527161] pt-2 border-t border-[#C8D3CC]/40 font-medium">
                        <span>{t.assigneeName}</span>
                        <span className="font-mono">{t.dueDate}</span>
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="p-6 text-center text-xs sm:text-sm text-[#5C7A6A] neu-inset rounded-2xl">
                      لا توجد مهام في هذه المرحلة
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
