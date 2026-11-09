import { apiRequest, getSession } from '../api/session';

export type CapturedLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type FieldEventType =
  | 'location_sample'
  | 'visit_started' | 'visit_paused' | 'visit_resumed' | 'visit_completed'
  | 'task_started' | 'task_paused' | 'task_resumed' | 'task_completed'
  | 'subtask_created' | 'expense_recorded' | 'invoice_attached'
  | 'follow_up_scheduled' | 'note_added' | 'status_changed' | 'location_unavailable';

export class FieldLocationError extends Error {
  constructor(message: string, public readonly reason: 'unsupported' | 'permission_denied' | 'services_disabled' | 'timeout' | 'unavailable') {
    super(message);
    this.name = 'FieldLocationError';
  }
}

/**
 * Field actions require a fresh GPS fix. Browser APIs cannot turn Android GPS
 * on; they can only request a location and surface the device's failure state.
 */
export function captureRequiredLocation(): Promise<CapturedLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new FieldLocationError('هذا الجهاز أو المتصفح لا يتيح خدمة تحديد الموقع. افتح النظام من جهاز يدعم GPS.', 'unsupported'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracy,
      }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new FieldLocationError('إذن الموقع مرفوض. اسمح للتطبيق بالوصول إلى الموقع ثم أعد المحاولة.', 'permission_denied'));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new FieldLocationError('خدمة GPS متوقفة أو لا يمكن الحصول على موقع حالي. فعّل خدمات الموقع وحاول مجدداً.', 'services_disabled'));
        } else if (error.code === error.TIMEOUT) {
          reject(new FieldLocationError('انتهت مهلة تحديد الموقع. تأكد من تشغيل GPS ووجود إشارة ثم أعد المحاولة.', 'timeout'));
        } else {
          reject(new FieldLocationError('تعذر تحديد موقعك الحالي. لن يتم بدء الإجراء الميداني دون موقع موثق.', 'unavailable'));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export async function recordTaskEvent(input: {
  taskId: string;
  standingAccountId?: string;
  eventType: FieldEventType;
  eventLabel: string;
  location: CapturedLocation;
  details?: Record<string, unknown>;
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً قبل توثيق الحدث الميداني.');

  await apiRequest(session, '/task-events', {
    method: 'POST',
    body: JSON.stringify({
      task_id: input.taskId,
      standing_account_id: input.standingAccountId || null,
      event_type: input.eventType,
      event_label: input.eventLabel,
      occurred_at: new Date().toISOString(),
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_meters: input.location.accuracyMeters,
      location_status: 'captured',
      client_event_id: crypto.randomUUID(),
      details: input.details || {},
    }),
  });
}


export async function recordFieldLifecycleEvent(input: {
  taskId: string;
  eventType: Extract<FieldEventType, 'visit_started' | 'visit_paused' | 'visit_resumed' | 'visit_completed' | 'task_started' | 'task_paused' | 'task_resumed' | 'task_completed'>;
  eventLabel: string;
  location: CapturedLocation;
  details?: Record<string, unknown>;
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً قبل توثيق الحدث الميداني.');
  await apiRequest(session, '/task-events/lifecycle', {
    method: 'POST',
    body: JSON.stringify({
      task_id: input.taskId,
      event_type: input.eventType,
      event_label: input.eventLabel,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_meters: input.location.accuracyMeters,
      client_event_id: crypto.randomUUID(),
      details: input.details || {},
    }),
  });
}

const activeLocationWatches = new Map<string, number>();
const LOCATION_SAMPLE_INTERVAL_MS = 60_000;

async function recordLocationUnavailable(taskId: string, reason: FieldLocationError['reason']) {
  const session = getSession();
  if (!session) return;
  const status = reason === 'permission_denied' ? 'permission_denied'
    : reason === 'services_disabled' ? 'services_disabled'
    : reason === 'timeout' ? 'timeout' : 'unavailable';
  await apiRequest(session, '/task-events', {
    method: 'POST',
    body: JSON.stringify({
      task_id: taskId,
      event_type: 'location_unavailable',
      event_label: 'فقدان إشارة الموقع أثناء التنفيذ',
      occurred_at: new Date().toISOString(),
      location_status: status,
      client_event_id: crypto.randomUUID(),
      details: { reason },
    }),
  });
}

/** Samples the foreground browser location once per minute while a visit is active. */
export function startFieldLocationTracking(taskId: string): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation || activeLocationWatches.has(taskId)) return;
  let lastRecordedAt = Date.now();
  let failureRecorded = false;
  const watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      if (failureRecorded) {
        failureRecorded = false;
        lastRecordedAt = 0;
        if (typeof window !== 'undefined') window.alert('تم استعادة إشارة الموقع؛ استؤنف توثيق مسار الزيارة تلقائياً.');
      }
      if (Date.now() - lastRecordedAt < LOCATION_SAMPLE_INTERVAL_MS) return;
      lastRecordedAt = Date.now();
      void recordTaskEvent({
        taskId,
        eventType: 'location_sample',
        eventLabel: 'تحديث موقع الزيارة تلقائياً',
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
        },
        details: { source: 'foreground_watch' },
      }).catch((error) => console.error('Field location sample was not saved:', error));
    },
    (error) => {
      if (failureRecorded) return;
      failureRecorded = true;
      const reason = error.code === error.PERMISSION_DENIED ? 'permission_denied'
        : error.code === error.POSITION_UNAVAILABLE ? 'services_disabled' : 'timeout';
      void recordLocationUnavailable(taskId, reason).catch((saveError) => {
        console.error('Could not save location-unavailable event:', saveError);
      });
      if (typeof window !== 'undefined') window.alert('فُقد اتصال الموقع أثناء الزيارة. تأكد من تشغيل GPS والسماح بالموقع؛ سيواصل النظام محاولة استعادته تلقائياً.');
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  );
  activeLocationWatches.set(taskId, watchId);
}

export function stopFieldLocationTracking(taskId: string): void {
  const watchId = activeLocationWatches.get(taskId);
  if (watchId === undefined) return;
  navigator.geolocation.clearWatch(watchId);
  activeLocationWatches.delete(taskId);
}
