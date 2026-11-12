import React from 'react';
import {
  Users,
  UserPlus,
  CheckCircle2,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { Button } from '../ui/button';

export const UsersView: React.FC = () => {

  const users = dataStore.getUsers();

  const handleAddUser = () => {
    window.alert('لإنشاء مستخدم فعلي، أنشئ دعوة له من Supabase Auth ثم اربط حسابه بعضوية المؤسسة وملف app_users. تم تعطيل الإضافة المحلية لأنها لا تنشئ حساب دخول أو عضوية حقيقية.');
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#355F47] font-bold text-xs uppercase mb-1">
            <Users className="w-5 h-5 stroke-[2.2]" />
            <span>إدارة الحسابات والمستخدمين</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">سجل المستخدمين وأذونات الوصول</h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            إضافة وتعديل بيانات مستخدمي النظام وتعيين الأدوار الوظيفية
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleAddUser}
          icon={<UserPlus className="w-5 h-5 stroke-[2.5]" />}
          className="text-xs sm:text-sm font-bold min-h-[44px]"
        >
          إضافة مستخدم جديد
        </Button>
      </div>

      {/* Users Table */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead className="text-[#4E6C5C] font-bold border-b border-[#C8D3CC]/50">
              <tr>
                <th className="p-4">المستخدم</th>
                <th className="p-4">البريد والهاتف</th>
                <th className="p-4">القسم</th>
                <th className="p-4">الدور الوظيفي (RBAC)</th>
                <th className="p-4">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D3CC]/30">
              {users.map((u) => {
                const roleCfg = ROLE_LABELS[u.role];
                return (
                  <tr key={u.id} className="hover:neu-inset transition">
                    <td className="p-4">
                      <div className="flex items-center gap-3.5">
                        <img
                          src={u.avatar}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover shadow-xs"
                        />
                        <span className="font-bold text-[#142B1D] text-sm sm:text-base">{u.name}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-[#496656]">
                      <div className="text-xs sm:text-sm">{u.email}</div>
                      <div className="text-xs text-[#638070] mt-0.5">{u.phone}</div>
                    </td>
                    <td className="p-4 text-[#304B3B] font-medium">{u.department}</td>
                    <td className="p-4">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full neu-inset-sm ${roleCfg.badgeColor}`}>
                        {u.roleTitleAr}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-[#204E32] neu-raised-sm px-3 py-1 rounded-full font-bold">
                        <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
                        نشط
                      </span>
                    </td>
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
