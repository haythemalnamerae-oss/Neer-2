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

type NativeFieldBridge = {
  getVpnStatus: () => Promise<{ active: boolean }>;
  ensureLocationServices: () => Promise<{ enabled: boolean }>;
  requestLocationPermission: () => Promise<{ granted: boolean }>;
  getCurrentLocation: () => Promise<CapturedLocation>;
  openVpnSettings: () => void;
  openLocationSettings: () => void;
  startBackgroundLocationTracking: (taskId: string) => void;
  stopBackgroundLocationTracking: (taskId: string) => void;
};

declare global {
  interface Window { NeerNative?: NativeFieldBridge; }
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

function nativeFieldBridge(): NativeFieldBridge | null {
  return typeof window !== 'undefined' ? window.NeerNative || null : null;
}

/**
 * VPN and background-location guarantees require the Android native bridge.
 * A browser-only session fails closed instead of pretending it can inspect VPN
 * state or keep GPS alive after the WebView is suspended.
 */
export async function ensureFieldVisitCanStart(): Promise<void> {
  const bridge = nativeFieldBridge();
  if (!bridge) throw new FieldLocationError(
    'بدء الزيارة يتطلب تطبيق Neer الأصلي على Android للتحقق من VPN وتشغيل تتبع الخلفية. المتصفح وحده لا يستطيع ضمان ذلك.',
    'native_required',
  );
  const vpn = await bridge.getVpnStatus();
  if (vpn.active) {
    bridge.openVpnSettings();
    throw new FieldLocationError('اتصال VPN نشط. أوقف VPN من إعدادات الجهاز ثم أعد محاولة بدء الزيارة.', 'vpn_active');
  }
  const locationServices = await bridge.ensureLocationServices();
  if (!locationServices.enabled) {
    bridge.openLocationSettings();
    throw new FieldLocationError('خدمات الموقع GPS متوقفة. فعّل الموقع من إعدادات الجهاز ثم أعد المحاولة.', 'services_disabled');
  }
  const permission = await bridge.requestLocationPermission();
  if (!permission.granted) throw new FieldLocationError('يلزم منح إذن الموقع للتطبيق قبل بدء الزيارة.', 'permission_denied');
}

/** A fresh event location is obtained from the native Android location provider only. */
export async function captureRequiredLocation(): Promise<CapturedLocation> {
  const bridge = nativeFieldBridge();
  if (!bridge) throw new FieldLocationError(
    'لا يمكن توثيق موقع الحدث من المتصفح بأمان. افتح تطبيق Neer الأصلي على Android.',
    'native_required',
  );
  try {
    const location = await bridge.getCurrentLocation();
    if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
        !Number.isFinite(location.accuracyMeters) || location.latitude < -90 || location.latitude > 90 ||
        location.longitude < -180 || location.longitude > 180 || location.accuracyMeters < 0) {
      throw new FieldLocationError('أعاد مزود الموقع إحداثيات أو دقة غير صالحة.', 'unavailable');
    }
    return location;
  } catch (error) {
    if (error instanceof FieldLocationError) throw error;
    throw new FieldLocationError(error instanceof Error ? error.message : 'تعذر الحصول على موقع GPS حالي من الجهاز.', 'unavailable');
  }
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
        locationSource: 'native_android_bridge',
      },
    },
  });
  if (status !== 'synced') throw new Error(status === 'blocked'
    ? 'حُفظ حدث الموقع محلياً لكن رفضه الخادم؛ يلزم تصحيح سبب الرفض قبل متابعة المزامنة.'
    : 'حُفظ حدث الموقع على الجهاز وينتظر المزامنة. ستُرسل الأحداث بالترتيب عند عودة الاتصال.');
}

/** Background tracking is owned by the Android foreground service, not browser timers. */
export function startFieldLocationTracking(taskId: string): void {
  const bridge = nativeFieldBridge();
  if (!bridge) {
    console.error('Native background location bridge is unavailable; field tracking cannot be guaranteed.');
    return;
  }
  bridge.startBackgroundLocationTracking(taskId);
}

export function stopFieldLocationTracking(taskId: string): void {
  nativeFieldBridge()?.stopBackgroundLocationTracking(taskId);
}
