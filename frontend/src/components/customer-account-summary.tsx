'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, LoaderCircle, RefreshCcw, Wallet } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/inventory';
import { displayDate } from '@/lib/purchases';
import type { CustomerOutstanding } from '@/lib/sales';

export function CustomerAccountSummary({ customerCode, advance }: { customerCode: string; advance: number }) {
  const panelId = useId();
  const [data, setData] = useState<CustomerOutstanding | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      setData(null);
      try {
        const response = await api.get<CustomerOutstanding>(`/v1/customer-payments/outstanding?customer_code=${encodeURIComponent(customerCode)}`);
        if (!response.data) throw new Error('Customer balance is unavailable.');
        if (active) setData(response.data);
      } catch (cause) {
        if (active) setError(getApiErrorMessage(cause, 'Unable to load customer balance.'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [customerCode, attempt]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset ${data && data.total_account_outstanding > 0 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-white text-slate-600 ring-slate-200'}`}>
          {loading ? <><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Loading balance…</> : data ? <>Outstanding {formatCurrency(data.total_account_outstanding)}</> : 'Outstanding unavailable'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Wallet aria-hidden="true" className="h-3.5 w-3.5" /> Advance {formatCurrency(data?.advance_balance ?? advance)}
        </span>
        {error ? (
          <button type="button" title={error} onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-50"><RefreshCcw aria-hidden="true" className="h-3.5 w-3.5" /> Retry balance</button>
        ) : (
          <button type="button" disabled={!data} aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded((value) => !value)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
            {expanded ? 'Hide summary' : 'View summary'}<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {expanded && data && (
        <section id={panelId} aria-label="Customer account summary" className="min-w-0 basis-full space-y-3 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Customer account summary</h3>
            <span className="text-xs text-slate-500">Existing balances · excludes this new invoice</span>
          </div>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ['Sales outstanding', data.sales_outstanding],
              ['HP balance', data.hp_outstanding],
              ['Available advance', data.advance_balance],
              ['Net account balance', data.net_balance],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-500">HP balance includes remaining installments and unpaid down payments. Net balance is total outstanding less available advance.</p>
          {data.invoices.length === 0 && data.hp_agreements.length === 0 ? (
            <p className="rounded-lg bg-white px-3 py-3 text-slate-500">No outstanding invoices or HP agreements.</p>
          ) : (
            <div className="content-scrollbar max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Outstanding sales invoices and hire purchase agreements</caption>
                <thead className="sticky top-0 bg-slate-100 text-slate-500">
                  <tr>{['Invoice / Agreement', 'Date', 'Total', 'Paid', 'Outstanding'].map((label, index) => <th key={label} scope="col" className={`whitespace-nowrap px-3 py-2.5 font-semibold ${index > 1 ? 'text-right' : ''}`}>{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.invoices.map((invoice) => (
                    <tr key={invoice.invoice_no}>
                      <td className="px-3 py-2.5"><div className="font-semibold text-slate-800">{invoice.invoice_no}</div><div className="mt-0.5 text-slate-400">Sales{invoice.reference_no ? ` · Ref: ${invoice.reference_no}` : ''}</div></td>
                      <td className="whitespace-nowrap px-3 py-2.5">{displayDate(invoice.invoice_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrency(invoice.net_amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrency(invoice.paid_amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-amber-800">{formatCurrency(invoice.outstanding)}</td>
                    </tr>
                  ))}
                  {data.hp_agreements.map((agreement) => (
                    <tr key={agreement.agreement_no}>
                      <td className="px-3 py-2.5"><div className="font-semibold text-slate-800">{agreement.agreement_no}</div><div className="mt-0.5 text-slate-400">HP · {agreement.invoice_no}</div></td>
                      <td className="whitespace-nowrap px-3 py-2.5">{displayDate(agreement.invoice_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrency(agreement.contract_amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrency(agreement.paid_amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-amber-800">{formatCurrency(agreement.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
