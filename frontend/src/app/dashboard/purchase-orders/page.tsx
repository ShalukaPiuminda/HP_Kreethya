'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ClipboardList,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  XCircle,
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
import { formatCurrency } from '@/lib/inventory';
import {
  dateInputValue,
  displayDate,
  numeric,
  PurchaseItemOption,
  PurchaseOrder,
  SupplierOption,
} from '@/lib/purchases';
import { SearchSelect } from '@/components/search-select';

interface OrderLineForm {
  key: number;
  item_code: string;
  qty: string;
  unit_price: string;
}

interface OrderForm {
  po_date: string;
  expected_date: string;
  supplier_code: string;
  notes: string;
  items: OrderLineForm[];
}

let lineKey = 1;

function blankLine(): OrderLineForm {
  return {
    key: lineKey++,
    item_code: '',
    qty: '1',
    unit_price: '',
  };
}

function blankForm(): OrderForm {
  return {
    po_date: dateInputValue(),
    expected_date: '',
    supplier_code: '',
    notes: '',
    items: [blankLine()],
  };
}

export default function PurchaseOrdersPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('purchases', 'can_read');
  const canCreate = hasPermission('purchases', 'can_create');
  const canUpdate = hasPermission('purchases', 'can_update');
  const canDelete = hasPermission('purchases', 'can_delete');

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [items, setItems] = useState<PurchaseItemOption[]>([]);
  const [form, setForm] = useState<OrderForm>(blankForm);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
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
      const [orderResponse, supplierResponse, itemResponse] = await Promise.all([
        api.getAll<PurchaseOrder>('/v1/purchase-orders'),
        api.getAll<SupplierOption>('/v1/suppliers'),
        api.getAll<PurchaseItemOption>('/v1/items'),
      ]);
      setOrders(orderResponse.data ?? []);
      setSuppliers((supplierResponse.data ?? []).filter((supplier) => supplier.Code));
      setItems(itemResponse.data ?? []);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load purchase orders.'),
      });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesSearch =
        !term
        || order.po_no.toLowerCase().includes(term)
        || order.supplier?.name.toLowerCase().includes(term)
        || order.supplier_code.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [orders, search, statusFilter]);

  const metrics = useMemo(() => ({
    drafts: orders.filter((order) => order.status === 'draft').length,
    open: orders.filter((order) => ['approved', 'partially_received'].includes(order.status)).length,
    received: orders.filter((order) => order.status === 'received').length,
    openValue: orders
      .filter((order) => ['approved', 'partially_received'].includes(order.status))
      .reduce((sum, order) => sum + numeric(order.net_amount), 0),
  }), [orders]);

  const formTotal = useMemo(
    () => form.items.reduce(
      (sum, line) => sum + numeric(line.qty) * numeric(line.unit_price),
      0
    ),
    [form.items]
  );

  if (!canRead) {
    return (
      <OperationNotice type="error">
        You do not have permission to view purchase orders.
      </OperationNotice>
    );
  }

  const openCreate = () => {
    setEditingOrder(null);
    setForm({
      ...blankForm(),
      supplier_code: suppliers[0]?.Code ?? '',
      items: [
        {
          ...blankLine(),
          item_code: items[0]?.item_code ?? '',
          unit_price: items[0] ? String(numeric(items[0].standard_purchase_price)) : '',
        },
      ],
    });
    setNotice(null);
    setShowForm(true);
  };

  const openEdit = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setForm({
      po_date: order.po_date.slice(0, 10),
      expected_date: order.expected_date?.slice(0, 10) ?? '',
      supplier_code: order.supplier_code,
      notes: order.notes ?? '',
      items: order.details.map((detail) => ({
        key: lineKey++,
        item_code: detail.item_code,
        qty: String(detail.qty),
        unit_price: String(numeric(detail.unit_price)),
      })),
    });
    setNotice(null);
    setShowForm(true);
  };

  const updateLine = (
    key: number,
    field: keyof Omit<OrderLineForm, 'key'>,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line) => {
        if (line.key !== key) return line;
        if (field !== 'item_code') return { ...line, [field]: value };

        const selectedItem = items.find((item) => item.item_code === value);
        return {
          ...line,
          item_code: value,
          unit_price: selectedItem
            ? String(numeric(selectedItem.standard_purchase_price))
            : '',
        };
      }),
    }));
  };

  const addLine = () => {
    const selectedItem = items[0];
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          ...blankLine(),
          item_code: selectedItem?.item_code ?? '',
          unit_price: selectedItem
            ? String(numeric(selectedItem.standard_purchase_price))
            : '',
        },
      ],
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

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const payload = {
        po_date: form.po_date,
        expected_date: form.expected_date || null,
        supplier_code: form.supplier_code,
        notes: form.notes || null,
        items: form.items.map((line) => ({
          item_code: line.item_code,
          qty: Number(line.qty),
          unit_price: Number(line.unit_price),
        })),
      };

      if (editingOrder) {
        await api.put(`/v1/purchase-orders/${editingOrder.id}`, payload);
      } else {
        await api.post('/v1/purchase-orders', payload);
      }

      setShowForm(false);
      await loadData();
      setNotice({
        type: 'success',
        message: editingOrder
          ? 'Purchase order updated successfully.'
          : 'Purchase order created as a draft.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to save the purchase order.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const runOrderAction = async (
    order: PurchaseOrder,
    action: 'approve' | 'cancel' | 'delete'
  ) => {
    const prompts = {
      approve: `Approve ${order.po_no}? It will become available for receiving.`,
      cancel: `Cancel ${order.po_no}?`,
      delete: `Delete draft ${order.po_no}?`,
    };
    if (!window.confirm(prompts[action])) return;

    setWorkingId(order.id);
    setNotice(null);
    try {
      if (action === 'delete') {
        await api.delete(`/v1/purchase-orders/${order.id}`);
      } else {
        await api.post(`/v1/purchase-orders/${order.id}/${action}`, {});
      }
      await loadData();
      setNotice({
        type: 'success',
        message:
          action === 'delete'
            ? 'Purchase order deleted successfully.'
            : action === 'cancel'
              ? 'Purchase order cancelled successfully.'
              : 'Purchase order approved successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, `Unable to ${action} the purchase order.`),
      });
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Procurement"
        title="Purchase Orders"
        description="Prepare supplier orders, approve commitments, and track expected versus received quantities."
        icon={ClipboardList}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              disabled={suppliers.length === 0 || items.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <Plus className="h-4 w-4" />
              New Purchase Order
            </button>
          ) : undefined
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      {(suppliers.length === 0 || items.length === 0) && !loading && (
        <OperationNotice type="error">
          Create at least one supplier and one item before preparing purchase orders.
        </OperationNotice>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Draft Orders" value={metrics.drafts.toLocaleString()} tone="indigo" />
        <OperationMetric label="Open Orders" value={metrics.open.toLocaleString()} tone="amber" />
        <OperationMetric label="Received" value={metrics.received.toLocaleString()} tone="emerald" />
        <OperationMetric label="Open Commitment" value={formatCurrency(metrics.openValue)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search PO number or supplier"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="partially_received">Partially received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
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
                <th className="px-5 py-3.5">Order</th>
                <th className="px-5 py-3.5">Supplier</th>
                <th className="px-5 py-3.5">Expected</th>
                <th className="px-5 py-3.5">Progress</th>
                <th className="px-5 py-3.5 text-right">Value</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={7} label="Loading purchase orders..." />
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                    No purchase orders match the current filters.
                  </td>
                </tr>
              ) : filteredOrders.map((order) => {
                const orderedQty = order.details.reduce((sum, line) => sum + line.qty, 0);
                const receivedQty = order.details.reduce((sum, line) => sum + line.received_qty, 0);
                const busy = workingId === order.id;

                return (
                  <tr key={order.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs font-bold text-indigo-700">{order.po_no}</div>
                      <div className="mt-1 text-xs text-slate-500">{displayDate(order.po_date)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{order.supplier?.name ?? order.supplier_code}</div>
                      <div className="mt-1 font-mono text-xs text-slate-400">{order.supplier_code}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{displayDate(order.expected_date)}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800">{receivedQty} / {orderedQty} units</div>
                      <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${orderedQty ? Math.min(100, (receivedQty / orderedQty) * 100) : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-slate-900">
                      {formatCurrency(numeric(order.net_amount))}
                    </td>
                    <td className="px-5 py-4"><StatusPill status={order.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        {order.status === 'draft' && canUpdate && (
                          <>
                            <ActionButton title="Edit" onClick={() => openEdit(order)} disabled={busy}>
                              <Pencil className="h-4 w-4" />
                            </ActionButton>
                            <ActionButton
                              title="Approve"
                              onClick={() => runOrderAction(order, 'approve')}
                              disabled={busy}
                              tone="success"
                            >
                              <Check className="h-4 w-4" />
                            </ActionButton>
                          </>
                        )}
                        {['draft', 'approved'].includes(order.status) && canUpdate && (
                          <ActionButton
                            title="Cancel"
                            onClick={() => runOrderAction(order, 'cancel')}
                            disabled={busy}
                            tone="danger"
                          >
                            <XCircle className="h-4 w-4" />
                          </ActionButton>
                        )}
                        {order.status === 'draft' && canDelete && (
                          <ActionButton
                            title="Delete"
                            onClick={() => runOrderAction(order, 'delete')}
                            disabled={busy}
                            tone="danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
                        )}
                      </div>
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
          title={editingOrder ? `Edit ${editingOrder.po_no}` : 'New Purchase Order'}
          description="Draft orders can be edited until approval."
          onClose={() => !saving && setShowForm(false)}
        >
          <form onSubmit={submitOrder} className="space-y-6 p-6">
            {notice?.type === 'error' && (
              <OperationNotice type="error">{notice.message}</OperationNotice>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OperationField label="Order Date" required>
                <input
                  type="date"
                  value={form.po_date}
                  onChange={(event) => setForm({ ...form, po_date: event.target.value })}
                  className={inputClass}
                  required
                />
              </OperationField>
              <OperationField label="Expected Date">
                <input
                  type="date"
                  min={form.po_date}
                  value={form.expected_date}
                  onChange={(event) => setForm({ ...form, expected_date: event.target.value })}
                  className={inputClass}
                />
              </OperationField>
              <OperationField label="Supplier" required className="md:col-span-2">
                <SearchSelect
                  value={form.supplier_code}
                  onChange={(value) => setForm({ ...form, supplier_code: value })}
                  options={suppliers.map((supplier) => ({ value: supplier.Code, label: `${supplier.Code} - ${supplier.name}` }))}
                  placeholder="Select supplier"
                  searchPlaceholder="Search suppliers..."
                  className={inputClass}
                  required
                />
              </OperationField>
            </div>

            <OperationField label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={2}
                className={inputClass}
                placeholder="Delivery instructions, supplier reference, or internal note"
              />
            </OperationField>

            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Order Lines</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Each item can appear once per order.</p>
                </div>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-slate-200 transition hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Line
                </button>
              </div>
              <div className="content-scrollbar overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3 text-right">Unit Cost</th>
                      <th className="px-4 py-3 text-right">Line Total</th>
                      <th className="w-14 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {form.items.map((line) => (
                      <tr key={line.key}>
                        <td className="px-4 py-3">
                          <SearchSelect
                            value={line.item_code}
                            onChange={(value) => updateLine(line.key, 'item_code', value)}
                            options={items.map((item) => ({
                              value: item.item_code,
                              label: `${item.item_code} - ${item.item_description}`,
                              keywords: item.barcode,
                              disabled: form.items.some((candidate) => candidate.key !== line.key && candidate.item_code === item.item_code),
                            }))}
                            placeholder="Select item"
                            searchPlaceholder="Search by code, description or barcode..."
                            className={inputClass}
                            required
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            value={line.qty}
                            onChange={(event) => updateLine(line.key, 'qty', event.target.value)}
                            className={`${inputClass} text-right`}
                            required
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(event) => updateLine(line.key, 'unit_price', event.target.value)}
                            className={`${inputClass} text-right`}
                            required
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                          {formatCurrency(numeric(line.qty) * numeric(line.unit_price))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            disabled={form.items.length === 1}
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-slate-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-right text-sm font-semibold text-slate-500">
                        Purchase Order Total
                      </td>
                      <td className="px-4 py-4 text-right text-lg font-bold text-slate-950">
                        {formatCurrency(formTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <OperationActions
              saving={saving}
              submitLabel={editingOrder ? 'Save Changes' : 'Create Draft'}
              onCancel={() => setShowForm(false)}
              disabled={!form.supplier_code || form.items.some((line) => !line.item_code)}
            />
          </form>
        </OperationModal>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function ActionButton({
  title,
  onClick,
  disabled,
  tone = 'default',
  children,
}: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  tone?: 'default' | 'success' | 'danger';
  children: React.ReactNode;
}) {
  const classes = {
    default: 'hover:bg-indigo-50 hover:text-indigo-600',
    success: 'hover:bg-emerald-50 hover:text-emerald-600',
    danger: 'hover:bg-rose-50 hover:text-rose-600',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg p-2 text-slate-400 transition disabled:opacity-40 ${classes[tone]}`}
    >
      {children}
    </button>
  );
}
