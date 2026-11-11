import type { Task } from '../types/domain';
import { apiRequest, getSession, loadUiSnapshot, SessionError } from '../lib/api/session';

type NewTaskData = Omit<Task, 'id' | 'spentAmount' | 'history' | 'createdAt'>;

function newId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

/** Creates the task and its checklist/steps in one authenticated database transaction. */
export async function createTaskBundle(
  data: NewTaskData,
  options: { requiresApproval?: boolean; subtaskNotes?: string } = {},
): Promise<Task> {
  const session = getSession();
  if (!session) throw new SessionError('انتهت الجلسة. سجّل الدخول مجددًا قبل إنشاء المهمة.');

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
      ? {
          id: newId('sub'),
          requiresApproval: Boolean(options.requiresApproval),
          notes: options.subtaskNotes || null,
        }
      : null,
  };

  await apiRequest(session, '/tasks/create-bundle', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // Re-hydrate only after the server confirms the complete transaction.
  await loadUiSnapshot(session);
  return task;
}
