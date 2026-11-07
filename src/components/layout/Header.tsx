import React, { useState } from 'react';
import {
  Bell,
  Code2,
  Menu,
  Plus,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { User } from '../../types/domain';
import { ROLE_LABELS } from '../../lib/rbac/permissions';
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

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenMobileMenu,
  onOpenNewTask,
  onOpenNewExpense,
  onSelectView,
  currentView,
}) => {
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const notifications = dataStore.getNotifications();
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const users = dataStore.getUsers();

  const handleSwitchUser = (userId: string) => {
    dataStore.switchUser(userId);
    setShowRoleDropdown(false);
  };

  const getViewTitle = () => {
    switch (currentView) {
      case 'daily': return { title: 'مركز القيادة والعمليات اليومي', sub: 'إدارة المهام المباشرة وسلاسل المتابعة الميدانية والسيطرة' };
      case 'approvals': return { title: 'مركز الاعتمادات والرقابة', sub: 'مراجعة واعتماد المهام والفواتير والتسويات المعلقة' };
      case 'dashboard': return { title: 'لوحة التحكم والمؤشرات المالية', sub: 'نظرة شمولية على الأداء والسيولة والمهام النشطة' };
      case 'tasks': return { title: 'سجل المهام الميدانية والمشاريع', sub: 'متابعة مراحل التنفيذ وقوائم التدقيق والمواقع' };
      case 'followUps': return { title: 'مركز المتابعات والمهام المتصلة', sub: 'إدارة المهام المرحّلة والمتعثرة وسلاسل المتابعة' };
      case 'funds': return { title: 'إدارة العهد النقدية وصندوق السيولة', sub: 'مخصصات العهد، الخصم التتابعي، وتسوية العجز' };
      case 'expenses': return { title: 'سجل الفواتير والمصروفات اليومية', sub: 'توثيق النفقات، ضريبة القيمة المضافة، والإيصالات' };
      case 'settlements': return { title: 'التسويات الدورية وسندات الصرف', sub: 'مطابقة الفواتير مع العهد وإصدار سندات التصفية الرسمية' };
      case 'calendar': return { title: 'التقويم الميداني وجدول المهام', sub: 'توزيع المهام اليومية وجدول المواعيد والزيارات' };
      case 'reports': return { title: 'التقارير التحليلية ومؤشرات الأداء', sub: 'معدلات الإنجاز، تحليل الإنفاق، وكفاءة الفريق' };
      case 'team': return { title: 'فريق العمل والمسؤولون الميدانيون', sub: 'بيانات الاتصال، التكليفات الحالية، والعهد المرتبطة' };
      case 'users': return { title: 'إدارة المستخدمين والحسابات', sub: 'إضافة المستخدمين وتعيين الأدوار الوظيفية' };
      case 'roles': return { title: 'صلاحيات الأدوار ومصفوفة RBAC', sub: 'تحكم دقيق بصلاحيات العرض، الإنشاء، والتعديل والاعتماد' };
      case 'audit': return { title: 'سجل النشاط والتدقيق الأمني', sub: 'تتبع كافة العمليات المالية والتشغيلية المنجزة بالنظام' };
      case 'settings': return { title: 'سياسات وإعدادات النظام', sub: 'معايير الرقابة المالية، حدود الصرف، والنسخ الاحتياطي' };
      case 'codeViewer': return { title: 'مستعرض الأكواد المصدرية والمخططات', sub: 'استعراض وتحميل كافة أكواد ومخططات قاعدة البيانات' };
      default: return { title: 'نظام إدارة المهام والعهد', sub: 'منظومة الإدارة المتكاملة' };
    }
  };

  const viewInfo = getViewTitle();

  return (
    <header className="sticky top-0 z-30 px-3 sm:px-8 py-3 transition-all">
      <div className="neu-raised-sm rounded-2xl sm:rounded-3xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sm:gap-4">
        {/* Right side (RTL Start): Title & Mobile Trigger */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden w-11 h-11 sm:w-12 sm:h-12 rounded-2xl neu-button flex items-center justify-center text-[#21382A] active:neu-inset transition cursor-pointer shrink-0"
            title="القائمة الجانبية"
          >
            <Menu className="w-6 h-6 stroke-[2.3]" />
          </button>

          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-black text-[#152B1E] font-serif-display truncate tracking-tight">
              {viewInfo.title}
            </h1>
            <p className="text-xs sm:text-sm text-[#4E6B5A] hidden sm:block truncate font-medium mt-0.5">
              {viewInfo.sub}
            </p>
          </div>
        </div>

        {/* Left side (RTL End): Controls (Actions, Role Switcher, Notifications, Code Button) */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          {/* Quick Action Buttons (Desktop) */}
          <div className="hidden md:flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenNewExpense}
              icon={<Plus className="w-4 h-4 text-[#30593E] stroke-[2.5]" />}
              className="text-xs font-bold"
            >
              فاتورة جديدة
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenNewTask}
              icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
              className="text-xs font-bold"
            >
              مهمة جديدة
            </Button>
          </div>

          {/* Full Code Viewer Toggle Button */}
          <button
            onClick={() => onSelectView('codeViewer')}
            className={`hidden sm:flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
              currentView === 'codeViewer'
                ? 'neu-inset text-[#1E3B29]'
                : 'neu-button text-[#3B5D48] hover:text-[#182F21]'
            }`}
            title="استعراض وتحميل الأكواد"
          >
            <Code2 className="w-4.5 h-4.5 text-[#30593E] stroke-[2.2]" />
            <span>أكواد النظام</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifDropdown(!showNotifDropdown);
                setShowRoleDropdown(false);
              }}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-2xl neu-button flex items-center justify-center text-[#2C4A38] active:neu-inset transition cursor-pointer shrink-0"
              title="الإشعارات والتنبيهات"
            >
              <Bell className="w-5.5 h-5.5 stroke-[2.2]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#A8493F] text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifDropdown && (
              <div className="absolute left-0 mt-3 w-80 sm:w-96 neu-raised-lg rounded-3xl p-4 sm:p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-3.5 border-b border-[#C8D3CC]/60 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm sm:text-base text-[#192E21] font-serif-display">التنبيهات والإشعارات</span>
                    {unreadCount > 0 && (
                      <Badge variant="danger" size="sm">
                        {unreadCount} جديدة
                      </Badge>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => dataStore.markAllNotificationsRead()}
                      className="text-xs text-[#305A40] hover:text-[#193824] font-bold cursor-pointer"
                    >
                      تحديد الكل كمقروء
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2.5">
                  {notifications.slice(0, 6).map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => {
                        dataStore.markNotificationRead(notif.id);
                        if (notif.targetView) onSelectView(notif.targetView);
                        setShowNotifDropdown(false);
                      }}
                      className={`p-3.5 rounded-2xl transition cursor-pointer ${
                        notif.isRead
                          ? 'neu-raised-sm text-[#4A6454]'
                          : 'neu-inset text-[#152B1E] font-medium'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {notif.type === 'warning' ? (
                            <AlertTriangle className="w-5 h-5 text-amber-600 stroke-[2.2]" />
                          ) : notif.type === 'alert' ? (
                            <AlertTriangle className="w-5 h-5 text-[#A8493F] stroke-[2.2]" />
                          ) : notif.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-[#305D3F] stroke-[2.2]" />
                          ) : (
                            <Info className="w-5 h-5 text-[#355B6F] stroke-[2.2]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs sm:text-sm font-bold truncate">{notif.title}</p>
                            <span className="text-xs text-[#6A8476] shrink-0 font-mono">{notif.createdAt}</span>
                          </div>
                          <p className="text-xs text-[#4F6C5B] mt-1 line-clamp-2 leading-relaxed font-normal">
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Role Quick Switcher Badge */}
          <div className="relative">
            <button
              onClick={() => {
                setShowRoleDropdown(!showRoleDropdown);
                setShowNotifDropdown(false);
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-2xl neu-button min-h-[44px] cursor-pointer"
              title="تبديل المستخدم وصلاحيات RBAC"
            >
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover shadow-xs"
              />
              <div className="text-right hidden sm:block">
                <span className="text-xs sm:text-sm font-bold text-[#182E20] block leading-tight">
                  {currentUser.name}
                </span>
                <span className="text-xs text-[#396249] font-semibold block">
                  {currentUser.roleTitleAr}
                </span>
              </div>
              <Shield className="w-4 h-4 text-[#557362] stroke-[2.2]" />
            </button>

            {/* Switch User Dropdown */}
            {showRoleDropdown && (
              <div className="absolute left-0 mt-3 w-76 sm:w-80 neu-raised-lg rounded-3xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-2 py-1.5 border-b border-[#C8D3CC]/60 mb-2">
                  <span className="text-xs sm:text-sm font-bold text-[#182E20] block font-serif-display">تبديل المستخدم (RBAC)</span>
                  <span className="text-xs text-[#5D7B6B]">اختر حساباً لتجربة الصلاحيات المختلفة</span>
                </div>
                <div className="space-y-2">
                  {users.map((u) => {
                    const isCurrent = u.id === currentUser.id;
                    const roleCfg = ROLE_LABELS[u.role];
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleSwitchUser(u.id)}
                        className={`w-full text-right p-3 rounded-2xl flex items-center justify-between transition cursor-pointer min-h-[46px] ${
                          isCurrent
                            ? 'neu-inset font-bold text-[#142A1D]'
                            : 'neu-raised-sm hover:neu-inset text-[#304B3B]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-[#5A7767] truncate">{u.roleTitleAr}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${roleCfg.badgeColor}`}>
                          {u.role}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
