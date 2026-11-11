import type { Task, TaskOutcome, TaskStepStatus, TaskAttachment } from '../types/domain';
import { apiRequest, getSession, loadUiSnapshot, SessionError, type ApiSession } from '../lib/api/session';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ATTACHMENT_BUCKET = 'task-attachments';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export class TaskSavedRefreshError extends Error {
  constructor(message: string) { super(message); this.name = 'TaskSavedRefreshError'; }
}

type NewTaskData = Omit<Task, 'id' | 'spentAmount' | 'history' | 'createdAt'>;

function newId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

function requireSession(): ApiSession {
  const session = getSession();
  if (!session) throw new SessionError('انتهت الجلسة. سجّل الدخول مجددًا.');
  return session;
}

async function refreshAfterMutation(session: ApiSession): Promise<void> {
  try {
    await loadUiSnapshot(session);
  } catch (error) {
    console.error('Task mutation succeeded but the snapshot refresh failed:', error);
    throw new TaskSavedRefreshError('تم حفظ التغيير على الخادم، لكن تعذر تحديث الشاشة. أعد تحميل الصفحة ولا تكرر العملية.');
  }
}

async function mutateTaskResource<T = unknown>(
  session: ApiSession,
  resource: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  filter: string | undefined,
  payload?: Record<string, unknown>,
): Promise<T> {
  const path = filter ? `/${resource}?${filter}` : `/${resource}`;
  const result = await apiRequest<T>(session, path, {
    method,
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  await refreshAfterMutation(session);
  return result;
}

export async function createTaskBundle(
  data: NewTaskData,
  options: { requiresApproval?: boolean; subtaskNotes?: string } = {},
): Promise<Task> {
  const session = requireSession();
  const taskId = newId('tsk');
  const checklist = (data.checklist || []).map((item, index) => ({
    id: item.id || newId('chk'),
    text: item.text.trim(),
    completed: false,
    sortOrder: index,
  }));
  const steps = (data.steps || []).map((step, index) => ({
    id: step.id || newId('step'),
    title: step.title.trim(),
    status: 'pending',
    plannedTime: step.plannedTime,
    notes: step.notes,
    order: index + 1,
  }));
  const task = {
    ...data,
    id: taskId,
    spentAmount: 0,
    createdAt: new Date().toISOString(),
    history: [],
  };
  const payload = {
    task,
    checklist,
    steps,
    subtask: data.parentTaskId
      ? { id: newId('sub'), requiresApproval: Boolean(options.requiresApproval), notes: options.subtaskNotes || null }
      : null,
  };

  await apiRequest(session, '/tasks/create-bundle', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  try {
    await loadUiSnapshot(session);
  } catch (error) {
    console.error('Task was saved, but the UI snapshot could not be refreshed:', error);
    throw new TaskSavedRefreshError('تم حفظ المهمة بنجاح على الخادم، لكن تعذر تحديث القائمة. أعد تحميل الصفحة ولا تعاود إنشاء المهمة.');
  }
  return task;
}

export async function updateTaskFields(taskId: string, updates: Record<string, unknown>): Promise<void> {
  const session = requireSession();
  const snakeCase: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (['id', 'organization_id', 'creator_id', 'spent_amount', 'task_fund_spent', 'task_fund_remaining'].includes(dbKey)) {
      throw new Error(`الحقل ${key} لا يمكن تعديله من واجهة المهام.`);
    }
    snakeCase[dbKey] = value;
  }
  await mutateTaskResource(session, 'tasks', 'PATCH', `id=eq.${encodeURIComponent(taskId)}`, snakeCase);
}

export async function deleteTaskOnServer(taskId: string): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'tasks', 'DELETE', `id=eq.${encodeURIComponent(taskId)}`);
}

export async function setChecklistItem(taskId: string, itemId: string, completed: boolean): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'task-checklist', 'PATCH', `id=eq.${encodeURIComponent(itemId)}&task_id=eq.${encodeURIComponent(taskId)}`, { completed });
}

export async function setTaskStepStatus(
  taskId: string,
  stepId: string,
  status: TaskStepStatus,
  notes?: string,
  nextStepDate?: string,
): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'task-steps', 'PATCH', `id=eq.${encodeURIComponent(stepId)}&task_id=eq.${encodeURIComponent(taskId)}`, {
    status,
    notes: notes || null,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    next_step_date: nextStepDate || null,
  });
}

export async function addTaskDailyUpdate(
  taskId: string,
  text: string,
  author: { id: string; name: string },
): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'task-updates', 'POST', undefined, {
    id: newId('upd'),
    task_id: taskId,
    author_id: author.id,
    author_name: author.name,
    update_date: new Date().toISOString().slice(0, 10),
    text: text.trim(),
  });
}

