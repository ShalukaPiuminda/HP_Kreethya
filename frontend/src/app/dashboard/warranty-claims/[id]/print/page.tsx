'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import type { WarrantyClaim } from '@/lib/warranty';
import {
  AfterSalesReceipt,
  type AfterSalesReceiptData,
  type ReceiptBranch,
  type ReceiptCompany,
} from '@/components/after-sales-receipt';

interface ClaimPrintPayload {
  claim: WarrantyClaim;
  company: ReceiptCompany | null;
  branch: ReceiptBranch | null;
}

function claimOutcome(claim: WarrantyClaim): string {
  const rejectNote = claim.logs?.filter((log) => log.to_status === 'rejected').at(-1)?.note;

  switch (claim.resolution) {
    case 'replaced':
      return claim.replacement_serial_no
        ? `Replaced with a new unit, serial ${claim.replacement_serial_no}`
        : `Replaced with ${claim.qty} new unit(s)`;
    case 'repaired':
      return claim.service_ticket_no ? `Repaired (service ticket ${claim.service_ticket_no})` : 'Repaired';
    case 'rejected':
      return `Claim rejected, returned unrepaired${rejectNote ? `: ${rejectNote}` : ''}`;
    default:
      return claim.status.replaceAll('_', ' ');
  }
}

export default function WarrantyClaimPrintPage() {
  return (
    <Suspense fallback={null}>
      <WarrantyClaimPrint />
    </Suspense>
  );
}

function WarrantyClaimPrint() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const doc = searchParams.get('doc') === 'handover' ? 'handover' : 'intake';
  const [payload, setPayload] = useState<ClaimPrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<ClaimPrintPayload>(`/v1/warranty-claims/${params.id}/print-data`);
        setPayload(response.data ?? null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Unable to prepare the claim receipt.'));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params.id]);

  if (error) return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  if (!payload) return <div className="p-12 text-center text-slate-400">Preparing receipt...</div>;

  const { claim } = payload;
  const data: AfterSalesReceiptData = {
    kind: 'Warranty Claim',
    docNo: claim.claim_no,
    date: claim.claim_date,
    customerName: claim.customer_name,
    customerPhone: claim.customer_phone,
    itemCode: claim.item_code,
    itemDescription: claim.item?.item_description,
    unitLabel: claim.item_serial_no
      ? `Serial ${claim.item_serial_no}`
      : `Invoice ${claim.sale_no ?? '-'} · Qty ${claim.qty}`,
    fault: claim.fault_description,
    accessories: claim.accessories_received,
    inWarranty: claim.is_within_warranty,
    warrantyExpiry: claim.customer_warranty_expiry,
    saleNo: claim.sale_no,
    warrantyTerms: claim.item?.warranty_terms,
    outcome: claimOutcome(claim),
    handover: claim.handed_over_at
      ? {
          at: claim.handed_over_at,
          to: claim.handed_over_to ?? null,
          nic: claim.handed_over_nic,
          note: claim.handover_note,
          by: claim.handed_over_by,
        }
      : null,
    backHref: `/dashboard/warranty-claims?claim=${claim.id}`,
    backLabel: 'Warranty claims',
  };

  return <AfterSalesReceipt doc={doc} data={data} company={payload.company} branch={payload.branch} />;
}
