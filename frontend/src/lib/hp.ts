import type { StockItem, Store } from './inventory';
import type { ChequeBank } from './payment-options';
import type { SerialWarranty } from './warranty';
import { dateInputValue } from './purchases';

export interface HpCustomer {
  id: number;
  Code: string;
  name: string;
  NIC: string | null;
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
  /** ON: document charge is financed. OFF: collected upfront with the down payment. */
  IncludeDocumentCharge?: boolean | number;
  DownpaymentRequired?: boolean | number;
  /** ON: the 1st installment is collected when the HP sale is posted. */
  CollectFirstInstallment?: boolean | number;
}

/** Scheme flags arrive as booleans (or 0/1); a missing flag keeps the default. */
export function schemeFlag(value: boolean | number | undefined, fallback: boolean) {
  return value === undefined || value === null ? fallback : Boolean(Number(value));
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
  collection_no?: string | null;
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
  discount?: string | number;
  status: string;
  is_waived: boolean;
  payments: HpPayment[];
  days_overdue?: number;
  estimated_penalty?: number;
  sum?: Pick<HpAgreement, 'id' | 'invoice_no' | 'agreement_no' | 'customer_name' | 'status'> & {
    customer_nic?: string | null;
    customer_phone?: string | null;
    schema_type?: string;
  };
}

export interface HpInstallmentSummary {
  count: number;
  balance_total: number;
  overdue_count: number;
  overdue_amount: number;
  overdue_agreements: number;
}

/** One row of the collections worklist grouped by agreement. */
export interface HpCollectionAgreement {
  id: number;
  invoice_no: string;
  agreement_no: string;
  customer_name: string;
  customer_nic?: string | null;
  customer_phone?: string | null;
  schema_type: string;
  status: string;
  instalment_count: number;
  paid_count: number;
  outstanding_total: number;
  arrears_amount: number;
  arrears_count: number;
  next_instalment_id: number | null;
  next_instalment_no: number | null;
  next_due_date: string | null;
  next_due_amount: number;
  days_overdue: number;
  estimated_penalty: number;
  payable_now: number;
}

export interface HpCollectionSummary {
  count: number;
  outstanding_total: number;
  arrears_amount: number;
  arrears_agreements: number;
}

export interface HpStatementTotals {
  instalment_count: number;
  paid_count: number;
  schedule_amount: number;
  paid_principal: number;
  discount: number;
  penalty_paid: number;
  outstanding: number;
  arrears_amount: number;
  arrears_count: number;
  estimated_penalty: number;
  payable_now: number;
  next_instalment_id: number | null;
  next_due_date: string | null;
  next_due_amount: number;
}

export interface HpAgreementStatement {
  agreement: HpAgreement & { schema?: Pick<HpSchema, 'SchemaType' | 'PanaltyCharage' | 'GracePeriodDays'> | null };
  totals: HpStatementTotals;
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
  warranties?: SerialWarranty[];
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
  down_payment: number;
  interest_amount: number;
  document_charge: number;
  upfront_document_charge: number;
  document_charge_in_capital: boolean;
  down_payment_required: boolean;
  collect_first_installment: boolean;
  transport: number;
  rounding_adjustment: number;
  gross_hp_amount: number;
  contract_amount: number;
  installment_monthly: number;
  no_of_installments: number;
  recommended_down_payment: number;
  penalty_rate: number;
  grace_period_days: number;
}

export const today = () => dateInputValue();

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
