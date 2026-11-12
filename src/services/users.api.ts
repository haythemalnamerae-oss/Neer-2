import { apiRequest, getSession, loadUiSnapshot } from '../lib/api/session';
import type { Role } from '../types/domain';

export async function inviteOrganizationUser(input: {
  name: string; email: string; role: Exclude<Role, 'admin'>; phone?: string; department?: string;
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('يلزم تسجيل الدخول قبل دعوة مستخدم.');
  await apiRequest(session, '/users/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  await loadUiSnapshot(getSession() || session);
}
