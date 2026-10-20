'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, LoaderCircle, Play } from 'lucide-react';
import { ReportTable, type ReportExportFormat, type ReportTableTheme } from '@/components/report-table';
import { OperationField, OperationNotice } from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import {
  buildCustomColumns,
  buildCustomTotals,
  companyLines,
  initialParamValues,
  mergeLayout,
  PAGE_SIZES,
  optionsFor,
  textLines,
  type CustomReportBranding,
  type CustomReportLayout,
  type CustomReportParam,
  type FilterOptionsMap,
  type CustomReportResult,
  type PublishedCustomReport,
} from '@/lib/custom-reports';
import { SearchSelect } from '@/components/search-select';

/** Table colours from a report layout. */
export function layoutTheme(layout: CustomReportLayout): ReportTableTheme {
  return {
    title: layout.colors.title,
    headerBg: layout.colors.header_bg,
    headerText: layout.colors.header_text,
    stripeBg: layout.colors.stripe_bg || undefined,
    border: layout.colors.border,
    wrap: layout.wrap_text,
    lines: layout.table_lines,
  };
}

/** Company block and custom header text, shown above the report table (matches the PDF/Excel header). */
export function ReportLetterhead({
  layout,
  branding,
}: {
  layout: CustomReportLayout;
  branding?: CustomReportBranding | null;
}) {
  const company = companyLines(layout, branding);
  const text = textLines(layout.header.text, branding);
  if (company.length === 0 && text.length === 0) return null;

  return (
    <div className={`border-b px-5 pb-3 pt-5 ${layout.header.align === 'center' ? 'text-center' : ''}`} style={{ borderColor: layout.colors.border }}>
      {company.map((line, index) =>
        index === 0 ? (
          <div key={index} className="text-lg font-bold" style={{ color: layout.colors.title }}>
            {line}
          </div>
        ) : (
          <div key={index} className="text-xs text-slate-500">
            {line}
          </div>
        )
      )}
      {text.length > 0 && (
        <div className="mt-1.5 space-y-0.5 text-sm text-slate-700">
          {text.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Custom footer text and "Generated … by …" line under the report table. */
export function ReportFooterLine({
  layout,
  branding,
  generatedAt,
}: {
  layout: CustomReportLayout;
  branding?: CustomReportBranding | null;
  generatedAt?: string;
}) {
  const text = textLines(layout.footer.text, branding);
  const generated = layout.footer.show_generated && generatedAt
    ? `Generated ${generatedAt.slice(0, 16)}${branding?.user ? ` by ${branding.user}` : ''}`
    : '';
  if (text.length === 0 && !generated) return null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-t px-5 py-2.5 text-xs text-slate-500" style={{ borderColor: layout.colors.border }}>
      <div className="space-y-0.5">
        {text.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      {generated && <div>{generated}</div>}
    </div>
  );
}

export function CustomReportParamsForm({
  parameters,
  values,
  options,
  onChange,
}: {
  parameters: CustomReportParam[];
  values: Record<string, string>;
  options: FilterOptionsMap;
  onChange: (values: Record<string, string>) => void;
}) {
  if (parameters.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {parameters.map((param) => {
        const value = values[param.name] ?? '';
        const set = (next: string) => onChange({ ...values, [param.name]: next });
        const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5';

        return (
          <OperationField key={param.name} label={param.label || param.name} required={param.required}>
            {param.type === 'select' ? (
              <SearchSelect
                value={value}
                onChange={set}
                options={optionsFor(param, options)}
                placeholder="Select..."
                emptyOption={param.required ? undefined : 'All'}
                required={param.required}
                className={inputClass}
              />
            ) : (
              <input
                type={param.type === 'date' ? 'date' : param.type === 'number' ? 'number' : 'text'}
                value={value}
                onChange={(event) => set(event.target.value)}
                className={inputClass}
              />
            )}
          </OperationField>
        );
      })}
    </div>
  );
}

export function ReportPager({
  page,
  lastPage,
  total,
  perPage,
  rowCount,
  loading,
  onPage,
  onPerPage,
}: {
  page: number;
  lastPage: number | null;
  total: number | null;
  perPage: number;
  rowCount: number;
  loading: boolean;
  onPage: (page: number) => void;
  onPerPage?: (perPage: number) => void;
}) {
  const from = rowCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = (page - 1) * perPage + rowCount;
  const buttonClass =
    'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
      <div className="flex items-center gap-2">
        {loading && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-indigo-600" />}
        <span>
          Rows <strong className="text-slate-700">{from.toLocaleString()}</strong>–
          <strong className="text-slate-700">{to.toLocaleString()}</strong>
          {total !== null && (
            <>
              {' '}of <strong className="text-slate-700">{total.toLocaleString()}</strong>
            </>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onPerPage && (
          <select
            value={perPage}
            onChange={(event) => onPerPage(Number(event.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        )}
        <button type="button" className={buttonClass} disabled={loading || page <= 1} onClick={() => onPage(1)}>
          First
        </button>
        <button type="button" className={buttonClass} disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="px-1">
          Page {page.toLocaleString()}
          {lastPage !== null && ` of ${lastPage.toLocaleString()}`}
        </span>
        <button
          type="button"
          className={buttonClass}
          disabled={loading || (lastPage !== null ? page >= lastPage : rowCount < perPage)}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {lastPage !== null && (
          <button type="button" className={buttonClass} disabled={loading || page >= lastPage} onClick={() => onPage(lastPage)}>
            Last
          </button>
        )}
      </div>
    </div>
  );
}

type ViewState = {
  page: number;
  perPage: number;
  sort: string | null;
  direction: 'asc' | 'desc';
};

export function CustomReportView({
  report,
  options,
}: {
  report: PublishedCustomReport;
  options: FilterOptionsMap;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => initialParamValues(report.parameters));
  // Filters actually applied to the current result (edits take effect on "Run report").
  const [applied, setApplied] = useState<Record<string, string>>(() => initialParamValues(report.parameters));
  const [view, setView] = useState<ViewState>({ page: 1, perPage: 100, sort: null, direction: 'asc' });
  const [result, setResult] = useState<CustomReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownTotal = useRef<number | null>(null);
  const knownTotals = useRef<CustomReportResult['totals']>(null);
  const requestId = useRef(0);

  const missingRequired = report.parameters.some((param) => param.required && !values[param.name]);

  const queryFor = useCallback((filters: Record<string, string>, extra: Record<string, string>) => {
    return new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
      ...extra,
    }).toString();
  }, []);

  const load = useCallback(
    async (filters: Record<string, string>, next: ViewState, recount: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const query = queryFor(filters, {
          _page: String(next.page),
          _per_page: String(next.perPage),
          ...(next.sort ? { _sort: next.sort, _dir: next.direction } : {}),
          // Page changes reuse the known total instead of re-counting every row.
          ...(!recount && knownTotal.current !== null ? { _count: '0' } : {}),
        });
        const response = await api.get<CustomReportResult>(
          `/v1/reports/custom/${encodeURIComponent(report.slug)}/run?${query}`
        );
        if (id !== requestId.current) return;
        const data = response.data ?? null;
        if (data && data.total === null && knownTotal.current !== null) {
          data.total = knownTotal.current;
          data.last_page = Math.max(1, Math.ceil(knownTotal.current / data.per_page));
          // Totals are sent with the count, so reuse them on page changes too.
          data.totals = knownTotals.current;
        }
        knownTotal.current = data?.total ?? null;
        knownTotals.current = data?.totals ?? null;
        setResult(data);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(getApiErrorMessage(err));
        setResult(null);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [queryFor, report.slug]
  );

  // Switching tabs mounts a fresh view (keyed by slug); run once if nothing is missing.
  useEffect(() => {
    const initial = initialParamValues(report.parameters);
    if (report.parameters.some((param) => param.required && !initial[param.name])) return;
    const timer = window.setTimeout(() => void load(initial, { page: 1, perPage: 100, sort: null, direction: 'asc' }, true), 0);
    return () => window.clearTimeout(timer);
  }, [load, report.parameters]);

  const columns = useMemo(() => buildCustomColumns(result?.columns ?? []), [result]);
  const totals = useMemo(() => buildCustomTotals(result?.columns ?? [], result?.totals), [result]);
  const layout = useMemo(() => mergeLayout(result?.layout ?? report.layout), [report.layout, result?.layout]);
  const subtitle = useMemo(() => {
    const parts = layout.header.show_filters
      ? report.parameters
          .filter((param) => applied[param.name])
          .map((param) => {
            const raw = applied[param.name];
            const label = optionsFor(param, options).find((option) => option.value === raw)?.label ?? raw;
            return `${param.label || param.name}: ${label}`;
          })
      : [];
    return [report.description, parts.join(' · ')].filter(Boolean).join(' — ');
  }, [applied, layout.header.show_filters, options, report.description, report.parameters]);

  function runReport() {
    const next = { ...view, page: 1 };
    setApplied(values);
    setView(next);
    void load(values, next, true);
  }

  function changeView(patch: Partial<ViewState>, recount = false) {
    const next = { ...view, ...patch };
    setView(next);
    void load(applied, next, recount);
  }

  async function exportFile(format: ReportExportFormat) {
    const limit = result?.export_limits[format];
    if (limit && result?.total && result.total > limit) {
      setError(
        `This report has ${result.total.toLocaleString()} rows. ${format === 'pdf' ? 'PDF' : 'Excel'} export supports up to ${limit.toLocaleString()} rows — narrow the filters${format === 'pdf' ? ' or export to Excel' : ''}.`
      );
      return;
    }
    setError(null);
    try {
      const query = queryFor(applied, {
        _format: format,
        ...(subtitle ? { _subtitle: subtitle.slice(0, 500) } : {}),
        ...(view.sort ? { _sort: view.sort, _dir: view.direction } : {}),
      });
      await api.download(
        `/v1/reports/custom/${encodeURIComponent(report.slug)}/export?${query}`,
        `${report.slug}.${format}`
      );
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4 text-indigo-600" />
            {report.parameters.length ? 'Customize report' : report.name}
          </div>
          <button
            type="button"
            onClick={runReport}
            disabled={loading || missingRequired}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run report
          </button>
        </div>
        <CustomReportParamsForm
          parameters={report.parameters}
          values={values}
          options={options}
          onChange={setValues}
        />
      </section>

      {error && <OperationNotice type="error">{error}</OperationNotice>}

      {loading && !result ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-400">
          Loading report data...
        </div>
      ) : result ? (
        <ReportTable
          title={report.name}
          subtitle={subtitle || undefined}
          rows={result.rows}
          columns={columns}
          emptyLabel="No rows match these filters."
          exportName={report.slug}
          serverSort={{
            key: view.sort,
            direction: view.direction,
            onChange: (key, direction) => changeView({ sort: key, direction, page: 1 }),
          }}
          onServerExport={exportFile}
          theme={layoutTheme(layout)}
          totals={totals}
          header={<ReportLetterhead layout={layout} branding={result.branding} />}
          footer={
            <>
              <ReportPager
                page={result.page}
                lastPage={result.last_page}
                total={result.total}
                perPage={result.per_page}
                rowCount={result.rows.length}
                loading={loading}
                onPage={(page) => changeView({ page })}
                onPerPage={(perPage) => changeView({ perPage, page: 1 })}
              />
              <ReportFooterLine layout={layout} branding={result.branding} generatedAt={result.generated_at} />
            </>
          }
        />
      ) : (
        !error && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-400">
            Fill in the required filters and click Run report.
          </div>
        )
      )}
    </div>
  );
}
