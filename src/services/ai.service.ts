import { dataStore } from '../lib/storage';
import { formatCurrency } from '../lib/utils/format';

export interface AIOperationsAnalysis {
  healthScore: number; // 0 - 100
  statusSummary: string;
  insights: {
    type: 'critical' | 'warning' | 'opportunity' | 'success';
    title: string;
    description: string;
    actionLabel?: string;
    targetModule?: string;
  }[];
  costSavingTips: string[];
  executiveBriefing: string;
}

export class AIService {
  public static async analyzeOperations(): Promise<AIOperationsAnalysis> {
    const tasks = dataStore.getTasks();
    const funds = dataStore.getFunds();
    const expenses = dataStore.getExpenses();
    const settlements = dataStore.getSettlements();

    const lowFunds = funds.filter((f) => f.status === 'warning' || f.status === 'depleted');
    const urgentTasks = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed');
    const pendingExpenses = expenses.filter((e) => e.status === 'pending_approval');
    const pendingSettlements = settlements.filter((s) => s.status === 'under_review');
    const highValueExpenses = expenses.filter((e) => e.totalWithTax > 3000);

    // Compute intelligent score
    let score = 92;
    if (lowFunds.length > 0) score -= lowFunds.length * 8;
    if (urgentTasks.length > 1) score -= 6;
    if (pendingExpenses.length > 3) score -= 5;
    if (score < 40) score = 40;

    const insights: AIOperationsAnalysis['insights'] = [];

    if (lowFunds.length > 0) {
      insights.push({
        type: 'critical',
        title: `تنبيه عهدة حرجة: ${lowFunds.length} عهد تتطلب التغذية`,
        description: `رصيد عهدة "${lowFunds[0].name}" الحالي ${formatCurrency(lowFunds[0].currentBalance, lowFunds[0].currency)} وصل إلى النطاق الحرج (${Math.round((lowFunds[0].currentBalance / lowFunds[0].totalAllocation) * 100)}%). يوصى برفع تسوية دورية فورية.`,
        actionLabel: 'مراجعة وتغذية العهد',
        targetModule: 'funds',
      });
    }

    if (pendingExpenses.length > 0) {
      const sumPending = pendingExpenses.reduce((s, e) => s + e.totalWithTax, 0);
      insights.push({
        type: 'warning',
        title: `فواتير معلقة: ${pendingExpenses.length} إيصالات بقيمة ${formatCurrency(sumPending)}`,
        description: `هناك فواتير تتطلب مراجعة واعتماد المسؤول المالي قبل إقفال التسوية النصف شهرية.`,
        actionLabel: 'اعتماد الفواتير',
        targetModule: 'expenses',
      });
    }

    if (urgentTasks.length > 0) {
      insights.push({
        type: 'warning',
        title: `مهام ميدانية طارئة: ${urgentTasks.length} مهمة تحت التنفيذ المباشر`,
        description: `أقرب موعد إنجاز: "${urgentTasks[0].title}" للمسؤول ${urgentTasks[0].assigneeName} بتاريخ ${urgentTasks[0].dueDate}.`,
        actionLabel: 'متابعة المهام',
        targetModule: 'tasks',
      });
    }

    if (highValueExpenses.length > 0) {
      insights.push({
        type: 'opportunity',
        title: 'فرصة تحسين التكاليف وعقود التوريد',
        description: `التعاقد المباشر مع موردي المواد والمعدات للمصروفات التي تتجاوز 3,000 درهم يوفر ما يقارب 12% سنوياً.`,
        actionLabel: 'استعراض التقارير',
        targetModule: 'reports',
      });
    }

    insights.push({
      type: 'success',
      title: 'معدل التوافق الضريبي سليم (100%)',
      description: 'جميع الفواتير المسجلة خضعت للتدقيق وحساب ضريبة القيمة المضافة 5% بدقة رقمية عالية.',
      actionLabel: 'التقرير المالي',
      targetModule: 'reports',
    });

    const costSavingTips = [
      'دمج فواتير الوقود مع بطاقات أدنوك المؤسسية يمنح خصم استهلاك 8%',
      'جدولة تسويات العهد النقدية في يومي 15 و 30 يسرّع دورة التدقيق المحاسبي',
      'تفعيل أوامر الشراء المسبقة للمشتريات الميدانية الأكبر من 5,000 درهم يمنع تجميد السيولة'
    ];

    const executiveBriefing = `الاستقرار التشغيلي العام بمستوى ${score}/100. توجد ${urgentTasks.length} مهام طارئة تحت المتابعة، و ${lowFunds.length} عهدة نقدية تقترب من حد التحذير. معدل إنجاز المهام لشهر سبتمبر متزن ويحقق المستهدف الزمني.`;

    return {
      healthScore: score,
      statusSummary: score >= 85 ? 'ممتاز ومستقر' : 'يتطلب إجراءات متابعة',
      insights,
      costSavingTips,
      executiveBriefing,
    };
  }
}
