import React, { useEffect, useMemo, useState } from 'react';
import { Check, Save, Shield, X } from 'lucide-react';
import { Role } from '../../types/domain';
import { ROLE_PERMISSIONS, ROLE_LABELS } from '../../lib/rbac/permissions';
import { getSession, apiRequest } from '../../lib/api/session';

type Permission = { permission_key: string; module_key: string; action_key: 'view'|'create'|'edit'|'delete'|'approve'; label_ar: string };
type Grant = { role_key: string; permission_key: string; granted: boolean };
const roleKeys: Role[] = ['admin','ops_manager','finance_officer','field_officer','viewer'];
const actions = [
  { id: 'view', label: 'عرض' }, { id: 'create', label: 'إنشاء' }, { id: 'edit', label: 'تعديل' },
  { id: 'delete', label: 'حذف' }, { id: 'approve', label: 'اعتماد' },
] as const;
const fallbackModules = [
  ['dashboard','لوحة المؤشرات والتحليلات'],['tasks','المهام الميدانية والمشاريع'],['followUps','المتابعات'],
  ['funds','العهد النقدية والأرصدة'],['expenses','المصروفات والفواتير'],['settlements','التسويات'],
  ['calendar','التقويم'],['reports','التقارير'],['team','الفريق'],['users','إدارة المستخدمين'],
  ['roles','الأدوار والصلاحيات'],['audit','سجل التدقيق'],['settings','إعدادات النظام'],['aiAdvisor','المساعد الذكي'],
] as const;

export const RolesView: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role>('ops_manager');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const session = getSession();
  const isAdmin = session?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    if (!session) { setError('سجّل الدخول بجلسة Supabase لعرض الصلاحيات.'); setLoading(false); return; }
    apiRequest<{ permissions: Permission[]; grants: Grant[] }>(session, '/admin/permissions')
      .then((result) => { if (!cancelled) { setPermissions(result.permissions); setGrants(result.grants); setError(''); } })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الصلاحيات.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.accessToken, session?.organizationId]);

  const modules = useMemo(() => permissions.length
    ? [...new Map(permissions.map((item) => [item.module_key, item.module_key])).keys()].map((key) => ({ id: key, label: permissions.find((p) => p.module_key === key)?.label_ar || key }))
    : fallbackModules.map(([id,label]) => ({ id, label })), [permissions]);

  const hasGrant = (role: Role, module: string, action: string) => {
    if (role === 'admin') return ROLE_PERMISSIONS.admin[module]?.[action as keyof (typeof ROLE_PERMISSIONS.admin)[string]] ?? false;
    const key = `${module}.${action}`;
    const saved = grants.find((grant) => grant.role_key === role && grant.permission_key === key);
    if (saved) return saved.granted;
    return ROLE_PERMISSIONS[role]?.[module]?.[action as 'view'|'create'|'edit'|'delete'|'approve'] ?? false;
  };

  const toggle = (module: string, action: string) => {
    if (!isAdmin || selectedRole === 'admin') return;
    const permissionKey = `${module}.${action}`;
    const granted = !hasGrant(selectedRole, module, action);
    setGrants((current) => [...current.filter((item) => !(item.role_key === selectedRole && item.permission_key === permissionKey)), { role_key: selectedRole, permission_key: permissionKey, granted }]);
    setNotice('');
  };

  const save = async () => {
    if (!session || !isAdmin || selectedRole === 'admin') return;
    setSaving(true); setError(''); setNotice('');
    try {
      const roleGrants = modules.flatMap((module) => actions.map((action) => ({ permissionKey: `${module.id}.${action.id}`, granted: hasGrant(selectedRole, module.id, action.id) })));
      const result = await apiRequest<{ grants: Grant[] }>(session, `/admin/permissions/${selectedRole}`, { method: 'PUT', body: JSON.stringify({ grants: roleGrants }) });
      setGrants((current) => [...current.filter((item) => item.role_key !== selectedRole), ...result.grants]);
      setNotice('تم حفظ الصلاحيات في قاعدة البيانات.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ الصلاحيات.'); }
    finally { setSaving(false); }
  };

  return <div dir="rtl" className="space-y-5">
    <header className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="flex items-center gap-2 text-sm font-bold text-emerald-800"><Shield className="h-5 w-5"/> إدارة صلاحيات النظام</p><h2 className="mt-1 text-xl font-black text-slate-900">مصفوفة الأدوار والصلاحيات</h2><p className="mt-1 text-sm text-slate-600">الصلاحيات محفوظة في Supabase وتُفحص على الخادم عند كل طلب API.</p></div>
      {isAdmin && selectedRole !== 'admin' && <button onClick={save} disabled={saving || loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}</button>}
    </header>
    {!isAdmin && <div role="status" className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">عرض فقط. يلزم دور مدير النظام لتعديل مصفوفة الأذونات.</div>}
    {error && <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
    <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-sm">
      {roleKeys.map((role) => <button key={role} onClick={() => setSelectedRole(role)} className={`rounded-xl px-4 py-2 text-sm font-bold ${selectedRole === role ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'}`}>{ROLE_LABELS[role].titleAr}</button>)}
    </div>
    <section className="overflow-hidden rounded-3xl bg-white p-3 shadow-sm sm:p-5">
      <div className="mb-4"><h3 className="font-black text-slate-900">{ROLE_LABELS[selectedRole].titleAr}</h3><p className="mt-1 text-sm text-slate-600">{ROLE_LABELS[selectedRole].description}</p></div>
      {loading ? <p className="p-6 text-center text-slate-500">جارٍ تحميل الأذونات...</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-right text-sm"><thead><tr className="border-b text-slate-600"><th className="p-3">الوحدة</th>{actions.map((action) => <th key={action.id} className="p-3 text-center">{action.label}</th>)}</tr></thead><tbody>{modules.map((module) => <tr key={module.id} className="border-b last:border-0"><th className="p-3 font-semibold text-slate-800">{module.label}</th>{actions.map((action) => { const granted = hasGrant(selectedRole,module.id,action.id); return <td key={action.id} className="p-3 text-center"><button aria-label={`${granted ? 'إلغاء' : 'منح'} ${action.label}: ${module.label}`} aria-pressed={granted} disabled={!isAdmin || selectedRole === 'admin'} onClick={() => toggle(module.id,action.id)} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl disabled:cursor-not-allowed ${granted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{granted ? <Check className="h-4 w-4"/> : <X className="h-4 w-4"/>}</button></td>; })}</tr>)}</tbody></table></div>}
    </section>
  </div>;
};
