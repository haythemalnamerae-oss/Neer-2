import { apiRequest, getSession } from '../api/session';

export type CapturedLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type FieldEventType =
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
