'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, FileWarning, History, LoaderCircle, Printer, Save, Search, Settings2, SquarePen } from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { Letterhead, type LetterheadParty } from '@/components/letterhead';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { money, shortDate, today } from '@/lib/hp';
import {
  type ArrearsRow,
  type ArrearsStatus,
  type ArrearsSummary,
  type LetterLog,
  type LetterSettings,
  type LetterStage,
  type LetterTemplate,
  SAMPLE_VARIABLES,
  STAGE_LABELS,
  STATUS_LABELS,
  printPath,
  renderTemplate,
} from '@/lib/reminder-letters';

type Tab = 'list' | 'templates' | 'settings';
type Notice = { type: 'success' | 'error'; text: string } | null;

const STATUS_CLASSES: Record<ArrearsStatus, string> = {
  due: 'bg-amber-50 text-amber-700 ring-amber-200',
  waiting: 'bg-slate-100 text-slate-600 ring-slate-200',
  seizure_ready: 'bg-rose-50 text-rose-700 ring-rose-200',
  seizure_issued: 'bg-rose-600 text-white ring-rose-600',
};

export default function ReminderLettersPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('reminder-letters', 'can_update');
  const [tab, setTab] = useState<Tab>('list');
  const [notice, setNotice] = useState<Notice>(null);

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Collections"
        title="Reminder Letters"
        description="Every customer in arrears in one place. Print letter 1, 2 and 3 as each stage falls due, then the seizing order. Change any customer's next letter date when needed."
        icon={FileWarning}
      />
      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}
      <nav className="flex flex-wrap gap-2">
        {([
          ['list', 'Arrears list', FileWarning],
          ['templates', 'Letter formats', SquarePen],
          ['settings', 'Timing settings', Settings2],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setNotice(null); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>
      {tab === 'list' && <ArrearsList onNotice={setNotice} canEdit={canEdit} />}
      {tab === 'templates' && <TemplateEditor onNotice={setNotice} canEdit={canEdit} />}
      {tab === 'settings' && <TimingSettings onNotice={setNotice} canEdit={canEdit} />}
    </div>
  );
}

function ArrearsList({ onNotice, canEdit }: { onNotice: (notice: Notice) => void; canEdit: boolean }) {
  const [rows, setRows] = useState<ArrearsRow[]>([]);
  const [summary, setSummary] = useState<ArrearsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'' | ArrearsStatus>('');
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateRow, setDateRow] = useState<ArrearsRow | null>(null);
  const [historyRow, setHistoryRow] = useState<ArrearsRow | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ rows: ArrearsRow[]; summary: ArrearsSummary }>('/v1/reminder-letters');
      setRows(response.data?.rows || []);
      setSummary(response.data?.summary || null);
      setSelected(new Set());
    } catch (error) {
      onNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) =>
      (!status || row.status === status)
      && (!stage || String(row.next_stage) === stage)
      && (!term || [row.agreement_no, row.invoice_no, row.customer_name, row.customer_phone, row.customer_nic, row.customer_code]
        .some((value) => value?.toLowerCase().includes(term)))
    );
  }, [rows, search, stage, status]);

  const selectedByStage = useMemo(() => {
    const groups: Partial<Record<LetterStage, string[]>> = {};
    rows.filter((row) => selected.has(row.invoice_no) && row.next_stage).forEach((row) => {
      const key = row.next_stage as LetterStage;
      groups[key] = [...(groups[key] || []), row.invoice_no];
    });
    return groups;
  }, [rows, selected]);

  function toggle(invoiceNo: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(invoiceNo)) next.delete(invoiceNo);
      else next.add(invoiceNo);
      return next;
    });
  }

  const lastPage = Math.max(1, Math.ceil(visible.length / perPage));
  const currentPage = Math.min(page, lastPage);
  const pageRows = visible.slice((currentPage - 1) * perPage, currentPage * perPage);
  const firstRow = visible.length ? (currentPage - 1) * perPage + 1 : 0;
  const lastRow = Math.min(currentPage * perPage, visible.length);

  const printable = visible.filter((row) => row.next_stage);
  const pagePrintable = pageRows.filter((row) => row.next_stage);
  const pageChecked = pagePrintable.length > 0 && pagePrintable.every((row) => selected.has(row.invoice_no));
  const allMatchingChecked = printable.length > 0 && printable.every((row) => selected.has(row.invoice_no));

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      pagePrintable.forEach((row) => (pageChecked ? next.delete(row.invoice_no) : next.add(row.invoice_no)));
      return next;
    });
  }

  function quickFilter(nextStatus: '' | ArrearsStatus, nextStage = '') {
    setStatus(nextStatus);
    setStage(nextStage);
    setPage(1);
  }

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Due · Letter 1', value: summary?.due_1, tone: 'amber' as const, filter: ['due', '1'] },
          { label: 'Due · Letter 2', value: summary?.due_2, tone: 'amber' as const, filter: ['due', '2'] },
          { label: 'Due · Letter 3', value: summary?.due_3, tone: 'amber' as const, filter: ['due', '3'] },
          { label: 'Ready for seizure', value: summary?.seizure_ready, tone: 'rose' as const, filter: ['seizure_ready', ''] },
          { label: 'Waiting', value: summary?.waiting, tone: 'slate' as const, filter: ['waiting', ''] },
          { label: 'Customers in arrears', value: summary?.total, tone: 'indigo' as const, filter: ['', ''], help: summary ? money(summary.arrears_amount) : undefined },
        ].map((metric) => (
          <button key={metric.label} type="button" className="text-left" onClick={() => quickFilter(metric.filter[0] as '' | ArrearsStatus, metric.filter[1])}>
            <OperationMetric label={metric.label} value={String(metric.value ?? 0)} tone={metric.tone} help={metric.help} />
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search agreement, customer, phone, NIC" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <select value={status} onChange={(event) => { setStatus(event.target.value as '' | ArrearsStatus); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as ArrearsStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
          </select>
          <select value={stage} onChange={(event) => { setStage(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="">Any next letter</option>
            {([1, 2, 3, 4] as LetterStage[]).map((key) => <option key={key} value={key}>{STAGE_LABELS[key]}</option>)}
          </select>
          {(Object.entries(selectedByStage) as [string, string[]][]).map(([key, invoiceNos]) => (
            <Link key={key} href={printPath(Number(key) as LetterStage, invoiceNos)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              <Printer className="h-4 w-4" /> Print {STAGE_LABELS[Number(key) as LetterStage]} ({invoiceNos.length})
            </Link>
          ))}
        </div>
        <div className="content-scrollbar overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={pageChecked}
                    onChange={togglePage}
                  />
                </th>
                <th className="px-4 py-3">Agreement / customer</th>
                <th className="px-4 py-3">Arrears</th>
                <th className="px-4 py-3">Overdue since</th>
                <th className="px-4 py-3">Last letter</th>
                <th className="px-4 py-3">Next letter</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={8} label="Loading arrears..." /> : visible.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-400">No customers in arrears match this view.</td></tr>
              ) : pageRows.map((row) => (
                <tr key={row.invoice_no} className="hover:bg-slate-50">
                  <td className="px-4 py-4 align-top">
                    {row.next_stage && <input type="checkbox" aria-label={`Select ${row.agreement_no}`} checked={selected.has(row.invoice_no)} onChange={() => toggle(row.invoice_no)} />}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-semibold text-slate-900">{row.agreement_no}</div>
                    <div className="text-xs text-slate-600">{row.customer_name}</div>
                    <div className="text-xs text-slate-400">{row.customer_phone || '—'}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-semibold text-rose-700">{money(row.arrears_amount)}</div>
                    <div className="text-xs text-slate-500">{row.overdue_installments} installment{row.overdue_installments === 1 ? '' : 's'}</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div>{shortDate(row.oldest_due_date)}</div>
                    <div className="text-xs text-slate-500">{row.days_overdue} days</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    {row.last_stage ? (
                      <>
                        <div className="font-medium">{row.last_stage_label}</div>
                        <div className="text-xs text-slate-500">{shortDate(row.last_printed_at)}</div>
                      </>
                    ) : <span className="text-slate-400">None yet</span>}
                  </td>
                  <td className="px-4 py-4 align-top">
                    {row.next_stage ? (
                      <>
                        <div className="font-medium">{row.next_stage_label}</div>
                        <div className={`text-xs ${row.next_print_date && row.next_print_date <= today() ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                          {shortDate(row.next_print_date)}
                          {row.is_overridden && <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700" title={row.override_note || 'Set manually'}>manual</span>}
                        </div>
                      </>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_CLASSES[row.status]}`}>{STATUS_LABELS[row.status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right align-top">
                    {row.next_stage && (
                      <Link href={printPath(row.next_stage, [row.invoice_no])} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
                        <Printer className="h-4 w-4" /> {row.next_stage === 4 ? 'Seizing order' : `Letter ${row.next_stage}`}
                      </Link>
                    )}
                    {canEdit && row.next_stage && (
                      <button type="button" onClick={() => setDateRow(row)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        <CalendarClock className="h-4 w-4" /> Date
                      </button>
                    )}
                    <button type="button" onClick={() => setHistoryRow(row)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                      <History className="h-4 w-4" /> History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageChecked && !allMatchingChecked && printable.length > pagePrintable.length && (
          <div className="border-t border-slate-200 bg-indigo-50 px-4 py-2.5 text-center text-sm text-indigo-800">
            All {pagePrintable.length} on this page are selected.{' '}
            <button type="button" onClick={() => setSelected(new Set(printable.map((row) => row.invoice_no)))} className="font-semibold underline">
              Select all {printable.length} matching customers
            </button>
          </div>
        )}
        {selected.size > 0 && (allMatchingChecked || !pageChecked) && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm text-slate-600">
            {selected.size} selected.{' '}
            <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-indigo-600 underline">
              Clear selection
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{visible.length ? `Showing ${firstRow}-${lastRow} of ${visible.length}` : 'No records'}</span>
            <select
              value={perPage}
              onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
              aria-label="Rows per page"
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={loading || currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="px-2 text-xs font-medium text-slate-500">Page {currentPage} of {lastPage}</span>
            <button
              type="button"
              onClick={() => setPage(Math.min(lastPage, currentPage + 1))}
              disabled={loading || currentPage >= lastPage}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {dateRow && (
        <NextDateModal
          row={dateRow}
          onClose={() => setDateRow(null)}
          onSaved={(message) => {
            setDateRow(null);
            onNotice({ type: 'success', text: message });
            void load();
          }}
        />
      )}
      {historyRow && <HistoryModal row={historyRow} onClose={() => setHistoryRow(null)} />}
    </>
  );
}

function NextDateModal({ row, onClose, onSaved }: { row: ArrearsRow; onClose: () => void; onSaved: (message: string) => void }) {
  const [date, setDate] = useState(row.next_print_date || today());
  const [note, setNote] = useState(row.override_note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await api.put('/v1/reminder-letters/next-date', { invoice_no: row.invoice_no, next_print_date: date, note: note || null });
      onSaved(response.message || 'Next letter date updated.');
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      const response = await api.delete(`/v1/reminder-letters/next-date?invoice_no=${encodeURIComponent(row.invoice_no)}`);
      onSaved(response.message || 'Next letter date reset to automatic.');
    } catch (resetError) {
      setError(getApiErrorMessage(resetError));
      setSaving(false);
    }
  }

  return (
    <OperationModal title={`Change ${row.next_stage_label} date`} description={`${row.agreement_no} · ${row.customer_name}`} onClose={onClose} width="max-w-lg">
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Automatic date: <span className="font-semibold text-slate-900">{shortDate(row.auto_next_date)}</span>
          {row.is_overridden && <> · Currently set manually to <span className="font-semibold text-slate-900">{shortDate(row.next_print_date)}</span></>}
        </div>
        <OperationField label="Next print date" required help="The letter shows as due to print on or after this date.">
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
        </OperationField>
        <OperationField label="Reason">
          <input value={note} maxLength={255} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Customer promised to pay on the 25th" className="w-full rounded-xl border border-slate-200 px-3 py-2.5" />
        </OperationField>
        {row.is_overridden && (
          <button type="button" onClick={() => void reset()} disabled={saving} className="text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50">
            Reset to automatic date
          </button>
        )}
        <OperationActions saving={saving} submitLabel="Save date" onCancel={onClose} />
      </form>
    </OperationModal>
  );
}

function HistoryModal({ row, onClose }: { row: ArrearsRow; onClose: () => void }) {
  const [logs, setLogs] = useState<LetterLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ logs: LetterLog[] }>(`/v1/reminder-letters/history?invoice_no=${encodeURIComponent(row.invoice_no)}`)
      .then((response) => setLogs(response.data?.logs || []))
      .catch((loadError) => setError(getApiErrorMessage(loadError)));
  }, [row.invoice_no]);

  const printedStages = ([1, 2, 3, 4] as LetterStage[]).filter((stage) => stage <= row.last_stage);

  return (
    <OperationModal title="Letter history" description={`${row.agreement_no} · ${row.customer_name}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        {printedStages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Reprint:</span>
            {printedStages.map((stage) => (
              <Link key={stage} href={printPath(stage, [row.invoice_no])} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50">
                <Printer className="h-3.5 w-3.5" /> {STAGE_LABELS[stage]}
              </Link>
            ))}
          </div>
        )}
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Printed</th><th className="px-3 py-2">Letter</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Arrears</th><th className="px-3 py-2">By</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs === null && !error ? <LoadingTableRow columns={5} label="Loading history..." /> : logs?.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">No letters printed yet.</td></tr>
            ) : logs?.map((log) => (
              <tr key={log.id}>
                <td className="px-3 py-2">{new Date(log.printed_at).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="px-3 py-2 font-medium">{STAGE_LABELS[log.stage]}</td>
                <td className="px-3 py-2">{log.recipient_name} <span className="text-xs capitalize text-slate-400">({log.recipient_type})</span></td>
                <td className="px-3 py-2">{money(log.arrears_amount)}</td>
                <td className="px-3 py-2 text-slate-500">{log.printed_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OperationModal>
  );
}

function TemplateEditor({ onNotice, canEdit }: { onNotice: (notice: Notice) => void; canEdit: boolean }) {
  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [letterhead, setLetterhead] = useState<{ company: LetterheadParty; branch: LetterheadParty }>({ company: null, branch: null });
  const [stage, setStage] = useState<LetterStage>(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get<{ templates: LetterTemplate[]; placeholders: string[]; company: LetterheadParty; branch: LetterheadParty }>('/v1/reminder-letters/templates')
      .then((response) => {
        const list = response.data?.templates || [];
        setTemplates(list);
        setPlaceholders(response.data?.placeholders || []);
        setLetterhead({ company: response.data?.company || null, branch: response.data?.branch || null });
        const first = list.find((template) => template.stage === 1);
        setTitle(first?.title || '');
        setBody(first?.body || '');
      })
      .catch((error) => onNotice({ type: 'error', text: getApiErrorMessage(error) }))
      .finally(() => setLoading(false));
  }, [onNotice]);

  const current = templates.find((template) => template.stage === stage);
  const company = letterhead.company;
  const previewVars: Record<string, string> = {
    ...SAMPLE_VARIABLES,
    ...(company?.name ? { company_name: company.name } : {}),
    ...(company?.address ? { company_address: company.address } : {}),
    ...(company?.phone ? { company_phone: company.phone } : {}),
    ...(letterhead.branch?.name ? { branch_name: letterhead.branch.name } : {}),
    ...(letterhead.branch?.phone ? { branch_phone: letterhead.branch.phone } : {}),
  };
  const dirty = current ? current.title !== title || current.body !== body : false;

  function selectStage(next: LetterStage) {
    if (dirty && !window.confirm('Discard unsaved changes to this letter?')) return;
    const template = templates.find((item) => item.stage === next);
    setStage(next);
    setTitle(template?.title || '');
    setBody(template?.body || '');
  }

  function insertPlaceholder(placeholder: string) {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody(body.slice(0, start) + placeholder + body.slice(end));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  async function save() {
    setSaving(true);
    try {
      const response = await api.put<LetterTemplate>(`/v1/reminder-letters/templates/${stage}`, { title, body });
      const saved = response.data;
      if (saved) setTemplates((list) => list.map((template) => (template.stage === stage ? saved : template)));
      onNotice({ type: 'success', text: response.message || 'Letter format saved.' });
    } catch (error) {
      onNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center p-12 text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /></div>;

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4] as LetterStage[]).map((key) => (
            <button key={key} type="button" onClick={() => selectStage(key)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${stage === key ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-slate-600 hover:bg-slate-100'}`}>
              {STAGE_LABELS[key]}
            </button>
          ))}
        </div>
        <OperationField label="Heading">
          <input value={title} disabled={!canEdit} maxLength={150} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-50" />
        </OperationField>
        <OperationField label="Letter body" help="Click a placeholder to insert it at the cursor. It is replaced with the customer's details when printing. The company letterhead is added automatically.">
          <textarea ref={bodyRef} value={body} disabled={!canEdit} onChange={(event) => setBody(event.target.value)} rows={18} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm leading-6 disabled:bg-slate-50" />
        </OperationField>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((placeholder) => (
              <button key={placeholder} type="button" onClick={() => insertPlaceholder(placeholder)} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-indigo-100 hover:text-indigo-700">
                {placeholder}
              </button>
            ))}
          </div>
        )}
        {canEdit && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="text-xs text-slate-400">{current?.updated_by ? `Last saved by ${current.updated_by}` : ''}</span>
            <button type="button" onClick={() => void save()} disabled={saving || !dirty || !title.trim() || !body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save {STAGE_LABELS[stage]}
            </button>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview with sample data</p>
        <Letterhead company={letterhead.company} branch={letterhead.branch} />
        {!(company?.logo && company.address && company.phone && company.email) && (
          <p className="mt-2 text-xs text-amber-600">Add your logo, address, phone and email in Companies setup to complete this header.</p>
        )}
        <div className="mt-6 text-sm">
          <div className="font-semibold">{previewVars.recipient_name}</div>
          <div className="max-w-xs whitespace-pre-line">{previewVars.recipient_address}</div>
          <div className="mt-4">{previewVars.date}</div>
        </div>
        <h2 className="mb-4 mt-6 text-center text-base font-bold uppercase underline">{renderTemplate(title, previewVars)}</h2>
        <div className="whitespace-pre-wrap text-sm leading-6 text-slate-900">{renderTemplate(body, previewVars)}</div>
      </div>
    </section>
  );
}

function TimingSettings({ onNotice, canEdit }: { onNotice: (notice: Notice) => void; canEdit: boolean }) {
  const [settings, setSettings] = useState<LetterSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ settings: LetterSettings }>('/v1/reminder-letters/settings')
      .then((response) => setSettings(response.data?.settings || null))
      .catch((error) => onNotice({ type: 'error', text: getApiErrorMessage(error) }));
  }, [onNotice]);

  if (!settings) return <div className="flex items-center justify-center p-12 text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /></div>;

  const fields: { key: keyof LetterSettings; label: string; help: string }[] = [
    { key: 'letter1_after_days', label: 'Letter 1', help: 'Days after the oldest unpaid installment fell due.' },
    { key: 'letter2_after_days', label: 'Letter 2', help: 'Days after letter 1 was printed, if arrears are still unpaid.' },
    { key: 'letter3_after_days', label: 'Letter 3', help: 'Days after letter 2 was printed, if arrears are still unpaid.' },
    { key: 'seizure_after_days', label: 'Seizing order', help: 'Days after letter 3 was printed before the customer is ready for seizure.' },
    { key: 'settle_within_days', label: 'Settle-by date in letters', help: 'Days from the print date used for {settle_by_date}.' },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const response = await api.put<LetterSettings>('/v1/reminder-letters/settings', { ...settings });
      if (response.data) setSettings(response.data);
      onNotice({ type: 'success', text: response.message || 'Timing saved.' });
    } catch (error) {
      onNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        Overdue +{settings.letter1_after_days} days → <b>Letter 1</b> → +{settings.letter2_after_days} days → <b>Letter 2</b> → +{settings.letter3_after_days} days → <b>Letter 3</b> → +{settings.seizure_after_days} days → <b>Seizing order</b>.
        If the customer settles all arrears, the next letter starts again from Letter 1. You can still change any single customer&apos;s date from the arrears list.
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <OperationField key={field.key} label={`${field.label} (days)`} help={field.help}>
            <input
              type="number"
              min={0}
              max={365}
              required
              disabled={!canEdit}
              value={settings[field.key]}
              onChange={(event) => setSettings({ ...settings, [field.key]: Number(event.target.value) })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-50"
            />
          </OperationField>
        ))}
      </div>
      {canEdit && (
        <div className="flex justify-end border-t border-slate-200 pt-5">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save timing
          </button>
        </div>
      )}
    </form>
  );
}
