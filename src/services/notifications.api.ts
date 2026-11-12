import { apiRequest, getSession, loadUiSnapshot } from '../lib/api/session';

function requireNotificationSession() {
  const session = getSession();
  if (!session) throw new Error('انتهت الجلسة. سجّل الدخول مجددًا.');
  if (!session.appUserId) throw new Error('الحساب غير مرتبط بمستخدم تشغيلي.');
  return session;
}

export async function markNotificationReadOnServer(id: string): Promise<void> {
  const session = requireNotificationSession();
  await apiRequest(session, `/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: true }),
  });
  await loadUiSnapshot(session);
}

export async function markAllNotificationsReadOnServer(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const session = requireNotificationSession();
  await Promise.all(ids.map((id) => apiRequest(session, `/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: true }),
  })));
  await loadUiSnapshot(session);
}
