'use client';

import { formatCurrency } from '@/lib/inventory';
import type { BarcodeLabelData } from '@/lib/barcode-labels';
import { BarcodeSvg } from '@/components/barcode-svg';

export function BarcodeLabel({
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
