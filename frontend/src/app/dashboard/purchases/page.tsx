'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
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
import { formatCurrency, parseSerialNumbers } from '@/lib/inventory';
import {
  dateInputValue,
  displayDate,
  numeric,
  PurchaseItemOption,
  PurchaseOrder,
  PurchaseReceipt,
  PurchaseStore,
  SupplierOption,
} from '@/lib/purchases';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import type { ChequeBank, PaymentOptions } from '@/lib/payment-options';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';
import { SearchSelect } from '@/components/search-select';
import { ItemFormModal, type Item, type ItemFormState } from '@/components/item-form-modal';
import { ScanInput } from '@/components/scan-input';
import { findItemByScan } from '@/lib/barcode';

type BatchPricingMode = 'batch' | 'average' | 'last';
type DiscountType = 'amount' | 'percent';

interface ReceiptLineForm {
  key: number;
  item_code: string;
  qty: string;
  free_qty: string;
  unit_price: string;
  sales_price: string;
  pricing_mode: BatchPricingMode;
  discount: string;
  discount_type: DiscountType;
  batch_no: string;
  serial_numbers: string;
}

interface ReceiptForm {
  invoice_date: string;
  reference_no: string;
  supplier_code: string;
  purchase_order_no: string;
  store_id: string;
  discount: string;
  discount_type: DiscountType;
  cash_payment: string;
  cheque_payment: string;
  cheque_bank_id: string;
  cheque_bank_branch_id: string;
  cheque_no: string;
  cheque_account_no: string;
  cheque_release_date: string;
  items: ReceiptLineForm[];
}

let receiptLineKey = 1;

interface GrnSerialEditState {
  receiptId: number;
  receiptNo: string;
  detailId: number;
  itemCode: string;
  itemDescription: string;
  qty: number;
  serialNumbers: string;
}

function blankReceiptLine(): ReceiptLineForm {
  return {
    key: receiptLineKey++,
    item_code: '',
    qty: '1',
    free_qty: '0',
    unit_price: '',
    sales_price: '',
    pricing_mode: 'batch',
    discount: '0',
    discount_type: 'amount',
    batch_no: '',
    serial_numbers: '',
  };
}

function blankReceiptForm(): ReceiptForm {
  return {
    invoice_date: dateInputValue(),
    reference_no: '',
    supplier_code: '',
    purchase_order_no: '',
    store_id: '',
    discount: '0',
    discount_type: 'amount',
    cash_payment: '0',
    cheque_payment: '0',
    cheque_bank_id: '',
    cheque_bank_branch_id: '',
    cheque_no: '',
    cheque_account_no: '',
    cheque_release_date: '',
    items: [blankReceiptLine()],
  };
}

function serialInputRows(value: string, qty: string, freeQty: string): string[] {
  const count = Math.max(0, Number(qty || 0) + Number(freeQty || 0));
  const serials = parseSerialNumbers(value);

  return Array.from({ length: count }, (_, index) => serials[index] || '');
}

function updateSerialInput(value: string, qty: string, freeQty: string, index: number, serialNo: string): string {
  const serials = serialInputRows(value, qty, freeQty);
  serials[index] = serialNo;

  return serials.filter(Boolean).join('\n');
}

/** Enter in a serial box (e.g. from a scanner) moves to the next serial box instead of posting the GRN. */
function focusNextSerialInput(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;

  event.preventDefault();
  const group = event.currentTarget.closest('[data-serial-group]');
  const inputs = Array.from(group?.querySelectorAll<HTMLInputElement>('input') ?? []);
  inputs[inputs.indexOf(event.currentTarget) + 1]?.focus();
}

type ScanOutcome = { type: 'success' | 'error'; message: string };

/** Puts an item on a line and resets its prices and tracking details to that item's defaults. */
function applyItemToLine(
  line: ReceiptLineForm,
  itemCode: string,
  item: PurchaseItemOption | undefined
): ReceiptLineForm {
  return {
    ...line,
    item_code: itemCode,
    unit_price: String(numeric(item?.standard_purchase_price)),
    sales_price: String(numeric(item?.standard_sales_price)),
    pricing_mode: (item?.default_batch_price_mode as BatchPricingMode | undefined) ?? 'batch',
    batch_no: '',
    serial_numbers: '',
  };
}

function discountAmount(baseAmount: number, value: string, type: DiscountType): number {
  const discountValue = numeric(value);

  if (discountValue <= 0) return 0;
  if (type === 'percent') {
    return Math.min(baseAmount, (baseAmount * discountValue) / 100);
  }

  return Math.min(baseAmount, discountValue);
}

