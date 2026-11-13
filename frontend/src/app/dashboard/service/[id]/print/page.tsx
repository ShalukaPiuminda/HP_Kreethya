'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import type { ServiceTicket } from '@/lib/service';
import {
  AfterSalesReceipt,
  type AfterSalesReceiptData,
  type ReceiptBranch,
  type ReceiptCompany,
} from '@/components/after-sales-receipt';

interface TicketPrintPayload {
  ticket: ServiceTicket & { item?: { item_description: string; warranty_terms?: string | null } | null };
  company: ReceiptCompany | null;
  branch: ReceiptBranch | null;
}

export default function ServiceTicketPrintPage() {
  return (
    <Suspense fallback={null}>
      <ServiceTicketPrint />
    </Suspense>
  );
}

function ServiceTicketPrint() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const doc = searchParams.get('doc') === 'handover' ? 'handover' : 'intake';
  const [payload, setPayload] = useState<TicketPrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<TicketPrintPayload>(`/v1/service-tickets/${params.id}/print-data`);
        setPayload(response.data ?? null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Unable to prepare the service receipt.'));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params.id]);

  if (error) return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  if (!payload) return <div className="p-12 text-center text-slate-400">Preparing receipt...</div>;

  const { ticket } = payload;
  const invoice = ticket.invoices?.at(-1);
  const outcome = [
    ticket.repair_summary ? `Repaired: ${ticket.repair_summary}` : 'Service completed',
    invoice
      ? ticket.is_warranty
        ? `Invoice ${invoice.invoice_no}: free under warranty`
        : `Invoice ${invoice.invoice_no}: ${Number(invoice.net_payable).toFixed(2)} (${invoice.payment_status})`
      : null,
  ].filter(Boolean).join(' · ');

  const data: AfterSalesReceiptData = {
    kind: 'Service Ticket',
    docNo: ticket.ticket_no,
    date: ticket.return_date,
    customerName: ticket.customer_name,
    customerPhone: ticket.customer_phone,
    customerNic: ticket.customer_nic,
    itemCode: ticket.item_code,
    itemDescription: ticket.item?.item_description,
    unitLabel: ticket.item_serial_no ? `Serial ${ticket.item_serial_no}` : ticket.sale_no ? `Invoice ${ticket.sale_no}` : 'No serial',
    fault: ticket.problem_description,
    intakeCondition: ticket.intake_condition,
    inWarranty: ticket.is_warranty ? true : null,
    warrantyExpiry: ticket.warranty_expiry,
    saleNo: ticket.sale_no,
    warrantyTerms: ticket.is_warranty ? ticket.item?.warranty_terms : null,
    outcome,
    handover: ticket.handed_over_at
      ? {
          at: ticket.handed_over_at,
          to: ticket.handed_over_to ?? null,
          nic: ticket.handed_over_nic,
          note: ticket.handover_note,
          by: ticket.handed_over_by,
        }
      : null,
    backHref: `/dashboard/service?ticket=${encodeURIComponent(ticket.ticket_no)}`,
    backLabel: 'Service tickets',
  };

  return <AfterSalesReceipt doc={doc} data={data} company={payload.company} branch={payload.branch} />;
}
