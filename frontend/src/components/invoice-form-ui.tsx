'use client';

import { CheckCircle2, Info, LoaderCircle, Percent, Tag, type LucideIcon } from 'lucide-react';

/** Building blocks shared by the invoice-style entry popups (sales invoices, hire purchase agreements). */

export const fieldClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
export const iconInputClass = `${fieldClass} pl-10`;
/** Column template shared by the item header row and each item line on wide screens: # · item · batch · qty · price · discount · net · remove. */
export const lineGridClass =
  'xl:grid-cols-[2.25rem_minmax(0,2.4fr)_minmax(0,1.2fr)_6.5rem_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)_2.75rem] xl:gap-3';

export type DiscountType = 'amount' | 'percent';

export function FormSection({
  icon: Icon,
  title,
  subtitle,
  action,
  bodyClassName = 'p-5',
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-100 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  required = false,
  hint,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-semibold text-slate-700">
        <span className="truncate">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </span>
        {hint && <span className="shrink-0 font-medium text-emerald-600">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Field label shown above each control on small screens; the column header row replaces it on wide screens. */
export function LineField({
  label,
  required = false,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block truncate text-xs font-semibold text-slate-600 xl:sr-only">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** Column header row for item lines, shown on wide screens only. */
export function LineHeader({ columns }: { columns: string[] }) {
  return (
    <div className={`hidden border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 xl:grid ${lineGridClass}`}>
      <span className="text-center">#</span>
      {columns.map((column, index) => (
        <span key={column} className={index === columns.length - 1 ? 'text-right' : undefined}>{column}</span>
      ))}
      <span className="sr-only">Remove</span>
    </div>
  );
}

export function LineNumber({ value }: { value: number }) {
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">{value}</span>
  );
}

/** Places a leading icon inside the wrapped input or select trigger (which needs `pl-10`). */
export function IconSlot({ icon: Icon, className = '', children }: { icon: LucideIcon; className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Icon className="pointer-events-none absolute left-3.5 top-[22px] z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
      {children}
    </div>
  );
}

export function MoneyInput({
  icon,
  value,
  max,
  required = false,
  onChange,
}: {
  icon: LucideIcon;
  value: string;
  max?: number;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <IconSlot icon={icon}>
      <input
        type="number"
        min="0"
        max={max}
        step="0.01"
        value={value}
        required={required}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
        className={`${iconInputClass} text-right tabular-nums`}
      />
    </IconSlot>
  );
}

export function DiscountInput({
  type,
  value,
  onTypeChange,
  onValueChange,
}: {
  type: DiscountType;
  value: string;
  onTypeChange: (value: DiscountType) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex h-11 min-w-0 overflow-hidden rounded-xl border border-slate-300 bg-white transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
      <select
        value={type}
        onChange={(event) => onTypeChange(event.target.value as DiscountType)}
        aria-label="Discount type"
        className="w-[4.5rem] shrink-0 border-r border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 outline-none"
      >
        <option value="amount">LKR</option>
        <option value="percent">%</option>
      </select>
      <input
        type="number"
        min="0"
        max={type === 'percent' ? 100 : undefined}
        step="0.01"
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label="Discount value"
        className="min-w-0 flex-1 bg-transparent px-3 text-right text-sm tabular-nums outline-none"
      />
      <span className="flex items-center pr-3 text-slate-400">
        {type === 'percent' ? <Percent className="h-3.5 w-3.5" /> : <Tag className="h-3.5 w-3.5" />}
      </span>
    </div>
  );
}

export function Badge({
  icon: Icon,
  tone = 'slate',
  children,
}: {
  icon: LucideIcon;
  tone?: 'slate' | 'emerald' | 'rose' | 'indigo';
  children: React.ReactNode;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function SummaryCard({
  icon: Icon,
  title,
  meta,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-28">
      <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-100 px-5 py-3.5">
        <Icon className="h-4 w-4 text-slate-700" />
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {meta && <span className="ml-auto text-xs text-slate-500">{meta}</span>}
      </div>
      {children}
    </aside>
  );
}

export function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'emerald' }) {
  const valueClass = tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900';

  return (
    <div className="flex items-center justify-between gap-4 px-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export function SummaryHighlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-indigo-600 px-4 py-3 text-white">
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** Pinned footer of an entry popup: shows why posting is blocked (or that it is ready) next to the actions. */
export function StickyFormFooter({
  blockReason,
  readyText,
  saving,
  savingLabel,
  submitLabel,
  submitIcon: SubmitIcon,
  onCancel,
}: {
  blockReason: string | null;
  readyText: string;
  saving: boolean;
  savingLabel: string;
  submitLabel: string;
  submitIcon: LucideIcon;
  onCancel: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-40 -mx-6 -mb-6 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        {blockReason ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
            <Info className="h-4 w-4 shrink-0" />
            {blockReason}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {readyText}
          </span>
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || Boolean(blockReason)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SubmitIcon className="h-4 w-4" />}
          {saving ? savingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}

