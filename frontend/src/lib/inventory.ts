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
  is_batch: boolean;
  default_batch_price_mode?: 'batch' | 'average' | 'last';
  is_serialized: boolean;
  reorder_level: number;
  standard_purchase_price: number;
  standard_sales_price: number;
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
