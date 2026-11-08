import React, { useState } from 'react';
import { Bell, Code2, Menu, Plus, Shield, CheckCircle2, AlertTriangle, Info, LogOut, Search } from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { User } from '../../types/domain';
import { ROLE_LABELS } from '../../lib/rbac/permissions';
import { clearSession } from '../../lib/api/session';

interface HeaderProps {
  currentUser: User;
  onOpenMobileMenu: () => void;
  onOpenNewTask: () => void;
  onOpenNewExpense: () => void;
  onSelectView: (view: string) => void;
  currentView: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenMobileMenu,
  onOpenNewTask,
  onOpenNewExpense,
  onSelectView,
  currentView,
}) => {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifications = dataStore.getNotifications();
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  const getTitle = () =>
    ({
      daily: 'مركز القيادة اليومي',
      approvals: 'مركز الاعتمادات',
      dashboard: 'مؤشرات الأداء',
      tasks: 'إدارة المهام والمشاريع',
      followUps: 'سلاسل المتابعة',
      funds: 'إدارة العهد والأرصدة',
      expenses: 'المصروفات والفواتير',
      settlements: 'التسويات المحاسبية',
      calendar: 'التقويم الميداني',
      reports: 'التقارير المالية والتشغيلية',
      team: 'فريق العمل الميداني',
      users: 'إدارة المستخدمين',
      roles: 'الصلاحيات والوصول',
      audit: 'سجل التدقيق والرقابة',
      settings: 'إعدادات النظام',
      codeViewer: 'أكواد ومستندات النظام',
    }[currentView] || 'منظومة نير');

  return (
    <header className="sticky top-0 z-30 bg-[#2A443B] text-white px-3 py-3 sm:px-6 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        {/* Right side: Mobile Menu + View Title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="فتح القائمة"
            onClick={onOpenMobileMenu}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all lg:hidden cursor-pointer border border-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif-hero text-lg sm:text-xl font-bold tracking-tight text-white">
                {getTitle()}
              </span>
              <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </div>
            <p className="hidden text-xs text-white/70 sm:block font-sans-inter">
              منظومة الرقابة المالية وإدارة المهام الميدانية والعهد
            </p>
          </div>
        </div>

        {/* Left side: Quick actions, notifications, user profile */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          {/* Action Buttons */}
          <div className="hidden items-center gap-2 md:flex">
            <button
              onClick={onOpenNewExpense}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all border border-white/20 cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>فاتورة جديدة</span>
            </button>

            <button
              onClick={onOpenNewTask}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#F4F7F5] hover:bg-white text-[#2A443B] text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>مهمة جديدة</span>
            </button>
          </div>

          {/* Code Viewer Shortcut */}
          <button
            onClick={() => onSelectView('codeViewer')}
            title="أكواد ومستندات النظام"
            className="hidden sm:flex h-10 items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 px-3 text-xs font-bold text-white transition-all cursor-pointer"
          >
            <Code2 className="h-4 w-4 text-emerald-300" />
            <span className="hidden md:inline">أكواد النظام</span>
          </button>

          {/* Notifications with circular count badge */}
          <div className="relative">
            <button
              aria-label={`الإشعارات، ${unreadCount} غير مقروء`}
              aria-expanded={showNotifDropdown}
              onClick={() => setShowNotifDropdown((open) => !open)}
              className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-all cursor-pointer"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-md border-2 border-[#2A443B]">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown Panel */}
            {showNotifDropdown && (
              <div
                className="absolute left-0 mt-2.5 w-[min(22rem,calc(100vw-1.5rem))] rounded-[24px] bg-[#F4F7F5] p-3 text-slate-800 z-50 border border-white/60 animate-in fade-in duration-200"
                style={{
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
                }}
              >
                <div className="flex items-center justify-between border-b border-slate-200/60 px-2 pb-2.5">
                  <strong className="text-xs font-bold text-[#2A443B]">الإشعارات والتنبيهات</strong>
                  {unreadCount > 0 && (
                    <button
                      className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
                      onClick={() => dataStore.markAllNotificationsRead()}
                    >
                      تحديد الكل كمقروء
                    </button>
                  )}
                </div>

                <div className="max-h-72 space-y-1.5 overflow-y-auto no-scrollbar pt-2">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-500">لا توجد إشعارات جديدة حالياً</p>
                  ) : (
                    notifications.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          dataStore.markNotificationRead(item.id);
                          if (item.targetView) onSelectView(item.targetView);
                          setShowNotifDropdown(false);
                        }}
                        className={`flex w-full gap-2.5 rounded-xl p-2.5 text-right transition-colors cursor-pointer ${
                          item.isRead ? 'hover:bg-slate-100/70 text-slate-600' : 'bg-white shadow-2xs font-medium text-slate-900 border border-emerald-950/5'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">
                          {item.type === 'warning' || item.type === 'alert' ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          ) : item.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          ) : (
                            <Info className="h-4 w-4 text-sky-700" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs">{item.title}</strong>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] text-slate-500 leading-snug">
                            {item.message}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Pill */}
          <div className="hidden min-w-0 items-center gap-2 sm:flex bg-white/10 border border-white/10 rounded-2xl px-2.5 py-1">
            <img
              src={currentUser.avatar}
              alt=""
              className="h-7 w-7 rounded-full object-cover border border-white/30"
            />
            <div className="max-w-28 text-right">
              <span className="block truncate text-xs font-bold text-white">{currentUser.name}</span>
              <span className="block truncate text-[10px] text-emerald-300">
                {ROLE_LABELS[currentUser.role]?.titleAr || currentUser.role}
              </span>
            </div>
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
          </div>

          {/* Logout */}
          <button
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            onClick={() => {
              clearSession();
              window.location.reload();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 hover:bg-rose-500/30 border border-white/10 text-white transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
