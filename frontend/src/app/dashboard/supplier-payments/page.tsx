'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HandCoins,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  WandSparkles,
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
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/inventory';
import {
  dateInputValue,
  displayDate,
  numeric,
  SupplierOption,
  SupplierOutstanding,
  SupplierPayment,
} from '@/lib/purchases';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import type { ChequeBank, PaymentBankAccount, PaymentOptions } from '@/lib/payment-options';
import { SearchSelect } from '@/components/search-select';

interface PaymentForm {
  payment_date: string;
  supplier_code: string;
  payment_note: string;
  cash_payment: string;
  card_payment: string;
  cheque_payment: string;
  bank_transfer: string;
  bank_detail_id: string;
  cheque_bank_id: string;
  cheque_bank_branch_id: string;
  cheque_no: string;
  cheque_account_no: string;
  cheque_release_date: string;
  allocations: Record<string, string>;
}

function blankPaymentForm(): PaymentForm {
  return {
    payment_date: dateInputValue(),
    supplier_code: '',
    payment_note: '',
    cash_payment: '0',
    card_payment: '0',
    cheque_payment: '0',
    bank_transfer: '0',
    bank_detail_id: '',
    cheque_bank_id: '',
    cheque_bank_branch_id: '',
    cheque_no: '',
    cheque_account_no: '',
    cheque_release_date: '',
    allocations: {},
  };
}

