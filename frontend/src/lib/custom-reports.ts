import { useEffect, useMemo, useState } from 'react';
import type { ReportColumn } from '@/components/report-table';
import { api } from '@/lib/api';
import { financeDate, financeMoney } from '@/lib/finance';

export type CustomReportParamType = 'date' | 'text' | 'number' | 'select';
/** Where a "select" filter gets its options: a master list from the database, or "list" (typed in by the developer). */
export type CustomReportParamSource =
  | 'stores'
  | 'items'
  | 'customers'
  | 'suppliers'
  | 'cash_accounts'
  | 'categories'
  | 'brands'
  | 'makes'
  | 'colors'
  | 'departments'
  | 'areas'
  | 'routes'
  | 'salesmen'
  | 'schemas'
  | 'banks'
  | 'return_reasons'
  | 'list';

export interface FilterOption {
  value: string;
  label: string;
}

/** Loaded options per database source. */
export type FilterOptionsMap = Partial<Record<CustomReportParamSource, FilterOption[]>>;
export type CustomReportColumnFormat = 'text' | 'number' | 'money' | 'date';

export interface CustomReportParam {
  name: string;
  label: string;
  type: CustomReportParamType;
  required: boolean;
  default: string | null;
  source: CustomReportParamSource | null;
  /** Only for source "list". */
  options?: FilterOption[];
}

export interface CustomReportColumn {
  key: string;
  label: string;
  align: 'left' | 'right' | 'center';
  format: CustomReportColumnFormat;
  /** Show this column's sum over all matching rows in a "Total" row (number/money only). */
  total?: boolean;
}

/** Page layout of a report: PDF page, header/footer, and table colours (also used on screen and in Excel). */
export interface CustomReportLayout {
  page_size: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
  orientation: 'auto' | 'portrait' | 'landscape';
  margins: 'narrow' | 'normal' | 'wide';
  font_size: 'small' | 'normal' | 'large';
  /** Long text continues on extra lines instead of being cut with "…". */
  wrap_text: boolean;
  /** Lines in the table: under each row, a full grid, or none. */
  table_lines: 'rows' | 'grid' | 'none';
  header: {
    show_company: boolean;
    show_branch: boolean;
    text: string;
    align: 'left' | 'center';
    show_filters: boolean;
    /** PDF: repeat company block / title on every page (default: first page only). */
    repeat: boolean;
  };
  footer: {
    text: string;
    show_generated: boolean;
    show_page_numbers: boolean;
  };
  colors: {
    title: string;
    header_bg: string;
    header_text: string;
    /** Empty string = no stripes. */
    stripe_bg: string;
    border: string;
  };
}

export const DEFAULT_LAYOUT: CustomReportLayout = {
  page_size: 'A4',
  orientation: 'auto',
  margins: 'normal',
  font_size: 'normal',
  wrap_text: false,
  table_lines: 'rows',
  header: { show_company: true, show_branch: false, text: '', align: 'left', show_filters: true, repeat: false },
  footer: { text: '', show_generated: true, show_page_numbers: true },
  colors: { title: '#0F172A', header_bg: '#F1F5F9', header_text: '#334155', stripe_bg: '#F8FAFC', border: '#E2E8F0' },
};

/** Fill missing keys (older reports saved before layouts existed) with defaults. */
export function mergeLayout(layout: Partial<CustomReportLayout> | null | undefined): CustomReportLayout {
  return {
    ...DEFAULT_LAYOUT,
    ...(layout ?? {}),
    header: { ...DEFAULT_LAYOUT.header, ...(layout?.header ?? {}) },
    footer: { ...DEFAULT_LAYOUT.footer, ...(layout?.footer ?? {}) },
    colors: { ...DEFAULT_LAYOUT.colors, ...(layout?.colors ?? {}) },
  };
}

/** Company, branch and current user, for the header/footer. */
export interface CustomReportBranding {
  company: { name: string; address: string; phone: string; email: string };
  branch: { code: string; name: string };
  user: string;
}

/** Replace {company}, {branch}, {date} and {user} placeholders. */
export function fillPlaceholders(text: string, branding: CustomReportBranding | null | undefined): string {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return text
    .replaceAll('{company}', branding?.company.name ?? '')
    .replaceAll('{branch}', branding?.branch.name ?? '')
    .replaceAll('{date}', date)
    .replaceAll('{user}', branding?.user ?? '');
}

/** Header company block lines, same rules as the PDF/Excel exports. */
export function companyLines(layout: CustomReportLayout, branding: CustomReportBranding | null | undefined): string[] {
  const lines: string[] = [];
  const company = branding?.company;
  if (layout.header.show_company && company?.name) {
    lines.push(company.name);
    if (company.address) lines.push(company.address.replace(/\s*\r?\n\s*/g, ', '));
    const contact = [company.phone ? `Tel: ${company.phone}` : '', company.email].filter(Boolean).join('  ·  ');
    if (contact) lines.push(contact);
  }
  if (layout.header.show_branch && branding?.branch.name) lines.push(`Branch: ${branding.branch.name}`);
  return lines;
}

