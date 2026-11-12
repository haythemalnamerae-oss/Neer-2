import { apiRequest, getSession, loadUiSnapshot } from '../lib/api/session';
import type { CashReceipt, Expense, PettyCashFund, Settlement, StandingAccount, StandingAccountEntry } from '../types/domain';

const idempotencyKey = () => crypto.randomUUID();
async function workflow<T>(name: string, body: Record<string, unknown>, refresh = true): Promise<T> {
  const session = getSession();
  if (!session) throw new Error('يلزم تسجيل الدخول إلى المؤسسة قبل تنفيذ أي حركة مالية.');
  const result = await apiRequest<T>(session, `/finance/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (refresh) await loadUiSnapshot(getSession() || session);
  return result;
}

export const FinanceApiService = {
  createFund(payload: { name: string; holderId: string; totalAllocation: number; currency: string; warningThreshold: number; purpose?: string; notes?: string }) {
    return workflow<PettyCashFund>('create-fund', { idempotencyKey: idempotencyKey(), payload: {
      name: payload.name, holder_id: payload.holderId, total_allocation: payload.totalAllocation,
      currency: payload.currency, warning_threshold: payload.warningThreshold, purpose: payload.purpose || '', notes: payload.notes || null,
    } });
  },
  replenishFund(fundId: string, amount: number, notes?: string) {
    return workflow('replenish-fund', { fundId, amount, notes, idempotencyKey: idempotencyKey() });
  },
  createExpense(payload: {
    fundId: string; amount: number; taxAmount: number; category: string; description: string; invoiceNumber?: string; vendorName: string;
    merchantName?: string; hasReceipt: boolean; receiptUrl?: string; expenseDate?: string; taskId?: string; notes?: string;
    standingAccountId?: string;
  }) {
    return workflow<Expense>('create-expense', { idempotencyKey: idempotencyKey(), payload: {
      fund_id: payload.fundId, amount: payload.amount, tax_amount: payload.taxAmount, category: payload.category,
      description: payload.description, invoice_number: payload.invoiceNumber || '', vendor_name: payload.vendorName,
      merchant_name: payload.merchantName || null, has_receipt: payload.hasReceipt, receipt_url: payload.receiptUrl || null,
      expense_date: payload.expenseDate || new Date().toISOString().slice(0,10), task_id: payload.taskId || null,
      notes: payload.notes || null, standing_account_id: payload.standingAccountId || null,
    } });
  },
  reviewExpense(id: string, approve: boolean, reason?: string) {
    return workflow<Expense>('review-expense', { expenseId: id, approve, reason });
  },
  coverDeficit(expenseId: string) {
    return workflow<Expense>('cover-deficit', { expenseId, idempotencyKey: idempotencyKey() });
  },
  createSettlement(fundId: string, periodStart: string, periodEnd: string, expenseIds: string[]) {
    return workflow<Settlement>('create-settlement', { fundId, periodStart, periodEnd, expenseIds, idempotencyKey: idempotencyKey() });
  },
  reviewSettlement(id: string, action: 'audit' | 'approve' | 'reject', notes?: string) {
    return workflow<Settlement>('review-settlement', { settlementId: id, action, notes });
  },
  createCashReceipt(payload: { amount: number; source: string; type: string; receiptDate: string; notes?: string; fundId?: string }) {
    return workflow<CashReceipt>('create-cash-receipt', { idempotencyKey: idempotencyKey(), payload: {
      amount: payload.amount, source: payload.source, type: payload.type, receipt_date: payload.receiptDate,
      notes: payload.notes || null, fund_id: payload.fundId || null,
    } });
  },
  createStandingAccount(payload: {
    name: string; vendorName?: string; category: string; direction: string; openingBalance: number; currency: string;
    contactPhone?: string; address?: string; monthlyLimit?: number; defaultAmount?: number; notes?: string;
    imageUrl?: string; referenceImageUrl?: string; accountType?: string;
  }) {
    return workflow<StandingAccount>('create-standing-account', { idempotencyKey: idempotencyKey(), payload: {
      name: payload.name, vendor_name: payload.vendorName || null, category: payload.category, direction: payload.direction,
      opening_balance: payload.openingBalance, currency: payload.currency, contact_phone: payload.contactPhone || null,
      address: payload.address || null, monthly_limit: payload.monthlyLimit ?? null, default_amount: payload.defaultAmount ?? null,
      notes: payload.notes || null, image_url: payload.imageUrl || null, reference_image_url: payload.referenceImageUrl || null,
      account_type: payload.accountType || 'other',
    } });
  },
  createStandingCharge(accountId: string, amount: number, date: string, description: string, reference: string) {
    return workflow<StandingAccountEntry>('standing-entry', { idempotencyKey: idempotencyKey(), payload: {
      standing_account_id: accountId, amount, entry_type: 'charge', entry_date: date, description, reference,
    } });
  },
  settleStandingAccount(accountId: string, amount: number, fundId: string, date: string, reference: string) {
    return workflow<StandingAccountEntry>('settle-standing-account', {
      accountId, amount, fundId, entryDate: date, reference, idempotencyKey: idempotencyKey(),
    });
  },
  setStandingAccountActive(accountId: string, active: boolean, reason?: string) {
    return workflow<StandingAccount>('standing-account-status', { accountId, active, reason: reason || null });
  },
};
