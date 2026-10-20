export interface SupplierOption {
  id: number;
  Code: string;
  name: string;
  phone: string | null;
}

export interface PurchaseItemOption {
  id: number;
  item_code: string;
  item_description: string;
  is_batch: boolean;
  default_batch_price_mode?: 'batch' | 'average' | 'last';
  is_serialized: boolean;
  standard_purchase_price: string | number;
  standard_sales_price: string | number;
}

export interface PurchaseStore {
  id: number;
  name: string;
  location: string | null;
}

export interface PurchaseOrderDetail {
  id: number;
  item_code: string;
  item_description: string | null;
  qty: number;
  received_qty: number;
  remaining_qty?: number;
  unit_price: string | number;
  net_value: string | number;
  item?: PurchaseItemOption;
}

export interface PurchaseOrder {
  id: number;
  po_no: string;
  po_date: string;
  expected_date: string | null;
  supplier_code: string;
  gross_amount: string | number;
  net_amount: string | number;
  status: 'draft' | 'approved' | 'partially_received' | 'received' | 'cancelled';
  notes: string | null;
  receipts_count?: number;
  supplier?: SupplierOption;
  details: PurchaseOrderDetail[];
}

export interface PurchaseReceiptDetail {
  id: number;
  Item_code: string;
  Item_description: string | null;
  batch_no: string | null;
  store_id: number;
  QTY: number;
  free_qty?: number;
  Unit_price: string | number;
  Sales_price: string | number;
  serial_numbers?: string[];
  Discount: string | number;
  discount_type?: 'amount' | 'percent';
  discount_value?: string | number;
  Net_value: string | number;
  item?: PurchaseItemOption;
}

export interface PurchaseReceipt {
  id: number;
  Invoice_no: string;
  Ref_no: string | null;
  Invoice_date: string;
  supplier_code: string;
  purchase_order_no: string | null;
  store_id: number;
  Gross_Amount: string | number;
  Discount: string | number;
  discount_type?: 'amount' | 'percent';
  discount_value?: string | number;
  Net_Amount: string | number;
  paid_amount: string | number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  supplier?: SupplierOption;
  store?: PurchaseStore;
  order?: PurchaseOrder;
  details: PurchaseReceiptDetail[];
}

export interface OutstandingInvoice {
  invoice_no: string;
  invoice_date: string;
  reference_no: string | null;
  net_amount: number;
  paid_amount: number;
  outstanding: number;
  payment_status: string;
}

export interface SupplierOutstanding {
  supplier: SupplierOption;
  total_outstanding: number;
  invoices: OutstandingInvoice[];
}

export interface SupplierPaymentAllocation {
  id: number;
  purchase_invoice_no: string;
  amount_allocated: string | number;
  purchase?: PurchaseReceipt;
}

export interface SupplierPayment {
  id: number;
  Payment_no: string;
  Payment_date: string;
  Supplier_Code: string;
  Supplier_Name: string | null;
  Payment_note: string | null;
  Payment_Amount: string | number;
  cash_payment: string | number;
  card_payment: string | number;
  cheque_payment: string | number;
  bank_transfer: string | number;
  bank_detail_id?: number | null;
  supplier?: SupplierOption;
  bank_account?: {
    id: number;
    bank_name: string;
    account_no: string;
  } | null;
  allocations: SupplierPaymentAllocation[];
}

export function numeric(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dateInputValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}
