'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { type HpAgreement, shortDate } from '@/lib/hp';

export default function HpDeliveryOrderPage() {
  const params = useParams<{ id: string }>();
  const [agreement, setAgreement] = useState<HpAgreement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasPrinted = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<HpAgreement>(`/v1/hp/${params.id}`);
        setAgreement(response.data || null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params.id]);

  useEffect(() => {
    if (!agreement || hasPrinted.current) return;
    const timer = window.setTimeout(() => {
      window.print();
      hasPrinted.current = true;
    }, 350);
    return () => window.clearTimeout(timer);
  }, [agreement]);

  if (error) return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  if (!agreement) return <div className="p-12 text-center text-slate-400">Preparing delivery order...</div>;

  const totalQty = agreement.details.reduce((sum, detail) => sum + Number(detail.qty || 0), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Link href="/dashboard/hire-purchase" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> Agreements</Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Printer className="h-4 w-4" /> Print / Save PDF</button>
      </div>

      <article className="min-h-[1050px] bg-white p-10 text-slate-950 shadow-sm ring-1 ring-slate-200 print:min-h-0 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-6">
          <div>
            <div className="text-2xl font-black tracking-tight">HIRE PURCHASE ERP</div>
            <div className="mt-1 text-sm text-slate-500">Head Office · Colombo · Sri Lanka</div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black uppercase tracking-wide">Delivery Order</h1>
            <div className="mt-2 text-sm">Ref: {agreement.agreement_no}</div>
            <div className="mt-1 text-sm text-slate-500">{shortDate(agreement.invoice_date)}</div>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Deliver To</div>
            <div className="mt-2 text-lg font-bold">{agreement.customer_name}</div>
            <div>{agreement.customer_nic}</div>
            <div>{agreement.customer_phone || '—'}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-slate-500">Agreement no.</dt><dd className="text-right font-semibold">{agreement.agreement_no}</dd>
            <dt className="text-slate-500">Invoice no.</dt><dd className="text-right font-semibold">{agreement.invoice_no}</dd>
            <dt className="text-slate-500">Agreement date</dt><dd className="text-right font-semibold">{shortDate(agreement.invoice_date)}</dd>
            <dt className="text-slate-500">Store</dt><dd className="text-right font-semibold">{agreement.store?.name || `Store ${agreement.store_id}`}</dd>
          </dl>
        </section>

        <section className="mt-8 overflow-hidden rounded-lg border border-slate-300">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase"><tr><th className="w-12 px-4 py-3">#</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Serial No(s) / Batch</th><th className="w-24 px-4 py-3 text-right">Qty</th></tr></thead>
            <tbody>
              {agreement.details.map((detail, index) => (
                <tr key={detail.id} className="border-t border-slate-200 align-top">
                  <td className="px-4 py-3">{index + 1}</td>
                  <td className="px-4 py-3"><div className="font-semibold">{detail.item_code}</div><div className="text-xs text-slate-500">{detail.item_description}</div></td>
                  <td className="px-4 py-3">
                    {detail.serial_numbers?.length ? (
                      <ol className="space-y-0.5 font-mono text-xs">
                        {detail.serial_numbers.map((serial, serialIndex) => <li key={serial}>{serialIndex + 1}. {serial}</li>)}
                      </ol>
                    ) : (detail.batch_no || '—')}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{detail.qty}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900 font-black">
                <td className="px-4 py-3" colSpan={3}>Total items ({agreement.details.length} line{agreement.details.length === 1 ? '' : 's'})</td>
                <td className="px-4 py-3 text-right">{totalQty}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="mt-20 grid grid-cols-2 gap-16 text-center text-sm text-slate-900">
          <div><div className="border-t border-slate-500 pt-2 font-semibold">Sales Person</div><div className="mt-1 text-xs text-slate-500">Name / Signature / Date</div></div>
          <div><div className="border-t border-slate-500 pt-2 font-semibold">Store Manager</div><div className="mt-1 text-xs text-slate-500">Name / Signature / Date</div></div>
        </section>

        <footer className="mt-12 border-t border-slate-300 pt-4 text-center text-[10px] text-slate-500">System generated on {new Date().toLocaleString('en-LK')} · {agreement.agreement_no}</footer>
      </article>
    </div>
  );
}
