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
  Code2,
  RefreshCw,
  X,
  Target,
} from 'lucide-react';
import { User } from '../../types/domain';
import { hasPermission } from '../../lib/rbac/permissions';
import { dataStore } from '../../lib/storage';
import { formatCurrency } from '../../lib/utils/format';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  currentUser: User;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  currentUser,
  isOpenMobile,
  onCloseMobile,
}) => {
  const tasks = dataStore.getTasks();
  const pendingTasksCount = tasks.filter((t) => t.status === 'in_progress' || t.status === 'started').length;
  const expenses = dataStore.getExpenses();
  const pendingExpensesCount = expenses.filter((e) => e.status === 'pending_approval').length;
  const funds = dataStore.getFunds();
  const warningFundsCount = funds.filter((f) => f.status === 'warning' || f.status === 'depleted').length;
  const settlements = dataStore.getSettlements();
  const pendingApprovalsCount =
    tasks.filter((t) => t.status === 'pending_approval').length +
    expenses.filter((e) => e.status === 'pending_approval').length +
    settlements.filter((s) => s.status === 'under_review').length;

  const navGroups = [
    {
      title: 'العمليات والمهام الميدانية',
      items: [
        {
          id: 'daily',
          label: 'مركز القيادة والعمليات اليومي',
          icon: Target,
          badge: 'اليوم',
          badgeColor: 'neu-inset text-[#204A31] font-bold',
          module: 'dashboard',
        },
        {
          id: 'approvals',
          label: 'مركز الاعتمادات والرقابة',
          icon: FileCheck2,
          badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount}` : undefined,
          badgeColor: 'neu-inset text-[#662F77] font-bold',
          module: 'tasks',
        },
        {
          id: 'dashboard',
          label: 'لوحة المؤشرات والتحليلات',
          icon: LayoutDashboard,
          module: 'dashboard',
        },
        {
          id: 'tasks',
          label: 'سجل المهام والمشاريع',
          icon: CheckSquare,
          badge: pendingTasksCount > 0 ? `${pendingTasksCount}` : undefined,
          badgeColor: 'neu-inset text-[#254A66] font-bold',
          module: 'tasks',
        },
        {
          id: 'followUps',
          label: 'مركز المتابعات والمهام المتصلة',
          icon: Clock,
          module: 'followUps',
        },
        {
          id: 'calendar',
          label: 'التقويم والجدولة الميدانية',
          icon: Calendar,
          module: 'calendar',
        },
      ],
    },
    {
      title: 'الإدارة المالية والعهد النقدية',
      items: [
        {
          id: 'funds',
          label: 'العهد النقدية والأرصدة',
          icon: Wallet,
          badge: warningFundsCount > 0 ? `${warningFundsCount} حرجة` : undefined,
          badgeColor: 'neu-inset text-[#8C551C] font-bold',
          module: 'funds',
        },
        {
          id: 'expenses',
          label: 'المصروفات والفواتير',
          icon: Receipt,
          badge: pendingExpensesCount > 0 ? `${pendingExpensesCount}` : undefined,
          badgeColor: 'neu-inset text-[#245237] font-bold',
          module: 'expenses',
        },
        {
          id: 'settlements',
          label: 'التسويات وسندات الصرف',
          icon: FileCheck2,
          module: 'settlements',
        },
        {
          id: 'reports',
          label: 'التقارير التحليلية و KPIs',
          icon: BarChart3,
          module: 'reports',
        },
      ],
    },
    {
      title: 'الإدارة والرقابة والحوكمة',
      items: [
        {
          id: 'team',
          label: 'فريق العمل الميداني',
          icon: Users,
          module: 'team',
        },
        {
          id: 'users',
          label: 'إدارة المستخدمين',
          icon: Users,
          module: 'users',
        },
        {
          id: 'roles',
          label: 'مصفوفة الصلاحيات (RBAC)',
          icon: Shield,
          module: 'roles',
        },
        {
          id: 'audit',
          label: 'سجل التدقيق والنشاط الأمني',
          icon: History,
          module: 'audit',
        },
        {
          id: 'settings',
          label: 'سياسات وإعدادات النظام',
          icon: Settings,
          module: 'settings',
        },
      ],
    },
  ];

  const handleSelect = (viewId: string) => {
    onSelectView(viewId);
    onCloseMobile();
  };

  const handleResetData = () => {
    if (window.confirm('هل تريد استعادة البيانات الافتراضية التجريبية؟ سيتم تحديث السجلات.')) {
      dataStore.resetToDefault();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-[#16261C]/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-50 w-80 bg-[#EAF0EC] text-[#1E3628] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static shadow-[-12px_0_24px_#C8D3CC,12px_0_24px_#FFFFFF] ${
          isOpenMobile ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 sm:p-6 flex items-center justify-between border-b border-[#C8D3CC]/50">
          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl neu-raised flex items-center justify-center text-[#2F583E] shrink-0">
              <Wallet className="w-7 h-7 stroke-[2.3]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-[#142A1D] text-lg tracking-tight font-serif-display">
                  منظومة المهام
                </span>
                <span className="text-xs neu-inset text-[#325A41] font-bold px-2.5 py-0.5 rounded-full">
                  العهد
                </span>
              </div>
              <p className="text-xs text-[#506E5E] font-medium mt-0.5">العمليات والرقابة المالية</p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden w-11 h-11 rounded-2xl neu-button flex items-center justify-center text-[#355342] active:neu-inset transition cursor-pointer"
            title="إغلاق القائمة"
          >
            <X className="w-5.5 h-5.5 stroke-[2.3]" />
          </button>
        </div>

        {/* Navigation Links Scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* User's Personal Petty Cash Card */}
          {(() => {
            const userFund = funds.find((f) => f.holderId === currentUser.id);
            if (!userFund) return null;
            return (
              <div 
                onClick={() => handleSelect('funds')}
                className="p-4 sm:p-5 rounded-2xl neu-inset cursor-pointer transition group"
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="flex items-center gap-2 font-bold text-[#1E3628]">
                    <Wallet className="w-5 h-5 text-[#376449] stroke-[2.2] group-hover:scale-110 transition" />
                    <span className="text-sm">عهدتي الميدانية</span>
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full neu-raised-sm ${
                    userFund.status === 'warning' || userFund.status === 'depleted' 
                      ? 'text-[#A03E33]' 
                      : 'text-[#285539]'
                  }`}>
                    {userFund.status === 'warning' ? 'حرجة' : userFund.status === 'depleted' ? 'نافدة' : 'نشطة'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-xl font-black text-[#142A1D] font-mono tracking-tight">
                    {formatCurrency(userFund.currentBalance, userFund.currency)}
                  </span>
                  <span className="text-xs text-[#597867] font-medium">
                    من {formatCurrency(userFund.totalAllocation, userFund.currency)}
                  </span>
                </div>
              </div>
            );
          })()}

          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <p className="text-xs font-bold text-[#567564] uppercase tracking-wider px-3 mb-2 font-serif-display">
                {group.title}
              </p>
              {group.items.map((item) => {
                const canView = hasPermission(currentUser.role, item.module, 'view');
                const isSelected = currentView === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    disabled={!canView}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm sm:text-base font-semibold transition-all cursor-pointer min-h-[48px] ${
                      isSelected
                        ? 'neu-inset text-[#142C1D] font-black'
                        : canView
                        ? 'text-[#355140] hover:neu-raised-sm hover:text-[#142C1D]'
                        : 'text-[#879D90] cursor-not-allowed opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <Icon className={`w-5.5 h-5.5 shrink-0 stroke-[2.2] ${isSelected ? 'text-[#2D5A3C]' : 'text-[#4E705D]'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${item.badgeColor || 'neu-raised-sm text-[#466554]'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Dedicated Section for Page Codes */}
          <div className="pt-3 border-t border-[#C8D3CC]/50">
            <button
              onClick={() => handleSelect('codeViewer')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm sm:text-base font-bold transition cursor-pointer min-h-[48px] ${
                currentView === 'codeViewer'
                  ? 'neu-inset text-[#204931]'
                  : 'neu-button text-[#30573F]'
              }`}
            >
              <Code2 className="w-5.5 h-5.5 text-[#30573F] stroke-[2.2]" />
              <span>أكواد ومخططات النظام</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 sm:p-5 border-t border-[#C8D3CC]/50 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#527160]">
            <span className="font-medium">إصدار النظام v3.2 Soft UI</span>
            <button
              onClick={handleResetData}
              className="flex items-center gap-1.5 text-[#3C644E] hover:text-[#183624] font-bold transition cursor-pointer py-1 px-2 rounded-xl"
              title="استعادة البيانات الافتراضية"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تعيين</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
