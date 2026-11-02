'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Barcode,
  Boxes,
  Calculator,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  Hash,
  Landmark,
  Layers,
  MapPin,
  Package,
  Percent,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
  StatusPill,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { parseSerialNumbers, type StockItem } from '@/lib/inventory';
import { findItemByScan } from '@/lib/barcode';
import { ScanInput } from '@/components/scan-input';
import {
  type HpAgreement,
  type HpCalculation,
  type HpOptions,
  type HpSummary,
  money,
  shortDate,
  today,
} from '@/lib/hp';
import { useAuth } from '@/lib/auth-context';
import { smsNote } from '@/lib/sms';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';
import { MobileInput } from '@/components/mobile-input';
import { SearchSelect } from '@/components/search-select';
import { StockQtyInput } from '@/components/stock-qty-input';
import {
  Badge,
  DiscountInput,
  Field,
  fieldClass,
  FormSection,
  IconSlot,
  iconInputClass,
  LineField,
  lineGridClass,
  LineHeader,
  LineNumber,
  MoneyInput,
  StickyFormFooter,
  SummaryCard,
  SummaryHighlight,
  SummaryRow,
} from '@/components/invoice-form-ui';

type LineForm = {
  item_code: string;
  qty: string;
  unit_price: string;
  discount: string;
  discount_type: 'amount' | 'percent';
  batch_no: string;
  serial_numbers: string;
};

type OpeningLineForm = {
  item_code: string;
  qty: string;
  unit_price: string;
  net_value: string;
  batch_no: string;
  serial_numbers: string;
};

type OpeningInstallmentForm = {
  instalment_no: string;
  instalment_date: string;
  base_amount: string;
  amount_pay: string;
  balance_amount: string;
};

type AgreementForm = {
  invoice_date: string;
  reference_no: string;
  customer_code: string;
  guarantor_1_code: string;
  guarantor_2_code: string;
  schema_type: string;
  store_id: string;
  down_payment: string;
  advance_amount: string;
  down_payment_method: string;
  bank_detail_id: string;
  transport: string;
  discount: string;
  discount_type: 'amount' | 'percent';
  instalment_due_date: string;
  cheque_bank_id: string;
  cheque_bank_branch_id: string;
  cheque_no: string;
  cheque_account: string;
  cheque_due_date: string;
};

type OpeningAgreementForm = {
  invoice_date: string;
  reference_no: string;
  opening_reference_no: string;
  customer_code: string;
  guarantor_1_code: string;
  guarantor_2_code: string;
  schema_type: string;
  store_id: string;
  opening_note: string;
};

type PersonQuickAddTarget = 'customer' | 'guarantor';

type PersonQuickAddForm = {
  name: string;
  NIC: string;
  phone: string;
  address: string;
};

const emptyForm = (): AgreementForm => ({
  invoice_date: today(),
  reference_no: '',
  customer_code: '',
  guarantor_1_code: '',
  guarantor_2_code: '',
  schema_type: '',
  store_id: '',
  down_payment: '0',
  advance_amount: '0',
  down_payment_method: 'cash',
  bank_detail_id: '',
  transport: '0',
  discount: '0',
  discount_type: 'amount',
  instalment_due_date: '1',
  cheque_bank_id: '',
  cheque_bank_branch_id: '',
  cheque_no: '',
  cheque_account: '',
  cheque_due_date: today(),
});

const emptyLine = (): LineForm => ({
  item_code: '',
  qty: '1',
  unit_price: '',
  discount: '0',
  discount_type: 'amount',
  batch_no: '',
  serial_numbers: '',
});

const emptyOpeningLine = (): OpeningLineForm => ({
  item_code: '',
  qty: '1',
  unit_price: '',
  net_value: '',
  batch_no: '',
  serial_numbers: '',
});

const emptyOpeningInstallment = (index = 0): OpeningInstallmentForm => ({
  instalment_no: String(index + 1),
  instalment_date: today(),
  base_amount: '0',
  amount_pay: '0',
  balance_amount: '0',
});

const emptyOpeningForm = (): OpeningAgreementForm => ({
  invoice_date: today(),
  reference_no: '',
  opening_reference_no: '',
  customer_code: '',
  guarantor_1_code: '',
  guarantor_2_code: '',
  schema_type: '',
  store_id: '',
  opening_note: '',
});

const emptyPersonQuickAdd = (): PersonQuickAddForm => ({
  name: '',
  NIC: '',
  phone: '',
  address: '',
});

type ScanOutcome = { type: 'success' | 'error'; message: string };

/**
 * Applies one scanned item to the draft agreement lines (never posts, never moves stock):
 * adds 1 to a line of the same item/batch whose price and discount were not changed by hand,
 * otherwise starts a line on the first batch that still has stock left in the issue store.
 */
function applyHpScan(lines: LineForm[], item: StockItem, storeId: number): { lines: LineForm[]; outcome: ScanOutcome } {
  const label = `${item.item_code} - ${item.item_description}`;
  const serialHint = item.is_serialized ? ' Select the serial number for the new unit.' : '';

  if (!storeId) {
    return { lines, outcome: { type: 'error', message: 'Select the issue store before scanning items.' } };
  }

  const storeStock = item.stores.find((stock) => stock.store_id === storeId)?.qty_in_hand ?? 0;
  if (storeStock <= 0) {
    return { lines, outcome: { type: 'error', message: `${label} is out of stock in this store.` } };
  }

  const batches = item.batches.filter((batch) => batch.store_id === storeId && batch.qty_in_hand > 0);
  const remaining = (batchNo: string) => {
    const onHand = item.is_batch
      ? batches.find((batch) => batch.batch_no === batchNo)?.qty_in_hand ?? 0
      : storeStock;
    const used = lines
      .filter((line) => line.item_code === item.item_code && (!item.is_batch || line.batch_no === batchNo))
      .reduce((sum, line) => sum + Number(line.qty || 0), 0);

    return onHand - used;
  };

  const mergeIndex = lines.findIndex((line) =>
    line.item_code === item.item_code
    && line.unit_price === ''
    && Number(line.discount || 0) <= 0
    && (!item.is_batch || line.batch_no !== '')
    && remaining(line.batch_no) > 0
  );

  if (mergeIndex >= 0) {
    const qty = Number(lines[mergeIndex].qty || 0) + 1;
    return {
      lines: lines.map((line, index) => (index === mergeIndex ? { ...line, qty: String(qty) } : line)),
      outcome: { type: 'success', message: `${label}: quantity is now ${qty}.${serialHint}` },
    };
  }

  const batchNo = item.is_batch
    ? batches.find((batch) => remaining(batch.batch_no) > 0)?.batch_no
    : remaining('') > 0 ? '' : undefined;

  if (batchNo === undefined) {
    return { lines, outcome: { type: 'error', message: `No more stock of ${label} left in this store for this agreement.` } };
  }

  const blankIndex = lines.findIndex((line) => !line.item_code);
  const base = blankIndex >= 0 ? lines[blankIndex] : emptyLine();
  const newLine: LineForm = { ...base, item_code: item.item_code, batch_no: batchNo, unit_price: '', serial_numbers: '', qty: '1' };

  return {
    lines: blankIndex >= 0
      ? lines.map((line, index) => (index === blankIndex ? newLine : line))
      : [...lines, newLine],
    outcome: {
      type: 'success',
      message: `${label} added${item.is_batch ? ` from batch ${batchNo}` : ''}.${serialHint}`,
    },
  };
}

