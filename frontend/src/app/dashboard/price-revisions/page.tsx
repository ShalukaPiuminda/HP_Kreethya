'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  formatCurrency,
  PriceRevision,
  PriceRevisionMethod,
  PriceRevisionPreview,
  PriceRevisionPriceType,
  PriceRevisionScope,
  StockItem,
  Store,
} from '@/lib/inventory';
import { SearchSelect } from '@/components/search-select';
import { ItemFormModal, type Item } from '@/components/item-form-modal';

const initialForm = {
  item_code: '',
  scope: 'selected' as PriceRevisionScope,
  store_id: '',
  batch_ids: [] as number[],
  price_type: 'sales' as PriceRevisionPriceType,
  method: 'set' as PriceRevisionMethod,
  sales_value: '',
  purchase_value: '',
  reason: '',
};

type RevisionForm = typeof initialForm;

const SCOPE_LABELS: Record<string, string> = {
  selected: 'Selected batches',
  store: 'All batches - one store',
  all: 'All batches - all stores',
  standard: 'Standard price',
  batch: 'Batch',
};

const PRICE_TYPE_LABELS: Record<PriceRevisionPriceType, string> = {
  sales: 'Sales price',
  purchase: 'Purchase price',
  both: 'Both',
};

const METHOD_LABELS: Record<PriceRevisionMethod, string> = {
  set: 'Set new price',
  amount: 'Change by amount',
  percent: 'Change by %',
};

const BATCH_PRICE_MODE_LABELS: Record<string, string> = {
  batch: 'Selected batch price',
  average: 'Average of batches',
  last: 'Latest batch price',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  GRN: 'GRN',
  OPS: 'Opening stock',
  reversal: 'Reversal',
};

export default function PriceRevisionsPage() {
  return (
    <Suspense fallback={null}>
      <PriceRevisions />
    </Suspense>
  );
}

function PriceRevisions() {
  const searchParams = useSearchParams();
  const batchFilter = searchParams.get('batch_id') ?? '';
  const [tab, setTab] = useState<'new' | 'history'>(
    batchFilter || searchParams.get('tab') === 'history' ? 'history' : 'new'
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Inventory Control</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Price Revisions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Change batch or standard prices with a reason. Every change is kept in the history with who made it.
        </p>
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'new'} onClick={() => setTab('new')}>New Revision</TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>History</TabButton>
      </div>

      {tab === 'new' ? (
        <NewRevision onSaved={() => setTab('history')} />
      ) : (
        <RevisionHistory initialBatchId={batchFilter} initialItemCode={searchParams.get('item_code') ?? ''} />
      )}
    </div>
  );
}

