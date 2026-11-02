'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { api, getApiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/inventory';
import type { PurchaseReceipt } from '@/lib/purchases';
import { BarcodeSvg } from '@/components/barcode-svg';
import {
  buildLabels,
  DEFAULT_LABEL_PRESET_ID,
  defaultLabelCount,
  isSerialDetail,
  LABEL_SHEET_PRESETS,
  loadSavedPresetId,
  paginateLabels,
  savePresetId,
  type BarcodeLabelData,
} from '@/lib/barcode-labels';

export default function GrnBarcodeLabelsPage() {
  const params = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<PurchaseReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(DEFAULT_LABEL_PRESET_ID);
  const [startPosition, setStartPosition] = useState(1);
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<number>>(new Set());
  // Label copies for non-serial lines, keyed by detail id (defaults to qty + free qty).
  const [copies, setCopies] = useState<Record<number, number>>({});
  const [showPrice, setShowPrice] = useState(true);
  const [showBatch, setShowBatch] = useState(true);
  const hasPrinted = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setPresetId(loadSavedPresetId());

      try {
        const response = await api.get<PurchaseReceipt>(`/v1/purchase-receipts/${params.id}`);
        const loaded = response.data ?? null;
        setReceipt(loaded);
        setSelectedDetailIds(new Set((loaded?.details ?? []).map((detail) => detail.id)));
      } catch (loadError) {
        setError(getApiErrorMessage(loadError, 'Unable to load the GRN for barcode labels.'));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [params.id]);

  const preset = LABEL_SHEET_PRESETS.find((candidate) => candidate.id === presetId) ?? LABEL_SHEET_PRESETS[0];
  const perPage = preset.columns * preset.rows;
  const labels = useMemo(
    () => (receipt ? buildLabels(receipt, selectedDetailIds, copies) : []),
    [receipt, selectedDetailIds, copies]
  );
  const pages = useMemo(
    () => paginateLabels(labels, preset, startPosition),
    [labels, preset, startPosition]
  );

  // Opened straight after posting a GRN (?auto=1): print once the labels have rendered.
  useEffect(() => {
    if (labels.length === 0 || hasPrinted.current) return;
    if (new URLSearchParams(window.location.search).get('auto') !== '1') return;

    const timer = window.setTimeout(() => {
      window.print();
      hasPrinted.current = true;
    }, 350);

    return () => window.clearTimeout(timer);
  }, [labels]);

  const changePreset = (nextId: string) => {
    setPresetId(nextId);
    setStartPosition(1);
    savePresetId(nextId);
  };

  const toggleDetail = (detailId: number, checked: boolean) => {
    setSelectedDetailIds((current) => {
      const next = new Set(current);
      if (checked) next.add(detailId);
      else next.delete(detailId);
      return next;
    });
  };

  if (error) {
    return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  }

  if (!receipt) {
    return <div className="p-12 text-center text-slate-400">Preparing barcode labels...</div>;
  }

  const compact = preset.labelHeight < 30;

  return (
    <div className="mx-auto w-fit print:w-auto">
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          :root { --print-margin: 0; }
        }
      `}</style>

      <div className="mb-5 w-full max-w-[210mm] space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard/purchases" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
            <ArrowLeft className="h-4 w-4" />
            Purchase receipts
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={labels.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print {labels.length} Labels
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <div className="font-mono text-xs font-bold text-indigo-700">{receipt.Invoice_no}</div>
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
            {receipt.details.map((detail) => {
              const serial = isSerialDetail(detail);
              return (
                <div key={detail.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedDetailIds.has(detail.id)}
                    onChange={(event) => toggleDetail(detail.id, event.target.checked)}
                    aria-label={`Print labels for ${detail.Item_code}`}
                  />
                  <span className="font-mono text-xs font-semibold text-slate-700">{detail.Item_code}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{detail.Item_description}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${serial ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                    {serial ? 'Serial barcodes' : `Item barcode: ${detail.item?.barcode || detail.Item_code}`}
                  </span>
                  {serial ? (
                    <span className="w-20 text-right text-xs font-semibold text-slate-500">{detail.serial_numbers?.length ?? 0} labels</span>
                  ) : (
                    <label className="inline-flex w-20 items-center justify-end gap-1 text-xs text-slate-500">
                      <input
                        type="number"
                        min={0}
                        value={copies[detail.id] ?? defaultLabelCount(detail)}
                        onChange={(event) =>
                          setCopies((current) => ({ ...current, [detail.id]: Math.max(0, Number(event.target.value) || 0) }))
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
  );
}

function BarcodeLabel({
  label,
  compact,
  showPrice,
  showBatch,
}: {
  label: BarcodeLabelData;
  compact: boolean;
  showPrice: boolean;
  showBatch: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden text-black outline-dashed outline-1 outline-slate-200 print:outline-none ${
        compact ? 'px-[1.5mm] py-[1mm] text-[6px] leading-tight' : 'px-[2.5mm] py-[2mm] text-[8px] leading-snug'
      }`}
    >
      <div className={`font-bold ${compact ? 'truncate' : 'line-clamp-2'}`}>{label.description}</div>
      <div className="flex justify-between gap-1 font-mono">
        <span className="truncate">{label.itemCode}</span>
        {showBatch && label.batchNo && <span className="truncate">B: {label.batchNo}</span>}
      </div>
      <BarcodeSvg value={label.barcode} className={`mt-[0.5mm] w-full ${compact ? 'h-[7mm]' : 'h-[11mm]'} shrink-0`} />
      <div className="text-center font-mono font-semibold tracking-wide">
        {label.serial ? `S/N ${label.serial}` : label.barcode}
      </div>
      <div className="flex items-end justify-between gap-1">
        <span className={`truncate text-slate-600 ${compact ? 'text-[5px]' : 'text-[6px]'}`}>{label.grnNo}</span>
        {showPrice && label.price > 0 && (
          <span className={`font-black ${compact ? 'text-[8px]' : 'text-[11px]'}`}>{formatCurrency(label.price)}</span>
        )}
      </div>
    </div>
  );
}