export default function PurchasesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('purchases', 'can_read');
  const canCreate = hasPermission('purchases', 'can_create');
  const canCreateSupplier = hasPermission('suppliers', 'can_create');
  const canCreateStore = hasPermission('stores', 'can_create');
  const canCreateItem = hasPermission('items', 'can_create');

  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [openOrders, setOpenOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [items, setItems] = useState<PurchaseItemOption[]>([]);
  const [stores, setStores] = useState<PurchaseStore[]>([]);
  const [chequeBanks, setChequeBanks] = useState<ChequeBank[]>([]);
  const [form, setForm] = useState<ReceiptForm>(blankReceiptForm);
  const [showForm, setShowForm] = useState(false);
  const [serialEdit, setSerialEdit] = useState<GrnSerialEditState | null>(null);
  const [quickSupplierOpen, setQuickSupplierOpen] = useState(false);
  const [quickStoreOpen, setQuickStoreOpen] = useState(false);
  const [quickSupplier, setQuickSupplier] = useState({ name: '', phone: '', address: '', type: 'normal' });
  const [quickStore, setQuickStore] = useState({ name: '', location: '' });
  const [newItemLine, setNewItemLine] = useState<{
    lineKey: number;
    initialValues: Partial<ItemFormState>;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [scanNotice, setScanNotice] = useState<ScanOutcome | null>(null);
  // Latest committed form for the scan handler, so fast scans build on each other in order.
  const formRef = useRef(form);

  useLayoutEffect(() => {
    formRef.current = form;
  });

  const loadData = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [receiptResponse, orderResponse, supplierResponse, itemResponse, storeResponse, paymentOptionResponse] =
        await Promise.all([
          api.getAll<PurchaseReceipt>('/v1/purchase-receipts'),
          api.get<PurchaseOrder[]>('/v1/purchase-orders/open'),
          api.getAll<SupplierOption>('/v1/suppliers'),
          api.getAll<PurchaseItemOption>('/v1/items'),
          api.getAll<PurchaseStore>('/v1/stores'),
          api.get<PaymentOptions>('/v1/payment-options'),
        ]);

      setReceipts(receiptResponse.data ?? []);
      setOpenOrders(orderResponse.data ?? []);
      setSuppliers(supplierResponse.data ?? []);
      setItems(itemResponse.data ?? []);
      setStores(storeResponse.data ?? []);
      setChequeBanks(paymentOptionResponse.data?.cheque_banks ?? []);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load purchase receipts.'),
      });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const filteredReceipts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return receipts.filter((receipt) => {
      const matchesStatus =
        statusFilter === 'all' || receipt.payment_status === statusFilter;
      const matchesSearch =
        !term
        || receipt.Invoice_no.toLowerCase().includes(term)
        || receipt.Ref_no?.toLowerCase().includes(term)
        || receipt.supplier?.name.toLowerCase().includes(term)
        || receipt.supplier_code.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [receipts, search, statusFilter]);

  const metrics = useMemo(() => ({
    receipts: receipts.length,
    units: receipts.reduce(
      (sum, receipt) => sum + receipt.details.reduce((lineSum, line) => lineSum + line.QTY + numeric(line.free_qty), 0),
      0
    ),
    purchased: receipts.reduce((sum, receipt) => sum + numeric(receipt.Net_Amount), 0),
    outstanding: receipts.reduce(
      (sum, receipt) => sum + Math.max(0, numeric(receipt.Net_Amount) - numeric(receipt.paid_amount)),
      0
    ),
  }), [receipts]);

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
    const paid = numeric(form.cash_payment) + numeric(form.cheque_payment);
    return {
      gross,
      lineDiscount,
      headerDiscount,
      net,
      paid,
      balance: Math.max(0, net - paid),
      overpaid: paid > net,
    };
  }, [form]);

  const selectedOrder = openOrders.find(
    (order) => order.po_no === form.purchase_order_no
  );
  const availableOrders = openOrders.filter(
    (order) => !form.supplier_code || order.supplier_code === form.supplier_code
  );

  if (!canRead) {
    return (
      <OperationNotice type="error">
        You do not have permission to view purchase receipts.
      </OperationNotice>
    );
  }

  const createLineForItem = (
    item: PurchaseItemOption | undefined,
    quantity = 1,
    unitPrice?: number
  ): ReceiptLineForm => ({
    ...blankReceiptLine(),
    item_code: item?.item_code ?? '',
    qty: String(quantity),
    free_qty: '0',
    unit_price: String(unitPrice ?? numeric(item?.standard_purchase_price)),
    sales_price: String(numeric(item?.standard_sales_price)),
    pricing_mode: (item?.default_batch_price_mode as BatchPricingMode | undefined) ?? 'batch',
  });

  const openCreate = () => {
    setForm(blankReceiptForm());
    setNotice(null);
    setScanNotice(null);
    setShowForm(true);
  };

  /**
   * Applies one scanned item to the draft GRN (never posts, never moves stock).
   * A GRN keeps one line per item, so a repeat scan adds 1 to that line; against a
   * purchase order only ordered items are accepted, up to the remaining quantity.
   */
  const handleScan = (code: string) => {
    const item = findItemByScan(items, code);
    if (!item) {
      setScanNotice({
        type: 'error',
        message: `Unknown barcode "${code}". No item in this branch uses it. If it was just added, reload the page.`,
      });
      return;
    }

    const current = formRef.current;
    const label = `${item.item_code} - ${item.item_description}`;
    const serialHint = item.is_serialized ? ' Enter or scan the serial number for each unit.' : '';
    const order = openOrders.find((candidate) => candidate.po_no === current.purchase_order_no);
    const existing = current.items.find((line) => line.item_code === item.item_code);
    let next: ReceiptForm;
    let outcome: ScanOutcome;

    if (existing) {
      const qty = numeric(existing.qty) + 1;
      if (order) {
        const detail = order.details.find((candidate) => candidate.item_code === item.item_code);
        const remaining = detail ? detail.remaining_qty ?? detail.qty - detail.received_qty : 0;
        if (qty > remaining) {
          setScanNotice({ type: 'error', message: `Only ${remaining} of ${label} remain on ${order.po_no}.` });
          return;
        }
      }

      next = {
        ...current,
        items: current.items.map((line) => (line.key === existing.key ? { ...line, qty: String(qty) } : line)),
      };
      outcome = { type: 'success', message: `${label}: quantity is now ${qty}.${serialHint}` };
    } else {
      if (order) {
        setScanNotice({ type: 'error', message: `${label} is not on purchase order ${order.po_no}.` });
        return;
      }

      const blank = current.items.find((line) => !line.item_code);
      const newLine = createLineForItem(item);
      next = {
        ...current,
        // Newest line goes on top so it stays next to the scan box and Add Line button.
        items: [newLine, ...current.items.filter((line) => line.key !== blank?.key)],
      };
      outcome = {
        type: 'success',
        message: `${label} added.${item.is_batch ? ' Enter the batch number and batch sales price.' : ''}${serialHint}`,
      };
    }

    formRef.current = next;
    setForm(next);
    setScanNotice(outcome);
  };

  const changeSupplier = (supplierCode: string) => {
    setForm((current) => ({
      ...current,
      supplier_code: supplierCode,
      purchase_order_no:
        current.purchase_order_no
        && openOrders.some(
          (order) => order.po_no === current.purchase_order_no && order.supplier_code === supplierCode
        )
          ? current.purchase_order_no
          : '',
    }));
  };

  const changeOrder = (orderNo: string) => {
    const order = openOrders.find((candidate) => candidate.po_no === orderNo);
    if (!order) {
      setForm((current) => ({ ...current, purchase_order_no: '' }));
      return;
    }

    const orderLines = order.details
      .filter((detail) => (detail.remaining_qty ?? detail.qty - detail.received_qty) > 0)
      .map((detail) => {
        const item = items.find((candidate) => candidate.item_code === detail.item_code);
        return createLineForItem(
          item,
          detail.remaining_qty ?? detail.qty - detail.received_qty,
          numeric(detail.unit_price)
        );
      });

    setForm((current) => ({
      ...current,
      supplier_code: order.supplier_code,
      purchase_order_no: order.po_no,
      items: orderLines.length > 0 ? orderLines : current.items,
    }));
  };

  const updateLine = (
    key: number,
    field: keyof Omit<ReceiptLineForm, 'key'>,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => {
        if (line.key !== key) return line;
        if (field !== 'item_code') return { ...line, [field]: value };

        return applyItemToLine(line, value, items.find((candidate) => candidate.item_code === value));
      }),
    }));
  };

  /** Opens the item form from a line's item picker, pre-filled with what was searched. */
  const openNewItem = (lineKey: number, query: string) => {
    // A scanned or typed number is a barcode; anything else starts the description.
    const looksLikeBarcode = /^\d{6,}$/.test(query);
    setNewItemLine({
      lineKey,
      initialValues: looksLikeBarcode ? { barcode: query } : { item_description: query },
    });
  };

  /** Adds the new item to the picker list and selects it on the line it was created from. */
  const handleItemCreated = (saved: Item) => {
    const lineKey = newItemLine?.lineKey;
    setItems((current) => [...current, saved]);
    setNewItemLine(null);
    if (lineKey === undefined) return;

    setForm((current) => ({
      ...current,
      items: current.items.map((line) => (
        line.key === lineKey ? applyItemToLine(line, saved.item_code, saved) : line
      )),
    }));
    setScanNotice({
      type: 'success',
      message: `${saved.item_code} - ${saved.item_description} created and added. Enter the quantity and unit cost.`,
    });
  };

  const addLine = () => {
    setForm((current) => ({
      ...current,
      items: [blankReceiptLine(), ...current.items],
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

  const submitReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      await api.post('/v1/purchase-receipts', {
        invoice_date: form.invoice_date,
        reference_no: form.reference_no || null,
        supplier_code: form.supplier_code,
        purchase_order_no: form.purchase_order_no || null,
        store_id: Number(form.store_id),
        discount: numeric(form.discount),
        discount_type: form.discount_type,
        cash_payment: numeric(form.cash_payment),
        cheque_payment: numeric(form.cheque_payment),
        items: form.items.map((line) => {
          const item = items.find((candidate) => candidate.item_code === line.item_code);
          return {
            item_code: line.item_code,
            qty: Number(line.qty),
            free_qty: Number(line.free_qty || 0),
            unit_price: numeric(line.unit_price),
            sales_price: item?.is_batch ? numeric(line.sales_price) : undefined,
            price_mode: item?.is_batch ? line.pricing_mode : null,
            discount: numeric(line.discount),
            discount_type: line.discount_type,
            batch_no: item?.is_batch ? line.batch_no : null,
            serial_numbers: item?.is_serialized
              ? parseSerialNumbers(line.serial_numbers)
              : [],
          };
        }),
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
      await loadData();
      setNotice({
        type: 'success',
        message: 'Purchase receipt posted and stock updated successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to post the purchase receipt.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const openSerialEdit = (receipt: PurchaseReceipt, detailId: number) => {
    const detail = receipt.details.find((line) => line.id === detailId);
    if (!detail) return;

    setSerialEdit({
      receiptId: receipt.id,
      receiptNo: receipt.Invoice_no,
      detailId: detail.id,
      itemCode: detail.Item_code,
      itemDescription: detail.Item_description ?? detail.item?.item_description ?? detail.Item_code,
      qty: detail.QTY + numeric(detail.free_qty),
      serialNumbers: (detail.serial_numbers ?? []).join('\n'),
    });
    setNotice(null);
  };

  const submitSerialEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serialEdit) return;

    setSaving(true);
    setNotice(null);
    try {
      await api.patch(`/v1/purchase-receipts/${serialEdit.receiptId}/serials`, {
        detail_id: serialEdit.detailId,
        serial_numbers: parseSerialNumbers(serialEdit.serialNumbers),
      });
      setSerialEdit(null);
      await loadData();
      setNotice({
        type: 'success',
        message: 'GRN serial numbers updated successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to update GRN serial numbers.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const submitQuickSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await api.post<SupplierOption>('/v1/suppliers', {
        name: quickSupplier.name,
        phone: quickSupplier.phone || null,
        address: quickSupplier.address || null,
        type: quickSupplier.type,
      });
      const created = response.data;
      if (created) {
        setSuppliers((current) => [...current, created].sort((a, b) => a.Code.localeCompare(b.Code)));
        setForm((current) => ({ ...current, supplier_code: created.Code, purchase_order_no: '' }));
      }
      setQuickSupplier({ name: '', phone: '', address: '', type: 'normal' });
      setQuickSupplierOpen(false);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to create supplier.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const submitQuickStore = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await api.post<PurchaseStore>('/v1/stores', {
        name: quickStore.name,
        location: quickStore.location || null,
      });
      const created = response.data;
      if (created) {
        setStores((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
        setForm((current) => ({ ...current, store_id: created.id.toString() }));
      }
      setQuickStore({ name: '', location: '' });
      setQuickStoreOpen(false);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to create store.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Procurement"
        title="Purchase Receipts"
        description="Receive supplier deliveries into a store, preserve batch and serial tracking, and create the supplier payable."
        icon={PackageCheck}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              disabled={suppliers.length === 0 || items.length === 0 || stores.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" />
              New GRN
            </button>
          ) : undefined
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      {(suppliers.length === 0 || items.length === 0 || stores.length === 0) && !loading && (
        <OperationNotice type="error">
          Suppliers, items, and at least one store are required before receiving stock.
        </OperationNotice>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Receipts" value={metrics.receipts.toLocaleString()} tone="indigo" />
        <OperationMetric label="Units Received" value={metrics.units.toLocaleString()} tone="emerald" />
        <OperationMetric label="Purchase Value" value={formatCurrency(metrics.purchased)} />
        <OperationMetric label="Supplier Outstanding" value={formatCurrency(metrics.outstanding)} tone="amber" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search GRN, supplier invoice, or supplier"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="all">All payment statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Receipt</th>
                <th className="px-5 py-3.5">Supplier</th>
                <th className="px-5 py-3.5">Order / Store</th>
                <th className="px-5 py-3.5 text-right">Items</th>
                <th className="px-5 py-3.5 text-right">Net Amount</th>
                <th className="px-5 py-3.5 text-right">Outstanding</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Serials</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={8} label="Loading purchase receipts..." />
              ) : filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400">
                    No purchase receipts match the current filters.
                  </td>
                </tr>
              ) : filteredReceipts.map((receipt) => {
                const units = receipt.details.reduce((sum, line) => sum + line.QTY + numeric(line.free_qty), 0);
                const outstanding = Math.max(
                  0,
                  numeric(receipt.Net_Amount) - numeric(receipt.paid_amount)
                );
                const serializedDetails = receipt.details.filter((line) => line.item?.is_serialized || (line.serial_numbers?.length ?? 0) > 0);
                return (
                  <tr key={receipt.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs font-bold text-indigo-700">{receipt.Invoice_no}</div>
                      <div className="mt-1 text-xs text-slate-500">{displayDate(receipt.Invoice_date)}</div>
                      {receipt.Ref_no && <div className="mt-1 text-xs text-slate-400">Ref: {receipt.Ref_no}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{receipt.supplier?.name ?? receipt.supplier_code}</div>
                      <div className="mt-1 font-mono text-xs text-slate-400">{receipt.supplier_code}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs font-semibold text-slate-700">
                        {receipt.purchase_order_no || 'Direct receipt'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{receipt.store?.name ?? `Store ${receipt.store_id}`}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="font-bold text-slate-900">{units}</div>
                      <div className="text-xs text-slate-400">{receipt.details.length} lines</div>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(numeric(receipt.Net_Amount))}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-amber-700">
                      {formatCurrency(outstanding)}
                    </td>
                    <td className="px-5 py-4"><StatusPill status={receipt.payment_status} /></td>
                    <td className="px-5 py-4 text-right">
                      {serializedDetails.length === 0 ? (
                        <span className="text-xs text-slate-400">No serials</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1.5">
                          {serializedDetails.map((detail) => (
                            <button
                              key={detail.id}
                              type="button"
                              onClick={() => openSerialEdit(receipt, detail.id)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                            >
                              Edit {detail.Item_code}
                            </button>
                          ))}
                        </div>
                      )}
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
          title="New Purchase Receipt"
          description="Posting a GRN immediately updates store stock and supplier outstanding."
          onClose={() => !saving && setShowForm(false)}
          width="max-w-6xl"
        >
          <form onSubmit={submitReceipt} className="space-y-6 p-6">
            {notice?.type === 'error' && (
              <OperationNotice type="error">{notice.message}</OperationNotice>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OperationField label="Receipt Date" required>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={(event) => setForm({ ...form, invoice_date: event.target.value })}
                  className={inputClass}
                  required
                />
              </OperationField>
              <OperationField label="Supplier Invoice Ref">
                <input
                  value={form.reference_no}
                  onChange={(event) => setForm({ ...form, reference_no: event.target.value })}
                  className={inputClass}
                  placeholder="Optional reference"
                />
              </OperationField>
              <OperationField label="Supplier" required>
                <div className="flex gap-2">
                  <SearchSelect
                    value={form.supplier_code}
                    onChange={changeSupplier}
                    options={suppliers.map((supplier) => ({ value: supplier.Code, label: `${supplier.Code} - ${supplier.name}` }))}
                    placeholder="Select supplier"
                    searchPlaceholder="Search suppliers..."
                    className={inputClass}
                    wrapperClassName="flex-1"
                    required
                  />
                  {canCreateSupplier && (
                    <button type="button" onClick={() => setQuickSupplierOpen(true)} className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50">
                      Add
                    </button>
                  )}
                </div>
              </OperationField>
              <OperationField label="Receiving Store" required>
                <div className="flex gap-2">
                  <SearchSelect
                    value={form.store_id}
                    onChange={(value) => setForm({ ...form, store_id: value })}
                    options={stores.map((store) => ({ value: String(store.id), label: store.name, description: store.location || undefined }))}
                    placeholder="Select store"
                    searchPlaceholder="Search stores..."
                    className={inputClass}
                    wrapperClassName="flex-1"
                    required
                  />
                  {canCreateStore && (
                    <button type="button" onClick={() => setQuickStoreOpen(true)} className="shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50">
                      Add
                    </button>
                  )}
                </div>
              </OperationField>
            </div>

            <OperationField
              label="Purchase Order"
              help="Optional for direct receipts. Selecting an order loads its remaining quantities."
            >
              <SearchSelect
                value={form.purchase_order_no}
                onChange={changeOrder}
                options={availableOrders.map((order) => ({ value: order.po_no, label: order.po_no, description: order.supplier?.name ?? order.supplier_code }))}
                title="Select purchase order"
                emptyOption="Direct receipt without purchase order"
                searchPlaceholder="Search purchase orders..."
                className={inputClass}
              />
            </OperationField>

            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Received Items</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedOrder
                      ? `Receiving against ${selectedOrder.po_no}. Quantities cannot exceed the remaining order.`
                      : 'Add supplier delivery lines and tracking information.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ScanInput onScan={handleScan} placeholder="Scan barcode + Enter" className="w-44 sm:w-64" />
                  {!selectedOrder && (
                    <button
                      type="button"
                      onClick={addLine}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-slate-200 transition hover:bg-indigo-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Line
                    </button>
                  )}
                </div>
              </div>
              {scanNotice && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-2 border-b px-4 py-2.5 text-xs font-semibold ${
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
              <div className="space-y-3 p-4">
                {form.items.map((line) => {
                  const item = items.find((candidate) => candidate.item_code === line.item_code);
                  const orderDetail = selectedOrder?.details.find(
                    (detail) => detail.item_code === line.item_code
                  );
                  const maxQuantity =
                    orderDetail?.remaining_qty
                    ?? (orderDetail ? orderDetail.qty - orderDetail.received_qty : undefined);

                  return (
                    <div key={line.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
                        <OperationField label="Item" required className="xl:col-span-2">
                          <SearchSelect
                            value={line.item_code}
                            onChange={(value) => updateLine(line.key, 'item_code', value)}
                            options={items.map((candidate) => ({
                              value: candidate.item_code,
                              label: `${candidate.item_code} - ${candidate.item_description}`,
                              keywords: candidate.barcode,
                              disabled: form.items.some((existing) => existing.key !== line.key && existing.item_code === candidate.item_code),
                            }))}
                            placeholder="Select item"
                            searchPlaceholder="Search by code, description or barcode..."
                            createAction={canCreateItem ? {
                              label: 'Add new item',
                              onCreate: (query) => openNewItem(line.key, query),
                            } : undefined}
                            className={inputClass}
                            disabled={Boolean(selectedOrder)}
                            required
                          />
                        </OperationField>
                        <OperationField
                          label={`Quantity${maxQuantity ? ` (max ${maxQuantity})` : ''}`}
                          required
                        >
                          <input
                            type="number"
                            min="1"
                            max={maxQuantity}
                            value={line.qty}
                            onChange={(event) => updateLine(line.key, 'qty', event.target.value)}
                            className={inputClass}
                            required
                          />
                        </OperationField>
                        <OperationField label="Free Qty">
                          <input
                            type="number"
                            min="0"
                            value={line.free_qty}
                            onChange={(event) => updateLine(line.key, 'free_qty', event.target.value)}
                            className={inputClass}
                          />
                        </OperationField>
                        <OperationField label="Unit Cost" required>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(event) => updateLine(line.key, 'unit_price', event.target.value)}
                            className={inputClass}
                            required
                          />
                        </OperationField>
                        <OperationField label="Line Discount" className="xl:col-span-2">
                          <div className="flex min-w-0 gap-2">
                            <select value={line.discount_type} onChange={(event) => updateLine(line.key, 'discount_type', event.target.value)} className={discountTypeClass}>
                              <option value="amount">LKR</option>
                              <option value="percent">%</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              max={line.discount_type === 'percent' ? 100 : undefined}
                              step="0.01"
                              value={line.discount}
                              onChange={(event) => updateLine(line.key, 'discount', event.target.value)}
                              className={discountAmountClass}
                            />
                          </div>
                        </OperationField>
                        <div className="flex items-end justify-between gap-3">
                          <div className="pb-2.5 text-right">
                            <div className="text-xs text-slate-400">Line Net</div>
                            <div className="font-bold text-slate-900">
                              {formatCurrency(
                                Math.max(
                                  0,
                                  numeric(line.qty) * numeric(line.unit_price) - discountAmount(numeric(line.qty) * numeric(line.unit_price), line.discount, line.discount_type)
                                )
                              )}
                            </div>
                          </div>
                          {!selectedOrder && (
                            <button
                              type="button"
                              onClick={() => removeLine(line.key)}
                              disabled={form.items.length === 1}
                              className="mb-1 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                              title="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {(item?.is_batch || item?.is_serialized) && (
                        <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-3">
                          {item.is_batch && (
                            <>
                              <OperationField label="Default Sales Price Mode">
                                <select
                                  value={line.pricing_mode}
                                  onChange={(event) => updateLine(line.key, 'pricing_mode', event.target.value)}
                                  className={inputClass}
                                >
                                  <option value="batch">Batch price</option>
                                  <option value="average">Average of all batches</option>
                                  <option value="last">Last batch price</option>
                                </select>
                              </OperationField>
                              <OperationField label="Batch Number" required>
                                <input
                                  value={line.batch_no}
                                  onChange={(event) => updateLine(line.key, 'batch_no', event.target.value)}
                                  className={inputClass}
                                  placeholder="Supplier batch or lot"
                                  required
                                />
                              </OperationField>
                              <OperationField label="Batch Sales Price" required>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={line.sales_price}
                                  onChange={(event) => updateLine(line.key, 'sales_price', event.target.value)}
                                  className={inputClass}
                                  required
                                />
                              </OperationField>
                              <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 md:col-span-2 xl:col-span-3">
                                This setting becomes the item’s default sales pricing mode for future sales invoices.
                              </div>
                            </>
                          )}
                          {item.is_serialized && (
                            <OperationField
                              label={`Serial Numbers (${(Number(line.qty) || 0) + (Number(line.free_qty) || 0)} required)`}
                              className={item.is_batch ? '' : 'md:col-span-2 xl:col-span-3'}
                            >
                              <div data-serial-group className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {serialInputRows(line.serial_numbers, line.qty, line.free_qty).map((serialNo, serialIndex) => (
                                  <input
                                    key={serialIndex}
                                    value={serialNo}
                                    onKeyDown={focusNextSerialInput}
                                    autoComplete="off"
                                    onChange={(event) =>
                                      updateLine(
                                        line.key,
                                        'serial_numbers',
                                        updateSerialInput(line.serial_numbers, line.qty, line.free_qty, serialIndex, event.target.value)
                                      )
                                    }
                                    className={inputClass}
                                    placeholder={`Serial #${serialIndex + 1}`}
                                    required
                                  />
                                ))}
                              </div>
                            </OperationField>
                          )}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
                        <span>
                          Billed quantity: {line.qty || 0}
                        </span>
                        <span>
                          Free quantity: {line.free_qty || 0}
                        </span>
                        <span>
                          Total stock received: {(Number(line.qty) || 0) + (Number(line.free_qty) || 0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">Immediate Payment</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Leave payment values at zero to create a fully outstanding supplier invoice.
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <OperationField label="Header Discount">
                    <div className="flex min-w-0 gap-2">
                      <select value={form.discount_type} onChange={(event) => setForm({ ...form, discount_type: event.target.value as DiscountType })} className={discountTypeClass}>
                        <option value="amount">LKR</option>
                        <option value="percent">%</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        max={form.discount_type === 'percent' ? 100 : undefined}
                        step="0.01"
                        value={form.discount}
                        onChange={(event) => setForm({ ...form, discount: event.target.value })}
                        className={discountAmountClass}
                      />
                    </div>
                  </OperationField>
                  <OperationField label="Cash Payment">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cash_payment}
                      onChange={(event) => setForm({ ...form, cash_payment: event.target.value })}
                      className={inputClass}
                    />
                  </OperationField>
                  <OperationField label="Cheque Payment">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.cheque_payment}
                      onChange={(event) => setForm({ ...form, cheque_payment: event.target.value })}
                      className={inputClass}
                    />
                  </OperationField>
                </div>

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
                  Receipt Summary
                </div>
                <SummaryRow label="Gross" value={formatCurrency(totals.gross)} />
                <SummaryRow
                  label="Discounts"
                  value={formatCurrency(totals.lineDiscount + totals.headerDiscount)}
                />
                <SummaryRow label="Net Amount" value={formatCurrency(totals.net)} emphasis />
                <SummaryRow label="Paid Now" value={formatCurrency(totals.paid)} />
                <div className="mt-4 border-t border-white/10 pt-4">
                  <SummaryRow label="Supplier Balance" value={formatCurrency(totals.balance)} emphasis />
                </div>
                {totals.overpaid && (
                  <div className="mt-4 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200">
                    Immediate payment cannot exceed the receipt net amount.
                  </div>
                )}
              </aside>
            </div>

            <OperationActions
              saving={saving}
              submitLabel="Post GRN"
              onCancel={() => setShowForm(false)}
              disabled={
                totals.overpaid
                || !form.supplier_code
                || !form.store_id
                || form.items.some((line) => !line.item_code)
              }
            />
          </form>
        </OperationModal>
      )}

      {serialEdit && (
        <OperationModal
          title="Edit GRN Serial Numbers"
          description="Serials can be changed only while the original received serials are still available in the receiving store."
          onClose={() => !saving && setSerialEdit(null)}
          width="max-w-2xl"
        >
          <form onSubmit={submitSerialEdit} className="space-y-5 p-6">
            {notice?.type === 'error' && (
              <OperationNotice type="error">{notice.message}</OperationNotice>
            )}
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <div className="font-bold text-slate-900">{serialEdit.itemDescription}</div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                {serialEdit.receiptNo} / {serialEdit.itemCode}
              </div>
            </div>
            <OperationField label={`Serial Numbers (${serialEdit.qty} required)`} required>
              <div className="grid gap-3 sm:grid-cols-2">
                {serialInputRows(serialEdit.serialNumbers, String(serialEdit.qty), '0').map((serialNo, serialIndex) => (
                  <input
                    key={serialIndex}
                    value={serialNo}
                    onChange={(event) =>
                      setSerialEdit((current) =>
                        current
                          ? {
                              ...current,
                              serialNumbers: updateSerialInput(
                                current.serialNumbers,
                                String(current.qty),
                                '0',
                                serialIndex,
                                event.target.value
                              ),
                            }
                          : current
                      )
                    }
                    className={inputClass}
                    placeholder={`Serial #${serialIndex + 1}`}
                    required
                  />
                ))}
              </div>
            </OperationField>
            <OperationActions
              onCancel={() => setSerialEdit(null)}
              saving={saving}
              submitLabel="Update Serials"
            />
          </form>
        </OperationModal>
      )}

      {quickSupplierOpen && (
        <OperationModal title="Add Supplier" description="Create a supplier without leaving the GRN." onClose={() => !saving && setQuickSupplierOpen(false)} width="max-w-xl">
          <form onSubmit={submitQuickSupplier} className="space-y-4 p-6">
            <OperationField label="Supplier Name" required>
              <input value={quickSupplier.name} onChange={(event) => setQuickSupplier({ ...quickSupplier, name: event.target.value })} className={inputClass} required />
            </OperationField>
            <OperationField label="Supplier Type" required>
              <select value={quickSupplier.type} onChange={(event) => setQuickSupplier({ ...quickSupplier, type: event.target.value })} className={inputClass} required>
                <option value="normal">Inventory supplier</option>
                <option value="service">Service supplier</option>
              </select>
            </OperationField>
            <OperationField label="Phone">
              <input value={quickSupplier.phone} onChange={(event) => setQuickSupplier({ ...quickSupplier, phone: event.target.value })} className={inputClass} pattern={PHONE_PATTERN} title={PHONE_TITLE} />
            </OperationField>
            <OperationField label="Address">
              <textarea value={quickSupplier.address} onChange={(event) => setQuickSupplier({ ...quickSupplier, address: event.target.value })} className={inputClass} rows={3} />
            </OperationField>
            <OperationActions saving={saving} submitLabel="Add Supplier" onCancel={() => setQuickSupplierOpen(false)} disabled={!quickSupplier.name.trim()} />
          </form>
        </OperationModal>
      )}

      {quickStoreOpen && (
        <OperationModal title="Add Store" description="Create a receiving store without leaving the GRN." onClose={() => !saving && setQuickStoreOpen(false)} width="max-w-xl">
          <form onSubmit={submitQuickStore} className="space-y-4 p-6">
            <OperationField label="Store Name" required>
              <input value={quickStore.name} onChange={(event) => setQuickStore({ ...quickStore, name: event.target.value })} className={inputClass} required />
            </OperationField>
            <OperationField label="Location">
              <input value={quickStore.location} onChange={(event) => setQuickStore({ ...quickStore, location: event.target.value })} className={inputClass} />
            </OperationField>
            <OperationActions saving={saving} submitLabel="Add Store" onCancel={() => setQuickStoreOpen(false)} disabled={!quickStore.name.trim()} />
          </form>
        </OperationModal>
      )}

      {newItemLine && (
        <ItemFormModal
          initialValues={newItemLine.initialValues}
          onClose={() => setNewItemLine(null)}
          onSaved={handleItemCreated}
        />
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
const discountTypeClass = `${inputClass} !w-24 shrink-0`;
const discountAmountClass = `${inputClass} !w-auto min-w-0 flex-1`;

function SummaryRow({
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
