import { apiRequest, getSession, loadUiSnapshot } from '../lib/api/session';
import type { SystemSettings } from '../lib/storage';

export async function saveOrganizationSettings(settings: Partial<SystemSettings>): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('انتهت الجلسة. سجّل الدخول مجددًا.');
  await apiRequest(session, '/settings/save', {
    method: 'POST',
    body: JSON.stringify({ settings }),
  });
  await loadUiSnapshot(session);
}