export function textLines(text: string, branding: CustomReportBranding | null | undefined): string[] {
  return fillPlaceholders(text, branding)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Published report as seen on the Reports tab (no SQL). */
export interface PublishedCustomReport {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  parameters: CustomReportParam[];
  columns: CustomReportColumn[];
  layout?: Partial<CustomReportLayout> | null;
}

/** Full definition as edited in the Report Builder. */
export interface CustomReport extends PublishedCustomReport {
  sql_query: string;
  is_published: boolean;
  sort_order: number;
  updated_at: string;
  UID: string;
  /** Saved as backend/resources/reports/<slug>.json (deployed with the code). */
  from_file?: boolean;
  file_path?: string | null;
  /** true on a development PC (saving writes the file); false on the server (file reports are view-only). */
  files_writable?: boolean;
}

export type CustomReportRow = Record<string, string | number | null>;

/** One server-side page of a report. `total`/`last_page` are null when the count was skipped. */
export interface CustomReportResult {
  columns: CustomReportColumn[];
  detected_columns: CustomReportColumn[];
  rows: CustomReportRow[];
  page: number;
  per_page: number;
  total: number | null;
  last_page: number | null;
  /** Column key => sum over every matching row; null when the count was skipped or no column is totalled. */
  totals?: Record<string, number | string> | null;
  sort: string | null;
  direction: 'asc' | 'desc';
  export_limits: { xlsx: number; pdf: number };
  generated_at: string;
  branding?: CustomReportBranding;
  layout?: CustomReportLayout;
}

export const PAGE_SIZES = [50, 100, 250, 500, 1000];

export const PARAM_TYPES: CustomReportParamType[] = ['date', 'text', 'number', 'select'];
/** Sources in the order shown in the builder, with readable names. */
export const PARAM_SOURCE_LABELS: Record<CustomReportParamSource, string> = {
  categories: 'Categories',
  brands: 'Brands',
  makes: 'Makes',
  colors: 'Colors',
  items: 'Items',
  stores: 'Stores',
  departments: 'Departments',
  customers: 'Customers',
  suppliers: 'Suppliers',
  areas: 'Areas',
  routes: 'Routes',
  salesmen: 'Salesmen',
  schemas: 'HP Schemes',
  banks: 'Banks',
  cash_accounts: 'Cash / bank accounts',
  return_reasons: 'Return reasons',
  list: 'Fixed list (type options)',
};
export const PARAM_SOURCES = Object.keys(PARAM_SOURCE_LABELS) as CustomReportParamSource[];
export const COLUMN_FORMATS: CustomReportColumnFormat[] = ['text', 'number', 'money', 'date'];

/** Options for one "select" filter: its own fixed list, or the loaded database list. */
export function optionsFor(param: CustomReportParam, loaded: FilterOptionsMap): FilterOption[] {
  if (!param.source) return [];
  if (param.source === 'list') return param.options ?? [];
  return loaded[param.source] ?? [];
}

/** Parse the builder's fixed-list editor: one option per line, "value | label" or just "value". */
export function parseListOptions(text: string): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [rawValue, ...rest] = line.split('|');
    const value = rawValue.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: rest.join('|').trim() || value });
  }
  return options;
}

export function formatListOptions(options: FilterOption[] | undefined): string {
  return (options ?? []).map((option) => (option.label && option.label !== option.value ? `${option.value} | ${option.label}` : option.value)).join(String.fromCharCode(10));
}

/**
 * Load the database lists used by these filters, in one request.
 * endpoint: '/v1/reports/filter-options' (report pages) or '/v1/report-builder/filter-options' (builder).
 */
export function useFilterOptions(parameters: CustomReportParam[], endpoint: string): FilterOptionsMap {
  const sources = useMemo(
    () =>
      [...new Set(parameters.filter((param) => param.type === 'select' && param.source && param.source !== 'list').map((param) => param.source as string))]
        .sort()
        .join(','),
    [parameters]
  );
  const [loaded, setLoaded] = useState<{ key: string; options: FilterOptionsMap }>({ key: '', options: {} });

  useEffect(() => {
    if (!sources) return;
    let cancelled = false;
    api
      .get<FilterOptionsMap>(`${endpoint}?sources=${encodeURIComponent(sources)}`)
      .then((response) => {
        if (!cancelled) setLoaded({ key: `${endpoint}:${sources}`, options: response.data || {} });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: `${endpoint}:${sources}`, options: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, sources]);

  // Keep showing the previous lists while a new set loads (e.g. after adding a filter in the builder).
  return loaded.options;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildCustomColumns(columns: CustomReportColumn[]): ReportColumn<CustomReportRow>[] {
  return columns.map((column) => {
    const numeric = column.format === 'money' || column.format === 'number';
    const raw = (row: CustomReportRow) => row[column.key];

    return {
      key: column.key,
      label: column.label || column.key,
      sortable: true,
      align: column.align ?? (numeric ? 'right' : 'left'),
      render: (row) => {
        const value = raw(row);
        if (value === null || value === undefined || value === '') return '—';
        if (column.format === 'money') return financeMoney(value);
        if (column.format === 'number') return Number(value).toLocaleString('en-LK');
        if (column.format === 'date') return financeDate(String(value));
        return String(value);
      },
      sortValue: (row) => (numeric ? toNumber(raw(row)) : raw(row)),
      exportValue: (row) => (numeric ? toNumber(raw(row)) : raw(row)),
    };
  });
}

/** Formatted "Total" row cells for the table, or undefined when no column is totalled. */
export function buildCustomTotals(
  columns: CustomReportColumn[],
  totals: Record<string, number | string> | null | undefined
): Record<string, string> | undefined {
  if (!totals) return undefined;
  const cells: Record<string, string> = {};
  for (const column of columns) {
    if (!column.total || !(column.key in totals)) continue;
    const value = totals[column.key];
    cells[column.key] = column.format === 'money' ? financeMoney(value) : Number(value).toLocaleString('en-LK');
  }
  return Object.keys(cells).length ? cells : undefined;
}

/** Initial filter values: declared defaults (dates already resolved by the API). */
export function initialParamValues(parameters: CustomReportParam[]): Record<string, string> {
  return Object.fromEntries(parameters.map((param) => [param.name, param.default ?? '']));
}
