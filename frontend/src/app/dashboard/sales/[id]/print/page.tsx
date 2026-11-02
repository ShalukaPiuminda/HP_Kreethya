'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer, Truck } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { displayDate, numeric } from '@/lib/purchases';
import type { SalesInvoice } from '@/lib/sales';
import { lineWarranties, warrantySummary } from '@/lib/warranty';

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

/**
 * The invoice is printed on a dot-matrix printer (continuous carbon forms), which
 * rasterises browser output. Grey text and fills get dithered into faint dots and
 * thin/small fonts break up, so the sheet uses only solid black, no background fills,
 * nothing smaller than 11px, and Verdana — built for low-resolution output, with wide
 * letterforms and clearly distinct 0/O, 1/l/I and 3/8.
 */
const PRINT_FONT = 'Verdana, Tahoma, Arial, sans-serif';

/** Amount without the currency symbol; the sheet states "Amounts in LKR" once. */
function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
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
  const address = company?.address || branch?.address;
  // Terms of each warranty item on the invoice, printed once per item.
  const warrantyTerms = Array.from(
    new Map(
      invoice.details
        .filter((detail) => detail.item?.has_warranty && detail.item.warranty_terms)
        .map((detail) => [detail.Item_code, detail.item?.warranty_terms ?? ''] as [string, string])
    ).entries()
  );


  return (
    <div className="mx-auto w-fit print:w-auto">
      <style>{`
        @media print {
          @page { size: 245mm 140mm; margin: 0; }
          :root { --print-margin: 8mm; }
        }
        .invoice-sheet, .invoice-sheet * { color: #000 !important; }
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

      {/* Invoice sheet: 245 mm wide x 140 mm tall (9.5" x 5.5" continuous form, landscape). On screen it previews the page; in print the app shell's 8mm padding is the margin. */}
      <article
        style={{ fontFamily: PRINT_FONT, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}
        className="invoice-sheet flex min-h-[140mm] w-[245mm] flex-col bg-white p-[8mm] text-[12px] font-normal leading-snug text-black shadow-sm ring-1 ring-slate-200 print:min-h-0 print:w-full print:p-0 print:shadow-none print:ring-0"
      >
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b-2 border-black pb-1.5">
          <div className="flex min-w-0 items-center gap-3">
            {company?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt="" className="h-[20mm] w-auto max-w-[55mm] shrink-0 object-contain grayscale contrast-150" />
            )}
            <div className="min-w-0">
              <div className="text-[18px] font-bold uppercase leading-tight">
                {company?.name || 'Stylo-Piyestra'}
              </div>
              {address && <div className="whitespace-pre-line">{address}</div>}
            </div>
          </div>
          <h1 className="border-b-2 border-black px-3 pb-0.5 text-[20px] font-bold uppercase tracking-[0.25em]">Invoice</h1>
          <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
            <dt>Invoice No</dt>
            <dd className="text-right font-bold">{invoice.Invoice_no}</dd>
            <dt>Date</dt>
            <dd className="text-right font-bold">{displayDate(invoice.Invoice_date)}</dd>
          </dl>
        </header>

        <section className="mt-1.5 grid grid-cols-[1.6fr_1fr_1fr] items-start gap-6">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase">Customer</div>
            <div className="text-[14px] font-bold">{invoice.Customer_Name || invoice.customer?.name || invoice.customer_code}</div>
            <div>
              {[invoice.Customer_NIC, invoice.Customer_Phone || invoice.customer?.phone].filter(Boolean).join('  ·  ') || '—'}
            </div>
            <div className="whitespace-pre-line">{invoice.Customer_Address || invoice.customer?.address || 'Address not captured on this invoice.'}</div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <dt>Reference</dt>
            <dd className="text-right font-bold">{invoice.reference_no || '—'}</dd>
            <dt>Store</dt>
            <dd className="text-right font-bold">{invoice.store?.name || `Store ${invoice.store_id}`}</dd>
          </dl>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <dt>Salesperson</dt>
            <dd className="text-right font-bold">{invoice.salesman?.name || '—'}</dd>
            <dt>Payment status</dt>
            <dd className="text-right font-bold capitalize">{invoice.payment_status}</dd>
          </dl>
        </section>

        <section className="mt-1.5 border-y-2 border-black">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[13%]" />
              <col />
              <col className="w-[15%]" />
              <col className="w-[6%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="border-b border-black text-left text-[11px] uppercase">
              <tr>
                <th className="px-1 py-1 font-bold">Item code</th>
                <th className="px-1 py-1 font-bold">Description</th>
                <th className="px-1 py-1 font-bold">Batch / Serial</th>
                <th className="px-1 py-1 text-right font-bold">Qty</th>
                <th className="px-1 py-1 text-right font-bold">Unit price</th>
                <th className="px-1 py-1 text-right font-bold">Discount</th>
                <th className="px-1 py-1 text-right font-bold">Net (LKR)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.details.map((detail, index) => (
                <tr key={detail.id} className={`break-inside-avoid align-top ${index > 0 ? 'border-t border-dashed border-black' : ''}`}>
                  <td className="break-words px-1 py-1 font-bold">{detail.Item_code}</td>
                  <td className="break-words px-1 py-1">
                    {detail.Item_description || detail.item?.item_description || '—'}
                    {(() => {
                      const text = warrantySummary(
                        lineWarranties(invoice.warranties, detail.Item_code, detail.serial_numbers, detail.batch_no)
                      );
                      return text ? <div className="text-[11px] font-bold">{text}</div> : null;
                    })()}
                  </td>
                  <td className="break-words px-1 py-1">{detail.serial_numbers?.join(', ') || detail.batch_no || '—'}</td>
                  <td className="px-1 py-1 text-right">{detail.QTY}</td>
                  <td className="px-1 py-1 text-right">{formatAmount(numeric(detail.Unit_price))}</td>
                  <td className="px-1 py-1 text-right">{formatAmount(numeric(detail.Discount))}</td>
                  <td className="px-1 py-1 text-right font-bold">{formatAmount(numeric(detail.Net_value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {warrantyTerms.length > 0 && (
          <section className="mt-2 break-inside-avoid border border-black px-2 py-1 text-[11px]">
            <h2 className="font-bold uppercase">Warranty terms</h2>
            {warrantyTerms.map(([itemCode, terms]) => (
              <p key={itemCode} className="mt-0.5">
                <span className="font-bold">{itemCode}:</span> {terms}
              </p>
            ))}
          </section>
        )}

        <section className="mt-2 grid break-inside-avoid grid-cols-[1.25fr_1fr] gap-8">
          <div className="border border-black px-2 py-1">
            <h2 className="font-bold uppercase">Payment Breakdown (LKR)</h2>
            <div className="mt-0.5 grid grid-cols-2 gap-x-6 gap-y-0.5">
              <div className="flex justify-between gap-2"><span>Cash</span><span className="font-bold">{formatAmount(numeric(invoice.Cash_Pay))}</span></div>
              <div className="flex justify-between gap-2"><span>Bank transfer</span><span className="font-bold">{formatAmount(numeric(invoice.bank_transfer))}</span></div>
              <div className="flex justify-between gap-2"><span>Card</span><span className="font-bold">{formatAmount(numeric(invoice.card_payment))}</span></div>
              <div className="flex justify-between gap-2"><span>Advance applied</span><span className="font-bold">{formatAmount(numeric(invoice.advance_applied))}</span></div>
              <div className="flex justify-between gap-2"><span>Cheque</span><span className="font-bold">{formatAmount(numeric(invoice.Cheque))}</span></div>
            </div>
            {invoice.bank_account && (
              <div className="mt-1 border-t border-dashed border-black pt-0.5 text-[11px]">
                Internal bank account: {invoice.bank_account.bank_name} · {invoice.bank_account.account_no}
              </div>
            )}
          </div>

          <dl className="space-y-0.5">
            <div className="flex justify-between gap-2"><dt>Gross amount</dt><dd className="font-bold">{formatAmount(summary.gross)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Total discount</dt><dd className="font-bold">{formatAmount(summary.discount)}</dd></div>
            <div className="flex justify-between gap-2 border-y-2 border-black py-0.5 text-[15px] font-bold"><dt>Net amount (LKR)</dt><dd>{formatAmount(summary.net)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Paid amount</dt><dd className="font-bold">{formatAmount(summary.paid)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Credit balance</dt><dd className="font-bold">{formatAmount(summary.credit)}</dd></div>
          </dl>
        </section>

        <section className="mt-auto grid break-inside-avoid grid-cols-3 gap-10 pt-8 text-center">
          {['Received in good condition (Customer)', 'Cashier', 'Authorized signature'].map((label) => (
            <div key={label} className="border-t border-black pt-0.5 text-[11px]">
              {label}
            </div>
          ))}
        </section>

        <footer className="mt-1 text-center text-[11px]">
          System generated on {new Date().toLocaleString('en-LK')} · {invoice.Invoice_no}
        </footer>
      </article>
    </div>
  );
}
