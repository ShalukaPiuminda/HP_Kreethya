import type { StockItem, Store } from './inventory';
import type { ChequeBank } from './payment-options';

export interface HpCustomer {
  id: number;
  Code: string;
  name: string;
  NIC: string;
  phone?: string | null;
  address?: string | null;
  advance_balance: string | number;
}

export interface HpGuarantor {
  id: number;
  Code: string;
  name: string;
  NIC: string;
  phone?: string | null;
}

export interface HpSchema {
  id: number;
  SchemaType: string;
  DownpaymentPrecentage: string | number;
  InstallmentRate: string | number;
  NoOfInstallment: number;
  DocumentCharagePrecentage: string | number;
  PanaltyCharage: string | number;
  GracePeriodDays: number;
}

export interface HpBankAccount {
  id: number;
  bank_name: string;
  account_no: string;
}

export interface HpOptions {
  customers: HpCustomer[];
  guarantors: HpGuarantor[];
  schemas: HpSchema[];
  stores: Store[];
  items: StockItem[];
  bank_accounts: HpBankAccount[];
  cheque_banks: ChequeBank[];
}

export interface HpPayment {
  id: number;
  payment_no: string;
  payment_date: string;
  principal_amount: string | number;
  penalty_amount: string | number;
  discount_amount: string | number;
  total_amount: string | number;
  payment_method: string;
  note?: string | null;
}

export interface HpInstallment {
  id: number;
  invoice_no: string;
  agreement_no: string;
  instalment_no: number;
  instalment_date: string;
  instalment_amount: string | number;
  base_amount: string | number;
  amount_pay: string | number;
  balance_amount: string | number;
  penalty_amount: string | number;
  status: string;
  is_waived: boolean;
  payments: HpPayment[];
  sum?: Pick<HpAgreement, 'id' | 'invoice_no' | 'agreement_no' | 'customer_name' | 'status'>;
}

export interface HpDetail {
  id: number;
  item_code: string;
  item_description: string;
  batch_no?: string | null;
  qty: number;
  returned_qty: number;
  unit_price: string | number;
  discount: string | number;
  discount_type?: 'amount' | 'percent';
  discount_value?: string | number;
  net_value: string | number;
  serial_numbers?: string[] | null;
  warranty_enabled?: boolean;
  warranty_months?: number | null;
  warranty_expiry_date?: string | null;
}

export interface HpHistory {
  id: number;
  event: string;
  from_status?: string | null;
  to_status: string;
  description?: string | null;
  event_date: string;
  UID: string;
}

export interface HpConversion {
  id: number;
  conversion_no: string;
  conversion_date: string;
  amount: string | number;
  discount: string | number;
  conversion_note?: string | null;
}

export interface HpReturn {
  id: number;
  hpreturn_code: string;
  return_date: string;
  reason: string;
  outstanding_written_off: string | number;
  refund_amount: string | number;
}

export interface HpAgreement {
  id: number;
  invoice_no: string;
  agreement_no: string;
  reference_no?: string | null;
  opening_reference_no?: string | null;
  opening_note?: string | null;
  invoice_date: string;
  customer_code: string;
  customer_name: string;
  customer_nic: string;
  customer_phone?: string | null;
  schema_type: string;
  store_id: number;
  store?: Store | null;
  document_charge: string | number;
  down_payment: string | number;
  advance_applied: string | number;
  down_payment_outstanding: string | number;
  transport: string | number;
  instalment_amount: string | number;
  no_of_instalment: number;
  instalment: string | number;
  due_amount: string | number;
  gross_amount: string | number;
  discount: string | number;
  discount_type?: 'amount' | 'percent';
  discount_value?: string | number;
  net_amount: string | number;
  contract_amount: string | number;
  paid_amount: string | number;
  outstanding_amount: string | number;
  returned_amount: string | number;
  status: string;
  is_cash_converted: boolean;
  is_opening: boolean;
  details: HpDetail[];
  instalments: HpInstallment[];
  histories: HpHistory[];
  conversions: HpConversion[];
  returns: HpReturn[];
}

export interface HpSummary {
  active_agreements: number;
  completed_agreements: number;
  converted_agreements: number;
  returned_agreements: number;
  total_outstanding: number;
  total_collected: number;
  overdue_installments: number;
  due_today: number;
}

export interface HpCalculation {
  principal: number;
  interest_amount: number;
  document_charge: number;
  transport: number;
  gross_hp_amount: number;
  contract_amount: number;
  installment_monthly: number;
  no_of_installments: number;
  recommended_down_payment: number;
  penalty_rate: number;
  grace_period_days: number;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function money(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function shortDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`)
  );
}
