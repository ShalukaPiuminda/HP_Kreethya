export type LetterStage = 1 | 2 | 3 | 4;

export type ArrearsStatus = 'due' | 'waiting' | 'seizure_ready' | 'seizure_issued';

export const STAGE_LABELS: Record<LetterStage, string> = {
  1: 'Letter 1',
  2: 'Letter 2',
  3: 'Letter 3',
  4: 'Seizing Order',
};

export const STATUS_LABELS: Record<ArrearsStatus, string> = {
  due: 'Due to print',
  waiting: 'Waiting',
  seizure_ready: 'Ready for seizure',
  seizure_issued: 'Seizing order issued',
};

export interface ArrearsRow {
  id: number;
  invoice_no: string;
  agreement_no: string;
  agreement_date: string | null;
  customer_code: string;
  customer_name: string;
  customer_nic: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  items: string;
  instalment_amount: number;
  outstanding_amount: number;
  overdue_installments: number;
  arrears_amount: number;
  penalty_amount: number;
  oldest_due_date: string;
  days_overdue: number;
  last_stage: number;
  last_stage_label: string | null;
  last_printed_at: string | null;
  next_stage: LetterStage | null;
  next_stage_label: string | null;
  auto_next_date: string | null;
  next_print_date: string | null;
  is_overridden: boolean;
  override_note: string | null;
  status: ArrearsStatus;
}

export interface ArrearsSummary {
  total: number;
  due_1: number;
  due_2: number;
  due_3: number;
  seizure_ready: number;
  seizure_issued: number;
  waiting: number;
  arrears_amount: number;
}

export interface LetterSettings {
  letter1_after_days: number;
  letter2_after_days: number;
  letter3_after_days: number;
  seizure_after_days: number;
  settle_within_days: number;
}

export interface LetterTemplate {
  id: number;
  stage: LetterStage;
  title: string;
  body: string;
  updated_by: string | null;
  updated_at: string | null;
}

export interface RenderedLetter {
  invoice_no: string;
  agreement_no: string;
  stage: LetterStage;
  stage_label: string;
  recipient_type: 'customer' | 'guarantor';
  recipient_code: string | null;
  recipient_name: string;
  recipient_address: string | null;
  title: string;
  body: string;
  date: string;
}

export interface LetterLog {
  id: number;
  stage: LetterStage;
  recipient_type: 'customer' | 'guarantor';
  recipient_name: string | null;
  arrears_amount: string;
  printed_by: string | null;
  printed_at: string;
}

/** Sample values used for the template preview. */
export const SAMPLE_VARIABLES: Record<string, string> = {
  date: '13 Oct 2026',
  recipient_name: 'K. A. Perera',
  recipient_address: 'No. 12, Temple Road, Kandy',
  customer_name: 'K. A. Perera',
  customer_nic: '901234567V',
  customer_phone: '0771234567',
  customer_address: 'No. 12, Temple Road, Kandy',
  agreement_no: 'AGR-HQ-20260101-0001',
  invoice_no: 'HP-HQ-20260101-0001',
  agreement_date: '01 Jan 2026',
  items: 'Samsung 43" Television',
  instalment_amount: '8,000.00',
  overdue_installments: '2',
  oldest_due_date: '01 Aug 2026',
  days_overdue: '73',
  arrears_amount: '16,000.00',
  penalty_amount: '650.00',
  outstanding_amount: '48,000.00',
  settle_by_date: '27 Oct 2026',
  previous_letter_date: '10 Sep 2026',
  guarantor_names: 'S. Silva, R. Fernando',
  company_name: 'Your Company (Pvt) Ltd',
  company_address: 'Main Street, Colombo',
  company_phone: '0112345678',
  branch_name: 'Head Office',
  branch_phone: '0112345678',
};

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

export function printPath(stage: LetterStage, invoiceNos: string[]) {
  const query = new URLSearchParams({ stage: String(stage), ids: invoiceNos.join(',') });
  return `/dashboard/reminder-letters/print?${query}`;
}
