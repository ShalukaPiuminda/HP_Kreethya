export type ChequeStatus = 'pending' | 'passed' | 'returned';
export type ChequeType = 'customer' | 'supplier';

export interface ChequeBankAccount {
  id: number;
  bank_name: string;
  account_no: string;
}

export interface ChequeHistory {
  id: number;
  from_status: ChequeStatus | null;
  to_status: ChequeStatus;
  action_date: string;
  reason: string | null;
  UID: string;
  created_at: string;
  bank_account?: ChequeBankAccount | null;
}

export interface ChequeRecord {
  id: number;
  trans_no: string;
  trans_type: string;
  bank: string;
  branch_code: string;
  cheques_no: string;
  acc_no: string;
  due_date?: string;
  release_date?: string;
  amount: string | number;
  status: ChequeStatus;
  realized_date: string | null;
  return_reason: string | null;
  status_changed_at: string | null;
  bank_account?: ChequeBankAccount | null;
  history: ChequeHistory[];
}

export interface ChequeStatusSummary {
  pending_count: number;
  pending_amount: number;
  passed_count: number;
  passed_amount: number;
  returned_count: number;
  returned_amount: number;
}

export interface ChequeSummary {
  customer: ChequeStatusSummary;
  supplier: ChequeStatusSummary;
  net_bank_impact: number;
  bank_accounts: ChequeBankAccount[];
}
