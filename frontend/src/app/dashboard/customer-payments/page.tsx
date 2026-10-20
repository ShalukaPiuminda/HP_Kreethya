'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  HandCoins,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
} from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { smsNote } from '@/lib/sms';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/inventory';
import { dateInputValue, displayDate, numeric } from '@/lib/purchases';
import {
  CustomerAdvance,
  CustomerOutstanding,
  CustomerPayment,
  SalesCustomer,
} from '@/lib/sales';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import type { ChequeBank, PaymentBankAccount, PaymentOptions } from '@/lib/payment-options';
import { SearchSelect } from '@/components/search-select';

interface AccountForm {
  payment_date: string;
  customer_code: string;
  payment_note: string;
  amount: string;
  cash_payment: string;
  card_payment: string;
  cheque_payment: string;
  bank_transfer: string;
  bank_detail_id: string;
  cheque_bank_id: string;
  cheque_bank_branch_id: string;
  cheque_no: string;
  cheque_account_no: string;
  cheque_due_date: string;
  allocations: Record<string, string>;
}

function blankAccountForm(): AccountForm {
  return {
    payment_date: dateInputValue(),
    customer_code: '',
    payment_note: '',
    amount: '',
    cash_payment: '0',
    card_payment: '0',
    cheque_payment: '0',
    bank_transfer: '0',
    bank_detail_id: '',
    cheque_bank_id: '',
    cheque_bank_branch_id: '',
    cheque_no: '',
    cheque_account_no: '',
    cheque_due_date: '',
    allocations: {},
  };
}

