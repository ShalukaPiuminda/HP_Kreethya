'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Barcode,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Printer,
  RefreshCcw,
  RotateCcw,
} from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { displayDate, type BarcodePrintLine, type SupplierOption } from '@/lib/purchases';
import {
  buildLabelsFromLines,
  DEFAULT_LABEL_PRESET_ID,
  defaultLabelCount,
  isSerialDetail,
  LABEL_SHEET_PRESETS,
  labelCountFor,
  loadSavedPresetId,
  markBarcodesPrinted,
  paginateLabels,
  savePresetId,
} from '@/lib/barcode-labels';
import { BarcodeLabel } from '@/components/barcode-label';
import { PrintConfirmDialog } from '@/components/print-confirm-dialog';
import { LoadingTableRow, OperationHeader, OperationNotice } from '@/components/operation-ui';

type StatusTab = 'pending' | 'printed' | 'all';

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'pending', label: 'Not printed' },
  { id: 'printed', label: 'Printed' },
  { id: 'all', label: 'All' },
];

interface ListMeta {
  current_page: number;
  last_page: number;
  total: number;
  counts?: { pending: number; printed: number };
}

export default function BarcodePrintingPage() {
  const [status, setStatus] = useState<StatusTab>('pending');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [lines, setLines] = useState<BarcodePrintLine[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [perPageRows, setPerPageRows] = useState(25);
  // Ticked lines, kept while moving between pages so one print can cover several pages.
  const [selected, setSelected] = useState<Map<number, BarcodePrintLine>>(new Map());
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  // Label copies for non-serial lines, keyed by detail id (defaults to qty + free qty).
  const [copies, setCopies] = useState<Record<number, number>>({});
  const [presetId, setPresetId] = useState(DEFAULT_LABEL_PRESET_ID);
  const [startPosition, setStartPosition] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [showBatch, setShowBatch] = useState(true);

  // Lines taken into the print preview, and which of them are still ticked there.
  const [previewLines, setPreviewLines] = useState<BarcodePrintLine[] | null>(null);
  const [previewIds, setPreviewIds] = useState<Set<number>>(new Set());

  const [confirmingPrint, setConfirmingPrint] = useState(false);
  const [savingPrint, setSavingPrint] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setPresetId(loadSavedPresetId());
      try {
        const response = await api.getAll<SupplierOption>('/v1/suppliers');
        setSuppliers(response.data ?? []);
      } catch {
        // Supplier filter is optional; the list still works without it.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Search waits for the user to stop typing.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadLines = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ status, page: String(page), per_page: String(perPageRows) });
    if (appliedSearch) query.set('search', appliedSearch);
    if (supplierCode) query.set('supplier_code', supplierCode);
    if (dateFrom) query.set('date_from', dateFrom);
    if (dateTo) query.set('date_to', dateTo);

    try {
      const response = await api.get<BarcodePrintLine[]>(`/v1/barcode-prints?${query}`);
      setLines(response.data ?? []);
      const nextMeta = (response.meta as ListMeta | undefined) ?? null;
      setMeta(nextMeta);
      // Printing the last lines of the final page empties it; step back to a page that has rows.
      if (nextMeta && page > nextMeta.last_page) setPage(Math.max(1, nextMeta.last_page));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Unable to load GRN barcode lines.'));
    } finally {
      setLoading(false);
    }
  }, [status, page, perPageRows, appliedSearch, supplierCode, dateFrom, dateTo]);

  useEffect(() => {
    const timer = window.setTimeout(loadLines, 0);
    return () => window.clearTimeout(timer);
  }, [loadLines]);

  const preset = LABEL_SHEET_PRESETS.find((candidate) => candidate.id === presetId) ?? LABEL_SHEET_PRESETS[0];
  const perPage = preset.columns * preset.rows;
  const compact = preset.labelHeight < 30;
  const selectedLabelCount = useMemo(
    () => Array.from(selected.values()).reduce((sum, line) => sum + labelCountFor(line, copies), 0),
    [selected, copies]
  );
  const labels = useMemo(
    () => (previewLines ? buildLabelsFromLines(previewLines, previewIds, copies) : []),
    [previewLines, previewIds, copies]
  );
  const pages = useMemo(() => paginateLabels(labels, preset, startPosition), [labels, preset, startPosition]);
  const allSelected = lines.length > 0 && lines.every((line) => selectedIds.has(line.id));

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const changePreset = (nextId: string) => {
    setPresetId(nextId);
    setStartPosition(1);
    savePresetId(nextId);
  };

  const toggleLines = (toggled: BarcodePrintLine[], checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      toggled.forEach((line) => (checked ? next.set(line.id, line) : next.delete(line.id)));
      return next;
    });
  };

  const togglePreviewLine = (lineId: number, checked: boolean) => {
    setPreviewIds((current) => {
      const next = new Set(current);
      if (checked) next.add(lineId);
      else next.delete(lineId);
      return next;
    });
  };

  const openPreview = () => {
    const picked = Array.from(selected.values());
    setPreviewLines(picked);
    setPreviewIds(new Set(picked.map((line) => line.id)));
    setNotice(null);
  };

  const printLabels = () => {
    window.print();
    setPrintError(null);
    setConfirmingPrint(true);
  };

  const confirmPrinted = async () => {
    setSavingPrint(true);
    setPrintError(null);
    try {
      const printed = (previewLines ?? [])
        .filter((line) => previewIds.has(line.id))
        .map((line) => ({ detail_id: line.id, labels: labelCountFor(line, copies) }))
        .filter((line) => line.labels > 0);
      await markBarcodesPrinted(printed);
      setConfirmingPrint(false);
      setPreviewLines(null);
      setSelected(new Map());
      setNotice(`${printed.length} GRN line${printed.length === 1 ? '' : 's'} marked as printed.`);
      await loadLines();
    } catch (markError) {
      setPrintError(getApiErrorMessage(markError, 'Unable to mark the labels as printed.'));
    } finally {
      setSavingPrint(false);
    }
  };

  const markNotPrinted = async (line: BarcodePrintLine) => {
    setError(null);
    try {
      await api.post('/v1/barcode-prints/unmark', { detail_ids: [line.id] });
      setNotice(`${line.Item_code} on ${line.Invoice_no} marked as not printed.`);
      await loadLines();
    } catch (unmarkError) {
      setError(getApiErrorMessage(unmarkError, 'Unable to mark the line as not printed.'));
    }
  };

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          :root { --print-margin: 0; }
        }
      `}</style>

      {!previewLines && (
      <div className="space-y-6 print:hidden">
        <OperationHeader
          eyebrow="Purchases"
          title="Barcode Printing"
          description="Barcode labels for every GRN line, with what is already printed and what is still waiting for labels."
          icon={Barcode}
          actions={
            <>
              <button
                type="button"
                onClick={loadLines}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={openPreview}
                disabled={selectedLabelCount === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Printer className="h-4 w-4" />
                Print {selectedLabelCount} Labels
              </button>
            </>
          }
        />

        {error && <OperationNotice type="error">{error}</OperationNotice>}
        {notice && <OperationNotice type="success">{notice}</OperationNotice>}

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const count = tab.id === 'pending'
              ? meta?.counts?.pending
              : tab.id === 'printed'
                ? meta?.counts?.printed
                : meta?.counts && meta.counts.pending + meta.counts.printed;
            const active = status === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeFilter(() => setStatus(tab.id))}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  active ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                }`}
              >
                {tab.label}
                {count !== undefined && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm md:grid-cols-4">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="GRN no, item, supplier"
              className="rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">Supplier</span>
            <select
              value={supplierCode}
              onChange={(event) => changeFilter(() => setSupplierCode(event.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-2"
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.Code}>{supplier.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">GRN date from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => changeFilter(() => setDateFrom(event.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">GRN date to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => changeFilter(() => setDateTo(event.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => toggleLines(lines, event.target.checked)}
                      aria-label="Select all lines on this page"
                    />
                  </th>
                  <th className="px-4 py-3">GRN</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3 text-right">Labels</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <LoadingTableRow columns={7} label="Loading GRN lines..." />
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-slate-400">
                      {status === 'pending' ? 'Every GRN line has its labels printed.' : 'No GRN lines found.'}
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const serial = isSerialDetail(line);
                    const printed = Boolean(line.barcode_printed_at);
                    return (
                      <tr key={line.id} className={selectedIds.has(line.id) ? 'bg-indigo-50/40' : undefined}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(line.id)}
                            onChange={(event) => toggleLines([line], event.target.checked)}
                            aria-label={`Print labels for ${line.Item_code} on ${line.Invoice_no}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {line.purchase ? (
                            <Link
                              href={`/dashboard/purchases/${line.purchase.id}/barcodes`}
                              target="_blank"
                              className="font-mono text-xs font-bold text-indigo-700 hover:underline"
                            >
                              {line.Invoice_no}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs font-bold text-indigo-700">{line.Invoice_no}</span>
                          )}
                          <div className="text-xs text-slate-500">{displayDate(line.Invoice_date)}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{line.purchase?.supplier?.name ?? '-'}</td>
                        <td className="max-w-xs px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-slate-700">{line.Item_code}</div>
                          <div className="truncate text-slate-600">{line.Item_description || line.item?.item_description}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${serial ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                            {serial ? 'Serial barcodes' : `Item: ${line.item?.barcode || line.Item_code}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {serial ? (
                            <span className="text-xs font-semibold text-slate-500">{line.serial_numbers?.length ?? 0}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={copies[line.id] ?? defaultLabelCount(line)}
                              onChange={(event) =>
                                setCopies((current) => ({ ...current, [line.id]: Math.max(0, Number(event.target.value) || 0) }))
                              }
                              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right"
                              aria-label={`Label copies for ${line.Item_code}`}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {printed ? (
                            <div className="flex items-start gap-2">
                              <div>
                                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                                  Printed{(line.barcode_print_count ?? 0) > 1 ? ` x${line.barcode_print_count}` : ''}
                                </span>
                                <div className="mt-1 text-[11px] text-slate-500">
                                  {formatPrintedAt(line.barcode_printed_at)} · {line.barcode_printed_qty} labels
                                  {line.barcode_printed_by ? ` · ${line.barcode_printed_by}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => markNotPrinted(line)}
                                title="Mark as not printed"
                                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                              Not printed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {meta && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                <span>
                  Showing {meta.total === 0 ? 0 : (meta.current_page - 1) * perPageRows + 1}-
                  {Math.min(meta.current_page * perPageRows, meta.total)} of {meta.total}
                </span>
                <select
                  value={perPageRows}
                  onChange={(event) => changeFilter(() => setPerPageRows(Number(event.target.value)))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  aria-label="Rows per page"
                >
                  {[10, 25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size} / page</option>
                  ))}
                </select>
                {selected.size > 0 && (
                  <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-2 py-1 text-indigo-700">
                    {selected.size} ticked across pages
                    <button type="button" onClick={() => setSelected(new Map())} className="font-semibold underline">
                      Clear
                    </button>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <PagerButton label="First page" onClick={() => setPage(1)} disabled={loading || meta.current_page <= 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </PagerButton>
                <PagerButton label="Previous page" onClick={() => setPage(meta.current_page - 1)} disabled={loading || meta.current_page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </PagerButton>
                {pageNumbers(meta.current_page, meta.last_page).map((number, index) =>
                  number === null ? (
                    <span key={`gap-${index}`} className="px-1 text-slate-400">…</span>
                  ) : (
                    <PagerButton
                      key={number}
                      label={`Page ${number}`}
                      onClick={() => setPage(number)}
                      disabled={loading}
                      active={number === meta.current_page}
                    >
                      {number}
                    </PagerButton>
                  )
                )}
                <PagerButton label="Next page" onClick={() => setPage(meta.current_page + 1)} disabled={loading || meta.current_page >= meta.last_page}>
                  <ChevronRight className="h-4 w-4" />
                </PagerButton>
                <PagerButton label="Last page" onClick={() => setPage(meta.last_page)} disabled={loading || meta.current_page >= meta.last_page}>
                  <ChevronsRight className="h-4 w-4" />
                </PagerButton>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {previewLines && (
        <div className="mx-auto w-fit print:w-auto">
          <div className="mb-5 w-full max-w-[210mm] space-y-4 print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPreviewLines(null)}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"
              >
                <ArrowLeft className="h-4 w-4" />
                Barcode Printing
              </button>
              <button
                type="button"
                onClick={printLabels}
                disabled={labels.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print {labels.length} Labels
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <div className="text-xs font-bold text-indigo-700">
                {previewIds.size} of {previewLines.length} GRN lines ticked
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-500">Sticker sheet</span>
                  <select
                    value={preset.id}
                    onChange={(event) => changePreset(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {LABEL_SHEET_PRESETS.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-slate-500">Start at label position (1-{perPage})</span>
                  <input
                    type="number"
                    min={1}
                    max={perPage}
                    value={startPosition}
                    onChange={(event) => setStartPosition(Math.min(Math.max(Number(event.target.value) || 1, 1), perPage))}
                    className="rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} />
                  Show sale price
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={showBatch} onChange={(event) => setShowBatch(event.target.checked)} />
                  Show batch
                </label>
              </div>

              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
                {previewLines.map((line) => {
                  const serial = isSerialDetail(line);
                  return (
                    <div key={line.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={previewIds.has(line.id)}
                        onChange={(event) => togglePreviewLine(line.id, event.target.checked)}
                        aria-label={`Print labels for ${line.Item_code} on ${line.Invoice_no}`}
                      />
                      <span className="font-mono text-[10px] font-bold text-indigo-700">{line.Invoice_no}</span>
                      <span className="font-mono text-xs font-semibold text-slate-700">{line.Item_code}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-600">{line.Item_description || line.item?.item_description}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${serial ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        {serial ? 'Serial barcodes' : `Item barcode: ${line.item?.barcode || line.Item_code}`}
                      </span>
                      {serial ? (
                        <span className="w-20 text-right text-xs font-semibold text-slate-500">{line.serial_numbers?.length ?? 0} labels</span>
                      ) : (
                        <label className="inline-flex w-20 items-center justify-end gap-1 text-xs text-slate-500">
                          <input
                            type="number"
                            min={0}
                            value={copies[line.id] ?? defaultLabelCount(line)}
                            onChange={(event) =>
                              setCopies((current) => ({ ...current, [line.id]: Math.max(0, Number(event.target.value) || 0) }))
                            }
                            className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-right"
                          />
                          labels
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {pages.map((cells, pageIndex) => (
            <section
              key={pageIndex}
              className="mb-6 overflow-hidden bg-white shadow-sm ring-1 ring-slate-200 print:mb-0 print:shadow-none print:ring-0"
              style={{
                width: '210mm',
                height: '297mm',
                paddingTop: `${preset.marginTop}mm`,
                paddingLeft: `${preset.marginLeft}mm`,
                breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto',
              }}
            >
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${preset.columns}, ${preset.labelWidth}mm)`,
                  gridAutoRows: `${preset.labelHeight}mm`,
                  columnGap: `${preset.columnGap}mm`,
                  rowGap: `${preset.rowGap}mm`,
                }}
              >
                {cells.map((label, cellIndex) =>
                  label ? (
                    <BarcodeLabel
                      key={`${label.barcode}-${cellIndex}`}
                      label={label}
                      compact={compact}
                      showPrice={showPrice}
                      showBatch={showBatch}
                    />
                  ) : (
                    <div key={`blank-${cellIndex}`} className="outline-dashed outline-1 outline-slate-100 print:outline-none" />
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {confirmingPrint && (
        <div className="print:hidden">
          <PrintConfirmDialog
            labelCount={labels.length}
            saving={savingPrint}
            error={printError}
            onConfirm={confirmPrinted}
            onCancel={() => setConfirmingPrint(false)}
          />
        </div>
      )}
    </div>
  );
}

/** Page numbers around the current page, with null where pages are skipped: 1 … 4 5 6 … 12. */
function pageNumbers(current: number, last: number): (number | null)[] {
  const shown = new Set([1, last, current - 1, current, current + 1].filter((page) => page >= 1 && page <= last));
  const sorted = Array.from(shown).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? [null, page] : [page]));
}

function PagerButton({
  label,
  onClick,
  disabled,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'bg-indigo-600 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
      }`}
    >
      {children}
    </button>
  );
}

function formatPrintedAt(value: string | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-LK', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
