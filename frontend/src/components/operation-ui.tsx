'use client';

import { useRef, useState } from 'react';
import { usePopupKeyboard } from '@/lib/use-popup-keyboard';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  X,
  type LucideIcon,
} from 'lucide-react';

export function OperationHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {title}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function OperationNotice({
  type,
  children,
  details,
  detailLimit = 3,
}: {
  type: 'success' | 'error' | 'warning';
  children: React.ReactNode;
  details?: string[];
  detailLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  const classes =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : type === 'warning'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-rose-200 bg-rose-50 text-rose-700';
  const visibleDetails = details?.length
    ? expanded
      ? details
      : details.slice(0, detailLimit)
    : [];
  const hasMore = Boolean(details && details.length > detailLimit);

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${classes}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{children}</div>

          {visibleDetails.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs leading-5">
              {visibleDetails.map((detail, index) => (
                <li
                  key={`${detail}-${index}`}
                  className="flex items-start gap-2 rounded-lg bg-white/50 px-2 py-1 ring-1 ring-inset ring-black/5"
                >
                  <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
                    {index + 1}
                  </span>
                  <span className="min-w-0 break-words">{detail}</span>
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline decoration-dotted underline-offset-4 transition hover:opacity-80"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  See more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OperationMetric({
  label,
  value,
  tone = 'slate',
  help,
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'indigo' | 'amber' | 'emerald' | 'rose';
  help?: string;
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-65">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {help && <div className="mt-1 text-xs opacity-60">{help}</div>}
    </div>
  );
}

export function OperationField({
  label,
  required = false,
  help,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
      {help && <span className="mt-1.5 block text-xs text-slate-500">{help}</span>}
    </label>
  );
}

export function OperationModal({
  title,
  description,
  children,
  onClose,
  width = 'max-w-5xl',
  icon: Icon,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  width?: string;
  icon?: LucideIcon;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  usePopupKeyboard(panelRef, onClose);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} className={`content-scrollbar max-h-[94vh] w-full overflow-y-auto rounded-3xl bg-white shadow-2xl ${width}`}>
        <div className="sticky top-0 z-40 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex min-w-0 items-start gap-3.5">
            {Icon && (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-950">{title}</h2>
              {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function OperationActions({
  saving,
  submitLabel,
  onCancel,
  disabled = false,
}: {
  saving: boolean;
  submitLabel: string;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving || disabled}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving...' : submitLabel}
      </button>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const classes =
    normalized === 'paid' || normalized === 'approved' || normalized === 'passed' || normalized === 'repaired' || normalized === 'completed' || normalized === 'customer_paid' || normalized === 'active' || normalized === 'posted'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : normalized === 'partial' || normalized === 'partially_received' || normalized === 'pending' || normalized === 'under_repair'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : normalized === 'cancelled' || normalized === 'returned' || normalized === 'inactive'
          ? 'bg-rose-50 text-rose-700 ring-rose-200'
          : normalized === 'draft' || normalized === 'received' || normalized === 'invoiced' || normalized === 'converted'
            ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
            : normalized === 'dispatched_to_supplier' || normalized === 'received_from_supplier'
              ? 'bg-violet-50 text-violet-700 ring-violet-200'
            : 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${classes}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function LoadingTableRow({
  columns,
  label,
}: {
  columns: number;
  label: string;
}) {
  return (
    <tr>
      <td colSpan={columns} className="px-5 py-14 text-center text-slate-400">
        <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600" />
        {label}
      </td>
    </tr>
  );
}
