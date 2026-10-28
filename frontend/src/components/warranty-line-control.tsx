'use client';

import { ShieldCheck } from 'lucide-react';

/**
 * Per-line warranty toggle used on the sales invoice and hire purchase screens.
 * Only rendered for items flagged "Warranty included"; ticked by default with the
 * item's period, and the cashier can untick it or change the months.
 */
export function WarrantyLineControl({
  enabled,
  months,
  onChange,
}: {
  enabled: boolean;
  months: string;
  onChange: (next: { warranty_enabled: boolean; warranty_months: string }) => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        enabled
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-slate-50 text-slate-500 ring-slate-200'
      }`}
    >
      <label className="inline-flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange({ warranty_enabled: event.target.checked, warranty_months: months })}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        <ShieldCheck className="h-3.5 w-3.5" />
        Warranty
      </label>
      {enabled && (
        <>
          <input
            type="number"
            min="1"
            max="120"
            step="1"
            value={months}
            onChange={(event) => onChange({ warranty_enabled: enabled, warranty_months: event.target.value })}
            className="w-14 rounded-md border border-emerald-200 bg-white px-1.5 py-0.5 text-xs text-slate-900 outline-none focus:border-emerald-400"
            aria-label="Warranty months"
            required
          />
          months
        </>
      )}
    </span>
  );
}

export function warrantyLineDefaults(item: { warranty_enabled?: boolean; warranty_months?: number | null } | undefined) {
  return {
    warranty_enabled: Boolean(item?.warranty_enabled),
    warranty_months: item?.warranty_enabled && item.warranty_months ? String(item.warranty_months) : '',
  };
}

export function warrantyLinePayload(
  item: { warranty_enabled?: boolean } | undefined,
  line: { warranty_enabled: boolean; warranty_months: string }
) {
  if (!item?.warranty_enabled) return {};
  return {
    warranty_enabled: line.warranty_enabled,
    warranty_months: line.warranty_enabled && line.warranty_months ? Number(line.warranty_months) : null,
  };
}
