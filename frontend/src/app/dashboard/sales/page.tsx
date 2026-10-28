'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Barcode,
  Boxes,
  Calculator,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Hash,
  Landmark,
  Layers,
  MapPin,
  Package,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  RefreshCcw,
  ScrollText,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  UserCheck,
  UserPlus,
  UserRound,
  Wallet,
  Warehouse,
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
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  parseSerialNumbers,
  StockBatch,
  StockItem,
  Store,
} from '@/lib/inventory';
import { dateInputValue, displayDate, numeric } from '@/lib/purchases';
import {
  SalesCustomer,
  SalesInvoice,
  Salesperson,
} from '@/lib/sales';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import type {
  ChequeBank,
  PaymentBankAccount,
  PaymentOptions,
} from '@/lib/payment-options';
import { MobileInput } from '@/components/mobile-input';
import { SearchSelect } from '@/components/search-select';
import { ScanInput } from '@/components/scan-input';
import { StockQtyInput } from '@/components/stock-qty-input';
import { findItemByScan } from '@/lib/barcode';
import {
  Badge,
  DiscountInput,
  type DiscountType,
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
  SummaryCard,
  SummaryHighlight,
  SummaryRow,
  StickyFormFooter,
} from '@/components/invoice-form-ui';
import {
  WarrantyLineControl,
  warrantyLineDefaults,
  warrantyLinePayload,
} from '@/components/warranty-line-control';

type BatchPricingMode = 'batch' | 'average' | 'last';

interface SaleLineForm {
  key: number;
  item_code: string;
  batch_no: string;
  qty: string;
  pricing_mode: BatchPricingMode;
  unit_price: string;
  discount: string;
  discount_type: DiscountType;
  serial_numbers: string;
  warranty_enabled: boolean;
  warranty_months: string;
}

interface SaleForm {
  invoice_date: string;
  reference_no: string;
  customer_code: string;
  store_id: string;
  salesman_id: string;
  discount: string;
  discount_type: DiscountType;
  advance_amount: string;
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
  items: SaleLineForm[];
}

interface CustomerQuickAddForm {
  name: string;
  NIC: string;
  phone: string;
  address: string;
}

let saleLineKey = 1;

function blankLine(): SaleLineForm {
  return {
    key: saleLineKey++,
    item_code: '',
    batch_no: '',
    qty: '1',
    pricing_mode: 'batch',
    unit_price: '',
    discount: '0',
    discount_type: 'amount',
    serial_numbers: '',
    warranty_enabled: false,
    warranty_months: '',
  };
}

function blankForm(): SaleForm {
  return {
    invoice_date: dateInputValue(),
    reference_no: '',
    customer_code: '',
    store_id: '',
    salesman_id: '',
    discount: '0',
    discount_type: 'amount',
    advance_amount: '0',
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
    items: [blankLine()],
  };
}

function blankCustomerQuickAdd(): CustomerQuickAddForm {
  return {
    name: '',
    NIC: '',
    phone: '',
    address: '',
  };
}

function getAvailableBatches(item: StockItem | undefined, storeId: string): StockBatch[] {
  if (!item?.is_batch || !storeId) return [];

  return item.batches
    .filter((candidate) => candidate.store_id === Number(storeId) && candidate.qty_in_hand > 0)
    .sort((left, right) => left.id - right.id);
}

/** Stock of an item in the chosen store (or across all stores before a store is picked). */
function storeQty(item: StockItem, storeId: string): number {
  if (!storeId) return item.total_qty;
  return item.stores.find((store) => store.store_id === Number(storeId))?.qty_in_hand ?? 0;
}

function getDefaultPricingMode(item: StockItem | undefined): BatchPricingMode {
  return item?.is_batch
    ? ((item.default_batch_price_mode as BatchPricingMode | undefined) ?? 'batch')
    : 'batch';
}

