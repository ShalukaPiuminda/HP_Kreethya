import type { ChequeBankAccount } from './cheques';

export type ServiceStatus =
  | 'received'
  | 'dispatched_to_supplier'
  | 'received_from_supplier'
  | 'under_repair'
  | 'repaired'
  | 'invoiced'
  | 'customer_paid'
  | 'completed';

export interface ServiceCustomerOption {
  id: number;
  Code: string;
  name: string;
  NIC: string;
  phone?: string | null;
}

export interface ServiceItemOption {
  id: number;
  item_code: string;
  item_description: string;
  is_serialized: boolean;
}

export interface ServiceSupplierOption {
  id: number;
  Code: string;
  name: string;
  phone?: string | null;
}

export interface ServicePayment {
  id: number;
  payment_no: string;
  payment_date: string;
  amount: string | number;
  payment_method: string;
  payment_note?: string | null;
  bank_account?: ChequeBankAccount | null;
}

export interface ServiceDispatch {
  id: number;
  dispatch_no: string;
  supplier_code: string;
  dispatch_date: string;
  estimated_return?: string | null;
  received_date?: string | null;
  supplier_reference?: string | null;
  dispatch_notes?: string | null;
  supplier_report?: string | null;
  repair_cost: string | number;
  paid_amount: string | number;
  payment_status: string;
  status: string;
  supplier?: ServiceSupplierOption | null;
  payments: ServicePayment[];
}

export interface ServiceIssue {
  id: number;
  issue_no: string;
  issue_date: string;
  status: string;
  technician_name?: string | null;
  completed_date?: string | null;
  diagnosis?: string | null;
  repair_details?: string | null;
  parts_used?: string | null;
  labor_charge: string | number;
}

export interface ServiceInvoice {
  id: number;
  invoice_no: string;
  invoice_date: string;
  service_charge: string | number;
  supplier_repair_cost: string | number;
  net_payable: string | number;
  paid_amount: string | number;
  payment_status: string;
  invoice_note?: string | null;
  payments: ServicePayment[];
}

export interface ServiceTrack {
  id: number;
  event_name: string;
  description?: string | null;
  event_date: string;
  UID: string;
}

export interface ServiceTicket {
  id: number;
  ticket_no: string;
  return_date: string;
  customer_nic: string;
  customer_code?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  item_code: string;
  item_serial_no?: string | null;
  problem_description: string;
  intake_condition?: string | null;
  is_warranty: boolean;
  expected_completion_date?: string | null;
  assigned_technician?: string | null;
  repair_summary?: string | null;
  completed_date?: string | null;
  status: ServiceStatus;
  customer?: ServiceCustomerOption | null;
  item?: ServiceItemOption | null;
  dispatches: ServiceDispatch[];
  issues: ServiceIssue[];
  invoices: ServiceInvoice[];
  tracks: ServiceTrack[];
}

export interface ServiceOptions {
  customers: ServiceCustomerOption[];
  items: ServiceItemOption[];
  service_suppliers: ServiceSupplierOption[];
  bank_accounts: ChequeBankAccount[];
}

export interface ServiceSummary {
  open_tickets: number;
  completed_tickets: number;
  with_supplier: number;
  under_repair: number;
  customer_outstanding: number;
  supplier_outstanding: number;
  status_counts: Record<string, number>;
}
