import React from 'react';
import { LayoutDashboard, Wallet, CheckSquare, Menu, FileCheck2 } from 'lucide-react';
import { hasPermission } from '../../lib/rbac/permissions';
import { dataStore } from '../../lib/storage';

interface MobileBottomNavProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenMore: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onSelectView,
  onOpenMore,
}) => {
  const user = dataStore.getCurrentUser();
  const navItems = [
    { id: 'daily', label: 'الرئيسية', icon: LayoutDashboard, module: 'dashboard' },
    { id: 'tasks', label: 'المهام', icon: CheckSquare, module: 'tasks' },
    { id: 'approvals', label: 'الاعتمادات', icon: FileCheck2, module: 'tasks' },
    { id: 'funds', label: 'العهد', icon: Wallet, module: 'funds' },
  ].filter((item) => hasPermission(user.role, item.module, 'view'));

  const moreViews = [
    'dashboard',
    'followUps',
    'expenses',
    'settlements',
    'calendar',
    'reports',
    'team',
    'users',
    'roles',
    'audit',
    'settings',
    'codeViewer',
  ];
  const moreSelected = moreViews.includes(currentView);

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-30 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
    >
      <div
        className="mx-auto flex max-w-md items-stretch gap-1 rounded-[24px] bg-[#F4F7F5]/95 p-1.5 backdrop-blur-md border border-white/80"
        style={{
          boxShadow: '0 12px 30px rgba(22, 44, 34, 0.16), 0 2px 6px rgba(0, 0, 0, 0.06)',
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelectView(item.id)}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold font-sans-inter transition-all cursor-pointer ${
                active
                  ? 'bg-[#2A443B] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          aria-current={moreSelected ? 'page' : undefined}
          onClick={onOpenMore}
          className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold font-sans-inter transition-all cursor-pointer ${
            moreSelected
              ? 'bg-[#2A443B] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          <Menu className="h-4.5 w-4.5" aria-hidden="true" />
          <span>المزيد</span>
        </button>
      </div>
    </nav>
  );
};
