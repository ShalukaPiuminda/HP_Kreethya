'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { displayDate } from '@/lib/purchases';
import {
  RESOLUTION_LABELS,
  STATUS_LABELS,
  type WarrantyClaimDetail,
} from '@/lib/warranty';

interface CompanyProfile {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
}

interface BranchProfile {
  name: string;
  phone: string | null;
  address: string | null;
}

interface ClaimPrintPayload extends WarrantyClaimDetail {
  company: CompanyProfile | null;
  branch: BranchProfile | null;
  customer: { Code: string; name: string; phone: string | null; address: string | null; NIC: string | null } | null;
}

/** Keeps background fills when the browser prints. */
const PRINT_EXACT = 'print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid grid-cols-[34mm_1fr] gap-2 py-0.5">
      <div className="font-semibold text-slate-600">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function WarrantyClaimPrintPage() {
  const params = useParams<{ id: string }>();
  const [doc, setDoc] = useState<'receipt' | 'handover'>('receipt');
  const [payload, setPayload] = useState<ClaimPrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasPrinted = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setDoc(new URLSearchParams(window.location.search).get('doc') === 'handover' ? 'handover' : 'receipt');
      try {
        const response = await api.get<ClaimPrintPayload>(`/v1/warranty-claims/${params.id}`);
        setPayload(response.data ?? null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Unable to prepare the warranty document.'));
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

  if (error) return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  if (!payload) return <div className="p-12 text-center text-slate-400">Preparing warranty document...</div>;

  const { claim, company, branch, customer } = payload;
  const ticket = claim.service_ticket;
  const isHandover = doc === 'handover';
  const title = isHandover ? 'Warranty Handover Slip' : 'Warranty Claim Receipt';
  const address = company?.address || branch?.address;
  const previousClaims = payload.history.claims.filter((candidate) => candidate.id !== claim.id).length;

  return (
    <div className="mx-auto w-fit print:w-auto">
      <style>{`
        @media print {
          @page { size: A5; margin: 0; }
        }
      `}</style>

      <div className="mb-5 flex items-center justify-between gap-4 print:hidden">
        <Link href="/dashboard/warranty-claims" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Warranty claims
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <article className="flex w-[148mm] flex-col gap-3 bg-white p-[8mm] text-[9.5px] leading-snug text-slate-950 shadow-sm ring-1 ring-slate-200 print:w-full print:shadow-none print:ring-0">
        <header className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-slate-300 pb-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {company?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt="" className="h-[18mm] w-[18mm] shrink-0 object-contain" />
            )}
            <div className="min-w-0">
              <div className="text-[14px] font-black uppercase leading-tight">{company?.name || 'Hire Purchase ERP'}</div>
              {address && <div className="text-slate-600">{address}</div>}
              <div className="text-slate-600">{[company?.phone || branch?.phone, company?.email].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={`rounded bg-slate-900 px-2 py-1 text-[11px] font-bold uppercase text-white ${PRINT_EXACT}`}>{title}</div>
            <div className="mt-1 font-mono font-bold">{claim.claim_no}</div>
            <div className="text-slate-600">{displayDate(isHandover ? claim.delivered_date : claim.claim_date)}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-[8px] font-bold uppercase tracking-wide text-slate-500">Customer</div>
            <div className="font-semibold">{customer?.name ?? claim.customer_name ?? 'Walk-in customer'}</div>
            {customer?.phone && <div>{customer.phone}</div>}
            {customer?.address && <div className="text-slate-600">{customer.address}</div>}
          </div>
          <div>
            <div className="mb-1 text-[8px] font-bold uppercase tracking-wide text-slate-500">Item</div>
            <div className="font-semibold">{claim.item_description ?? claim.item_code}</div>
            <div className="font-mono">{claim.item_serial_no ? `Serial ${claim.item_serial_no}` : `Qty ${claim.qty}`}</div>
            <div className="text-slate-600">
              Sold {claim.source_type === 'hp' ? `HP ${claim.agreement_no ?? claim.invoice_no}` : claim.invoice_no} · warranty until {displayDate(claim.warranty_expiry_date)}
            </div>
          </div>
        </section>

        <section className="rounded border border-slate-200 p-2.5">
          <Row label="Received on" value={displayDate(claim.claim_date)} />
          <Row label="Problem reported" value={claim.problem_description} />
          <Row label="Condition" value={claim.intake_condition} />
          <Row label="Accessories" value={claim.accessories_received} />
          {previousClaims > 0 && <Row label="Previous claims" value={`${previousClaims} on this unit`} />}
          {!isHandover && <Row label="Status" value={STATUS_LABELS[claim.status]} />}
        </section>

        {isHandover && (
          <section className="rounded border border-slate-200 p-2.5">
            <Row label="Decision" value={claim.resolution ? RESOLUTION_LABELS[claim.resolution] : null} />
            <Row label="Inspection notes" value={claim.outcome_note} />
            <Row label="Service ticket" value={ticket?.ticket_no} />
            {(ticket?.issues ?? []).map((issue) => (
              <div key={issue.id}>
                <Row label="Repair done" value={issue.repair_details} />
                <Row label="Diagnosis" value={issue.diagnosis} />
                <Row label="Parts replaced" value={issue.parts_used} />
                <Row label="Technician" value={[issue.technician_name, displayDate(issue.completed_date)].filter(Boolean).join(' · ')} />
              </div>
            ))}
            {(ticket?.dispatches ?? []).map((dispatch) => (
              <Row key={dispatch.id} label="Supplier report" value={[dispatch.supplier?.name, dispatch.supplier_report].filter(Boolean).join(': ')} />
            ))}
            <Row label="Replacement serial" value={claim.replacement_serial_no} />
            <Row label="Handed over" value={[displayDate(claim.delivered_date), claim.collected_by].filter(Boolean).join(' · ')} />
            <Row label="Note" value={claim.handover_note} />
            <Row label="Warranty valid until" value={displayDate(claim.warranty_expiry_date)} />
          </section>
        )}

        <div className={`rounded bg-emerald-50 px-2.5 py-1.5 text-center font-bold text-emerald-800 ${PRINT_EXACT}`}>
          Warranty service – no charge to the customer
        </div>

        {!isHandover && (
          <p className="text-[8.5px] text-slate-600">
            Please bring this receipt when collecting the item. Warranty does not cover physical, liquid or electrical damage,
            or units opened by unauthorised persons. Data on the device is the customer&apos;s responsibility.
          </p>
        )}
        {isHandover && claim.resolution === 'reject' && (
          <p className="text-[8.5px] text-slate-600">The item is returned without warranty repair for the reason stated above.</p>
        )}

        <footer className="mt-6 grid grid-cols-2 gap-8 pt-6 text-center text-[8.5px] text-slate-600">
          <div className="border-t border-slate-400 pt-1">{isHandover ? 'Received in good order (customer)' : 'Customer signature'}</div>
          <div className="border-t border-slate-400 pt-1">Authorised by ({isHandover ? claim.delivered_by : claim.UID ?? ''})</div>
        </footer>
      </article>
    </div>
  );
}
