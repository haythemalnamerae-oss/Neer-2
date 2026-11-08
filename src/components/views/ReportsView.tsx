import React, { useState } from 'react';
import {
  BarChart3,
  Download,
  Trophy,
  Clock,
  Wallet,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Receipt,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { ReportsService } from '../../services/reports.service';
import { dataStore } from '../../lib/storage';
import { formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { OperationsCashFlowChart, ExpenseDonutChart } from '../charts/OperationsCharts';

export const ReportsView: React.FC = () => {
  const settings = dataStore.getSettings();
  const metrics = ReportsService.getDashboardMetrics();
  const categoryBreakdown = ReportsService.getExpenseCategoryBreakdown();
  const teamPerformance = ReportsService.getTeamPerformance();
  const custodyReports = ReportsService.getCustodyTrackingReport();

  const [expandedFundId, setExpandedFundId] = useState<string | null>(null);

  const handleExportCSV = () => {
    const csvData = ReportsService.exportExpensesToCSV();
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Ops_Full_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="neu-raised-lg rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[#325A41] font-bold text-xs uppercase mb-1">
            <BarChart3 className="w-5 h-5 stroke-[2.2]" />
            <span>التقارير التحليلية ومؤشرات الأداء الميداني (KPIs)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#142B1D] font-serif-display">
            مؤشرات الأداء والتحليل المالي الشامل
          </h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            تقييم حقيقي للإنجازات: من اشتغل أكثر فعلياً، وأين ذهبت العهد النقدية والمقبوضات بالتفصيل الدقيق
          </p>
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={handleExportCSV}
          icon={<Download className="w-4.5 h-4.5 stroke-[2.2]" />}
          className="text-xs sm:text-sm font-bold min-h-[44px]"
        >
          تصدير تقرير شامل (CSV)
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="neu-raised rounded-3xl p-5 space-y-1.5">
          <span className="text-xs font-semibold text-[#577262] block">معدل إنجاز المهام العام</span>
          <span className="text-2xl sm:text-3xl font-black text-[#142B1D] block font-mono">{metrics.taskCompletionRate}%</span>
          <span className="text-xs text-[#28573A] font-bold block">
            {metrics.completedTasks} مهمة منجزة من {metrics.totalTasks}
          </span>
        </div>

        <div className="neu-raised rounded-3xl p-5 space-y-1.5">
          <span className="text-xs font-semibold text-[#577262] block">معدل السيولة النقدية الحالية</span>
          <span className="text-2xl sm:text-3xl font-black text-[#265338] block font-mono">{metrics.fundLiquidityRate}%</span>
          <span className="text-xs text-[#527060] block font-medium">
            رصيد متاح {formatCurrency(metrics.totalRemainingFunds)}
          </span>
        </div>

        <div className="neu-raised rounded-3xl p-5 space-y-1.5">
          <span className="text-xs font-semibold text-[#577262] block">إجمالي المصروفات المنفقة</span>
          <span className="text-2xl sm:text-3xl font-black text-[#142B1D] block font-mono dir-ltr">
            {formatCurrency(metrics.totalExpensesAmount)}
          </span>
          <span className="text-xs text-[#315773] font-bold block">خاضعة لضريبة {settings.taxRate}%</span>
        </div>

        <div className="neu-raised rounded-3xl p-5 space-y-1.5">
          <span className="text-xs font-semibold text-[#577262] block">دورات التسوية المعتمدة</span>
          <span className="text-2xl sm:text-3xl font-black text-[#55306B] block font-mono">{metrics.settlementsCount} دورات</span>
          <span className="text-xs text-[#55306B] font-bold block">سندات تصفية رسمية</span>
        </div>
      </div>

      {/* SECTION 1: من اشتغل أكثر؟ (Leaderboard & Real Productivity) */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 overflow-hidden space-y-4">
        <div className="pb-3 border-b border-[#C8D3CC]/50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-600" />
              <h3 className="font-black text-base sm:text-lg text-[#142B1D] font-serif-display">
                لوحة تقييم الإنجاز الحقيقي: من اشتغل أكثر؟
              </h3>
            </div>
            <p className="text-xs text-[#527060] mt-1 font-medium">
              ترتيب المسؤولين الميدانيين بناءً على ساعات العمل الفعلية المسجلة، عدد المهام المنجزة، ونسبة الالتزام بالمواعيد
            </p>
          </div>
          <span className="neu-inset-sm text-xs font-bold text-emerald-800 px-3 py-1.5 rounded-xl">
            مبني على التوقيتات والمواقع الميدانية الحقيقية
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead className="text-[#4E6C5C] font-bold border-b border-[#C8D3CC]/50">
              <tr>
                <th className="p-3.5">الترتيب</th>
                <th className="p-3.5">المسؤول الميداني</th>
                <th className="p-3.5">القسم</th>
                <th className="p-3.5">ساعات العمل الفعلية</th>
                <th className="p-3.5">المهام المنجزة</th>
                <th className="p-3.5">الالتزام بالمواعيد</th>
                <th className="p-3.5">معدل الإنجاز</th>
                <th className="p-3.5">إجمالي المنصرف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D3CC]/30">
              {teamPerformance.map((tp, index) => {
                const rankBadges = ['🥇 الأكثر إنتاجية', '🥈 المركز الثاني', '🥉 المركز الثالث'];
                const rankBadge = rankBadges[index] || `#${index + 1}`;

                return (
                  <tr key={tp.userId} className="hover:neu-inset transition">
                    <td className="p-3.5 font-bold">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-black ${index === 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'neu-inset-sm text-slate-700'}`}>
                        {rankBadge}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={tp.avatar}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover shadow-xs"
                        />
                        <span className="font-extrabold text-[#142B1D]">{tp.name}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-[#446251] font-medium">{tp.department}</td>
                    <td className="p-3.5 font-mono font-black text-emerald-800">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{tp.actualWorkHours} ساعة</span>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-[#255639] font-black">
                      {tp.completedTasks} <span className="text-[11px] text-slate-500 font-normal">/ {tp.assignedTasks}</span>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-700">
                      {tp.onTimeRate}%
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold font-mono">{tp.completionRate}%</span>
                        <div className="w-16 neu-inset-sm h-2 rounded-full overflow-hidden p-0.5">
                          <div
                            className="bg-[#2E583F] h-full rounded-full transition-all"
                            style={{ width: `${tp.completionRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono font-black text-[#142B1D] dir-ltr text-xs sm:text-sm">
                      {formatCurrency(tp.totalSpent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        <div className="lg:col-span-7 neu-raised rounded-3xl p-6 space-y-3">
          <h3 className="font-black text-base text-[#142B1D] font-serif-display">حركة السيولة والإنفاق التراكمي</h3>
          <OperationsCashFlowChart />
        </div>
        <div className="lg:col-span-5 neu-raised rounded-3xl p-6 space-y-3">
          <h3 className="font-black text-base text-[#142B1D] font-serif-display">توزيع المصروفات حسب التصنيف</h3>
          <ExpenseDonutChart data={categoryBreakdown} />
        </div>
      </div>

      {/* SECTION 2: أين ذهبت العهد بالتفصيل؟ (Custody Outflows & Cash Receipts) */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="pb-3 border-b border-[#C8D3CC]/50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-800" />
              <h3 className="font-black text-base sm:text-lg text-[#142B1D] font-serif-display">
                أين ذهبت العهد والمقبوضات؟ (تدقيق مسار الإنفاق لكل عهدة)
              </h3>
            </div>
            <p className="text-xs text-[#527060] mt-1 font-medium">
              تفصيل كامل لجميع البنود المنفقة، السحب المتسلسل (Cascade)، والمبالغ المقبوضة المودعة لكل عهدة نقدية
            </p>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            اضغط على أي عهدة لعرض كشف الحساب والبنود التفصيلية
          </span>
        </div>

        <div className="space-y-4">
          {custodyReports.map((item) => {
            const isExpanded = expandedFundId === item.fund.id;

            return (
              <div key={item.fund.id} className="neu-raised rounded-2xl overflow-hidden transition-all">
                {/* Fund Summary Bar */}
                <div
                  onClick={() => setExpandedFundId(isExpanded ? null : item.fund.id)}
                  className="p-4 sm:p-5 flex items-center justify-between flex-wrap gap-4 cursor-pointer hover:bg-black/[0.01]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h4 className="font-black text-sm sm:text-base text-slate-900">{item.fund.name}</h4>
                      <span className="text-xs neu-inset-sm px-2.5 py-0.5 rounded-lg text-emerald-800 font-bold">
                        أمين العهدة: {item.fund.holderName}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                      <span>التخصيص: <strong className="font-mono text-slate-800">{formatCurrency(item.fund.totalAllocation)}</strong></span>
                      <span>المنصرف: <strong className="font-mono text-rose-700">{formatCurrency(item.totalExpenses)}</strong> ({item.expensesCount} فاتورة)</span>
                      <span>المقبوضات المودعة: <strong className="font-mono text-emerald-800">{formatCurrency(item.totalReceipts)}</strong></span>
                      {item.openDeficitExpenses.length > 0 && (
                        <span className="text-rose-700 font-black animate-pulse">
                          ⚠️ يوجد {item.openDeficitExpenses.length} عجز غير مسوى
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <span className="text-[11px] text-slate-500 block font-semibold">الرصيد المتاح حالياً</span>
                      <strong className="text-base sm:text-lg font-black text-emerald-800 font-mono dir-ltr">
                        {formatCurrency(item.fund.currentBalance)}
                      </strong>
                    </div>
                    <div className="w-8 h-8 rounded-xl neu-raised flex items-center justify-center text-slate-600">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Itemized Outflow Details */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 border-t border-black/[0.04] neu-inset space-y-4">
                    {/* Itemized Expenses List */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-rose-700" />
                        <span>كشف المصروفات والفواتير المنفقة من هذه العهدة:</span>
                      </h5>

                      {item.fundExpenses.length > 0 ? (
                        <div className="space-y-2">
                          {item.fundExpenses.map((exp) => (
                            <div
                              key={exp.id}
                              className="p-3.5 neu-raised rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-slate-800">{exp.description}</span>
                                  <span className="text-[11px] neu-inset-sm px-2 py-0.5 rounded-md font-mono text-slate-600">
                                    #{exp.invoiceNumber}
                                  </span>
                                  {exp.isDeficit && !exp.isCoveredFromCash && (
                                    <span className="text-[10px] bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded-md font-bold">
                                      عجز غير مسوى ({formatCurrency(exp.deficitAmount || 0)})
                                    </span>
                                  )}
                                  {exp.isDeficit && exp.isCoveredFromCash && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md font-bold">
                                      تمت التغطية من الصندوق
                                    </span>
                                  )}
                                  {Boolean(exp.cascadeSplit) && (
                                    <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-md font-bold">
                                      سحب متسلسل (Cascade)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                  <span>المورد: {exp.vendorName}</span>
                                  <span>التاريخ: {exp.submittedAt}</span>
                                  {exp.taskTitle && <span>المهمة: {exp.taskTitle}</span>}
                                  <span>المسؤول: {exp.submittedBy}</span>
                                </div>
                              </div>

                              <div className="text-left font-mono font-black text-sm text-slate-900 dir-ltr">
                                {formatCurrency(exp.totalWithTax)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-500 neu-inset-sm rounded-xl">
                          لم يتم تسجيل أي مصروفات من هذه العهدة حتى الآن.
                        </div>
                      )}
                    </div>

                    {/* Receipts List */}
                    {item.fundReceipts.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-black/[0.04]">
                        <h5 className="text-xs font-black text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                          <ArrowUpRight className="w-4 h-4 text-emerald-700" />
                          <span>المبالغ المقبوضة والمودعة (صندوق العهدة):</span>
                        </h5>
                        <div className="space-y-2">
                          {item.fundReceipts.map((rec) => (
                            <div
                              key={rec.id}
                              className="p-3 neu-raised rounded-xl flex items-center justify-between text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">{rec.receivedBy}</span>
                                  <span className="neu-inset-sm px-2 py-0.5 rounded-md text-[11px] text-slate-600 font-bold">
                                    المصدر: {rec.source}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500">{rec.notes || 'سند قبض معتمد'} - {rec.date}</div>
                              </div>
                              <span className="font-mono font-black text-sm text-emerald-800 dir-ltr">
                                +{formatCurrency(rec.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
