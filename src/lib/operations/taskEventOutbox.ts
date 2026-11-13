import { apiRequest, getSession, type ApiSession } from '../api/session';

export type TaskOutboxStatus = 'synced' | 'pending' | 'blocked';

type QueuedTaskEvent = {
  id: string;
  organizationId: string;
  userId: string;
  taskId: string;
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  state: 'pending' | 'blocked';
  lastError?: string;
};

const DB_NAME = 'neer-task-event-outbox-v1';
const STORE_NAME = 'events';
let dbPromise: Promise<IDBDatabase> | null = null;
let flushInFlight: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('التخزين المحلي الآمن للأحداث غير متاح في هذا المتصفح.'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('تعذر فتح طابور الأحداث المحلي.'));
      request.onblocked = () => reject(new Error('تحديث مخزن الأحداث المحلي محجوب بواسطة تبويب آخر.'));
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function allEvents(): Promise<QueuedTaskEvent[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as QueuedTaskEvent[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error || new Error('تعذر قراءة طابور الأحداث.'));
  });
}

async function putEvent(event: QueuedTaskEvent): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('تعذر حفظ الحدث محلياً.'));
    tx.onabort = () => reject(tx.error || new Error('تم إلغاء حفظ الحدث المحلي.'));
  });
}

async function deleteEvent(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('تعذر حذف الحدث الذي تمت مزامنته.'));
  });
}

function sameIdentity(event: QueuedTaskEvent, session: ApiSession): boolean {
  return event.organizationId === session.organizationId && event.userId === session.userId;
}

/** Flushes FIFO events only for the exact account and organization that created them. */
export async function flushTaskEventOutbox(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const session = getSession();
  if (!session) return;

  flushInFlight = (async () => {
    const events = await allEvents();
    for (const event of events) {
      if (!sameIdentity(event, session)) continue;
      if (event.state === 'blocked') break;
      try {
        await apiRequest(session, event.path, { method: 'POST', body: JSON.stringify(event.body) });
        await deleteEvent(event.id);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذرت مزامنة الحدث.';
        const statusMatch = message.match(/API \((\d{3})\)/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        const blocked = status >= 400 && status < 500 && status !== 408 && status !== 429;
        await putEvent({
          ...event,
          attempts: event.attempts + 1,
          state: blocked ? 'blocked' : 'pending',
          lastError: message.slice(0, 500),
        });
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
        // Preserve FIFO ordering: do not send later lifecycle events past a failed predecessor.
        break;
      }
    }
  })().finally(() => { flushInFlight = null; });
  return flushInFlight;
}

export async function enqueueTaskEvent(input: {
  taskId: string;
  path: string;
  body: Record<string, unknown>;
  clientEventId: string;
}): Promise<TaskOutboxStatus> {
  const session = getSession();
  if (!session) throw new Error('انتهت جلسة الدخول. سجّل الدخول لحفظ الحدث وربطه بحسابك.');
  const event: QueuedTaskEvent = {
    id: input.clientEventId,
    organizationId: session.organizationId,
    userId: session.userId,
    taskId: input.taskId,
    path: input.path,
    body: input.body,
    createdAt: new Date().toISOString(),
    attempts: 0,
    state: 'pending',
  };
  await putEvent(event);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
  await flushTaskEventOutbox();
  const remaining = (await allEvents()).find((item) => item.id === event.id);
  return remaining ? (remaining.state === 'blocked' ? 'blocked' : 'pending') : 'synced';
}

export async function getTaskEventOutboxSummary(): Promise<{ pending: number; blocked: number }> {
  const session = getSession();
  if (!session) return { pending: 0, blocked: 0 };
  const events = (await allEvents()).filter((event) => sameIdentity(event, session));
  return {
    pending: events.filter((event) => event.state === 'pending').length,
    blocked: events.filter((event) => event.state === 'blocked').length,
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushTaskEventOutbox(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushTaskEventOutbox();
  });
  void flushTaskEventOutbox();
}
