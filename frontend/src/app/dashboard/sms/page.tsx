'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  MessageSquarePlus,
  MessageSquareText,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { OperationHeader, OperationMetric, OperationModal, OperationNotice } from '@/components/operation-ui';
import { usePopupKeyboard } from '@/lib/use-popup-keyboard';
import { MobileInput, toLocalMobile } from '@/components/mobile-input';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface SmsLogRow {
  id: number;
  type: string;
  phone: string | null;
  message: string;
  status: string;
  response: string | null;
  invoice_no: string | null;
  customer_name: string | null;
  sent_by: string | null;
  created_at: string;
}

interface SmsSummary {
  today_sent: number;
  today_failed: number;
  month_sent: number;
  total: number;
}

interface SmsCustomer {
  Code: string;
  name: string;
  phone: string;
}

interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

type Notice = { type: 'success' | 'error'; text: string } | null;

type ConfirmState = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  action: () => Promise<void>;
} | null;

const TYPE_LABELS: Record<string, string> = {
  payment: 'Payment',
  advance: 'Advance',
  arrears: 'Arrears',
  manual: 'Arrears (manual)',
  reminder: 'Due reminder',
  custom: 'Custom',
  test: 'Test',
};

const TYPE_CLASSES: Record<string, string> = {
  payment: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  advance: 'bg-teal-50 text-teal-700 ring-teal-200',
  arrears: 'bg-rose-50 text-rose-700 ring-rose-200',
  manual: 'bg-rose-50 text-rose-700 ring-rose-200',
  reminder: 'bg-sky-50 text-sky-700 ring-sky-200',
  custom: 'bg-violet-50 text-violet-700 ring-violet-200',
  test: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const STATUS_CLASSES: Record<string, string> = {
  sent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  skipped: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const badgeClass = 'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset';

/** Readable gateway error from the stored response (JSON or plain text). */
function failureReason(response: string | null): string {
  if (!response) return '';
  try {
    const parsed = JSON.parse(response) as { errors?: string[]; message?: string };
    if (parsed.errors?.length) return parsed.errors.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    // plain text response
  }
  return response.length > 140 ? `${response.slice(0, 140)}...` : response;
}

function formatTime(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function SmsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('sms', 'can_read');
  const canSend = hasPermission('sms', 'can_create');
  const canDelete = hasPermission('sms', 'can_delete');

  const [rows, setRows] = useState<SmsLogRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>({ current_page: 1, last_page: 1, per_page: 25, total: 0 });
  const [summary, setSummary] = useState<SmsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirming, setConfirming] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [busyRow, setBusyRow] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const [logRes, summaryRes] = await Promise.all([
        api.get<SmsLogRow[]>(`/v1/sms/logs?${params}`),
        api.get<SmsSummary>('/v1/sms/summary'),
      ]);
      setRows(logRes.data || []);
      if (logRes.meta) setMeta(logRes.meta);
      setSummary(summaryRes.data ?? null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, debouncedSearch, page, perPage, status, type]);

  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [canRead, load]);

  // Any filter change goes back to the first page.
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, status, type, dateFrom, dateTo, perPage]);

  const hasFilters = !!(search || status || type || dateFrom || dateTo);

  /** Show the newest entries after sending: jump to page 1 (which reloads) or reload in place. */
  const reloadFirstPage = () => {
    if (page !== 1) setPage(1);
    else void load();
  };

  async function runConfirmed() {
    if (!confirm) return;
    setConfirming(true);
    try {
      await confirm.action();
    } finally {
      setConfirming(false);
      setConfirm(null);
    }
  }

  function askResend(row: SmsLogRow) {
    setConfirm({
      title: 'Resend SMS?',
      confirmLabel: 'Resend SMS',
      tone: 'primary',
      body: (
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            The same message will be sent again to <span className="font-semibold text-slate-900">{row.phone || 'no number'}</span>
            {row.customer_name ? <> ({row.customer_name})</> : null}. This uses SMS credit.
          </p>
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-slate-700 ring-1 ring-inset ring-slate-200">{row.message}</p>
        </div>
      ),
      action: async () => {
        setBusyRow(row.id);
        try {
          const res = await api.post(`/v1/sms/logs/${row.id}/resend`, {});
          setNotice({ type: 'success', text: res.message || 'SMS resent.' });
        } catch (error) {
          setNotice({ type: 'error', text: getApiErrorMessage(error) });
        } finally {
          setBusyRow(null);
          reloadFirstPage();
        }
      },
    });
  }

  function askDelete(row: SmsLogRow) {
    setConfirm({
      title: 'Delete this log entry?',
      confirmLabel: 'Delete',
      tone: 'danger',
      body: (
        <p className="text-sm text-slate-600">
          The record of the SMS to <span className="font-semibold text-slate-900">{row.phone || 'no number'}</span> will be removed from the
          log. The message already delivered to the customer is not affected. This cannot be undone.
        </p>
      ),
      action: async () => {
        setBusyRow(row.id);
        try {
          const res = await api.delete(`/v1/sms/logs/${row.id}`);
          setNotice({ type: 'success', text: res.message || 'Log entry deleted.' });
          if (rows.length === 1 && page > 1) setPage(page - 1);
          else void load();
        } catch (error) {
          setNotice({ type: 'error', text: getApiErrorMessage(error) });
        } finally {
          setBusyRow(null);
        }
      },
    });
  }

  function askArrears() {
    setConfirm({
      title: 'Send arrears reminders?',
      confirmLabel: 'Send reminders',
      tone: 'primary',
      body: (
        <p className="text-sm text-slate-600">
          An arrears SMS will be sent to every customer with overdue installments in this branch. Customers already messaged today are
          skipped. This uses SMS credit.
        </p>
      ),
      action: async () => {
        try {
          const res = await api.post('/v1/sms/arrears/bulk', {});
          setNotice({ type: 'success', text: res.message || 'Arrears SMS sent.' });
        } catch (error) {
          setNotice({ type: 'error', text: getApiErrorMessage(error) });
        } finally {
          reloadFirstPage();
        }
      },
    });
  }

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        You do not have access to SMS notifications.
      </div>
    );
  }

  const firstRow = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1;
  const lastRow = Math.min(meta.current_page * meta.per_page, meta.total);

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Administration"
        title="SMS Notifications"
        description="Customers get an SMS as soon as a payment is recorded. Arrears and due-date reminders go out automatically every morning."
        icon={MessageSquareText}
        actions={
          canSend && (
            <>
              <button
                type="button"
                onClick={askArrears}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700"
              >
                <Send className="h-4 w-4" />
                Send arrears reminders
              </button>
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <MessageSquarePlus className="h-4 w-4" />
                Custom message
              </button>
            </>
          )
        }
      />

      {notice && (
        <div className="relative">
          <OperationNotice type={notice.type}>{notice.text}</OperationNotice>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
            className="absolute right-3 top-3 rounded-lg p-1 text-current opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Sent today" value={String(summary?.today_sent ?? '-')} tone="emerald" />
        <OperationMetric label="Failed today" value={String(summary?.today_failed ?? '-')} tone={summary?.today_failed ? 'rose' : 'slate'} />
        <OperationMetric label="Sent this month" value={String(summary?.month_sent ?? '-')} tone="indigo" />
        <OperationMetric label="Total log entries" value={String(summary?.total ?? '-')} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer, phone or reference"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <select className={`${inputClass} sm:w-40`} value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by type">
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select className={`${inputClass} sm:w-36`} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
            <input type="date" className={`${inputClass} sm:w-40`} value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} aria-label="From date" />
            <input type="date" className={`${inputClass} sm:w-40`} value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} aria-label="To date" />
          </div>
          <div className="flex gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                  setType('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              title="Refresh"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Type</th>
                <th className="w-[38%] px-5 py-3">Message</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600" />
                    Loading SMS log...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    <MessageSquareText className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                    {hasFilters ? 'No messages match these filters.' : 'No SMS sent yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const when = formatTime(row.created_at);
                  const reason = row.status !== 'sent' ? failureReason(row.response) : '';
                  return (
                    <tr key={row.id} className={`align-top transition hover:bg-slate-50/70 ${loading ? 'opacity-60' : ''}`}>
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="font-medium text-slate-900">{when.date}</div>
                        <div className="text-xs text-slate-500">{when.time}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="max-w-[200px] truncate font-semibold text-slate-900" title={row.customer_name || undefined}>
                          {row.customer_name || '-'}
                        </div>
                        <div className="text-xs tabular-nums text-slate-500">{row.phone || 'No number'}</div>
                        {row.invoice_no && (
                          <div className="max-w-[200px] truncate text-xs text-slate-400" title={row.invoice_no}>
                            {row.invoice_no}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`${badgeClass} ${TYPE_CLASSES[row.type] ?? TYPE_CLASSES.test}`}>{TYPE_LABELS[row.type] ?? row.type}</span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-600" title={row.message}>
                          {row.message}
                        </p>
                        <div className="mt-1 text-[11px] text-slate-400">by {row.sent_by || 'system'}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`${badgeClass} capitalize ${STATUS_CLASSES[row.status] ?? TYPE_CLASSES.test}`}>{row.status}</span>
                        {reason && (
                          <div className="mt-1.5 max-w-[180px] text-[11px] leading-4 text-rose-600" title={row.response ?? undefined}>
                            {reason}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <div className="inline-flex gap-1">
                          {canSend && (
                            <button
                              type="button"
                              onClick={() => askResend(row)}
                              disabled={busyRow === row.id || !row.phone}
                              title={row.phone ? 'Resend this SMS' : 'No phone number to resend to'}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {busyRow === row.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                              Resend
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => askDelete(row)}
                              disabled={busyRow === row.id}
                              title="Delete log entry"
                              aria-label="Delete log entry"
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
            <span>
              Showing {firstRow}-{lastRow} of {meta.total}
            </span>
            <select
              value={perPage}
              onChange={(event) => setPerPage(Number(event.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
              aria-label="Rows per page"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || meta.current_page <= 1}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="px-2 text-xs font-medium text-slate-500">
              Page {meta.current_page} of {meta.last_page}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(meta.last_page, current + 1))}
              disabled={loading || meta.current_page >= meta.last_page}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.confirmLabel}
          tone={confirm.tone}
          busy={confirming}
          onCancel={() => !confirming && setConfirm(null)}
          onConfirm={() => void runConfirmed()}
        >
          {confirm.body}
        </ConfirmDialog>
      )}

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={(message, ok) => {
            setNotice({ type: ok ? 'success' : 'error', text: message });
            if (ok) {
              setComposeOpen(false);
              reloadFirstPage();
            }
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  title,
  confirmLabel,
  tone,
  busy,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel: string;
  tone: 'danger' | 'primary';
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  usePopupKeyboard(panelRef, () => {
    if (!busy) onCancel();
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-confirm-title"
    >
      <div ref={panelRef} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            {tone === 'danger' ? <AlertTriangle className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="sms-confirm-title" className="text-lg font-bold text-slate-950">
              {title}
            </h2>
            <div className="mt-2">{children}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** SMS length: 160 chars per part (153 when split); 70/67 for Sinhala/Tamil (unicode). */
function smsParts(text: string) {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const length = text.length;
  const parts = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { length, parts, unicode };
}

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: (message: string, ok: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SmsCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SmsCustomer[]>([]);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phones, setPhones] = useState<string[]>([]);
  const [message, setMessage] = useState('Dear {customer_name}, ');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const term = query.trim();
    const timer = window.setTimeout(async () => {
      if (!term) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await api.get<SmsCustomer[]>(`/v1/sms/customers?search=${encodeURIComponent(term)}`);
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const recipientCount = selected.length + phones.length;
  const counter = useMemo(() => smsParts(message), [message]);
  const phoneReady = phoneDraft.length === 10 && phoneDraft.startsWith('07');

  function addCustomer(customer: SmsCustomer) {
    setSelected((current) => (current.some((item) => item.Code === customer.Code) ? current : [...current, customer]));
    setQuery('');
    setResults([]);
  }

  function addPhone() {
    const phone = toLocalMobile(phoneDraft);
    if (phone.length !== 10 || !phone.startsWith('07')) return;
    setPhones((current) => (current.includes(phone) ? current : [...current, phone]));
    setPhoneDraft('');
  }

  function insertPlaceholder(token: string) {
    const element = messageRef.current;
    if (!element) {
      setMessage((current) => current + token);
      return;
    }
    const start = element.selectionStart ?? message.length;
    const end = element.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    window.setTimeout(() => {
      element.focus();
      element.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (recipientCount === 0) {
      setError('Add at least one customer or phone number.');
      return;
    }
    if (!message.trim()) {
      setError('Type a message.');
      return;
    }
    setConfirming(true);
  }

  async function send() {
    setSending(true);
    try {
      const res = await api.post<Record<string, number>>('/v1/sms/custom', {
        message: message.trim(),
        customer_codes: selected.map((customer) => customer.Code),
        phones,
      });
      onSent(res.message || 'Custom SMS sent.', true);
    } catch (sendError) {
      setConfirming(false);
      setError(getApiErrorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  return (
    <OperationModal title="Send custom message" description="Pick customers and/or type mobile numbers, then write your message." onClose={onClose} width="max-w-2xl">
      <form onSubmit={review} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Customers</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, code, NIC or phone"
              className={`${inputClass} pl-9`}
            />
            {searching && <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
            {query.trim() && !searching && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {results.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-400">No customers with a phone number match.</div>
                ) : (
                  results.map((customer) => {
                    const added = selected.some((item) => item.Code === customer.Code);
                    return (
                      <button
                        key={customer.Code}
                        type="button"
                        disabled={added}
                        onClick={() => addCustomer(customer)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-indigo-50 disabled:opacity-50"
                      >
                        <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{customer.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{customer.phone}</span>
                        {added && <span className="text-xs font-semibold text-emerald-600">Added</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">Or add a mobile number</span>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <MobileInput value={phoneDraft} onChange={setPhoneDraft} className={inputClass} />
            </div>
            <button
              type="button"
              onClick={addPhone}
              disabled={!phoneReady}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-slate-200 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">
            Recipients ({recipientCount})
          </div>
          {recipientCount === 0 ? (
            <p className="text-sm text-slate-400">No recipients yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selected.map((customer) => (
                <span key={customer.Code} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 py-1 pl-3 pr-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  {customer.name}
                  <button
                    type="button"
                    aria-label={`Remove ${customer.name}`}
                    onClick={() => setSelected((current) => current.filter((item) => item.Code !== customer.Code))}
                    className="rounded-full p-0.5 hover:bg-indigo-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {phones.map((phone) => (
                <span key={phone} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs font-medium tabular-nums text-slate-700 ring-1 ring-inset ring-slate-200">
                  {phone}
                  <button
                    type="button"
                    aria-label={`Remove ${phone}`}
                    onClick={() => setPhones((current) => current.filter((item) => item !== phone))}
                    className="rounded-full p-0.5 hover:bg-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Message *</span>
            <div className="flex gap-1.5">
              {['{customer_name}', '{company_name}'].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertPlaceholder(token)}
                  className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                >
                  + {token}
                </button>
              ))}
            </div>
          </div>
          <textarea
            ref={messageRef}
            rows={4}
            maxLength={480}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className={`${inputClass} resize-y`}
            required
          />
          <div className="mt-1.5 flex justify-between text-xs text-slate-500">
            <span>{'{customer_name}'} is replaced with each customer&apos;s name.</span>
            <span className={counter.parts > 2 ? 'font-semibold text-amber-600' : ''}>
              {counter.length}/480 · {counter.parts} SMS{counter.parts === 1 ? '' : ' parts'}
              {counter.unicode ? ' (unicode)' : ''}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <Send className="h-4 w-4" />
            Review & send
          </button>
        </div>
      </form>

      {confirming && (
        <ConfirmDialog
          title={`Send to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}?`}
          confirmLabel="Send now"
          tone="primary"
          busy={sending}
          onCancel={() => !sending && setConfirming(false)}
          onConfirm={() => void send()}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              This sends {recipientCount * Math.max(counter.parts, 1)} SMS credit{recipientCount * Math.max(counter.parts, 1) === 1 ? '' : 's'} worth of
              messages.
            </p>
            <p className="whitespace-pre-line rounded-xl bg-slate-50 px-4 py-3 text-slate-700 ring-1 ring-inset ring-slate-200">{message.trim()}</p>
          </div>
        </ConfirmDialog>
      )}
    </OperationModal>
  );
}
