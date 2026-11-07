import React from 'react';
import {
  BarChart3,
  Download,
} from 'lucide-react';
import { ReportsService } from '../../services/reports.service';
import { formatCurrency } from '../../lib/utils/format';
import { Button } from '../ui/button';
import { OperationsCashFlowChart, ExpenseDonutChart } from '../charts/OperationsCharts';

export const ReportsView: React.FC = () => {
  const metrics = ReportsService.getDashboardMetrics();
  const categoryBreakdown = ReportsService.getExpenseCategoryBreakdown();
  const teamPerformance = ReportsService.getTeamPerformance();

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
            مؤشرات الأداء والتحليل المالي
          </h2>
          <p className="text-xs sm:text-sm text-[#4E6C5B] mt-1 font-medium">
            تحليل شامل لمعدلات الإنجاز، كفاءة استهلاك العهد النقدية، وإنتاجية المسؤولين الميدانيين
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
          <span className="text-xs text-[#315773] font-bold block">خاضعة لضريبة 5%</span>
        </div>

        <div className="neu-raised rounded-3xl p-5 space-y-1.5">
          <span className="text-xs font-semibold text-[#577262] block">دورات التسوية المعتمدة</span>
          <span className="text-2xl sm:text-3xl font-black text-[#55306B] block font-mono">{metrics.settlementsCount} دورات</span>
          <span className="text-xs text-[#55306B] font-bold block">سندات تصفية رسمية</span>
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

      {/* Team Performance Table */}
      <div className="neu-raised-lg rounded-3xl p-5 sm:p-6 overflow-hidden">
        <div className="pb-4 border-b border-[#C8D3CC]/50">
          <h3 className="font-black text-base text-[#142B1D] font-serif-display">مؤشرات أداء الفريق الميداني</h3>
          <p className="text-xs text-[#527060] mt-1 font-medium">
            مقارنة معدلات الإنجاز وحجم المصروفات الميدانية لكل مسؤول
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sm:text-sm">
            <thead className="text-[#4E6C5C] font-bold border-b border-[#C8D3CC]/50">
              <tr>
                <th className="p-4">المسؤول الميداني</th>
                <th className="p-4">القسم</th>
                <th className="p-4">المهام المكلف بها</th>
                <th className="p-4">المنجزة</th>
                <th className="p-4">معدل الإنجاز</th>
                <th className="p-4">إجمالي المصروفات المنفقة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D3CC]/30">
              {teamPerformance.map((tp) => (
                <tr key={tp.userId} className="hover:neu-inset transition">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={tp.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover shadow-xs"
                      />
                      <span className="font-bold text-[#142B1D]">{tp.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-[#446251] font-medium">{tp.department}</td>
                  <td className="p-4 font-mono font-bold text-[#142B1D]">{tp.assignedTasks}</td>
                  <td className="p-4 font-mono text-[#255639] font-black">{tp.completedTasks}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="font-bold font-mono">{tp.completionRate}%</span>
                      <div className="w-20 neu-inset-sm h-2.5 rounded-full overflow-hidden p-0.5">
                        <div
                          className="bg-[#2E583F] h-full rounded-full transition-all"
                          style={{ width: `${tp.completionRate}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono font-black text-[#142B1D] dir-ltr text-sm">
                    {formatCurrency(tp.totalSpent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
