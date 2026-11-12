import { Role } from '../../types/domain';

export const ROLE_PERMISSIONS: Record<Role, Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean }>> = {
  admin: {
    dashboard: { view: true, create: true, edit: true, delete: true, approve: true },
    tasks: { view: true, create: true, edit: true, delete: true, approve: true },
    followUps: { view: true, create: true, edit: true, delete: true, approve: true },
    funds: { view: true, create: true, edit: true, delete: true, approve: true },
    expenses: { view: true, create: true, edit: true, delete: true, approve: true },
    settlements: { view: true, create: true, edit: true, delete: true, approve: true },
    calendar: { view: true, create: true, edit: true, delete: true, approve: true },
    reports: { view: true, create: true, edit: true, delete: true, approve: true },
    team: { view: true, create: true, edit: true, delete: true, approve: true },
    users: { view: true, create: true, edit: true, delete: true, approve: true },
    roles: { view: true, create: true, edit: true, delete: true, approve: true },
    audit: { view: true, create: false, edit: false, delete: false, approve: false },
    settings: { view: true, create: true, edit: true, delete: true, approve: true },
    aiAdvisor: { view: true, create: true, edit: true, delete: false, approve: true },
  },
  ops_manager: {
    dashboard: { view: true, create: false, edit: false, delete: false, approve: false },
    tasks: { view: true, create: true, edit: true, delete: true, approve: true },
    followUps: { view: true, create: true, edit: true, delete: true, approve: true },
    funds: { view: true, create: false, edit: false, delete: false, approve: false },
    expenses: { view: true, create: true, edit: true, delete: false, approve: false },
    settlements: { view: true, create: false, edit: false, delete: false, approve: false },
    calendar: { view: true, create: true, edit: true, delete: true, approve: false },
    reports: { view: true, create: true, edit: false, delete: false, approve: false },
    team: { view: true, create: true, edit: true, delete: false, approve: false },
    users: { view: true, create: false, edit: false, delete: false, approve: false },
    roles: { view: true, create: false, edit: false, delete: false, approve: false },
    audit: { view: true, create: false, edit: false, delete: false, approve: false },
    settings: { view: false, create: false, edit: false, delete: false, approve: false },
    aiAdvisor: { view: true, create: true, edit: false, delete: false, approve: false },
  },
  finance_officer: {
    dashboard: { view: true, create: false, edit: false, delete: false, approve: false },
    tasks: { view: true, create: false, edit: false, delete: false, approve: false },
    followUps: { view: true, create: false, edit: false, delete: false, approve: false },
    funds: { view: true, create: true, edit: true, delete: false, approve: true },
    expenses: { view: true, create: true, edit: true, delete: true, approve: true },
    settlements: { view: true, create: true, edit: true, delete: false, approve: true },
    calendar: { view: true, create: false, edit: false, delete: false, approve: false },
    reports: { view: true, create: true, edit: true, delete: false, approve: true },
    team: { view: true, create: false, edit: false, delete: false, approve: false },
    users: { view: false, create: false, edit: false, delete: false, approve: false },
    roles: { view: false, create: false, edit: false, delete: false, approve: false },
    audit: { view: true, create: false, edit: false, delete: false, approve: false },
    settings: { view: true, create: false, edit: true, delete: false, approve: false },
    aiAdvisor: { view: true, create: true, edit: false, delete: false, approve: false },
  },
  field_officer: {
    dashboard: { view: true, create: false, edit: false, delete: false, approve: false },
    tasks: { view: true, create: false, edit: true, delete: false, approve: false },
    followUps: { view: true, create: true, edit: true, delete: false, approve: false },
    funds: { view: true, create: false, edit: false, delete: false, approve: false },
    expenses: { view: true, create: true, edit: false, delete: false, approve: false },
    settlements: { view: true, create: false, edit: false, delete: false, approve: false },
    calendar: { view: true, create: false, edit: false, delete: false, approve: false },
    reports: { view: false, create: false, edit: false, delete: false, approve: false },
    team: { view: true, create: false, edit: false, delete: false, approve: false },
    users: { view: false, create: false, edit: false, delete: false, approve: false },
    roles: { view: false, create: false, edit: false, delete: false, approve: false },
    audit: { view: false, create: false, edit: false, delete: false, approve: false },
    settings: { view: false, create: false, edit: false, delete: false, approve: false },
    aiAdvisor: { view: false, create: false, edit: false, delete: false, approve: false },
  },
  viewer: {
    dashboard: { view: true, create: false, edit: false, delete: false, approve: false },
    tasks: { view: true, create: false, edit: false, delete: false, approve: false },
    followUps: { view: true, create: false, edit: false, delete: false, approve: false },
    funds: { view: true, create: false, edit: false, delete: false, approve: false },
    expenses: { view: true, create: false, edit: false, delete: false, approve: false },
    settlements: { view: true, create: false, edit: false, delete: false, approve: false },
    calendar: { view: true, create: false, edit: false, delete: false, approve: false },
    reports: { view: true, create: false, edit: false, delete: false, approve: false },
    team: { view: true, create: false, edit: false, delete: false, approve: false },
    users: { view: false, create: false, edit: false, delete: false, approve: false },
    roles: { view: false, create: false, edit: false, delete: false, approve: false },
    audit: { view: false, create: false, edit: false, delete: false, approve: false },
    settings: { view: false, create: false, edit: false, delete: false, approve: false },
    aiAdvisor: { view: false, create: false, edit: false, delete: false, approve: false },
  },
};

