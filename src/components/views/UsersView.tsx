import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  CheckCircle2,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { ROLE_LABELS } from '../../lib/rbac/permissions';
import { Button } from '../ui/button';
import { hasPermission } from '../../lib/rbac/permissions';
import { inviteOrganizationUser } from '../../services/users.api';

export const UsersView: React.FC = () => {
  const users = dataStore.getUsers();
  const currentUser = dataStore.getCurrentUser();
  const canInvite = hasPermission(currentUser.role, 'users', 'create');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ops_manager' | 'finance_officer' | 'field_officer' | 'viewer'>('field_officer');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || saving) return;
    setSaving(true);
    try {
      await inviteOrganizationUser({ name: name.trim(), email: email.trim(), role, phone, department });
      setInviteOpen(false); setName(''); setEmail(''); setPhone(''); setDepartment('');
      window.alert('تم إرسال دعوة الدخول وربط ملف المستخدم بعضوية المؤسسة. سيكمل المستخدم إنشاء كلمة مروره من رسالة الدعوة.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر إرسال الدعوة. تحقق من إعداد خدمة دعوات Supabase.');
    } finally { setSaving(false); }
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
            عرض ملفات المستخدمين والأدوار المرتبطة بعضويات Supabase الفعلية
          </p>
        </div>

        {canInvite && <Button
          variant="primary"
          size="md"
          onClick={() => setInviteOpen(true)}
          icon={<UserPlus className="w-5 h-5 stroke-[2.5]" />}
          className="text-xs sm:text-sm font-bold min-h-[44px]"
        >
          دعوة مستخدم جديد
        </Button>}
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAddUser} className="w-full max-w-lg rounded-3xl bg-[#EAF0EC] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg text-slate-800">دعوة مستخدم إلى المؤسسة</h3>
              <button type="button" onClick={() => setInviteOpen(false)} className="text-slate-500">إغلاق</button>
            </div>
            <p className="text-xs text-slate-600">سيتم إرسال رابط دعوة عبر البريد، ولا يتم إنشاء كلمة مرور أو تخزينها في النظام.</p>
            <input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" className="w-full rounded-xl p-3"/>
            <input required type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="البريد الإلكتروني" className="w-full rounded-xl p-3"/>
            <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full rounded-xl p-3">
              <option value="field_officer">موظف ميداني</option>
              <option value="ops_manager">مدير عمليات</option>
              <option value="finance_officer">مسؤول مالي</option>
              <option value="viewer">مشاهد</option>
            </select>
            <input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="الهاتف (اختياري)" className="w-full rounded-xl p-3"/>
            <input maxLength={100} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="القسم (اختياري)" className="w-full rounded-xl p-3"/>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>إلغاء</Button>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'جارٍ إرسال الدعوة...' : 'إرسال الدعوة'}</Button>
            </div>
          </form>
        </div>
      )}

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