export default function SupplierPaymentsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('purchases', 'can_read');
  const canCreate = hasPermission('purchases', 'can_create');

  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [chequeBanks, setChequeBanks] = useState<ChequeBank[]>([]);
  const [bankAccounts, setBankAccounts] = useState<PaymentBankAccount[]>([]);
  const [outstanding, setOutstanding] = useState<SupplierOutstanding | null>(null);
  const [form, setForm] = useState<PaymentForm>(blankPaymentForm);
  const [showForm, setShowForm] = useState(false);
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
      const [paymentResponse, supplierResponse, paymentOptionResponse] = await Promise.all([
        api.getAll<SupplierPayment>('/v1/supplier-payments'),
        api.getAll<SupplierOption>('/v1/suppliers'),
        api.get<PaymentOptions>('/v1/payment-options'),
      ]);
      setPayments(paymentResponse.data ?? []);
      setSuppliers(supplierResponse.data ?? []);
      setChequeBanks(paymentOptionResponse.data?.cheque_banks ?? []);
      setBankAccounts(paymentOptionResponse.data?.bank_accounts ?? []);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load supplier payments.'),
      });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const loadOutstanding = useCallback(async (supplierCode: string) => {
    if (!supplierCode) {
      setOutstanding(null);
      return;
    }

    setLoadingOutstanding(true);
    try {
      const response = await api.get<SupplierOutstanding>(
        `/v1/supplier-payments/outstanding?supplier_code=${encodeURIComponent(supplierCode)}`
      );
      setOutstanding(response.data ?? null);
    } catch (error) {
      setOutstanding(null);
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load supplier outstanding invoices.'),
      });
    } finally {
      setLoadingOutstanding(false);
    }
  }, []);

  const filteredPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return payments;
    return payments.filter(
      (payment) =>
        payment.Payment_no.toLowerCase().includes(term)
        || payment.Supplier_Code.toLowerCase().includes(term)
        || payment.Supplier_Name?.toLowerCase().includes(term)
    );
  }, [payments, search]);

  const metrics = useMemo(() => ({
    payments: payments.length,
    total: payments.reduce((sum, payment) => sum + numeric(payment.Payment_Amount), 0),
    cash: payments.reduce((sum, payment) => sum + numeric(payment.cash_payment), 0),
    nonCash: payments.reduce(
      (sum, payment) =>
        sum
        + numeric(payment.card_payment)
        + numeric(payment.cheque_payment)
        + numeric(payment.bank_transfer),
      0
    ),
  }), [payments]);

  const allocationTotal = useMemo(
    () => Object.values(form.allocations).reduce((sum, amount) => sum + numeric(amount), 0),
    [form.allocations]
  );
  const methodTotal =
    numeric(form.cash_payment)
    + numeric(form.card_payment)
    + numeric(form.cheque_payment)
    + numeric(form.bank_transfer);
  const needsBankAccount =
    numeric(form.card_payment) > 0 || numeric(form.bank_transfer) > 0;
  const totalsMatch = Math.abs(allocationTotal - methodTotal) < 0.01;

  if (!canRead) {
    return (
      <OperationNotice type="error">
        You do not have permission to view supplier payments.
      </OperationNotice>
    );
  }

  const openCreate = () => {
    setForm(blankPaymentForm());
    setNotice(null);
    setShowForm(true);
    setOutstanding(null);
  };

  const changeSupplier = (supplierCode: string) => {
    setForm({
      ...blankPaymentForm(),
      supplier_code: supplierCode,
      payment_date: form.payment_date,
    });
    setNotice(null);
    void loadOutstanding(supplierCode);
  };

  const updateAllocation = (invoiceNo: string, value: string) => {
    const nextAllocations = {
      ...form.allocations,
      [invoiceNo]: value,
    };
    const nextTotal = Object.values(nextAllocations).reduce(
      (sum, amount) => sum + numeric(amount),
      0
    );
    const onlyCashMethod =
      numeric(form.card_payment) === 0
      && numeric(form.cheque_payment) === 0
      && numeric(form.bank_transfer) === 0;

    setForm((current) => ({
      ...current,
      allocations: nextAllocations,
      cash_payment: onlyCashMethod ? String(nextTotal) : current.cash_payment,
    }));
  };

  const allocateAll = () => {
    if (!outstanding) return;
    const allocations = Object.fromEntries(
      outstanding.invoices.map((invoice) => [
        invoice.invoice_no,
        String(invoice.outstanding),
      ])
    );
    setForm((current) => ({
      ...current,
      allocations,
      cash_payment: String(outstanding.total_outstanding),
      card_payment: '0',
      cheque_payment: '0',
      bank_transfer: '0',
    }));
  };

  const submitPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const allocations = Object.entries(form.allocations)
        .filter(([, amount]) => numeric(amount) > 0)
        .map(([purchaseInvoiceNo, amount]) => ({
          purchase_invoice_no: purchaseInvoiceNo,
          amount: numeric(amount),
        }));

      await api.post('/v1/supplier-payments', {
        payment_date: form.payment_date,
        supplier_code: form.supplier_code,
        payment_note: form.payment_note || null,
        payment_amount: allocationTotal,
        cash_payment: numeric(form.cash_payment),
        card_payment: numeric(form.card_payment),
        cheque_payment: numeric(form.cheque_payment),
        bank_transfer: numeric(form.bank_transfer),
        bank_detail_id: needsBankAccount ? Number(form.bank_detail_id) : null,
        allocations,
        cheque: numeric(form.cheque_payment) > 0
          ? {
              bank_id: Number(form.cheque_bank_id),
              bank_branch_id: Number(form.cheque_bank_branch_id),
              cheque_no: form.cheque_no,
              account_no: form.cheque_account_no,
              release_date: form.cheque_release_date,
            }
          : null,
      });

      setShowForm(false);
      setOutstanding(null);
      await loadData();
      setNotice({
        type: 'success',
        message: 'Supplier payment posted and allocated successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to post the supplier payment.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Accounts Payable"
        title="Supplier Payments"
        description="Select outstanding purchase invoices, allocate a settlement, and reconcile payment methods before posting."
        icon={HandCoins}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              disabled={suppliers.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" />
              New Supplier Payment
            </button>
          ) : undefined
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      {suppliers.length === 0 && !loading && (
        <OperationNotice type="error">
          Create a supplier before recording supplier payments.
        </OperationNotice>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Payments Posted" value={metrics.payments.toLocaleString()} tone="indigo" />
        <OperationMetric label="Total Settled" value={formatCurrency(metrics.total)} tone="emerald" />
        <OperationMetric label="Cash Settled" value={formatCurrency(metrics.cash)} />
        <OperationMetric label="Non-Cash Settled" value={formatCurrency(metrics.nonCash)} tone="amber" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payment number or supplier"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="self-start rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Payment</th>
                <th className="px-5 py-3.5">Supplier</th>
                <th className="px-5 py-3.5">Allocations</th>
                <th className="px-5 py-3.5 text-right">Cash</th>
                <th className="px-5 py-3.5 text-right">Other Methods</th>
                <th className="px-5 py-3.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={6} label="Loading supplier payments..." />
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    No supplier payments found.
                  </td>
                </tr>
              ) : filteredPayments.map((payment) => {
                const otherMethods =
                  numeric(payment.card_payment)
                  + numeric(payment.cheque_payment)
                  + numeric(payment.bank_transfer);

                return (
                  <tr key={payment.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs font-bold text-indigo-700">{payment.Payment_no}</div>
                      <div className="mt-1 text-xs text-slate-500">{displayDate(payment.Payment_date)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {payment.supplier?.name ?? payment.Supplier_Name ?? payment.Supplier_Code}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-400">{payment.Supplier_Code}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800">{payment.allocations.length} invoices</div>
                      <div className="mt-1 max-w-xs truncate text-xs text-slate-400">
                        {payment.allocations.map((allocation) => allocation.purchase_invoice_no).join(', ')}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-700">
                      {formatCurrency(numeric(payment.cash_payment))}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-700">
                      {formatCurrency(otherMethods)}
                    </td>
                    <td className="px-5 py-4 text-right text-base font-bold text-slate-950">
                      {formatCurrency(numeric(payment.Payment_Amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <OperationModal
          title="New Supplier Payment"
          description="The allocation total and payment-method total must match exactly."
          onClose={() => !saving && setShowForm(false)}
          width="max-w-6xl"
        >
          <form onSubmit={submitPayment} className="space-y-6 p-6">
            {notice?.type === 'error' && (
              <OperationNotice type="error">{notice.message}</OperationNotice>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OperationField label="Payment Date" required>
                <input
                  type="date"
                  value={form.payment_date}
                  onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
                  className={inputClass}
                  required
                />
              </OperationField>
              <OperationField label="Supplier" required className="xl:col-span-2">
                <SearchSelect
                  value={form.supplier_code}
                  onChange={changeSupplier}
                  options={suppliers.map((supplier) => ({ value: supplier.Code, label: `${supplier.Code} - ${supplier.name}` }))}
                  placeholder="Select supplier"
                  searchPlaceholder="Search suppliers..."
                  className={inputClass}
                  required
                />
              </OperationField>
              <OperationField label="Payment Note">
                <input
                  value={form.payment_note}
                  onChange={(event) => setForm({ ...form, payment_note: event.target.value })}
                  className={inputClass}
                  placeholder="Optional reference"
                />
              </OperationField>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Invoice Allocation</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Allocate only against invoices that still have a supplier balance.
                  </p>
                </div>
                {outstanding && outstanding.invoices.length > 0 && (
                  <button
                    type="button"
                    onClick={allocateAll}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-slate-200 transition hover:bg-indigo-50"
                  >
                    <WandSparkles className="h-3.5 w-3.5" />
                    Allocate All
                  </button>
                )}
              </div>

              {loadingOutstanding ? (
                <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400">
                  <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />
                  Loading outstanding invoices...
                </div>
              ) : !form.supplier_code ? (
                <div className="py-14 text-center text-sm text-slate-400">
                  Select a supplier to load outstanding invoices.
                </div>
              ) : !outstanding || outstanding.invoices.length === 0 ? (
                <div className="py-14 text-center text-sm text-slate-400">
                  This supplier has no outstanding purchase invoices.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Invoice</th>
                        <th className="px-4 py-3">Date / Reference</th>
                        <th className="px-4 py-3 text-right">Net</th>
                        <th className="px-4 py-3 text-right">Outstanding</th>
                        <th className="px-4 py-3 text-right">Allocate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {outstanding.invoices.map((invoice) => (
                        <tr key={invoice.invoice_no}>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">
                            {invoice.invoice_no}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-700">{displayDate(invoice.invoice_date)}</div>
                            <div className="mt-1 text-xs text-slate-400">{invoice.reference_no || 'No supplier reference'}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-700">
                            {formatCurrency(invoice.net_amount)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-amber-700">
                            {formatCurrency(invoice.outstanding)}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              max={invoice.outstanding}
                              step="0.01"
                              value={form.allocations[invoice.invoice_no] ?? ''}
                              onChange={(event) => updateAllocation(invoice.invoice_no, event.target.value)}
                              className={`${inputClass} ml-auto max-w-40 text-right`}
                              placeholder="0.00"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-4 text-right text-sm font-semibold text-slate-500">
                          Allocation Total
                        </td>
                        <td className="px-4 py-4 text-right text-xs text-slate-500">
                          Supplier total: {formatCurrency(outstanding.total_outstanding)}
                        </td>
                        <td className="px-4 py-4 text-right text-lg font-bold text-slate-950">
                          {formatCurrency(allocationTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">Payment Methods</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Split the allocated amount across cash, card, cheque, and bank transfer.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <OperationField label="Cash">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cash_payment}
                      onChange={(event) => setForm({ ...form, cash_payment: event.target.value })}
                      className={inputClass}
                    />
                  </OperationField>
                  <OperationField label="Card">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.card_payment}
                      onChange={(event) => setForm({ ...form, card_payment: event.target.value })}
                      className={inputClass}
                    />
                  </OperationField>
                  <OperationField label="Cheque">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cheque_payment}
                      onChange={(event) => setForm({ ...form, cheque_payment: event.target.value })}
                      className={inputClass}
                    />
                  </OperationField>
                  <OperationField label="Bank Transfer">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.bank_transfer}
                      onChange={(event) => setForm({ ...form, bank_transfer: event.target.value })}
                      className={inputClass}
                    />
                  </OperationField>
                </div>

                {needsBankAccount && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <OperationField label="Internal Bank Account" required>
                      <SearchSelect
                        value={form.bank_detail_id}
                        onChange={(value) => setForm({ ...form, bank_detail_id: value })}
                        options={bankAccounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))}
                        placeholder="Select account"
                        searchPlaceholder="Search bank accounts..."
                        className={inputClass}
                        required
                      />
                    </OperationField>
                    {bankAccounts.length === 0 && (
                      <OperationNotice type="error">
                        Add an internal bank account before using card or bank transfer.
                      </OperationNotice>
                    )}
                  </div>
                )}

                {numeric(form.cheque_payment) > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <ChequeEntryFields
                      banks={chequeBanks}
                      dateLabel="Release Date"
                      value={{ bank_id: form.cheque_bank_id, bank_branch_id: form.cheque_bank_branch_id, cheque_no: form.cheque_no, account_no: form.cheque_account_no, date: form.cheque_release_date }}
                      onChange={(cheque) => setForm({ ...form, cheque_bank_id: cheque.bank_id, cheque_bank_branch_id: cheque.bank_branch_id, cheque_no: cheque.cheque_no, cheque_account_no: cheque.account_no, cheque_release_date: cheque.date })}
                    />
                  </div>
                )}
              </section>

              <aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Payment Check
                </div>
                <PaymentSummaryRow label="Allocated" value={formatCurrency(allocationTotal)} emphasis />
                <PaymentSummaryRow label="Methods Total" value={formatCurrency(methodTotal)} />
                <div className="mt-4 border-t border-white/10 pt-4">
                  <PaymentSummaryRow
                    label="Difference"
                    value={formatCurrency(Math.abs(allocationTotal - methodTotal))}
                    emphasis
                  />
                </div>
                <div
                  className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${
                    totalsMatch && allocationTotal > 0
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : 'bg-amber-500/15 text-amber-200'
                  }`}
                >
                  {totalsMatch && allocationTotal > 0
                    ? 'Ready to post. Totals are balanced.'
                    : 'Allocation and payment methods must match.'}
                </div>
              </aside>
            </div>

            <OperationActions
              saving={saving}
              submitLabel="Post Supplier Payment"
              onCancel={() => setShowForm(false)}
              disabled={
                !form.supplier_code
                || allocationTotal <= 0
                || !totalsMatch
                || (needsBankAccount && !form.bank_detail_id)
              }
            />
          </form>
        </OperationModal>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function PaymentSummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <span className={emphasis ? 'font-semibold text-white' : 'text-sm text-slate-400'}>{label}</span>
      <span className={emphasis ? 'text-lg font-bold text-white' : 'text-sm font-semibold text-slate-200'}>
        {value}
      </span>
    </div>
  );
}
