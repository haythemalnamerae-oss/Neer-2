import React, { useMemo, useState } from 'react';
import {
  Users,
  Phone,
  Mail,
  Search,
  ClipboardList,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { ROLE_LABELS } from '../../lib/rbac/permissions';
import { formatCurrency } from '../../lib/utils/format';
import { Badge } from '../ui/badge';

export const TeamView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const users = dataStore.getUsers();
  const tasks = dataStore.getTasks();
  const funds = dataStore.getFunds();
  const visibleUsers = useMemo(() => users.filter((user) => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [user.name, user.department, user.email, user.phone, user.roleTitleAr]
      .some((value) => (value || '').toLowerCase().includes(query));
  }), [users, roleFilter, searchQuery]);
  const activeUsers = users.filter((user) => user.active).length;
  const activeTasks = tasks.filter((task) => !['completed', 'approved', 'cancelled'].includes(task.status)).length;

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

        <div className="flex flex-wrap gap-2">
          <Badge variant="purple" size="md">{users.length} أعضاء</Badge>
          <Badge variant="success" size="md">{activeUsers} نشطون</Badge>
          <Badge variant="info" size="md">{activeTasks} مهام مفتوحة</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_220px]">
        <label className="relative block">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ابحث بالاسم أو القسم أو وسيلة التواصل" className="min-h-11 w-full rounded-xl border border-slate-200 pr-9 pl-3 text-sm" />
        </label>
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm">
          <option value="all">كل الأدوار</option>
          <option value="admin">مدير النظام</option>
          <option value="ops_manager">مدير العمليات</option>
          <option value="finance_officer">المسؤول المالي</option>
          <option value="field_officer">المسؤول الميداني</option>
          <option value="viewer">مراقب</option>
        </select>
      </div>

      {/* Team members */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleUsers.map((user) => {
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
        {visibleUsers.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            <ClipboardList className="mx-auto mb-2 h-7 w-7 text-slate-400" />
            لا يوجد أعضاء يطابقون البحث والتصفية.
          </div>
        )}
      </div>
    </div>
  );
};
