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
  logo: string | null;
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

/** Keeps background fills (title bar, table head) when the browser prints. */
const PRINT_EXACT = 'print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]';

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
  const address = company?.address || branch?.address;

  return (
    <div className="mx-auto w-fit print:w-auto">
      <style>{`
        @media print {
          @page { size: 140mm 245mm; margin: 0; }
          :root { --print-margin: 8mm; }
        }
      `}</style>

      <div className="mb-5 flex items-center justify-between gap-4 print:hidden">
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

      {/* Invoice sheet (140 x 245 mm). On screen it previews the page; in print the app shell's 8mm padding is the margin. */}
      <article className="flex min-h-[245mm] w-[140mm] flex-col bg-white p-[8mm] text-[9px] leading-snug text-slate-950 shadow-sm ring-1 ring-slate-200 print:min-h-[228mm] print:w-full print:p-0 print:shadow-none print:ring-0">
        <header className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-slate-300 pb-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {company?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt="" className="h-[16mm] w-[16mm] shrink-0 object-contain" />
            )}
            <div className="min-w-0">
              <div className="text-[15px] font-black uppercase leading-tight tracking-tight">
                {company?.name || 'Hire Purchase ERP'}
              </div>
              {address && <div className="mt-0.5 whitespace-pre-line text-[10px] text-slate-700">{address}</div>}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 pt-1 text-[9px]">
            <dt className="text-slate-500">Invoice No</dt>
            <dd className="text-right font-mono font-bold">{invoice.Invoice_no}</dd>
            <dt className="text-slate-500">Date</dt>
            <dd className="text-right font-semibold">{displayDate(invoice.Invoice_date)}</dd>
          </dl>
        </header>

        <h1 className="mx-auto mt-0.5 w-fit border-b-2 border-slate-900 px-3 pb-0.5 text-[16px] font-black uppercase tracking-[0.3em]">Invoice</h1>

        <section className="mt-1.5 grid grid-cols-2 items-start gap-4">
          <div className="min-w-0">
            <div className="text-[7px] font-bold uppercase tracking-wide text-slate-500">Customer</div>
            <div className="mt-0.5 text-[11px] font-bold">{invoice.Customer_Name || invoice.customer?.name || invoice.customer_code}</div>
            <div>{invoice.Customer_NIC}</div>
            <div>{invoice.Customer_Phone || invoice.customer?.phone || '—'}</div>
            <div className="mt-0.5 whitespace-pre-line text-slate-600">{invoice.Customer_Address || invoice.customer?.address || 'Address not captured on this invoice.'}</div>
          </div>
          <dl className="ml-auto grid h-fit w-full max-w-[50mm] grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
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

        <section className="mt-2 overflow-hidden rounded border border-slate-300">
          <table className="w-full table-fixed">
            <colgroup>
              <col />
              <col className="w-[20%]" />
              <col className="w-[8%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className={`bg-slate-100 text-left text-[7px] uppercase ${PRINT_EXACT}`}>
              <tr>
                <th className="px-1.5 py-0.5">Item</th>
                <th className="px-1.5 py-0.5">Batch / Serial</th>
                <th className="px-1.5 py-0.5 text-right">Qty</th>
                <th className="px-1.5 py-0.5 text-right">Unit price</th>
                <th className="px-1.5 py-0.5 text-right">Discount</th>
                <th className="px-1.5 py-0.5 text-right">Net value</th>
              </tr>
            </thead>
            <tbody>
              {invoice.details.map((detail) => (
                <tr key={detail.id} className="break-inside-avoid border-t border-slate-200 align-top">
                  <td className="px-1.5 py-0.5">
                    <div className="font-semibold">{detail.Item_code}</div>
                    <div className="text-[8px] text-slate-500">{detail.Item_description || detail.item?.item_description || '—'}</div>
                  </td>
                  <td className="break-words px-1.5 py-0.5 text-[8px]">
                    {detail.serial_numbers?.join(', ') || detail.batch_no || '—'}
                  </td>
                  <td className="px-1.5 py-0.5 text-right">{detail.QTY}</td>
                  <td className="px-1.5 py-0.5 text-right">{formatCurrency(numeric(detail.Unit_price))}</td>
                  <td className="px-1.5 py-0.5 text-right">{formatCurrency(numeric(detail.Discount))}</td>
                  <td className="px-1.5 py-0.5 text-right font-semibold">{formatCurrency(numeric(detail.Net_value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-2 grid break-inside-avoid grid-cols-2 gap-4">
          <div className="rounded border border-slate-200 px-2 py-1.5">
            <h2 className="text-[8px] font-black uppercase tracking-wide">Payment Breakdown</h2>
            <div className="mt-1 grid gap-0.5 text-slate-700">
              <div className="flex justify-between"><span>Cash</span><span className="font-semibold">{formatCurrency(numeric(invoice.Cash_Pay))}</span></div>
              <div className="flex justify-between"><span>Card</span><span className="font-semibold">{formatCurrency(numeric(invoice.card_payment))}</span></div>
              <div className="flex justify-between"><span>Cheque</span><span className="font-semibold">{formatCurrency(numeric(invoice.Cheque))}</span></div>
              <div className="flex justify-between"><span>Bank transfer</span><span className="font-semibold">{formatCurrency(numeric(invoice.bank_transfer))}</span></div>
              <div className="flex justify-between"><span>Advance applied</span><span className="font-semibold">{formatCurrency(numeric(invoice.advance_applied))}</span></div>
              {invoice.bank_account && (
                <div className="mt-1 rounded bg-slate-50 px-1.5 py-0.5 text-[8px] text-slate-500">
                  Internal bank account: {invoice.bank_account.bank_name} · {invoice.bank_account.account_no}
                </div>
              )}
            </div>
          </div>

          <dl className="space-y-0.5">
            <div className="flex justify-between"><dt>Gross amount</dt><dd className="font-semibold">{formatCurrency(summary.gross)}</dd></div>
            <div className="flex justify-between"><dt>Total discount</dt><dd className="font-semibold">{formatCurrency(summary.discount)}</dd></div>
            <div className="flex justify-between border-t-2 border-slate-900 pt-0.5 text-[11px] font-black"><dt>Net amount</dt><dd>{formatCurrency(summary.net)}</dd></div>
            <div className="flex justify-between"><dt>Paid amount</dt><dd className="font-semibold">{formatCurrency(summary.paid)}</dd></div>
            <div className="flex justify-between"><dt>Credit balance</dt><dd className="font-semibold">{formatCurrency(summary.credit)}</dd></div>
          </dl>
        </section>

        <section className="mt-auto grid break-inside-avoid grid-cols-3 gap-4 pt-10 text-center">
          {['Received in good condition (Customer)', 'Cashier', 'Authorized signature'].map((label) => (
            <div key={label} className="border-t border-dotted border-slate-500 pt-1 text-[8px] text-slate-700">
              {label}
            </div>
          ))}
        </section>

        <footer className="mt-2 text-center text-[7px] text-slate-400">
          System generated on {new Date().toLocaleString('en-LK')} · {invoice.Invoice_no}
        </footer>
      </article>
    </div>
  );
}
