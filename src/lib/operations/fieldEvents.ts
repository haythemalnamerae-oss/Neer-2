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

  const clientEventId = crypto.randomUUID();
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


export async function recordFieldLifecycleEvent(input: {
  taskId: string;
  eventType: Extract<FieldEventType, 'visit_started' | 'visit_paused' | 'visit_resumed' | 'visit_completed' | 'task_started' | 'task_paused' | 'task_resumed' | 'task_completed'>;
  eventLabel: string;
  location: CapturedLocation;
  details?: Record<string, unknown>;
}): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً قبل توثيق الحدث الميداني.');
  const clientEventId = crypto.randomUUID();
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
