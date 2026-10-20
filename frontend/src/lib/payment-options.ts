export interface ChequeBankBranch {
  id: number;
  bank_id: number;
  branch_name: string;
  branch_code: string;
}

export interface ChequeBank {
  id: number;
  bank_name: string;
  account_no: string;
  branches: ChequeBankBranch[];
}

export interface PaymentBankAccount {
  id: number;
  bank_name: string;
  account_no: string;
}

export interface PaymentOptions {
  cheque_banks: ChequeBank[];
  bank_accounts: PaymentBankAccount[];
}

export interface ChequeEntryValue {
  bank_id: string;
  bank_branch_id: string;
  cheque_no: string;
  account_no: string;
  date: string;
}
