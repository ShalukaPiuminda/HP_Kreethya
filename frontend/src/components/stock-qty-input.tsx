'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Quantity input capped by the stock available. Typing or stepping past the limit keeps the
 * quantity at the maximum and shows a tooltip with the current stock, so a sale can never
 * ask for more than is on hand.
 */
export function StockQtyInput({
  value,
  onChange,
  available,
  unitLabel = 'in stock',
  className = '',
  required = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Quantity that can still be sold; `null` when unknown (no item selected yet). */
  available: number | null;
  unitLabel?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const limit = available == null ? null : Math.max(0, available);
  const over = limit != null && Number(value) > limit;

  function flash(message: string) {
    setTip(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(null), 2500);
  }

  function limitMessage() {
    return limit === 0 ? 'Out of stock - this item cannot be added' : `Only ${limit} ${unitLabel}. You can't add more.`;
  }

  function change(next: string) {
    if (limit != null && next !== '' && Number(next) > limit) {
      flash(limitMessage());
      onChange(limit > 0 ? String(limit) : '');
      return;
    }
    setTip(null);
    onChange(next);
  }

  // Store, batch or other lines changed the stock under an existing quantity.
  const message = tip ?? (over ? limitMessage() : null);

  return (
    <div className="relative">
      <input
        type="number"
        min="1"
        max={limit ?? undefined}
        value={value}
        disabled={disabled}
        required={required}
        aria-invalid={over || undefined}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' && limit != null && Number(value) >= limit) flash(limitMessage());
        }}
        className={`${className} ${over || tip ? '!border-rose-400 !ring-4 !ring-rose-100' : ''}`}
      />
      {message && (
        <div
          role="alert"
          className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-max max-w-[16rem] rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg"
        >
          <span className="flex items-start gap-1.5">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-300" />
            {message}
          </span>
          <span className="absolute left-4 top-full h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}
