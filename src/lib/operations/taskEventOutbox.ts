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
  sequence?: number;
  attempts: number;
  state: 'pending' | 'blocked';
  lastError?: string;
};

const DB_NAME = 'neer-task-event-outbox-v1';
const STORE_NAME = 'events';
const META_STORE_NAME = 'meta';
let dbPromise: Promise<IDBDatabase> | null = null;
let flushInFlight: Promise<void> | null = null;
let flushRequested = false;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('التخزين المحلي للأحداث غير متاح في هذا المتصفح.'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      let settled = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META_STORE_NAME)) db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        // Close stale connections when another tab upgrades the outbox schema.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        resolve(db);
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error || new Error('تعذر فتح طابور الأحداث المحلي.'));
      };
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        reject(new Error('تحديث مخزن الأحداث المحلي محجوب بواسطة تبويب آخر. أغلق التبويبات القديمة ثم أعد المحاولة.'));
      };
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
    request.onsuccess = () => resolve((request.result as QueuedTaskEvent[]).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
    request.onerror = () => reject(request.error || new Error('تعذر قراءة طابور الأحداث.'));
  });
}

async function enqueueEventAtomically(input: {
  id: string;
  organizationId: string;
  userId: string;
  taskId: string;
  path: string;
  body: Record<string, unknown>;
}): Promise<QueuedTaskEvent> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    const eventsStore = tx.objectStore(STORE_NAME);
    const metaStore = tx.objectStore(META_STORE_NAME);
    const allRequest = eventsStore.getAll();
    const sequenceRequest = metaStore.get('sequence');
    let allReady = false;
    let sequenceReady = false;
    let existingEvents: QueuedTaskEvent[] = [];
    let previousSequence = 0;
    let createdEvent: QueuedTaskEvent | null = null;
    let failure: Error | null = null;

    const commitIfReady = () => {
      if (!allReady || !sequenceReady || createdEvent || failure) return;
      const sameUserEvents = existingEvents.filter((event) =>
        event.organizationId === input.organizationId && event.userId === input.userId
      );
      if (input.path.endsWith('/lifecycle') && sameUserEvents.some((event) =>
        event.taskId === input.taskId && event.path.endsWith('/lifecycle')
      )) {
        failure = new Error('يوجد حدث بدء أو إيقاف أو استئناف لهذه المهمة لم تتم مزامنته بعد. انتظر المزامنة قبل تسجيل انتقال آخر حتى لا تتعارض حالة المهمة.');
        tx.abort();
        return;
      }
      const lastCreatedAt = sameUserEvents.reduce((latest, event) =>
        Math.max(latest, Date.parse(event.createdAt) || 0), 0
      );
      createdEvent = {
        id: input.id,
        organizationId: input.organizationId,
        userId: input.userId,
        taskId: input.taskId,
        path: input.path,
        body: input.body,
        createdAt: new Date(Math.max(Date.now(), lastCreatedAt + 1)).toISOString(),
        sequence: previousSequence + 1,
        attempts: 0,
        state: 'pending',
      };
      eventsStore.add(createdEvent);
      metaStore.put({ key: 'sequence', value: previousSequence + 1 });
    };

    allRequest.onsuccess = () => {
      existingEvents = allRequest.result as QueuedTaskEvent[];
      allReady = true;
      commitIfReady();
    };
    sequenceRequest.onsuccess = () => {
      previousSequence = Number(sequenceRequest.result?.value || 0);
      sequenceReady = true;
      commitIfReady();
    };
    allRequest.onerror = () => { failure = new Error('تعذر قراءة طابور الأحداث.'); };
    sequenceRequest.onerror = () => { failure = new Error('تعذر تخصيص ترتيب الحدث المحلي.'); };
    tx.oncomplete = () => {
      if (createdEvent) resolve(createdEvent);
      else reject(failure || new Error('تعذر حفظ الحدث المحلي.'));
    };
    tx.onerror = () => reject(failure || tx.error || new Error('تعذر حفظ الحدث المحلي.'));
    tx.onabort = () => reject(failure || tx.error || new Error('تم إلغاء حفظ الحدث المحلي.'));
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

/** Flushes events in FIFO order for the exact identity that created them. */
export async function flushTaskEventOutbox(): Promise<void> {
  if (flushInFlight) {
    flushRequested = true;
    return flushInFlight;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const session = getSession();
  if (!session) return;

  flushInFlight = (async () => {
    // Re-read after each acknowledged event so newly enqueued tail events
    // cannot be stranded behind an already-running flush.
    while (true) {
      const event = (await allEvents()).find((item) => sameIdentity(item, session));
      if (!event || event.state === 'blocked') break;
      try {
        await apiRequest(session, event.path, { method: 'POST', body: JSON.stringify(event.body) });
        await deleteEvent(event.id);
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذرت مزامنة الحدث.';
        const statusMatch = message.match(/API \((\d{3})\)|HTTP (\d{3})/i);
        const status = statusMatch ? Number(statusMatch[1] || statusMatch[2]) : 0;
        const blocked = status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
        await putEvent({
          ...event,
          attempts: event.attempts + 1,
          state: blocked ? 'blocked' : 'pending',
          lastError: message.slice(0, 500),
        });
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
        break;
      }
    }
  })().finally(() => {
    flushInFlight = null;
    if (flushRequested) {
      flushRequested = false;
      void flushTaskEventOutbox();
    }
  });
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
  const event = await enqueueEventAtomically({
    id: input.clientEventId,
    organizationId: session.organizationId,
    userId: session.userId,
    taskId: input.taskId,
    path: input.path,
    body: input.body,
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
  await flushTaskEventOutbox();
  const remaining = (await allEvents()).find((item) => item.id === event.id);
  return remaining ? (remaining.state === 'blocked' ? 'blocked' : 'pending') : 'synced';
}

export type TaskEventOutboxSummary = { pending: number; blocked: number; lastError?: string };

export async function getTaskEventOutboxSummary(): Promise<TaskEventOutboxSummary> {
  const session = getSession();
  if (!session) return { pending: 0, blocked: 0 };
  const events = (await allEvents()).filter((event) => sameIdentity(event, session));
  const blockedEvents = events.filter((event) => event.state === 'blocked');
  return {
    pending: events.filter((event) => event.state === 'pending').length,
    blocked: blockedEvents.length,
    lastError: blockedEvents[0]?.lastError,
  };
}

/** Re-queues blocked events after their cause has been corrected. */
export async function retryBlockedTaskEvents(): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('انتهت الجلسة؛ سجّل الدخول لمزامنة الأحداث.');
  const events = (await allEvents()).filter((event) => sameIdentity(event, session) && event.state === 'blocked');
  for (const event of events) await putEvent({ ...event, state: 'pending', lastError: undefined });
  if (events.length && typeof window !== 'undefined') window.dispatchEvent(new Event('neer-task-outbox-change'));
  await flushTaskEventOutbox();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushTaskEventOutbox(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushTaskEventOutbox();
  });
  void flushTaskEventOutbox();
}
