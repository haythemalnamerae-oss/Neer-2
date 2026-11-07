import React from 'react';
import {
  Target,
  LayoutDashboard,
  Wallet,
  CheckSquare,
  Settings,
} from 'lucide-react';

interface MobileBottomNavProps {
  currentView: string;
  onSelectView: (view: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onSelectView,
}) => {
  const navItems = [
    {
      id: 'daily',
      label: 'الرئيسية',
      icon: Target,
    },
    {
      id: 'dashboard',
      label: 'المؤشرات',
      icon: LayoutDashboard,
    },
    {
      id: 'funds',
      label: 'العهد',
      icon: Wallet,
    },
    {
      id: 'tasks',
      label: 'المهام',
      icon: CheckSquare,
    },
    {
      id: 'settings',
      label: 'الإعدادات',
      icon: Settings,
    },
  ];

  return (
    <nav className="fixed bottom-3 inset-x-3 z-30 lg:hidden select-none">
      <div className="neu-raised-lg rounded-3xl p-2 flex items-center justify-around gap-1">
        {navItems.map((item) => {
          const isSelected = currentView === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer min-h-[52px] ${
                isSelected
                  ? 'neu-inset text-[#152D1F] font-black'
                  : 'text-[#486856] hover:neu-raised-sm active:neu-inset'
              }`}
            >
              <Icon className={`w-6 h-6 stroke-[2.2] transition-transform ${isSelected ? 'scale-110 text-[#255237]' : ''}`} />
              <span className={`text-[11px] mt-1 font-bold ${isSelected ? 'text-[#152D1F]' : 'text-[#486856]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
