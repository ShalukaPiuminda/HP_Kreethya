'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LoaderCircle, Play, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import { ReportTable } from '@/components/report-table';
import {
  CustomReportParamsForm,
  layoutTheme,
  ReportFooterLine,
  ReportLetterhead,
  ReportPager,
} from '@/components/custom-report-view';
import { ReportLayoutEditor } from '@/components/report-layout-editor';
import { OperationField, OperationNotice } from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  buildCustomColumns,
  buildCustomTotals,
  COLUMN_FORMATS,
  formatListOptions,
  mergeLayout,
  PARAM_SOURCE_LABELS,
  PARAM_SOURCES,
  parseListOptions,
  useFilterOptions,
  PARAM_TYPES,
  type CustomReport,
  type CustomReportColumn,
  type CustomReportLayout,
  type CustomReportParam,
  type CustomReportResult,
} from '@/lib/custom-reports';
import { CATEGORY_ORDER } from '@/lib/report-catalog';

export type ReportDraft = {
  id?: number;
  name: string;
  category: string;
  description: string;
  sql_query: string;
  is_published: boolean;
  sort_order: number;
  parameters: CustomReportParam[];
  columns: CustomReportColumn[];
  layout: CustomReportLayout;
};

const TEMPLATE_SQL = `SELECT s.Invoice_no, s.Invoice_date, s.Customer_Name, s.Net_Amount
FROM t_invoice_sums s
WHERE s.BC = :bc
  AND s.Invoice_date BETWEEN :from AND :to
ORDER BY s.Invoice_date DESC`;

export const emptyDraft = (): ReportDraft => ({
  name: '',
  category: '',
  description: '',
  sql_query: TEMPLATE_SQL,
  is_published: false,
  sort_order: 0,
  parameters: [
    { name: 'from', label: 'From', type: 'date', required: true, default: 'first day of this month', source: null },
    { name: 'to', label: 'To', type: 'date', required: true, default: 'today', source: null },
  ],
  columns: [],
  layout: mergeLayout(null),
});

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';
const smallInputClass = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm';

