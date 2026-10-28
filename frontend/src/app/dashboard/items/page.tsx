'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  Boxes,
  ChevronsUpDown,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  LoadingTableRow,
  OperationHeader,
  OperationMetric,
  OperationNotice,
} from '@/components/operation-ui';
import {
  buildCategoryPathMap,
  ItemFormModal,
  orderCategories,
  type Brand,
  type Category,
  type Color,
  type Item,
  type Make,
} from '@/components/item-form-modal';

interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

const ITEMS_PER_PAGE = 50;

function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    current_page: 1,
    last_page: 1,
    per_page: ITEMS_PER_PAGE,
    total: 0,
  });
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [compactCategory, setCompactCategory] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    details?: string[];
  } | null>(null);

  const loadData = useCallback(async (options?: { preserveNotice?: boolean; page?: number }) => {
    setLoading(true);
    if (!options?.preserveNotice) {
      setNotice(null);
    }

    try {
      const targetPage = options?.page || currentPage;
      const itemQuery = new URLSearchParams({
        page: String(targetPage),
        per_page: String(ITEMS_PER_PAGE),
      });
      const itemSearch = deferredSearch.trim();
      if (itemSearch) {
        itemQuery.set('search', itemSearch);
      }

      const [itemsRes, categoriesRes, brandsRes, makesRes, colorsRes] =
        await Promise.all([
          api.get<Item[]>(`/v1/items?${itemQuery.toString()}`),
          api.get<Category[]>('/v1/categories?all=1'),
          api.get<Brand[]>('/v1/brands?all=1'),
          api.get<Make[]>('/v1/makes?all=1'),
          api.get<Color[]>('/v1/colors?all=1'),
        ]);

      setItems(itemsRes.data || []);
      setPagination(
        itemsRes.meta || {
          current_page: targetPage,
          last_page: 1,
          per_page: ITEMS_PER_PAGE,
          total: itemsRes.data?.length || 0,
        }
      );
      setCategories(categoriesRes.data || []);
      setBrands(brandsRes.data || []);
      setMakes(makesRes.data || []);
      setColors(colorsRes.data || []);
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(
          error,
          'Unable to load items and master data.'
        ),
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, deferredSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const orderedCategories = useMemo(
    () => orderCategories(categories),
    [categories]
  );

  const { resolve: resolveCategoryPath } = useMemo(
    () => buildCategoryPathMap(orderedCategories),
    [orderedCategories]
  );

  const summary = useMemo(
    () => ({
      total: pagination.total,
      batch: items.filter((item) => item.is_batch).length,
      serial: items.filter((item) => item.is_serialized).length,
      warranty: items.filter((item) => item.warranty_enabled).length,
      reorder: items.filter((item) => item.reorder_level > 0).length,
    }),
    [items, pagination.total]
  );

  const pageStart = pagination.total === 0
    ? 0
    : (pagination.current_page - 1) * pagination.per_page + 1;
  const pageEnd = pagination.total === 0
    ? 0
    : Math.min(pagination.current_page * pagination.per_page, pagination.total);

  const masterPrerequisiteIssues = useMemo(
    () => [
      ...(categories.length === 0
        ? ['Create at least one category or subcategory before adding items.']
        : []),
      ...(brands.length === 0
        ? ['Create at least one brand before adding items.']
        : []),
      ...(makes.length === 0
        ? ['Create at least one make or model before adding items.']
        : []),
      ...(colors.length === 0
        ? ['Create at least one color before adding items.']
        : []),
    ],
    [brands.length, categories.length, colors.length, makes.length]
  );

  const openCreate = () => {
    if (masterPrerequisiteIssues.length > 0) {
      setNotice({
        type: 'warning',
        message: 'Item creation is waiting on master data.',
        details: masterPrerequisiteIssues,
      });
      return;
    }

    setEditingItem(null);
    setNotice(null);
    setShowModal(true);
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setNotice(null);
    setShowModal(true);
  };

  const handleSaved = async () => {
    const wasEditing = Boolean(editingItem);
    setShowModal(false);
    if (!wasEditing) setCurrentPage(1);
    await loadData({ preserveNotice: true, page: wasEditing ? currentPage : 1 });
    setNotice({
      type: 'success',
      message: `Item ${wasEditing ? 'updated' : 'created'} successfully.`,
    });
  };

  const handleDelete = async (item: Item) => {
    if (!window.confirm('Delete this item?')) return;

    setDeletingId(item.id);

    try {
      await api.delete(`/v1/items/${item.id}`);
      await loadData({ preserveNotice: true });
      setNotice({
        type: 'success',
        message: 'Item deleted successfully.',
      });
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to delete item.'),
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Inventory Master"
        title="Items"
        description="Maintain branch products, batch pricing, serial tracking, and reorder thresholds from one clean workspace."
        icon={Package}
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              New Item
            </button>
          </>
        }
      />

      {notice && (
        <OperationNotice type={notice.type} details={notice.details}>
          {notice.message}
        </OperationNotice>
      )}

      {masterPrerequisiteIssues.length > 0 && (
        <OperationNotice
          type="warning"
          details={masterPrerequisiteIssues}
        >
          Item creation is waiting on master data. Add the missing setup records before starting.
        </OperationNotice>
      )}

      <section className="rounded-3xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-indigo-950">
              Clean hierarchy-ready item setup
            </p>
            <p className="mt-1 text-sm leading-6 text-indigo-900/80">
              Categories and subcategories stay selectable in a single tree, while batch items automatically use GRN-level pricing.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OperationMetric label="Total items" value={String(summary.total)} tone="indigo" />
        <OperationMetric label="Batch tracked" value={String(summary.batch)} tone="emerald" />
        <OperationMetric label="Serialized" value={String(summary.serial)} tone="amber" />
        <OperationMetric label="Warranty" value={String(summary.warranty)} tone="slate" />
        <OperationMetric label="Reorder enabled" value={String(summary.reorder)} tone="rose" />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search item code, description or barcode..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-xs font-medium text-slate-500">
              Showing {pageStart}-{pageEnd} of {pagination.total} items
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"
              title="Refresh items"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5">Code</th>
                <th className="px-5 py-3.5">Description</th>
                <th className="px-5 py-3.5">Barcode</th>
                <th className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() => setCompactCategory((value) => !value)}
                    className="inline-flex items-center gap-1.5 text-left transition hover:text-indigo-600"
                    title={compactCategory ? 'Show full category paths' : 'Collapse category paths'}
                  >
                    <span>Category</span>
                    <ChevronsUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
                <th className="px-5 py-3.5">Flags</th>
                <th className="px-5 py-3.5">Sales Criteria</th>
                <th className="px-5 py-3.5 text-right">Purchase</th>
                <th className="px-5 py-3.5 text-right">Sales</th>
                <th className="px-5 py-3.5 text-center">Reorder</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={10} label="Loading items..." />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-14 text-center text-slate-400">
                    No items found in this branch.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-indigo-700">
                      {item.item_code}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {item.item_description}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.brand?.name || 'No brand'} · {item.make?.name || 'No make'} · {item.color?.name || 'No color'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-700">
                      {item.barcode || '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <div className="font-medium">
                        {item.category_id
                          ? compactCategory
                            ? item.category?.name || '—'
                            : resolveCategoryPath(item.category_id)
                          : '—'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.category?.parent_id
                          ? 'Subcategory selected'
                          : 'Top-level category'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {item.is_batch ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                            <Boxes className="h-3.5 w-3.5" />
                            Batch
                          </span>
                        ) : null}
                        {item.is_serialized ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                            <Barcode className="h-3.5 w-3.5" />
                            Serial
                          </span>
                        ) : null}
                        {item.warranty_enabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Warranty {item.warranty_months}m
                          </span>
                        ) : null}
                        {!item.is_batch && !item.is_serialized && !item.warranty_enabled ? (
                          <span className="text-slate-400">—</span>
                        ) : null}
                      </div>
                      {item.is_batch && (
                        <div className="mt-2 text-xs text-slate-500">
                          Default sale price: {item.default_batch_price_mode === 'average' ? 'Average' : item.default_batch_price_mode === 'last' ? 'Last' : 'Batch'}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {item.sales_criteria_enabled ? (
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold text-slate-900">
                            Sales rules
                          </div>
                          <div className="text-slate-500">
                            Qty: {item.min_sales_qty ?? 'Any'} - {item.max_sales_qty ?? 'Any'}
                          </div>
                          <div className="text-slate-500">
                            Price: {item.min_sales_price ? formatMoney(item.min_sales_price) : 'Any'} - {item.max_sales_price ? formatMoney(item.max_sales_price) : 'Any'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-300">No limit</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-slate-700">
                      {item.is_batch ? (
                        <span className="text-xs italic text-slate-400">Dynamic</span>
                      ) : (
                        formatMoney(item.standard_purchase_price)
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-slate-700">
                      {item.is_batch ? (
                        <span className="text-xs italic text-slate-400">Dynamic</span>
                      ) : (
                        formatMoney(item.standard_sales_price)
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {item.reorder_level > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                          {item.reorder_level}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                          title="Edit item"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                          title="Delete item"
                        >
                          {deletingId === item.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-slate-500">
            Page {pagination.current_page} of {pagination.last_page}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={loading || pagination.current_page <= 1}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(pagination.last_page, page + 1))
              }
              disabled={loading || pagination.current_page >= pagination.last_page}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {showModal && (
        <ItemFormModal
          item={editingItem}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
