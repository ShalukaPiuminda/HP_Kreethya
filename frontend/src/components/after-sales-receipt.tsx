'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { displayDate } from '@/lib/purchases';
import { formatDate } from '@/lib/warranty';

export interface ReceiptCompany {
  name: string;
  address: string | null;
  phone: string | null;
  logo: string | null;
}

export interface ReceiptBranch {
  name: string;
  phone: string | null;
  address: string | null;
}

export interface AfterSalesReceiptData {
  /** "Warranty Claim" or "Service Ticket". */
  kind: string;
  docNo: string;
  date: string;
  customerName: string | null;
  customerPhone?: string | null;
  customerNic?: string | null;
  itemCode: string;
  itemDescription?: string | null;
  /** e.g. "Serial ABC123" or "Invoice INV-… · Qty 2". */
  unitLabel: string;
  fault: string;
  accessories?: string | null;
  intakeCondition?: string | null;
  /** true = in warranty (free), false = out of warranty, null = not a warranty job. */
  inWarranty: boolean | null;
  warrantyExpiry?: string | null;
  saleNo?: string | null;
  warrantyTerms?: string | null;
  /** What was done: repaired / replaced with … / rejected: reason. Handover only. */
  outcome?: string | null;
  handover?: {
    at: string | null;
    to: string | null;
    nic?: string | null;
    note?: string | null;
    by?: string | null;
  } | null;
  backHref: string;
  backLabel: string;
}

/**
 * Dot-matrix friendly after-sales receipt (same rules as the sales invoice sheet: solid black,
 * no fills, nothing under 11px, Verdana). `doc` = intake (item received from the customer)
 * or handover (item returned to the customer). Prints automatically once loaded.
 */
const PRINT_FONT = 'Verdana, Tahoma, Arial, sans-serif';

