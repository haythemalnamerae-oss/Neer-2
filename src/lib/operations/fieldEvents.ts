import { getSession } from '../api/session';
import { enqueueTaskEvent } from './taskEventOutbox';

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
  constructor(message: string, public readonly reason: 'unsupported' | 'permission_denied' | 'services_disabled' | 'timeout' | 'unavailable' | 'vpn_active' | 'native_required') {
    super(message);
    this.name = 'FieldLocationError';
  }
}


function createClientEventId(): string {
  if (typeof crypto === 'undefined') throw new FieldLocationError('مولد UUID الآمن غير متاح على هذا الجهاز.', 'unavailable');
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function validateFieldEventInput(input: {
  eventLabel: string;
  location: CapturedLocation;
}): void {
  if (typeof input.eventLabel !== 'string' || !input.eventLabel.trim() || input.eventLabel.length > 200) {
    throw new FieldLocationError('وصف الحدث مطلوب ويجب ألا يتجاوز 200 حرف.', 'unavailable');
  }
  const { latitude, longitude, accuracyMeters } = input.location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      !Number.isFinite(accuracyMeters) || latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180 || accuracyMeters < 0 || accuracyMeters > 100000) {
    throw new FieldLocationError('إحداثيات الموقع أو دقتها خارج النطاق المقبول.', 'unavailable');
  }
}

/** Browser GPS is requested only in direct response to a field-task action. */
export async function ensureFieldVisitCanStart(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.geolocation ||
      (typeof window !== 'undefined' && !window.isSecureContext)) {
    throw new FieldLocationError(
      'يلزم فتح واجهة Neer عبر HTTPS ومتصفح يدعم تحديد الموقع لتوثيق المهام الميدانية.',
      'unsupported',
    );
  }
}

