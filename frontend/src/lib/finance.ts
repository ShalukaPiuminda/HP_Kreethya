export interface AccountCategory {
  id: number;
  name: string;
}

export interface AccountType {
  id: number;
  category_id: number;
  name: string;
  category: AccountCategory;
}

export interface LedgerAccount {
  id: number;
  code: string;
  description: string;
  type_id: number;
  is_active: boolean;
  opening_balance: string | number;
  debit_total?: string | number;
  credit_total?: string | number;
  balance?: string | number;
  type: AccountType;
}

export interface FinanceBank {
  id: number;
  bank_name: string;
  account_no: string;
}

export interface FinanceOptions {
  categories: Array<AccountCategory & { types: AccountType[] }>;
  account_types: AccountType[];
  accounts: LedgerAccount[];
  bank_accounts: FinanceBank[];
}

export interface FinanceSummary {
  cash_balance: number;
  bank_balance: number;
  receivables: number;
  payables: number;
  total_debits: number;
  total_credits: number;
  trial_balance_difference: number;
  draft_vouchers: number;
}

export interface Voucher {
  id: number;
  invoice_no: string;
  date: string;
  drcode: string;
  crcode: string;
  description?: string | null;
  amount: string | number;
  status: string;
  payment_method: string;
  cancellation_reason?: string | null;
  debit_account?: LedgerAccount;
  credit_account?: LedgerAccount;
  bank_account?: FinanceBank | null;
}

export interface Expense {
  id: number;
  Expense_no: string;
  Expense_date: string;
  ExpenseType: string;
  expense_account_code: string;
  Expense_note?: string | null;
  Expense_Amount: string | number;
  payment_method: string;
  status: string;
  account?: LedgerAccount;
  bank_account?: FinanceBank | null;
}

export interface BankEntry {
  id: number;
  invoice_no: string;
  date: string;
  entry_type: string;
  description?: string | null;
  amount: string | number;
  bank_charges: string | number;
  status: string;
  bank_account?: FinanceBank;
  debit_account?: LedgerAccount;
  credit_account?: LedgerAccount;
}

export const financeToday = () => new Date().toISOString().slice(0, 10);

export function financeMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function financeDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`)
  );
}
