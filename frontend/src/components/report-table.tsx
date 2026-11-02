'use client';

import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, FileSpreadsheet, LoaderCircle, Printer } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type SortDirection = 'asc' | 'desc';
export type ReportExportFormat = 'xlsx' | 'pdf';

export interface ReportTableTheme {
  title?: string;
  headerBg?: string;
  headerText?: string;
  /** Alternate row background; empty/undefined = no stripes. */
  stripeBg?: string;
  border?: string;
  /** true: long text wraps inside a column; false: one line per row; undefined: browser default. */
  wrap?: boolean;
  /** rows (default): line under each row; grid: every cell outlined; none: no lines. */
  lines?: 'rows' | 'grid' | 'none';
}

function wrapClass(wrap: boolean | undefined) {
  if (wrap === undefined) return '';
  return wrap ? 'max-w-xs whitespace-normal break-words' : 'whitespace-nowrap';
}

/** Server-side sorting: the table shows rows as given and reports header clicks instead of sorting locally. */
export interface ReportServerSort {
  key: string | null;
  direction: SortDirection;
  onChange: (key: string, direction: SortDirection) => void;
}

export interface ReportColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  exportValue?: (row: T) => string | number | null | undefined;
}

export function ReportTable<T>({
  title,
  subtitle,
  rows,
  columns,
  emptyLabel,
  exportName,
  initialSortKey,
  initialSortDirection = 'asc',
  serverSort,
  onServerExport,
  header,
  footer,
  theme,
  totals,
}: {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ReportColumn<T>[];
  emptyLabel: string;
  exportName: string;
  initialSortKey?: string;
  initialSortDirection?: SortDirection;
  /** Sort on the server (paged reports) instead of sorting the loaded rows. */
  serverSort?: ReportServerSort;
  /** Build export files on the server (all rows) instead of from the loaded rows. */
  onServerExport?: (format: ReportExportFormat) => Promise<void>;
  /** Rendered above the title, e.g. a company letterhead. */
  header?: React.ReactNode;
  /** Rendered under the table, e.g. a pager. */
  footer?: React.ReactNode;
  /** Table colours (custom report layouts). Omit for the default look. */
  theme?: ReportTableTheme;
  /** Column key => cell for a "Total" row under the rows (e.g. sums of all matching rows). */
  totals?: Record<string, React.ReactNode>;
}) {
  const totalsLabelKey = totals ? columns.find((column) => !(column.key in totals))?.key : undefined;

  const [localSortKey, setSortKey] = useState<string | null>(initialSortKey ?? null);
  const [localSortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);
  const sortKey = serverSort ? serverSort.key : localSortKey;
  const sortDirection = serverSort ? serverSort.direction : localSortDirection;

  const sortedRows = useMemo(() => {
    if (serverSort || !sortKey) return rows;
    const column = columns.find((entry) => entry.key === sortKey);
    if (!column) return rows;

    const accessor = column.sortValue ?? column.exportValue;
    if (!accessor) return rows;

    return [...rows].sort((left, right) => {
      const leftValue = accessor(left);
      const rightValue = accessor(right);
      const comparison = compareValues(leftValue, rightValue);
      return sortDirection === 'asc' ? comparison : comparison * -1;
    });
  }, [columns, rows, serverSort, sortDirection, sortKey]);

  function toggleSort(column: ReportColumn<T>) {
    if (!column.sortable) return;
    if (serverSort) {
      serverSort.onChange(
        column.key,
        serverSort.key === column.key && serverSort.direction === 'asc' ? 'desc' : 'asc'
      );
      return;
    }
    if (sortKey === column.key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(column.key);
    setSortDirection('asc');
  }

  async function runExport(format: ReportExportFormat) {
    if (exporting) return;
    if (!onServerExport) {
      if (format === 'xlsx') await exportXlsx();
      else exportPdf();
      return;
    }
    setExporting(format);
    try {
      await onServerExport(format);
    } finally {
      setExporting(null);
    }
  }

  async function exportXlsx() {
    setExporting('xlsx');
    try {
      const excelModule = await import('exceljs');
      const ExcelJS = ('default' in excelModule ? excelModule.default : excelModule) as typeof import('exceljs');
      const fileName = buildExportFileName(exportName);
      const workbook = new ExcelJS.Workbook();
      workbook.created = new Date();
      const sheet = workbook.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Report');

      sheet.addRow([title]).font = { bold: true, size: 14 };
      sheet.addRow([subtitle ? `${subtitle} \u00B7 Generated ${formatExportTimestamp(new Date())}` : `Generated ${formatExportTimestamp(new Date())}`]).font = {
        size: 9,
        color: { argb: 'FF64748B' },
      };
      sheet.addRow([]);

      const headerRow = sheet.addRow(columns.map((column) => column.label));
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FF334155' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      });
      sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

      for (const row of sortedRows) {
        const excelRow = sheet.addRow(
          columns.map((column) => {
            const value = (column.exportValue ?? column.sortValue)?.(row);
            return value ?? '';
          })
        );
        excelRow.eachCell((cell) => {
          if (typeof cell.value === 'number' && !Number.isInteger(cell.value)) {
            cell.numFmt = '#,##0.00';
          }
        });
      }

      columns.forEach((column, index) => {
        const excelColumn = sheet.getColumn(index + 1);
        const widest = sortedRows.reduce((max, row) => {
          const value = (column.exportValue ?? column.sortValue)?.(row);
          return Math.max(max, String(value ?? '').length);
        }, column.label.length);
        excelColumn.width = Math.min(Math.max(widest + 2, 10), 60);
        excelColumn.alignment = { vertical: 'top', horizontal: column.align ?? 'left', wrapText: true };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  function exportPdf() {
    const fileName = buildExportFileName(exportName);
    const document = new jsPDF({
      orientation: columns.length > 6 ? 'landscape' : 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    document.setProperties({
      title: fileName,
      subject: title,
    });

    document.setFontSize(16);
    document.text(title, 40, 40);

    if (subtitle) {
      document.setFontSize(10);
      document.setTextColor(71, 85, 105);
      const subtitleLines = document.splitTextToSize(subtitle, document.internal.pageSize.getWidth() - 80);
      document.text(subtitleLines, 40, 58);
      document.setTextColor(15, 23, 42);
    }

    autoTable(document, {
      startY: subtitle ? 80 : 58,
      head: [columns.map((column) => String(column.label))],
      body: sortedRows.map((row) =>
        columns.map((column) => String((column.exportValue ?? column.sortValue)?.(row) ?? ''))
      ),
      styles: {
        fontSize: 8,
        cellPadding: 5,
        overflow: 'linebreak',
        valign: 'top',
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [71, 85, 105],
        lineColor: [203, 213, 225],
        lineWidth: 0.5,
        fontStyle: 'bold',
      },
      bodyStyles: {
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        textColor: [15, 23, 42],
      },
      margin: { top: 40, right: 40, bottom: 40, left: 40 },
      didDrawPage: () => {
        const pageSize = document.internal.pageSize;
        const pageHeight = pageSize.getHeight();
        const pageWidth = pageSize.getWidth();
        const pageText = `Generated ${formatExportTimestamp(new Date())}`;

        document.setFontSize(9);
        document.setTextColor(100, 116, 139);
        document.text(pageText, 40, pageHeight - 18);
        document.text(
          `Page ${document.getCurrentPageInfo().pageNumber}`,
          pageWidth - 70,
          pageHeight - 18
        );
      },
    });

    document.save(`${fileName}.pdf`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {header}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900" style={theme?.title ? { color: theme.title } : undefined}>{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runExport('xlsx')}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
          >
            {exporting === 'xlsx' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {exporting === 'xlsx' ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={() => void runExport('pdf')}
            disabled={exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-60"
          >
            {exporting === 'pdf' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="content-scrollbar overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead
            className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"
            style={theme ? { backgroundColor: theme.headerBg, color: theme.headerText } : undefined}
          >
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={theme?.lines === 'grid' ? { borderColor: theme.border } : undefined}
                  className={`px-5 py-3 ${alignmentClass(column.align)} ${column.sortable ? 'cursor-pointer select-none' : ''} ${theme?.lines === 'grid' ? 'border' : ''}`}
                  onClick={() => toggleSort(column)}
                >
                  <span className={`inline-flex items-center gap-1 ${column.align === 'right' ? 'justify-end' : ''}`}>
                    {column.label}
                    {column.sortable && sortKey === column.key ? (
                      sortDirection === 'asc' ? (
                        <ArrowDownAZ className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpAZ className="h-3.5 w-3.5" />
                      )
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={theme?.lines === 'none' ? '' : 'divide-y divide-slate-100'}>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-14 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="align-top hover:bg-slate-50/70"
                  style={
                    theme
                      ? {
                          borderColor: theme.border,
                          backgroundColor: theme.stripeBg && rowIndex % 2 === 1 ? theme.stripeBg : undefined,
                        }
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-4 ${alignmentClass(column.align)} ${wrapClass(theme?.wrap)} ${theme?.lines === 'grid' ? 'border' : ''}`}
                      style={theme?.lines === 'grid' ? { borderColor: theme.border } : undefined}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {totals && (
            <tfoot className="border-t-2 border-slate-400 bg-slate-50 font-bold text-slate-900" style={theme ? { backgroundColor: theme.headerBg } : undefined}>
              <tr>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`whitespace-nowrap px-5 py-3 ${column.key === totalsLabelKey ? 'text-left' : alignmentClass(column.align)} ${theme?.lines === 'grid' ? 'border' : ''}`}
                    style={theme?.lines === 'grid' ? { borderColor: theme.border } : undefined}
                  >
                    {column.key in totals ? totals[column.key] : column.key === totalsLabelKey ? 'Total' : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {footer}
    </section>
  );
}

function compareValues(left: string | number | null | undefined, right: string | number | null | undefined) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function alignmentClass(align: ReportColumn<unknown>['align']) {
  return align === 'right'
    ? 'text-right'
    : align === 'center'
      ? 'text-center'
      : 'text-left';
}

function buildExportFileName(base: string) {
  return `${base}-${formatExportTimestamp(new Date())}`;
}

function formatExportTimestamp(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
}
