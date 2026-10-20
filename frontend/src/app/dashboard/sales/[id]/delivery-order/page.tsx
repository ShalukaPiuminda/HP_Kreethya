'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { displayDate } from '@/lib/purchases';
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

export default function SalesDeliveryOrderPage() {
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
        setError(getApiErrorMessage(loadError, 'Unable to prepare the delivery order print view.'));
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

  if (error) {
    return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  }

  if (!payload) {
    return <div className="p-12 text-center text-slate-400">Preparing delivery order...</div>;
  }

  const { invoice, company, branch } = payload;
  const totalQty = invoice.details.reduce((sum, detail) => sum + Number(detail.QTY || 0), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href="/dashboard/sales" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          Sales invoices
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </button>
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
                {[company?.phone || branch?.phone, company?.email].filter(Boolean).join(' · ') || 'Delivery order print view'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black uppercase tracking-wide">Delivery Order</h1>
            <div className="mt-2 font-mono text-sm">Ref: {invoice.Invoice_no}</div>
            <div className="mt-1 text-sm text-slate-500">{displayDate(invoice.Invoice_date)}</div>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Deliver To</div>
            <div className="mt-2 text-lg font-bold">{invoice.Customer_Name || invoice.customer?.name || invoice.customer_code}</div>
            <div>{invoice.Customer_NIC}</div>
            <div>{invoice.Customer_Phone || invoice.customer?.phone || '—'}</div>
            <div className="mt-2 whitespace-pre-line text-slate-600">{invoice.Customer_Address || invoice.customer?.address || 'Address not captured on this invoice.'}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-slate-500">Invoice no.</dt>
            <dd className="text-right font-semibold">{invoice.Invoice_no}</dd>
            <dt className="text-slate-500">Store</dt>
            <dd className="text-right font-semibold">{invoice.store?.name || `Store ${invoice.store_id}`}</dd>
            <dt className="text-slate-500">Salesperson</dt>
            <dd className="text-right font-semibold">{invoice.salesman?.name || '—'}</dd>
            <dt className="text-slate-500">Reference</dt>
            <dd className="text-right font-semibold">{invoice.reference_no || '—'}</dd>
          </dl>
        </section>

        <section className="mt-8 overflow-hidden rounded-lg border border-slate-300">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase">
              <tr>
                <th className="w-12 px-4 py-3">#</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Serial No(s) / Batch</th>
                <th className="w-24 px-4 py-3 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {invoice.details.map((detail, index) => (
                <tr key={detail.id} className="border-t border-slate-200 align-top">
                  <td className="px-4 py-3">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{detail.Item_code}</div>
                    <div className="text-xs text-slate-500">{detail.Item_description || detail.item?.item_description || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {detail.serial_numbers?.length ? (
                      <ol className="space-y-0.5 font-mono text-xs">
                        {detail.serial_numbers.map((serial, serialIndex) => (
                          <li key={serial}>{serialIndex + 1}. {serial}</li>
                        ))}
                      </ol>
                    ) : (
                      detail.batch_no || '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{detail.QTY}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 font-black">
                <td className="px-4 py-3" colSpan={3}>
                  Total items ({invoice.details.length} line{invoice.details.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-3 text-right">{totalQty}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="mt-20 grid grid-cols-2 gap-16 text-center text-sm text-slate-900">
          <div>
            <div className="h-6 font-semibold">{invoice.salesman?.name || ''}</div>
            <div className="border-t border-slate-500 pt-2 font-semibold">Sales Person</div>
            <div className="mt-1 text-xs text-slate-500">Name / Signature / Date</div>
          </div>
          <div>
            <div className="h-6" />
            <div className="border-t border-slate-500 pt-2 font-semibold">Store Manager</div>
            <div className="mt-1 text-xs text-slate-500">Name / Signature / Date</div>
          </div>
        </section>

        <footer className="mt-12 border-t border-slate-300 pt-4 text-center text-[10px] text-slate-500">
          System generated on {new Date().toLocaleString('en-LK')} · {invoice.Invoice_no}
        </footer>
      </article>
    </div>
  );
}