export async function addTaskSubtask(
  taskId: string,
  subtask: { title: string; assigneeId: string; assigneeName: string; status: string; requiresApproval?: boolean; isApproved?: boolean; notes?: string },
): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'task-subtasks', 'POST', undefined, {
    id: newId('sub'),
    task_id: taskId,
    title: subtask.title.trim(),
    assignee_id: subtask.assigneeId,
    assignee_name: subtask.assigneeName,
    status: subtask.status,
    requires_approval: Boolean(subtask.requiresApproval),
    is_approved: Boolean(subtask.isApproved),
    approved_by_manager: false,
    notes: subtask.notes || null,
  });
}

export async function updateTaskSubtaskStatus(taskId: string, subtaskId: string, status: string): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'task-subtasks', 'PATCH', `id=eq.${encodeURIComponent(subtaskId)}&task_id=eq.${encodeURIComponent(taskId)}`, { status });
}

export async function addTaskComment(
  taskId: string,
  text: string,
  author: { id: string; name: string; avatar?: string; role?: string },
  mentions: string[] = [],
  isInternal = false,
): Promise<void> {
  const session = requireSession();
  await mutateTaskResource(session, 'task-comments', 'POST', undefined, {
    id: newId('cmt'),
    task_id: taskId,
    author_id: author.id,
    author_name: author.name,
    author_avatar: author.avatar || null,
    author_role: author.role || null,
    text: text.trim(),
    mentions,
    is_internal: isInternal,
  });
}

function storageHeaders(session: ApiSession, contentType?: string): HeadersInit {
  return {
    apikey: supabaseAnonKey || '',
    Authorization: `Bearer ${session.accessToken}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

async function removeStoredObject(session: ApiSession, objectPath: string): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) return;
  await fetch(`${supabaseUrl}/storage/v1/object/${ATTACHMENT_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: storageHeaders(session),
  });
}

export async function uploadTaskAttachment(
  taskId: string,
  file: File,
  displayName: string,
  uploadedBy: string,
): Promise<TaskAttachment> {
  const session = requireSession();
  if (!supabaseUrl || !supabaseAnonKey) throw new SessionError('إعدادات Supabase غير مكتملة لرفع الملفات.');
  if (!file || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) throw new Error('حجم الملف يجب ألا يتجاوز 10 ميجابايت.');
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
  if (!allowedTypes.has(file.type)) throw new Error('نوع الملف غير مدعوم. استخدم صورة أو ملف PDF.');
  const safeName = file.name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-100) || 'attachment';
  const objectPath = `${session.organizationId}/${taskId}/${newId('file')}_${safeName}`;
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${ATTACHMENT_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: storageHeaders(session, file.type),
    body: file,
  });
  if (!upload.ok) {
    const error = await upload.text().catch(() => '');
    throw new Error(error || `فشل رفع الملف (${upload.status}).`);
  }

  const attachment: TaskAttachment = {
    id: newId('att'),
    name: displayName,
    url: objectPath,
    size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    type: file.type.startsWith('image/') ? 'image' : 'pdf',
    uploadedBy,
    uploadedAt: new Date().toISOString(),
  };
  try {
    await apiRequest(session, '/task-attachments', {
      method: 'POST',
      body: JSON.stringify({
        id: attachment.id,
        task_id: taskId,
        name: attachment.name,
        url: objectPath,
        size: attachment.size,
        type: attachment.type,
        uploaded_by: uploadedBy,
      }),
    });
    await refreshAfterMutation(session);
    return attachment;
  } catch (error) {
    await removeStoredObject(session, objectPath);
    throw error;
  }
}

export async function getTaskAttachmentSignedUrl(objectPath: string): Promise<string> {
  const session = requireSession();
  if (!supabaseUrl || !supabaseAnonKey) throw new SessionError('إعدادات Supabase غير مكتملة.');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${ATTACHMENT_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: storageHeaders(session, 'application/json'),
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.signedURL !== 'string') throw new Error('تعذر إنشاء رابط آمن للمرفق.');
  return payload.signedURL.startsWith('http') ? payload.signedURL : `${supabaseUrl}${payload.signedURL}`;
}

export async function deleteTaskAttachmentOnServer(taskId: string, attachmentId: string, objectPath: string): Promise<void> {
  const session = requireSession();
  await removeStoredObject(session, objectPath);
  await mutateTaskResource(session, 'task-attachments', 'DELETE', `id=eq.${encodeURIComponent(attachmentId)}&task_id=eq.${encodeURIComponent(taskId)}`);
}
