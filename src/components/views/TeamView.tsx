import React from 'react';
import {
  Users,
  Phone,
  Mail,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { ROLE_LABELS } from '../../lib/rbac/permissions';
import { formatCurrency } from '../../lib/utils/format';
import { Badge } from '../ui/badge';

export const TeamView: React.FC = () => {
  const users = dataStore.getUsers();
  const tasks = dataStore.getTasks();
  const funds = dataStore.getFunds();

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Header */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#355F47] font-bold text-xs uppercase mb-1">
            <Users className="w-5 h-5 stroke-[2.2]" />
            <span>فريق العمل والمسؤولون الميدانيون</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">سجل أعضاء الفريق والمسؤوليات</h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            بيانات الاتصال الميدانية، المهام الحالية والعهد النقدية الموكلة لكل عضو
          </p>
        </div>

        <Badge variant="purple" size="md">
          {users.length} مستخدمين مسجلين
        </Badge>
      </div>

      {/* Grid of Users */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => {
          const userTasks = tasks.filter((t) => t.assigneeId === user.id);
          const activeTasks = userTasks.filter((t) => t.status !== 'completed' && t.status !== 'approved');
          const userFunds = funds.filter((f) => f.holderId === user.id);
          const roleCfg = ROLE_LABELS[user.role] || { label: user.role, badgeColor: 'text-[#4A6857]' };

          return (
            <div key={user.id} className="neu-raised rounded-3xl p-6 sm:p-7 space-y-5 transition-all">
              {/* User Avatar & Role */}
              <div className="flex items-start gap-4">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-14 h-14 rounded-2xl object-cover shadow-xs shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-black text-base sm:text-lg text-[#142B1D] truncate font-serif-display">{user.name}</h3>
                  <p className="text-xs text-[#527060] truncate font-medium mt-0.5">{user.department}</p>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full neu-inset-sm mt-2 inline-block ${roleCfg.badgeColor}`}>
                    {user.roleTitleAr}
                  </span>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2 pt-3 border-t border-[#C8D3CC]/50 text-xs sm:text-sm text-[#466554]">
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-[#355E46] stroke-[2.2]" />
                  <span className="font-mono text-xs truncate">{user.email}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-[#355E46] stroke-[2.2]" />
                  <span className="font-mono text-xs">{user.phone}</span>
                </div>
              </div>

              {/* Stats & Funds */}
              <div className="grid grid-cols-2 gap-3 p-4 neu-inset rounded-2xl text-xs sm:text-sm text-[#405F4D]">
                <div>
                  <span className="text-xs text-[#5D7A6A] block font-semibold">المهام الجارية</span>
                  <strong className="text-base font-black text-[#142B1D] font-mono">{activeTasks.length} مهام</strong>
                </div>
                <div>
                  <span className="text-xs text-[#5D7A6A] block font-semibold">العهد الموكلة</span>
                  <strong className="text-base font-black text-[#265338] font-mono">{userFunds.length} عهدة</strong>
                </div>
              </div>

              {userFunds.length > 0 && (
                <div className="space-y-1.5 text-xs sm:text-sm">
                  <span className="text-xs font-bold text-[#506E5E] block">العهدة الحالية:</span>
                  <div className="p-3 rounded-2xl neu-raised-sm text-[#183122] flex justify-between items-center text-xs">
                    <span className="font-bold truncate">{userFunds[0].name}</span>
                    <strong className="font-mono text-sm">{formatCurrency(userFunds[0].currentBalance)}</strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