function serialSelections(value: string, qty: string): string[] {
  const count = Math.max(0, Number(qty || 0));
  const selected = parseSerialNumbers(value);

  return Array.from({ length: count }, (_, index) => selected[index] || '');
}

function updateSerialSelection(value: string, qty: string, index: number, serialNo: string): string {
  const selected = serialSelections(value, qty);
  selected[index] = serialNo;

  return selected.filter(Boolean).join('\n');
}

function discountAmount(baseAmount: number, value: string, type: 'amount' | 'percent'): number {
  const discountValue = Number(value || 0);

  if (discountValue <= 0) return 0;
  if (type === 'percent') {
    return Math.min(baseAmount, (baseAmount * discountValue) / 100);
  }

  return Math.min(baseAmount, discountValue);
}

export default function HirePurchasePage() {
  const { hasPermission } = useAuth();
  const [agreements, setAgreements] = useState<HpAgreement[]>([]);
  const [options, setOptions] = useState<HpOptions | null>(null);
  const [summary, setSummary] = useState<HpSummary | null>(null);
  const [selected, setSelected] = useState<HpAgreement | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [action, setAction] = useState<'convert' | 'return' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (status) query.set('status', status);
      const listPath = query.toString() ? `/v1/hp?${query}` : '/v1/hp';
      const [list, optionResponse, summaryResponse] = await Promise.all([
        api.getAll<HpAgreement>(listPath),
        api.get<HpOptions>('/v1/hp/options'),
        api.get<HpSummary>('/v1/hp/summary'),
      ]);
      setAgreements(list.data || []);
      setOptions(optionResponse.data || null);
      setSummary(summaryResponse.data || null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error, 'Unable to load hire purchase agreements.') });
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openAgreement(id: number) {
    try {
      const response = await api.get<HpAgreement>(`/v1/hp/${id}`);
      setSelected(response.data || null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    }
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Credit Operations"
        title="Hire Purchase Agreements"
        description="Create stock-backed contracts, import opening agreements, review repayment schedules, manage returns, and settle agreements through pay-at-once."
        icon={ScrollText}
        actions={
          hasPermission('hire-purchase', 'can_create') ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOpeningOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                <Plus className="h-4 w-4" /> Opening HP
              </button>
              <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700">
                <Plus className="h-4 w-4" /> New agreement
              </button>
            </div>
          ) : null
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Active agreements" value={String(summary?.active_agreements || 0)} tone="indigo" />
        <OperationMetric label="Outstanding" value={money(summary?.total_outstanding)} tone="amber" />
        <OperationMetric label="Collected" value={money(summary?.total_collected)} tone="emerald" />
        <OperationMetric label="Overdue installments" value={String(summary?.overdue_installments || 0)} tone={summary?.overdue_installments ? 'rose' : 'slate'} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agreement, customer or NIC" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="converted">Converted</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <div className="content-scrollbar overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Agreement</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Contract</th>
                <th className="px-5 py-3">Outstanding</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={6} label="Loading agreements..." />
              ) : agreements.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">No agreements match this view.</td></tr>
              ) : agreements.map((agreement) => (
                <tr key={agreement.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">{agreement.agreement_no}</div>
                    <div className="text-xs text-slate-500">{shortDate(agreement.invoice_date)} · {agreement.schema_type}</div>
                  </td>
                  <td className="px-5 py-4"><div className="font-medium text-slate-800">{agreement.customer_name}</div><div className="text-xs text-slate-500">{agreement.customer_nic}</div></td>
                  <td className="px-5 py-4 font-medium">{money(agreement.contract_amount)}</td>
                  <td className="px-5 py-4 font-semibold text-amber-700">{money(agreement.outstanding_amount)}</td>
                  <td className="px-5 py-4"><StatusPill status={agreement.status} /></td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => openAgreement(agreement.id)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Eye className="h-4 w-4" /> View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen && options && (
        <AgreementModal
          options={options}
          onClose={() => setCreateOpen(false)}
          onCreated={(agreement, message) => {
            setCreateOpen(false);
            setSelected(agreement);
            setNotice({ type: 'success', text: `Agreement ${agreement.agreement_no} created.${smsNote(message)}` });
            load();
          }}
        />
      )}

      {openingOpen && options && (
        <OpeningAgreementModal
          options={options}
          onClose={() => setOpeningOpen(false)}
          onCreated={(agreement) => {
            setOpeningOpen(false);
            setSelected(agreement);
            setNotice({ type: 'success', text: `Opening HP ${agreement.agreement_no} created.` });
            load();
          }}
        />
      )}

      {selected && (
        <AgreementDetail
          agreement={selected}
          canUpdate={hasPermission('hire-purchase', 'can_update')}
          onClose={() => setSelected(null)}
          onAction={setAction}
        />
      )}

      {selected && action && options && (
        <AgreementActionModal
          agreement={selected}
          action={action}
          options={options}
          onClose={() => setAction(null)}
          onSaved={(agreement, message) => {
            setAction(null);
            setSelected(agreement);
            setNotice({ type: 'success', text: action === 'convert' ? `Agreement paid at once.${smsNote(message)}` : 'Agreement return posted.' });
            load();
          }}
        />
      )}
    </div>
  );
}

