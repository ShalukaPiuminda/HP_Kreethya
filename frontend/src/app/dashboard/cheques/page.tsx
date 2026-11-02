'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  CircleArrowDown,
  CircleArrowUp,
  Clock3,
  History,
  RefreshCcw,
  Search,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
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
import type {
  ChequeRecord,
  ChequeStatus,
  ChequeSummary,
  ChequeType,
} from '@/lib/cheques';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/inventory';
import { dateInputValue, displayDate, numeric } from '@/lib/purchases';
import { SearchSelect } from '@/components/search-select';

type ActionType = 'pass' | 'return';

interface ActionState {
  type: ChequeType;
  action: ActionType;
  cheque: ChequeRecord;
}

export default function ChequesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('accounts', 'can_read');
  const canUpdate = hasPermission('accounts', 'can_update');
  const [customerCheques, setCustomerCheques] = useState<ChequeRecord[]>([]);
  const [supplierCheques, setSupplierCheques] = useState<ChequeRecord[]>([]);
  const [summary, setSummary] = useState<ChequeSummary | null>(null);
  const [tab, setTab] = useState<ChequeType>('customer');
  const [status, setStatus] = useState<'all' | ChequeStatus>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [historyCheque, setHistoryCheque] = useState<ChequeRecord | null>(null);
  const [actionDate, setActionDate] = useState(dateInputValue());
  const [bankDetailId, setBankDetailId] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [customerResponse, supplierResponse, summaryResponse] = await Promise.all([
        api.getAll<ChequeRecord>('/v1/cheques/customer'),
        api.getAll<ChequeRecord>('/v1/cheques/supplier'),
        api.get<ChequeSummary>('/v1/cheques/summary'),
      ]);
      setCustomerCheques(customerResponse.data ?? []);
      setSupplierCheques(supplierResponse.data ?? []);
      setSummary(summaryResponse.data ?? null);
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load cheque clearing data.'),
      });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadData]);

  const visibleCheques = useMemo(() => {
    const records = tab === 'customer' ? customerCheques : supplierCheques;
    const term = search.trim().toLowerCase();

    return records.filter((cheque) => {
      const matchesStatus = status === 'all' || cheque.status === status;
      const matchesSearch = !term || [
        cheque.cheques_no,
        cheque.trans_no,
        cheque.bank,
        cheque.acc_no,
      ].some((value) => value.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [customerCheques, search, status, supplierCheques, tab]);

  const activeSummary = summary?.[tab];

  const openAction = (
    type: ChequeType,
    action: ActionType,
    cheque: ChequeRecord
  ) => {
    setActionState({ type, action, cheque });
    setActionDate(dateInputValue());
    setBankDetailId(summary?.bank_accounts[0]?.id?.toString() ?? '');
    setReason('');
    setNotice(null);
  };

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!actionState) return;

    setSaving(true);
    setNotice(null);
    try {
      const path = `/v1/cheques/${actionState.type}/${actionState.cheque.id}/${actionState.action}`;
      await api.post(path, actionState.action === 'pass'
        ? {
            action_date: actionDate,
            bank_detail_id: Number(bankDetailId),
          }
        : {
            action_date: actionDate,
            reason,
          });

      setActionState(null);
      await loadData();
      setNotice({
        type: 'success',
        message: actionState.action === 'pass'
          ? 'Cheque cleared and bank accounting posted.'
          : `${actionState.type === 'customer' ? 'Customer debt' : 'Supplier payable'} restored successfully.`,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to update the cheque.'),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canRead) {
    return (
      <OperationNotice type="error">
        You do not have permission to view cheque clearing.
      </OperationNotice>
    );
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Treasury Control"
        title="Cheque Clearing"
        description="Manually clear or return customer and supplier cheques with bank posting, account restoration, and a permanent status trail."
        icon={BadgeCheck}
        actions={
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric
          label="Pending Value"
          value={formatCurrency(activeSummary?.pending_amount ?? 0)}
          help={`${activeSummary?.pending_count ?? 0} ${tab} cheques awaiting action`}
          tone="amber"
        />
        <OperationMetric
          label="Cleared Value"
          value={formatCurrency(activeSummary?.passed_amount ?? 0)}
          help={`${activeSummary?.passed_count ?? 0} successfully cleared`}
          tone="emerald"
        />
        <OperationMetric
          label="Returned Value"
          value={formatCurrency(activeSummary?.returned_amount ?? 0)}
          help={`${activeSummary?.returned_count ?? 0} debt reversals`}
          tone="rose"
        />
        <OperationMetric
          label="Net Cheque Bank Impact"
          value={formatCurrency(summary?.net_bank_impact ?? 0)}
          help="Incoming cleared less outgoing cleared"
          tone="indigo"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex self-start rounded-xl bg-slate-100 p-1">
              <TabButton
                active={tab === 'customer'}
                label="Incoming Customer"
                icon={CircleArrowDown}
                onClick={() => setTab('customer')}
              />
              <TabButton
                active={tab === 'supplier'}
                label="Outgoing Supplier"
                icon={CircleArrowUp}
                onClick={() => setTab('supplier')}
              />
            </div>

            <div className="flex flex-1 flex-col gap-3 sm:flex-row xl:max-w-2xl">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search cheque, transaction, bank, or account"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as 'all' | ChequeStatus)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="returned">Returned</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Cheque</th>
                <th className="px-5 py-3.5">Source Transaction</th>
                <th className="px-5 py-3.5">Bank Details</th>
                <th className="px-5 py-3.5">{tab === 'customer' ? 'Due Date' : 'Release Date'}</th>
                <th className="px-5 py-3.5 text-right">Amount</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Clearing Detail</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={8} label="Loading cheque register..." />
              ) : visibleCheques.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-slate-400">
                    No cheques match the selected filters.
                  </td>
                </tr>
              ) : visibleCheques.map((cheque) => (
                <tr key={cheque.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <div className="font-mono text-xs font-bold text-indigo-700">
                      {cheque.cheques_no}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Account {cheque.acc_no}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-mono text-xs font-semibold text-slate-800">
                      {cheque.trans_no}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-400">
                      {formatTransactionType(cheque.trans_type)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800">{cheque.bank}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      Branch {cheque.branch_code}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {displayDate(cheque.due_date ?? cheque.release_date ?? '')}
                  </td>
                  <td className="px-5 py-4 text-right text-base font-bold text-slate-950">
                    {formatCurrency(numeric(cheque.amount))}
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={cheque.status} />
                  </td>
                  <td className="px-5 py-4">
                    {cheque.status === 'passed' ? (
                      <>
                        <div className="font-semibold text-emerald-700">
                          {cheque.bank_account?.bank_name ?? 'Bank posted'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {cheque.bank_account?.account_no} / {displayDate(cheque.realized_date ?? '')}
                        </div>
                      </>
                    ) : cheque.status === 'returned' ? (
                      <>
                        <div className="max-w-[240px] truncate font-semibold text-rose-700">
                          {cheque.return_reason}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {displayDate(cheque.realized_date ?? '')}
                        </div>
                      </>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                        <Clock3 className="h-3.5 w-3.5" />
                        Awaiting verification
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setHistoryCheque(cheque)}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-indigo-700"
                        title="View history"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      {canUpdate && cheque.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openAction(tab, 'pass', cheque)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-100"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => openAction(tab, 'return', cheque)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Return
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {actionState && (
        <OperationModal
          title={actionState.action === 'pass' ? 'Clear Cheque' : 'Return Cheque'}
          description={`${actionState.cheque.cheques_no} · ${actionState.cheque.trans_no} · ${formatCurrency(numeric(actionState.cheque.amount))}`}
          onClose={() => !saving && setActionState(null)}
          width="max-w-xl"
        >
          <form onSubmit={submitAction} className="space-y-5 p-6">
            {notice?.type === 'error' && (
              <OperationNotice type="error">{notice.message}</OperationNotice>
            )}

            <div className={`rounded-2xl border p-4 ${
              actionState.action === 'pass'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-rose-200 bg-rose-50'
            }`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Accounting Effect
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800">
                {actionState.action === 'pass'
                  ? actionState.type === 'customer'
                    ? 'Moves value from Cheques In Hand into the selected bank account.'
                    : 'Clears Cheques Payable against the selected bank account.'
                  : actionState.type === 'customer'
                    ? 'Restores the customer invoice balance and accounts receivable.'
                    : 'Restores the supplier invoice balance and accounts payable.'}
              </div>
            </div>

            <OperationField label="Action Date" required>
              <input
                type="date"
                value={actionDate}
                onChange={(event) => setActionDate(event.target.value)}
                className={inputClass}
                required
              />
            </OperationField>

            {actionState.action === 'pass' ? (
              <OperationField
                label="Internal Bank Account"
                help="This is the ERP bank account affected by the cleared cheque."
                required
              >
                <SearchSelect
                  value={bankDetailId}
                  onChange={setBankDetailId}
                  options={(summary?.bank_accounts ?? []).map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))}
                  placeholder="Select bank account"
                  searchPlaceholder="Search bank accounts..."
                  className={inputClass}
                  required
                />
              </OperationField>
            ) : (
              <OperationField label="Return Reason" required>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={inputClass}
                  rows={4}
                  placeholder="Bank return reason, cancellation note, or dishonour details"
                  required
                />
              </OperationField>
            )}

            {actionState.action === 'pass' && summary?.bank_accounts.length === 0 && (
              <OperationNotice type="error">
                Create an internal bank account under Banks & Branches before clearing cheques.
              </OperationNotice>
            )}

            <OperationActions
              saving={saving}
              submitLabel={actionState.action === 'pass' ? 'Clear Cheque' : 'Return Cheque'}
              onCancel={() => setActionState(null)}
              disabled={
                !actionDate
                || (actionState.action === 'pass' ? !bankDetailId : !reason.trim())
              }
            />
          </form>
        </OperationModal>
      )}

      {historyCheque && (
        <OperationModal
          title="Cheque Status History"
          description={`${historyCheque.cheques_no} · ${historyCheque.trans_no}`}
          onClose={() => setHistoryCheque(null)}
          width="max-w-2xl"
        >
          <div className="space-y-4 p-6">
            {historyCheque.history.map((entry, index) => (
              <div key={entry.id} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    entry.to_status === 'passed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : entry.to_status === 'returned'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}>
                    {entry.to_status === 'passed'
                      ? <Check className="h-4 w-4" />
                      : entry.to_status === 'returned'
                        ? <Undo2 className="h-4 w-4" />
                        : <Clock3 className="h-4 w-4" />}
                  </span>
                  {index < historyCheque.history.length - 1 && (
                    <span className="mt-2 h-full min-h-8 w-px bg-slate-200" />
                  )}
                </div>
                <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusPill status={entry.to_status} />
                    <span className="text-xs text-slate-400">
                      {displayDate(entry.action_date)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Processed by <span className="font-semibold text-slate-800">{entry.UID}</span>
                  </div>
                  {entry.bank_account && (
                    <div className="mt-1 text-xs text-slate-500">
                      {entry.bank_account.bank_name} / {entry.bank_account.account_no}
                    </div>
                  )}
                  {entry.reason && (
                    <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {entry.reason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </OperationModal>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function formatTransactionType(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
        active
          ? 'bg-white text-indigo-700 shadow-sm'
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