export function AfterSalesReceipt({
  doc,
  data,
  company,
  branch,
}: {
  doc: 'intake' | 'handover';
  data: AfterSalesReceiptData;
  company: ReceiptCompany | null;
  branch: ReceiptBranch | null;
}) {
  const hasPrinted = useRef(false);

  useEffect(() => {
    if (hasPrinted.current) return;
    const timer = window.setTimeout(() => {
      window.print();
      hasPrinted.current = true;
    }, 350);
    return () => window.clearTimeout(timer);
  }, []);

  const address = company?.address || branch?.address;
  const phone = company?.phone || branch?.phone;
  const title = doc === 'intake' ? `${data.kind} Receipt` : 'Item Handover';

  return (
    <div className="mx-auto w-fit print:w-auto">
      <style>{`
        @media print {
          @page { size: 245mm 140mm; margin: 0; }
          :root { --print-margin: 8mm; }
        }
        .receipt-sheet, .receipt-sheet * { color: #000 !important; }
      `}</style>

      <div className="mb-5 flex items-center justify-between gap-4 print:hidden">
        <Link href={data.backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <ArrowLeft className="h-4 w-4" />
          {data.backLabel}
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" />
          Print / Save PDF
        </button>
      </div>

      <article
        style={{ fontFamily: PRINT_FONT, letterSpacing: '0.02em' }}
        className="receipt-sheet flex min-h-[140mm] w-[245mm] flex-col bg-white p-[8mm] text-[12px] leading-snug text-black shadow-sm ring-1 ring-slate-200 print:min-h-0 print:w-full print:p-0 print:shadow-none print:ring-0"
      >
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b-2 border-black pb-1.5">
          <div className="flex min-w-0 items-center gap-3">
            {company?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt="" className="h-[18mm] w-auto max-w-[50mm] shrink-0 object-contain grayscale contrast-150" />
            )}
            <div className="min-w-0">
              <div className="text-[18px] font-bold uppercase leading-tight">{company?.name || 'Hire Purchase ERP'}</div>
              {address && <div className="whitespace-pre-line">{address}</div>}
              {phone && <div>Tel: {phone}</div>}
            </div>
          </div>
          <h1 className="border-b-2 border-black px-3 pb-0.5 text-center text-[18px] font-bold uppercase tracking-[0.15em]">{title}</h1>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
            <dt>{data.kind} No</dt>
            <dd className="text-right font-bold">{data.docNo}</dd>
            <dt>{doc === 'intake' ? 'Received' : 'Handed over'}</dt>
            <dd className="text-right font-bold">
              {doc === 'intake' ? displayDate(data.date) : data.handover?.at ? displayDate(data.handover.at) : '—'}
            </dd>
          </dl>
        </header>

        <section className="mt-2 grid grid-cols-[1.2fr_1.5fr] gap-6">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase">Customer</div>
            <div className="text-[14px] font-bold">{data.customerName || '—'}</div>
            <div>{[data.customerNic, data.customerPhone].filter(Boolean).join('  ·  ') || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase">Item</div>
            <div className="text-[14px] font-bold">{data.itemDescription || data.itemCode}</div>
            <div>{data.itemCode}  ·  {data.unitLabel}</div>
          </div>
        </section>

        <section className="mt-2 border border-black px-2 py-1">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <span className="font-bold">Fault reported</span>
            <span className="whitespace-pre-line">{data.fault}</span>
            {data.accessories && (
              <>
                <span className="font-bold">Accessories</span>
                <span>{data.accessories}</span>
              </>
            )}
            {data.intakeCondition && (
              <>
                <span className="font-bold">Condition</span>
                <span className="whitespace-pre-line">{data.intakeCondition}</span>
              </>
            )}
            <span className="font-bold">Warranty</span>
            <span className="font-bold">
              {data.inWarranty === null
                ? 'Not a warranty job (chargeable repair)'
                : data.inWarranty
                  ? `IN WARRANTY${data.warrantyExpiry ? ` until ${formatDate(data.warrantyExpiry)}` : ''} · free of charge`
                  : `OUT OF WARRANTY${data.warrantyExpiry ? ` (expired ${formatDate(data.warrantyExpiry)})` : ''} · chargeable`}
              {data.saleNo ? `  ·  Sold on ${data.saleNo}` : ''}
            </span>
          </div>
        </section>

        {doc === 'handover' && (
          <section className="mt-2 border-2 border-black px-2 py-1">
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="font-bold">Outcome</span>
              <span className="font-bold">{data.outcome || '—'}</span>
              <span className="font-bold">Received by</span>
              <span>
                {data.handover?.to || '—'}
                {data.handover?.nic ? `  ·  NIC ${data.handover.nic}` : ''}
              </span>
              {data.handover?.note && (
                <>
                  <span className="font-bold">Note</span>
                  <span className="whitespace-pre-line">{data.handover.note}</span>
                </>
              )}
            </div>
          </section>
        )}

        {data.warrantyTerms && (
          <section className="mt-2 text-[11px]">
            <span className="font-bold uppercase">Warranty terms: </span>
            {data.warrantyTerms}
          </section>
        )}

        <section className="mt-2 text-[11px]">
          {doc === 'intake'
            ? 'Please bring this receipt when collecting the item. We are not responsible for items not collected within 60 days of notice.'
            : 'I have received the above item in good condition, together with the accessories listed.'}
        </section>

        <section className="mt-auto grid grid-cols-3 gap-10 pt-8 text-center">
          {(doc === 'intake'
            ? ['Customer signature', 'Received by', 'Authorized signature']
            : ['Customer signature (received)', 'Handed over by', 'Authorized signature']
          ).map((label) => (
            <div key={label} className="border-t border-black pt-0.5 text-[11px]">{label}</div>
          ))}
        </section>

        <footer className="mt-1 text-center text-[11px]">
          System generated on {new Date().toLocaleString('en-LK')} · {data.docNo}
          {doc === 'handover' && data.handover?.by ? ` · ${data.handover.by}` : ''}
        </footer>
      </article>
    </div>
  );
}