function OpeningAgreementModal({ options, onClose, onCreated }: { options: HpOptions; onClose: () => void; onCreated: (agreement: HpAgreement) => void }) {
  const [form, setForm] = useState(emptyOpeningForm);
  const [lines, setLines] = useState<OpeningLineForm[]>([emptyOpeningLine()]);
  const [installments, setInstallments] = useState<OpeningInstallmentForm[]>([
    emptyOpeningInstallment(0),
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemTotal = lines.reduce((total, line) => total + Number(line.net_value || 0), 0);
  const contractTotal = installments.reduce((total, row) => total + Number(row.base_amount || 0), 0);
  const paidTotal = installments.reduce((total, row) => total + Number(row.amount_pay || 0), 0);
  const balanceTotal = installments.reduce((total, row) => total + Number(row.balance_amount || 0), 0);
  const installmentRowsValid = installments.every((row) => {
    const base = Number(row.base_amount || 0);
    const paid = Number(row.amount_pay || 0);
    const balance = Number(row.balance_amount || 0);
    return base > 0 && Math.abs(base - paid - balance) < 0.01;
  });

  function updateLine(index: number, patch: Partial<OpeningLineForm>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function updateInstallment(index: number, patch: Partial<OpeningInstallmentForm>) {
    setInstallments((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function updateInstallmentAmount(index: number, field: 'base_amount' | 'amount_pay' | 'balance_amount', value: string) {
    setInstallments((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [field]: value };
      if (field === 'base_amount' || field === 'amount_pay') {
        next.balance_amount = String(Math.max(0, Number(next.base_amount || 0) - Number(next.amount_pay || 0)));
      }
      return next;
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await api.post<HpAgreement>('/v1/hp/opening', {
        invoice_date: form.invoice_date,
        reference_no: form.reference_no || null,
        opening_reference_no: form.opening_reference_no || null,
        opening_note: form.opening_note || null,
        customer_code: form.customer_code,
        guarantor_1_code: form.guarantor_1_code || null,
        guarantor_2_code: form.guarantor_2_code || null,
        schema_type: form.schema_type,
        store_id: Number(form.store_id),
        items: lines.map((line) => ({
          item_code: line.item_code,
          qty: Number(line.qty),
          unit_price: Number(line.unit_price || 0),
          net_value: Number(line.net_value || 0),
          batch_no: line.batch_no || null,
          serial_numbers: parseSerialNumbers(line.serial_numbers),
        })),
        installments: installments.map((row) => ({
          instalment_no: Number(row.instalment_no),
          instalment_date: row.instalment_date,
          base_amount: Number(row.base_amount || 0),
          amount_pay: Number(row.amount_pay || 0),
          balance_amount: Number(row.balance_amount || 0),
        })),
      });
      if (response.data) onCreated(response.data);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OperationModal
      title="Opening hire purchase"
      description="Import an existing ongoing agreement with its current installment history. No stock is dispatched."
      onClose={onClose}
      width="max-w-6xl"
    >
      <form onSubmit={submit} className="space-y-6 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <OperationField label="Opening date" required><input type="date" value={form.invoice_date} onChange={(event) => setForm({ ...form, invoice_date: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
          <OperationField label="Old agreement no."><input value={form.opening_reference_no} onChange={(event) => setForm({ ...form, opening_reference_no: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Legacy/reference number" /></OperationField>
          <OperationField label="Customer" required><SearchSelect value={form.customer_code} onChange={(value) => setForm({ ...form, customer_code: value })} options={options.customers.map((customer) => ({ value: customer.Code, label: customer.name, description: customer.NIC }))} placeholder="Select customer" searchPlaceholder="Search by name or NIC..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
          <OperationField label="Scheme" required><SearchSelect value={form.schema_type} onChange={(value) => setForm({ ...form, schema_type: value })} options={options.schemas.map((schema) => ({ value: schema.SchemaType, label: schema.SchemaType }))} placeholder="Select scheme" searchPlaceholder="Search schemes..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
          <OperationField label="Primary guarantor"><SearchSelect value={form.guarantor_1_code} onChange={(value) => setForm({ ...form, guarantor_1_code: value })} options={options.guarantors.map((guarantor) => ({ value: guarantor.Code, label: guarantor.name, description: guarantor.NIC }))} title="Select primary guarantor" emptyOption="No guarantor" searchPlaceholder="Search by name or NIC..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
          <OperationField label="Second guarantor"><SearchSelect value={form.guarantor_2_code} onChange={(value) => setForm({ ...form, guarantor_2_code: value })} options={options.guarantors.filter((g) => g.Code !== form.guarantor_1_code).map((guarantor) => ({ value: guarantor.Code, label: guarantor.name, description: guarantor.NIC }))} title="Select second guarantor" emptyOption="No second guarantor" searchPlaceholder="Search by name or NIC..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
          <OperationField label="Store" required><SearchSelect value={form.store_id} onChange={(value) => setForm({ ...form, store_id: value })} options={options.stores.map((store) => ({ value: String(store.id), label: store.name }))} placeholder="Select store" searchPlaceholder="Search stores..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
          <OperationField label="Reference"><input value={form.reference_no} onChange={(event) => setForm({ ...form, reference_no: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
        </div>

        <section className="rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h3 className="font-bold text-slate-900">Existing agreement items</h3><p className="text-xs text-slate-500">Use item master records for reporting; this does not affect stock.</p></div><button type="button" onClick={() => setLines([...lines, emptyOpeningLine()])} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold"><Plus className="h-3.5 w-3.5" /> Add item</button></div>
          <div className="space-y-3 p-4">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-12">
                <OperationField label="Item" required className="xl:col-span-4"><SearchSelect value={line.item_code} onChange={(value) => { const item = options.items.find((candidate) => candidate.item_code === value); const unitPrice = String(item?.standard_sales_price || ''); updateLine(index, { item_code: value, unit_price: unitPrice, net_value: String(Number(unitPrice || 0) * Number(line.qty || 1)) }); }} options={options.items.map((item) => ({ value: item.item_code, label: `${item.item_code} - ${item.item_description}` }))} placeholder="Select item" searchPlaceholder="Search by code or description..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Qty" required className="xl:col-span-2"><input type="number" min="1" value={line.qty} onChange={(event) => updateLine(index, { qty: event.target.value, net_value: String(Number(line.unit_price || 0) * Number(event.target.value || 0)) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Unit price" required className="xl:col-span-2"><input type="number" min="0.01" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: event.target.value, net_value: String(Number(event.target.value || 0) * Number(line.qty || 0)) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Line value" required className="xl:col-span-2"><input type="number" min="0.01" value={line.net_value} onChange={(event) => updateLine(index, { net_value: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Serials / batch" className="xl:col-span-2"><input value={line.serial_numbers} onChange={(event) => updateLine(index, { serial_numbers: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" placeholder="Serials separated by comma" /></OperationField>
                {lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))} className="justify-self-start rounded-xl p-2.5 text-rose-600 hover:bg-rose-50 xl:col-span-12"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><h3 className="font-bold text-slate-900">Installment history</h3><p className="text-xs text-slate-500">Enter every installment separately. Paid + balance must equal installment amount.</p></div><button type="button" onClick={() => setInstallments([...installments, emptyOpeningInstallment(installments.length)])} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold"><Plus className="h-3.5 w-3.5" /> Add installment</button></div>
          <div className="space-y-3 p-4">
            {installments.map((row, index) => (
              <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-12">
                <OperationField label="No." required className="xl:col-span-1"><input type="number" min="1" value={row.instalment_no} onChange={(event) => updateInstallment(index, { instalment_no: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Due date" required className="xl:col-span-3"><input type="date" value={row.instalment_date} onChange={(event) => updateInstallment(index, { instalment_date: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Installment amount" required className="xl:col-span-3"><input type="number" min="0.01" value={row.base_amount} onChange={(event) => updateInstallmentAmount(index, 'base_amount', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Already paid" className="xl:col-span-2"><input type="number" min="0" value={row.amount_pay} onChange={(event) => updateInstallmentAmount(index, 'amount_pay', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                <OperationField label="Balance" required className="xl:col-span-2"><input type="number" min="0" value={row.balance_amount} onChange={(event) => updateInstallmentAmount(index, 'balance_amount', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
                {installments.length > 1 && <button type="button" onClick={() => setInstallments(installments.filter((_, rowIndex) => rowIndex !== index).map((current, rowIndex) => ({ ...current, instalment_no: String(rowIndex + 1) })))} className="self-end rounded-xl p-2.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
        </section>

        <OperationField label="Opening note"><textarea value={form.opening_note} onChange={(event) => setForm({ ...form, opening_note: event.target.value })} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Migration note or source document details" /></OperationField>

        <div className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Mini label="Item value" value={money(itemTotal)} />
          <Mini label="Contract total" value={money(contractTotal)} />
          <Mini label="Already paid" value={money(paidTotal)} />
          <Mini label="Opening outstanding" value={money(balanceTotal)} />
        </div>

        <OperationActions
          saving={saving}
          submitLabel="Create opening HP"
          onCancel={onClose}
          disabled={!form.customer_code || !form.schema_type || !form.store_id || lines.some((line) => !line.item_code || Number(line.net_value || 0) <= 0) || !installmentRowsValid || balanceTotal <= 0}
        />
      </form>
    </OperationModal>
  );
}

function AgreementModal({ options, onClose, onCreated }: { options: HpOptions; onClose: () => void; onCreated: (agreement: HpAgreement, message?: string) => void }) {
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [customers, setCustomers] = useState(options.customers);
  const [guarantors, setGuarantors] = useState(options.guarantors);
  const [quickAddTarget, setQuickAddTarget] = useState<PersonQuickAddTarget | null>(null);
  const [quickAddForm, setQuickAddForm] = useState<PersonQuickAddForm>(emptyPersonQuickAdd);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [calculation, setCalculation] = useState<HpCalculation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<ScanOutcome | null>(null);
  // Latest committed lines/store for the scan handler, so fast scans build on each other in order.
  const linesRef = useRef(lines);
  const storeRef = useRef(form.store_id);

  useLayoutEffect(() => {
    linesRef.current = lines;
    storeRef.current = form.store_id;
  });

  function handleScan(code: string) {
    const item = findItemByScan(options.items, code);
    if (!item) {
      setScanNotice({
        type: 'error',
        message: `Unknown barcode "${code}". No item in this branch uses it. If it was just added, reload the page.`,
      });
      return;
    }

    const result = applyHpScan(linesRef.current, item, Number(storeRef.current));
    if (result.lines !== linesRef.current) {
      linesRef.current = result.lines;
      setLines(result.lines);
    }
    setScanNotice(result.outcome);
  }

  const selectedStore = Number(form.store_id);
  const selectedCustomer = customers.find((customer) => customer.Code === form.customer_code);
  const tenderAmount = Math.max(
    0,
    Number(form.down_payment || 0) - Number(form.advance_amount || 0)
  );
  const netAmount = useMemo(() => lines.reduce((total, line) => {
    const item = options.items.find((candidate) => candidate.item_code === line.item_code);
    const batch = item?.batches.find((candidate) => candidate.batch_no === line.batch_no && candidate.store_id === selectedStore);
    const price = item?.is_batch ? Number(batch?.sales_price || 0) : Number(line.unit_price || item?.standard_sales_price || 0);
    const gross = price * Number(line.qty || 0);
    return total + gross - discountAmount(gross, line.discount, line.discount_type);
  }, 0), [lines, options.items, selectedStore]);
  const headerDiscountAmount = discountAmount(netAmount, form.discount, form.discount_type);
  const itemNetAmount = Math.max(0, netAmount - headerDiscountAmount);

  useEffect(() => {
    if (!form.schema_type || itemNetAmount <= 0 || Number(form.down_payment) > itemNetAmount) {
      const clearTimer = window.setTimeout(() => setCalculation(null), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post<HpCalculation>('/v1/hp/calculate', {
          schema_type: form.schema_type,
          net_amount: itemNetAmount,
          down_payment: Number(form.down_payment || 0),
          transport: Number(form.transport || 0),
        });
        setCalculation(response.data || null);
      } catch {
        setCalculation(null);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form.down_payment, form.schema_type, form.transport, itemNetAmount]);

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  async function savePersonQuickAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!quickAddTarget) return;

    setQuickAddSaving(true);
    setError(null);

    try {
      const endpoint = quickAddTarget === 'customer' ? '/v1/customers' : '/v1/guarantors';
      const response = await api.post(endpoint, {
        name: quickAddForm.name.trim(),
        NIC: quickAddForm.NIC.trim(),
        phone: quickAddForm.phone.trim() || null,
        address: quickAddForm.address.trim() || null,
      });
      const created = response.data as { Code?: string } | undefined;

      if (quickAddTarget === 'customer') {
        const list = await api.getAll<(typeof customers)[number]>('/v1/customers');
        setCustomers(list.data || []);
        if (created?.Code) {
          setForm((current) => ({ ...current, customer_code: created.Code || '' }));
        }
      } else {
        const list = await api.getAll<(typeof guarantors)[number]>('/v1/guarantors');
        setGuarantors(list.data || []);
        if (created?.Code) {
          setForm((current) => ({ ...current, guarantor_1_code: created.Code || '' }));
        }
      }

      setQuickAddTarget(null);
      setQuickAddForm(emptyPersonQuickAdd());
    } catch (quickAddError) {
      setError(getApiErrorMessage(quickAddError, `Unable to create ${quickAddTarget}.`));
    } finally {
      setQuickAddSaving(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await api.post<HpAgreement>('/v1/hp', {
        invoice_date: form.invoice_date,
        reference_no: form.reference_no || null,
        customer_code: form.customer_code,
        guarantor_1_code: form.guarantor_1_code,
        guarantor_2_code: form.guarantor_2_code || null,
        schema_type: form.schema_type,
        store_id: Number(form.store_id),
        down_payment: Number(form.down_payment || 0),
        advance_amount: Number(form.advance_amount || 0),
        down_payment_method: form.down_payment_method,
        bank_detail_id: form.bank_detail_id ? Number(form.bank_detail_id) : null,
        transport: Number(form.transport || 0),
        discount: Number(form.discount || 0),
        discount_type: form.discount_type,
        instalment_due_date: Number(form.instalment_due_date),
        items: lines.map((line) => ({
          item_code: line.item_code,
          qty: Number(line.qty),
          unit_price: line.unit_price ? Number(line.unit_price) : null,
          discount: Number(line.discount || 0),
          discount_type: line.discount_type,
          batch_no: line.batch_no || null,
          serial_numbers: parseSerialNumbers(line.serial_numbers),
        })),
        cheque: form.down_payment_method === 'cheque' && tenderAmount > 0 ? {
          bank_id: Number(form.cheque_bank_id),
          bank_branch_id: Number(form.cheque_bank_branch_id),
          cheque_no: form.cheque_no,
          account_no: form.cheque_account,
          due_date: form.cheque_due_date,
        } : null,
      });
      if (response.data) onCreated(response.data, response.message);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  const selectedSchema = options.schemas.find((schema) => schema.SchemaType === form.schema_type);
  const needsBankAccount = ['card', 'bank_transfer'].includes(form.down_payment_method);
  const totalUnits = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const blockReason = !form.customer_code
    ? 'Select a customer to continue.'
    : !form.guarantor_1_code
      ? 'Select the primary guarantor.'
      : !form.store_id
        ? 'Select the store the stock is issued from.'
        : !form.schema_type
          ? 'Select a hire purchase scheme.'
          : lines.some((line) => !line.item_code || Number(line.qty || 0) <= 0)
            ? 'Choose an item and quantity on every line.'
            : Number(form.down_payment || 0) > itemNetAmount
              ? 'Down payment exceeds the net item value.'
              : needsBankAccount && !form.bank_detail_id
                ? 'Choose the bank account for card / bank transfer.'
                : !calculation
                  ? 'Calculating the installment plan...'
                  : null;

  return (
    <>
    <OperationModal
      title="New Hire Purchase Agreement"
      description="Stock is dispatched immediately when this contract is posted."
      icon={ScrollText}
      onClose={() => !saving && onClose()}
      width="max-w-[1440px]"
    >
      <form onSubmit={submit} className="space-y-6 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}

        <FormSection icon={FileText} title="Agreement Details" subtitle="Who is buying, from which store, and when.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Field label="Agreement Date" required className="xl:col-span-2">
              <IconSlot icon={CalendarDays}>
                <input type="date" value={form.invoice_date} onChange={(event) => setForm({ ...form, invoice_date: event.target.value })} className={iconInputClass} required />
              </IconSlot>
            </Field>
            <Field label="Reference" className="xl:col-span-2">
              <IconSlot icon={Hash}>
                <input value={form.reference_no} onChange={(event) => setForm({ ...form, reference_no: event.target.value })} placeholder="Optional" className={iconInputClass} />
              </IconSlot>
            </Field>
            <Field label="Customer" required className="md:col-span-2 xl:col-span-5">
              <div className="flex gap-2">
                <IconSlot icon={UserRound} className="flex-1">
                  <SearchSelect value={form.customer_code} onChange={(value) => setForm({ ...form, customer_code: value, advance_amount: '0' })} options={customers.map((customer) => ({ value: customer.Code, label: customer.name, description: customer.NIC }))} placeholder="Select customer" searchPlaceholder="Search by name or NIC..." className={iconInputClass} required />
                </IconSlot>
                <NewPersonButton onClick={() => { setQuickAddTarget('customer'); setQuickAddForm(emptyPersonQuickAdd()); }} title="Add a new customer" />
              </div>
            </Field>
            <Field label="Issue Store" required className="md:col-span-2 xl:col-span-3">
              <IconSlot icon={Warehouse}>
                <SearchSelect value={form.store_id} onChange={(value) => setForm({ ...form, store_id: value })} options={options.stores.map((store) => ({ value: String(store.id), label: store.name }))} placeholder="Select store" searchPlaceholder="Search stores..." className={iconInputClass} required />
              </IconSlot>
            </Field>
          </div>

          {selectedCustomer && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                <UserRound className="h-4 w-4 text-indigo-500" />
                {selectedCustomer.name}
              </span>
              <span className="inline-flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-slate-400" />{selectedCustomer.NIC}</span>
              {selectedCustomer.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{selectedCustomer.phone}</span>}
              {selectedCustomer.address && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{selectedCustomer.address}</span></span>}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:ml-auto">
                <Wallet className="h-3.5 w-3.5" />
                Advance {money(selectedCustomer.advance_balance)}
              </span>
            </div>
          )}
        </FormSection>

        <FormSection icon={ShieldCheck} title="Guarantors & Scheme" subtitle="Who backs the contract and how it is repaid.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            <Field label="Primary Guarantor" required className="md:col-span-2 xl:col-span-4">
              <div className="flex gap-2">
                <IconSlot icon={UserCheck} className="flex-1">
                  <SearchSelect value={form.guarantor_1_code} onChange={(value) => setForm({ ...form, guarantor_1_code: value, guarantor_2_code: form.guarantor_2_code === value ? '' : form.guarantor_2_code })} options={guarantors.map((guarantor) => ({ value: guarantor.Code, label: guarantor.name, description: guarantor.NIC }))} placeholder="Select guarantor" searchPlaceholder="Search by name or NIC..." className={iconInputClass} required />
                </IconSlot>
                <NewPersonButton onClick={() => { setQuickAddTarget('guarantor'); setQuickAddForm(emptyPersonQuickAdd()); }} title="Add a new guarantor" />
              </div>
            </Field>
            <Field label="Second Guarantor" className="xl:col-span-3">
              <IconSlot icon={Users}>
                <SearchSelect value={form.guarantor_2_code} onChange={(value) => setForm({ ...form, guarantor_2_code: value })} options={guarantors.filter((g) => g.Code !== form.guarantor_1_code).map((guarantor) => ({ value: guarantor.Code, label: guarantor.name, description: guarantor.NIC }))} title="Select second guarantor" emptyOption="Not required" searchPlaceholder="Search by name or NIC..." className={iconInputClass} />
              </IconSlot>
            </Field>
            <Field label="Scheme" required className="xl:col-span-3">
              <IconSlot icon={Layers}>
                <SearchSelect value={form.schema_type} onChange={(value) => setForm({ ...form, schema_type: value })} options={options.schemas.map((schema) => ({ value: schema.SchemaType, label: schema.SchemaType, description: `${schema.NoOfInstallment} months` }))} placeholder="Select scheme" searchPlaceholder="Search schemes..." className={iconInputClass} required />
              </IconSlot>
            </Field>
            <Field label="Installment Due Day" required hint="1 – 28" className="xl:col-span-2">
              <IconSlot icon={CalendarClock}>
                <input type="number" min="1" max="28" value={form.instalment_due_date} onChange={(event) => setForm({ ...form, instalment_due_date: event.target.value })} className={`${iconInputClass} tabular-nums`} required />
              </IconSlot>
            </Field>
          </div>

          {selectedSchema && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge icon={CalendarClock} tone="indigo">{selectedSchema.NoOfInstallment} installments</Badge>
              <Badge icon={Percent}>Rate {Number(selectedSchema.InstallmentRate)}%</Badge>
              <Badge icon={Banknote}>Down payment {Number(selectedSchema.DownpaymentPrecentage)}%</Badge>
              <Badge icon={FileText}>Document charge {Number(selectedSchema.DocumentCharagePrecentage)}%</Badge>
              <Badge icon={AlertTriangle}>Grace period {selectedSchema.GracePeriodDays} days</Badge>
            </div>
          )}
        </FormSection>

        <FormSection
          icon={ShoppingCart}
          title="Contract Items"
          subtitle={form.store_id ? 'Batch prices and availability come from the selected store.' : 'Select a store to see the items in stock.'}
          action={
            <div className="flex shrink-0 items-center gap-2">
              <ScanInput
                onScan={handleScan}
                disabled={!form.store_id}
                placeholder={form.store_id ? 'Scan barcode + Enter' : 'Select a store to scan'}
                className="w-44 sm:w-64"
              />
              <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                <Plus className="h-4 w-4" /> Add Item
              </button>
            </div>
          }
          bodyClassName="p-0"
        >
          {scanNotice && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center gap-2 border-b px-5 py-2.5 text-xs font-semibold ${
                scanNotice.type === 'error'
                  ? 'border-rose-100 bg-rose-50 text-rose-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}
            >
              {scanNotice.type === 'error'
                ? <AlertTriangle className="h-4 w-4 shrink-0" />
                : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {scanNotice.message}
            </div>
          )}

          <LineHeader columns={['Item', 'Batch', 'Qty', 'Unit Price', 'Discount', 'Line Net']} />

          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const item = options.items.find((candidate) => candidate.item_code === line.item_code);
              const batches = item?.batches.filter((batch) => batch.store_id === selectedStore && batch.qty_in_hand > 0) || [];
              const batch = batches.find((candidate) => candidate.batch_no === line.batch_no);
              const selectedSerials = serialSelections(line.serial_numbers, line.qty);
              const availableSerials = item?.available_serials.filter((serial) => serial.store_id === selectedStore) || [];
              const onHand = item?.is_batch
                ? batch?.qty_in_hand ?? 0
                : item?.stores.find((stock) => stock.store_id === selectedStore)?.qty_in_hand ?? 0;
              // Other lines for the same item (and batch) draw from the same stock.
              const usedElsewhere = lines
                .filter((other, otherIndex) => otherIndex !== index && other.item_code === line.item_code && (!item?.is_batch || other.batch_no === line.batch_no))
                .reduce((sum, other) => sum + Number(other.qty || 0), 0);
              const available = Math.max(0, onHand - usedElsewhere);
              const stockKnown = Boolean(item && (!item.is_batch || line.batch_no));
              const price = item?.is_batch ? Number(batch?.sales_price || 0) : Number(line.unit_price || item?.standard_sales_price || 0);
              const lineGross = price * Number(line.qty || 0);
              const lineNet = Math.max(0, lineGross - discountAmount(lineGross, line.discount, line.discount_type));

              return (
                <div key={index} className="px-4 py-4 transition hover:bg-slate-50/50">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 xl:hidden">
                    <LineNumber value={index + 1} />
                    Item line
                  </div>

                  <div className={`grid grid-cols-2 gap-3 md:grid-cols-6 xl:items-start ${lineGridClass}`}>
                    <span className="hidden h-11 items-center justify-center xl:flex">
                      <LineNumber value={index + 1} />
                    </span>
                    <LineField label="Item" required className="col-span-2 md:col-span-4 xl:col-span-1">
                      <IconSlot icon={Package}>
                        <SearchSelect value={line.item_code} onChange={(value) => updateLine(index, { item_code: value, batch_no: '', unit_price: '', serial_numbers: '' })} options={options.items.filter((candidate) => candidate.stores.some((stock) => stock.store_id === selectedStore && stock.qty_in_hand > 0)).map((candidate) => ({ value: candidate.item_code, label: `${candidate.item_code} · ${candidate.item_description}`, description: `${candidate.stores.find((stock) => stock.store_id === selectedStore)?.qty_in_hand ?? 0} in stock`, keywords: candidate.barcode }))} placeholder={form.store_id ? 'Select item' : 'Select a store first'} searchPlaceholder="Search by code, description or barcode..." className={iconInputClass} required />
                      </IconSlot>
                    </LineField>
                    <LineField label="Batch" required={Boolean(item?.is_batch)} className="col-span-2 xl:col-span-1">
                      {item?.is_batch ? (
                        <IconSlot icon={Layers}>
                          <SearchSelect value={line.batch_no} onChange={(value) => updateLine(index, { batch_no: value, serial_numbers: '' })} options={batches.map((candidate) => ({ value: candidate.batch_no, label: candidate.batch_no, description: `${money(candidate.sales_price)} · ${candidate.qty_in_hand} left` }))} placeholder="Select batch" searchPlaceholder="Search batches..." className={iconInputClass} required />
                        </IconSlot>
                      ) : (
                        <div className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400">
                          <Layers className="h-4 w-4" />
                          Not batched
                        </div>
                      )}
                    </LineField>
                    <LineField label="Qty" required className="md:col-span-2 xl:col-span-1">
                      <StockQtyInput value={line.qty} onChange={(value) => updateLine(index, { qty: value })} available={stockKnown ? available : null} className={`${fieldClass} text-center tabular-nums`} required />
                      <span className={`mt-1 block text-center text-[11px] font-medium ${stockKnown && available === 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {stockKnown ? `Max ${available}` : ' '}
                      </span>
                    </LineField>
                    <LineField label="Unit Price" className="md:col-span-2 xl:col-span-1">
                      {item?.is_batch ? (
                        <div className="flex h-11 items-center justify-end rounded-xl border border-slate-200 bg-slate-100 px-3.5 text-sm tabular-nums text-slate-600" title="Batch price from the selected store">
                          {line.batch_no ? money(price) : '—'}
                        </div>
                      ) : (
                        <input type="number" min="0" step="0.01" value={line.unit_price} placeholder={String(item?.standard_sales_price || '0.00')} onChange={(event) => updateLine(index, { unit_price: event.target.value })} className={`${fieldClass} text-right tabular-nums`} />
                      )}
                    </LineField>
                    <LineField label="Discount" className="col-span-2 xl:col-span-1">
                      <DiscountInput
                        type={line.discount_type}
                        value={line.discount}
                        onTypeChange={(value) => updateLine(index, { discount_type: value })}
                        onValueChange={(value) => updateLine(index, { discount: value })}
                      />
                    </LineField>
                    <LineField label="Line Net" className="md:col-span-5 xl:col-span-1">
                      <div className="flex h-11 items-center justify-end rounded-xl bg-slate-100 px-3.5 text-base font-bold tabular-nums text-slate-950">
                        {money(lineNet)}
                      </div>
                    </LineField>
                    <div className="flex items-end md:col-span-1 xl:col-span-1 xl:items-start">
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}
                        disabled={lines.length === 1}
                        title="Remove line"
                        aria-label={`Remove line ${index + 1}`}
                        className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {item && (
                    <div className="mt-3 flex flex-wrap gap-2 xl:pl-12">
                      <Badge icon={Tag}>
                        {item.is_batch ? 'Batch price from store' : `Standard price ${money(item.standard_sales_price)}`}
                      </Badge>
                      {stockKnown && (
                        <Badge icon={Boxes} tone={available > 0 ? 'emerald' : 'rose'}>
                          {available > 0 ? `${available} available` : 'Out of stock'}
                        </Badge>
                      )}
                      {item.is_serialized && <Badge icon={Barcode} tone="indigo">Serialized item</Badge>}
                    </div>
                  )}

                  {item?.is_serialized && (
                    <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 xl:ml-12">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Barcode className="h-4 w-4 text-indigo-500" />
                        Serial Numbers
                        <span className="font-normal text-slate-500">({selectedSerials.filter(Boolean).length} of {line.qty || 0} selected)</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {selectedSerials.map((selectedSerial, serialIndex) => (
                          <SearchSelect
                            key={serialIndex}
                            value={selectedSerial}
                            onChange={(value) =>
                              updateLine(index, {
                                serial_numbers: updateSerialSelection(line.serial_numbers, line.qty, serialIndex, value),
                              })
                            }
                            options={availableSerials
                              .filter((serial) => serial.serial_no === selectedSerial || !selectedSerials.includes(serial.serial_no))
                              .map((serial) => ({ value: serial.serial_no, label: serial.serial_no }))}
                            placeholder={`Serial #${serialIndex + 1}`}
                            searchPlaceholder="Search serial numbers..."
                            className={fieldClass}
                            required
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setLines([...lines, emptyLine()])}
            className="flex w-full items-center justify-center gap-2 border-t border-dashed border-slate-200 py-3 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50/60"
          >
            <Plus className="h-4 w-4" /> Add another item
          </button>
        </FormSection>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <FormSection icon={CreditCard} title="Down Payment" subtitle="Collected now. The rest is split into monthly installments.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Header Discount">
                <DiscountInput
                  type={form.discount_type}
                  value={form.discount}
                  onTypeChange={(value) => setForm({ ...form, discount_type: value })}
                  onValueChange={(value) => setForm({ ...form, discount: value })}
                />
              </Field>
              <Field label="Transport">
                <MoneyInput icon={Truck} value={form.transport} onChange={(value) => setForm({ ...form, transport: value })} />
              </Field>
              <Field label="Down Payment" required hint={calculation ? `Rec. ${money(calculation.recommended_down_payment)}` : undefined}>
                <MoneyInput icon={Banknote} value={form.down_payment} onChange={(value) => setForm({ ...form, down_payment: value })} required />
              </Field>
              <Field label="Apply Advance" hint={selectedCustomer ? `Avail. ${money(selectedCustomer.advance_balance)}` : undefined}>
                <MoneyInput icon={Wallet} value={form.advance_amount} max={Math.min(Number(form.down_payment || 0), Number(selectedCustomer?.advance_balance || 0))} onChange={(value) => setForm({ ...form, advance_amount: value })} />
              </Field>
              <Field label="Payment Method" required>
                <IconSlot icon={paymentMethodIcon(form.down_payment_method)}>
                  <select value={form.down_payment_method} onChange={(event) => setForm({ ...form, down_payment_method: event.target.value, bank_detail_id: ['card', 'bank_transfer'].includes(event.target.value) ? form.bank_detail_id || options.bank_accounts[0]?.id?.toString() || '' : form.bank_detail_id })} className={iconInputClass}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </IconSlot>
              </Field>
              {needsBankAccount && (
                <Field label="Bank Account" required>
                  <IconSlot icon={Landmark}>
                    <SearchSelect value={form.bank_detail_id} onChange={(value) => setForm({ ...form, bank_detail_id: value })} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className={iconInputClass} required />
                  </IconSlot>
                </Field>
              )}
            </div>

            {form.down_payment_method === 'cheque' && tenderAmount > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ScrollText className="h-4 w-4 text-indigo-500" />
                  Cheque Details
                </div>
                <ChequeEntryFields
                  banks={options.cheque_banks}
                  value={{ bank_id: form.cheque_bank_id, bank_branch_id: form.cheque_bank_branch_id, cheque_no: form.cheque_no, account_no: form.cheque_account, date: form.cheque_due_date }}
                  onChange={(cheque) => setForm({ ...form, cheque_bank_id: cheque.bank_id, cheque_bank_branch_id: cheque.bank_branch_id, cheque_no: cheque.cheque_no, cheque_account: cheque.account_no, cheque_due_date: cheque.date })}
                />
              </div>
            )}
          </FormSection>

          <SummaryCard
            icon={Calculator}
            title="Agreement Summary"
            meta={`${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · ${totalUnits} ${totalUnits === 1 ? 'unit' : 'units'}`}
          >
            <div className="space-y-2.5 px-5 py-4">
              <SummaryRow label="Items after line discounts" value={money(netAmount)} />
              <SummaryRow label="Header discount" value={headerDiscountAmount > 0 ? `− ${money(headerDiscountAmount)}` : money(0)} tone={headerDiscountAmount > 0 ? 'rose' : undefined} />
              <SummaryHighlight label="Net Items" value={money(itemNetAmount)} />
              <SummaryRow label="Down payment" value={money(form.down_payment)} />
              <SummaryRow label="Advance used" value={money(form.advance_amount)} tone="emerald" />
              <SummaryRow label="Tender now" value={money(tenderAmount)} tone="emerald" />
            </div>
            {calculation ? (
              <>
                <div className="space-y-2.5 border-t border-slate-200 px-5 py-4">
                  <SummaryRow label="Interest" value={money(calculation.interest_amount)} />
                  <SummaryRow label="Document charge" value={money(calculation.document_charge)} />
                  <SummaryRow label="Transport" value={money(calculation.transport)} />
                  <SummaryRow label="Contract total" value={money(calculation.contract_amount)} />
                </div>
                <div className="flex items-center justify-between border-t border-indigo-200 bg-indigo-50 px-5 py-4">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-800">
                    <CalendarClock className="h-4 w-4" />
                    Monthly × {calculation.no_of_installments}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-indigo-950">{money(calculation.installment_monthly)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs text-slate-500">
                <Calculator className="mt-px h-4 w-4 shrink-0 text-slate-400" />
                Select a scheme and items to see the installment plan.
              </div>
            )}
            {Number(form.down_payment || 0) > itemNetAmount && itemNetAmount > 0 && (
              <div className="flex items-start gap-2 border-t border-rose-200 bg-rose-50 px-5 py-3 text-xs font-medium text-rose-700">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                Down payment exceeds the net item value.
              </div>
            )}
          </SummaryCard>
        </div>

        <StickyFormFooter
          blockReason={blockReason}
          readyText={calculation ? `Ready to post · ${calculation.no_of_installments} × ${money(calculation.installment_monthly)}` : 'Ready to post'}
          saving={saving}
          savingLabel="Posting..."
          submitLabel="Post Agreement"
          submitIcon={CheckCircle2}
          onCancel={onClose}
        />
      </form>
    </OperationModal>

    {quickAddTarget && (
      <OperationModal
        title={`Add ${quickAddTarget}`}
        description="Create the missing prerequisite profile and continue the agreement."
        icon={UserPlus}
        onClose={() => {
          if (!quickAddSaving) setQuickAddTarget(null);
        }}
        width="max-w-2xl"
      >
        <form onSubmit={savePersonQuickAdd} className="grid gap-4 p-6 sm:grid-cols-2">
          <OperationField label="Name" required>
            <input value={quickAddForm.name} onChange={(event) => setQuickAddForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Full name" required />
          </OperationField>
          <OperationField label="NIC" required>
            <input value={quickAddForm.NIC} onChange={(event) => setQuickAddForm((current) => ({ ...current, NIC: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" minLength={9} maxLength={15} placeholder="National identity number" required />
          </OperationField>
          <OperationField label={quickAddTarget === 'customer' ? 'Mobile number' : 'Phone'}>
            {quickAddTarget === 'customer' ? (
              <MobileInput value={quickAddForm.phone} onChange={(phone) => setQuickAddForm((current) => ({ ...current, phone }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2" />
            ) : (
              <input type="tel" value={quickAddForm.phone} onChange={(event) => setQuickAddForm((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" maxLength={25} pattern={PHONE_PATTERN} title={PHONE_TITLE} placeholder="07XXXXXXXX" />
            )}
          </OperationField>
          <OperationField label="Address" className="sm:col-span-2">
            <textarea value={quickAddForm.address} onChange={(event) => setQuickAddForm((current) => ({ ...current, address: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" placeholder="Postal address" />
          </OperationField>
          <div className="sm:col-span-2">
            <OperationActions saving={quickAddSaving} submitLabel={`Create ${quickAddTarget}`} onCancel={() => setQuickAddTarget(null)} disabled={!quickAddForm.name.trim() || quickAddForm.NIC.trim().length < 9} />
          </div>
        </form>
      </OperationModal>
    )}
    </>
  );
}

function AgreementDetail({ agreement, canUpdate, onClose, onAction }: { agreement: HpAgreement; canUpdate: boolean; onClose: () => void; onAction: (action: 'convert' | 'return') => void }) {
  return (
    <OperationModal title={agreement.agreement_no} description={`${agreement.customer_name} · ${agreement.customer_nic}`} onClose={onClose} width="max-w-6xl">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><StatusPill status={agreement.status} />{agreement.is_opening && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Opening HP</span>}<div className="flex flex-wrap gap-2"><Link href={`/dashboard/hire-purchase/${agreement.id}/print/agreement`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Printer className="h-4 w-4" /> Agreement</Link><Link href={`/dashboard/hire-purchase/${agreement.id}/print/downpayment`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Printer className="h-4 w-4" /> Down payment</Link><Link href={`/dashboard/hire-purchase/${agreement.id}/print/invoice`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Printer className="h-4 w-4" /> Invoice</Link><Link href={`/dashboard/hire-purchase/${agreement.id}/delivery-order`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><Truck className="h-4 w-4" /> Delivery Order</Link>{canUpdate && agreement.status === 'active' && <><button onClick={() => onAction('convert')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><ArrowRightLeft className="h-4 w-4" /> Pay at once</button><button onClick={() => onAction('return')} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700"><RotateCcw className="h-4 w-4" /> Return agreement</button></>}</div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><OperationMetric label="Contract" value={money(agreement.contract_amount)} /><OperationMetric label="Advance used" value={money(agreement.advance_applied)} tone="emerald" /><OperationMetric label="Down-payment due" value={money(agreement.down_payment_outstanding)} tone={Number(agreement.down_payment_outstanding) ? 'rose' : 'slate'} /><OperationMetric label="Installment outstanding" value={money(agreement.outstanding_amount)} tone="amber" /><OperationMetric label="Monthly target" value={money(agreement.instalment)} tone="indigo" /></div>
        <section><h3 className="mb-3 font-bold text-slate-900">Items</h3><div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Batch</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Value</th></tr></thead><tbody className="divide-y divide-slate-100">{agreement.details.map((detail) => <tr key={detail.id}><td className="px-4 py-3"><div className="font-medium">{detail.item_code}</div><div className="text-xs text-slate-500">{detail.item_description}</div></td><td className="px-4 py-3">{detail.batch_no || '—'}</td><td className="px-4 py-3">{detail.qty}</td><td className="px-4 py-3">{money(detail.net_value)}</td></tr>)}</tbody></table></div></section>
        <section><h3 className="mb-3 font-bold text-slate-900">Repayment schedule</h3><div className="content-scrollbar max-h-80 overflow-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">No.</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{agreement.instalments.map((installment) => <tr key={installment.id}><td className="px-4 py-3">#{installment.instalment_no}</td><td className="px-4 py-3">{shortDate(installment.instalment_date)}</td><td className="px-4 py-3">{money(installment.base_amount)}</td><td className="px-4 py-3 font-semibold">{money(installment.balance_amount)}</td><td className="px-4 py-3"><StatusPill status={installment.status} /></td></tr>)}</tbody></table></div></section>
        <section><h3 className="mb-3 font-bold text-slate-900">Agreement timeline</h3><div className="space-y-3">{agreement.histories.map((history) => <div key={history.id} className="flex gap-3 rounded-xl border border-slate-200 p-4"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-500" /><div><div className="text-sm font-semibold capitalize text-slate-900">{history.event.replaceAll('_', ' ')}</div><div className="text-xs text-slate-500">{shortDate(history.event_date)} · {history.UID}</div>{history.description && <p className="mt-1 text-sm text-slate-600">{history.description}</p>}</div></div>)}</div></section>
      </div>
    </OperationModal>
  );
}

function AgreementActionModal({ agreement, action, options, onClose, onSaved }: { agreement: HpAgreement; action: 'convert' | 'return'; options: HpOptions; onClose: () => void; onSaved: (agreement: HpAgreement, message?: string) => void }) {
  const [date, setDate] = useState(today());
  const [discount, setDiscount] = useState('0');
  const [amount, setAmount] = useState(String(agreement.outstanding_amount));
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState('');
  const [storeId, setStoreId] = useState(String(agreement.store_id));
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cheque, setCheque] = useState({
    bank_id: '',
    bank_branch_id: '',
    cheque_no: '',
    account_no: '',
    date: today(),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = action === 'convert'
        ? await api.post<HpAgreement>(`/v1/hp/${agreement.id}/pay-at-once`, {
            conversion_date: date,
            amount: Number(amount),
            discount: Number(discount || 0),
            payment_method: method,
            bank_detail_id: bankId ? Number(bankId) : null,
            cheque: method === 'cheque'
              ? {
                  bank_id: Number(cheque.bank_id),
                  bank_branch_id: Number(cheque.bank_branch_id),
                  cheque_no: cheque.cheque_no,
                  account_no: cheque.account_no,
                  due_date: cheque.date,
                }
              : null,
          })
        : await api.post<HpAgreement>(`/v1/hp/${agreement.id}/return`, {
            return_date: date,
            store_id: Number(storeId),
            reason,
            refund_amount: Number(refund || 0),
            refund_method: method,
            bank_detail_id: bankId ? Number(bankId) : null,
          });
      if (response.data) onSaved(response.data, response.message);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OperationModal title={action === 'convert' ? 'Pay agreement at once' : 'Return hire purchase agreement'} onClose={onClose} width="max-w-xl">
      <form onSubmit={submit} className="space-y-4 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <OperationField label={action === 'convert' ? 'Payment date' : 'Return date'} required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
        {action === 'convert' ? <>
          <OperationField label="Outstanding balance"><input disabled value={money(agreement.outstanding_amount)} className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5" /></OperationField>
          <OperationField label="Settlement discount"><input type="number" min="0" value={discount} onChange={(event) => { const nextDiscount = event.target.value; setDiscount(nextDiscount); setAmount(String(Math.max(0, Number(agreement.outstanding_amount) - Number(nextDiscount || 0)))); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
          <OperationField label="Settlement amount" required><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
        </> : <>
          <OperationField label="Return store" required><SearchSelect value={storeId} onChange={setStoreId} options={options.stores.map((store) => ({ value: String(store.id), label: store.name }))} placeholder="Select store" searchPlaceholder="Search stores..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>
          <OperationField label="Return reason" required><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
          <OperationField label="Customer refund"><input type="number" min="0" value={refund} onChange={(event) => setRefund(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
        </>}
        <OperationField label="Payment method" required><select value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option>{action === 'convert' && <option value="cheque">Cheque</option>}</select></OperationField>
        {['card', 'bank_transfer'].includes(method) && <OperationField label="Bank account" required><SearchSelect value={bankId} onChange={setBankId} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>}
        {action === 'convert' && method === 'cheque' && <ChequeEntryFields banks={options.cheque_banks} value={cheque} onChange={setCheque} />}
        <OperationActions saving={saving} submitLabel={action === 'convert' ? 'Pay at once' : 'Post return'} onCancel={onClose} disabled={action === 'return' && !reason} />
      </form>
    </OperationModal>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{label}</div><div className="mt-1 font-bold text-indigo-950">{value}</div></div>;
}

function NewPersonButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
    >
      <UserPlus className="h-4 w-4" />
      New
    </button>
  );
}

function paymentMethodIcon(method: string): LucideIcon {
  if (method === 'card') return CreditCard;
  if (method === 'bank_transfer') return Landmark;
  if (method === 'cheque') return ScrollText;
  return Banknote;
}
