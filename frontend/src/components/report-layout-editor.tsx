'use client';

import { FileSpreadsheet, LoaderCircle, Printer, RotateCcw } from 'lucide-react';
import {
  companyLines,
  DEFAULT_LAYOUT,
  textLines,
  type CustomReportBranding,
  type CustomReportLayout,
} from '@/lib/custom-reports';

const PAPER_MM: Record<CustomReportLayout['page_size'], [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [216, 279],
  Legal: [216, 356],
};

const SAMPLE_BRANDING: CustomReportBranding = {
  company: { name: 'Your Company Name', address: 'No. 1, Main Street, Colombo', phone: '011 234 5678', email: 'info@company.lk' },
  branch: { code: 'HQ', name: 'Head Office' },
  user: 'admin',
};

const selectClass = 'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50';
const checkboxLabel = 'inline-flex items-center gap-2 text-sm text-slate-700';

type ColorKey = keyof CustomReportLayout['colors'];
const COLOR_FIELDS: Array<[ColorKey, string]> = [
  ['title', 'Title / company name'],
  ['header_bg', 'Table header background'],
  ['header_text', 'Table header text'],
  ['stripe_bg', 'Alternate row (stripe)'],
  ['border', 'Row lines / borders'],
];

export function ReportLayoutEditor({
  layout,
  onChange,
  readOnly,
  branding,
  columnCount,
  testing,
  onTest,
}: {
  layout: CustomReportLayout;
  onChange: (layout: CustomReportLayout) => void;
  readOnly: boolean;
  /** Real company details when a preview has run; sample text otherwise. */
  branding?: CustomReportBranding | null;
  columnCount: number;
  testing: 'pdf' | 'xlsx' | null;
  onTest: (format: 'pdf' | 'xlsx') => void;
}) {
  const set = (patch: Partial<CustomReportLayout>) => onChange({ ...layout, ...patch });
  const setHeader = (patch: Partial<CustomReportLayout['header']>) => onChange({ ...layout, header: { ...layout.header, ...patch } });
  const setFooter = (patch: Partial<CustomReportLayout['footer']>) => onChange({ ...layout, footer: { ...layout.footer, ...patch } });
  const setColor = (key: ColorKey, value: string) => onChange({ ...layout, colors: { ...layout.colors, [key]: value.toUpperCase() } });

  return (
    <section className="rounded-2xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Page layout</h3>
          <p className="text-xs text-slate-500">
            Header, footer and colours apply to the PDF, Excel and the report screen. Page size and orientation apply to PDF and Excel printing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => onChange(structuredClone(DEFAULT_LAYOUT))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to default
            </button>
          )}
          <button
            type="button"
            onClick={() => onTest('pdf')}
            disabled={testing !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 disabled:opacity-50"
          >
            {testing === 'pdf' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            Test PDF
          </button>
          <button
            type="button"
            onClick={() => onTest('xlsx')}
            disabled={testing !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 disabled:opacity-50"
          >
            {testing === 'xlsx' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Test Excel
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {/* Page */}
          <fieldset className="grid gap-3 sm:grid-cols-4">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Page</legend>
            <label className="text-xs font-semibold text-slate-600">
              Page size
              <select value={layout.page_size} onChange={(event) => set({ page_size: event.target.value as CustomReportLayout['page_size'] })} className={`${selectClass} mt-1`} disabled={readOnly}>
                {Object.keys(PAPER_MM).map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Orientation
              <select value={layout.orientation} onChange={(event) => set({ orientation: event.target.value as CustomReportLayout['orientation'] })} className={`${selectClass} mt-1`} disabled={readOnly}>
                <option value="auto">Auto (landscape if &gt; 6 columns)</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Margins
              <select value={layout.margins} onChange={(event) => set({ margins: event.target.value as CustomReportLayout['margins'] })} className={`${selectClass} mt-1`} disabled={readOnly}>
                <option value="narrow">Narrow (6 mm)</option>
                <option value="normal">Normal (10 mm)</option>
                <option value="wide">Wide (15 mm)</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Table text size
              <select value={layout.font_size} onChange={(event) => set({ font_size: event.target.value as CustomReportLayout['font_size'] })} className={`${selectClass} mt-1`} disabled={readOnly}>
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Table lines
              <select value={layout.table_lines} onChange={(event) => set({ table_lines: event.target.value as CustomReportLayout['table_lines'] })} className={`${selectClass} mt-1`} disabled={readOnly}>
                <option value="rows">Row lines (under each row)</option>
                <option value="grid">Full grid (all cell borders)</option>
                <option value="none">No lines</option>
              </select>
            </label>
            <label className={`${checkboxLabel} sm:col-span-3`}>
              <input type="checkbox" checked={layout.wrap_text} onChange={(event) => set({ wrap_text: event.target.checked })} disabled={readOnly} />
              <span>
                <span className="font-semibold">Wrap long text</span>
                <span className="text-slate-500"> — long values continue on the next line (rows get taller) instead of being cut with “…”. Numbers and dates never wrap.</span>
              </span>
            </label>
          </fieldset>

          {/* Header */}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Header</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className={checkboxLabel}>
                <input type="checkbox" checked={layout.header.show_company} onChange={(event) => setHeader({ show_company: event.target.checked })} disabled={readOnly} />
                Company name, address &amp; contact
              </label>
              <label className={checkboxLabel}>
                <input type="checkbox" checked={layout.header.show_branch} onChange={(event) => setHeader({ show_branch: event.target.checked })} disabled={readOnly} />
                Branch name
              </label>
              <label className={checkboxLabel}>
                <input type="checkbox" checked={layout.header.show_filters} onChange={(event) => setHeader({ show_filters: event.target.checked })} disabled={readOnly} />
                Selected filters
              </label>
              <label className={checkboxLabel} title="Off: the header prints on the first PDF page only; later pages start with the column headings.">
                <input type="checkbox" checked={layout.header.repeat} onChange={(event) => setHeader({ repeat: event.target.checked })} disabled={readOnly} />
                Repeat header on every page
              </label>
              <label className={checkboxLabel}>
                Align
                <select value={layout.header.align} onChange={(event) => setHeader({ align: event.target.value as CustomReportLayout['header']['align'] })} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" disabled={readOnly}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                </select>
              </label>
            </div>
            <textarea
              value={layout.header.text}
              onChange={(event) => setHeader({ text: event.target.value })}
              rows={2}
              maxLength={500}
              placeholder={'Extra header lines, e.g. "Monthly Stock Report – {branch}"'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              disabled={readOnly}
            />
          </fieldset>

          {/* Footer */}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Footer</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className={checkboxLabel}>
                <input type="checkbox" checked={layout.footer.show_generated} onChange={(event) => setFooter({ show_generated: event.target.checked })} disabled={readOnly} />
                “Generated date / by user”
              </label>
              <label className={checkboxLabel}>
                <input type="checkbox" checked={layout.footer.show_page_numbers} onChange={(event) => setFooter({ show_page_numbers: event.target.checked })} disabled={readOnly} />
                Page numbers
              </label>
            </div>
            <textarea
              value={layout.footer.text}
              onChange={(event) => setFooter({ text: event.target.value })}
              rows={2}
              maxLength={500}
              placeholder={'e.g. "Confidential – for internal use only" or "Prepared by: ________   Checked by: ________"'}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              disabled={readOnly}
            />
            <p className="text-xs text-slate-400">
              In header and footer text you can use <code>{'{company}'}</code>, <code>{'{branch}'}</code>, <code>{'{date}'}</code> and <code>{'{user}'}</code>.
            </p>
          </fieldset>

          {/* Colours */}
          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Table colours</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {COLOR_FIELDS.map(([key, label]) => {
                const value = layout.colors[key];
                const isStripe = key === 'stripe_bg';
                return (
                  <div key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
                    <input
                      type="color"
                      value={value || '#FFFFFF'}
                      onChange={(event) => setColor(key, event.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5 disabled:cursor-not-allowed"
                      disabled={readOnly || (isStripe && !value)}
                      aria-label={label}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-700">{label}</div>
                      <div className="font-mono text-[11px] text-slate-400">{value || 'none'}</div>
                    </div>
                    {isStripe && (
                      <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) => setColor(key, event.target.checked ? DEFAULT_LAYOUT.colors.stripe_bg : '')}
                          disabled={readOnly}
                        />
                        On
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>

        <PagePreview layout={layout} branding={branding} columnCount={columnCount} />
      </div>
    </section>
  );
}

/** Small scaled "paper" showing where the header, table colours and footer go. */
function PagePreview({
  layout,
  branding,
  columnCount,
}: {
  layout: CustomReportLayout;
  branding?: CustomReportBranding | null;
  columnCount: number;
}) {
  const landscape = layout.orientation === 'landscape' || (layout.orientation === 'auto' && columnCount > 6);
  const [shortSide, longSide] = PAPER_MM[layout.page_size];
  const [widthMm, heightMm] = landscape ? [longSide, shortSide] : [shortSide, longSide];
  const width = 280;
  const height = Math.round((width * heightMm) / widthMm);
  const padding = Math.max(6, Math.round((width * ({ narrow: 6, normal: 10, wide: 15 }[layout.margins])) / widthMm));

  const brand = branding?.company.name ? branding : SAMPLE_BRANDING;
  const company = companyLines(layout, brand);
  const headerText = textLines(layout.header.text, brand);
  const footerText = textLines(layout.footer.text, brand);
  const center = layout.header.align === 'center';
  const sampleColumns = Math.min(Math.max(columnCount, 3), 6);

  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        Preview · {layout.page_size} {landscape ? 'landscape' : 'portrait'}
      </div>
      <div
        className="relative flex flex-col overflow-hidden bg-white shadow-md ring-1 ring-slate-200"
        style={{ width, height, padding, fontSize: 6 }}
      >
        <div className={center ? 'text-center' : ''}>
          {company.map((line, index) => (
            <div key={index} className={index === 0 ? 'font-bold' : 'text-slate-500'} style={index === 0 ? { color: layout.colors.title, fontSize: 8 } : { fontSize: 5 }}>
              {line}
            </div>
          ))}
          {headerText.map((line, index) => (
            <div key={`h${index}`} className="text-slate-700" style={{ fontSize: 5.5 }}>
              {line}
            </div>
          ))}
          {(company.length > 0 || headerText.length > 0) && <div className="my-1 border-t" style={{ borderColor: layout.colors.border }} />}
          <div className="font-bold" style={{ color: layout.colors.title, fontSize: 7.5 }}>
            Report title
          </div>
          {layout.header.show_filters && <div className="text-slate-400" style={{ fontSize: 5 }}>Category: Electronics · Store: Main Store</div>}
        </div>

        <div className="mt-1.5">
          <div className="flex" style={{ backgroundColor: layout.colors.header_bg, color: layout.colors.header_text }}>
            {Array.from({ length: sampleColumns }, (_, index) => (
              <div key={index} className="flex-1 px-0.5 py-0.5 font-semibold">
                Column {index + 1}
              </div>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, row) => (
            <div
              key={row}
              className={`flex ${layout.table_lines === 'none' ? '' : 'border-b'}`}
              style={{
                borderColor: layout.colors.border,
                backgroundColor: layout.colors.stripe_bg && row % 2 === 1 ? layout.colors.stripe_bg : undefined,
              }}
            >
              {Array.from({ length: sampleColumns }, (_, index) => (
                <div
                  key={index}
                  className={`min-w-0 flex-1 px-0.5 py-[1px] text-slate-600 ${layout.wrap_text ? 'break-words' : 'truncate'} ${layout.table_lines === 'grid' ? 'border-l last:border-r' : ''}`}
                  style={layout.table_lines === 'grid' ? { borderColor: layout.colors.border } : undefined}
                >
                  {index === 0 ? `Row ${row + 1}` : index === 1 && row === 0 ? 'A long item description that needs more room' : '…'}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-auto border-t pt-0.5 text-slate-500" style={{ borderColor: layout.colors.border, fontSize: 5 }}>
          {footerText.slice(1).map((line, index) => (
            <div key={index}>{line}</div>
          ))}
          <div className="flex justify-between gap-1">
            <span className="truncate">{footerText[0] ?? ''}</span>
            {layout.footer.show_generated && <span>Generated 2026-09-29 10:15 by {brand.user}</span>}
            {layout.footer.show_page_numbers && <span>Page 1 of 3</span>}
          </div>
        </div>
      </div>
      {!branding?.company.name && <p className="mt-2 text-[11px] text-slate-400">Sample company details. Run a preview to see yours.</p>}
    </div>
  );
}
