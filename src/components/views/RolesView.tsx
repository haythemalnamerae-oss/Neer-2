import React, { useState } from 'react';
import {
  Shield,
  Check,
  X,
  Lock,
  Eye,
  Edit,
  Trash,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import { Role } from '../../types/domain';
import { ROLE_PERMISSIONS, ROLE_LABELS } from '../../lib/rbac/permissions';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

export const RolesView: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role>('admin');

  const modules = [
    { id: 'dashboard', label: 'لوحة المؤشرات والتحليلات' },
    { id: 'tasks', label: 'المهام الميدانية والمشاريع' },
    { id: 'funds', label: 'العهد النقدية والأرصدة' },
    { id: 'expenses', label: 'المصروفات والفواتير (ضريبة 5%)' },
    { id: 'settlements', label: 'التسويات وسندات الصرف' },
    { id: 'reports', label: 'التقارير التحليلية و KPIs' },
    { id: 'users', label: 'إدارة المستخدمين' },
    { id: 'roles', label: 'مصفوفة الصلاحيات' },
    { id: 'audit', label: 'سجل التدقيق الأمني' },
    { id: 'settings', label: 'إعدادات وسياسات النظام' },
  ];

  const actions = [
    { id: 'view', label: 'عرض (View)' },
    { id: 'create', label: 'إنشاء (Create)' },
    { id: 'edit', label: 'تعديل (Edit)' },
    { id: 'delete', label: 'حذف (Delete)' },
    { id: 'approve', label: 'اعتماد (Approve)' },
  ];

  const currentRolePerms = ROLE_PERMISSIONS[selectedRole] || {};

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Banner */}
      <div className="neu-raised-lg p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs uppercase mb-1">
            <Shield className="w-5 h-5 text-emerald-700" />
            <span className="tracking-wide">مصفوفة الصلاحيات القائمة على الأدوار (RBAC Matrix)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 font-serif">حوكمة وصلاحيات الأدوار الوظيفية</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            التحكم الدقيق بصلاحيات العرض والإضافة والتعديل والاعتماد لكل دور تشغيلي
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex flex-wrap gap-2 neu-inset-sm p-2 rounded-2xl text-xs font-bold">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => setSelectedRole(r)}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer font-bold ${
                selectedRole === r
                  ? 'neu-raised text-emerald-800 bg-[#EAF0EC] font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {ROLE_LABELS[r].titleAr}
            </button>
          ))}
        </div>
      </div>

      {/* Role Info Summary Card */}
      <div className="neu-inset-sm p-4.5 rounded-2xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl neu-raised text-emerald-800 flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-slate-800">
              الدور المحدد: {ROLE_LABELS[selectedRole].titleAr} ({selectedRole})
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {ROLE_LABELS[selectedRole].description}
            </p>
          </div>
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="neu-raised-lg rounded-3xl overflow-hidden p-3 sm:p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="p-3.5 w-1/3 text-slate-700 font-extrabold">الوحدة / القسم (Module)</th>
                {actions.map((act) => (
                  <th key={act.id} className="p-3.5 text-center text-slate-700 font-extrabold">
                    {act.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => {
                const modPerm = currentRolePerms[mod.id] || {
                  view: false,
                  create: false,
                  edit: false,
                  delete: false,
                  approve: false,
                };

                return (
                  <tr key={mod.id} className="transition-colors hover:bg-black/[0.02]">
                    <td className="p-3.5 font-bold text-slate-800">
                      {mod.label}
                    </td>

                    {actions.map((act) => {
                      const isAllowed = modPerm[act.id as keyof typeof modPerm];
                      return (
                        <td key={act.id} className="p-3.5 text-center">
                          {isAllowed ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl neu-raised text-emerald-700">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl neu-inset-sm text-slate-400">
                              <X className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
