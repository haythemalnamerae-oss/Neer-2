import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Award,
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Layers,
  Sparkles,
  BarChart3,
  Calendar,
  FileSpreadsheet,
  Building,
  Store,
  ChevronDown,
  Percent,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { formatCurrency } from '../../lib/utils/format';
import { User, Task, Expense, PettyCashFund, StandingAccount, CashReceipt } from '../../types/domain';

export const PerformanceEvaluationView: React.FC = () => {
  const users = dataStore.getUsers();
  const tasks = dataStore.getTasks();
  const expenses = dataStore.getExpenses();
  const funds = dataStore.getFunds();
  const standingAccounts = dataStore.getStandingAccounts();
  const cashReceipts = dataStore.getCashReceipts();
  const settings = dataStore.getSettings();

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'funds_flow' | 'deficits' | 'routine_accounts'>('leaderboard');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'month' | 'week'>('all');

  // --- 1. PRODUCTIVITY & EMPLOYEE EVALUATION ("من اشتغل أكثر؟") ---
  const employeeStats = useMemo(() => {
    return users.map((user) => {
      const userTasks = tasks.filter((t) => t.assigneeId === user.id);
      const completedTasks = userTasks.filter((t) => t.status === 'completed' || t.status === 'approved');
      const inProgressTasks = userTasks.filter((t) => t.status === 'in_progress' || t.status === 'started');
      const deferredTasks = userTasks.filter((t) => t.status === 'deferred' || t.outcome === 'unable_to_execute' || t.outcome === 'not_completed');
      
      // Calculate total actual logged field time in minutes and hours
      const totalMinutes = userTasks.reduce((acc, t) => acc + (t.timeSpentMinutes || 0), 0);
      const totalHours = (totalMinutes / 60).toFixed(1);

      // Financial volume handled
      const totalExpensesSpent = expenses
        .filter((e) => e.submittedBy === user.name)
        .reduce((acc, e) => acc + e.totalWithTax, 0);

      // Success Rate %
      const successRate = userTasks.length > 0 ? Math.round((completedTasks.length / userTasks.length) * 100) : 0;

      // Score formula: (Completed * 20) + (Field Hours * 5) + (SuccessRate * 0.5)
      const performanceScore = Math.round(
        completedTasks.length * 25 + parseFloat(totalHours) * 8 + successRate * 0.4
      );

      return {
        user,
        totalTasks: userTasks.length,
        completedTasks: completedTasks.length,
        inProgressTasks: inProgressTasks.length,
        deferredTasks: deferredTasks.length,
        totalMinutes,
        totalHours,
        totalExpensesSpent,
        successRate,
        performanceScore,
      };
    }).sort((a, b) => b.performanceScore - a.performanceScore);
  }, [users, tasks, expenses]);

  // --- 2. WHERE DID PETTY CASH GO? ("أين ذهبت العهد؟") ---
  const totalAllocatedFunds = funds.reduce((s, f) => s + f.totalAllocation, 0);
  const totalCurrentBalance = funds.reduce((s, f) => s + f.currentBalance, 0);
  const totalSpentFunds = funds.reduce((s, f) => s + f.spentBalance, 0);
  const totalReceipts = cashReceipts.reduce((s, r) => s + r.amount, 0);

  // Group expenses by standard routine categories
  const spendingByCategory = useMemo(() => {
    const categories: Record<string, { label: string; amount: number; count: number; icon: string }> = {
      grocery: { label: 'بقالة وتموينات ومستلزمات', amount: 0, count: 0, icon: '🛒' },
      hospitality: { label: 'بوفيه وضيافة واستراحة', amount: 0, count: 0, icon: '☕' },
      vendor: { label: 'مشتريات من موردين معتادين', amount: 0, count: 0, icon: '🏢' },
      transport: { label: 'باص، مترو ومواصلات ونقل', amount: 0, count: 0, icon: '🚌' },
      fuel: { label: 'محروقات ووقود سيارات', amount: 0, count: 0, icon: '⛽' },
      materials: { label: 'مواد تشغيلية وتجهيزات', amount: 0, count: 0, icon: '📦' },
      maintenance: { label: 'صيانة دورية وقطع غيار', amount: 0, count: 0, icon: '🔧' },
      other: { label: 'مصروفات تشغيلية أخرى', amount: 0, count: 0, icon: '📑' },
    };

    expenses.forEach((e) => {
      let key = 'other';
      const desc = (e.description + ' ' + e.vendorName).toLowerCase();
      if (desc.includes('بقال') || desc.includes('سوبر') || desc.includes('تموين')) key = 'grocery';
      else if (desc.includes('بوف') || desc.includes('مطعم') || desc.includes('كافتيريا') || desc.includes('شاي') || e.category === 'hospitality') key = 'hospitality';
      else if (desc.includes('باص') || desc.includes('مترو') || desc.includes('تاكسي') || e.category === 'transport') key = 'transport';
      else if (desc.includes('بنزين') || desc.includes('وقود') || desc.includes('محطة') || e.category === 'fuel') key = 'fuel';
      else if (desc.includes('مورد') || desc.includes('شركة') || desc.includes('مؤسسة')) key = 'vendor';
      else if (e.category === 'materials') key = 'materials';
      else if (e.category === 'maintenance') key = 'maintenance';

      if (categories[key]) {
        categories[key].amount += e.totalWithTax;
        categories[key].count += 1;
      }
    });

    return Object.entries(categories)
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  // Deficit (Negative balance) analysis
  const deficitExpenses = expenses.filter((e) => e.isDeficit);
  const coveredDeficitExpenses = deficitExpenses.filter((e) => e.isCoveredFromCash);
  const pendingDeficitExpenses = deficitExpenses.filter((e) => !e.isCoveredFromCash);
  const totalPendingDeficit = pendingDeficitExpenses.reduce((s, e) => s + (e.deficitAmount || e.totalWithTax), 0);
  const totalCoveredDeficit = coveredDeficitExpenses.reduce((s, e) => s + (e.deficitAmount || e.totalWithTax), 0);

  // Standing accounts totals
  const totalPayableToVendors = standingAccounts
    .filter((a) => a.direction === 'payable' || a.direction === 'payable_by_us')
    .reduce((s, a) => s + (a.currentBalance || 0), 0);
  const totalReceivableForUs = standingAccounts
    .filter((a) => a.direction === 'receivable' || a.direction === 'receivable_for_us')
    .reduce((s, a) => s + (a.currentBalance || 0), 0);

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div
        className="rounded-[28px] p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 text-white shadow-xl relative overflow-hidden"
        style={{
          backgroundColor: '#2A443B',
          boxShadow: '0 20px 45px rgba(22, 44, 34, 0.28), 0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="relative z-10 space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
            <Trophy className="w-4 h-4" />
            <span>لوحة التقييم الرقابي الشامل والمساءلة المالية الميدانية</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white font-serif-hero tracking-tight">
            تقييم حقيقي للإنجازات وتتبع حركة العهد والمقبوضات
          </h1>
          <p className="text-xs sm:text-sm text-white/75 leading-relaxed font-sans-inter">
            الإجابة الدقيقة على تساؤلات الإدارة العليا: <strong>من اشتغل أكثر ميدانياً؟</strong> و <strong>أين ذهبت مبالغ العهد والمصروفات؟</strong>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0 z-10">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold font-sans-inter transition-all border border-white/20 cursor-pointer shadow-xs active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>طباعة تقرير الإنجاز</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: The Big Questions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="inner-white-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>المتصدر بالإنجاز الميداني</span>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-lg font-black text-slate-900 block truncate">
            {employeeStats[0]?.user.name || '—'}
          </span>
          <span className="text-[11px] text-emerald-700 font-bold block">
            {employeeStats[0]?.completedTasks || 0} مهمة منجزة • {employeeStats[0]?.totalHours || 0} ساعة عمل
          </span>
        </div>

        <div className="inner-white-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>إجمالي العهد المنصرفة</span>
            <Wallet className="w-4 h-4 text-[#2A443B]" />
          </div>
          <span className="text-xl font-black text-slate-900 block">
            {formatCurrency(totalSpentFunds)}
          </span>
          <span className="text-[11px] text-slate-500 block">
            من أصل {formatCurrency(totalAllocatedFunds)} معتمد
          </span>
        </div>

        <div className="inner-white-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>مبالغ تم قبضها (توريد نقدي)</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-xl font-black text-emerald-700 block">
            {formatCurrency(totalReceipts)}
          </span>
          <span className="text-[11px] text-slate-500 block">
            سندات قبض مبيعات وطلبيات وتوريد
          </span>
        </div>

        <div className="inner-white-card p-5 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>صرف بالسالب (عجز معلق)</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-xl font-black text-amber-700 block">
            {formatCurrency(totalPendingDeficit)}
          </span>
          <span className="text-[11px] text-emerald-700 font-bold block">
            تمت تغطية {formatCurrency(totalCoveredDeficit)} من الصندوق
          </span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2 overflow-x-auto no-scrollbar text-xs">
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'leaderboard'
              ? 'bg-[#2A443B] text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-slate-700'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>من اشتغل أكثر؟ (سجل إنتاجية الموظفين)</span>
        </button>

        <button
          onClick={() => setActiveTab('funds_flow')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'funds_flow'
              ? 'bg-[#2A443B] text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-slate-700'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>أين ذهبت العهد؟ (تحليل بنود الصرف)</span>
        </button>

        <button
          onClick={() => setActiveTab('deficits')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'deficits'
              ? 'bg-[#2A443B] text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-slate-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>الصرف بالسالب وتغطيته ({deficitExpenses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('routine_accounts')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'routine_accounts'
              ? 'bg-[#2A443B] text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-slate-700'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>الحسابات والموردين المعتادين ({standingAccounts.length})</span>
        </button>
      </div>

      {/* --- TAB 1: WHO WORKED MORE? (EMPLOYEE LEADERBOARD) --- */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          <div className="inner-white-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  لوحة الشرف وتصنيف أداء الفريق الميداني
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تقييم مبني على الإنجاز الفعلي، وساعات العمل الموثقة بالجي بي إس والعدادات، ومعدل إغلاق المهام بنجاح.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                <span>إجمالي الكادر: {users.length} أعضاء</span>
              </div>
            </div>

            {/* Leaderboard Table / Cards */}
            <div className="space-y-3.5">
              {employeeStats.map((item, index) => {
                const rank = index + 1;
                const isTop1 = rank === 1;
                const isTop2 = rank === 2;
                const isTop3 = rank === 3;

                return (
                  <div
                    key={item.user.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      isTop1
                        ? 'bg-amber-50/60 border-amber-200 ring-2 ring-amber-300/40 shadow-sm'
                        : isTop2
                        ? 'bg-slate-50/80 border-slate-300'
                        : isTop3
                        ? 'bg-orange-50/50 border-orange-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Rank Badge & Profile */}
                    <div className="flex items-center gap-3.5 min-w-[220px]">
                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-xs ${
                          isTop1
                            ? 'bg-amber-500 text-white'
                            : isTop2
                            ? 'bg-slate-400 text-white'
                            : isTop3
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : rank}
                      </div>

                      <div className="w-10 h-10 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                        <img
                          src={item.user.avatar}
                          alt={item.user.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{item.user.name}</h4>
                          {isTop1 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                              الأعلى إنجازاً
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 block">
                          {item.user.roleTitleAr} • {item.user.department}
                        </span>
                      </div>
                    </div>

                    {/* Operational Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 w-full md:w-auto text-xs">
                      <div className="p-2.5 rounded-xl bg-white/70 border border-slate-200/70 text-center">
                        <span className="text-slate-500 block text-[11px] mb-0.5">المهام المنجزة</span>
                        <span className="font-extrabold text-emerald-700 text-sm">
                          {item.completedTasks} <span className="text-slate-400 font-normal">/ {item.totalTasks}</span>
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/70 border border-slate-200/70 text-center">
                        <span className="text-slate-500 block text-[11px] mb-0.5">ساعات الميدان</span>
                        <span className="font-extrabold text-[#2A443B] text-sm">
                          {item.totalHours} س
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/70 border border-slate-200/70 text-center">
                        <span className="text-slate-500 block text-[11px] mb-0.5">نسبة الإنجاز</span>
                        <span className="font-extrabold text-blue-700 text-sm">
                          {item.successRate}%
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/70 border border-slate-200/70 text-center">
                        <span className="text-slate-500 block text-[11px] mb-0.5">حجم المصروفات</span>
                        <span className="font-extrabold text-slate-800 text-sm truncate block">
                          {formatCurrency(item.totalExpensesSpent)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: WHERE DID PETTY CASH GO? (FUNDS FLOW & BREAKDOWN) --- */}
      {activeTab === 'funds_flow' && (
        <div className="space-y-6">
          <div className="inner-white-card p-6 space-y-6">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                أين ذهبت مبالغ العهد؟ (توزيع المصروفات حسب الأوجه الفعلية)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تفكيك شامل لكل درهم تم صرفه من العهد النقدية، مقسمة على البقالات، والضيافة، والموردين، والوقود، والمواصلات.
              </p>
            </div>

            {/* Category Breakdown Progress Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {spendingByCategory.map((cat) => {
                const percentOfTotal = totalSpentFunds > 0 ? Math.round((cat.amount / totalSpentFunds) * 100) : 0;

                return (
                  <div
                    key={cat.id}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-extrabold text-slate-900">
                        <span className="text-base">{cat.icon}</span>
                        <span>{cat.label}</span>
                      </div>
                      <span className="font-black text-[#2A443B] text-sm">
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2A443B] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(4, percentOfTotal))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{cat.count} عملية صرف مسجلة</span>
                      <span className="font-bold text-slate-700">{percentOfTotal}% من إجمالي العهد</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Funds Status Table */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                موقف العهد النقدية النشطة واستنزاف الأرصدة:
              </h4>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold">
                      <th className="pb-3 pr-2">اسم العهدة</th>
                      <th className="pb-3">المسؤول عنها</th>
                      <th className="pb-3">المبلغ المخصص</th>
                      <th className="pb-3">المنصرف الفعلي</th>
                      <th className="pb-3">الرصيد المتبقي</th>
                      <th className="pb-3">نسبة الاستنزاف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {funds.map((f) => {
                      const spentPct = f.totalAllocation > 0 ? Math.round((f.spentBalance / f.totalAllocation) * 100) : 0;
                      return (
                        <tr key={f.id} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 pr-2 font-extrabold text-slate-900">{f.name}</td>
                          <td className="py-3 text-slate-600">{f.holderName}</td>
                          <td className="py-3 font-semibold text-slate-700">{formatCurrency(f.totalAllocation)}</td>
                          <td className="py-3 font-bold text-rose-700">{formatCurrency(f.spentBalance)}</td>
                          <td className="py-3 font-bold text-emerald-800">{formatCurrency(f.currentBalance)}</td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                spentPct > 80
                                  ? 'bg-rose-100 text-rose-800'
                                  : spentPct > 50
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {spentPct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: NEGATIVE BALANCE EXPENSES & DEFICITS ("الصرف بالسالب وتغطيته") --- */}
      {activeTab === 'deficits' && (
        <div className="space-y-6">
          <div className="inner-white-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  سجل المصروفات بالسالب وتغطيتها من الصندوق النقدي
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  يتيح النظام للمنفذ الميداني الصرف حتى في حال نفاد رصيد العهدة (بالسالب)، وتتم تغطيته وسداده فور توفر السيولة بالصندوق.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                  عجز معلق: {formatCurrency(totalPendingDeficit)}
                </span>
              </div>
            </div>

            {deficitExpenses.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                لا توجد مصروفات مسجلة بالسالب حالياً. جميع المصروفات مغطاة بالكامل من العهد.
              </div>
            ) : (
              <div className="space-y-3">
                {deficitExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      exp.isCoveredFromCash
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-amber-50/60 border-amber-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800">
                          {exp.code}
                        </span>
                        <h4 className="text-xs font-extrabold text-slate-900">{exp.description}</h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            exp.isCoveredFromCash
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-200 text-amber-900'
                          }`}
                        >
                          {exp.isCoveredFromCash ? 'تمت تغطيته من الصندوق' : 'صرف بالسالب (عجز معلق)'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block">
                        الجهة: {exp.vendorName} • العهدة: {exp.fundName} • بواسطة: {exp.submittedBy}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-left">
                        <span className="text-slate-400 block text-[10px]">مبلغ العجز</span>
                        <span className="font-extrabold text-rose-700 text-sm">
                          {formatCurrency(exp.deficitAmount || exp.totalWithTax)}
                        </span>
                      </div>

                      {!exp.isCoveredFromCash && (
                        <button
                          onClick={() => {
                            dataStore.coverDeficitExpenseFromCash(exp.id, 'مدير العمليات');
                            alert('تمت تغطية الصرف السالب وسداد العجز من الصندوق النقدي بنجاح!');
                          }}
                          className="px-4 py-2 rounded-xl bg-[#2A443B] hover:bg-[#1f332c] text-white text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
                        >
                          تغطية المبلغ من الصندوق
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 4: ROUTINE & STANDING ACCOUNTS ("البقالة، البوفيه، المترو، الباص، الموردين") --- */}
      {activeTab === 'routine_accounts' && (
        <div className="space-y-6">
          <div className="inner-white-card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  الحسابات والموردين المعتادين (البقالة، البوفيه، المواصلات، والوقود)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  إدارة المبالغ المسجلة مع الموردين والمحلات الدائمة مع تصنيف واضح: <strong>مستحق لنا</strong> أو <strong>مستحق علينا</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                  مستحق علينا للموردين: {formatCurrency(totalPayableToVendors)}
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                  مستحق لنا (مقدم): {formatCurrency(totalReceivableForUs)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {standingAccounts.map((acc) => {
                const isPayable = acc.direction === 'payable' || acc.direction === 'payable_by_us';

                return (
                  <div
                    key={acc.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 block w-fit mb-1">
                          {acc.code || 'STD'}
                        </span>
                        <h4 className="text-xs font-extrabold text-slate-900">{acc.name}</h4>
                        {acc.vendorName && (
                          <span className="text-[11px] text-slate-500 block">
                            المورد/المحل: {acc.vendorName}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          isPayable ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isPayable ? 'علينا (مطلوب)' : 'لنا (مدفوع)'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">الرصيد القائم:</span>
                      <span className={`font-black ${isPayable ? 'text-rose-700' : 'text-emerald-800'}`}>
                        {formatCurrency(acc.currentBalance || 0)}
                      </span>
                    </div>

                    {acc.contactPhone && (
                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>هاتف المحل:</span>
                        <span className="font-mono text-slate-700">{acc.contactPhone}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
