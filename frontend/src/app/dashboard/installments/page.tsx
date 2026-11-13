'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, Eye, FileText, LoaderCircle, MessageSquareText, Search, X } from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
  StatusPill,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { type HpCollectionAgreement, type HpCollectionSummary, type HpInstallment, type HpInstallmentSummary, type HpOptions, money, shortDate, today } from '@/lib/hp';
import { useAuth } from '@/lib/auth-context';
import { ChequeEntryFields } from '@/components/cheque-entry-fields';
import { SearchSelect } from '@/components/search-select';
import { AgreementStatementModal, type CollectSuggestion } from '@/components/hp-agreement-statement';

type PenaltyPreview = {
  penalty_amount: number;
  penalty_total_amount: number;
  months_overdue: number;
};

type Mode = 'agreement' | 'installment';

type Filters = {
  mode: Mode;
  search: string;
  view: string;
  status: string;
  aging: string;
  due_from: string;
  due_to: string;
  schema_type: string;
  sort: string;
  direction: 'asc' | 'desc';
  page: number;
};

const DEFAULT_FILTERS: Filters = {
  mode: 'agreement',
  search: '',
  view: '',
  status: 'unpaid',
  aging: '',
  due_from: '',
  due_to: '',
  schema_type: '',
  sort: 'instalment_date',
  direction: 'asc',
  page: 1,
};

