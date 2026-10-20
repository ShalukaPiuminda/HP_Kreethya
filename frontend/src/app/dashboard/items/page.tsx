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
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { SearchSelect } from '@/components/search-select';

interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

interface Brand {
  id: number;
  name: string;
}

interface Make {
  id: number;
  name: string;
}

interface Color {
  id: number;
  name: string;
}

interface Item {
  id: number;
  item_code: string;
  item_description: string;
  barcode: string | null;
  category_id: number | null;
  brand_id: number | null;
  make_id: number | null;
  color_id: number | null;
  is_batch: boolean;
  default_batch_price_mode: 'batch' | 'average' | 'last';
  is_serialized: boolean;
  reorder_level: number;
  sales_criteria_enabled: boolean;
  min_sales_qty: number | null;
  max_sales_qty: number | null;
  min_sales_price: string | number | null;
  max_sales_price: string | number | null;
  standard_purchase_price: string;
  standard_sales_price: string;
  category?: Category | null;
  brand?: Brand | null;
  make?: Make | null;
  color?: Color | null;
}

interface ItemFormState {
  item_description: string;
  barcode: string;
  category_id: string;
  brand_id: string;
  make_id: string;
  color_id: string;
  is_batch: boolean;
  default_batch_price_mode: 'batch' | 'average' | 'last';
  is_serialized: boolean;
  reorder_level: string;
  sales_criteria_enabled: boolean;
  min_sales_qty: string;
  max_sales_qty: string;
  min_sales_price: string;
  max_sales_price: string;
  standard_purchase_price: string;
  standard_sales_price: string;
}

type QuickAddTarget = 'category' | 'brand' | 'make' | 'color';

interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

const ITEMS_PER_PAGE = 50;

/** Mirrors the backend: drop scanner control characters (CR/LF/TAB/GS) and trim. */
function normalizeBarcode(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]+/g, '').trim();
}

const DEFAULT_FORM: ItemFormState = {
  item_description: '',
  barcode: '',
  category_id: '',
  brand_id: '',
  make_id: '',
  color_id: '',
  is_batch: false,
  default_batch_price_mode: 'batch',
  is_serialized: false,
  reorder_level: '0',
  sales_criteria_enabled: false,
  min_sales_qty: '',
  max_sales_qty: '',
  min_sales_price: '',
  max_sales_price: '',
  standard_purchase_price: '',
  standard_sales_price: '',
};

const QUICK_ADD_CONFIG: Record<
  QuickAddTarget,
  { label: string; endpoint: string; formField: keyof ItemFormState }
> = {
  category: {
    label: 'Category',
    endpoint: '/v1/categories',
    formField: 'category_id',
  },
  brand: {
    label: 'Brand',
    endpoint: '/v1/brands',
    formField: 'brand_id',
  },
  make: {
    label: 'Make',
    endpoint: '/v1/makes',
    formField: 'make_id',
  },
  color: {
    label: 'Color',
    endpoint: '/v1/colors',
    formField: 'color_id',
  },
};

function orderCategories(records: Category[]) {
  const children = new Map<number | null, Category[]>();

  records.forEach((record) => {
    const siblings = children.get(record.parent_id) || [];
    siblings.push(record);
    children.set(record.parent_id, siblings);
  });

  children.forEach((siblings) =>
    siblings.sort((left, right) => left.name.localeCompare(right.name))
  );

  const ordered: Category[] = [];
  const appendChildren = (parentId: number | null) => {
    (children.get(parentId) || []).forEach((record) => {
      ordered.push(record);
      appendChildren(record.id);
    });
  };

  appendChildren(null);
  return ordered;
}

function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function buildCategoryPathMap(records: Category[]) {
  const index = new Map<number, Category>();
  records.forEach((record) => index.set(record.id, record));

  const cache = new Map<number, string>();
  const resolve = (categoryId: number): string => {
    if (cache.has(categoryId)) return cache.get(categoryId) as string;

    const current = index.get(categoryId);
    if (!current) return '—';

    const trail = [current.name];
    const seen = new Set<number>([current.id]);
    let parentId = current.parent_id;

    while (parentId) {
      if (seen.has(parentId)) break;
      seen.add(parentId);
      const parent = index.get(parentId);
      if (!parent) break;
      trail.unshift(parent.name);
      parentId = parent.parent_id;
    }

    const path = trail.join(' / ');
    cache.set(categoryId, path);
    return path;
  };

  records.forEach((record) => resolve(record.id));

  return { index, cache, resolve };
}

