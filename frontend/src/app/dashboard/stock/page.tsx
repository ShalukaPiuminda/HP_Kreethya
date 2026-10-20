'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  parseSerialNumbers,
  StockItem,
  StockMovement,
  Store,
} from '@/lib/inventory';
import { SearchSelect } from '@/components/search-select';
import { usePopupKeyboard } from '@/lib/use-popup-keyboard';

const emptyReceipt = {
  item_code: '',
  store_id: '',
  qty: '1',
  batch_no: '',
  purchase_price: '',
  sales_price: '',
  serial_numbers: '',
};

interface SerialEditState {
  itemCode: string;
  itemDescription: string;
  transNo: string;
  storeId: number;
  qty: number;
  serialNumbers: string;
}

function serialInputRows(value: string, qty: string): string[] {
  const count = Math.max(0, Number(qty || 0));
  const serials = parseSerialNumbers(value);

  return Array.from({ length: count }, (_, index) => serials[index] || '');
}

function updateSerialInput(value: string, qty: string, index: number, serialNo: string): string {
  const serials = serialInputRows(value, qty);
  serials[index] = serialNo;

  return serials.filter(Boolean).join('\n');
}

export default function StockPage() {
  const { hasPermission } = useAuth();
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [movements, setMovements] = useState<Record<string, StockMovement[]>>({});
  const [movementLoading, setMovementLoading] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [serialEdit, setSerialEdit] = useState<SerialEditState | null>(null);
  const [receipt, setReceipt] = useState(emptyReceipt);
  const [storeForm, setStoreForm] = useState({ name: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockResponse, storeResponse] = await Promise.all([
        api.getAll<StockItem>('/v1/stock'),
        api.getAll<Store>('/v1/stores'),
      ]);
      setInventory(stockResponse.data ?? []);
      setStores(storeResponse.data ?? []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load stock data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const totals = useMemo(() => ({
    items: inventory.length,
    units: inventory.reduce((sum, item) => sum + item.total_qty, 0),
    value: inventory.reduce((sum, item) => sum + item.stock_value, 0),
    low: inventory.filter((item) => item.is_below_reorder).length,
  }), [inventory]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return inventory;
    return inventory.filter((item) =>
      item.item_code.toLowerCase().includes(term)
      || item.item_description.toLowerCase().includes(term)
    );
  }, [inventory, search]);

  const selectedItem = inventory.find((item) => item.item_code === receipt.item_code);

  const openReceipt = (item?: StockItem) => {
    const selected = item;
    setReceipt({
      ...emptyReceipt,
      item_code: selected?.item_code ?? '',
      store_id: '',
      purchase_price: selected && !selected.is_batch
        ? selected.standard_purchase_price.toString()
        : '',
      sales_price: selected && !selected.is_batch
        ? selected.standard_sales_price.toString()
        : '',
    });
    setError(null);
    setShowReceipt(true);
  };

  const changeReceiptItem = (itemCode: string) => {
    const item = inventory.find((candidate) => candidate.item_code === itemCode);
    setReceipt((current) => ({
      ...current,
      item_code: itemCode,
      batch_no: '',
      purchase_price: item && !item.is_batch ? item.standard_purchase_price.toString() : '',
      sales_price: item && !item.is_batch ? item.standard_sales_price.toString() : '',
      serial_numbers: '',
    }));
  };

  const submitReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/v1/stock/receive', {
        item_code: receipt.item_code,
        store_id: Number(receipt.store_id),
        qty: Number(receipt.qty),
        batch_no: selectedItem?.is_batch ? receipt.batch_no : null,
        purchase_price: Number(receipt.purchase_price),
        sales_price: Number(receipt.sales_price),
        serial_numbers: selectedItem?.is_serialized
          ? parseSerialNumbers(receipt.serial_numbers)
          : [],
      });
      setShowReceipt(false);
      setReceipt(emptyReceipt);
      await loadData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to receive opening stock.'));
    } finally {
      setSaving(false);
    }
  };

  const submitStore = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/v1/stores', {
        name: storeForm.name,
        location: storeForm.location || null,
      });
      setShowStore(false);
      setStoreForm({ name: '', location: '' });
      await loadData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to create store.'));
    } finally {
      setSaving(false);
    }
  };

  const submitSerialEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serialEdit) return;

    setSaving(true);
    setError(null);
    try {
      await api.patch(`/v1/stock/opening-serials/${serialEdit.transNo}`, {
        item_code: serialEdit.itemCode,
        store_id: serialEdit.storeId,
        serial_numbers: parseSerialNumbers(serialEdit.serialNumbers),
      });
      setSerialEdit(null);
      setMovements((current) => {
        const next = { ...current };
        delete next[serialEdit.itemCode];
        return next;
      });
      await loadData();
      setExpandedCode(null);
      window.setTimeout(() => {
        void toggleDetails(serialEdit.itemCode);
      }, 0);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to update opening stock serials.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleDetails = async (itemCode: string) => {
    if (expandedCode === itemCode) {
      setExpandedCode(null);
      return;
    }

    setExpandedCode(itemCode);
    if (movements[itemCode]) return;

    setMovementLoading(itemCode);
    try {
      const response = await api.get<StockMovement[]>(`/v1/stock/${itemCode}/movements`);
      setMovements((current) => ({ ...current, [itemCode]: response.data ?? [] }));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load movement history.'));
    } finally {
      setMovementLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Inventory Control</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Stock Levels</h1>
          <p className="mt-1 text-sm text-slate-500">
            Store balances, opening stock, batch pricing, and movement history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission('stores', 'can_create') && (
            <button
              onClick={() => {
                setError(null);
                setShowStore(true);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              Add Store
            </button>
          )}
          {hasPermission('items', 'can_create') && (
            <button
              onClick={() => openReceipt()}
              disabled={inventory.length === 0 || stores.length === 0}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Receive Opening Stock
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Registered Items" value={totals.items.toLocaleString()} />
        <MetricCard label="Units in Stock" value={totals.units.toLocaleString()} />
        <MetricCard label="Stock Value" value={formatCurrency(totals.value)} />
        <MetricCard label="Below Reorder" value={totals.low.toLocaleString()} alert={totals.low > 0} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search item code or description"
            className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            onClick={loadData}
            className="self-start rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Item</th>
                <th className="px-5 py-3.5">Tracking</th>
                <th className="px-5 py-3.5 text-right">Quantity</th>
                <th className="px-5 py-3.5 text-right">Stock Value</th>
                <th className="px-5 py-3.5 text-right">Reorder Level</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Loading stock levels...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    {inventory.length === 0
                      ? 'Create items and stores before receiving opening stock.'
                      : 'No stock items match your search.'}
                  </td>
                </tr>
              ) : filtered.map((item) => (
                <StockRow
                  key={item.item_code}
                  item={item}
                  expanded={expandedCode === item.item_code}
                  movements={movements[item.item_code] ?? []}
                  movementLoading={movementLoading === item.item_code}
                  onToggle={() => toggleDetails(item.item_code)}
                  onReceive={() => openReceipt(item)}
                  onEditSerials={(movement) =>
                    setSerialEdit({
                      itemCode: item.item_code,
                      itemDescription: item.item_description,
                      transNo: movement.trans_no,
                      storeId: movement.store_id,
                      qty: movement.qun_in,
                      serialNumbers: (movement.serial_numbers ?? []).join('\n'),
                    })
                  }
                  canReceive={hasPermission('items', 'can_create') && stores.length > 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showReceipt && (
        <Modal title="Receive Opening Stock" onClose={() => setShowReceipt(false)}>
          <form onSubmit={submitReceipt} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Item</label>
              <SearchSelect
                value={receipt.item_code}
                onChange={changeReceiptItem}
                options={inventory.map((item) => ({ value: item.item_code, label: `${item.item_code} - ${item.item_description}` }))}
                placeholder="Select item"
                searchPlaceholder="Search by code or description..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store">
                <SearchSelect
                  value={receipt.store_id}
                  onChange={(value) => setReceipt({ ...receipt, store_id: value })}
                  options={stores.map((store) => ({ value: String(store.id), label: store.name, description: store.location || undefined }))}
                  placeholder="Select store"
                  searchPlaceholder="Search stores..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  required
                />
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  min="1"
                  value={receipt.qty}
                  onChange={(event) => setReceipt({ ...receipt, qty: event.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  required
                />
              </Field>
            </div>

            {selectedItem?.is_batch && (
              <>
                <Field label="Batch Number">
                  <input
                    value={receipt.batch_no}
                    onChange={(event) => setReceipt({ ...receipt, batch_no: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    placeholder="Example: BATCH-2026-001"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Purchase Price">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={receipt.purchase_price}
                      onChange={(event) => setReceipt({ ...receipt, purchase_price: event.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                      required
                    />
                  </Field>
                  <Field label="Sales Price">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={receipt.sales_price}
                      onChange={(event) => setReceipt({ ...receipt, sales_price: event.target.value })}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                      required
                    />
                  </Field>
                </div>
              </>
            )}

            {selectedItem && !selectedItem.is_batch && (
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyValue label="Purchase Price" value={formatCurrency(selectedItem.standard_purchase_price)} />
                <ReadOnlyValue label="Sales Price" value={formatCurrency(selectedItem.standard_sales_price)} />
              </div>
            )}

            {selectedItem?.is_serialized && (
              <Field label={`Serial Numbers (${receipt.qty || 0} required)`}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {serialInputRows(receipt.serial_numbers, receipt.qty).map((serialNo, serialIndex) => (
                    <input
                      key={serialIndex}
                      value={serialNo}
                      onChange={(event) =>
                        setReceipt({
                          ...receipt,
                          serial_numbers: updateSerialInput(
                            receipt.serial_numbers,
                            receipt.qty,
                            serialIndex,
                            event.target.value
                          ),
                        })
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder={`Serial #${serialIndex + 1}`}
                      required
                    />
                  ))}
                </div>
              </Field>
            )}

            <ModalActions saving={saving} onCancel={() => setShowReceipt(false)} label="Receive Stock" />
          </form>
        </Modal>
      )}

      {showStore && (
        <Modal title="Create Store" onClose={() => setShowStore(false)}>
          <form onSubmit={submitStore} className="space-y-4">
            <Field label="Store Name">
              <input
                value={storeForm.name}
                onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                required
              />
            </Field>
            <Field label="Location">
              <input
                value={storeForm.location}
                onChange={(event) => setStoreForm({ ...storeForm, location: event.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                placeholder="Optional"
              />
            </Field>
            <ModalActions saving={saving} onCancel={() => setShowStore(false)} label="Create Store" />
          </form>
        </Modal>
      )}

      {serialEdit && (
        <Modal title="Edit Opening Stock Serials" onClose={() => setSerialEdit(null)}>
          <form onSubmit={submitSerialEdit} className="space-y-4">
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-semibold text-slate-900">{serialEdit.itemDescription}</div>
              <div className="mt-1 font-mono text-xs">{serialEdit.transNo}</div>
            </div>
            <Field label={`Serial Numbers (${serialEdit.qty} required)`}>
              <div className="grid gap-3 sm:grid-cols-2">
                {serialInputRows(serialEdit.serialNumbers, String(serialEdit.qty)).map((serialNo, serialIndex) => (
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
                                serialIndex,
                                event.target.value
                              ),
                            }
                          : current
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    placeholder={`Serial #${serialIndex + 1}`}
                    required
                  />
                ))}
              </div>
            </Field>
            <p className="text-xs leading-5 text-slate-500">
              Editing is allowed only while the original serial numbers are still available in the same store.
            </p>
            <ModalActions saving={saving} onCancel={() => setSerialEdit(null)} label="Update Serials" />
          </form>
        </Modal>
      )}
    </div>
  );
}

function StockRow({
  item,
  expanded,
  movements,
  movementLoading,
  onToggle,
  onReceive,
  onEditSerials,
  canReceive,
}: {
  item: StockItem;
  expanded: boolean;
  movements: StockMovement[];
  movementLoading: boolean;
  onToggle: () => void;
  onReceive: () => void;
  onEditSerials: (movement: StockMovement) => void;
  canReceive: boolean;
}) {
  return (
    <>
      <tr className={item.is_below_reorder ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}>
        <td className="px-5 py-4">
          <div className="font-mono text-xs font-bold text-indigo-700">{item.item_code}</div>
          <div className="mt-1 font-semibold text-slate-800">{item.item_description}</div>
        </td>
        <td className="px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {item.is_batch && <Badge label="Batch" color="sky" />}
            {item.is_serialized && <Badge label="Serial" color="violet" />}
            {!item.is_batch && !item.is_serialized && <span className="text-slate-400">Standard</span>}
          </div>
        </td>
        <td className="px-5 py-4 text-right text-lg font-bold text-slate-900">{item.total_qty}</td>
        <td className="px-5 py-4 text-right font-semibold text-slate-700">{formatCurrency(item.stock_value)}</td>
        <td className="px-5 py-4 text-right">
          <span className={item.is_below_reorder ? 'font-bold text-amber-700' : 'text-slate-500'}>
            {item.reorder_level}
          </span>
        </td>
        <td className="px-5 py-4">
          <div className="flex justify-end gap-2">
            {canReceive && (
              <button
                onClick={onReceive}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
              >
                Receive
              </button>
            )}
            <button
              onClick={onToggle}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {expanded ? 'Hide Details' : 'View Details'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-5 py-5">
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-800">Store Balances</h3>
                <div className="mt-3 space-y-2">
                  {item.stores.length === 0 ? (
                    <p className="text-sm text-slate-400">No stock has been received.</p>
                  ) : item.stores.map((store) => (
                    <div key={store.store_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{store.store_name}</div>
                        <div className="text-xs text-slate-400">{store.location || 'No location set'}</div>
                      </div>
                      <div className="text-lg font-bold text-slate-900">{store.qty_in_hand}</div>
                    </div>
                  ))}
                </div>

                {item.is_batch && (
                  <>
                    <h3 className="mt-5 text-sm font-bold text-slate-800">Batch Pricing</h3>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead className="text-left uppercase text-slate-400">
                          <tr>
                            <th className="pb-2">Batch</th>
                            <th className="pb-2">Store</th>
                            <th className="pb-2 text-right">Qty</th>
                            <th className="pb-2 text-right">Purchase</th>
                            <th className="pb-2 text-right">Sale</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {item.batches.map((batch) => (
                            <tr key={batch.id}>
                              <td className="py-2 font-mono font-semibold text-slate-700">{batch.batch_no}</td>
                              <td className="py-2 text-slate-600">{batch.store_name}</td>
                              <td className="py-2 text-right font-bold">{batch.qty_in_hand}</td>
                              <td className="py-2 text-right">{formatCurrency(batch.purchase_price)}</td>
                              <td className="py-2 text-right">{formatCurrency(batch.sales_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-800">Recent Movements</h3>
                <div className="mt-3 space-y-2">
                  {movementLoading ? (
                    <p className="text-sm text-slate-400">Loading movements...</p>
                  ) : movements.length === 0 ? (
                    <p className="text-sm text-slate-400">No movements recorded.</p>
                  ) : movements.slice(0, 8).map((movement) => (
                    <div key={movement.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-xs last:border-0">
                      <div>
                        <div className="font-semibold text-slate-700">{movement.trans_code} - {movement.trans_no}</div>
                        <div className="text-slate-400">
                          {movement.store?.name || `Store ${movement.store_id}`}
                          {movement.batch_no ? ` / ${movement.batch_no}` : ''}
                        </div>
                        {movement.serial_numbers && movement.serial_numbers.length > 0 && (
                          <div className="mt-1 text-slate-500">
                            Serials: {movement.serial_numbers.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.is_serialized && movement.trans_code === 'OPS' && movement.qun_in > 0 && (
                          <button
                            type="button"
                            onClick={() => onEditSerials(movement)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50"
                          >
                            Edit Serials
                          </button>
                        )}
                        <div className={movement.qun_in > 0 ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>
                          {movement.qun_in > 0 ? `+${movement.qun_in}` : `-${movement.qun_out}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function MetricCard({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${alert ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${alert ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: 'sky' | 'violet' }) {
  const classes = color === 'sky'
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : 'border-violet-200 bg-violet-50 text-violet-700';
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  usePopupKeyboard(panelRef, onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-xl text-slate-400 transition hover:text-slate-700" aria-label="Close">
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

function ModalActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-slate-300"
      >
        {saving ? 'Saving...' : label}
      </button>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return fallback;
}
