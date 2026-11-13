export type WarrantyUnit = 'days' | 'months' | 'years';

export type WarrantyClaimStatus =
  | 'received'
  | 'sent_to_supplier'
  | 'returned_from_supplier'
  | 'in_service'
  | 'repaired'
  | 'replaced'
  | 'rejected'
  | 'closed'
  | 'cancelled';

export const WARRANTY_CLAIM_STATUSES: { value: WarrantyClaimStatus; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'sent_to_supplier', label: 'Sent to supplier' },
  { value: 'returned_from_supplier', label: 'Returned from supplier' },
  { value: 'in_service', label: 'In service' },
  { value: 'repaired', label: 'Repaired' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Handed over' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const OPEN_CLAIM_STATUSES: WarrantyClaimStatus[] = ['received', 'sent_to_supplier', 'returned_from_supplier', 'in_service'];

/**
 * Mirrors WarrantyClaimService::TRANSITIONS on the backend. 'in_service' is reached through
 * "Send to Service", not a plain status change.
 */
export const WARRANTY_CLAIM_TRANSITIONS: Record<WarrantyClaimStatus, WarrantyClaimStatus[]> = {
  received: ['sent_to_supplier', 'in_service', 'repaired', 'replaced', 'rejected', 'cancelled'],
  sent_to_supplier: ['returned_from_supplier'],
  returned_from_supplier: ['in_service', 'repaired', 'replaced', 'rejected'],
  in_service: ['repaired', 'rejected', 'cancelled'],
  repaired: ['closed'],
  replaced: ['closed'],
  rejected: ['closed'],
  closed: [],
  cancelled: [],
};

export interface UnitServiceTicket {
  id: number;
  ticket_no: string;
  return_date: string;
  status: string;
  is_warranty: boolean;
  problem_description: string;
}

export interface SerialWarranty {
  id: number;
  item_code: string;
  item_serial_no: string | null;
  grn_no: string | null;
  grn_date: string | null;
  supplier_code: string | null;
  supplier_warranty_period: number | null;
  supplier_warranty_unit: WarrantyUnit | null;
  supplier_warranty_expiry: string | null;
  sale_type: 'SALE' | 'HP' | null;
  sale_no: string | null;
  sale_date: string | null;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  warranty_period: number | null;
  warranty_unit: WarrantyUnit | null;
  customer_warranty_expiry: string | null;
  status: 'in_stock' | 'active' | 'returned' | 'void' | 'cancelled';
  status_before_cancel?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  batch_no: string | null;
  qty: number;
  returned_qty: number;
}

export interface SerialMovementRow {
  trans_no: string;
  trans_code: string;
  date: string | null;
  qty_in: number;
  qty_out: number;
  store_id: number;
  store_name: string | null;
}

export interface SerialClaimSummary {
  id: number;
  claim_no: string;
  claim_date: string;
  qty: number;
  status: WarrantyClaimStatus;
  resolution: string | null;
  fault_description: string;
}

/**
 * One warranty unit. Serialized items: one serial. Non-serialized items: one invoice
 * line (item_serial_no is null; quantities are on `warranty`).
 */
export interface SerialLookupUnit {
  item_code: string;
  item_serial_no: string | null;
  is_serialized: boolean;
  claimable_qty: number;
  item: {
    item_code: string;
    item_description: string;
    is_serialized: boolean;
    is_batch: boolean;
    has_warranty: boolean;
    warranty_period: number | null;
    warranty_unit: WarrantyUnit | null;
    supplier_warranty_period: number | null;
    supplier_warranty_unit: WarrantyUnit | null;
    warranty_terms: string | null;
  } | null;
  warranty: SerialWarranty | null;
  supplier_name: string | null;
  in_stock: boolean;
  current_store_id: number | null;
  current_store_name: string | null;
  customer_warranty_valid: boolean;
  supplier_warranty_valid: boolean;
  customer_days_left: number | null;
  supplier_days_left: number | null;
  movements: SerialMovementRow[];
  claims: SerialClaimSummary[];
  service_tickets?: UnitServiceTicket[];
}

export interface WarrantyClaimLog {
  id: number;
  from_status: WarrantyClaimStatus | null;
  to_status: WarrantyClaimStatus;
  note: string | null;
  UID: string;
  created_at: string;
}

export interface WarrantyClaim {
  id: number;
  claim_no: string;
  claim_date: string;
  item_code: string;
  item_description?: string | null;
  item_serial_no: string | null;
  qty: number;
  batch_no: string | null;
  serial_warranty_id: number | null;
  sale_no: string | null;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  fault_description: string;
  accessories_received: string | null;
  is_within_warranty: boolean;
  customer_warranty_expiry: string | null;
  supplier_code: string | null;
  supplier_name?: string | null;
  is_supplier_claimable: boolean;
  status: WarrantyClaimStatus;
  supplier_ref_no: string | null;
  sent_date: string | null;
  returned_date: string | null;
  resolution: string | null;
  replacement_serial_no: string | null;
  store_id: number | null;
  remarks: string | null;
  service_ticket_no?: string | null;
  handed_over_at?: string | null;
  handed_over_to?: string | null;
  handed_over_nic?: string | null;
  handover_note?: string | null;
  handed_over_by?: string | null;
  cancel_reason?: string | null;
  previous_claims_count?: number;
  previous_claims?: SerialClaimSummary[];
  service_ticket?: { id: number; ticket_no: string; status: string; is_warranty: boolean } | null;
  serial_warranty?: SerialWarranty | null;
  UID: string;
  created_at: string;
  item?: { item_code: string; item_description: string; warranty_terms: string | null; is_batch: boolean } | null;
  supplier?: { Code: string; name: string; phone: string | null } | null;
  logs?: WarrantyClaimLog[];
}

export interface WarrantyClaimSummary {
  open: number;
  at_supplier: number;
  in_service?: number;
  cancelled?: number;
  awaiting_close: number;
  closed: number;
  overdue_at_supplier: number;
}

/**
 * Expiry date (yyyy-mm-dd) of a warranty starting on `from`. Mirrors WarrantyService::addPeriod:
 * a 12-month warranty sold on 1 Jan ends on 31 Dec; month ends don't overflow.
 */
export function warrantyExpiry(from: string, period: number | null | undefined, unit: WarrantyUnit | null | undefined): string | null {
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  const [year, month, day] = from.split('-').map(Number);

  let date: Date;
  if (unit === 'days') {
    date = new Date(Date.UTC(year, month - 1, day + period));
  } else {
    const months = unit === 'years' ? period * 12 : period;
    const target = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    date = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** One-line warranty text for a sold line, e.g. "12 months · until 31 Oct 2027". */
export function warrantySummary(
  rows: Pick<SerialWarranty, 'warranty_period' | 'warranty_unit' | 'customer_warranty_expiry' | 'status'>[]
): string | null {
  if (rows.length === 0) return null;
  const live = rows.filter((row) => row.status !== 'cancelled' && row.status !== 'void' && row.status !== 'returned');
  if (live.length === 0) {
    return rows.some((row) => row.status === 'cancelled') ? 'Warranty cancelled' : null;
  }
  const first = live[0];
  const cancelled = rows.length - live.length;
  return `Warranty ${formatPeriod(first.warranty_period, first.warranty_unit)} · until ${formatDate(first.customer_warranty_expiry)}`
    + (cancelled > 0 ? ` (${cancelled} cancelled)` : '');
}

/** Warranty rows of an invoice that belong to one sale line. */
export function lineWarranties<T extends Pick<SerialWarranty, 'item_code' | 'item_serial_no' | 'batch_no'>>(
  warranties: T[] | undefined,
  itemCode: string,
  serialNumbers: string[] | null | undefined,
  batchNo: string | null | undefined
): T[] {
  return (warranties ?? []).filter((row) => {
    if (row.item_code !== itemCode) return false;
    if (row.item_serial_no) return (serialNumbers ?? []).includes(row.item_serial_no);
    return (row.batch_no ?? null) === (batchNo ?? null);
  });
}

/** Stable React key / label for a warranty unit (serial, or invoice line). */
export function unitKey(unit: SerialLookupUnit): string {
  return `${unit.item_code}-${unit.item_serial_no ?? `line-${unit.warranty?.id ?? 0}`}`;
}

export function warrantyStatusLabel(status: string): string {
  return WARRANTY_CLAIM_STATUSES.find((option) => option.value === status)?.label ?? status.replaceAll('_', ' ');
}

export function formatPeriod(period: number | null | undefined, unit: WarrantyUnit | null | undefined): string {
  if (!period) return '-';
  const label = unit ?? 'months';
  return `${period} ${period === 1 ? label.replace(/s$/, '') : label}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: '2-digit' });
}

/** Short human text for warranty remaining, e.g. "120 days left" / "Expired 3 days ago". */
export function daysLeftLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '';
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export const SERIAL_TRANS_LABELS: Record<string, string> = {
  GRN: 'Purchase (GRN)',
  OPS: 'Opening stock',
  SALE: 'Sale',
  'SALE-RETURN': 'Sales return',
  'HP-SALE': 'Hire purchase',
  'HP-RETURN': 'HP return',
  'TRF-OUT': 'Transfer out',
  'TRF-IN': 'Transfer in',
  ADJ: 'Stock adjustment',
  'WC-REPLACE': 'Warranty replacement out',
  'WC-FAULTY': 'Warranty faulty unit in',
};
