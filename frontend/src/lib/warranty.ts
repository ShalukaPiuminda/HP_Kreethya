export interface LineWarranty {
  warranty_enabled?: boolean;
  warranty_months?: number | null;
  warranty_expiry_date?: string | null;
}

/** "Warranty 12 months · valid until 2027-10-28", or null when the line has no warranty. */
export function formatLineWarranty(line: LineWarranty): string | null {
  if (!line.warranty_enabled || !line.warranty_months) return null;
  const expiry = line.warranty_expiry_date ? String(line.warranty_expiry_date).slice(0, 10) : null;
  return `Warranty ${line.warranty_months} months${expiry ? ` · valid until ${expiry}` : ''}`;
}

export type WarrantySource = 'invoice' | 'hp';
export type WarrantyResolution = 'repair' | 'replace' | 'refund' | 'reject';
export type WarrantyClaimStatus =
  | 'received'
  | 'in_repair'
  | 'ready_for_pickup'
  | 'delivered'
  | 'refunded'
  | 'rejected';

/** Statuses in which the unit is physically with us (it cannot be claimed again). */
export const CUSTODY_STATUSES: WarrantyClaimStatus[] = ['received', 'in_repair', 'ready_for_pickup'];

export const STATUS_LABELS: Record<WarrantyClaimStatus, string> = {
  received: 'Received',
  in_repair: 'In repair',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Delivered',
  refunded: 'Refunded',
  rejected: 'Rejected (paid service)',
};

export const STATUS_STYLES: Record<WarrantyClaimStatus, string> = {
  received: 'bg-sky-50 text-sky-700 ring-sky-200',
  in_repair: 'bg-amber-50 text-amber-700 ring-amber-200',
  ready_for_pickup: 'bg-violet-50 text-violet-700 ring-violet-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  refunded: 'bg-slate-100 text-slate-700 ring-slate-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

/** A sold unit returned by the warranty lookup, with its claim eligibility. */
export interface WarrantyCandidate {
  source_type: WarrantySource;
  source_detail_id: number;
  invoice_no: string;
  agreement_no: string | null;
  sale_date: string;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  item_code: string;
  item_description: string | null;
  is_serialized: boolean;
  is_batch: boolean;
  batch_no: string | null;
  store_id: number | null;
  sold_serial_no: string | null;
  item_serial_no: string | null;
  sold_qty: number;
  claimable_qty: number;
  warranty_months: number | null;
  warranty_expiry_date: string | null;
  days_left: number | null;
  claim_count: number;
  custody_claim: { id: number; claim_no: string; status: WarrantyClaimStatus } | null;
  eligible: boolean;
  reason: string | null;
}

export interface WarrantyClaimEvent {
  id: number;
  event: string;
  description: string | null;
  UID: string | null;
  created_at: string;
}

export interface ServiceIssue {
  id: number;
  issue_no: string;
  issue_date: string | null;
  technician_name: string | null;
  diagnosis: string | null;
  repair_details: string | null;
  parts_used: string | null;
  completed_date: string | null;
  status: string;
}

export interface ServiceDispatch {
  id: number;
  dispatch_no: string;
  dispatch_date: string | null;
  received_date: string | null;
  supplier_report: string | null;
  supplier?: { Code: string; name: string } | null;
}

export interface WarrantyServiceTicket {
  id: number;
  ticket_no: string;
  status: string;
  return_date?: string;
  problem_description?: string;
  repair_summary?: string | null;
  completed_date?: string | null;
  is_warranty?: boolean;
  issues?: ServiceIssue[];
  dispatches?: ServiceDispatch[];
}

export interface WarrantyClaim {
  id: number;
  claim_no: string;
  claim_date: string;
  source_type: WarrantySource;
  invoice_no: string;
  agreement_no: string | null;
  source_detail_id: number;
  customer_code: string | null;
  customer_name: string | null;
  item_code: string;
  item_description: string | null;
  sold_serial_no: string | null;
  item_serial_no: string | null;
  qty: number;
  warranty_expiry_date: string;
  problem_description: string;
  intake_condition: string | null;
  accessories_received: string | null;
  resolution: WarrantyResolution | null;
  status: WarrantyClaimStatus;
  outcome_note: string | null;
  decided_date: string | null;
  decided_by: string | null;
  service_ticket_no: string | null;
  replacement_serial_no: string | null;
  replacement_batch_no: string | null;
  replacement_store_id: number | null;
  sales_return_no: string | null;
  remarks: string | null;
  store_id: number | null;
  completed_date: string | null;
  delivered_date: string | null;
  collected_by: string | null;
  handover_note: string | null;
  delivered_by: string | null;
  UID?: string | null;
  store?: { id: number; name: string } | null;
  service_ticket?: WarrantyServiceTicket | null;
  events?: WarrantyClaimEvent[];
}

export interface WarrantyHistory {
  unit: WarrantyCandidate;
  serial_chain: string[];
  claims: WarrantyClaim[];
  service_tickets: WarrantyServiceTicket[];
}

export interface WarrantyClaimDetail {
  claim: WarrantyClaim;
  history: WarrantyHistory;
}

export const RESOLUTION_LABELS: Record<WarrantyResolution, string> = {
  repair: 'Repair',
  replace: 'Replace',
  refund: 'Refund',
  reject: 'Reject',
};

export type WarrantyReportView = 'expiring' | 'claims_by_item' | 'register';

export interface WarrantyLineRow {
  source_type: WarrantySource;
  source_detail_id: number;
  invoice_no: string;
  agreement_no: string | null;
  sale_date: string;
  customer_name: string | null;
  customer_phone: string | null;
  item_code: string;
  item_description: string | null;
  serial_numbers: string[];
  replacement_serials: string[];
  qty: number;
  warranty_months: number;
  warranty_expiry_date: string;
  days_left: number;
  claims: number;
  status: 'Active' | 'Expired' | 'With us' | 'Replaced' | 'Returned';
}

export interface WarrantyClaimsByItemRow {
  item_code: string;
  item_description: string | null;
  units_sold: number;
  total_claims: number;
  repair: number;
  replace: number;
  refund: number;
  rejected: number;
  open: number;
  repeat_units: number;
  claim_rate: number | null;
}

export type WarrantyReport =
  | { view: 'expiring'; days: number; summary: { rows: number; units: number; within_7_days: number }; rows: WarrantyLineRow[] }
  | { view: 'register'; summary: { rows: number; active: number; expired: number; claimed: number }; rows: WarrantyLineRow[] }
  | { view: 'claims_by_item'; summary: { rows: number; total_claims: number; open: number; rejected: number }; rows: WarrantyClaimsByItemRow[] };