/** Capture one fresh browser location fix; no continuous or background tracking is started. */
export async function captureRequiredLocation(): Promise<CapturedLocation> {
  await ensureFieldVisitCanStart();
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: CapturedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        };
        try {
          validateFieldEventInput({ eventLabel: 'GPS', location });
          resolve(location);
        } catch (error) {
          reject(error);
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new FieldLocationError('تم رفض إذن الموقع. اسمح للمتصفح بالوصول إلى الموقع ثم أعد المحاولة.', 'permission_denied'));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new FieldLocationError('خدمات الموقع غير متاحة حالياً على الجهاز.', 'services_disabled'));
        } else if (error.code === error.TIMEOUT) {
          reject(new FieldLocationError('انتهت مهلة تحديد الموقع؛ أعد المحاولة في مكان تتوفر فيه إشارة GPS.', 'timeout'));
        } else {
          reject(new FieldLocationError('تعذر الحصول على موقع GPS من المتصفح.', 'unavailable'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

type NonLifecycleFieldEventType = Exclude<FieldEventType,
  | 'visit_started' | 'visit_paused' | 'visit_resumed' | 'visit_completed'
  | 'task_started' | 'task_paused' | 'task_resumed' | 'task_completed'
>;

export async function recordTaskEvent(input: {
  taskId: string;
  standingAccountId?: string;
  eventType: NonLifecycleFieldEventType;
  eventLabel: string;
  location: CapturedLocation;
  details?: Record<string, unknown>;
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً قبل توثيق الحدث الميداني.');

  validateFieldEventInput(input);
  const clientEventId = createClientEventId();
  const status = await enqueueTaskEvent({
    taskId: input.taskId,
    path: '/task-events',
    clientEventId,
    body: {
      task_id: input.taskId,
      standing_account_id: input.standingAccountId || null,
      event_type: input.eventType,
      event_label: input.eventLabel,
      occurred_at: new Date().toISOString(),
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_meters: input.location.accuracyMeters,
      location_status: 'captured',
      client_event_id: clientEventId,
      details: input.details || {},
    },
  });
  if (status !== 'synced') throw new Error(status === 'blocked'
    ? 'حُفظ الحدث محلياً لكن رفضه الخادم؛ راجع صلاحية المهمة أو تفاصيل الحدث.'
    : 'حُفظ الحدث على الجهاز وينتظر عودة الاتصال والمزامنة. لا تغلق بيانات التطبيق أو تمسحها.');
}


export type LocationUnavailableStatus = 'permission_denied' | 'services_disabled' | 'unavailable' | 'timeout';

/**
 * Persist a truthful audit event when GPS cannot be captured.
 * No coordinates are fabricated; the server stores NULL coordinates and the explicit reason.
 */
export async function recordLocationUnavailable(input: {
  taskId: string;
  eventLabel: string;
  status: LocationUnavailableStatus;
  details?: Record<string, unknown>;
}): Promise<void> {
  if (!getSession()) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً قبل توثيق تعذر الموقع.');
  if (!input.taskId || !input.eventLabel.trim() || input.eventLabel.length > 200) {
    throw new FieldLocationError('المهمة ووصف تعذر الموقع مطلوبان، ويجب ألا يتجاوز الوصف 200 حرف.', 'unavailable');
  }
  if (!['permission_denied','services_disabled','unavailable','timeout'].includes(input.status)) {
    throw new FieldLocationError('حالة تعذر الموقع غير معروفة.', 'unavailable');
  }
  if (input.details && JSON.stringify(input.details).length > 20000) {
    throw new FieldLocationError('تفاصيل الحدث أكبر من الحد المسموح.', 'unavailable');
  }
  const clientEventId = createClientEventId();
  const status = await enqueueTaskEvent({
    taskId: input.taskId,
    path: '/task-events',
    clientEventId,
    body: {
      task_id: input.taskId,
      event_type: 'location_unavailable',
      event_label: input.eventLabel,
      location_status: input.status,
      client_event_id: clientEventId,
      details: input.details || {},
    },
  });
  if (status !== 'synced') throw new Error(status === 'blocked'
    ? 'تم حفظ تعذر الموقع محلياً لكن الخادم رفض الحدث؛ راجع صلاحية المهمة.'
    : 'تم حفظ تعذر الموقع محلياً وينتظر المزامنة عند عودة الاتصال.');
}

/** Persist GPS failure reasons without inventing coordinates. */
export async function recordFieldLocationFailure(taskId: string, eventLabel: string, error: unknown): Promise<void> {
  if (!(error instanceof FieldLocationError)) return;
  const status: LocationUnavailableStatus =
    error.reason === 'permission_denied' ? 'permission_denied' :
    error.reason === 'services_disabled' ? 'services_disabled' :
    error.reason === 'timeout' ? 'timeout' : 'unavailable';
  await recordLocationUnavailable({
    taskId,
    eventLabel,
    status,
    details: { reason: error.reason, message: error.message },
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
  validateFieldEventInput(input);
  const clientEventId = createClientEventId();
  const clientOccurredAt = new Date().toISOString();
  const status = await enqueueTaskEvent({
    taskId: input.taskId,
    path: '/task-events/lifecycle',
    clientEventId,
    body: {
      task_id: input.taskId,
      event_type: input.eventType,
      event_label: input.eventLabel,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_meters: input.location.accuracyMeters,
      client_event_id: clientEventId,
      details: {
        ...(input.details || {}),
        clientOccurredAt,
        deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locationSource: 'browser_geolocation',
      },
    },
  });

  if (status !== 'synced') throw new Error(status === 'blocked'
    ? 'حُفظ حدث الموقع محلياً لكن رفضه الخادم؛ يلزم تصحيح سبب الرفض قبل متابعة المزامنة.'
    : 'حُفظ حدث الموقع على الجهاز وينتظر المزامنة. ستُرسل الأحداث بالترتيب عند عودة الاتصال.');
}

/**
 * Browser sessions deliberately do not run continuous/background GPS.
 * Location is captured only at explicit start/pause/resume/outcome actions.
 */
export function startFieldLocationTracking(_taskId: string): void {
  // Intentionally no-op: browser background location is neither required nor guaranteed.
}

export function stopFieldLocationTracking(_taskId: string): void {
  // Intentionally no-op: each event obtains a one-shot location fix.
}
