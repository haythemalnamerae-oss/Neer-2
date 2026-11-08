import React, { useEffect, useState } from 'react';
import { clearSession, getSession, hasSupabaseConfig, loadUiSnapshot, signIn, type ApiSession } from '../../lib/api/session';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';

export const ApiSessionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<ApiSession | null>(getSession());
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasSupabaseConfig) { setReady(true); return; }
    if (!session) { setReady(true); return; }
    loadUiSnapshot(session)
      .then(() => setReady(true))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'تعذر تحميل بيانات المؤسسة.');
        setReady(true);
      });
  }, [session?.accessToken, session?.organizationId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setReady(false);
    try {
      const next = await signIn(email.trim(), password);
      await loadUiSnapshot(next);
      setSession(next); setReady(true);
    } catch (cause) {
      clearSession();
      setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدخول.');
      setReady(true);
    } finally { setBusy(false); }
  };

  // Keep the local demo experience available when Supabase is not configured.
  // Authenticated API access remains disabled until both public variables exist.
  if (!hasSupabaseConfig) return <>{children}</>;
  if (session && ready && !error) return <>{children}</>;

  return (
    <main dir="rtl" className="min-h-screen bg-[#E5EBE7] px-4 py-10 flex items-center justify-center font-['Almarai',sans-serif]">
      <section className="w-full max-w-md rounded-3xl bg-[#F4F7F5] p-7 shadow-xl border border-white/60">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-800 text-2xl font-black text-white">ن</div>
          <h1 className="text-2xl font-black text-slate-900">نير</h1>
          <p className="mt-1 text-sm text-slate-500">سجّل الدخول للاتصال ببيانات مؤسستك</p>
        </div>
        {session && error ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
            <button className="w-full rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white" onClick={() => { clearSession(); setSession(null); setError(''); }}>تسجيل الدخول من جديد</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <label className="block space-y-1.5 text-sm font-bold text-slate-700">البريد الإلكتروني<input className={inputClass} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block space-y-1.5 text-sm font-bold text-slate-700">كلمة المرور<input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button disabled={busy} className="w-full rounded-xl bg-emerald-800 px-4 py-3 font-bold text-white disabled:opacity-60">{busy ? 'جارٍ الاتصال...' : 'دخول آمن'}</button>
            <p className="text-center text-xs leading-5 text-slate-500">يتم التحقق من الحساب والعضوية بواسطة Supabase Auth وRLS. لا تستخدم حسابات العرض المحلية.</p>
          </form>
        )}
      </section>
    </main>
  );
};
