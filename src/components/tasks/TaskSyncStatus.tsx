import React, { useCallback, useEffect, useState } from 'react';
import {
  flushTaskEventOutbox,
  getTaskEventOutboxSummary,
  retryBlockedTaskEvents,
  type TaskEventOutboxSummary,
} from '../../lib/operations/taskEventOutbox';

const EMPTY: TaskEventOutboxSummary = { pending: 0, blocked: 0 };

export const TaskSyncStatus: React.FC = () => {
  const [summary, setSummary] = useState<TaskEventOutboxSummary>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSummary(await getTaskEventOutboxSummary());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر قراءة حالة مزامنة المهام.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const next = await getTaskEventOutboxSummary();
        if (active) setSummary(next);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'تعذر قراءة حالة المزامنة.');
      }
    };
    void sync();
    const onChange = () => { void sync(); };
    window.addEventListener('neer-task-outbox-change', onChange);
    window.addEventListener('online', onChange);
    return () => {
      active = false;
      window.removeEventListener('neer-task-outbox-change', onChange);
      window.removeEventListener('online', onChange);
    };
  }, []);

  const handleSync = async () => {
    setBusy(true);
    setError('');
    try {
      await flushTaskEventOutbox();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذرت مزامنة الأحداث.');
    } finally {
      setBusy(false);
    }
  };

  const handleRetryBlocked = async () => {
    if (!window.confirm('أعد المحاولة بعد معالجة سبب رفض الخادم فقط. هل تريد إعادة إرسال الأحداث المحظورة؟')) return;
    setBusy(true);
    setError('');
    try {
      await retryBlockedTaskEvents();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذرت إعادة محاولة الأحداث المحظورة.');
    } finally {
      setBusy(false);
    }
  };

  if (summary.pending === 0 && summary.blocked === 0 && !error) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-amber-950">مزامنة أحداث المهام</strong>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {summary.pending > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-amber-800">{summary.pending} بانتظار المزامنة</span>}
          {summary.blocked > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800">{summary.blocked} مرفوضة وتحتاج مراجعة</span>}
        </div>
      </div>
      {summary.blocked > 0 && summary.lastError && (
        <p className="text-xs text-rose-800 break-words">آخر سبب رفض: {summary.lastError}</p>
      )}
      {error && <p className="text-xs text-rose-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {summary.pending > 0 && (
          <button type="button" onClick={() => void handleSync()} disabled={busy || !navigator.onLine}
            className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-800 border border-amber-200 disabled:opacity-50">
            {busy ? 'جارٍ التحقق…' : 'مزامنة الآن'}
          </button>
        )}
        {summary.blocked > 0 && (
          <button type="button" onClick={() => void handleRetryBlocked()} disabled={busy || !navigator.onLine}
            className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            إعادة محاولة الأحداث المرفوضة
          </button>
        )}
      </div>
      <p className="text-[11px] leading-5 text-amber-900">لا تمسح بيانات التطبيق أو تسجّل خروجًا من الجهاز قبل التأكد من مزامنة الأحداث المعلقة.</p>
    </section>
  );
};