const VIEWS = [
  { value: '', label: 'All' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
];

const AGING = [
  { value: '', label: 'Any age' },
  { value: '1-30', label: '1–30 days overdue' },
  { value: '31-60', label: '31–60 days overdue' },
  { value: '61-90', label: '61–90 days overdue' },
  { value: '90+', label: '90+ days overdue' },
];

const PER_PAGE = 50;
const EMPTY_SUMMARY: HpInstallmentSummary = { count: 0, balance_total: 0, overdue_count: 0, overdue_amount: 0, overdue_agreements: 0 };
const EMPTY_AGREEMENT_SUMMARY: HpCollectionSummary = { count: 0, outstanding_total: 0, arrears_amount: 0, arrears_agreements: 0 };

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    mode: params.get('mode') === 'installment' ? 'installment' : 'agreement',
    search: params.get('search') ?? DEFAULT_FILTERS.search,
    view: params.get('view') ?? DEFAULT_FILTERS.view,
    status: params.get('status') ?? DEFAULT_FILTERS.status,
    aging: params.get('aging') ?? DEFAULT_FILTERS.aging,
    due_from: params.get('due_from') ?? DEFAULT_FILTERS.due_from,
    due_to: params.get('due_to') ?? DEFAULT_FILTERS.due_to,
    schema_type: params.get('schema_type') ?? DEFAULT_FILTERS.schema_type,
    sort: params.get('sort') ?? DEFAULT_FILTERS.sort,
    direction: params.get('direction') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** Only non-default values go into the URL so shared links stay short. */
function filtersToParams(filters: Filters) {
  const params = new URLSearchParams();
  (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).forEach((key) => {
    if (filters[key] !== DEFAULT_FILTERS[key]) params.set(key, String(filters[key]));
  });
  return params;
}

function agingTone(days: number) {
  if (days > 90) return 'bg-rose-600 text-white';
  if (days > 60) return 'bg-rose-100 text-rose-800';
  if (days > 30) return 'bg-orange-100 text-orange-800';
  return 'bg-amber-100 text-amber-800';
}

export default function InstallmentsPage() {
  return (
    <Suspense fallback={null}>
      <Installments />
    </Suspense>
  );
}

function Installments() {
  const { hasPermission, featureEnabled } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canSms = featureEnabled('sms') && hasPermission('sms', 'can_create');
  const [smsSending, setSmsSending] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(new URLSearchParams(searchParams.toString())));
  const [searchInput, setSearchInput] = useState(filters.search);
  const [rows, setRows] = useState<HpInstallment[]>([]);
  const [summary, setSummary] = useState<HpInstallmentSummary>(EMPTY_SUMMARY);
  const [agreementRows, setAgreementRows] = useState<HpCollectionAgreement[]>([]);
  const [agreementSummary, setAgreementSummary] = useState<HpCollectionSummary>(EMPTY_AGREEMENT_SUMMARY);
  const [lastPage, setLastPage] = useState(1);
  const [options, setOptions] = useState<HpOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ instalment: HpInstallment; penalty: PenaltyPreview; suggestion?: CollectSuggestion } | null>(null);
  const [statementId, setStatementId] = useState<number | null>(null);
  const [statementKey, setStatementKey] = useState(0);
  const byAgreement = filters.mode === 'agreement';
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Any filter change other than paging goes back to page 1.
  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  }, []);

  useEffect(() => {
    const query = filtersToParams(filters).toString();
    if (query !== window.location.search.replace(/^\?/, '')) {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [filters, pathname, router]);

  useEffect(() => {
    if (searchInput.trim() === filters.search) return;
    const timer = window.setTimeout(() => updateFilters({ search: searchInput.trim() }), 350);
    return () => window.clearTimeout(timer);
  }, [filters.search, searchInput, updateFilters]);

  useEffect(() => {
    api.get<HpOptions>('/v1/hp/options')
      .then((response) => setOptions(response.data || null))
      .catch((error) => setNotice({ type: 'error', text: getApiErrorMessage(error) }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = filtersToParams(filters);
      query.delete('mode');
      if (!query.has('status')) query.set('status', filters.status);
      query.set('page', String(filters.page));
      query.set('per_page', String(PER_PAGE));
      if (filters.mode === 'agreement') {
        const response = await api.get<HpCollectionAgreement[]>(`/v1/hp/installments/agreements?${query}`);
        setAgreementRows(response.data || []);
        setLastPage(response.meta?.last_page || 1);
        setAgreementSummary((response as typeof response & { summary?: HpCollectionSummary }).summary || EMPTY_AGREEMENT_SUMMARY);
      } else {
        const response = await api.get<HpInstallment[]>(`/v1/hp/installments?${query}`);
        setRows(response.data || []);
        setLastPage(response.meta?.last_page || 1);
        setSummary((response as typeof response & { summary?: HpInstallmentSummary }).summary || EMPTY_SUMMARY);
      }
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function inspect(instalmentId: number, suggestion?: CollectSuggestion) {
    try {
      const response = await api.get<{ instalment: HpInstallment; penalty: PenaltyPreview }>(`/v1/installments/${instalmentId}?as_of=${today()}`);
      setSelected(response.data ? { ...response.data, suggestion } : null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    }
  }

  function switchMode(mode: Mode) {
    if (mode === filters.mode) return;
    // Each mode has its own default ordering.
    updateFilters({ mode, sort: DEFAULT_FILTERS.sort, direction: DEFAULT_FILTERS.direction });
  }

  async function sendArrearsSms(agreementId: number | undefined, key: string) {
    if (!agreementId) return;
    setSmsSending(key);
    try {
      const res = await api.post(`/v1/sms/arrears/${agreementId}`, {});
      setNotice({ type: 'success', text: res.message || 'Arrears SMS sent.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setSmsSending(null);
    }
  }

  function toggleSort(column: string) {
    updateFilters(
      filters.sort === column
        ? { direction: filters.direction === 'asc' ? 'desc' : 'asc' }
        : { sort: column, direction: column === 'balance_amount' ? 'desc' : 'asc' }
    );
  }

  function clearFilters() {
    setSearchInput('');
    updateFilters({ ...DEFAULT_FILTERS, mode: filters.mode });
  }

  const hasActiveFilters = filtersToParams({ ...filters, mode: DEFAULT_FILTERS.mode, page: 1 }).toString() !== '';
  const totalRows = byAgreement ? agreementSummary.count : summary.count;
  const firstRow = totalRows === 0 ? 0 : (filters.page - 1) * PER_PAGE + 1;
  const lastRow = Math.min(filters.page * PER_PAGE, totalRows);
  const inputClass = 'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm';

  const sortHeader = (column: string, label: string, className = '') => (
    <th className={`px-5 py-3 ${className}`}>
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800">
        {label}
        {filters.sort === column && (filters.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <OperationHeader eyebrow="Collections" title="Installments" description="Track due schedules, calculate overdue penalties, accept partial payments, and carry excess payments into future installments." icon={CalendarClock} />
      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}
      {byAgreement ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OperationMetric label="Matching agreements" value={String(agreementSummary.count)} tone="indigo" />
          <OperationMetric label="Outstanding balance" value={money(agreementSummary.outstanding_total)} tone="amber" help="Full remaining schedule of these agreements" />
          <OperationMetric label="Arrears amount" value={money(agreementSummary.arrears_amount)} tone={agreementSummary.arrears_amount ? 'rose' : 'emerald'} help="Overdue principal, before penalty" />
          <OperationMetric label="Customers in arrears" value={String(agreementSummary.arrears_agreements)} tone={agreementSummary.arrears_agreements ? 'rose' : 'emerald'} help="Agreements with an overdue installment" />
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OperationMetric label="Matching installments" value={String(summary.count)} tone="indigo" />
          <OperationMetric label="Outstanding balance" value={money(summary.balance_total)} tone="amber" />
          <OperationMetric label="Overdue amount" value={money(summary.overdue_amount)} tone={summary.overdue_count ? 'rose' : 'emerald'} help={`${summary.overdue_count} installment(s)`} />
          <OperationMetric label="Customers in arrears" value={String(summary.overdue_agreements)} tone={summary.overdue_agreements ? 'rose' : 'emerald'} help="Agreements with an overdue installment" />
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 inline-flex rounded-xl bg-slate-100 p-1">
              {([['agreement', 'By agreement'], ['installment', 'By installment']] as const).map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => switchMode(mode)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filters.mode === mode ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {label}
                </button>
              ))}
            </div>
            {VIEWS.map((view) => (
              <button key={view.value} type="button" onClick={() => updateFilters({ view: view.value })} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filters.view === view.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {view.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search customer, NIC, phone, agreement or invoice no..." className={`${inputClass} w-full pl-9`} />
            </div>
            <select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })} className={inputClass}>
              <option value="unpaid">Unpaid (pending + partial)</option>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="converted">Converted</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={filters.aging} onChange={(event) => updateFilters({ aging: event.target.value })} className={inputClass}>
              {AGING.map((aging) => <option key={aging.value} value={aging.value}>{aging.label}</option>)}
            </select>
            <select value={filters.schema_type} onChange={(event) => updateFilters({ schema_type: event.target.value })} className={inputClass}>
              <option value="">All schemas</option>
              {options?.schemas.map((schema) => <option key={schema.SchemaType} value={schema.SchemaType}>{schema.SchemaType}</option>)}
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              Due
              <input type="date" value={filters.due_from} onChange={(event) => updateFilters({ due_from: event.target.value })} className={inputClass} />
              to
              <input type="date" value={filters.due_to} onChange={(event) => updateFilters({ due_to: event.target.value })} className={inputClass} />
            </label>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" /> Clear
              </button>
            )}
          </div>
        </div>
        <div className="content-scrollbar overflow-x-auto">
          {byAgreement ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {sortHeader('agreement_no', 'Agreement / Customer')}
                {sortHeader('instalment_no', 'Progress')}
                {sortHeader('instalment_date', 'Next due')}
                {sortHeader('arrears_amount', 'Arrears')}
                <th className="px-5 py-3">Payable now</th>
                {sortHeader('balance_amount', 'Outstanding')}
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={7} label="Loading agreements..." /> : agreementRows.length === 0 ? <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-400">No agreements match these filters.</td></tr> : agreementRows.map((row) => {
                const progress = row.instalment_count ? Math.round((row.paid_count / row.instalment_count) * 100) : 0;
                const smsKey = `a-${row.id}`;
                return (
                  <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setStatementId(row.id)}>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{row.agreement_no}</div>
                      <div className="text-xs text-slate-600">{row.customer_name}</div>
                      <div className="text-xs text-slate-400">{[row.customer_nic, row.customer_phone].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm font-semibold text-slate-700">{row.paid_count} / {row.instalment_count} paid</div>
                      <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
                    </td>
                    <td className="px-5 py-4">
                      {row.next_due_date ? (
                        <>
                          <div className={row.days_overdue > 0 ? 'font-semibold text-rose-700' : ''}>{shortDate(row.next_due_date)} · #{row.next_instalment_no}</div>
                          <div className="text-xs text-slate-500">{money(row.next_due_amount)}</div>
                          {row.days_overdue > 0 && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${agingTone(row.days_overdue)}`}>{row.days_overdue} day{row.days_overdue === 1 ? '' : 's'} overdue</span>}
                        </>
                      ) : <span className="text-slate-400">Nothing due</span>}
                    </td>
                    <td className="px-5 py-4">
                      {row.arrears_amount > 0 ? (
                        <>
                          <div className="font-semibold text-rose-700">{money(row.arrears_amount)}</div>
                          <div className="text-xs text-slate-500">{row.arrears_count} installment{row.arrears_count === 1 ? '' : 's'}</div>
                        </>
                      ) : <span className="text-emerald-600">Up to date</span>}
                    </td>
                    <td className="px-5 py-4">
                      {row.payable_now > 0 ? (
                        <>
                          <div className="font-semibold">{money(row.payable_now)}</div>
                          <div className="text-xs text-slate-500">{row.estimated_penalty > 0 ? `incl. ${money(row.estimated_penalty)} penalty` : 'No penalty yet'}</div>
                        </>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-4 font-semibold">{money(row.outstanding_total)}</td>
                    <td className="px-5 py-4 text-right whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                      {canSms && row.arrears_count > 0 && (<button onClick={() => void sendArrearsSms(row.id, smsKey)} disabled={smsSending === smsKey} title="Send arrears SMS to customer" className="mr-1 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">{smsSending === smsKey ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} SMS</button>)}
                      <button onClick={() => setStatementId(row.id)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><FileText className="h-4 w-4" /> Statement</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {sortHeader('agreement_no', 'Agreement / Customer')}
                {sortHeader('instalment_no', 'Installment')}
                {sortHeader('instalment_date', 'Due date')}
                {sortHeader('balance_amount', 'Balance')}
                <th className="px-5 py-3">Est. penalty</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={7} label="Loading installments..." /> : rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-400">No installments match these filters.</td></tr> : rows.map((row) => {
                const daysOverdue = Number(row.days_overdue || 0);
                const penalty = Number(row.estimated_penalty || 0);
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      {row.sum?.id
                        ? <button type="button" onClick={() => setStatementId(row.sum!.id)} title="Open agreement statement" className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline">{row.agreement_no}</button>
                        : <div className="font-semibold text-slate-900">{row.agreement_no}</div>}
                      <div className="text-xs text-slate-600">{row.sum?.customer_name}</div>
                      <div className="text-xs text-slate-400">{[row.sum?.customer_nic, row.sum?.customer_phone].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-5 py-4">#{row.instalment_no} · {money(row.base_amount)}</td>
                    <td className="px-5 py-4">
                      <div className={daysOverdue > 0 ? 'font-semibold text-rose-700' : ''}>{shortDate(row.instalment_date)}</div>
                      {daysOverdue > 0 && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${agingTone(daysOverdue)}`}>{daysOverdue} day{daysOverdue === 1 ? '' : 's'} overdue</span>}
                    </td>
                    <td className="px-5 py-4 font-semibold">{money(row.balance_amount)}</td>
                    <td className={`px-5 py-4 ${penalty > 0 ? 'font-semibold text-rose-700' : 'text-slate-400'}`}>{penalty > 0 ? money(penalty) : '—'}</td>
                    <td className="px-5 py-4"><StatusPill status={row.status} /></td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      {canSms && daysOverdue > 0 && (<button onClick={() => void sendArrearsSms(row.sum?.id, `i-${row.id}`)} disabled={smsSending === `i-${row.id}`} title="Send arrears SMS to customer" className="mr-1 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">{smsSending === `i-${row.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />} SMS</button>)}
                      <button onClick={() => inspect(row.id)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Eye className="h-4 w-4" /> Review</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
          <span>{totalRows ? `Showing ${firstRow}–${lastRow} of ${totalRows} ${byAgreement ? 'agreements' : 'installments'}` : 'No results'}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={filters.page <= 1 || loading} onClick={() => updateFilters({ page: filters.page - 1 })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span>Page {filters.page} of {lastPage}</span>
            <button type="button" disabled={filters.page >= lastPage || loading} onClick={() => updateFilters({ page: filters.page + 1 })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>
      {statementId !== null && (
        <AgreementStatementModal
          agreementId={statementId}
          reloadKey={statementKey}
          canPay={hasPermission('installments', 'can_create')}
          canSms={canSms}
          onClose={() => setStatementId(null)}
          onCollect={(instalmentId, suggestion) => void inspect(instalmentId, suggestion)}
        />
      )}
      {selected && options && (
        <PaymentModal
          data={selected}
          suggestion={selected.suggestion}
          options={options}
          canPay={hasPermission('installments', 'can_create') && ['pending', 'partial'].includes(selected.instalment.status)}
          onClose={() => setSelected(null)}
          onPaid={(message) => {
            setSelected(null);
            setNotice({ type: 'success', text: message || 'Installment payment recorded.' });
            setStatementKey((key) => key + 1);
            load();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({ data, suggestion, options, canPay, onClose, onPaid }: { data: { instalment: HpInstallment; penalty: PenaltyPreview }; suggestion?: CollectSuggestion; options: HpOptions; canPay: boolean; onClose: () => void; onPaid: (message?: string) => void }) {
  const { instalment, penalty } = data;
  // From the statement we may collect several installments at once; the excess spills forward server-side.
  const duePrincipal = suggestion ? suggestion.principal : Number(instalment.balance_amount);
  const duePenalty = suggestion ? suggestion.penalty : Number(penalty.penalty_amount);
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState(String(Math.round((duePrincipal + duePenalty) * 100) / 100));
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState('');
  const [cheque, setCheque] = useState({
    bank_id: '',
    bank_branch_id: '',
    cheque_no: '',
    account_no: '',
    date: today(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/v1/installments/${instalment.id}/pay`, {
        payment_date: paymentDate,
        amount: Number(amount),
        payment_method: method,
        bank_detail_id: bankId ? Number(bankId) : null,
        discount: Number(discount || 0),
        waive_penalty: waive,
        note: note || null,
        cheque: method === 'cheque'
          ? {
              bank_id: Number(cheque.bank_id),
              bank_branch_id: Number(cheque.bank_branch_id),
              cheque_no: cheque.cheque_no,
              account_no: cheque.account_no,
              due_date: cheque.date,
            }
          : null,
      });
      onPaid(res.message);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OperationModal title={`${instalment.agreement_no} · Installment #${instalment.instalment_no}`} description={`Due ${shortDate(instalment.instalment_date)}`} onClose={onClose} width="max-w-2xl">
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        {suggestion
          ? <div className="grid gap-3 sm:grid-cols-3"><OperationMetric label="Principal" value={money(duePrincipal)} help={suggestion.label} /><OperationMetric label="Est. penalty" value={money(duePenalty)} tone={duePenalty ? 'rose' : 'emerald'} help={duePenalty ? 'Across overdue installments' : 'Within grace period'} /><OperationMetric label="Total due" value={money(duePrincipal + duePenalty)} tone="amber" help={`Applied from installment #${instalment.instalment_no} onward`} /></div>
          : <div className="grid gap-3 sm:grid-cols-3"><OperationMetric label="Principal balance" value={money(instalment.balance_amount)} /><OperationMetric label="Current penalty" value={money(penalty.penalty_amount)} tone={penalty.penalty_amount ? 'rose' : 'emerald'} help={penalty.months_overdue ? `${penalty.months_overdue} overdue month(s)` : 'Within grace period'} /><OperationMetric label="Total due" value={money(Number(instalment.balance_amount) + Number(penalty.penalty_amount))} tone="amber" /></div>}
        {instalment.payments?.length > 0 && <div className="rounded-xl border border-slate-200 p-4"><h3 className="mb-2 text-sm font-bold">Payment history</h3>{instalment.payments.map((payment) => <div key={payment.id} className="flex justify-between border-t border-slate-100 py-2 text-sm first:border-0"><span>{shortDate(payment.payment_date)} · {payment.payment_method.replaceAll('_', ' ')}</span><span className="font-semibold">{money(payment.total_amount)}</span></div>)}</div>}
        {canPay ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <OperationField label="Payment date" required><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
            <OperationField label="Payment amount" required help="Excess is automatically carried into the next unpaid installment."><input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
            <OperationField label="Payment method" required><select value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></OperationField>
            <OperationField label="Principal discount"><input type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
            {['card', 'bank_transfer'].includes(method) && <OperationField label="Bank account" required><SearchSelect value={bankId} onChange={setBankId} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>}
            <label className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"><input type="checkbox" checked={waive} onChange={(event) => { const checked = event.target.checked; setWaive(checked); setAmount(String(Math.round((duePrincipal + (checked ? 0 : duePenalty)) * 100) / 100)); }} /> Waive calculated penalty</label>
          </div>
          {method === 'cheque' && <ChequeEntryFields banks={options.cheque_banks} value={cheque} onChange={setCheque} />}
          <OperationField label="Collection note"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField>
          <OperationActions saving={saving} submitLabel="Record payment" onCancel={onClose} />
        </> : <div className="flex items-center gap-3 rounded-xl bg-slate-100 p-4 text-sm text-slate-600"><CircleDollarSign className="h-5 w-5" /> This installment is no longer payable.</div>}
      </form>
    </OperationModal>
  );
}
