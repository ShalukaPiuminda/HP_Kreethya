'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  parseSerialNumbers,
  StockItem,
  Store,
} from '@/lib/inventory';
import { SearchSelect } from '@/components/search-select';

const initialForm = {
  item_code: '',
  from_store_id: '',
  to_store_id: '',
  batch_no: '',
  qty: '1',
  serial_numbers: '',
};

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

export default function StockTransfersPage() {
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockResponse, storeResponse] = await Promise.all([
        api.getAll<StockItem>('/v1/stock'),
        api.getAll<Store>('/v1/stores'),
      ]);
      const stock = stockResponse.data ?? [];
      const storeRows = storeResponse.data ?? [];
      setInventory(stock);
      setStores(storeRows);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load transfer data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const selectedItem = inventory.find((item) => item.item_code === form.item_code);
  const sourceStoreId = Number(form.from_store_id);

  const sourceBatches = useMemo(
    () => selectedItem?.batches.filter((batch) => batch.store_id === sourceStoreId && batch.qty_in_hand > 0) ?? [],
    [selectedItem, sourceStoreId]
  );

  const sourceQuantity = useMemo(() => {
    if (!selectedItem) return 0;
    if (selectedItem.is_batch) {
      const batch = sourceBatches.find((candidate) => candidate.batch_no === form.batch_no);
      return batch?.qty_in_hand ?? 0;
    }
    return selectedItem.stores.find((store) => store.store_id === sourceStoreId)?.qty_in_hand ?? 0;
  }, [form.batch_no, selectedItem, sourceBatches, sourceStoreId]);

  const selectedSerials = serialSelections(form.serial_numbers, form.qty);
  const sourceSerials = selectedItem?.available_serials.filter(
    (serial) => serial.store_id === sourceStoreId
  ) ?? [];

  const changeItem = (itemCode: string) => {
    setForm({
      ...initialForm,
      item_code: itemCode,
    });
    setError(null);
    setSuccess(null);
  };

  const changeSource = (storeId: string) => {
    setForm((current) => ({
      ...current,
      from_store_id: storeId,
      to_store_id: current.to_store_id === storeId ? '' : current.to_store_id,
      batch_no: '',
      serial_numbers: '',
    }));
  };

  const submitTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.post<{ trans_no: string }>('/v1/stock/transfer', {
        item_code: form.item_code,
        from_store_id: Number(form.from_store_id),
        to_store_id: Number(form.to_store_id),
        batch_no: selectedItem?.is_batch ? form.batch_no : null,
        qty: Number(form.qty),
        serial_numbers: selectedItem?.is_serialized
          ? parseSerialNumbers(form.serial_numbers)
          : [],
      });
      setSuccess(`Transfer ${response.data?.trans_no ?? ''} completed successfully.`);
      setForm((current) => ({ ...current, qty: '1', serial_numbers: '' }));
      await loadData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to transfer stock.'));
    } finally {
      setSaving(false);
    }
  };

  const transferableItems = inventory.filter((item) => item.total_qty > 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Inventory Control</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Stock Transfers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Move branch stock between stores while preserving batch prices and serial tracking.
        </p>
      </header>

      {error && <Message color="rose">{error}</Message>}
      {success && <Message color="emerald">{success}</Message>}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading available stock...</div>
          ) : stores.length < 2 ? (
            <EmptyState message="Create at least two stores before making a transfer." />
          ) : transferableItems.length === 0 ? (
            <EmptyState message="Receive opening stock before making a transfer." />
          ) : (
            <form onSubmit={submitTransfer} className="space-y-5">
              <Field label="Item">
                <SearchSelect
                  value={form.item_code}
                  onChange={changeItem}
                  options={transferableItems.map((item) => ({ value: item.item_code, label: `${item.item_code} - ${item.item_description}`, description: `${item.total_qty} available` }))}
                  placeholder="Select item"
                  searchPlaceholder="Search by code or description..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  required
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="From Store">
                  <SearchSelect
                    value={form.from_store_id}
                    onChange={changeSource}
                    options={stores.map((store) => {
                      const quantity = selectedItem?.stores.find((row) => row.store_id === store.id)?.qty_in_hand ?? 0;
                      return { value: String(store.id), label: store.name, description: `${quantity} in hand`, disabled: quantity <= 0 };
                    })}
                    placeholder="Select source store"
                    searchPlaceholder="Search stores..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
                <Field label="To Store">
                  <SearchSelect
                    value={form.to_store_id}
                    onChange={(value) => setForm({ ...form, to_store_id: value })}
                    options={stores.filter((store) => store.id !== sourceStoreId).map((store) => ({ value: String(store.id), label: store.name }))}
                    placeholder="Select destination store"
                    searchPlaceholder="Search stores..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
              </div>

              {selectedItem?.is_batch && (
                <Field label="Source Batch">
                  <SearchSelect
                    value={form.batch_no}
                    onChange={(value) => setForm({ ...form, batch_no: value })}
                    options={sourceBatches.map((batch) => ({ value: batch.batch_no, label: batch.batch_no, description: `${batch.qty_in_hand} units` }))}
                    placeholder="Select batch"
                    searchPlaceholder="Search batches..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label={`Quantity (max ${sourceQuantity})`}>
                  <input
                    type="number"
                    min="1"
                    max={sourceQuantity || undefined}
                    value={form.qty}
                    onChange={(event) => setForm({ ...form, qty: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Available</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-800">{sourceQuantity}</div>
                </div>
              </div>

              {selectedItem?.is_serialized && (
                <Field label={`Serial Numbers (${form.qty || 0} required)`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedSerials.map((selectedSerial, serialIndex) => (
                      <SearchSelect
                        key={serialIndex}
                        value={selectedSerial}
                        onChange={(value) =>
                          setForm({
                            ...form,
                            serial_numbers: updateSerialSelection(
                              form.serial_numbers,
                              form.qty,
                              serialIndex,
                              value
                            ),
                          })
                        }
                        options={sourceSerials
                          .filter((serial) => serial.serial_no === selectedSerial || !selectedSerials.includes(serial.serial_no))
                          .map((serial) => ({ value: serial.serial_no, label: serial.serial_no }))}
                        placeholder={`Select serial #${serialIndex + 1}`}
                        searchPlaceholder="Search serial numbers..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                        required
                      />
                    ))}
                  </div>
                </Field>
              )}

              <div className="flex justify-end border-t border-slate-200 pt-5">
                <button
                  type="submit"
                  disabled={saving || sourceQuantity < Number(form.qty)}
                  className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? 'Transferring...' : 'Complete Transfer'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected Item</div>
            <div className="mt-3 font-mono text-sm font-bold text-indigo-300">{selectedItem?.item_code || '-'}</div>
            <div className="mt-1 text-lg font-bold">{selectedItem?.item_description || 'No item selected'}</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniStat label="Total Stock" value={selectedItem?.total_qty ?? 0} />
              <MiniStat label="Source Stock" value={sourceQuantity} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <h2 className="font-bold text-slate-800">Transfer Rules</h2>
            <ul className="mt-3 space-y-2">
              <li>Source inventory is checked before any movement is recorded.</li>
              <li>Batch purchase and sales prices are copied to the destination store.</li>
              <li>Serialized items require exactly one serial number per unit.</li>
              <li>Both movement entries use the same transfer number for audit tracing.</li>
            </ul>
          </div>
        </aside>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function Message({ color, children }: { color: 'rose' | 'emerald'; children: React.ReactNode }) {
  const classes = color === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">{message}</div>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return fallback;
}
