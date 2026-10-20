'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, Truck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/inventory';
import { displayDate, numeric } from '@/lib/purchases';
import type { SalesInvoice } from '@/lib/sales';

interface CompanyProfile {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface BranchProfile {
  id: number;
  bccode: string;
  name: string;
  phone: string | null;
  address: string | null;
}

interface InvoicePrintPayload {
  invoice: SalesInvoice;
  company: CompanyProfile | null;
  branch: BranchProfile | null;
}

export default function SalesInvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const [payload, setPayload] = useState<InvoicePrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasPrinted = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<InvoicePrintPayload>(
          `/v1/sales-invoices/${params.id}/print-data`
        );
        setPayload(response.data ?? null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Unable to prepare the invoice print view.'));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [params.id]);

  useEffect(() => {
    if (!payload || hasPrinted.current) return;

    const timer = window.setTimeout(() => {
      window.print();
      hasPrinted.current = true;
    }, 350);

    return () => window.clearTimeout(timer);
  }, [payload]);

  const summary = useMemo(() => {
    const invoice = payload?.invoice;
    if (!invoice) {
      return {
        gross: 0,
        discount: 0,
        net: 0,
        paid: 0,
        credit: 0,
      };
    }

    return {
      gross: numeric(invoice.Gross_Amount),
      discount: numeric(invoice.Discount),
      net: numeric(invoice.Net_Amount),
      paid: numeric(invoice.paid_amount),
      credit: numeric(invoice.Credite),
    };
  }, [payload]);

  if (error) {
    return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  }

  if (!payload) {
    return <div className="p-12 text-center text-slate-400">Preparing printable invoice...</div>;
  }

  const { invoice, company, branch } = payload;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href="/dashboard/sales" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Sales invoices
        </Link>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/sales/${params.id}/delivery-order`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
            <Truck className="h-4 w-4" />
            Delivery Order
          </Link>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <article className="min-h-[1100px] bg-white p-10 text-slate-950 shadow-sm ring-1 ring-slate-200 print:min-h-0 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-6">
          <div>
            <div className="text-2xl font-black tracking-tight">
              {company?.name || 'Hire Purchase ERP'}
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-500">
              {branch?.name && <div>{branch.name} {branch.bccode ? `· ${branch.bccode}` : ''}</div>}
              {company?.address && <div>{company.address}</div>}
              {!company?.address && branch?.address && <div>{branch.address}</div>}
              <div>
                {[company?.phone || branch?.phone, company?.email].filter(Boolean).join(' · ') || 'Invoice print view'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black uppercase tracking-wide">Sales Invoice</h1>
            <div className="mt-2 font-mono text-sm">{invoice.Invoice_no}</div>
            <div className="mt-1 text-sm text-slate-500">{displayDate(invoice.Invoice_date)}</div>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Bill To</div>
            <div className="mt-2 text-lg font-bold">{invoice.Customer_Name || invoice.customer?.name || invoice.customer_code}</div>
            <div>{invoice.Customer_NIC}</div>
            <div>{invoice.Customer_Phone || invoice.customer?.phone || '—'}</div>
            <div className="mt-2 whitespace-pre-line text-slate-600">{invoice.Customer_Address || invoice.customer?.address || 'Address not captured on this invoice.'}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-slate-500">Reference</dt>
            <dd className="text-right font-semibold">{invoice.reference_no || '—'}</dd>
            <dt className="text-slate-500">Store</dt>
            <dd className="text-right font-semibold">{invoice.store?.name || `Store ${invoice.store_id}`}</dd>
            <dt className="text-slate-500">Salesperson</dt>
            <dd className="text-right font-semibold">{invoice.salesman?.name || '—'}</dd>
            <dt className="text-slate-500">Payment status</dt>
            <dd className="text-right font-semibold capitalize">{invoice.payment_status}</dd>
          </dl>
        </section>

        <section className="mt-8 overflow-hidden rounded-lg border border-slate-300">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Batch / Serial</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Discount</th>
                <th className="px-4 py-3 text-right">Net value</th>
              </tr>
            </thead>
            <tbody>
              {invoice.details.map((detail) => (
                <tr key={detail.id} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{detail.Item_code}</div>
                    <div className="text-xs text-slate-500">{detail.Item_description || detail.item?.item_description || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {detail.serial_numbers?.join(', ') || detail.batch_no || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">{detail.QTY}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(numeric(detail.Unit_price))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(numeric(detail.Discount))}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(numeric(detail.Net_value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8 grid gap-8 md:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-black uppercase tracking-wide">Payment Breakdown</h2>
            <div className="mt-4 grid gap-2 text-sm text-slate-700">
              <div className="flex justify-between"><span>Cash</span><span className="font-semibold">{formatCurrency(numeric(invoice.Cash_Pay))}</span></div>
              <div className="flex justify-between"><span>Card</span><span className="font-semibold">{formatCurrency(numeric(invoice.card_payment))}</span></div>
              <div className="flex justify-between"><span>Cheque</span><span className="font-semibold">{formatCurrency(numeric(invoice.Cheque))}</span></div>
              <div className="flex justify-between"><span>Bank transfer</span><span className="font-semibold">{formatCurrency(numeric(invoice.bank_transfer))}</span></div>
              <div className="flex justify-between"><span>Advance applied</span><span className="font-semibold">{formatCurrency(numeric(invoice.advance_applied))}</span></div>
              {invoice.bank_account && (
                <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Internal bank account: {invoice.bank_account.bank_name} · {invoice.bank_account.account_no}
                </div>
              )}
            </div>
          </div>

          <section className="ml-auto w-full max-w-md">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt>Gross amount</dt><dd className="font-semibold">{formatCurrency(summary.gross)}</dd></div>
              <div className="flex justify-between"><dt>Total discount</dt><dd className="font-semibold">{formatCurrency(summary.discount)}</dd></div>
              <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-lg font-black"><dt>Net amount</dt><dd>{formatCurrency(summary.net)}</dd></div>
              <div className="flex justify-between"><dt>Paid amount</dt><dd className="font-semibold">{formatCurrency(summary.paid)}</dd></div>
              <div className="flex justify-between"><dt>Credit balance</dt><dd className="font-semibold">{formatCurrency(summary.credit)}</dd></div>
            </dl>
          </section>
        </section>

        <footer className="mt-12 border-t border-slate-300 pt-4 text-center text-[10px] text-slate-500">
          System generated on {new Date().toLocaleString('en-LK')} · {invoice.Invoice_no}
        </footer>
      </article>
    </div>
  );
}
