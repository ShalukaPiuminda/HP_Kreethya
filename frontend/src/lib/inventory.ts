export interface Store {
  id: number;
  name: string;
  location: string | null;
}

export interface StockStore {
  store_id: number;
  store_name: string;
  location: string | null;
  qty_in_hand: number;
}

export interface StockBatch {
  id: number;
  batch_no: string;
  store_id: number;
  store_name: string;
  purchase_price: number;
  sales_price: number;
  qty_in_hand: number;
  stock_value: number;
}

export interface StockSerial {
  serial_no: string;
  store_id: number;
  store_name: string;
}

export interface StockItem {
  id: number;
  item_code: string;
  item_description: string;
  barcode?: string | null;
  is_batch: boolean;
  default_batch_price_mode?: 'batch' | 'average' | 'last';
  is_serialized: boolean;
  reorder_level: number;
  standard_purchase_price: number;
  standard_sales_price: number;
  sales_criteria_enabled?: boolean;
  min_sales_price?: number | null;
  max_sales_price?: number | null;
  total_qty: number;
  stock_value: number;
  is_below_reorder: boolean;
  stores: StockStore[];
  batches: StockBatch[];
  available_serials: StockSerial[];
}

export interface StockMovement {
  id: number;
  trans_no: string;
  dDate: string;
  trans_code: string;
  batch_no: string | null;
  store_id: number;
  qun_in: number;
  qun_out: number;
  serial_numbers?: string[];
  store?: Store;
}

export type PriceRevisionScope = 'selected' | 'store' | 'all' | 'standard';
export type PriceRevisionPriceType = 'sales' | 'purchase' | 'both';
export type PriceRevisionMethod = 'set' | 'amount' | 'percent';

export interface PriceRevisionPreviewLine {
  target: 'batch' | 'standard';
  item_batch_id: number | null;
  batch_no: string | null;
  store_id: number | null;
  store_name: string | null;
  qty_in_hand: number | null;
  old_purchase_price: number;
  new_purchase_price: number;
  old_sales_price: number;
  new_sales_price: number;
  errors: string[];
}

export interface PriceRevisionPreview {
  item_code: string;
  item_description: string;
  lines: PriceRevisionPreviewLine[];
  can_save: boolean;
}

export interface PriceRevisionLine {
  id: number;
  target: 'batch' | 'standard';
  item_batch_id: number | null;
  batch_no: string | null;
  store_id: number | null;
  store?: { id: number; name: string } | null;
  old_purchase_price: string | number;
  new_purchase_price: string | number;
  old_sales_price: string | number;
  new_sales_price: string | number;
}

export interface PriceRevision {
  id: number;
  revision_no: string;
  item_code: string;
  item?: { item_code: string; item_description: string } | null;
  scope: PriceRevisionScope | 'batch';
  store?: { id: number; name: string } | null;
  price_type: PriceRevisionPriceType;
  method: PriceRevisionMethod | 'restore';
  sales_value: string | number | null;
  purchase_value: string | number | null;
  update_standard: boolean;
  reason: string;
  source: string;
  source_no: string | null;
  status: 'applied' | 'reversed';
  reverses_id: number | null;
  reversed_by_revision_id: number | null;
  reversed_by: string | null;
  reversed_at: string | null;
  UID: string;
  created_at: string;
  lines: PriceRevisionLine[];
}

export function parseSerialNumbers(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(value);
}
