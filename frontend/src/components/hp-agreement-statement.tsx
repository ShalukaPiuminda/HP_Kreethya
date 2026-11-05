'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CircleDollarSign, FileText, HandCoins, LoaderCircle, MessageSquareText, Package, Receipt, Wallet } from 'lucide-react';
import { OperationMetric, OperationModal, StatusPill } from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { type HpAgreementStatement, type HpInstallment, money, shortDate, today } from '@/lib/hp';

/** What the cashier is about to collect, used to pre-fill the payment form. */
export type CollectSuggestion = { principal: number; penalty: number; label: string };

const num = (value: string | number | null | undefined) => Number(value || 0);

function ScheduleStatus({ row }: { row: HpInstallment }) {
  const open = row.status === 'pending' || row.status === 'partial';
  const days = Number(row.days_overdue || 0);
  if (open && days > 0) {
    return <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">Overdue · {days}d</span>;
  }
  if (open && row.instalment_date.slice(0, 10) === today()) {
    return <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">Due today</span>;
  }
  if (row.status === 'pending') {
    return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">Upcoming</span>;
  }
  return <StatusPill status={row.status} />;
}

export function AgreementStatementModal({
  agreementId,
  reloadKey,
  canPay,
  canSms,
  onClose,
  onCollect,
}: {
  agreementId: number;
  /** Bump to refetch after a payment. */
  reloadKey: number;
  canPay: boolean;
  canSms: boolean;
  onClose: () => void;
  onCollect: (instalmentId: number, suggestion: CollectSuggestion) => void;
}) {
  const [data, setData] = useState<HpAgreementStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsState, setSmsState] = useState<{ sending: boolean; message?: string }>({ sending: false });

  useEffect(() => {
    let active = true;
    api.get<HpAgreementStatement>(`/v1/hp/installments/agreements/${agreementId}`)
      .then((response) => { if (active) { setData(response.data || null); setError(null); } })
      .catch((loadError) => { if (active) setError(getApiErrorMessage(loadError)); });
    return () => { active = false; };
  }, [agreementId, reloadKey]);

  const payments = useMemo(() => {
    if (!data) return [];
    return data.agreement.instalments
      .flatMap((row) => (row.payments || []).map((payment) => ({ ...payment, instalment_no: row.instalment_no })))
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.id - a.id);
  }, [data]);

  async function sendSms() {
    setSmsState({ sending: true });
    try {
      const response = await api.post(`/v1/sms/arrears/${agreementId}`, {});
      setSmsState({ sending: false, message: response.message || 'Arrears SMS sent.' });
    } catch (smsError) {
      setSmsState({ sending: false, message: getApiErrorMessage(smsError) });
    }
  }

  const agreement = data?.agreement;
  const totals = data?.totals;
  const open = agreement?.status === 'active';
  const collect: { id: number; suggestion: CollectSuggestion } | null = totals?.next_instalment_id
    ? totals.arrears_amount > 0
      ? { id: totals.next_instalment_id, suggestion: { principal: totals.arrears_amount, penalty: totals.estimated_penalty, label: `Arrears for ${totals.arrears_count} installment(s)` } }
      : { id: totals.next_instalment_id, suggestion: { principal: totals.next_due_amount, penalty: 0, label: 'Next installment' } }
    : null;

  return (
    <OperationModal
      title={agreement ? `${agreement.agreement_no} · Statement` : 'Agreement statement'}
      description={agreement ? [agreement.customer_name, agreement.customer_nic, agreement.customer_phone].filter(Boolean).join(' · ') : undefined}
      icon={FileText}
      onClose={onClose}
      width="max-w-6xl"
    >
      <div className="space-y-6 p-6">
        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        {!data && !error && <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading statement...</div>}
        {agreement && totals && (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-5 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agreement details</span>
                <StatusPill status={agreement.status} />
              </div>
              <div className="grid gap-px bg-slate-200/70 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: Receipt, label: 'Invoice', value: agreement.invoice_no, sub: shortDate(agreement.invoice_date) },
                  { icon: CalendarClock, label: 'Scheme', value: agreement.schema_type, sub: `${totals.instalment_count} installment(s)` },
                  { icon: Wallet, label: 'Contract amount', value: money(agreement.contract_amount), sub: 'Total agreement value' },
                  { icon: HandCoins, label: 'Down payment', value: money(agreement.down_payment), sub: 'Paid at sale' },
                ].map(({ icon: Icon, label, value, sub }) => (
                  <div key={label} className="flex items-start gap-3 bg-white px-5 py-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-500">{label}</div>
                      <div className="truncate font-semibold text-slate-900" title={String(value ?? '')}>{value || '—'}</div>
                      <div className="text-xs text-slate-400">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              {agreement.details?.length > 0 && (
                <div className="space-y-3 border-t border-slate-200/70 bg-slate-50/60 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Items</h3>
                    <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">{agreement.details.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {agreement.details.map((line, index) => (
                      <li key={index} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:items-center sm:px-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Package aria-hidden="true" className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1 self-center">
                          <p className="break-words text-sm font-semibold leading-6 text-slate-800">{line.item_description}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-indigo-700">
                          <span className="text-[10px] font-semibold uppercase tracking-wide">Qty</span>
                          <span className="text-sm font-bold tabular-nums leading-5">{line.qty}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <OperationMetric label="Installment total" value={money(totals.schedule_amount)} help={`${totals.instalment_count} installment(s)`} />
              <OperationMetric label="Paid" value={money(totals.paid_principal)} tone="emerald" help={`${totals.paid_count} of ${totals.instalment_count} fully paid`} />
              <OperationMetric label="Outstanding" value={money(totals.outstanding)} tone="amber" help={totals.next_due_date ? `Next due ${shortDate(totals.next_due_date)}` : 'Nothing left to pay'} />
              <OperationMetric label="Arrears" value={money(totals.arrears_amount)} tone={totals.arrears_amount > 0 ? 'rose' : 'emerald'} help={totals.arrears_count ? `${totals.arrears_count} overdue installment(s)` : 'Up to date'} />
              <OperationMetric label="Payable now" value={money(totals.payable_now)} tone={totals.payable_now > 0 ? 'rose' : 'emerald'} help={totals.estimated_penalty > 0 ? `incl. ${money(totals.estimated_penalty)} penalty` : 'No penalty'} />
            </div>

            <section>
              <h3 className="mb-3 font-bold text-slate-900">Month-wise schedule</h3>
              <div className="content-scrollbar overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Due date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Discount</th>
                      <th className="px-4 py-3 text-right">Penalty paid</th>
                      <th className="px-4 py-3 text-right">Est. penalty</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agreement.instalments.map((row) => {
                      const penalty = num(row.estimated_penalty);
                      return (
                        <tr key={row.id} className={Number(row.days_overdue || 0) > 0 ? 'bg-rose-50/40' : row.status === 'paid' ? 'text-slate-500' : ''}>
                          <td className="px-4 py-3 font-semibold">{row.instalment_no}</td>
                          <td className="px-4 py-3">{shortDate(row.instalment_date)}</td>
                          <td className="px-4 py-3 text-right">{money(row.base_amount)}</td>
                          <td className="px-4 py-3 text-right">{num(row.amount_pay) ? money(row.amount_pay) : '—'}</td>
                          <td className="px-4 py-3 text-right">{num(row.discount) ? money(row.discount) : '—'}</td>
                          <td className="px-4 py-3 text-right">{num(row.penalty_amount) ? money(row.penalty_amount) : '—'}</td>
                          <td className={`px-4 py-3 text-right ${penalty > 0 ? 'font-semibold text-rose-700' : 'text-slate-400'}`}>{penalty > 0 ? money(penalty) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold">{money(row.balance_amount)}</td>
                          <td className="px-4 py-3"><ScheduleStatus row={row} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <tr>
                      <td className="px-4 py-3" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-right">{money(totals.schedule_amount)}</td>
                      <td className="px-4 py-3 text-right">{money(totals.paid_principal)}</td>
                      <td className="px-4 py-3 text-right">{money(totals.discount)}</td>
                      <td className="px-4 py-3 text-right">{money(totals.penalty_paid)}</td>
                      <td className="px-4 py-3 text-right text-rose-700">{money(totals.estimated_penalty)}</td>
                      <td className="px-4 py-3 text-right">{money(totals.outstanding)}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-3 font-bold text-slate-900">Payment history</h3>
              {payments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">No installment payments recorded yet.</div>
              ) : (
                <div className="content-scrollbar max-h-72 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Receipt</th>
                        <th className="px-4 py-3">Inst.</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3 text-right">Principal</th>
                        <th className="px-4 py-3 text-right">Penalty</th>
                        <th className="px-4 py-3 text-right">Discount</th>
                        <th className="px-4 py-3 text-right">Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="px-4 py-3">{shortDate(payment.payment_date)}</td>
                          <td className="px-4 py-3"><div className="font-medium">{payment.payment_no}</div>{payment.collection_no && <div className="text-xs text-slate-400">{payment.collection_no}</div>}</td>
                          <td className="px-4 py-3">#{payment.instalment_no}</td>
                          <td className="px-4 py-3 capitalize">{payment.payment_method.replaceAll('_', ' ')}</td>
                          <td className="px-4 py-3 text-right">{money(payment.principal_amount)}</td>
                          <td className="px-4 py-3 text-right">{num(payment.penalty_amount) ? money(payment.penalty_amount) : '—'}</td>
                          <td className="px-4 py-3 text-right">{num(payment.discount_amount) ? money(payment.discount_amount) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold">{money(payment.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5">
              {smsState.message && <span className="mr-auto text-sm text-slate-500">{smsState.message}</span>}
              {canSms && totals.arrears_count > 0 && (
                <button type="button" onClick={() => void sendSms()} disabled={smsState.sending} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                  {smsState.sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} Send arrears SMS
                </button>
              )}
              {canPay && open && collect && (
                <button type="button" onClick={() => onCollect(collect.id, collect.suggestion)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                  <CircleDollarSign className="h-4 w-4" />
                  {totals.arrears_amount > 0 ? `Collect arrears · ${money(totals.payable_now)}` : `Pay next installment · ${money(totals.next_due_amount)}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </OperationModal>
  );
}
