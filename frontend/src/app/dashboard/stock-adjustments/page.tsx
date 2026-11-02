'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardPen, Plus, RefreshCcw } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  ADJUSTMENT_REASONS,
  AdjustmentReason,
  parseSerialNumbers,
  StockAdjustment,
  StockItem,
  Store,
} from '@/lib/inventory';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { SearchSelect } from '@/components/search-select';
import { ScanInput } from '@/components/scan-input';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm';

const initialForm = {
  item_code: '',
  store_id: '',
  batch_no: '',
  new_qty: '',
  reason: '' as AdjustmentReason | '',
  note: '',
  added_serials: '',
  removed_serials: [] as string[],
};

const initialFilters = {
  search: '',
  store_id: '',
  reason: '',
  from: '',
  to: '',
};

type Meta = { current_page: number; last_page: number; total: number };

function reasonLabel(reason: string): string {
  return ADJUSTMENT_REASONS.find((option) => option.value === reason)?.label ?? reason;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default function StockAdjustmentsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('stock-adjustments', 'can_create');

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '25' });
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const response = await api.get<StockAdjustment[]>(`/v1/stock-adjustments?${params.toString()}`);
      setAdjustments(response.data ?? []);
      setMeta(response.meta ?? null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load stock adjustments.'));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  const loadStock = useCallback(async () => {
    const [stockResponse, storeResponse] = await Promise.all([
      api.getAll<StockItem>('/v1/stock'),
      api.getAll<Store>('/v1/stores'),
    ]);
    setInventory(stockResponse.data ?? []);
    setStores(storeResponse.data ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadAdjustments, 0);
    return () => window.clearTimeout(timer);
  }, [loadAdjustments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadStock().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStock]);

  const selectedItem = inventory.find((item) => item.item_code === form.item_code);
  const storeId = Number(form.store_id);

  const storeBatches = useMemo(
    () => selectedItem?.batches.filter((batch) => batch.store_id === storeId) ?? [],
    [selectedItem, storeId]
  );

  const currentQty = useMemo(() => {
    if (!selectedItem || !storeId) return null;
    if (selectedItem.is_batch) {
      if (!form.batch_no) return null;
      return storeBatches.find((batch) => batch.batch_no === form.batch_no)?.qty_in_hand ?? 0;
    }
    return selectedItem.stores.find((store) => store.store_id === storeId)?.qty_in_hand ?? 0;
  }, [form.batch_no, selectedItem, storeBatches, storeId]);

  const newQty = form.new_qty === '' ? null : Number(form.new_qty);
  const diff = currentQty !== null && newQty !== null && Number.isFinite(newQty) ? newQty - currentQty : 0;

  const storeSerials = selectedItem?.available_serials.filter((serial) => serial.store_id === storeId) ?? [];
  const addedSerials = parseSerialNumbers(form.added_serials);
  const serialsNeeded = selectedItem?.is_serialized ? Math.abs(diff) : 0;
  const serialsReady = !selectedItem?.is_serialized || diff === 0
    || (diff > 0 ? new Set(addedSerials).size === diff && addedSerials.length === diff : form.removed_serials.length === -diff);

  const formReady = Boolean(
    selectedItem && storeId && currentQty !== null && newQty !== null && newQty >= 0
    && diff !== 0 && form.reason && form.note.trim().length >= 5 && serialsReady
  );

  const openModal = () => {
    setForm(initialForm);
    setConfirming(false);
    setFormError(null);
    setModalOpen(true);
    loadStock().catch((requestError) => setFormError(getApiErrorMessage(requestError, 'Unable to load stock.')));
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const updateForm = (changes: Partial<typeof initialForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setConfirming(false);
  };

  const toggleRemovedSerial = (serialNo: string) => {
    setForm((current) => ({
      ...current,
      removed_serials: current.removed_serials.includes(serialNo)
        ? current.removed_serials.filter((serial) => serial !== serialNo)
        : [...current.removed_serials, serialNo],
    }));
    setConfirming(false);
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formReady || !selectedItem || currentQty === null || newQty === null) return;

    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await api.post<StockAdjustment>('/v1/stock-adjustments', {
        item_code: form.item_code,
        store_id: storeId,
        batch_no: selectedItem.is_batch ? form.batch_no : null,
        current_qty: currentQty,
        new_qty: newQty,
        reason: form.reason,
        note: form.note.trim(),
        serial_numbers: selectedItem.is_serialized
          ? (diff > 0 ? addedSerials : form.removed_serials)
          : [],
      });
      setSuccess(`Adjustment ${response.data?.trans_no ?? ''} saved: ${selectedItem.item_code} ${currentQty} → ${newQty}.`);
      setModalOpen(false);
      setPage(1);
      await Promise.all([loadAdjustments(), loadStock()]);
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Unable to save the stock adjustment.'));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Inventory Control"
        title="Stock Adjustments"
        description="Correct stock to a physical count. Every change records who made it, when, the old and new quantity, and the reason."
        icon={ClipboardPen}
        actions={
          <>
            <button
              type="button"
              onClick={() => loadAdjustments()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            {canCreate && (
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                New Adjustment
              </button>
            )}
          </>
        }
      />

      {error && <OperationNotice type="error">{error}</OperationNotice>}
      {success && <OperationNotice type="success">{success}</OperationNotice>}

      <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-6">
        <input
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder="Search item, trans no or note..."
          className={`${inputClass} xl:col-span-2`}
        />
        <select
          value={filters.store_id}
          onChange={(event) => setFilters({ ...filters, store_id: event.target.value })}
          className={inputClass}
        >
          <option value="">All stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.name}</option>
          ))}
        </select>
        <select
          value={filters.reason}
          onChange={(event) => setFilters({ ...filters, reason: event.target.value })}
          className={inputClass}
        >
          <option value="">All reasons</option>
          {ADJUSTMENT_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>{reason.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          className={inputClass}
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          className={inputClass}
          aria-label="To date"
        />
        <div className="flex gap-2 md:col-span-2 xl:col-span-6 xl:justify-end">
          <button type="button" onClick={resetFilters} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Reset
          </button>
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Apply Filters
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date &amp; Time</th>
                <th className="px-5 py-3">Trans No</th>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Store / Batch</th>
                <th className="px-5 py-3 text-right">Old</th>
                <th className="px-5 py-3 text-right">New</th>
                <th className="px-5 py-3 text-right">Diff</th>
                <th className="px-5 py-3">Reason &amp; Note</th>
                <th className="px-5 py-3">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={9} label="Loading stock adjustments..." />
              ) : adjustments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-slate-500">
                    No stock adjustments found.
                  </td>
                </tr>
              ) : (
                adjustments.map((adjustment) => (
                  <tr key={adjustment.id} className="align-top hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDateTime(adjustment.created_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-700">{adjustment.trans_no}</td>
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs font-bold text-indigo-700">{adjustment.item_code}</div>
                      <div className="text-slate-700">{adjustment.item_description ?? '-'}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <div>{adjustment.store_name ?? `Store #${adjustment.store_id}`}</div>
                      {adjustment.batch_no && <div className="text-xs text-slate-400">Batch {adjustment.batch_no}</div>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{adjustment.old_qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-900">{adjustment.new_qty}</td>
                    <td className={`px-5 py-3 text-right tabular-nums font-bold ${adjustment.diff_qty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {signed(adjustment.diff_qty)}
                    </td>
                    <td className="max-w-sm px-5 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {reasonLabel(adjustment.reason)}
                      </span>
                      <p className="mt-1 whitespace-pre-line break-words text-slate-600">{adjustment.note}</p>
                      {adjustment.serial_numbers && adjustment.serial_numbers.length > 0 && (
                        <details className="mt-1 text-xs text-slate-500">
                          <summary className="cursor-pointer font-semibold">
                            {adjustment.serial_numbers.length} serial number(s)
                          </summary>
                          <div className="mt-1 font-mono">{adjustment.serial_numbers.join(', ')}</div>
                        </details>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-700">{adjustment.UID}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span>Page {meta.current_page} of {meta.last_page} · {meta.total} records</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= meta.last_page}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {modalOpen && (
        <OperationModal
          title="New Stock Adjustment"
          description="Enter the physically counted quantity. The difference is posted to stock and logged with your name and the reason."
          onClose={closeModal}
          width="max-w-3xl"
          icon={ClipboardPen}
        >
          <form onSubmit={submitAdjustment} className="space-y-5 px-6 py-6">
            {formError && <OperationNotice type="error">{formError}</OperationNotice>}

            <OperationField label="Item" required>
              <SearchSelect
                value={form.item_code}
                onChange={(itemCode) => updateForm({ ...initialForm, item_code: itemCode })}
                options={inventory.map((item) => ({
                  value: item.item_code,
                  label: `${item.item_code} - ${item.item_description}`,
                  description: `${item.total_qty} in stock`,
                  keywords: item.barcode,
                }))}
                placeholder="Select item"
                searchPlaceholder="Search by code, description or barcode..."
                className={inputClass}
                required
              />
            </OperationField>

            <div className="grid gap-4 md:grid-cols-2">
              <OperationField label="Store" required>
                <SearchSelect
                  value={form.store_id}
                  onChange={(value) => updateForm({ store_id: value, batch_no: '', new_qty: '', added_serials: '', removed_serials: [] })}
                  options={stores.map((store) => {
                    const quantity = selectedItem?.stores.find((row) => row.store_id === store.id)?.qty_in_hand ?? 0;
                    return { value: String(store.id), label: store.name, description: `${quantity} in hand` };
                  })}
                  placeholder="Select store"
                  searchPlaceholder="Search stores..."
                  className={inputClass}
                  disabled={!selectedItem}
                  required
                />
              </OperationField>

              {selectedItem?.is_batch && (
                <OperationField label="Batch" required help={storeId && storeBatches.length === 0 ? 'No batches in this store. Use Opening Stock or a GRN to create one.' : undefined}>
                  <SearchSelect
                    value={form.batch_no}
                    onChange={(value) => updateForm({ batch_no: value, new_qty: '', added_serials: '', removed_serials: [] })}
                    options={storeBatches.map((batch) => ({ value: batch.batch_no, label: batch.batch_no, description: `${batch.qty_in_hand} units` }))}
                    placeholder="Select batch"
                    searchPlaceholder="Search batches..."
                    className={inputClass}
                    disabled={!storeId}
                    required
                  />
                </OperationField>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Qty</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{currentQty ?? '-'}</div>
              </div>
              <OperationField label="New Counted Qty" required>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.new_qty}
                  onChange={(event) => updateForm({ new_qty: event.target.value, added_serials: '', removed_serials: [] })}
                  className={inputClass}
                  disabled={currentQty === null}
                  required
                />
              </OperationField>
              <div className={`rounded-xl border px-4 py-3 ${diff > 0 ? 'border-emerald-200 bg-emerald-50' : diff < 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Difference</div>
                <div className={`mt-1 text-2xl font-bold ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                  {diff === 0 ? '0' : signed(diff)}
                </div>
              </div>
            </div>

            {selectedItem?.is_serialized && diff > 0 && (
              <OperationField
                label={`New Serial Numbers (${addedSerials.length} of ${serialsNeeded})`}
                required
                help="Scan or type one serial number per line."
              >
                <ScanInput
                  onScan={(code) => updateForm({
                    added_serials: [...parseSerialNumbers(form.added_serials), code].join('\n'),
                  })}
                  placeholder="Scan serial number + Enter"
                  className="mb-2"
                />
                <textarea
                  rows={Math.min(Math.max(serialsNeeded, 2), 8)}
                  value={form.added_serials}
                  onChange={(event) => updateForm({ added_serials: event.target.value })}
                  className={`${inputClass} font-mono`}
                />
              </OperationField>
            )}

            {selectedItem?.is_serialized && diff < 0 && (
              <OperationField label={`Serial Numbers to Remove (${form.removed_serials.length} of ${serialsNeeded})`} required>
                {storeSerials.length === 0 ? (
                  <p className="text-sm text-slate-500">No serial numbers in stock for this store.</p>
                ) : (
                  <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                    {storeSerials.map((serial) => {
                      const checked = form.removed_serials.includes(serial.serial_no);
                      const blocked = !checked && form.removed_serials.length >= serialsNeeded;
                      return (
                        <label key={serial.serial_no} className={`flex items-center gap-2 font-mono text-sm ${blocked ? 'text-slate-300' : 'text-slate-700'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={blocked}
                            onChange={() => toggleRemovedSerial(serial.serial_no)}
                          />
                          {serial.serial_no}
                        </label>
                      );
                    })}
                  </div>
                )}
              </OperationField>
            )}

            <OperationField label="Reason" required>
              <select
                value={form.reason}
                onChange={(event) => updateForm({ reason: event.target.value as AdjustmentReason })}
                className={inputClass}
                required
              >
                <option value="">Select a reason</option>
                {ADJUSTMENT_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </OperationField>

            <OperationField label="Note" required help="Explain why the stock is being changed (at least 5 characters).">
              <textarea
                rows={3}
                maxLength={1000}
                value={form.note}
                onChange={(event) => updateForm({ note: event.target.value })}
                className={inputClass}
                placeholder="e.g. Physical count on 25 Oct found 2 units damaged by water leak."
                required
              />
            </OperationField>

            {confirming && selectedItem && (
              <OperationNotice type="warning">
                Change <strong>{selectedItem.item_code}</strong> in{' '}
                <strong>{stores.find((store) => store.id === storeId)?.name}</strong>
                {selectedItem.is_batch && <> (batch <strong>{form.batch_no}</strong>)</>} from{' '}
                <strong>{currentQty}</strong> to <strong>{newQty}</strong> ({signed(diff)})? Click Confirm Adjustment to save.
              </OperationNotice>
            )}

            <OperationActions
              saving={saving}
              submitLabel={confirming ? 'Confirm Adjustment' : 'Review Adjustment'}
              onCancel={closeModal}
              disabled={!formReady}
            />
          </form>
        </OperationModal>
      )}
    </div>
  );
}
