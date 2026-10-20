'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { type HpAgreement, money, shortDate } from '@/lib/hp';

const DOCUMENT_TITLES: Record<string, string> = {
  agreement: 'Hire Purchase Agreement',
  downpayment: 'Down Payment Receipt',
  invoice: 'Hire Purchase Invoice',
};

export default function HpPrintPage() {
  const params = useParams<{ id: string; document: string }>();
  const [agreement, setAgreement] = useState<HpAgreement | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  if (!agreement) return <div className="p-12 text-center text-slate-400">Preparing document...</div>;

  const title = DOCUMENT_TITLES[params.document] || DOCUMENT_TITLES.agreement;
  const isReceipt = params.document === 'downpayment';
  const isInvoice = params.document === 'invoice';

  return (
    <div className="mx-auto max-w-4xl">
      <style>{`
        @media print {
          @page { size: ${isReceipt ? '210mm 148.5mm' : 'A4 portrait'}; margin: 0; }
          :root { --print-margin: ${isReceipt ? '8mm' : '10mm'}; }
        }
      `}</style>
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
            <h1 className="text-xl font-black uppercase tracking-wide">{title}</h1>
            <div className="mt-2 text-sm">{agreement.agreement_no}</div>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Customer</div>
            <div className="mt-2 text-lg font-bold">{agreement.customer_name}</div>
            <div>{agreement.customer_nic}</div>
            <div>{agreement.customer_phone || '—'}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-slate-500">Agreement date</dt><dd className="text-right font-semibold">{shortDate(agreement.invoice_date)}</dd>
            <dt className="text-slate-500">Invoice no.</dt><dd className="text-right font-semibold">{agreement.invoice_no}</dd>
            <dt className="text-slate-500">Scheme</dt><dd className="text-right font-semibold">{agreement.schema_type}</dd>
            <dt className="text-slate-500">Status</dt><dd className="text-right font-semibold capitalize">{agreement.status}</dd>
          </dl>
        </section>

        {!isReceipt && <section className="mt-8 overflow-hidden rounded-lg border border-slate-300">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Serial / Batch</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Net value</th></tr></thead>
            <tbody>{agreement.details.map((detail) => <tr key={detail.id} className="border-t border-slate-200"><td className="px-4 py-3"><div className="font-semibold">{detail.item_code}</div><div className="text-xs text-slate-500">{detail.item_description}</div></td><td className="px-4 py-3">{detail.serial_numbers?.join(', ') || detail.batch_no || '—'}</td><td className="px-4 py-3 text-right">{detail.qty}</td><td className="px-4 py-3 text-right">{money(detail.unit_price)}</td><td className="px-4 py-3 text-right font-semibold">{money(detail.net_value)}</td></tr>)}</tbody>
          </table>
        </section>}

        <section className="mt-8 ml-auto max-w-md">
          <dl className="space-y-3 text-sm">
            {!isReceipt && <><div className="flex justify-between"><dt>Item net amount</dt><dd className="font-semibold">{money(agreement.net_amount)}</dd></div><div className="flex justify-between"><dt>Interest</dt><dd className="font-semibold">{money(agreement.instalment_amount)}</dd></div><div className="flex justify-between"><dt>Document charge</dt><dd className="font-semibold">{money(agreement.document_charge)}</dd></div><div className="flex justify-between"><dt>Transport</dt><dd className="font-semibold">{money(agreement.transport)}</dd></div></>}
            <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-lg font-black"><dt>{isReceipt ? 'Amount received' : isInvoice ? 'Total contract' : 'Contract value'}</dt><dd>{money(isReceipt ? agreement.down_payment : agreement.contract_amount)}</dd></div>
            {!isReceipt && <><div className="flex justify-between"><dt>Down payment</dt><dd>{money(agreement.down_payment)}</dd></div><div className="flex justify-between"><dt>Installment balance</dt><dd className="font-bold">{money(agreement.due_amount)}</dd></div><div className="flex justify-between"><dt>Monthly installment</dt><dd className="font-bold">{money(agreement.instalment)}</dd></div></>}
          </dl>
        </section>

        {params.document === 'agreement' && <section className="mt-10 text-xs leading-6 text-slate-600">
          <p>The customer acknowledges receipt of the listed goods and agrees to settle the hire purchase balance according to the attached repayment schedule. Late installments may attract the configured scheme penalty after its grace period.</p>
          <div className="mt-14 grid grid-cols-3 gap-10 text-center text-slate-900"><div className="border-t border-slate-500 pt-2">Customer signature</div><div className="border-t border-slate-500 pt-2">Guarantor signature</div><div className="border-t border-slate-500 pt-2">Authorized officer</div></div>
        </section>}

        {!isReceipt && <section className="mt-10">
          <h2 className="text-sm font-black uppercase tracking-wide">Repayment schedule</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 text-xs">{agreement.instalments.map((installment) => <div key={installment.id} className="flex justify-between border-b border-slate-200 py-1.5"><span>#{installment.instalment_no} · {shortDate(installment.instalment_date)}</span><span className="font-semibold">{money(installment.base_amount)}</span></div>)}</div>
        </section>}

        <footer className="mt-12 border-t border-slate-300 pt-4 text-center text-[10px] text-slate-500">System generated on {new Date().toLocaleString('en-LK')} · {agreement.agreement_no}</footer>
      </article>
    </div>
  );
}
