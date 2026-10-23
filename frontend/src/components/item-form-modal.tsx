'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Barcode, Boxes, Plus, type LucideIcon } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { normalizeBarcode } from '@/lib/barcode';
import {
  OperationActions,
  OperationField,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { SearchSelect } from '@/components/search-select';

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Make {
  id: number;
  name: string;
}

export interface Color {
  id: number;
  name: string;
}

export interface Item {
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

export interface ItemFormState {
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

export function orderCategories(records: Category[]) {
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

export function buildCategoryPathMap(records: Category[]) {
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

function itemToForm(item: Item): ItemFormState {
  return {
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
  };
}

/**
 * Create / edit item popup, shared by the Items page and by item pickers on other
 * screens (e.g. the GRN) so an item can be added without leaving the transaction.
 * Loads its own category, brand, make and color lists.
 */
export function ItemFormModal({
  item = null,
  initialValues,
  onClose,
  onSaved,
}: {
  /** Item to edit; omit to create a new one. */
  item?: Item | null;
  /** Pre-filled values for a new item, e.g. the text typed into a search box. */
  initialValues?: Partial<ItemFormState>;
  onClose: () => void;
  /** Receives the saved item as returned by the API. */
  onSaved: (saved: Item) => void | Promise<void>;
}) {
  const [form, setForm] = useState<ItemFormState>(() =>
    item ? itemToForm(item) : { ...DEFAULT_FORM, ...initialValues }
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [saving, setSaving] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddParentId, setQuickAddParentId] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    details?: string[];
  } | null>(null);

  const loadMasterData = useCallback(async () => {
    try {
      const [categoriesRes, brandsRes, makesRes, colorsRes] = await Promise.all([
        api.get<Category[]>('/v1/categories?all=1'),
        api.get<Brand[]>('/v1/brands?all=1'),
        api.get<Make[]>('/v1/makes?all=1'),
        api.get<Color[]>('/v1/colors?all=1'),
      ]);
      setCategories(categoriesRes.data || []);
      setBrands(brandsRes.data || []);
      setMakes(makesRes.data || []);
      setColors(colorsRes.data || []);
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load categories, brands, makes and colors.'),
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMasterData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMasterData]);

  const categoryOptions = useMemo(() => {
    const ordered = orderCategories(categories);
    const { resolve } = buildCategoryPathMap(ordered);
    return ordered.map((record) => ({
      value: String(record.id),
      label: resolve(record.id),
    }));
  }, [categories]);

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

  const openQuickAdd = (target: QuickAddTarget) => {
    setQuickAddTarget(target);
    setQuickAddName('');
    setQuickAddParentId('');
  };

  const handleQuickAddSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // The quick-add popup can sit inside another form (e.g. the GRN); keep the submit here.
    event.stopPropagation();
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
      await loadMasterData();

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
    // React bubbles submit through portals; never let this post the form behind the popup.
    event.stopPropagation();

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

      const response = item
        ? await api.put<Item>(`/v1/items/${item.id}`, payload)
        : await api.post<Item>('/v1/items', payload);

      if (!response.data) throw new Error('The server did not return the saved item.');
      await onSaved(response.data);
    } catch (error: unknown) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to save item.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <OperationModal
        title={item ? 'Edit item' : 'Create item'}
        description="Use the category tree to place items under the right subcategory, then decide whether pricing should stay fixed or batch-driven."
        onClose={() => {
          if (!saving) onClose();
        }}
        width="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {notice && (
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
            submitLabel={item ? 'Save changes' : 'Create item'}
            onCancel={onClose}
            disabled={!form.item_description.trim()}
          />
        </form>
      </OperationModal>

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
    </>
  );
}
