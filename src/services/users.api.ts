import { apiRequest, getSession, loadUiSnapshot } from '../lib/api/session';
import type { Role } from '../types/domain';

export class UserInviteSavedRefreshError extends Error {
  constructor(message: string) { super(message); this.name = 'UserInviteSavedRefreshError'; }
}

export async function inviteOrganizationUser(input: {
  name: string; email: string; role: Exclude<Role, 'admin'>; phone?: string; department?: string;
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('يلزم تسجيل الدخول قبل دعوة مستخدم.');
  await apiRequest(session, '/users/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  try {
    await loadUiSnapshot(getSession() || session);
  } catch (error) {
    console.error('User invitation succeeded but snapshot refresh failed:', error);
    throw new UserInviteSavedRefreshError('تم إرسال الدعوة وربط العضوية، لكن تعذر تحديث القائمة. أعد تحميل الصفحة ولا تكرر الدعوة.');
  }
}
