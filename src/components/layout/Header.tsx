import React, { useState } from 'react';
import { Bell, Code2, Menu, Plus, Shield, CheckCircle2, AlertTriangle, Info, LogOut } from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { User } from '../../types/domain';
import { ROLE_LABELS } from '../../lib/rbac/permissions';
import { clearSession } from '../../lib/api/session';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface HeaderProps {
  currentUser: User;
  onOpenMobileMenu: () => void;
  onOpenNewTask: () => void;
  onOpenNewExpense: () => void;
  onSelectView: (view: string) => void;
  currentView: string;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onOpenMobileMenu, onOpenNewTask, onOpenNewExpense, onSelectView, currentView }) => {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifications = dataStore.getNotifications();
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const getTitle = () => ({ daily: 'الرئيسية', approvals: 'الاعتمادات', dashboard: 'المؤشرات', tasks: 'المهام', followUps: 'المتابعات', funds: 'العهد', expenses: 'المصروفات', settlements: 'التسويات', calendar: 'التقويم', reports: 'التقارير', team: 'الفريق', users: 'المستخدمون', roles: 'الصلاحيات', audit: 'سجل التدقيق', settings: 'الإعدادات', codeViewer: 'أكواد النظام' }[currentView] || 'نظام نير');

  return <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-md sm:px-6 sm:py-3">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <button aria-label="فتح القائمة" onClick={onOpenMobileMenu} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"><Menu className="h-5 w-5"/></button>
        <div className="min-w-0"><h1 className="truncate text-base font-bold text-slate-900 sm:text-xl">{getTitle()}</h1><p className="hidden truncate text-xs text-slate-500 sm:block">إدارة العمليات والمهام والعهد</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="outline" size="sm" onClick={onOpenNewExpense} icon={<Plus className="h-4 w-4"/>}>فاتورة جديدة</Button>
          <Button variant="primary" size="sm" onClick={onOpenNewTask} icon={<Plus className="h-4 w-4"/>}>مهمة جديدة</Button>
        </div>
        <button aria-label="فتح مستعرض الأكواد" onClick={() => onSelectView('codeViewer')} className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 sm:flex"><Code2 className="h-4 w-4"/><span>أكواد النظام</span></button>
        <div className="relative">
          <button aria-label={`الإشعارات، ${unreadCount} غير مقروء`} aria-expanded={showNotifDropdown} onClick={() => setShowNotifDropdown((open) => !open)} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"><Bell className="h-5 w-5"/>{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-700 px-1 text-[10px] font-bold text-white">{unreadCount}</span>}</button>
          {showNotifDropdown && <div className="absolute left-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2"><strong className="text-sm">الإشعارات</strong>{unreadCount > 0 && <button className="text-xs font-semibold text-emerald-800" onClick={() => dataStore.markAllNotificationsRead()}>تحديد الكل كمقروء</button>}</div>
            <div className="max-h-72 space-y-2 overflow-auto pt-2">{notifications.slice(0, 8).map((item) => <button key={item.id} onClick={() => { dataStore.markNotificationRead(item.id); if (item.targetView) onSelectView(item.targetView); setShowNotifDropdown(false); }} className="flex w-full gap-2 rounded-xl p-2 text-right hover:bg-slate-50"><span className="mt-0.5">{item.type === 'warning' || item.type === 'alert' ? <AlertTriangle className="h-4 w-4 text-amber-700"/> : item.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-700"/> : <Info className="h-4 w-4 text-sky-700"/>}</span><span className="min-w-0"><strong className="block truncate text-xs">{item.title}</strong><span className="mt-0.5 line-clamp-2 block text-xs text-slate-600">{item.message}</span></span></button>)}</div>
          </div>}
        </div>
        <div className="hidden min-w-0 items-center gap-2 sm:flex"><img src={currentUser.avatar} alt="" className="h-8 w-8 rounded-full object-cover"/><div className="max-w-36"><span className="block truncate text-xs font-bold">{currentUser.name}</span><span className="block truncate text-[11px] text-slate-500">{ROLE_LABELS[currentUser.role]?.titleAr || currentUser.role}</span></div><Shield className="h-4 w-4 text-emerald-800"/></div>
        <button aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={() => { clearSession(); window.location.reload(); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"><LogOut className="h-4 w-4"/></button>
      </div>
    </div>
  </header>;
};