function pricingModeLabel(mode: BatchPricingMode): string {
  if (mode === 'average') return 'Average price';
  if (mode === 'last') return 'Last price';
  return 'Batch price';
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

function discountAmount(baseAmount: number, value: string, type: DiscountType): number {
  const discountValue = numeric(value);

  if (discountValue <= 0) return 0;
  if (type === 'percent') {
    return Math.min(baseAmount, (baseAmount * discountValue) / 100);
  }

  return Math.min(baseAmount, discountValue);
}

function toMoneyInput(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
}

function resolveBatchUnitPrice(
  item: StockItem | undefined,
  storeId: string,
  batchNo: string,
  pricingMode: BatchPricingMode
): string {
  if (!item) return '';

  if (!item.is_batch) {
    return toMoneyInput(numeric(item.standard_sales_price));
  }

  const batches = getAvailableBatches(item, storeId);
  if (batches.length === 0) {
    return toMoneyInput(numeric(item.standard_sales_price));
  }

  if (pricingMode === 'average') {
    const totalQty = batches.reduce((sum, batch) => sum + batch.qty_in_hand, 0);
    if (totalQty <= 0) {
      return toMoneyInput(numeric(batches[0]?.sales_price ?? item.standard_sales_price));
    }

    const weightedAverage = batches.reduce(
      (sum, batch) => sum + numeric(batch.sales_price) * batch.qty_in_hand,
      0
    ) / totalQty;

    return toMoneyInput(weightedAverage);
  }

  if (pricingMode === 'last') {
    const latestBatch = [...batches].sort((left, right) => right.id - left.id)[0];
    return toMoneyInput(numeric(latestBatch?.sales_price ?? item.standard_sales_price));
  }

  const selectedBatch = batches.find((candidate) => candidate.batch_no === batchNo) ?? batches[0];
  return toMoneyInput(numeric(selectedBatch?.sales_price ?? item.standard_sales_price));
}

/** Puts an item on a line the same way for the item picker and the barcode scanner. */
function selectItemOnLine(
  line: SaleLineForm,
  itemCode: string,
  item: StockItem | undefined,
  storeId: string,
  batchNo: string
): SaleLineForm {
  const pricingMode = getDefaultPricingMode(item);

  return {
    ...line,
    item_code: itemCode,
    batch_no: item?.is_batch ? batchNo : '',
    pricing_mode: pricingMode,
    unit_price: resolveBatchUnitPrice(item, storeId, batchNo, pricingMode),
    serial_numbers: '',
    ...warrantyLineDefaults(item),
  };
}

type ScanOutcome = { type: 'success' | 'error'; message: string };

/**
 * Applies one scanned item to the draft invoice (never saves it, never moves stock):
 * adds 1 to a line of the same item/batch whose price and discount were not changed by hand,
 * otherwise starts a new line on the first batch that still has stock left in the store.
 */
function applyScanToForm(form: SaleForm, item: StockItem): { form: SaleForm; outcome: ScanOutcome } {
  const label = `${item.item_code} - ${item.item_description}`;
  const serialHint = item.is_serialized ? ' Select the serial number for the new unit.' : '';

  if (!form.store_id) {
    return { form, outcome: { type: 'error', message: 'Select the store before scanning items.' } };
  }

  if (storeQty(item, form.store_id) <= 0) {
    return { form, outcome: { type: 'error', message: `${label} is out of stock in this store.` } };
  }

  const batches = getAvailableBatches(item, form.store_id);
  const remaining = (batchNo: string) => {
    const onHand = item.is_batch
      ? batches.find((candidate) => candidate.batch_no === batchNo)?.qty_in_hand ?? 0
      : storeQty(item, form.store_id);
    const used = form.items
      .filter((line) => line.item_code === item.item_code && (!item.is_batch || line.batch_no === batchNo))
      .reduce((sum, line) => sum + numeric(line.qty), 0);

    return onHand - used;
  };

  const defaultMode = getDefaultPricingMode(item);
  const mergeLine = form.items.find((line) =>
    line.item_code === item.item_code
    && line.pricing_mode === defaultMode
    && numeric(line.discount) <= 0
    && numeric(line.unit_price) === numeric(resolveBatchUnitPrice(item, form.store_id, line.batch_no, defaultMode))
    && remaining(line.batch_no) > 0
  );

  if (mergeLine) {
    const qty = numeric(mergeLine.qty) + 1;
    return {
      form: {
        ...form,
        items: form.items.map((line) => (line.key === mergeLine.key ? { ...line, qty: String(qty) } : line)),
      },
      outcome: { type: 'success', message: `${label}: quantity is now ${qty}.${serialHint}` },
    };
  }

  const batchNo = item.is_batch
    ? batches.find((candidate) => remaining(candidate.batch_no) > 0)?.batch_no
    : remaining('') > 0 ? '' : undefined;

  if (batchNo === undefined) {
    return { form, outcome: { type: 'error', message: `No more stock of ${label} left in this store for this invoice.` } };
  }

  const blank = form.items.find((line) => !line.item_code);
  const newLine = {
    ...selectItemOnLine(blank ?? blankLine(), item.item_code, item, form.store_id, batchNo),
    qty: '1',
  };

  return {
    form: {
      ...form,
      items: blank
        ? form.items.map((line) => (line.key === blank.key ? newLine : line))
        : [...form.items, newLine],
    },
    outcome: {
      type: 'success',
      message: `${label} added${item.is_batch ? ` from batch ${batchNo}` : ''}.${serialHint}`,
    },
  };
}

function openPendingPrintWindow() {
  if (typeof window === 'undefined') return null;

  const popup = window.open('', '_blank');
  if (!popup) return null;

  popup.document.open();
  popup.document.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Preparing invoice...</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: Inter, Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
          }
          .card {
            width: min(92vw, 420px);
            border-radius: 24px;
            background: #ffffff;
            box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
            border: 1px solid #e2e8f0;
            padding: 32px 28px;
            text-align: center;
          }
          .dot {
            width: 14px;
            height: 14px;
            margin: 0 auto 18px;
            border-radius: 999px;
            background: #4f46e5;
            box-shadow: 0 0 0 10px rgba(79, 70, 229, 0.14);
          }
          h1 {
            margin: 0 0 10px;
            font-size: 20px;
            line-height: 1.3;
          }
          p {
            margin: 0;
            font-size: 14px;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="dot"></div>
          <h1>Preparing invoice print...</h1>
          <p>Please wait while the printable receipt is generated.</p>
        </div>
      </body>
    </html>
  `);
  popup.document.close();

  return popup;
}

export default function SalesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('sales', 'can_read');
  const canCreate = hasPermission('sales', 'can_create');

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [chequeBanks, setChequeBanks] = useState<ChequeBank[]>([]);
  const [bankAccounts, setBankAccounts] = useState<PaymentBankAccount[]>([]);
  const [form, setForm] = useState<SaleForm>(blankForm);
  const [customerQuickAdd, setCustomerQuickAdd] = useState<CustomerQuickAddForm>(blankCustomerQuickAdd);
  const [showCustomerQuickAdd, setShowCustomerQuickAdd] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [scanNotice, setScanNotice] = useState<ScanOutcome | null>(null);
  // Latest committed form/inventory for the scan handler, so fast scans build on each other in order.
  const formRef = useRef(form);
  const inventoryRef = useRef(inventory);
  const scanQueueRef = useRef<Promise<void>>(Promise.resolve());

  useLayoutEffect(() => {
    formRef.current = form;
    inventoryRef.current = inventory;
  });

  const loadData = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [
        invoiceResponse,
        customerResponse,
        stockResponse,
        storeResponse,
        salespersonResponse,
        paymentOptionResponse,
      ] = await Promise.all([
        api.getAll<SalesInvoice>('/v1/sales-invoices'),
        api.getAll<SalesCustomer>('/v1/customers'),
        api.getAll<StockItem>('/v1/stock'),
        api.getAll<Store>('/v1/stores'),
        api.getAll<Salesperson>('/v1/salesmen'),
        api.get<PaymentOptions>('/v1/payment-options'),
      ]);
      setInvoices(invoiceResponse.data ?? []);
      setCustomers(customerResponse.data ?? []);
      setInventory(stockResponse.data ?? []);
      setStores(storeResponse.data ?? []);
      setSalespeople(salespersonResponse.data ?? []);
      setChequeBanks(paymentOptionResponse.data?.cheque_banks ?? []);
      setBankAccounts(paymentOptionResponse.data?.bank_accounts ?? []);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load sales invoices.'),
      });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesStatus =
        statusFilter === 'all' || invoice.payment_status === statusFilter;
      const matchesSearch =
        !term
        || invoice.Invoice_no.toLowerCase().includes(term)
        || invoice.reference_no?.toLowerCase().includes(term)
        || invoice.Customer_Name?.toLowerCase().includes(term)
        || invoice.Customer_NIC.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [invoices, search, statusFilter]);

  const selectedCustomer = customers.find(
    (customer) => customer.Code === form.customer_code
  );
  const needsBankAccount =
    numeric(form.card_payment) > 0 || numeric(form.bank_transfer) > 0;

  const totals = useMemo(() => {
    const gross = form.items.reduce(
      (sum, line) => sum + numeric(line.qty) * numeric(line.unit_price),
      0
    );
    const lineDiscount = form.items.reduce(
      (sum, line) =>
        sum + discountAmount(
          numeric(line.qty) * numeric(line.unit_price),
          line.discount,
          line.discount_type
        ),
      0
    );
    const headerDiscount = discountAmount(
      Math.max(0, gross - lineDiscount),
      form.discount,
      form.discount_type
    );
    const net = Math.max(0, gross - lineDiscount - headerDiscount);
    const methods =
      numeric(form.cash_payment)
      + numeric(form.card_payment)
      + numeric(form.cheque_payment)
      + numeric(form.bank_transfer);
    const paid = methods + numeric(form.advance_amount);
    return {
      gross,
      discount: lineDiscount + headerDiscount,
      net,
      methods,
      paid,
      credit: Math.max(0, net - paid),
      overpaid: paid > net,
    };
  }, [form]);

  const totalUnits = form.items.reduce((sum, line) => sum + numeric(line.qty), 0);
  const blockReason = !form.customer_code
    ? 'Select a customer to continue.'
    : !form.store_id
      ? 'Select the store the stock is sold from.'
      : form.items.some((line) => !line.item_code || numeric(line.qty) <= 0)
        ? 'Choose an item and quantity on every line.'
        : needsBankAccount && !form.bank_detail_id
          ? 'Choose the bank account for card / bank transfer.'
          : totals.overpaid
            ? 'Payments exceed the invoice net amount.'
            : null;

  const metrics = useMemo(() => ({
    invoices: invoices.length,
    sales: invoices.reduce((sum, invoice) => sum + numeric(invoice.Net_Amount), 0),
    received: invoices.reduce((sum, invoice) => sum + numeric(invoice.paid_amount), 0),
    credit: invoices.reduce((sum, invoice) => sum + numeric(invoice.Credite), 0),
  }), [invoices]);

  if (!canRead) {
    return <OperationNotice type="error">You do not have permission to view sales invoices.</OperationNotice>;
  }

  const openCreate = () => {
    setForm(blankForm());
    setNotice(null);
    setScanNotice(null);
    setShowForm(true);
  };

  const processScan = async (code: string) => {
    let item = findItemByScan(inventoryRef.current, code);

    if (!item) {
      // The item may have been created or given a barcode after this page loaded.
      try {
        const response = await api.get<StockItem[]>(`/v1/stock?search=${encodeURIComponent(code)}`);
        const fresh = findItemByScan(response.data ?? [], code);

        if (fresh) {
          const current = inventoryRef.current;
          const next = current.some((candidate) => candidate.item_code === fresh.item_code)
            ? current.map((candidate) => (candidate.item_code === fresh.item_code ? fresh : candidate))
            : [...current, fresh];
          inventoryRef.current = next;
          setInventory(next);
          item = fresh;
        }
      } catch (error) {
        setScanNotice({ type: 'error', message: getApiErrorMessage(error, `Could not look up "${code}".`) });
        return;
      }
    }

    if (!item) {
      setScanNotice({ type: 'error', message: `Unknown barcode "${code}". No item in this branch uses it.` });
      return;
    }

    const result = applyScanToForm(formRef.current, item);
    if (result.form !== formRef.current) {
      formRef.current = result.form;
      setForm(result.form);
    }
    setScanNotice(result.outcome);
  };

  // Scans are queued so each one is applied after the previous, even when a lookup is slow.
  const handleScan = (code: string) => {
    scanQueueRef.current = scanQueueRef.current
      .then(() => processScan(code))
      .catch(() => undefined);
  };

  const saveQuickCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setCustomerSaving(true);
    setNotice(null);

    try {
      const response = await api.post<SalesCustomer>('/v1/customers', {
        name: customerQuickAdd.name.trim(),
        NIC: customerQuickAdd.NIC.trim(),
        phone: customerQuickAdd.phone.trim() || null,
        address: customerQuickAdd.address.trim() || null,
      });

      const createdCustomer = response.data;
      await loadData();

      if (createdCustomer?.Code) {
        setForm((current) => ({
          ...current,
          customer_code: createdCustomer.Code,
          advance_amount: '0',
        }));
      }

      setShowCustomerQuickAdd(false);
      setCustomerQuickAdd(blankCustomerQuickAdd());
      setNotice({
        type: 'success',
        message: 'Customer created and selected for this invoice.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to create customer.'),
      });
    } finally {
      setCustomerSaving(false);
    }
  };

  const changeStore = (storeId: string) => {
    setForm((current) => ({
      ...current,
      store_id: storeId,
      items: current.items.map((line) => {
        const item = inventory.find((candidate) => candidate.item_code === line.item_code);
        const nextBatch = item?.is_batch
          ? getAvailableBatches(item, storeId).find((candidate) => candidate.batch_no === line.batch_no)
            ?? getAvailableBatches(item, storeId)[0]
          : undefined;

        return {
          ...line,
          batch_no: item?.is_batch ? nextBatch?.batch_no ?? '' : '',
          unit_price: resolveBatchUnitPrice(
            item,
            storeId,
            nextBatch?.batch_no ?? '',
            line.pricing_mode
          ),
          serial_numbers: '',
        };
      }),
    }));
  };

  const updateLine = (
    key: number,
    field: keyof Omit<SaleLineForm, 'key'>,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => {
        if (line.key !== key) return line;

        const nextItemCode = field === 'item_code' ? value : line.item_code;
        const item = inventory.find((candidate) => candidate.item_code === nextItemCode);

        if (field === 'item_code') {
          const firstBatch = getAvailableBatches(item, current.store_id)[0];
          return selectItemOnLine(line, value, item, current.store_id, firstBatch?.batch_no ?? '');
        }

        if (field === 'batch_no') {
          return {
            ...line,
            batch_no: value,
            unit_price: resolveBatchUnitPrice(item, current.store_id, value, line.pricing_mode),
            serial_numbers: '',
          };
        }

        if (field === 'pricing_mode') {
          const pricingMode = value as BatchPricingMode;
          return {
            ...line,
            pricing_mode: pricingMode,
            unit_price: resolveBatchUnitPrice(item, current.store_id, line.batch_no, pricingMode),
          };
        }

        return { ...line, [field]: value };
      }),
    }));
  };

  const updateLineWarranty = (
    key: number,
    warranty: { warranty_enabled: boolean; warranty_months: string }
  ) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => (line.key === key ? { ...line, ...warranty } : line)),
    }));
  };

  const addLine = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, blankLine()],
    }));
  };

  const removeLine = (key: number) => {
    setForm((current) => ({
      ...current,
      items: current.items.length === 1
        ? current.items
        : current.items.filter((line) => line.key !== key),
    }));
  };

  const openPrint = (invoiceId: number) => {
    if (typeof window === 'undefined') return;
    window.open(`/dashboard/sales/${invoiceId}/print`, '_blank', 'noopener,noreferrer');
  };

  const submitInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    const printWindow = openPendingPrintWindow();

    try {
      const response = await api.post<SalesInvoice>('/v1/sales-invoices', {
        invoice_date: form.invoice_date,
        reference_no: form.reference_no || null,
        customer_code: form.customer_code,
        store_id: Number(form.store_id),
        salesman_id: form.salesman_id ? Number(form.salesman_id) : null,
        discount: numeric(form.discount),
        discount_type: form.discount_type,
        advance_amount: numeric(form.advance_amount),
        cash_payment: numeric(form.cash_payment),
        card_payment: numeric(form.card_payment),
        cheque_payment: numeric(form.cheque_payment),
        bank_transfer: numeric(form.bank_transfer),
        bank_detail_id: needsBankAccount ? Number(form.bank_detail_id) : null,
        items: form.items.map((line) => {
          const item = inventory.find((candidate) => candidate.item_code === line.item_code);
          return {
            item_code: line.item_code,
            batch_no: item?.is_batch ? line.batch_no : null,
            qty: Number(line.qty),
            unit_price: numeric(line.unit_price),
            discount: numeric(line.discount),
            discount_type: line.discount_type,
            serial_numbers: item?.is_serialized
              ? parseSerialNumbers(line.serial_numbers)
              : [],
            ...warrantyLinePayload(item, line),
          };
        }),
        cheque: numeric(form.cheque_payment) > 0
          ? {
              bank_id: Number(form.cheque_bank_id),
              bank_branch_id: Number(form.cheque_bank_branch_id),
              cheque_no: form.cheque_no,
              account_no: form.cheque_account_no,
              due_date: form.cheque_due_date,
            }
          : null,
      });

      setShowForm(false);
      await loadData();

      if (response.data?.id) {
        const printUrl = `/dashboard/sales/${response.data.id}/print`;

        if (printWindow && !printWindow.closed) {
          printWindow.location.replace(printUrl);
        } else if (typeof window !== 'undefined') {
          window.open(printUrl, '_blank');
        }
      } else {
        printWindow?.close();
      }

      setNotice({
        type: 'success',
        message: printWindow
          ? 'Sales invoice posted, stock dispatched, and print view opened successfully.'
          : 'Sales invoice posted and stock dispatched. If the print window did not open, allow pop-ups and try again.',
      });
    } catch (error) {
      printWindow?.close();
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to post the sales invoice.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Sales"
        title="Sales Invoices"
        description="Create cash or credit invoices from live store stock, choose the batch pricing basis, track funding accounts, and open the printable bill immediately."
        icon={ReceiptText}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              disabled={customers.length === 0 || stores.length === 0 || inventory.every((item) => item.total_qty <= 0)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" />
              New Sales Invoice
            </button>
          ) : undefined
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      {(customers.length === 0 || stores.length === 0 || inventory.length === 0) && !loading && (
        <OperationNotice type="error">
          Customers, stock items, and stores must be ready before creating sales invoices.
        </OperationNotice>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Invoices" value={metrics.invoices.toLocaleString()} tone="indigo" />
        <OperationMetric label="Net Sales" value={formatCurrency(metrics.sales)} />
        <OperationMetric label="Collected" value={formatCurrency(metrics.received)} tone="emerald" />
        <OperationMetric label="Credit Outstanding" value={formatCurrency(metrics.credit)} tone="amber" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice, customer, or NIC"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="all">All payment statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            <button
              type="button"
              onClick={loadData}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:text-indigo-600"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Invoice</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Store / Salesperson</th>
                <th className="px-5 py-3.5 text-right">Units</th>
                <th className="px-5 py-3.5 text-right">Net</th>
                <th className="px-5 py-3.5 text-right">Credit</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={8} label="Loading sales invoices..." />
              ) : filteredInvoices.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-400">No sales invoices found.</td></tr>
              ) : filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <div className="font-mono text-xs font-bold text-indigo-700">{invoice.Invoice_no}</div>
                    <div className="mt-1 text-xs text-slate-500">{displayDate(invoice.Invoice_date)}</div>
                    {invoice.reference_no && <div className="mt-1 text-xs text-slate-400">Ref: {invoice.reference_no}</div>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">{invoice.Customer_Name || invoice.customer_code}</div>
                    <div className="mt-1 text-xs text-slate-400">{invoice.Customer_NIC}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-700">{invoice.store?.name ?? `Store ${invoice.store_id}`}</div>
                    <div className="mt-1 text-xs text-slate-400">{invoice.salesman?.name || 'No salesperson'}</div>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">
                    {invoice.details.reduce((sum, line) => sum + line.QTY, 0)}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">{formatCurrency(numeric(invoice.Net_Amount))}</td>
                  <td className="px-5 py-4 text-right font-semibold text-amber-700">{formatCurrency(numeric(invoice.Credite))}</td>
                  <td className="px-5 py-4"><StatusPill status={invoice.payment_status} /></td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => openPrint(invoice.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(`/dashboard/sales/${invoice.id}/delivery-order`, '_blank', 'noopener,noreferrer')}
                      className="ml-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Delivery Order
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <OperationModal
          title="New Sales Invoice"
          description="Pick the customer and store, add items from live stock, then record how the invoice is paid."
          icon={ReceiptText}
          onClose={() => !saving && setShowForm(false)}
          width="max-w-[1440px]"
        >
          <form onSubmit={submitInvoice} className="space-y-6 p-6">
            {notice?.type === 'error' && <OperationNotice type="error">{notice.message}</OperationNotice>}

            <FormSection icon={FileText} title="Invoice Details" subtitle="Who is buying, from which store, and when.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
                <Field label="Invoice Date" required className="xl:col-span-2">
                  <IconSlot icon={CalendarDays}>
                    <input type="date" value={form.invoice_date} onChange={(event) => setForm({ ...form, invoice_date: event.target.value })} className={iconInputClass} required />
                  </IconSlot>
                </Field>
                <Field label="Reference" className="xl:col-span-2">
                  <IconSlot icon={Hash}>
                    <input value={form.reference_no} onChange={(event) => setForm({ ...form, reference_no: event.target.value })} placeholder="Optional" className={iconInputClass} />
                  </IconSlot>
                </Field>
                <Field label="Customer" required className="md:col-span-2 xl:col-span-4">
                  <div className="flex gap-2">
                    <IconSlot icon={UserRound} className="flex-1">
                      <SearchSelect
                        value={form.customer_code}
                        onChange={(value) => setForm({ ...form, customer_code: value, advance_amount: '0' })}
                        options={customers.map((customer) => ({ value: customer.Code, label: `${customer.Code} - ${customer.name}`, description: customer.NIC }))}
                        placeholder="Select customer"
                        searchPlaceholder="Search by code, name or NIC..."
                        className={iconInputClass}
                        required
                      />
                    </IconSlot>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerQuickAdd(blankCustomerQuickAdd());
                        setShowCustomerQuickAdd(true);
                      }}
                      title="Add a new customer"
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                    >
                      <UserPlus className="h-4 w-4" />
                      New
                    </button>
                  </div>
                </Field>
                <Field label="Store" required className="xl:col-span-2">
                  <IconSlot icon={Warehouse}>
                    <SearchSelect value={form.store_id} onChange={changeStore} options={stores.map((store) => ({ value: String(store.id), label: store.name }))} placeholder="Select store" searchPlaceholder="Search stores..." className={iconInputClass} required />
                  </IconSlot>
                </Field>
                <Field label="Salesperson" className="xl:col-span-2">
                  <IconSlot icon={UserCheck}>
                    <SearchSelect value={form.salesman_id} onChange={(value) => setForm({ ...form, salesman_id: value })} options={salespeople.map((person) => ({ value: String(person.id), label: person.name }))} title="Select salesperson" emptyOption="No salesperson" searchPlaceholder="Search salespeople..." className={iconInputClass} />
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
                    Advance {formatCurrency(numeric(selectedCustomer.advance_balance))}
                  </span>
                </div>
              )}
            </FormSection>

            <FormSection
              icon={ShoppingCart}
              title="Invoice Items"
              subtitle={form.store_id ? 'Availability is checked against the selected store.' : 'Select a store to see live availability.'}
              action={
                <div className="flex shrink-0 items-center gap-2">
                  <ScanInput
                    onScan={handleScan}
                    disabled={!form.store_id}
                    placeholder={form.store_id ? 'Scan barcode + Enter' : 'Select a store to scan'}
                    className="w-44 sm:w-64"
                  />
                  <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700">
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
                {form.items.map((line, lineIndex) => {
                  const item = inventory.find((candidate) => candidate.item_code === line.item_code);
                  const batches = getAvailableBatches(item, form.store_id);
                  const batch = batches.find((candidate) => candidate.batch_no === line.batch_no);
                  const onHand = item?.is_batch
                    ? batch?.qty_in_hand ?? 0
                    : item?.stores.find((store) => store.store_id === Number(form.store_id))?.qty_in_hand ?? 0;
                  // Other lines selling the same item (and batch) draw from the same stock.
                  const usedElsewhere = form.items
                    .filter((other) => other.key !== line.key && other.item_code === line.item_code && (!item?.is_batch || other.batch_no === line.batch_no))
                    .reduce((sum, other) => sum + numeric(other.qty), 0);
                  const available = Math.max(0, onHand - usedElsewhere);
                  const stockKnown = Boolean(item && form.store_id && (!item.is_batch || line.batch_no));
                  const selectedSerials = serialSelections(line.serial_numbers, line.qty);
                  const availableSerials = item?.available_serials.filter(
                    (serial) => serial.store_id === Number(form.store_id)
                  ) ?? [];
                  const lineGross = numeric(line.qty) * numeric(line.unit_price);
                  const lineNet = Math.max(0, lineGross - discountAmount(lineGross, line.discount, line.discount_type));

                  return (
                    <div key={line.key} className="px-4 py-4 transition hover:bg-slate-50/50">
                      <div className="mb-3 flex items-center justify-between xl:hidden">
                        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-[11px] text-indigo-700">{lineIndex + 1}</span>
                          Item line
                        </span>
                      </div>

                      <div className={`grid grid-cols-2 gap-3 md:grid-cols-6 xl:items-start ${lineGridClass}`}>
                        <span className="hidden h-11 items-center justify-center xl:flex">
                          <LineNumber value={lineIndex + 1} />
                        </span>
                        <LineField label="Item" required className="col-span-2 md:col-span-4 xl:col-span-1">
                          <IconSlot icon={Package}>
                            <SearchSelect
                              value={line.item_code}
                              onChange={(value) => updateLine(line.key, 'item_code', value)}
                              options={inventory.map((stock) => {
                                const qty = storeQty(stock, form.store_id);
                                return {
                                  value: stock.item_code,
                                  label: `${stock.item_code} - ${stock.item_description}`,
                                  description: qty > 0 ? `${qty} in stock${form.store_id ? '' : ' (all stores)'}` : 'Out of stock',
                                  keywords: stock.barcode,
                                  disabled: qty <= 0 && stock.item_code !== line.item_code,
                                };
                              })}
                              placeholder="Select item"
                              searchPlaceholder="Search by code, description or barcode..."
                              className={iconInputClass}
                              required
                            />
                          </IconSlot>
                        </LineField>
                        <LineField label="Batch" required={Boolean(item?.is_batch)} className="col-span-2 xl:col-span-1">
                          {item?.is_batch ? (
                            <IconSlot icon={Layers}>
                              <SearchSelect value={line.batch_no} onChange={(value) => updateLine(line.key, 'batch_no', value)} options={batches.map((candidate) => ({ value: candidate.batch_no, label: candidate.batch_no, description: `${candidate.qty_in_hand} in hand` }))} placeholder="Select batch" searchPlaceholder="Search batches..." className={iconInputClass} required />
                            </IconSlot>
                          ) : (
                            <div className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400">
                              <Layers className="h-4 w-4" />
                              Not batched
                            </div>
                          )}
                        </LineField>
                        <LineField label="Qty" required className="md:col-span-2 xl:col-span-1">
                          <StockQtyInput value={line.qty} onChange={(value) => updateLine(line.key, 'qty', value)} available={stockKnown ? available : null} className={`${fieldClass} text-center tabular-nums`} required />
                          <span className={`mt-1 block text-center text-[11px] font-medium ${stockKnown && available === 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            {stockKnown ? `Max ${available}` : ' '}
                          </span>
                        </LineField>
                        <LineField label="Unit Price" required className="md:col-span-2 xl:col-span-1">
                          <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => updateLine(line.key, 'unit_price', event.target.value)} className={`${fieldClass} text-right tabular-nums`} placeholder="0.00" required />
                        </LineField>
                        <LineField label="Discount" className="col-span-2 xl:col-span-1">
                          <DiscountInput
                            type={line.discount_type}
                            value={line.discount}
                            onTypeChange={(value) => updateLine(line.key, 'discount_type', value)}
                            onValueChange={(value) => updateLine(line.key, 'discount', value)}
                          />
                        </LineField>
                        <LineField label="Line Net" className="md:col-span-5 xl:col-span-1">
                          <div className="flex h-11 items-center justify-end rounded-xl bg-slate-100 px-3.5 text-base font-bold tabular-nums text-slate-950">
                            {formatCurrency(lineNet)}
                          </div>
                        </LineField>
                        <div className="flex items-end md:col-span-1 xl:col-span-1 xl:items-start">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            disabled={form.items.length === 1}
                            title="Remove line"
                            aria-label={`Remove line ${lineIndex + 1}`}
                            className="flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {item && (
                        <div className="mt-3 flex flex-wrap gap-2 xl:pl-12">
                          <Badge icon={Tag}>
                            {item.is_batch ? `${pricingModeLabel(line.pricing_mode)} (set by item master)` : 'Fixed item price'}
                          </Badge>
                          {stockKnown && (
                            <Badge icon={Boxes} tone={available > 0 ? 'emerald' : 'rose'}>
                              {available > 0 ? `${available} available` : 'Out of stock'}
                            </Badge>
                          )}
                          {item.is_serialized && <Badge icon={Barcode} tone="indigo">Serialized item</Badge>}
                          {item.warranty_enabled && (
                            <WarrantyLineControl
                              enabled={line.warranty_enabled}
                              months={line.warranty_months}
                              onChange={(warranty) => updateLineWarranty(line.key, warranty)}
                            />
                          )}
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
                                  updateLine(
                                    line.key,
                                    'serial_numbers',
                                    updateSerialSelection(line.serial_numbers, line.qty, serialIndex, value)
                                  )
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
                onClick={addLine}
                className="flex w-full items-center justify-center gap-2 border-t border-dashed border-slate-200 py-3 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50/60"
              >
                <Plus className="h-4 w-4" /> Add another item
              </button>
            </FormSection>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <FormSection icon={CreditCard} title="Payment" subtitle="Leave a method at 0 if it is not used. Any unpaid amount goes on credit.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Invoice Discount">
                    <DiscountInput
                      type={form.discount_type}
                      value={form.discount}
                      onTypeChange={(value) => setForm({ ...form, discount_type: value })}
                      onValueChange={(value) => setForm({ ...form, discount: value })}
                    />
                  </Field>
                  <Field label="Apply Advance" hint={selectedCustomer ? `Avail. ${formatCurrency(numeric(selectedCustomer.advance_balance))}` : undefined}>
                    <MoneyInput icon={Wallet} value={form.advance_amount} max={numeric(selectedCustomer?.advance_balance)} onChange={(value) => setForm({ ...form, advance_amount: value })} />
                  </Field>
                  <Field label="Cash">
                    <MoneyInput icon={Banknote} value={form.cash_payment} onChange={(value) => setForm({ ...form, cash_payment: value })} />
                  </Field>
                  <Field label="Card">
                    <MoneyInput icon={CreditCard} value={form.card_payment} onChange={(value) => setForm({ ...form, card_payment: value, bank_detail_id: form.bank_detail_id || bankAccounts[0]?.id?.toString() || '' })} />
                  </Field>
                  <Field label="Cheque">
                    <MoneyInput icon={ScrollText} value={form.cheque_payment} onChange={(value) => setForm({ ...form, cheque_payment: value })} />
                  </Field>
                  <Field label="Bank Transfer">
                    <MoneyInput icon={Landmark} value={form.bank_transfer} onChange={(value) => setForm({ ...form, bank_transfer: value, bank_detail_id: form.bank_detail_id || bankAccounts[0]?.id?.toString() || '' })} />
                  </Field>
                </div>

                {needsBankAccount && (
                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                    <Field label="Internal Bank Account" required className="sm:max-w-md">
                      <IconSlot icon={Landmark}>
                        <SearchSelect
                          value={form.bank_detail_id}
                          onChange={(value) => setForm({ ...form, bank_detail_id: value })}
                          options={bankAccounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))}
                          placeholder="Select account"
                          searchPlaceholder="Search bank accounts..."
                          className={iconInputClass}
                          required
                        />
                      </IconSlot>
                    </Field>
                    {bankAccounts.length === 0 && (
                      <OperationNotice type="error">
                        Add an internal bank account before using card or bank transfer on invoices.
                      </OperationNotice>
                    )}
                  </div>
                )}
                {numeric(form.cheque_payment) > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <ScrollText className="h-4 w-4 text-indigo-500" />
                      Cheque Details
                    </div>
                    <ChequeEntryFields
                      banks={chequeBanks}
                      value={{ bank_id: form.cheque_bank_id, bank_branch_id: form.cheque_bank_branch_id, cheque_no: form.cheque_no, account_no: form.cheque_account_no, date: form.cheque_due_date }}
                      onChange={(cheque) => setForm({ ...form, cheque_bank_id: cheque.bank_id, cheque_bank_branch_id: cheque.bank_branch_id, cheque_no: cheque.cheque_no, cheque_account_no: cheque.account_no, cheque_due_date: cheque.date })}
                    />
                  </div>
                )}
              </FormSection>

              <SummaryCard
                icon={Calculator}
                title="Invoice Summary"
                meta={`${form.items.length} ${form.items.length === 1 ? 'line' : 'lines'} · ${totalUnits} ${totalUnits === 1 ? 'unit' : 'units'}`}
              >
                <div className="space-y-2.5 px-5 py-4">
                  <SummaryRow label="Gross amount" value={formatCurrency(totals.gross)} />
                  <SummaryRow label="Discounts" value={totals.discount > 0 ? `− ${formatCurrency(totals.discount)}` : formatCurrency(0)} tone={totals.discount > 0 ? 'rose' : undefined} />
                  <SummaryHighlight label="Net Amount" value={formatCurrency(totals.net)} />
                  <SummaryRow label="Paid + advance" value={formatCurrency(totals.paid)} tone="emerald" />
                </div>
                <div className={`flex items-center justify-between border-t px-5 py-4 ${totals.credit > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <span className={`inline-flex items-center gap-2 text-sm font-semibold ${totals.credit > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {totals.credit > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {totals.credit > 0 ? 'Credit balance' : 'Fully paid'}
                  </span>
                  <span className={`text-lg font-bold tabular-nums ${totals.credit > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>{formatCurrency(totals.credit)}</span>
                </div>
                {totals.overpaid && (
                  <div className="flex items-start gap-2 border-t border-rose-200 bg-rose-50 px-5 py-3 text-xs font-medium text-rose-700">
                    <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                    Payments exceed the invoice net amount by {formatCurrency(totals.paid - totals.net)}.
                  </div>
                )}
              </SummaryCard>
            </div>

            <StickyFormFooter
              blockReason={blockReason}
              readyText={`Ready to post · Net ${formatCurrency(totals.net)}`}
              saving={saving}
              savingLabel="Posting..."
              submitLabel="Post & Print Invoice"
              submitIcon={Printer}
              onCancel={() => setShowForm(false)}
            />
          </form>
        </OperationModal>
      )}

      {showCustomerQuickAdd && (
        <OperationModal
          title="Add customer"
          description="Create a customer profile and continue this invoice."
          icon={UserPlus}
          onClose={() => {
            if (!customerSaving) setShowCustomerQuickAdd(false);
          }}
          width="max-w-2xl"
        >
          <form onSubmit={saveQuickCustomer} className="grid gap-4 p-6 sm:grid-cols-2">
            <OperationField label="Customer name" required>
              <input
                value={customerQuickAdd.name}
                onChange={(event) =>
                  setCustomerQuickAdd((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Full name"
                className={inputClass}
                required
              />
            </OperationField>
            <OperationField label="NIC" required>
              <input
                value={customerQuickAdd.NIC}
                onChange={(event) =>
                  setCustomerQuickAdd((current) => ({
                    ...current,
                    NIC: event.target.value,
                  }))
                }
                minLength={9}
                maxLength={15}
                placeholder="National identity number"
                className={inputClass}
                required
              />
            </OperationField>
            <OperationField label="Mobile number">
              <MobileInput
                value={customerQuickAdd.phone}
                onChange={(phone) =>
                  setCustomerQuickAdd((current) => ({
                    ...current,
                    phone,
                  }))
                }
                className={inputClass}
              />
            </OperationField>
            <OperationField label="Address" className="sm:col-span-2">
              <textarea
                value={customerQuickAdd.address}
                onChange={(event) =>
                  setCustomerQuickAdd((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Postal address"
                className={inputClass}
              />
            </OperationField>
            <div className="sm:col-span-2">
              <OperationActions
                saving={customerSaving}
                submitLabel="Create customer"
                onCancel={() => setShowCustomerQuickAdd(false)}
                disabled={!customerQuickAdd.name.trim() || customerQuickAdd.NIC.trim().length < 9}
              />
            </div>
          </form>
        </OperationModal>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100';