export default function CustomerPaymentsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('sales', 'can_read');
  const canCreate = hasPermission('sales', 'can_create');

  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [chequeBanks, setChequeBanks] = useState<ChequeBank[]>([]);
  const [bankAccounts, setBankAccounts] = useState<PaymentBankAccount[]>([]);
  const [outstanding, setOutstanding] = useState<CustomerOutstanding | null>(null);
  const [form, setForm] = useState<AccountForm>(blankAccountForm);
  const [modal, setModal] = useState<'payment' | 'advance' | null>(null);
  const [tab, setTab] = useState<'payments' | 'advances'>('payments');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOutstanding, setLoadingOutstanding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [paymentResponse, advanceResponse, customerResponse, paymentOptionResponse] = await Promise.all([
        api.getAll<CustomerPayment>('/v1/customer-payments'),
        api.getAll<CustomerAdvance>('/v1/customer-advances'),
        api.getAll<SalesCustomer>('/v1/customers'),
        api.get<PaymentOptions>('/v1/payment-options'),
      ]);
      setPayments(paymentResponse.data ?? []);
      setAdvances(advanceResponse.data ?? []);
      setCustomers(customerResponse.data ?? []);
      setChequeBanks(paymentOptionResponse.data?.cheque_banks ?? []);
      setBankAccounts(paymentOptionResponse.data?.bank_accounts ?? []);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load customer accounts.'),
      });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const loadOutstanding = useCallback(async (customerCode: string) => {
    if (!customerCode) {
      setOutstanding(null);
      return;
    }
    setLoadingOutstanding(true);
    try {
      const response = await api.get<CustomerOutstanding>(
        `/v1/customer-payments/outstanding?customer_code=${encodeURIComponent(customerCode)}`
      );
      setOutstanding(response.data ?? null);
    } catch (error) {
      setOutstanding(null);
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load customer outstanding invoices.'),
      });
    } finally {
      setLoadingOutstanding(false);
    }
  }, []);

  const visiblePayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return payments;
    return payments.filter(
      (payment) =>
        payment.Payment_no.toLowerCase().includes(term)
        || payment.Customer_Name?.toLowerCase().includes(term)
        || payment.Customer_NIC.toLowerCase().includes(term)
    );
  }, [payments, search]);

  const visibleAdvances = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return advances;
    return advances.filter(
      (advance) =>
        advance.payment_no.toLowerCase().includes(term)
        || advance.customer_name?.toLowerCase().includes(term)
        || advance.customer_nic.toLowerCase().includes(term)
    );
  }, [advances, search]);

  const metrics = useMemo(() => ({
    payments: payments.reduce((sum, payment) => sum + numeric(payment.Payment_Amount), 0),
    advances: advances.reduce((sum, advance) => sum + numeric(advance.amount), 0),
    availableAdvance: advances.reduce((sum, advance) => sum + numeric(advance.remaining_amount), 0),
    allocations: payments.reduce((sum, payment) => sum + payment.allocations.length, 0),
  }), [advances, payments]);

  const allocationTotal = Object.values(form.allocations).reduce(
    (sum, amount) => sum + numeric(amount),
    0
  );
  const methodTotal =
    numeric(form.cash_payment)
    + numeric(form.card_payment)
    + numeric(form.cheque_payment)
    + numeric(form.bank_transfer);
  const needsBankAccount =
    numeric(form.card_payment) > 0 || numeric(form.bank_transfer) > 0;
  const targetAmount = modal === 'payment' ? allocationTotal : numeric(form.amount);
  const totalsMatch = Math.abs(targetAmount - methodTotal) < 0.01;

  if (!canRead) {
    return <OperationNotice type="error">You do not have permission to view customer accounts.</OperationNotice>;
  }

  const openModal = (type: 'payment' | 'advance') => {
    setForm(blankAccountForm());
    setNotice(null);
    setModal(type);
    setOutstanding(null);
  };

  const changeCustomer = (customerCode: string) => {
    setForm({
      ...blankAccountForm(),
      customer_code: customerCode,
      payment_date: form.payment_date,
    });
    if (modal === 'payment') void loadOutstanding(customerCode);
  };

  const updateAllocation = (invoiceNo: string, value: string) => {
    const allocations = { ...form.allocations, [invoiceNo]: value };
    const total = Object.values(allocations).reduce(
      (sum, amount) => sum + numeric(amount),
      0
    );
    const onlyCash =
      numeric(form.card_payment) === 0
      && numeric(form.cheque_payment) === 0
      && numeric(form.bank_transfer) === 0;
    setForm((current) => ({
      ...current,
      allocations,
      cash_payment: onlyCash ? String(total) : current.cash_payment,
    }));
  };

  const changeAdvanceAmount = (amount: string) => {
    const onlyCash =
      numeric(form.card_payment) === 0
      && numeric(form.cheque_payment) === 0
      && numeric(form.bank_transfer) === 0;
    setForm((current) => ({
      ...current,
      amount,
      cash_payment: onlyCash ? amount : current.cash_payment,
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modal) return;
    setSaving(true);
    setNotice(null);
    try {
      const cheque = numeric(form.cheque_payment) > 0
        ? {
            bank_id: Number(form.cheque_bank_id),
            bank_branch_id: Number(form.cheque_bank_branch_id),
            cheque_no: form.cheque_no,
            account_no: form.cheque_account_no,
            due_date: form.cheque_due_date,
          }
        : null;

      let response;
      if (modal === 'advance') {
        response = await api.post('/v1/customer-advances', {
          payment_date: form.payment_date,
          customer_code: form.customer_code,
          payment_note: form.payment_note || null,
          amount: numeric(form.amount),
          cash_payment: numeric(form.cash_payment),
          card_payment: numeric(form.card_payment),
          cheque_payment: numeric(form.cheque_payment),
          bank_transfer: numeric(form.bank_transfer),
          bank_detail_id: needsBankAccount ? Number(form.bank_detail_id) : null,
          cheque,
        });
      } else {
        response = await api.post('/v1/customer-payments', {
          payment_date: form.payment_date,
          customer_code: form.customer_code,
          payment_note: form.payment_note || null,
          payment_amount: allocationTotal,
          cash_payment: numeric(form.cash_payment),
          card_payment: numeric(form.card_payment),
          cheque_payment: numeric(form.cheque_payment),
          bank_transfer: numeric(form.bank_transfer),
          bank_detail_id: needsBankAccount ? Number(form.bank_detail_id) : null,
          allocations: Object.entries(form.allocations)
            .filter(([, amount]) => numeric(amount) > 0)
            .map(([salesInvoiceNo, amount]) => ({
              sales_invoice_no: salesInvoiceNo,
              amount: numeric(amount),
            })),
          cheque,
        });
      }

      const completedType = modal;
      setModal(null);
      setOutstanding(null);
      await loadData();
      setNotice({
        type: 'success',
        message: (completedType === 'advance'
          ? 'Customer advance recorded successfully.'
          : 'Customer payment allocated successfully.') + smsNote(response.message),
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to post the customer transaction.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Customer Accounts"
        title="Payments & Advances"
        description="Allocate customer receipts to credit invoices and maintain advance balances that can be carried into future sales."
        icon={HandCoins}
        actions={
          canCreate ? (
            <>
              <button type="button" onClick={() => openModal('advance')} disabled={customers.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40">
                <BadgeDollarSign className="h-4 w-4" /> New Advance
              </button>
              <button type="button" onClick={() => openModal('payment')} disabled={customers.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:bg-slate-300">
                <Plus className="h-4 w-4" /> New Payment
              </button>
            </>
          ) : undefined
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Customer Receipts" value={formatCurrency(metrics.payments)} tone="emerald" />
        <OperationMetric label="Advances Received" value={formatCurrency(metrics.advances)} tone="indigo" />
        <OperationMetric label="Advance Available" value={formatCurrency(metrics.availableAdvance)} tone="amber" />
        <OperationMetric label="Invoice Allocations" value={metrics.allocations.toLocaleString()} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setTab('payments')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'payments' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Payments</button>
            <button type="button" onClick={() => setTab('advances')} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'advances' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Advances</button>
          </div>
          <div className="flex w-full gap-2 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or transaction" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-300" />
            </div>
            <button type="button" onClick={loadData} className="rounded-xl border border-slate-200 p-2.5 text-slate-500"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === 'payments' ? (
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3.5">Payment</th><th className="px-5 py-3.5">Customer</th><th className="px-5 py-3.5">Invoices</th><th className="px-5 py-3.5 text-right">Cash</th><th className="px-5 py-3.5 text-right">Other</th><th className="px-5 py-3.5 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <LoadingTableRow columns={6} label="Loading payments..." /> : visiblePayments.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">No customer payments found.</td></tr>
                ) : visiblePayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4"><div className="font-mono text-xs font-bold text-indigo-700">{payment.Payment_no}</div><div className="mt-1 text-xs text-slate-500">{displayDate(payment.Payment_date)}</div></td>
                    <td className="px-5 py-4"><div className="font-semibold">{payment.Customer_Name || payment.Customer_NIC}</div><div className="mt-1 text-xs text-slate-400">{payment.Customer_NIC}</div></td>
                    <td className="px-5 py-4"><div className="font-semibold">{payment.allocations.length} invoices</div><div className="mt-1 max-w-xs truncate text-xs text-slate-400">{payment.allocations.map((allocation) => allocation.sales_invoice_no).join(', ')}</div></td>
                    <td className="px-5 py-4 text-right">{formatCurrency(numeric(payment.cash_payment))}</td>
                    <td className="px-5 py-4 text-right">{formatCurrency(numeric(payment.card_payment) + numeric(payment.cheque_payment) + numeric(payment.bank_transfer))}</td>
                    <td className="px-5 py-4 text-right text-base font-bold">{formatCurrency(numeric(payment.Payment_Amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3.5">Advance</th><th className="px-5 py-3.5">Customer</th><th className="px-5 py-3.5 text-right">Received</th><th className="px-5 py-3.5 text-right">Available</th><th className="px-5 py-3.5">Usage</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? <LoadingTableRow columns={5} label="Loading advances..." /> : visibleAdvances.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-14 text-center text-slate-400">No customer advances found.</td></tr>
                ) : visibleAdvances.map((advance) => (
                  <tr key={advance.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4"><div className="font-mono text-xs font-bold text-indigo-700">{advance.payment_no}</div><div className="mt-1 text-xs text-slate-500">{displayDate(advance.payment_date)}</div></td>
                    <td className="px-5 py-4"><div className="font-semibold">{advance.customer_name || advance.customer_nic}</div><div className="mt-1 text-xs text-slate-400">{advance.customer_nic}</div></td>
                    <td className="px-5 py-4 text-right font-semibold">{formatCurrency(numeric(advance.amount))}</td>
                    <td className="px-5 py-4 text-right font-bold text-amber-700">{formatCurrency(numeric(advance.remaining_amount))}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {advance.allocations.length || advance.hp_allocations?.length
                        ? `${advance.allocations.length} sales / ${advance.hp_allocations?.length ?? 0} HP allocations`
                        : 'Not yet applied'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {modal && (
        <OperationModal
          title={modal === 'payment' ? 'New Customer Payment' : 'New Customer Advance'}
          description={modal === 'payment' ? 'Allocate the receipt against specific credit invoices.' : 'The balance becomes available at sales and HP checkout.'}
          onClose={() => !saving && setModal(null)}
          width="max-w-5xl"
        >
          <form onSubmit={submit} className="space-y-6 p-6">
            {notice?.type === 'error' && <OperationNotice type="error">{notice.message}</OperationNotice>}
            <div className="grid gap-4 md:grid-cols-3">
              <OperationField label="Date" required><input type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} className={inputClass} required /></OperationField>
              <OperationField label="Customer" required><SearchSelect value={form.customer_code} onChange={changeCustomer} options={customers.map((customer) => ({ value: customer.Code, label: `${customer.Code} - ${customer.name}`, keywords: customer.NIC }))} placeholder="Select customer" searchPlaceholder="Search customers..." className={inputClass} required /></OperationField>
              <OperationField label="Note"><input value={form.payment_note} onChange={(event) => setForm({ ...form, payment_note: event.target.value })} className={inputClass} /></OperationField>
            </div>

            {modal === 'advance' ? (
              <OperationField label="Advance Amount" required>
                <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => changeAdvanceAmount(event.target.value)} className={inputClass} required />
              </OperationField>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-bold">Customer Account Balance</h3><p className="mt-1 text-xs text-slate-500">Advance {formatCurrency(outstanding?.advance_balance ?? 0)} · Sales due {formatCurrency(outstanding?.sales_outstanding ?? 0)} · HP due {formatCurrency(outstanding?.hp_outstanding ?? 0)} · Net {formatCurrency(outstanding?.net_balance ?? 0)}</p></div>
                {loadingOutstanding ? (
                  <div className="flex justify-center gap-2 py-12 text-sm text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading invoices...</div>
                ) : !outstanding?.invoices.length ? (
                  <div className="space-y-2 py-12 text-center text-sm text-slate-400">
                    <p>No outstanding sales invoices for this customer.</p>
                    {(outstanding?.hp_outstanding ?? 0) > 0 && <p className="font-medium text-amber-600">HP balance is tracked through the Installments module: {formatCurrency(outstanding?.hp_outstanding ?? 0)}</p>}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3 text-right">Allocate</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {outstanding.invoices.map((invoice) => (
                          <tr key={invoice.invoice_no}>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">{invoice.invoice_no}</td>
                            <td className="px-4 py-3">{displayDate(invoice.invoice_date)}</td>
                            <td className="px-4 py-3 text-right font-bold text-amber-700">{formatCurrency(invoice.outstanding)}</td>
                            <td className="px-4 py-3"><input type="number" min="0" max={invoice.outstanding} step="0.01" value={form.allocations[invoice.invoice_no] ?? ''} onChange={(event) => updateAllocation(invoice.invoice_no, event.target.value)} className={`${inputClass} ml-auto max-w-40 text-right`} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
              <section className="rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold">Payment Methods</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <OperationField label="Cash"><input type="number" min="0" step="0.01" value={form.cash_payment} onChange={(event) => setForm({ ...form, cash_payment: event.target.value })} className={inputClass} /></OperationField>
                  <OperationField label="Card"><input type="number" min="0" step="0.01" value={form.card_payment} onChange={(event) => setForm({ ...form, card_payment: event.target.value })} className={inputClass} /></OperationField>
                  <OperationField label="Cheque"><input type="number" min="0" step="0.01" value={form.cheque_payment} onChange={(event) => setForm({ ...form, cheque_payment: event.target.value })} className={inputClass} /></OperationField>
                  <OperationField label="Bank Transfer"><input type="number" min="0" step="0.01" value={form.bank_transfer} onChange={(event) => setForm({ ...form, bank_transfer: event.target.value })} className={inputClass} /></OperationField>
                </div>
                {needsBankAccount && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <OperationField label="Internal Bank Account" required>
                      <SearchSelect value={form.bank_detail_id} onChange={(value) => setForm({ ...form, bank_detail_id: value })} options={bankAccounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className={inputClass} required />
                    </OperationField>
                    {bankAccounts.length === 0 && <OperationNotice type="error">Add an internal bank account before using card or bank transfer.</OperationNotice>}
                  </div>
                )}
                {numeric(form.cheque_payment) > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <ChequeEntryFields
                      banks={chequeBanks}
                      value={{ bank_id: form.cheque_bank_id, bank_branch_id: form.cheque_bank_branch_id, cheque_no: form.cheque_no, account_no: form.cheque_account_no, date: form.cheque_due_date }}
                      onChange={(cheque) => setForm({ ...form, cheque_bank_id: cheque.bank_id, cheque_bank_branch_id: cheque.bank_branch_id, cheque_no: cheque.cheque_no, cheque_account_no: cheque.account_no, cheque_due_date: cheque.date })}
                    />
                  </div>
                )}
              </section>
              <aside className="rounded-2xl bg-slate-950 p-5 text-white">
                <div className="text-xs uppercase tracking-wide text-slate-400">Balance Check</div>
                <CheckRow label={modal === 'advance' ? 'Advance' : 'Allocated'} value={formatCurrency(targetAmount)} />
                <CheckRow label="Methods" value={formatCurrency(methodTotal)} />
                <div className={`mt-5 rounded-xl px-3 py-2 text-xs font-semibold ${totalsMatch && targetAmount > 0 ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>
                  {totalsMatch && targetAmount > 0 ? 'Totals are balanced.' : 'Payment methods must match.'}
                </div>
              </aside>
            </div>

            <OperationActions saving={saving} submitLabel={modal === 'advance' ? 'Record Advance' : 'Post Payment'} onCancel={() => setModal(null)} disabled={!form.customer_code || targetAmount <= 0 || !totalsMatch || (needsBankAccount && !form.bank_detail_id)} />
          </form>
        </OperationModal>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function CheckRow({ label, value }: { label: string; value: string }) {
  return <div className="mt-3 flex justify-between gap-4"><span className="text-sm text-slate-400">{label}</span><span className="font-bold">{value}</span></div>;
}