function NewRevision({ onSaved }: { onSaved: () => void }) {
  const { isSuperAdmin, hasPermission } = useAuth();
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [openingItem, setOpeningItem] = useState(false);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState<RevisionForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PriceRevisionPreview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stockResponse, storeResponse] = await Promise.all([
        api.getAll<StockItem>('/v1/stock'),
        api.getAll<Store>('/v1/stores'),
      ]);
      setInventory(stockResponse.data ?? []);
      setStores(storeResponse.data ?? []);
    } catch (requestError) {
      setErrors(errorMessages(requestError, 'Unable to load items.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const selectedItem = inventory.find((item) => item.item_code === form.item_code);
  const includesSales = form.price_type !== 'purchase';
  const includesPurchase = form.price_type !== 'sales';

  const payload = useMemo(() => ({
    item_code: form.item_code,
    scope: form.scope,
    batch_ids: form.scope === 'selected' ? form.batch_ids : [],
    store_id: form.scope === 'store' ? Number(form.store_id) || null : null,
    price_type: form.price_type,
    method: form.method,
    sales_value: includesSales && form.sales_value !== '' ? Number(form.sales_value) : null,
    purchase_value: includesPurchase && form.purchase_value !== '' ? Number(form.purchase_value) : null,
  }),[form, includesPurchase, includesSales]);

  const currentKey = JSON.stringify(payload);
  const previewIsCurrent = preview !== null && previewKey === currentKey;

  const update = (changes: Partial<RevisionForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setSuccess(null);
  };

  const changeItem = (itemCode: string) => {
    const item = inventory.find((candidate) => candidate.item_code === itemCode);
    setForm({
      ...initialForm,
      item_code: itemCode,
      scope: item?.is_batch ? 'selected' : 'standard',
      price_type: form.price_type === 'sales' || isSuperAdmin ? form.price_type : 'sales',
      method: form.method,
    });
    setPreview(null);
    setErrors([]);
    setSuccess(null);
  };

  const toggleBatch = (batchId: number) => {
    update({
      batch_ids: form.batch_ids.includes(batchId)
        ? form.batch_ids.filter((id) => id !== batchId)
        : [...form.batch_ids, batchId],
    });
  };

  const scopeBatches = selectedItem?.batches.filter((batch) =>
    form.scope === 'all' || form.scope === 'selected' || (form.scope === 'store' && batch.store_id === Number(form.store_id))
  ) ?? [];

  const runPreview = async () => {
    setPreviewing(true);
    setErrors([]);
    try {
      const response = await api.post<PriceRevisionPreview>('/v1/price-revisions/preview', payload);
      setPreview(response.data ?? null);
      setPreviewKey(currentKey);
      if (response.data && response.data.lines.length === 0) {
        setErrors(['No prices would change with these values.']);
      }
    } catch (requestError) {
      setPreview(null);
      setErrors(errorMessages(requestError, 'Unable to preview the price change.'));
    } finally {
      setPreviewing(false);
    }
  };

  // Min/max sales prices live on the item master, so a blocked preview can be fixed there.
  const outsideItemLimits = Boolean(selectedItem?.sales_criteria_enabled) && (preview?.lines ?? []).some((line) =>
    (selectedItem?.min_sales_price != null && line.new_sales_price < selectedItem.min_sales_price)
    || (selectedItem?.max_sales_price != null && line.new_sales_price > selectedItem.max_sales_price)
  );

  const openItemLimits = async () => {
    if (!selectedItem) return;
    setOpeningItem(true);
    try {
      const response = await api.get<Item>(`/v1/items/${selectedItem.id}`);
      setEditingItem(response.data ?? null);
    } catch (requestError) {
      setErrors(errorMessages(requestError, 'Unable to open the item.'));
    } finally {
      setOpeningItem(false);
    }
  };

  const itemLimitsSaved = async () => {
    setEditingItem(null);
    await loadData();
    await runPreview();
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      const response = await api.post<PriceRevision>('/v1/price-revisions', { ...payload, reason: form.reason.trim() });
      setSuccess(response.message);
      setForm({ ...initialForm, item_code: form.item_code, scope: form.scope });
      setPreview(null);
      await loadData();
    } catch (requestError) {
      setErrors(errorMessages(requestError, 'Unable to save the price revision.'));
    } finally {
      setSaving(false);
    }
  };

  const valuesReady = (!includesSales || form.sales_value !== '') && (!includesPurchase || form.purchase_value !== '');
  const scopeReady = form.scope === 'selected'
    ? form.batch_ids.length > 0
    : form.scope === 'store' ? form.store_id !== '' : true;
  const canPreview = Boolean(selectedItem) && valuesReady && scopeReady;
  const valueHint = form.method === 'set'
    ? 'New price'
    : form.method === 'amount' ? 'Amount (use minus to lower)' : 'Percent (use minus to lower)';

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">Loading items...</div>;
  }

  return (
    <>
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {errors.length > 0 && (
          <Message color="rose">
            {errors.length === 1 ? errors[0] : (
              <ul className="list-disc space-y-1 pl-5">{errors.map((message) => <li key={message}>{message}</li>)}</ul>
            )}
          </Message>
        )}
        {success && (
          <Message color="emerald">
            {success}{' '}
            <button type="button" onClick={onSaved} className="font-semibold underline">View history</button>
          </Message>
        )}

        <Field label="1. Item">
          <SearchSelect
            value={form.item_code}
            onChange={changeItem}
            options={inventory.map((item) => ({
              value: item.item_code,
              label: `${item.item_code} - ${item.item_description}`,
              description: item.is_batch ? `${item.batches.length} batches` : 'Standard price item',
              keywords: item.barcode,
            }))}
            placeholder="Select item"
            searchPlaceholder="Search by code, description or barcode..."
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            required
          />
        </Field>

        {selectedItem && (
          <>
            <div>
              <span className="mb-2 block text-xs font-semibold text-slate-600">2. What to change</span>
              {selectedItem.is_batch ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['selected', 'store', 'all'] as PriceRevisionScope[]).map((scope) => (
                    <Choice
                      key={scope}
                      name="scope"
                      checked={form.scope === scope}
                      onChange={() => update({ scope, batch_ids: [], store_id: '' })}
                      label={SCOPE_LABELS[scope]}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  This item is not batch-tracked, so its standard price will be changed.
                </p>
              )}
            </div>

            {form.scope === 'store' && (
              <Field label="Store">
                <SearchSelect
                  value={form.store_id}
                  onChange={(value) => update({ store_id: value })}
                  options={stores.map((store) => ({ value: String(store.id), label: store.name }))}
                  placeholder="Select store"
                  searchPlaceholder="Search stores..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  required
                />
              </Field>
            )}

            {selectedItem.is_batch && form.scope !== 'standard' && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      {form.scope === 'selected' && (
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Select all batches"
                            checked={selectedItem.batches.length > 0 && form.batch_ids.length === selectedItem.batches.length}
                            onChange={(event) => update({ batch_ids: event.target.checked ? selectedItem.batches.map((batch) => batch.id) : [] })}
                          />
                        </th>
                      )}
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2">Store</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Purchase</th>
                      <th className="px-3 py-2 text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopeBatches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                          {form.scope === 'store' && !form.store_id ? 'Select a store to see its batches.' : 'No batches.'}
                        </td>
                      </tr>
                    ) : scopeBatches.map((batch) => (
                      <tr key={batch.id} className={form.batch_ids.includes(batch.id) ? 'bg-indigo-50/60' : ''}>
                        {form.scope === 'selected' && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Select batch ${batch.batch_no} in ${batch.store_name}`}
                              checked={form.batch_ids.includes(batch.id)}
                              onChange={() => toggleBatch(batch.id)}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 font-mono font-semibold text-slate-700">{batch.batch_no}</td>
                        <td className="px-3 py-2 text-slate-600">{batch.store_name}</td>
                        <td className="px-3 py-2 text-right font-semibold">{batch.qty_in_hand}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(batch.purchase_price)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(batch.sales_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-600">3. Price</span>
                <div className="space-y-2">
                  {(Object.keys(PRICE_TYPE_LABELS) as PriceRevisionPriceType[]).map((priceType) => (
                    <Choice
                      key={priceType}
                      name="price_type"
                      checked={form.price_type === priceType}
                      onChange={() => update({ price_type: priceType })}
                      label={PRICE_TYPE_LABELS[priceType]}
                      disabled={priceType !== 'sales' && !isSuperAdmin}
                    />
                  ))}
                </div>
                {!isSuperAdmin && (
                  <p className="mt-2 text-xs text-slate-500">Only a Super Admin can change purchase prices.</p>
                )}
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-600">Method</span>
                <div className="space-y-2">
                  {(Object.keys(METHOD_LABELS) as PriceRevisionMethod[]).map((method) => (
                    <Choice
                      key={method}
                      name="method"
                      checked={form.method === method}
                      onChange={() => update({ method })}
                      label={METHOD_LABELS[method]}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {includesSales && (
                <Field label={`Sales - ${valueHint}`}>
                  <input
                    type="number"
                    step="0.01"
                    min={form.method === 'set' ? 0 : undefined}
                    value={form.sales_value}
                    onChange={(event) => update({ sales_value: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
              )}
              {includesPurchase && (
                <Field label={`Purchase - ${valueHint}`}>
                  <input
                    type="number"
                    step="0.01"
                    min={form.method === 'set' ? 0 : undefined}
                    value={form.purchase_value}
                    onChange={(event) => update({ purchase_value: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={runPreview}
                disabled={!canPreview || previewing}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {previewing ? 'Checking...' : '4. Preview changes'}
              </button>
            </div>

            {preview && preview.lines.length > 0 && (
              <div className={`space-y-3 ${previewIsCurrent ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-800">Preview - {preview.lines.length} price(s) will change</h2>
                  {!previewIsCurrent && <span className="text-xs font-semibold text-amber-600">Values changed. Preview again.</span>}
                </div>
                <PreviewTable preview={preview} />
                {previewIsCurrent && outsideItemLimits && (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      The minimum and maximum sales prices are set on the item. Change them there first, then this preview updates.
                    </span>
                    {hasPermission('items', 'can_update') ? (
                      <button
                        type="button"
                        onClick={openItemLimits}
                        disabled={openingItem}
                        className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {openingItem ? 'Opening...' : 'Edit item limits'}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-semibold">Ask a user who can edit items.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {previewIsCurrent && preview?.can_save && (
              <div className="space-y-4 border-t border-slate-200 pt-5">
                <Field label="5. Reason (required)">
                  <input
                    value={form.reason}
                    onChange={(event) => setForm({ ...form, reason: event.target.value })}
                    maxLength={255}
                    placeholder="e.g. Supplier price increase, Festival offer"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                </Field>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving || form.reason.trim() === ''}
                    className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {saving ? 'Saving...' : 'Save Price Revision'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected Item</div>
          <div className="mt-3 font-mono text-sm font-bold text-indigo-300">{selectedItem?.item_code || '-'}</div>
          <div className="mt-1 text-lg font-bold">{selectedItem?.item_description || 'No item selected'}</div>
          {selectedItem && (
            <dl className="mt-4 space-y-2 text-sm">
              {selectedItem.is_batch ? (
                <>
                  <InfoRow label="Prices kept on" value={`${selectedItem.batches.length} batch(es)`} />
                  <InfoRow label="Sales pricing" value={BATCH_PRICE_MODE_LABELS[selectedItem.default_batch_price_mode ?? 'batch']} />
                </>
              ) : (
                <>
                  <InfoRow label="Standard purchase" value={formatCurrency(selectedItem.standard_purchase_price)} />
                  <InfoRow label="Standard sales" value={formatCurrency(selectedItem.standard_sales_price)} />
                </>
              )}
              {selectedItem.sales_criteria_enabled && (
                <>
                  <InfoRow label="Min sales price" value={selectedItem.min_sales_price != null ? formatCurrency(selectedItem.min_sales_price) : '-'} />
                  <InfoRow label="Max sales price" value={selectedItem.max_sales_price != null ? formatCurrency(selectedItem.max_sales_price) : '-'} />
                </>
              )}
            </dl>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          <h2 className="font-bold text-slate-800">Rules</h2>
          <ul className="mt-3 space-y-2">
            <li>Sales price cannot be below the purchase price.</li>
            <li>Sales price must stay inside the item minimum and maximum, when set.</li>
            <li>Purchase price changes and reversals are Super Admin only.</li>
            <li>Past invoices and HP agreements keep their original prices.</li>
            <li>Saved revisions cannot be edited. Use Reverse in History to undo one.</li>
          </ul>
        </div>
      </aside>
    </form>

    {/* Outside the revision form: the item modal has its own form. */}
    {editingItem && (
      <ItemFormModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={itemLimitsSaved} />
    )}
    </>
  );
}

function PreviewTable({ preview }: { preview: PriceRevisionPreview }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Batch / Store</th>
            <th className="px-3 py-2 text-right">Purchase</th>
            <th className="px-3 py-2 text-right">Sales</th>
            <th className="px-3 py-2">Check</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {preview.lines.map((line) => (
            <tr key={`${line.target}-${line.item_batch_id ?? 'std'}`} className={line.errors.length ? 'bg-rose-50' : ''}>
              <td className="px-3 py-2">
                {line.target === 'standard' ? (
                  <span className="font-semibold text-slate-700">Standard price</span>
                ) : (
                  <>
                    <span className="font-mono font-semibold text-slate-700">{line.batch_no}</span>
                    <span className="text-slate-500"> / {line.store_name}</span>
                    <span className="text-xs text-slate-400"> ({line.qty_in_hand} in hand)</span>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-right"><PriceChange from={line.old_purchase_price} to={line.new_purchase_price} /></td>
              <td className="px-3 py-2 text-right"><PriceChange from={line.old_sales_price} to={line.new_sales_price} /></td>
              <td className="px-3 py-2 text-xs">
                {line.errors.length ? (
                  <span className="font-semibold text-rose-700">{line.errors.join(' ')}</span>
                ) : (
                  <span className="font-semibold text-emerald-600">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevisionHistory({ initialBatchId, initialItemCode }: { initialBatchId: string; initialItemCode: string }) {
  const { isSuperAdmin } = useAuth();
  const [filters, setFilters] = useState({ search: '', source: '', from: '', to: '' });
  const [batchId, setBatchId] = useState(initialBatchId);
  const [rows, setRows] = useState<PriceRevision[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [reversing, setReversing] = useState<PriceRevision | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseSaving, setReverseSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    if (batchId) params.set('batch_id', batchId);
    if (batchId && initialItemCode) params.set('item_code', initialItemCode);
    try {
      const response = await api.get<PriceRevision[]>(`/v1/price-revisions?${params}`);
      setRows(response.data ?? []);
      setLastPage(response.meta?.last_page ?? 1);
      setTotal(response.meta?.total ?? 0);
    } catch (requestError) {
      setError(errorMessages(requestError, 'Unable to load price history.')[0]);
    } finally {
      setLoading(false);
    }
  }, [batchId, filters, initialItemCode, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, filters.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [filters.search, load]);

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const toggle = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitReverse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reversing) return;
    setReverseSaving(true);
    setError(null);
    try {
      const response = await api.post<PriceRevision>(`/v1/price-revisions/${reversing.id}/reverse`, { reason: reverseReason.trim() });
      setSuccess(response.message);
      setReversing(null);
      setReverseReason('');
      await load();
    } catch (requestError) {
      setError(errorMessages(requestError, 'Unable to reverse this revision.')[0]);
      setReversing(null);
    } finally {
      setReverseSaving(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {error && <Message color="rose">{error}</Message>}
      {success && <Message color="emerald">{success}</Message>}

      {batchId && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-800">
          <span>Showing price history for one batch{initialItemCode ? ` of ${initialItemCode}` : ''}.</span>
          <button type="button" onClick={() => { setBatchId(''); setPage(1); }} className="font-semibold underline">Show all</button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <input
          value={filters.search}
          onChange={(event) => setFilter('search', event.target.value)}
          placeholder="Search revision, item or reason"
          className={`${inputClass} md:col-span-2`}
        />
        <select value={filters.source} onChange={(event) => setFilter('source', event.target.value)} className={inputClass} aria-label="Source">
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} className={inputClass} aria-label="From date" />
        <input type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} className={inputClass} aria-label="To date" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">Revision</th>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Change</th>
              <th className="py-2 pr-3 text-right">Rows</th>
              <th className="py-2 pr-3">Changed by</th>
              <th className="py-2 pr-3">Reason</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={9} className="py-10 text-center text-slate-400">Loading history...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="py-10 text-center text-slate-400">No price revisions found.</td></tr>
            ) : rows.map((revision) => (
              <RevisionRow
                key={revision.id}
                revision={revision}
                expanded={expanded.has(revision.id)}
                onToggle={() => toggle(revision.id)}
                canReverse={isSuperAdmin && revision.status === 'applied' && revision.source !== 'reversal'}
                onReverse={() => { setReversing(revision); setReverseReason(''); setSuccess(null); }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} revision(s)</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page} of {lastPage}</span>
          <button type="button" disabled={page >= lastPage} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>

      {reversing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="dialog" aria-modal="true">
          <form onSubmit={submitReverse} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Reverse {reversing.revision_no}</h2>
            <p className="text-sm text-slate-600">
              The old prices of this revision will be put back. A new reversal record is created and the original is kept.
            </p>
            <Field label="Reason (required)">
              <input
                autoFocus
                value={reverseReason}
                onChange={(event) => setReverseReason(event.target.value)}
                maxLength={255}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                required
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReversing(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button
                type="submit"
                disabled={reverseSaving || reverseReason.trim() === ''}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:bg-slate-300"
              >
                {reverseSaving ? 'Reversing...' : 'Reverse'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function RevisionRow({
  revision,
  expanded,
  onToggle,
  canReverse,
  onReverse,
}: {
  revision: PriceRevision;
  expanded: boolean;
  onToggle: () => void;
  canReverse: boolean;
  onReverse: () => void;
}) {
  const sourceLabel = SOURCE_LABELS[revision.source] ?? revision.source;

  return (
    <>
      <tr className="align-top">
        <td className="py-3 pr-3">
          <button type="button" onClick={onToggle} className="font-mono font-semibold text-indigo-700 hover:underline" aria-expanded={expanded}>
            {expanded ? '▾' : '▸'} {revision.revision_no}
          </button>
          <div className="mt-0.5 text-xs text-slate-400">
            {sourceLabel}{revision.source_no ? ` ${revision.source_no}` : ''}
          </div>
        </td>
        <td className="py-3 pr-3 whitespace-nowrap text-slate-600">{formatDateTime(revision.created_at)}</td>
        <td className="py-3 pr-3">
          <div className="font-mono text-xs font-semibold text-slate-700">{revision.item_code}</div>
          <div className="text-slate-600">{revision.item?.item_description}</div>
        </td>
        <td className="py-3 pr-3 text-slate-600">
          <div>{PRICE_TYPE_LABELS[revision.price_type]}</div>
          <div className="text-xs text-slate-400">
            {SCOPE_LABELS[revision.scope] ?? revision.scope}
            {revision.store ? ` (${revision.store.name})` : ''}
            {revision.update_standard && revision.scope !== 'standard' ? ' + standard' : ''}
          </div>
        </td>
        <td className="py-3 pr-3 text-right font-semibold">{revision.lines.length}</td>
        <td className="py-3 pr-3 font-semibold text-slate-700">{revision.UID}</td>
        <td className="py-3 pr-3 max-w-[220px] text-slate-600">{revision.reason}</td>
        <td className="py-3 pr-3">
          {revision.status === 'reversed' ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700" title={`By ${revision.reversed_by} on ${formatDateTime(revision.reversed_at)}`}>
              Reversed
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Applied</span>
          )}
        </td>
        <td className="py-3 text-right">
          {canReverse && (
            <button type="button" onClick={onReverse} className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
              Reverse
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-slate-50 px-4 py-3">
            {revision.status === 'reversed' && (
              <p className="mb-2 text-xs text-amber-700">
                Reversed by {revision.reversed_by} on {formatDateTime(revision.reversed_at)}.
              </p>
            )}
            <table className="w-full text-xs">
              <thead className="text-left uppercase text-slate-400">
                <tr>
                  <th className="pb-1">Batch / Store</th>
                  <th className="pb-1 text-right">Purchase</th>
                  <th className="pb-1 text-right">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {revision.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="py-1.5">
                      {line.target === 'standard'
                        ? 'Standard price'
                        : <><span className="font-mono font-semibold">{line.batch_no}</span> / {line.store?.name ?? '-'}</>}
                    </td>
                    <td className="py-1.5 text-right"><PriceChange from={Number(line.old_purchase_price)} to={Number(line.new_purchase_price)} /></td>
                    <td className="py-1.5 text-right"><PriceChange from={Number(line.old_sales_price)} to={Number(line.new_sales_price)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function PriceChange({ from, to }: { from: number; to: number }) {
  if (Math.abs(from - to) < 0.005) {
    return <span className="text-slate-400">{formatCurrency(from)}</span>;
  }

  return (
    <span className="whitespace-nowrap">
      <span className="text-slate-400 line-through">{formatCurrency(from)}</span>{' '}
      <span className={`font-semibold ${to > from ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(to)}</span>
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
    >
      {children}
    </button>
  );
}

function Choice({ name, checked, onChange, label, disabled = false }: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-700'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} />
      {label}
    </label>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Message({ color, children }: { color: 'rose' | 'emerald'; children: React.ReactNode }) {
  const classes = color === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Every validation message from the API, so all blocked rows are listed at once. */
function errorMessages(error: unknown, fallback: string): string[] {
  if (error instanceof ApiError && error.status === 403) {
    return ['You do not have permission to do this. Purchase price changes and reversals are Super Admin only.'];
  }
  if (error instanceof ApiError && error.errors) {
    const messages = Object.values(error.errors).flat().filter(Boolean);
    if (messages.length) return messages;
  }
  if (error instanceof Error && error.message) return [error.message];
  return [fallback];
}
