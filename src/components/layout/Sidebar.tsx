import React from 'react';
import { LayoutDashboard, CheckSquare, Clock, Wallet, Receipt, FileCheck2, Calendar, BarChart3, Users, Shield, History, Settings, Code2, X, Target } from 'lucide-react';
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
  { group: 'العمليات', items: [
    { id: 'daily', label: 'مركز القيادة اليومي', icon: Target, module: 'dashboard' },
    { id: 'approvals', label: 'الاعتمادات', icon: FileCheck2, module: 'tasks' },
    { id: 'dashboard', label: 'المؤشرات', icon: LayoutDashboard, module: 'dashboard' },
    { id: 'tasks', label: 'المهام والمشاريع', icon: CheckSquare, module: 'tasks' },
    { id: 'followUps', label: 'المتابعات', icon: Clock, module: 'followUps' },
    { id: 'calendar', label: 'التقويم', icon: Calendar, module: 'calendar' },
  ] },
  { group: 'المالية', items: [
    { id: 'funds', label: 'العهد والأرصدة', icon: Wallet, module: 'funds' },
    { id: 'expenses', label: 'المصروفات والفواتير', icon: Receipt, module: 'expenses' },
    { id: 'settlements', label: 'التسويات', icon: FileCheck2, module: 'settlements' },
    { id: 'reports', label: 'التقارير', icon: BarChart3, module: 'reports' },
  ] },
  { group: 'الإدارة', items: [
    { id: 'team', label: 'فريق العمل', icon: Users, module: 'team' },
    { id: 'users', label: 'المستخدمون', icon: Users, module: 'users' },
    { id: 'roles', label: 'الأدوار والصلاحيات', icon: Shield, module: 'roles' },
    { id: 'audit', label: 'سجل التدقيق', icon: History, module: 'audit' },
    { id: 'settings', label: 'الإعدادات', icon: Settings, module: 'settings' },
  ] },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onSelectView, currentUser, isOpenMobile, onCloseMobile }) => {
  const tasks = dataStore.getTasks();
  const pendingTasksCount = tasks.filter((task) => task.status === 'in_progress' || task.status === 'started').length;
  const expenses = dataStore.getExpenses();
  const funds = dataStore.getFunds();
  const badges: Record<string, string | undefined> = {
    tasks: pendingTasksCount ? String(pendingTasksCount) : undefined,
    expenses: expenses.filter((item) => item.status === 'pending_approval').length ? String(expenses.filter((item) => item.status === 'pending_approval').length) : undefined,
    funds: funds.filter((fund) => fund.status === 'warning' || fund.status === 'depleted').length ? 'تنبيه' : undefined,
  };

  return <>
    {isOpenMobile && <button aria-label="إغلاق القائمة" onClick={onCloseMobile} className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden"/>}
    <aside className={`fixed inset-y-0 right-0 z-50 flex w-[min(19rem,88vw)] flex-col border-l border-slate-200 bg-white text-slate-800 shadow-xl transition-transform duration-200 lg:static lg:w-64 lg:translate-x-0 lg:shadow-none ${isOpenMobile ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-white"><Wallet className="h-5 w-5"/></div><div><strong className="block text-sm font-bold">نير</strong><span className="text-xs text-slate-500">العمليات والرقابة</span></div></div>
        <button onClick={onCloseMobile} aria-label="إغلاق القائمة" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 lg:hidden"><X className="h-4 w-4"/></button>
      </div>
      <nav aria-label="قائمة الأقسام" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navigation.map((group) => {
          const items = group.items.filter((item) => hasPermission(currentUser.role, item.module, 'view'));
          if (!items.length) return null;
          return <section key={group.group}><h2 className="px-3 pb-2 text-[11px] font-semibold text-slate-400">{group.group}</h2><div className="space-y-1">{items.map((item) => {
            const Icon = item.icon; const active = currentView === item.id;
            return <button key={item.id} aria-current={active ? 'page' : undefined} onClick={() => { onSelectView(item.id); onCloseMobile(); }} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-right text-sm ${active ? 'bg-emerald-50 font-bold text-emerald-900' : 'text-slate-600 hover:bg-slate-50'}`}><span className="flex items-center gap-3"><Icon className="h-4.5 w-4.5"/><span>{item.label}</span></span>{badges[item.id] && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold">{badges[item.id]}</span>}</button>;
          })}</div></section>;
        })}
        <button onClick={() => { onSelectView('codeViewer'); onCloseMobile(); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-right text-sm text-slate-600 hover:bg-slate-50"><Code2 className="h-4.5 w-4.5"/>أكواد النظام</button>
      </nav>
      <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">نظام إدارة العمليات</div>
    </aside>
  </>;
};