export const ROLE_LABELS: Record<Role, { ar: string; en: string; label: string; titleAr: string; badgeColor: string; description: string }> = {
  admin: {
    ar: 'مدير النظام التنفيذي',
    label: 'مدير النظام',
    titleAr: 'مدير النظام الأعلى',
    en: 'System Administrator',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'صلاحيات كاملة وغير مقيدة على إدارة المستخدمين، السياسات، العهد والاعتمادات.',
  },
  ops_manager: {
    ar: 'مدير العمليات الميدانية',
    label: 'مدير العمليات',
    titleAr: 'مدير العمليات والمشاريع',
    en: 'Operations Manager',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'إشراف كامل على المهام، الجداول الزمنية، تعيين الضباط وسلاسل المتابعة.',
  },
  finance_officer: {
    ar: 'المسؤول المالي والمدقق',
    label: 'المسؤول المالي',
    titleAr: 'مدقق العهد والمصروفات',
    en: 'Finance & Audit Officer',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'إدارة وتغذية العهد النقدية، مراجعة وتدقيق الفواتير واعتماد التسويات الدورية.',
  },
  field_officer: {
    ar: 'مسؤول العمليات الميداني',
    label: 'المسؤول الميداني',
    titleAr: 'ضابط عمليات وتنفيذ',
    en: 'Field Operations Officer',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'استلام وتنفيذ المهام، بدء المؤقت، تسجيل النواتج ورفع الفواتير وإيصالات العهدة.',
  },
  viewer: {
    ar: 'مراقب / مدقق خارجي',
    label: 'مراقب عام',
    titleAr: 'مستعرض التقارير',
    en: 'Observer / Auditor',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
    description: 'استعراض التقارير ولوحات التحكم بدون صلاحيات التعديل أو الحذف.',
  },
};

type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';
let livePermissionRole: Role | null = null;
let livePermissionGrants: Record<string, boolean> | null = null;

/** Replaces cached UI permissions with grants loaded for the authenticated organization. */
export function setLivePermissionGrants(role: Role | null, grants: Record<string, boolean> | null): void {
  livePermissionRole = role;
  livePermissionGrants = grants;
}

export function hasPermission(role: Role, module: string, action: PermissionAction): boolean {
  if (livePermissionRole === role && livePermissionGrants) {
    return livePermissionGrants[`${module}.${action}`] === true;
  }
  const roleRules = ROLE_PERMISSIONS[role];
  if (!roleRules || !roleRules[module]) return false;
  return roleRules[module][action] ?? false;
}
