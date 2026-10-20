'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CircleDollarSign, Eye, LoaderCircle, MessageSquareText } from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
  StatusPill,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { type HpInstallment, type HpOptions, money, shortDate, today } from '@/lib/hp';
import { useAuth } from '@/lib/auth-context';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import { SearchSelect } from '@/components/search-select';

type PenaltyPreview = {
  penalty_amount: number;
  penalty_total_amount: number;
  months_overdue: number;
};

export default function InstallmentsPage() {
  const { hasPermission, featureEnabled } = useAuth();
  const canSms = featureEnabled('sms') && hasPermission('sms', 'can_create');
  const [smsSending, setSmsSending] = useState<number | null>(null);
  const [rows, setRows] = useState<HpInstallment[]>([]);
  const [options, setOptions] = useState<HpOptions | null>(null);
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ instalment: HpInstallment; penalty: PenaltyPreview } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      if (overdue) query.set('overdue', '1');
      const listPath = query.toString()
        ? `/v1/hp/installments?${query}`
        : '/v1/hp/installments';
      const [list, optionResponse] = await Promise.all([
        api.getAll<HpInstallment>(listPath),
        api.get<HpOptions>('/v1/hp/options'),
      ]);
      setRows(list.data || []);
      setOptions(optionResponse.data || null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [overdue, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function inspect(row: HpInstallment) {
    try {
      const response = await api.get<{ instalment: HpInstallment; penalty: PenaltyPreview }>(`/v1/installments/${row.id}?as_of=${today()}`);
      setSelected(response.data || null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    }
  }

  const outstanding = rows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
  async function sendArrearsSms(row: HpInstallment) {
    if (!row.sum?.id) return;
    setSmsSending(row.id);
    try {
      const res = await api.post(`/v1/sms/arrears/${row.sum.id}`, {});
      setNotice({ type: 'success', text: res.message || 'Arrears SMS sent.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setSmsSending(null);
    }
  }

  const overdueCount = rows.filter((row) => ['pending', 'partial'].includes(row.status) && row.instalment_date.slice(0, 10) < today()).length;

  return (
    <div className="space-y-6">
      <OperationHeader eyebrow="Collections" title="Installments" description="Track due schedules, calculate overdue penalties, accept partial payments, and carry excess payments into future installments." icon={CalendarClock} />
      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}
      <section className="grid gap-4 sm:grid-cols-3">
        <OperationMetric label="Visible installments" value={String(rows.length)} tone="indigo" />
        <OperationMetric label="Visible outstanding" value={money(outstanding)} tone="amber" />
        <OperationMetric label="Overdue" value={String(overdueCount)} tone={overdueCount ? 'rose' : 'emerald'} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">All statuses</option><option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="converted">Converted</option><option value="cancelled">Cancelled</option></select>
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={overdue} onChange={(event) => setOverdue(event.target.checked)} /> Overdue only</label>
        </div>
        <div className="content-scrollbar overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Agreement</th><th className="px-5 py-3">Installment</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3">Balance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={6} label="Loading installments..." /> : rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">No installments match this view.</td></tr> : rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4"><div className="font-semibold text-slate-900">{row.agreement_no}</div><div className="text-xs text-slate-500">{row.sum?.customer_name}</div></td>
                  <td className="px-5 py-4">#{row.instalment_no} · {money(row.base_amount)}</td>
                  <td className={`px-5 py-4 ${['pending', 'partial'].includes(row.status) && row.instalment_date.slice(0, 10) < today() ? 'font-semibold text-rose-700' : ''}`}>{shortDate(row.instalment_date)}</td>
                  <td className="px-5 py-4 font-semibold">{money(row.balance_amount)}</td>
                  <td className="px-5 py-4"><StatusPill status={row.status} /></td>
                  <td className="px-5 py-4 text-right">{canSms && ['pending', 'partial'].includes(row.status) && row.instalment_date.slice(0, 10) < today() && (<button onClick={() => void sendArrearsSms(row)} disabled={smsSending === row.id} title="Send arrears SMS to customer" className="mr-1 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">{smsSending === row.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} SMS</button>)}<button onClick={() => inspect(row)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Eye className="h-4 w-4" /> Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected && options && (
        <PaymentModal
          data={selected}
          options={options}
          canPay={hasPermission('installments', 'can_create') && ['pending', 'partial'].includes(selected.instalment.status)}
          onClose={() => setSelected(null)}
          onPaid={(message) => {
            setSelected(null);
            setNotice({ type: 'success', text: message || 'Installment payment recorded.' });
            load();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({ data, options, canPay, onClose, onPaid }: { data: { instalment: HpInstallment; penalty: PenaltyPreview }; options: HpOptions; canPay: boolean; onClose: () => void; onPaid: (message?: string) => void }) {
  const { instalment, penalty } = data;
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState(String(Number(instalment.balance_amount) + Number(penalty.penalty_amount)));
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState('');
  const [cheque, setCheque] = useState({
    bank_id: '',
    bank_branch_id: '',
    cheque_no: '',
    account_no: '',
    date: today(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/v1/installments/${instalment.id}/pay`, {
        payment_date: paymentDate,
        amount: Number(amount),
        payment_method: method,
        bank_detail_id: bankId ? Number(bankId) : null,
        discount: Number(discount || 0),
        waive_penalty: waive,
        note: note || null,
        cheque: method === 'cheque'
          ? {
              bank_id: Number(cheque.bank_id),
              bank_branch_id: Number(cheque.bank_branch_id),
              cheque_no: cheque.cheque_no,
              account_no: cheque.account_no,
              due_date: cheque.date,
            }
          : null,
      });
      onPaid(res.message);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OperationModal title={`${instalment.agreement_no} · Installment #${instalment.instalment_no}`} description={`Due ${shortDate(instalment.instalment_date)}`} onClose={onClose} width="max-w-2xl">
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <div className="grid gap-3 sm:grid-cols-3"><OperationMetric label="Principal balance" value={money(instalment.balance_amount)} /><OperationMetric label="Current penalty" value={money(penalty.penalty_amount)} tone={penalty.penalty_amount ? 'rose' : 'emerald'} help={penalty.months_overdue ? `${penalty.months_overdue} overdue month(s)` : 'Within grace period'} /><OperationMetric label="Total due" value={money(Number(instalment.balance_amount) + Number(penalty.penalty_amount))} tone="amber" /></div>
        {instalment.payments?.length > 0 && <div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-2 text-sm font-bold">Payment history</h3>{instalment.payments.map((payment) => <div key={payment.id} className="flex justify-between border-t border-slate-100 py-2 text-sm first:border-0"><span>{shortDate(payment.payment_date)} · {payment.payment_method.replaceAll('_', ' ')}</span><span className="font-semibold">{money(payment.total_amount)}</span></div>)}</div>}
        {canPay ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <OperationField label="Payment date" required><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
            <OperationField label="Payment amount" required help="Excess is automatically carried into the next unpaid installment."><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
            <OperationField label="Payment method" required><select value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></OperationField>
            <OperationField label="Principal discount"><input type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
            {['card', 'bank_transfer'].includes(method) && <OperationField label="Bank account" required><SearchSelect value={bankId} onChange={setBankId} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>}
            <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"><input type="checkbox" checked={waive} onChange={(event) => { const checked = event.target.checked; setWaive(checked); setAmount(String(Number(instalment.balance_amount) + (checked ? 0 : Number(penalty.penalty_amount)))); }} /> Waive calculated penalty</label>
          </div>
          {method === 'cheque' && <ChequeEntryFields banks={options.cheque_banks} value={cheque} onChange={setCheque} />}
          <OperationField label="Collection note"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
          <OperationActions saving={saving} submitLabel="Record payment" onCancel={onClose} />
        </> : <div className="flex items-center gap-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-600"><CircleDollarSign className="h-5 w-5" /> This installment is no longer payable.</div>}
      </form>
    </OperationModal>
  );
}
