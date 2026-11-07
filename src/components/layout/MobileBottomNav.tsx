import React from 'react';
import { LayoutDashboard, Wallet, CheckSquare, Menu } from 'lucide-react';
import { hasPermission } from '../../lib/rbac/permissions';
import { dataStore } from '../../lib/storage';

interface MobileBottomNavProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenMore: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentView, onSelectView, onOpenMore }) => {
  const user = dataStore.getCurrentUser();
  const navItems = [
    { id: 'daily', label: 'الرئيسية', icon: LayoutDashboard, module: 'dashboard' },
    { id: 'tasks', label: 'المهام', icon: CheckSquare, module: 'tasks' },
    { id: 'funds', label: 'العهد', icon: Wallet, module: 'funds' },
  ].filter((item) => hasPermission(user.role, item.module, 'view'));
  const moreViews = ['approvals','dashboard','followUps','expenses','settlements','calendar','reports','team','users','roles','audit','settings','codeViewer'];
  const moreSelected = moreViews.includes(currentView);

  return (
    <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_6px_24px_rgba(20,40,26,.12)] backdrop-blur-md">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.id;
          return <button key={item.id} aria-current={active ? 'page' : undefined} onClick={() => onSelectView(item.id)} className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600'}`}>
            <Icon className="h-5 w-5" aria-hidden="true"/><span>{item.label}</span>
          </button>;
        })}
        <button aria-current={moreSelected ? 'page' : undefined} onClick={onOpenMore} className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${moreSelected ? 'bg-emerald-50 text-emerald-900' : 'text-slate-600'}`}>
          <Menu className="h-5 w-5" aria-hidden="true"/><span>المزيد</span>
        </button>
      </div>
    </nav>
  );
};