function ToggleCard({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        active
          ? 'border-indigo-200 bg-indigo-50 text-indigo-950 shadow-sm'
          : 'border-slate-200 bg-white text-slate-900 hover:border-indigo-200 hover:bg-slate-50'
      }`}
    >
      <span
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={`mt-0.5 block text-xs ${active ? 'text-indigo-800' : 'text-slate-500'}`}>
          {description}
        </span>
      </span>
    </button>
  );
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddParentId, setQuickAddParentId] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    details?: string[];
  } | null>(null);
  const [form, setForm] = useState<ItemFormState>(DEFAULT_FORM);

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

  const categoryOptions = useMemo(
    () =>
      orderedCategories.map((record) => ({
        value: String(record.id),
        label: resolveCategoryPath(record.id),
      })),
    [orderedCategories, resolveCategoryPath]
  );

  const summary = useMemo(
    () => ({
      total: pagination.total,
      batch: items.filter((item) => item.is_batch).length,
      serial: items.filter((item) => item.is_serialized).length,
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

  const formPrerequisiteIssues = useMemo(
    () => [
      ...(form.item_description.trim() === ''
        ? ['Item description is required.']
        : []),
      ...(form.category_id === '' ? ['Select a category.'] : []),
      ...(form.brand_id === '' ? ['Select a brand.'] : []),
      ...(form.make_id === '' ? ['Select a make.'] : []),
      ...(form.color_id === '' ? ['Select a color.'] : []),
      ...(form.sales_criteria_enabled &&
      form.min_sales_qty.trim() === '' &&
      form.max_sales_qty.trim() === '' &&
      form.min_sales_price.trim() === '' &&
      form.max_sales_price.trim() === ''
        ? ['Enter a minimum or maximum sales quantity/price, or turn off sales criteria.']
        : []),
      ...(form.sales_criteria_enabled &&
      form.min_sales_qty.trim() !== '' &&
      form.max_sales_qty.trim() !== '' &&
      Number(form.max_sales_qty) < Number(form.min_sales_qty)
        ? ['Maximum sales quantity cannot be less than minimum sales quantity.']
        : []),
      ...(form.sales_criteria_enabled &&
      form.min_sales_price.trim() !== '' &&
      form.max_sales_price.trim() !== '' &&
      Number(form.max_sales_price) < Number(form.min_sales_price)
        ? ['Maximum sales price cannot be less than minimum sales price.']
        : []),
      ...(!form.is_batch && form.standard_purchase_price.trim() === ''
        ? ['Enter a purchase price or mark the item as batch tracked.']
        : []),
      ...(!form.is_batch && form.standard_sales_price.trim() === ''
        ? ['Enter a sales price or mark the item as batch tracked.']
        : []),
    ],
    [form]
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
    setForm(DEFAULT_FORM);
    setNotice(null);
    setShowModal(true);
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setForm({
      item_description: item.item_description,
      barcode: item.barcode ?? '',
      category_id: item.category_id ? String(item.category_id) : '',
      brand_id: item.brand_id ? String(item.brand_id) : '',
      make_id: item.make_id ? String(item.make_id) : '',
      color_id: item.color_id ? String(item.color_id) : '',
      is_batch: item.is_batch,
      default_batch_price_mode: item.default_batch_price_mode || 'batch',
      is_serialized: item.is_serialized,
      reorder_level: String(item.reorder_level ?? 0),
      sales_criteria_enabled: item.sales_criteria_enabled,
      min_sales_qty: item.min_sales_qty ? String(item.min_sales_qty) : '',
      max_sales_qty: item.max_sales_qty ? String(item.max_sales_qty) : '',
      min_sales_price: item.min_sales_price ? String(item.min_sales_price) : '',
      max_sales_price: item.max_sales_price ? String(item.max_sales_price) : '',
      standard_purchase_price:
        Number(item.standard_purchase_price) > 0
          ? String(item.standard_purchase_price)
          : '',
      standard_sales_price:
        Number(item.standard_sales_price) > 0
          ? String(item.standard_sales_price)
          : '',
    });
    setNotice(null);
    setShowModal(true);
  };

  const openQuickAdd = (target: QuickAddTarget) => {
    setQuickAddTarget(target);
    setQuickAddName('');
    setQuickAddParentId('');
  };

  const handleQuickAddSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quickAddTarget || !quickAddName.trim()) return;

    const config = QUICK_ADD_CONFIG[quickAddTarget];
    setQuickAddSaving(true);

    try {
      const payload: Record<string, unknown> = {
        name: quickAddName.trim(),
      };

      if (quickAddTarget === 'category') {
        payload.parent_id = quickAddParentId ? Number(quickAddParentId) : null;
      }

      const response = await api.post<{ id: number }>(config.endpoint, payload);
      await loadData({ preserveNotice: true });

      if (response.data?.id) {
        setForm((current) => ({
          ...current,
          [config.formField]: String(response.data?.id),
        }));
      }

      setQuickAddTarget(null);
      setNotice({
        type: 'success',
        message: `${config.label} created and selected for this item.`,
      });
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, `Unable to create ${config.label.toLowerCase()}.`),
      });
    } finally {
      setQuickAddSaving(false);
    }
  };

  const handleBatchToggle = () => {
    setForm((current) => {
      const nextBatch = !current.is_batch;
      return {
        ...current,
        is_batch: nextBatch,
        default_batch_price_mode: nextBatch ? current.default_batch_price_mode : 'batch',
        standard_purchase_price: nextBatch ? '' : current.standard_purchase_price,
        standard_sales_price: nextBatch ? '' : current.standard_sales_price,
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (formPrerequisiteIssues.length > 0) {
      setNotice({
        type: 'warning',
        message: 'Fill the required item prerequisites before saving.',
        details: formPrerequisiteIssues,
      });
      return;
    }

    // Clear the previous attempt's message so each Save shows only its own result.
    setNotice(null);
    setSaving(true);

    try {
      const payload = {
        item_description: form.item_description.trim(),
        // Always a string (never Number) so leading zeros survive; blank clears it.
        barcode: normalizeBarcode(form.barcode) || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        make_id: form.make_id ? Number(form.make_id) : null,
        color_id: form.color_id ? Number(form.color_id) : null,
        is_batch: form.is_batch,
        default_batch_price_mode: form.is_batch ? form.default_batch_price_mode : 'batch',
        is_serialized: form.is_serialized,
        reorder_level: Number(form.reorder_level || 0),
        sales_criteria_enabled: form.sales_criteria_enabled,
        min_sales_qty: form.sales_criteria_enabled && form.min_sales_qty
          ? Number(form.min_sales_qty)
          : null,
        max_sales_qty: form.sales_criteria_enabled && form.max_sales_qty
          ? Number(form.max_sales_qty)
          : null,
        min_sales_price: form.sales_criteria_enabled && form.min_sales_price
          ? Number(form.min_sales_price)
          : null,
        max_sales_price: form.sales_criteria_enabled && form.max_sales_price
          ? Number(form.max_sales_price)
          : null,
        standard_purchase_price: form.is_batch
          ? 0
          : Number(form.standard_purchase_price || 0),
        standard_sales_price: form.is_batch
          ? 0
          : Number(form.standard_sales_price || 0),
      };

      if (editingItem) {
        await api.put(`/v1/items/${editingItem.id}`, payload);
      } else {
        await api.post('/v1/items', payload);
        setCurrentPage(1);
      }

      setShowModal(false);
      await loadData({ preserveNotice: true, page: editingItem ? currentPage : 1 });
      setNotice({
        type: 'success',
        message: `Item ${editingItem ? 'updated' : 'created'} successfully.`,
      });
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to save item.'),
      });
    } finally {
      setSaving(false);
    }
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Total items" value={String(summary.total)} tone="indigo" />
        <OperationMetric label="Batch tracked" value={String(summary.batch)} tone="emerald" />
        <OperationMetric label="Serialized" value={String(summary.serial)} tone="amber" />
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
                        {!item.is_batch && !item.is_serialized ? (
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
        <OperationModal
          title={editingItem ? 'Edit item' : 'Create item'}
          description="Use the category tree to place items under the right subcategory, then decide whether pricing should stay fixed or batch-driven."
          onClose={() => {
            if (!saving) setShowModal(false);
          }}
          width="max-w-4xl"
        >
          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            {notice && notice.type !== 'success' && (
              <OperationNotice type={notice.type} details={notice.details}>
                {notice.message}
              </OperationNotice>
            )}
            <div className="grid gap-4">
              <OperationField label="Item description" required>
                <input
                  type="text"
                  value={form.item_description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      item_description: event.target.value,
                    }))
                  }
                  placeholder="e.g. LG Smart TV 43 inch"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  required
                />
              </OperationField>

              <OperationField
                label="Barcode"
                help="Scan or type the product barcode. Leave blank if the item has none; clear it to remove."
              >
                <div className="relative">
                  <Barcode className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={50}
                    value={form.barcode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        barcode: normalizeBarcode(event.target.value),
                      }))
                    }
                    onKeyDown={(event) => {
                      // Scanners end with Enter: keep it from submitting the item form.
                      if (event.key === 'Enter') event.preventDefault();
                    }}
                    placeholder="e.g. 4791234567890"
                    className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3.5 font-mono text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </OperationField>

              <div className="grid gap-4 sm:grid-cols-2">
                <OperationField label="Category">
                  <div className="flex gap-2">
                    <SearchSelect
                      value={form.category_id}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          category_id: value,
                        }))
                      }
                      options={categoryOptions}
                      placeholder="Select category"
                      emptyOption="No category"
                      searchPlaceholder="Search category..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      wrapperClassName="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openQuickAdd('category')}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </OperationField>

                <OperationField label="Brand">
                  <div className="flex gap-2">
                    <SearchSelect
                      value={form.brand_id}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          brand_id: value,
                        }))
                      }
                      options={brands.map((brand) => ({ value: String(brand.id), label: brand.name }))}
                      placeholder="Select brand"
                      emptyOption="No brand"
                      searchPlaceholder="Search brand..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      wrapperClassName="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openQuickAdd('brand')}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </OperationField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <OperationField label="Make">
                  <div className="flex gap-2">
                    <SearchSelect
                      value={form.make_id}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          make_id: value,
                        }))
                      }
                      options={makes.map((make) => ({ value: String(make.id), label: make.name }))}
                      placeholder="Select make"
                      emptyOption="No make"
                      searchPlaceholder="Search make..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      wrapperClassName="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openQuickAdd('make')}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </OperationField>

                <OperationField label="Color">
                  <div className="flex gap-2">
                    <SearchSelect
                      value={form.color_id}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          color_id: value,
                        }))
                      }
                      options={colors.map((color) => ({ value: String(color.id), label: color.name }))}
                      placeholder="Select color"
                      emptyOption="No color"
                      searchPlaceholder="Search color..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      wrapperClassName="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => openQuickAdd('color')}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </OperationField>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleCard
                  active={form.is_batch}
                  icon={Boxes}
                  title="Batch tracked"
                  description="Batch items use GRN pricing instead of fixed master prices."
                  onClick={handleBatchToggle}
                />
                <ToggleCard
                  active={form.is_serialized}
                  icon={Barcode}
                  title="Serialized"
                  description="Serial numbers are recorded one by one at receipt and sale."
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      is_serialized: !current.is_serialized,
                    }))
                  }
                />
              </div>

              {form.is_batch && (
                <div className="space-y-4">
                  <OperationNotice type="success">
                    Batch-tracked items are priced per batch. Standard purchase and sales prices will be stored as zero.
                  </OperationNotice>
                  <OperationField label="Default batch sales price mode">
                    <select
                      value={form.default_batch_price_mode}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          default_batch_price_mode: event.target.value as 'batch' | 'average' | 'last',
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    >
                      <option value="batch">Batch price</option>
                      <option value="average">Average of all batches</option>
                      <option value="last">Last batch price</option>
                    </select>
                  </OperationField>
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Sales quantity and price criteria
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Optional min/max quantity and selling price limits enforced in sales invoices and hire purchase.
                    </p>
                  </div>
                  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          sales_criteria_enabled: false,
                          min_sales_qty: '',
                          max_sales_qty: '',
                          min_sales_price: '',
                          max_sales_price: '',
                        }))
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        !form.sales_criteria_enabled
                          ? 'bg-slate-950 text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          sales_criteria_enabled: true,
                        }))
                      }
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        form.sales_criteria_enabled
                          ? 'bg-slate-950 text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      On
                    </button>
                  </div>
                </div>

                {form.sales_criteria_enabled && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <OperationField label="Minimum sales quantity">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.min_sales_qty}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            min_sales_qty: event.target.value,
                          }))
                        }
                        placeholder="No minimum"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </OperationField>
                    <OperationField label="Maximum sales quantity">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.max_sales_qty}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            max_sales_qty: event.target.value,
                          }))
                        }
                        placeholder="No maximum"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </OperationField>
                    <OperationField label="Minimum sales price">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.min_sales_price}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            min_sales_price: event.target.value,
                          }))
                        }
                        placeholder="No minimum price"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </OperationField>
                    <OperationField label="Maximum sales price">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.max_sales_price}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            max_sales_price: event.target.value,
                          }))
                        }
                        placeholder="No maximum price"
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    </OperationField>
                  </div>
                )}
              </section>

              <div className="grid gap-4 sm:grid-cols-3">
                <OperationField label="Reorder level">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.reorder_level}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        reorder_level: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </OperationField>

                <OperationField label="Standard purchase price" required={!form.is_batch}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={form.is_batch}
                    value={form.is_batch ? '' : form.standard_purchase_price}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        standard_purchase_price: event.target.value,
                      }))
                    }
                    placeholder={form.is_batch ? 'Batch-driven' : '0.00'}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${
                      form.is_batch
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                        : 'border-slate-300 bg-white'
                    }`}
                    required={!form.is_batch}
                  />
                </OperationField>

                <OperationField label="Standard sales price" required={!form.is_batch}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={form.is_batch}
                    value={form.is_batch ? '' : form.standard_sales_price}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        standard_sales_price: event.target.value,
                      }))
                    }
                    placeholder={form.is_batch ? 'Batch-driven' : '0.00'}
                    className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${
                      form.is_batch
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                        : 'border-slate-300 bg-white'
                    }`}
                    required={!form.is_batch}
                  />
                </OperationField>
              </div>
            </div>

            <OperationActions
              saving={saving}
              submitLabel={editingItem ? 'Save changes' : 'Create item'}
              onCancel={() => setShowModal(false)}
              disabled={!form.item_description.trim()}
            />
          </form>
        </OperationModal>
      )}

      {quickAddTarget && (
        <OperationModal
          title={`Add ${QUICK_ADD_CONFIG[quickAddTarget].label.toLowerCase()}`}
          description="Create the missing prerequisite record and continue item setup without leaving this form."
          onClose={() => {
            if (!quickAddSaving) setQuickAddTarget(null);
          }}
          width="max-w-lg"
        >
          <form onSubmit={handleQuickAddSubmit} className="space-y-5 p-6">
            <OperationField label={`${QUICK_ADD_CONFIG[quickAddTarget].label} name`} required>
              <input
                type="text"
                value={quickAddName}
                onChange={(event) => setQuickAddName(event.target.value)}
                placeholder={`Enter ${QUICK_ADD_CONFIG[quickAddTarget].label.toLowerCase()} name`}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                required
              />
            </OperationField>

            {quickAddTarget === 'category' && (
              <OperationField label="Parent category">
                <SearchSelect
                  value={quickAddParentId}
                  onChange={setQuickAddParentId}
                  options={categoryOptions}
                  title="Select parent category" emptyOption="Top-level category"
                  searchPlaceholder="Search categories..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </OperationField>
            )}

            <OperationActions
              saving={quickAddSaving}
              submitLabel={`Create ${QUICK_ADD_CONFIG[quickAddTarget].label.toLowerCase()}`}
              onCancel={() => setQuickAddTarget(null)}
              disabled={!quickAddName.trim()}
            />
          </form>
        </OperationModal>
      )}
    </div>
  );
}
