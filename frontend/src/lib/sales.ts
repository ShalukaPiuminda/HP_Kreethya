import type { PurchaseStore } from './purchases';

export interface SalesCustomer {
  id: number;
  Code: string;
  name: string;
  NIC: string;
  phone: string | null;
  address: string | null;
  advance_balance: string | number;
}

export interface Salesperson {
  id: number;
  name: string;
  phone: string | null;
}

export interface SalesInvoiceDetail {
  id: number;
  Item_code: string;
  Item_description: string | null;
  batch_no: string | null;
  QTY: number;
  Unit_price: string | number;
  Discount: string | number;
  discount_type?: 'amount' | 'percent';
  discount_value?: string | number;
  Net_value: string | number;
  serial_numbers?: string[] | null;
  item?: {
    item_code: string;
    item_description: string;
    is_serialized: boolean;
  };
  return_details?: Array<{
    id: number;
    qty: number;
  }>;
}

export interface SalesReturnReason {
  id: number;
  reason: string;
}

export interface SalesReturnDetail {
  id: number;
  invoice_detail_id: number;
  item_code: string;
  batch_no: string | null;
  qty: number;
  unit_price: string | number;
  net_value: string | number;
}

export interface SalesReturn {
  id: number;
  return_no: string;
  return_date: string;
  invoice_no: string;
  customer_nic: string;
  reason_id: number;
  gross_amount: string | number;
  net_amount: string | number;
  credit_adjustment: string | number;
  refund_amount: string | number;
  refund_method: string;
  status: string;
  invoice?: SalesInvoice;
  reason?: SalesReturnReason;
  details: SalesReturnDetail[];
}

export interface SalesInvoice {
  id: number;
  Invoice_no: string;
  reference_no: string | null;
  Invoice_date: string;
  customer_code: string;
  store_id: number;
  Customer_NIC: string;
  Customer_Name: string | null;
  Customer_Phone?: string | null;
  Customer_Address?: string | null;
  Gross_Amount: string | number;
  Discount: string | number;
  discount_type?: 'amount' | 'percent';
  discount_value?: string | number;
  Net_Amount: string | number;
  Cash_Pay: string | number;
  card_payment: string | number;
  Credite: string | number;
  Cheque: string | number;
  bank_transfer: string | number;
  bank_detail_id?: number | null;
  advance_applied: string | number;
  paid_amount: string | number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  status: string;
  customer?: SalesCustomer;
  store?: PurchaseStore;
  salesman?: Salesperson;
  bank_account?: {
    id: number;
    bank_name: string;
    account_no: string;
  } | null;
  details: SalesInvoiceDetail[];
}

export interface CustomerOutstandingInvoice {
  invoice_no: string;
  invoice_date: string;
  reference_no: string | null;
  net_amount: number;
  paid_amount: number;
  outstanding: number;
  payment_status: string;
}

export interface CustomerOutstanding {
  customer: SalesCustomer;
  advance_balance: number;
  total_outstanding: number;
  sales_outstanding: number;
  hp_outstanding: number;
  total_account_outstanding: number;
  net_balance: number;
  invoices: CustomerOutstandingInvoice[];
  hp_agreements: Array<{
    invoice_no: string;
    agreement_no: string;
    invoice_date: string;
    contract_amount: number;
    paid_amount: number;
    down_payment_outstanding: number;
    outstanding: number;
    status: string;
  }>;
}

export interface CustomerPaymentAllocation {
  id: number;
  sales_invoice_no: string;
  amount_allocated: string | number;
  invoice?: SalesInvoice;
}

export interface CustomerPayment {
  id: number;
  Payment_no: string;
  Payment_date: string;
  Customer_NIC: string;
  Customer_Name: string | null;
  Payment_note: string | null;
  Payment_Amount: string | number;
  cash_payment: string | number;
  card_payment: string | number;
  cheque_payment: string | number;
  bank_transfer: string | number;
  bank_detail_id?: number | null;
  customer?: SalesCustomer;
  bank_account?: {
    id: number;
    bank_name: string;
    account_no: string;
  } | null;
  allocations: CustomerPaymentAllocation[];
}

export interface CustomerAdvanceAllocation {
  id: number;
  sales_invoice_no: string;
  amount_allocated: string | number;
  invoice?: SalesInvoice;
}

export interface CustomerAdvance {
  id: number;
  payment_no: string;
  payment_date: string;
  customer_nic: string;
  customer_name: string | null;
  payment_note: string | null;
  amount: string | number;
  remaining_amount: string | number;
  cash_payment: string | number;
  card_payment: string | number;
  cheque_payment: string | number;
  bank_transfer: string | number;
  bank_detail_id?: number | null;
  is_carried_forward: boolean;
  customer?: SalesCustomer;
  bank_account?: {
    id: number;
    bank_name: string;
    account_no: string;
  } | null;
  allocations: CustomerAdvanceAllocation[];
  hp_allocations?: Array<{
    id: number;
    hp_invoice_no: string;
    amount_allocated: string | number;
  }>;
}