function headline(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/** Named placeholders in the SQL, ignoring string literals and comments. */
function sqlPlaceholders(sql: string) {
  const cleaned = sql
    .replace(/'(?:\\.|''|[^'\\])*'|"(?:\\.|""|[^"\\])*"/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(--\s|#).*$/gm, ' ');
  const names = new Set<string>();
  for (const match of cleaned.matchAll(/(?<!:):([A-Za-z_][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  names.delete('bc');
  return [...names];
}

const NEW_CATEGORY = '__new__';

/** Pick an existing category, or choose "+ New category…" and type a new name. */
function CategoryPicker({
  value,
  categories,
  onChange,
  disabled,
}: {
  value: string;
  categories: string[];
  onChange: (category: string) => void;
  disabled: boolean;
}) {
  const known = categories.find((category) => category.toLowerCase() === value.trim().toLowerCase());
  const [creating, setCreating] = useState(() => value.trim() !== '' && !known);

  if (creating) {
    const existing = categories.find(
      (category) => value.trim() !== '' && category.toLowerCase() === value.trim().toLowerCase()
    );
    return (
      <div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="New category name, e.g. Collections"
            maxLength={100}
            className={inputClass}
            disabled={disabled}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                onChange(existing ?? '');
              }}
              className="shrink-0 rounded-xl px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          )}
        </div>
        {existing && <p className="mt-1 text-xs text-amber-700">“{existing}” already exists. The report will be added to it.</p>}
      </div>
    );
  }

  return (
    <select
      value={known ?? ''}
      onChange={(event) => {
        if (event.target.value === NEW_CATEGORY) {
          setCreating(true);
          onChange('');
          return;
        }
        onChange(event.target.value);
      }}
      className={inputClass}
      disabled={disabled}
    >
      <option value="">No category (shows under “Other Reports”)</option>
      {categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
      <option value={NEW_CATEGORY}>+ New category…</option>
    </select>
  );
}

/** Filter names that obviously point at a master list become dropdowns automatically. */
const KNOWN_SOURCES: Array<[RegExp, CustomReportParam['source']]> = [
  [/^(category|categories|category_id|cat|sub_?category)$/, 'categories'],
  [/^(brand|brand_id)$/, 'brands'],
  [/^(make|make_id)$/, 'makes'],
  [/^(color|colour|color_id)$/, 'colors'],
  [/^(store|store_id|warehouse)$/, 'stores'],
  [/^(item|item_code|product)$/, 'items'],
  [/^(customer|customer_code|cus_code)$/, 'customers'],
  [/^(supplier|supplier_code|sup_code)$/, 'suppliers'],
  [/^(department|department_id|dept)$/, 'departments'],
  [/^(area|area_id)$/, 'areas'],
  [/^(route|route_id)$/, 'routes'],
  [/^(salesman|salesman_id|sales_rep)$/, 'salesmen'],
  [/^(scheme|schema|schema_id|hp_scheme)$/, 'schemas'],
  [/^(bank|bank_id)$/, 'banks'],
  [/^(account|account_code|cash_account)$/, 'cash_accounts'],
  [/^(reason|return_reason)$/, 'return_reasons'],
];

function guessParam(name: string): CustomReportParam {
  const source = KNOWN_SOURCES.find(([pattern]) => pattern.test(name))?.[1] ?? null;
  const isDate = /(^|_)(date|from|to|as_of)($|_)|_date$|^date/.test(name);
  return {
    name,
    label: headline(name.replace(/_(id|code)$/, '')),
    type: source ? 'select' : isDate ? 'date' : 'text',
    required: false,
    default: null,
    source,
  };
}

function guessColumn(column: CustomReportColumn): CustomReportColumn {
  const key = column.key.toLowerCase();
  if (/date|_at$/.test(key)) return { ...column, format: 'date' };
  if (/amount|total|price|balance|cost|value|paid|due|debit|credit|installment|rental/.test(key)) {
    return { ...column, format: 'money', align: 'right' };
  }
  if (/qty|quantity|count|^no_of/.test(key)) return { ...column, format: 'number', align: 'right' };
  return column;
}

export function draftFromReport(report: CustomReport): ReportDraft {
  return {
    id: report.id,
    name: report.name,
    category: report.category ?? '',
    description: report.description ?? '',
    sql_query: report.sql_query,
    is_published: report.is_published,
    sort_order: report.sort_order,
    parameters: report.parameters ?? [],
    columns: report.columns ?? [],
    layout: mergeLayout(report.layout),
  };
}

/** Existing categories for the Category picker: built-in ones first, then those used by saved reports. */
export function categoryChoices(reports: CustomReport[]): string[] {
  return [
    ...new Set([
      ...CATEGORY_ORDER,
      ...reports.map((report) => report.category?.trim()).filter((name): name is string => Boolean(name)),
    ]),
  ];
}

export function ReportEditor({
  initial,
  categories,
  readOnly,
  onBack,
  onSaved,
}: {
  initial: ReportDraft;
  categories: string[];
  readOnly: boolean;
  onBack: () => void;
  /** Called after every successful save with the saved report. */
  onSaved?: (report: CustomReport, created: boolean) => void;
}) {
  const [draft, setDraft] = useState<ReportDraft>(initial);
  // Last saved version, to know when there are unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial));
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const dirty = !readOnly && JSON.stringify(draft) !== savedSnapshot;

  // Warn before closing the tab / reloading with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CustomReportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const filterOptions = useFilterOptions(draft.parameters, '/v1/report-builder/filter-options');

  const update = (patch: Partial<ReportDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateParam = (index: number, patch: Partial<CustomReportParam>) =>
    update({ parameters: draft.parameters.map((param, i) => (i === index ? { ...param, ...patch } : param)) });
  const updateColumn = (index: number, patch: Partial<CustomReportColumn>) =>
    update({ columns: draft.columns.map((column, i) => (i === index ? { ...column, ...patch } : column)) });

  const missingParams = useMemo(() => {
    const declared = new Set(draft.parameters.map((param) => param.name));
    return sqlPlaceholders(draft.sql_query).filter((name) => !declared.has(name));
  }, [draft.parameters, draft.sql_query]);
  const usesBranch = /(?<!:):bc\b/.test(draft.sql_query);

  function addDetectedParams() {
    update({ parameters: [...draft.parameters, ...missingParams.map(guessParam)] });
  }

  // Filters declared but no longer used in the SQL (e.g. the template's from/to).
  const unusedParams = useMemo(() => {
    const used = new Set(sqlPlaceholders(draft.sql_query));
    return draft.parameters.filter((param) => param.name && !used.has(param.name)).map((param) => param.name);
  }, [draft.parameters, draft.sql_query]);

  async function runPreview(page = 1) {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const response = await api.post<CustomReportResult>('/v1/report-builder/preview', {
        sql_query: draft.sql_query,
        parameters: draft.parameters,
        columns: draft.columns,
        values: previewValues,
        page,
        per_page: 100,
      });
      setPreview(response.data ?? null);
    } catch (err) {
      setPreview(null);
      setPreviewError(getApiErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  function applyDetectedColumns() {
    if (!preview?.detected_columns.length) return;
    const existing = new Map(draft.columns.map((column) => [column.key, column]));
    update({
      columns: preview.detected_columns.map((column) => existing.get(column.key) ?? guessColumn(column)),
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || saving) return;
    setSavedMessage(null);

    // Checked here (not with browser "required" bubbles) so the message shows next to the Save button.
    if (!draft.name.trim()) {
      setError('Enter a report name before saving.');
      return;
    }
    if (!draft.sql_query.trim()) {
      setError('Enter the SQL query before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    const body = {
      name: draft.name.trim(),
      category: draft.category.trim() || null,
      description: draft.description || null,
      sql_query: draft.sql_query,
      is_published: draft.is_published,
      sort_order: draft.sort_order,
      parameters: draft.parameters.map((param) => ({ ...param, default: param.default || null })),
      columns: draft.columns,
      layout: draft.layout,
    };
    try {
      const created = !draft.id;
      const response = created
        ? await api.post<CustomReport>('/v1/report-builder', body)
        : await api.put<CustomReport>(`/v1/report-builder/${draft.id}`, body);
      const saved = response.data;
      const next = saved ? { ...draft, id: saved.id } : draft;
      setDraft(next);
      setSavedSnapshot(JSON.stringify(next));
      const message = created
        ? next.is_published
          ? 'Report created and published to Show Reports.'
          : 'Report saved as a draft (not published yet).'
        : 'Changes saved.';
      // On the development PC the report is also written to a project file (deployed with the code).
      setSavedMessage(saved?.file_path ? `${message} File: ${saved.file_path}` : message);
      if (saved) onSaved?.(saved, created);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onBack();
  }

  const previewColumns = buildCustomColumns(draft.columns.length ? draft.columns : preview?.columns ?? []);
  const previewTotals = buildCustomTotals(draft.columns, preview?.totals);

  // Builder "Test PDF / Test Excel": unsaved definition + layout, first 500 rows, current preview filters.
  const [testing, setTesting] = useState<'pdf' | 'xlsx' | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  async function testExport(format: 'pdf' | 'xlsx') {
    setTesting(format);
    setTestError(null);
    try {
      await api.downloadPost(
        '/v1/report-builder/preview-export',
        {
          sql_query: draft.sql_query,
          name: draft.name,
          parameters: draft.parameters,
          columns: draft.columns,
          layout: draft.layout,
          values: previewValues,
          subtitle: draft.description || null,
          format,
        },
        `preview-${draft.name || 'report'}.${format}`
      );
    } catch (err) {
      setTestError(getApiErrorMessage(err));
    } finally {
      setTesting(null);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <div className="sticky top-0 z-30 -mx-1 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Reports
            </button>
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-slate-900">
                {draft.id ? draft.name || 'Untitled report' : draft.name || 'New report'}
              </div>
              <div className="text-xs text-slate-500">
                {readOnly ? 'View only' : dirty ? 'Unsaved changes' : draft.id ? 'All changes saved' : 'Not saved yet'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={draft.is_published} onChange={(event) => update({ is_published: event.target.checked })} disabled={readOnly} />
              Published
            </label>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save report'}
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="mt-3">
            <OperationNotice type="error">{error}</OperationNotice>
          </div>
        )}
        {savedMessage && !error && (
          <div className="mt-3">
            <OperationNotice type="success">{savedMessage}</OperationNotice>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Queries run read-only. Use <code>:bc</code> for the user&apos;s branch and <code>:name</code> for each filter.
        Published reports appear on Show Reports under their category.
      </p>

      <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <OperationField label="Report name" required className="md:col-span-2">
            <input value={draft.name} onChange={(event) => update({ name: event.target.value })} className={inputClass} disabled={readOnly} />
          </OperationField>
          <OperationField label="Category" help="Groups the report on the Show Reports page.">
            <CategoryPicker
              value={draft.category}
              categories={categories}
              onChange={(category) => update({ category })}
              disabled={readOnly}
            />
          </OperationField>
          <OperationField label="Sort order">
            <input type="number" value={draft.sort_order} onChange={(event) => update({ sort_order: Number(event.target.value) || 0 })} className={inputClass} disabled={readOnly} />
          </OperationField>
          <OperationField label="Description" className="md:col-span-4">
            <input value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Shown under the report title and in PDF exports" className={inputClass} disabled={readOnly} />
          </OperationField>
        </div>

        <OperationField
          label="SQL query"
          required
          help="SELECT / WITH only. Filter by branch with :bc (required to publish). Optional filter: (:store IS NULL OR m.store_id = :store). Category including subcategories: (:category IS NULL OR i.category_id = :category OR c.parent_id = :category)."
        >
          <textarea
            value={draft.sql_query}
            onChange={(event) => update({ sql_query: event.target.value })}
            rows={10}
            spellCheck={false}
            className="w-full rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[13px] leading-6 text-slate-100"
            disabled={readOnly}
          />
        </OperationField>

        {!usesBranch && (
          <OperationNotice type="warning">
            This query does not use <code>:bc</code>. It can be previewed, but it must filter by branch before it can be published.
          </OperationNotice>
        )}

      </section>

        {/* Parameters */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Filters (parameters)</h3>
              <p className="text-xs text-slate-500">Date defaults accept text such as “today” or “first day of this month”.</p>
            </div>
            <div className="flex gap-2">
              {missingParams.length > 0 && !readOnly && (
                <button type="button" onClick={addDetectedParams} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                  <Wand2 className="h-3.5 w-3.5" />
                  Add :{missingParams.join(', :')}
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => update({ parameters: [...draft.parameters, { name: '', label: '', type: 'text', required: false, default: null, source: null }] })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add filter
                </button>
              )}
            </div>
          </div>
          {(unusedParams.length > 0 || draft.parameters.some((param) => param.type === 'select' && !param.source)) && (
            <div className="space-y-2 border-b border-slate-200 px-4 py-3">
              {draft.parameters.some((param) => param.type === 'select' && !param.source) && (
                <p className="text-xs font-medium text-rose-700">
                  Dropdown filters need a list: choose one under “Options from” (e.g. Categories).
                </p>
              )}
              {unusedParams.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800">
                  <span>
                    Not used in the SQL, but still shown to users: <code>:{unusedParams.join(', :')}</code>
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => update({ parameters: draft.parameters.filter((param) => !unusedParams.includes(param.name)) })}
                      className="rounded-lg bg-amber-50 px-2.5 py-1 font-semibold ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      Remove unused
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {draft.parameters.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No filters. The report runs with the branch only.</p>
          ) : (
            <div className="content-scrollbar overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Name (:name)</th>
                    <th className="px-3 py-2">Label</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Options from</th>
                    <th className="px-3 py-2">Default</th>
                    <th className="px-3 py-2 text-center">Required</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.parameters.map((param, index) => (
                    <Fragment key={index}>
                    <tr>
                      <td className="px-3 py-2">
                        <input value={param.name} onChange={(event) => updateParam(index, { name: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} className={`${smallInputClass} font-mono`} disabled={readOnly} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={param.label} onChange={(event) => updateParam(index, { label: event.target.value })} className={smallInputClass} disabled={readOnly} />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={param.type}
                          onChange={(event) => {
                            const type = event.target.value as CustomReportParam['type'];
                            // Only dropdowns load options; picking select also suggests a list from the name.
                            updateParam(index, {
                              type,
                              source: type === 'select' ? param.source ?? guessParam(param.name).source : null,
                            });
                          }}
                          className={smallInputClass}
                          disabled={readOnly}
                        >
                          {PARAM_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type === 'select' ? 'select (dropdown)' : type}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={param.source ?? ''}
                          onChange={(event) => {
                            const source = (event.target.value || null) as CustomReportParam['source'];
                            // Choosing a list turns the filter into a dropdown.
                            updateParam(index, source ? { source, type: 'select' } : { source: null });
                          }}
                          className={`${smallInputClass} ${param.type === 'select' && !param.source ? 'border-rose-300 bg-rose-50' : ''}`}
                          disabled={readOnly}
                        >
                          <option value="">{param.type === 'select' ? 'Choose a list…' : '— (not a dropdown)'}</option>
                          {PARAM_SOURCES.map((source) => <option key={source} value={source}>{PARAM_SOURCE_LABELS[source]}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input value={param.default ?? ''} onChange={(event) => updateParam(index, { default: event.target.value })} className={smallInputClass} disabled={readOnly} />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={param.required} onChange={(event) => updateParam(index, { required: event.target.checked })} disabled={readOnly} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!readOnly && (
                          <button type="button" onClick={() => update({ parameters: draft.parameters.filter((_, i) => i !== index) })} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove filter">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {param.type === 'select' && param.source === 'list' && (
                      <tr>
                        <td colSpan={7} className="px-3 pb-3">
                          <label className="block rounded-xl bg-slate-50 p-3">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                              Options for “{param.label || param.name || 'this filter'}”, one per line as <code>value | label</code> (label optional)
                            </span>
                            <textarea
                              key={`${index}-${param.source}`}
                              defaultValue={formatListOptions(param.options)}
                              onBlur={(event) => updateParam(index, { options: parseListOptions(event.target.value) })}
                              rows={Math.min(Math.max((param.options?.length ?? 0) + 1, 3), 8)}
                              placeholder={['active | Active', 'completed | Completed', 'returned | Returned'].join(String.fromCharCode(10))}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                              disabled={readOnly}
                            />
                          </label>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Preview */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Preview</h3>
              <p className="text-xs text-slate-500">Runs against your branch. Leave filters empty to use their defaults.</p>
            </div>
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={previewing || !draft.sql_query.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {previewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run preview
            </button>
          </div>
          <CustomReportParamsForm
            parameters={draft.parameters.filter((param) => param.name)}
            values={previewValues}
            options={filterOptions}
            onChange={setPreviewValues}
          />
          {previewError && <OperationNotice type="error">{previewError}</OperationNotice>}
          {preview && (
            <>
              <ReportTable
                title={draft.name || 'Preview'}
                subtitle={`${(preview.total ?? preview.rows.length).toLocaleString()} row(s) in total · generated ${preview.generated_at} · exports here contain this page only`}
                rows={preview.rows}
                columns={previewColumns}
                emptyLabel="The query returned no rows."
                exportName={`preview-${draft.name || 'report'}`}
                theme={layoutTheme(draft.layout)}
                totals={previewTotals}
                header={<ReportLetterhead layout={draft.layout} branding={preview.branding} />}
                footer={
                  <>
                    <ReportPager
                      page={preview.page}
                      lastPage={preview.last_page}
                      total={preview.total}
                      perPage={preview.per_page}
                      rowCount={preview.rows.length}
                      loading={previewing}
                      onPage={(page) => void runPreview(page)}
                    />
                    <ReportFooterLine layout={draft.layout} branding={preview.branding} generatedAt={preview.generated_at} />
                  </>
                }
              />
            </>
          )}
        </section>

        {/* Columns */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Columns</h3>
              <p className="text-xs text-slate-500">Leave empty to show every column from the query as plain text.</p>
            </div>
            {!readOnly && (
              <button
                type="button"
                onClick={applyDetectedColumns}
                disabled={!preview?.detected_columns.length}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 disabled:opacity-50"
                title={preview?.detected_columns.length ? undefined : 'Run a preview that returns rows first'}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Auto-detect from preview
              </button>
            )}
          </div>
          {draft.columns.length > 0 && (
            <div className="content-scrollbar overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Query column</th>
                    <th className="px-3 py-2">Heading</th>
                    <th className="px-3 py-2">Format</th>
                    <th className="px-3 py-2">Align</th>
                    <th className="px-3 py-2" title="Show the sum of all matching rows in a Total row (number / money columns)">Total</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.columns.map((column, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{column.key}</td>
                      <td className="px-3 py-2">
                        <input value={column.label} onChange={(event) => updateColumn(index, { label: event.target.value })} className={smallInputClass} disabled={readOnly} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={column.format} onChange={(event) => updateColumn(index, { format: event.target.value as CustomReportColumn['format'] })} className={smallInputClass} disabled={readOnly}>
                          {COLUMN_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select value={column.align} onChange={(event) => updateColumn(index, { align: event.target.value as CustomReportColumn['align'] })} className={smallInputClass} disabled={readOnly}>
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!column.total && (column.format === 'number' || column.format === 'money')}
                          onChange={(event) => updateColumn(index, { total: event.target.checked })}
                          disabled={readOnly || (column.format !== 'number' && column.format !== 'money')}
                          title={column.format === 'number' || column.format === 'money' ? 'Show the sum of all matching rows (run the preview again to see it)' : 'Only number / money columns can be totalled'}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!readOnly && (
                          <div className="flex justify-end gap-1 text-xs">
                            <button type="button" disabled={index === 0} onClick={() => {
                              const next = [...draft.columns];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              update({ columns: next });
                            }} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up">↑</button>
                            <button type="button" disabled={index === draft.columns.length - 1} onClick={() => {
                              const next = [...draft.columns];
                              [next[index + 1], next[index]] = [next[index], next[index + 1]];
                              update({ columns: next });
                            }} className="rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down">↓</button>
                            <button type="button" onClick={() => update({ columns: draft.columns.filter((_, i) => i !== index) })} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove column">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ReportLayoutEditor
          layout={draft.layout}
          onChange={(layout) => update({ layout })}
          readOnly={readOnly}
          branding={preview?.branding}
          columnCount={draft.columns.length || preview?.columns.length || 0}
          testing={testing}
          onTest={(format) => void testExport(format)}
        />

        {testError && <OperationNotice type="error">{testError}</OperationNotice>}

    </form>
  );
}
