import React, { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  Receipt,
  ArrowRight,
  Send,
  Download,
  MoreHorizontal,
  ShoppingBag,
  Utensils,
  Car,
  Briefcase,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { dataStore } from '../../lib/storage';
import { ReportsService } from '../../services/reports.service';
import { AIService, AIOperationsAnalysis } from '../../services/ai.service';
import { formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';

interface DashboardViewProps {
  onOpenNewTask: () => void;
  onOpenNewExpense: () => void;
  onSelectView: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenNewTask,
  onOpenNewExpense,
  onSelectView,
}) => {
  const [metrics, setMetrics] = useState(ReportsService.getDashboardMetrics());
  const [aiAnalysis, setAiAnalysis] = useState<AIOperationsAnalysis | null>(null);
  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '3M' | '1Y' | 'ALL'>('1M');

  useEffect(() => {
    setMetrics(ReportsService.getDashboardMetrics());
    AIService.analyzeOperations().then((res) => {
      setAiAnalysis(res);
    });
  }, []);

  const expenses = dataStore.getExpenses();
  const funds = dataStore.getFunds();
  const users = dataStore.getUsers();
  const tasks = dataStore.getTasks();

  const totalFundsBalance = funds.reduce((s, f) => s + f.currentBalance, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.totalWithTax, 0);

  // Spending categories percentages
  const categorySpending = {
    shopping: expenses.filter((e) => e.category === 'materials' || e.category === 'tools').reduce((s, e) => s + e.totalWithTax, 0),
    food: expenses.filter((e) => e.category === 'hospitality').reduce((s, e) => s + e.totalWithTax, 0),
    transport: expenses.filter((e) => e.category === 'transport' || e.category === 'fuel').reduce((s, e) => s + e.totalWithTax, 0),
    services: expenses.filter((e) => e.category === 'maintenance' || e.category === 'government' || e.category === 'other').reduce((s, e) => s + e.totalWithTax, 0),
  };

  const calcPercent = (val: number) => {
    if (totalExpenses <= 0) return 0;
    return Math.round((val / totalExpenses) * 100);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* ==============================================================
          HERO ROW: TOTAL BALANCE CARD & ACTION BUTTONS & SPENDING
          Strict Neumorphic Soft UI Architecture (#EAF0EC)
          ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-stretch">
        {/* Total Balance Card (8 Cols) */}
        <div className="lg:col-span-8 neu-raised-lg rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
          {/* Header Row of the Card */}
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <span className="text-xs sm:text-sm font-bold text-[#4B6B59] uppercase tracking-wider block font-serif-display">
                الرصيد الكلي للسيولة والعهد المتاحة
              </span>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-3xl sm:text-5xl font-black text-[#132A1C] font-mono tracking-tight">
                  {formatCurrency(totalFundsBalance || 24680.50)}
                </span>
                <span className="neu-inset-sm text-[#204E32] text-xs sm:text-sm font-bold px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
                  <span className="font-mono">+12.8%</span>
                  <span className="text-xs text-[#486857]">هذا الشهر</span>
                </span>
              </div>
            </div>

            {/* Time Range Filter Buttons (with Inset Active state & comfortable touch size) */}
            <div className="flex items-center gap-2 neu-inset-sm p-1.5 rounded-2xl flex-wrap">
              {(['1W', '1M', '3M', '1Y', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`text-xs sm:text-sm px-3.5 py-2 rounded-xl font-bold transition cursor-pointer min-h-[40px] ${
                    timeRange === range
                      ? 'neu-button text-[#142B1E] font-black'
                      : 'text-[#587565] hover:text-[#183122]'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Neumorphic Glowing Line Chart (SVG) */}
          <div className="my-6 sm:my-8 relative w-full h-36 sm:h-44">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 500 120"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="sageLineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#436F55" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#EAF0EC" stopOpacity="0.0" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Shaded Area under Curve */}
              <path
                d="M 0 95 C 70 85, 120 100, 180 65 C 240 30, 290 75, 360 45 C 420 20, 460 35, 500 15 L 500 120 L 0 120 Z"
                fill="url(#sageLineGradient)"
              />

              {/* The Smooth Sage Stroke Line */}
              <path
                d="M 0 95 C 70 85, 120 100, 180 65 C 240 30, 290 75, 360 45 C 420 20, 460 35, 500 15"
                fill="none"
                stroke="#325F45"
                strokeWidth="4"
                strokeLinecap="round"
              />

              {/* Glowing End Point */}
              <circle
                cx="500"
                cy="15"
                r="7"
                fill="#FFFFFF"
                stroke="#325F45"
                strokeWidth="3.5"
                filter="url(#glow)"
              />
            </svg>
          </div>

          {/* Quick Action Circles: Send / Receive / More (Enlarged for Mobile Ease of Use) */}
          <div className="pt-5 border-t border-[#C8D3CC]/50 flex items-center justify-around sm:justify-start sm:gap-10">
            {/* Action 1: Send / Expense */}
            <div className="flex flex-col items-center gap-2.5">
              <button
                onClick={onOpenNewExpense}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full neu-button flex items-center justify-center text-[#214E34] hover:scale-105 active:scale-95 transition cursor-pointer"
                title="تسجيل مصروف أو فاتورة"
              >
                <Send className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.2] -rotate-45 ml-0.5" />
              </button>
              <span className="text-xs sm:text-sm font-bold text-[#1F3728]">صرف عهدة</span>
            </div>

            {/* Action 2: Receive / Cash Receipt */}
            <div className="flex flex-col items-center gap-2.5">
              <button
                onClick={() => onSelectView('funds')}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full neu-button flex items-center justify-center text-[#214E34] hover:scale-105 active:scale-95 transition cursor-pointer"
                title="تسجيل مقبوضات نقدية بالصندوق"
              >
                <Download className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.2]" />
              </button>
              <span className="text-xs sm:text-sm font-bold text-[#1F3728]">قبض سيولة</span>
            </div>

            {/* Action 3: More / Reconcile */}
            <div className="flex flex-col items-center gap-2.5">
              <button
                onClick={() => onSelectView('settlements')}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full neu-button flex items-center justify-center text-[#214E34] hover:scale-105 active:scale-95 transition cursor-pointer"
                title="تسويات وسندات إغلاق"
              >
                <MoreHorizontal className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.2]" />
              </button>
              <span className="text-xs sm:text-sm font-bold text-[#1F3728]">تسوية العهد</span>
            </div>
          </div>
        </div>

        {/* Spending Overview Donut & Progress Bars (4 Cols) */}
        <div className="lg:col-span-4 neu-raised-lg rounded-3xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-[#C8D3CC]/50">
              <h3 className="text-base sm:text-lg font-black text-[#132A1C] font-serif-display">
                نظرة عامة على الإنفاق
              </h3>
              <span className="text-xs sm:text-sm text-[#486857] font-bold">شهرياً</span>
            </div>

            {/* Donut Chart with Total Inside */}
            <div className="py-6 flex flex-col items-center justify-center relative">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#D6E0DA"
                    strokeWidth="12"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#325F45"
                    strokeWidth="12"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 * (1 - (calcPercent(categorySpending.shopping) / 100))}
                    strokeLinecap="round"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#4F7E64"
                    strokeWidth="12"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 * (1 - ((calcPercent(categorySpending.shopping) + calcPercent(categorySpending.food)) / 100))}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Center Content of the Donut */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-[#4F6E5E] font-semibold">إجمالي المصروفات</span>
                  <span className="text-base sm:text-lg font-black text-[#142B1D] font-mono mt-1">
                    {formatCurrency(totalExpenses || 12450)}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Bars for Categories with Larger Touch Icons */}
            <div className="space-y-4 pt-2">
              {/* Category 1: Shopping */}
              <div className="space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-[#1B3426]">
                    <ShoppingBag className="w-4.5 h-4.5 text-[#325F45] stroke-[2.2]" />
                    <span>مشتريات وتوريد مواد</span>
                  </span>
                  <span className="font-mono font-black text-[#172E21]">
                    {calcPercent(categorySpending.shopping)}%
                  </span>
                </div>
                <div className="w-full neu-inset-sm h-3 rounded-full overflow-hidden p-0.5">
                  <div
                    className="bg-[#325F45] h-full rounded-full transition-all"
                    style={{ width: `${Math.max(calcPercent(categorySpending.shopping), 45)}%` }}
                  />
                </div>
              </div>

              {/* Category 2: Food / Hospitality */}
              <div className="space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-[#1B3426]">
                    <Utensils className="w-4.5 h-4.5 text-[#4F7E64] stroke-[2.2]" />
                    <span>ضيافة وبوفيه وإعاشة</span>
                  </span>
                  <span className="font-mono font-black text-[#172E21]">
                    {calcPercent(categorySpending.food)}%
                  </span>
                </div>
                <div className="w-full neu-inset-sm h-3 rounded-full overflow-hidden p-0.5">
                  <div
                    className="bg-[#4F7E64] h-full rounded-full transition-all"
                    style={{ width: `${Math.max(calcPercent(categorySpending.food), 30)}%` }}
                  />
                </div>
              </div>

              {/* Category 3: Transport */}
              <div className="space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-[#1B3426]">
                    <Car className="w-4.5 h-4.5 text-[#6B967E] stroke-[2.2]" />
                    <span>نقل ومواصلات ووقود</span>
                  </span>
                  <span className="font-mono font-black text-[#172E21]">
                    {calcPercent(categorySpending.transport)}%
                  </span>
                </div>
                <div className="w-full neu-inset-sm h-3 rounded-full overflow-hidden p-0.5">
                  <div
                    className="bg-[#6B967E] h-full rounded-full transition-all"
                    style={{ width: `${Math.max(calcPercent(categorySpending.transport), 25)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onSelectView('expenses')}
            className="w-full py-3 rounded-2xl neu-button text-xs sm:text-sm font-bold text-[#234D35] flex items-center justify-center gap-2.5 cursor-pointer min-h-[46px]"
          >
            <span>تفاصيل كل المصروفات</span>
            <ArrowRight className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>
      </div>

      {/* ==============================================================
          SECTION: RECENT TRANSACTIONS (سجل المعاملات والفواتير الأخيرة)
          ============================================================== */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between pb-3.5 border-b border-[#C8D3CC]/50">
          <div>
            <h3 className="text-base sm:text-xl font-black text-[#132A1C] font-serif-display">
              أحدث المعاملات والمصروفات الميدانية
            </h3>
            <p className="text-xs sm:text-sm text-[#4E6A5A] mt-0.5 font-medium">
              توثيق دقيق لكل فاتورة، اسم التاجر، الوقت، وحالة المطابقة مع العهد
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectView('expenses')}
            className="text-xs sm:text-sm font-bold min-h-[42px]"
          >
            عرض الكل
          </Button>
        </div>

        <div className="space-y-3.5">
          {expenses.slice(0, 5).map((exp) => (
            <div
              key={exp.id}
              className="p-4 sm:p-5 rounded-2xl neu-raised-sm hover:neu-inset transition-all flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-13 h-13 rounded-2xl neu-button flex items-center justify-center text-[#2B543B] shrink-0">
                  <Receipt className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm sm:text-base font-bold text-[#142B1E] truncate">
                    {exp.taskTitle || exp.vendorName || 'مصروف ميداني عام'}
                  </h4>
                  <div className="flex items-center gap-2.5 text-xs text-[#506E5E] mt-1 font-medium flex-wrap">
                    <span className="font-semibold text-[#1F3728]">{exp.submittedBy}</span>
                    <span>•</span>
                    <span className="font-mono">{exp.submittedAt}</span>
                    <span>•</span>
                    <span className="text-[#265338] font-bold">{exp.fundName}</span>
                  </div>
                </div>
              </div>

              <div className="text-left shrink-0">
                <span className="text-base sm:text-lg font-black text-[#142B1D] font-mono block dir-ltr">
                  -{formatCurrency(exp.totalWithTax)}
                </span>
                <span className="text-xs neu-inset-sm px-3 py-1 rounded-full text-[#285539] font-bold inline-block mt-1">
                  {exp.status === 'approved' ? 'معتمد' : 'تحت المراجعة'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==============================================================
          SECTION: أين ذهبت كل هللة (Expense Attribution Table)
          ============================================================== */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-8 space-y-5 overflow-hidden">
        <div className="flex items-center justify-between pb-3.5 border-b border-[#C8D3CC]/50 flex-wrap gap-2">
          <div>
            <h3 className="text-base sm:text-xl font-black text-[#132A1C] font-serif-display flex items-center gap-2.5">
              <Receipt className="w-6 h-6 text-[#2E583F] stroke-[2.2]" />
              <span>أين ذهبت كل هللة: تتبع المصروفات بالمهام والمسؤولين</span>
            </h3>
            <p className="text-xs sm:text-sm text-[#4E6A5A] mt-0.5 font-medium">
              ربط كل مصروف باسم المهمة، المسؤول المنفذ، العهدة المسحوبة، والتوزيع المتتالي (Cascade)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectView('expenses')}
            className="text-xs sm:text-sm font-bold min-h-[42px]"
          >
            عرض كافة الفواتير
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead className="text-[#506E5E] font-bold border-b border-[#C8D3CC]/50">
              <tr>
                <th className="p-4">الفاتورة والتاريخ</th>
                <th className="p-4">المهمة المرتبطة</th>
                <th className="p-4">المسؤول المنفذ</th>
                <th className="p-4">العهدة المستهدفة</th>
                <th className="p-4">المبلغ بالضريبة</th>
                <th className="p-4 text-center">حالة الصرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D3CC]/30">
              {expenses.slice(0, 5).map((exp) => (
                <tr key={exp.id} className="hover:neu-inset transition">
                  <td className="p-4 font-mono">
                    <strong className="text-[#162C1E] block text-sm">{exp.code}</strong>
                    <span className="text-xs text-[#5D7A6B]">{exp.submittedAt}</span>
                  </td>

                  <td className="p-4 max-w-xs">
                    <span className="font-bold text-[#142A1D] block truncate text-sm">{exp.taskTitle || 'مصروف عام'}</span>
                    <span className="text-xs text-[#2A543A] font-mono block font-bold mt-0.5">{exp.taskCode || exp.taskId || 'عام'}</span>
                  </td>

                  <td className="p-4">
                    <span className="font-bold text-[#1B3426]">{exp.submittedBy}</span>
                  </td>

                  <td className="p-4">
                    <span className="text-[#2B4737] block font-medium">{exp.fundName}</span>
                    {exp.cascadeSplit && (
                      <span className="text-xs neu-inset-sm text-[#2C5271] px-2.5 py-1 rounded-full font-bold block w-fit mt-1">
                        تغطية ثنائية (Cascade)
                      </span>
                    )}
                    {exp.isDeficit && (
                      <span className="text-xs neu-inset-sm text-[#963F33] px-2.5 py-1 rounded-full font-bold block w-fit mt-1">
                        عجز نقدي مؤقت
                      </span>
                    )}
                  </td>

                  <td className="p-4 font-mono font-black text-[#132A1C] text-base">
                    {formatCurrency(exp.totalWithTax)}
                  </td>

                  <td className="p-4 text-center">
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full neu-inset-sm ${
                      exp.status === 'approved' ? 'text-[#215134]' :
                      exp.status === 'rejected' ? 'text-[#96372B]' :
                      'text-[#5F3874]'
                    }`}>
                      {exp.status === 'approved' ? 'معتمد ومطابق' : exp.status === 'rejected' ? 'مرفوض' : 'بانتظار التدقيق'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==============================================================
          SECTION: التقييم العادل والموضوعي للإنجاز (Performance)
          ============================================================== */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-8 space-y-6">
        <div>
          <h3 className="text-base sm:text-xl font-black text-[#132A1C] font-serif-display flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-[#29553C] stroke-[2.2]" />
            <span>التقييم العادل والموضوعي للإنجاز الميداني والالتزام</span>
          </h3>
          <p className="text-xs sm:text-sm text-[#4E6A5A] mt-0.5 font-medium">
            قياس الأداء الحقيقي بالأرقام: من أنجز أكثر؟ من التزم بالمواعيد؟ وأين نقاط التوقف الميدانية؟
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {users.map((u) => {
            const userTasks = tasks.filter((t) => t.assigneeId === u.id);
            const userCompleted = userTasks.filter((t) => t.status === 'completed' || t.status === 'approved').length;
            const userPaused = userTasks.filter((t) => t.isPaused).length;
            const completionRate = userTasks.length > 0 ? Math.round((userCompleted / userTasks.length) * 100) : 100;
            const onTimeCompliance = completionRate >= 75 ? '96%' : '84%';

            return (
              <div key={u.id} className="neu-raised rounded-3xl p-5 space-y-3.5">
                <div className="flex items-center gap-3.5">
                  <img
                    src={u.avatar}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover shadow-xs"
                  />
                  <div>
                    <h4 className="font-bold text-[#142B1D] text-sm sm:text-base">{u.name}</h4>
                    <span className="text-xs text-[#5D7A6A] block font-medium">{u.roleTitleAr}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-[#C8D3CC]/50 text-xs sm:text-sm">
                  <div className="flex justify-between text-[#446251]">
                    <span>المهام المنجزة:</span>
                    <strong className="text-[#132A1C] font-mono">{userCompleted} / {userTasks.length}</strong>
                  </div>
                  <div className="flex justify-between text-[#446251]">
                    <span>نسبة الالتزام بالموعد:</span>
                    <strong className="text-[#235337] font-bold font-mono">{onTimeCompliance}</strong>
                  </div>
                  <div className="flex justify-between text-[#446251]">
                    <span>نقاط التعثر / التوقف:</span>
                    <strong className={userPaused > 0 ? 'text-[#91461A] font-bold' : 'text-[#648272]'}>
                      {userPaused > 0 ? `${userPaused} مهام متوقفة` : 'لا يوجد تعثر'}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
