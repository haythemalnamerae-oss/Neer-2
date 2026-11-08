import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  Wallet,
  Receipt,
  FileCheck2,
  Calendar,
  BarChart3,
  Users,
  Shield,
  History,
  Settings,
  X,
  Target,
  MapPin,
  Trophy,
} from 'lucide-react';
import { User } from '../../types/domain';
import { hasPermission } from '../../lib/rbac/permissions';
import { dataStore } from '../../lib/storage';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  currentUser: User;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

const navigation = [
  {
    group: 'الرئيسية',
    items: [
      { id: 'daily', label: 'مركز القيادة', icon: Target, module: 'dashboard' },
      { id: 'dashboard', label: 'التحليلات والمؤشرات', icon: LayoutDashboard, module: 'dashboard' },
      { id: 'approvals', label: 'مركز الاعتمادات', icon: FileCheck2, module: 'tasks' },
    ],
  },
  {
    group: 'التشغيل',
    items: [
      { id: 'tasks', label: 'المهام والمشاريع', icon: CheckSquare, module: 'tasks' },
      { id: 'followUps', label: 'المتابعة', icon: Clock, module: 'followUps' },
      { id: 'calendar', label: 'التقويم', icon: Calendar, module: 'calendar' },
      { id: 'map', label: 'الخريطة الميدانية', icon: MapPin, module: 'tasks' },
      { id: 'team', label: 'الفريق الميداني', icon: Users, module: 'team' },
      { id: 'performance', label: 'تقييم الإنجازات', icon: Trophy, module: 'reports' },
    ],
  },
  {
    group: 'المالية',
    items: [
      { id: 'funds', label: 'العهد والأرصدة', icon: Wallet, module: 'funds' },
      { id: 'expenses', label: 'المصروفات والفواتير', icon: Receipt, module: 'expenses' },
      { id: 'settlements', label: 'التسويات', icon: FileCheck2, module: 'settlements' },
      { id: 'reports', label: 'التقارير المالية', icon: BarChart3, module: 'reports' },
    ],
  },
  {
    group: 'الإدارة والرقابة',
    items: [
      { id: 'users', label: 'المستخدمون', icon: Users, module: 'users' },
      { id: 'roles', label: 'الأدوار والصلاحيات', icon: Shield, module: 'roles' },
      { id: 'audit', label: 'سجل التدقيق', icon: History, module: 'audit' },
      { id: 'settings', label: 'إعدادات المنشأة', icon: Settings, module: 'settings' },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  currentUser,
  isOpenMobile,
  onCloseMobile,
}) => {
  const allTasks = dataStore.getTasks();
  const tasks = currentUser.role === 'field_officer'
    ? allTasks.filter((task) => task.assigneeId === currentUser.id)
    : allTasks;
  const pendingTasksCount = tasks.filter(
    (task) => task.status === 'in_progress' || task.status === 'started'
  ).length;
  const canReviewTasks = hasPermission(currentUser.role, 'tasks', 'approve');
  const canReviewExpenses = hasPermission(currentUser.role, 'expenses', 'approve');
  const canReviewSettlements = hasPermission(currentUser.role, 'settlements', 'approve');
  const pendingTaskApprovals = canReviewTasks
    ? allTasks.filter((task) => task.status === 'pending_approval').length
    : 0;
  const pendingExpenses = canReviewExpenses
    ? dataStore.getExpenses().filter((item) => item.status === 'pending_approval').length
    : 0;
  const pendingSettlements = canReviewSettlements
    ? dataStore.getSettlements().filter((item) => item.status === 'under_review' || item.status === 'draft').length
    : 0;
  const funds = dataStore.getFunds();
  const warningFunds = funds.filter(
    (fund) => (currentUser.role !== 'field_officer' || fund.holderId === currentUser.id)
      && (fund.status === 'warning' || fund.status === 'depleted')
  ).length;
  const totalPendingApprovals = pendingTaskApprovals + pendingExpenses + pendingSettlements;

  const badges: Record<string, { count: number; alert?: boolean }> = {
    tasks: pendingTasksCount ? { count: pendingTasksCount } : { count: 0 },
    approvals: totalPendingApprovals ? { count: totalPendingApprovals, alert: true } : { count: 0 },
    funds: warningFunds ? { count: warningFunds, alert: true } : { count: 0 },
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <button
          aria-label="إغلاق القائمة"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden cursor-pointer"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(19rem,88vw)] flex-col bg-[#2A443B] text-white shadow-2xl transition-transform duration-300 lg:static lg:w-68 lg:translate-x-0 lg:shadow-none ${
          isOpenMobile ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 border border-white/20 text-white shadow-xs">
              <Wallet className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif-hero text-xl font-bold tracking-tight text-white">نير</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Ops
                </span>
              </div>
              <span className="text-xs text-white/60 font-sans-inter">الرقابة المالية والعمليات</span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            aria-label="إغلاق القائمة"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white lg:hidden cursor-pointer hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation list */}
        <nav aria-label="قائمة الأقسام" className="flex-1 space-y-6 overflow-y-auto no-scrollbar px-4 py-5">
          {navigation.map((group) => {
            const items = group.items.filter((item) =>
              hasPermission(currentUser.role, item.module, 'view')
            );
            if (!items.length) return null;

            return (
              <section key={group.group}>
                <h2 className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-white/40 font-sans-inter">
                  {group.group}
                </h2>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = currentView === item.id;
                    const badgeInfo = badges[item.id];

                    return (
                      <button
                        key={item.id}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => {
                          onSelectView(item.id);
                          onCloseMobile();
                        }}
                        className={`flex min-h-11 w-full items-center justify-between rounded-2xl px-3.5 text-right text-xs font-bold font-sans-inter transition-all cursor-pointer ${
                          active
                            ? 'bg-[#F4F7F5] text-[#2A443B] shadow-md shadow-black/10 scale-[1.01]'
                            : 'text-white/80 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className={`h-4.5 w-4.5 ${active ? 'text-[#2A443B]' : 'text-emerald-300/80'}`} />
                          <span>{item.label}</span>
                        </span>

                        {badgeInfo && badgeInfo.count > 0 && (
                          <span
                            className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                              active
                                ? 'bg-[#2A443B] text-white'
                                : badgeInfo.alert
                                ? 'bg-amber-500 text-slate-900'
                                : 'bg-emerald-600/80 text-white'
                            }`}
                          >
                            {badgeInfo.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

        </nav>

        {/* Footer info badge */}
        <div className="border-t border-white/10 p-4 text-[11px] text-white/50 flex items-center justify-between font-sans-inter">
          <span>نظام نير v3.4</span>
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            متصل محلياً
          </span>
        </div>
      </aside>
    </>
  );
};
