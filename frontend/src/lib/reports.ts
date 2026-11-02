import type { Store } from './inventory';

export interface ReportPoint {
  date: string;
  total: number;
}

export interface OverviewReport {
  period: { from: string; to: string };
  sales: number;
  purchases: number;
  expenses: number;
  customer_collections: number;
  supplier_payments: number;
  net_cash_flow: number;
  active_hp_outstanding: number;
  customer_receivables: number;
  supplier_payables: number;
  assets: number;
  liabilities: number;
  daily_sales: ReportPoint[];
  daily_collections: ReportPoint[];
  trial_balance_difference: number;
}

export interface TrialBalanceRow {
  code: string;
  description: string;
  type: string;
  category: string;
  debit: number;
  credit: number;
  debit_balance: number;
  credit_balance: number;
  display_balance: number;
}

export interface TrialBalance {
  as_of: string;
  accounts: TrialBalanceRow[];
  debit_total: number;
  credit_total: number;
  difference: number;
}

export interface DayEndPreview {
  date: string;
  opening_balance: number;
  cash_in: number;
  cash_out: number;
  expected_closing: number;
  total_debits: number;
  total_credits: number;
  trial_balance_difference: number;
  already_closed: boolean;
}

export interface DayEndRecord {
  id: number;
  close_date: string;
  opening_balance: string | number;
  closing_balance: string | number;
  counted_cash: string | number;
  variance: string | number;
  total_dr: string | number;
  total_cr: string | number;
  notes?: string | null;
  closed_by?: { id: number; username: string };
}

export interface ReportOptionItem {
  id: number;
  item_code: string;
  item_description: string;
  is_batch: boolean;
  is_serialized: boolean;
}

export interface ReportOptionCustomer {
  id: number;
  Code: string;
  name: string;
  NIC: string;
}

export interface ReportOptionSupplier {
  id: number;
  Code: string;
  name: string;
  type?: string | null;
}

export interface ReportCashAccount {
  id: number;
  code: string;
  description: string;
}

export interface ReportOptions {
  stores: Store[];
  items: ReportOptionItem[];
  customers: ReportOptionCustomer[];
  suppliers: ReportOptionSupplier[];
  cash_accounts: ReportCashAccount[];
}

export interface StockReportStore {
  store_id: number;
  store_name: string;
  location: string | null;
  qty_in_hand: number;
}

export interface StockReportBatch {
  id: number;
  batch_no: string;
  store_id: number;
  store_name: string;
  purchase_price: number;
  sales_price: number;
  qty_in_hand: number;
  stock_value: number;
}

export interface StockInHandRow {
  id: number;
  item_code: string;
  item_description: string;
  is_batch: boolean;
  is_serialized: boolean;
  default_batch_price_mode?: 'batch' | 'average' | 'last';
  reorder_level: number;
  standard_purchase_price: number;
  standard_sales_price: number;
  total_qty: number;
  stock_value: number;
  average_cost: number;
  is_below_reorder: boolean;
  stores: StockReportStore[];
  batches: StockReportBatch[];
  serial_numbers: string[];
  serial_count: number;
}

export interface StockInHandReport {
  filters: {
    search?: string;
    item_code?: string | null;
    store_id?: number | null;
  };
  summary: {
    items: number;
    units: number;
    stock_value: number;
    serialized_items: number;
  };
  rows: StockInHandRow[];
}

export interface BinCardRow {
  date: string;
  trans_no: string;
  trans_code: string;
  movement_type: string;
  store_name: string;
  batch_no?: string | null;
  qty_in: number;
  qty_out: number;
  running_balance: number;
  serial_numbers: string[];
  serial_count: number;
}

export interface BinCardReport {
  item: {
    item_code: string;
    item_description: string;
    is_batch: boolean;
    is_serialized: boolean;
  };
  filters: {
    store_id?: number | null;
    from?: string | null;
    to?: string | null;
  };
  summary: {
    opening_balance: number;
    total_in: number;
    total_out: number;
    closing_balance: number;
  };
  rows: BinCardRow[];
}

export type TransactionReportMode = 'summary' | 'detail';

export interface PurchaseSummaryRow {
  invoice_no: string;
  reference_no?: string | null;
  invoice_date: string;
  supplier_code: string;
  supplier_name: string;
  store_name: string;
  qty_total: number;
  free_qty_total: number;
  line_count: number;
  discount: number;
  net_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: string;
}

export interface PurchaseDetailRow {
  invoice_no: string;
  reference_no?: string | null;
  invoice_date: string;
  supplier_code: string;
  supplier_name: string;
  store_name: string;
  item_code: string;
  item_description: string;
  batch_no?: string | null;
  qty: number;
  free_qty: number;
  received_qty: number;
  unit_price: number;
  sales_price: number;
  discount: number;
  net_value: number;
  serial_numbers: string[];
}

export interface SalesSummaryRow {
  invoice_no: string;
  reference_no?: string | null;
  invoice_date: string;
  customer_code: string;
  customer_name: string;
  customer_nic: string;
  payment_status: string;
  store_name: string;
  qty_total: number;
  line_count: number;
  discount: number;
  net_amount: number;
  paid_amount: number;
  credit_amount: number;
  advance_applied: number;
  cash_payment: number;
  card_payment: number;
  cheque_payment: number;
  bank_transfer: number;
}

export interface SalesDetailRow {
  invoice_no: string;
  reference_no?: string | null;
  invoice_date: string;
  customer_code: string;
  customer_name: string;
  payment_status: string;
  store_name: string;
  item_code: string;
  item_description: string;
  batch_no?: string | null;
  qty: number;
  unit_price: number;
  discount: number;
  net_value: number;
  serial_numbers: string[];
}

export interface HirePurchaseSummaryRow {
  invoice_no: string;
  agreement_no: string;
  invoice_date: string;
  customer_code: string;
  customer_name: string;
  customer_nic: string;
  schema_type: string;
  status: string;
  store_name: string;
  qty_total: number;
  line_count: number;
  net_amount: number;
  contract_amount: number;
  down_payment: number;
  advance_applied: number;
  paid_amount: number;
  outstanding_amount: number;
  returned_amount: number;
}

export interface HirePurchaseDetailRow {
  invoice_no: string;
  agreement_no: string;
  invoice_date: string;
  customer_code: string;
  customer_name: string;
  customer_nic: string;
  schema_type: string;
  status: string;
  store_name: string;
  item_code: string;
  item_description: string;
  batch_no?: string | null;
  qty: number;
  returned_qty: number;
  unit_price: number;
  discount: number;
  net_value: number;
  serial_numbers: string[];
}

export interface TransactionReport<TSummary, TDetail> {
  mode: TransactionReportMode;
  filters: Record<string, unknown>;
  summary: {
    rows: number;
    net_total: number;
  };
  rows: Array<TSummary | TDetail>;
}

export interface CashFlowRow {
  date: string;
  trance_type: string;
  trance_no: string;
  reference_no: string;
  cash_in: number;
  cash_out: number;
  running_balance: number;
  counterpart_accounts: string[];
  uid: string;
}

export interface CashFlowReport {
  account: {
    code: string;
    description: string;
  };
  filters: {
    from?: string | null;
    to?: string | null;
  };
  summary: {
    opening_balance: number;
    cash_in: number;
    cash_out: number;
    closing_balance: number;
  };
  rows: CashFlowRow[];
}

export const reportToday = () => new Date().toISOString().slice(0, 10);

export function monthStart() {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}
