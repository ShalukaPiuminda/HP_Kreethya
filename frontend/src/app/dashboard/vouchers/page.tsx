'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Ban, CheckCircle2, Plus } from 'lucide-react';
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
import { type FinanceOptions, type FinanceSummary, type Voucher, financeDate, financeMoney, financeToday } from '@/lib/finance';
import { useAuth } from '@/lib/auth-context';
import { SearchSelect } from '@/components/search-select';

export default function VouchersPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Voucher[]>([]);
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, optionResponse, summaryResponse] = await Promise.all([
        api.get<Voucher[]>(`/v1/vouchers${status ? `?status=${status}` : ''}`),
        api.get<FinanceOptions>('/v1/finance/options'),
        api.get<FinanceSummary>('/v1/finance/summary'),
      ]);
      setRows(list.data || []);
      setOptions(optionResponse.data || null);
      setSummary(summaryResponse.data || null);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function transition(row: Voucher, action: 'post' | 'cancel') {
    const reason = action === 'cancel' ? window.prompt('Cancellation reason') : null;
    if (action === 'cancel' && !reason) return;
    if (action === 'post' && !window.confirm(`Post voucher ${row.invoice_no}? This creates permanent ledger entries.`)) return;
    try {
      await api.post(`/v1/vouchers/${row.id}/${action}`, action === 'cancel' ? { reason } : {});
      setNotice({ type: 'success', text: action === 'post' ? 'Voucher posted.' : 'Voucher cancelled.' });
      load();
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    }
  }

  const draftTotal = rows.filter((row) => row.status === 'draft').reduce((sum, row) => sum + Number(row.amount), 0);
  const postedTotal = rows.filter((row) => row.status === 'posted').reduce((sum, row) => sum + Number(row.amount), 0);

  return <div className="space-y-6">
    <OperationHeader eyebrow="Payment Control" title="Payment Vouchers" description="Prepare payment documents as drafts, review their debit and funding accounts, then post approved entries to the ledger." icon={Banknote} actions={hasPermission('accounts', 'can_create') ? <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New voucher</button> : null} />
    {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}
    <section className="grid gap-4 sm:grid-cols-3"><OperationMetric label="Draft value" value={financeMoney(draftTotal)} tone="amber" /><OperationMetric label="Posted value" value={financeMoney(postedTotal)} tone="emerald" /><OperationMetric label="Draft documents" value={String(summary?.draft_vouchers || 0)} tone="indigo" /></section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">All statuses</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option></select></div><div className="content-scrollbar overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Voucher</th><th className="px-5 py-3">Debit</th><th className="px-5 py-3">Funding</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <LoadingTableRow columns={6} label="Loading vouchers..." /> : rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">No vouchers found.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-5 py-4"><div className="font-semibold">{row.invoice_no}</div><div className="text-xs text-slate-500">{financeDate(row.date)} · {row.description || 'No description'}</div></td><td className="px-5 py-4">{row.drcode} · {row.debit_account?.description}</td><td className="px-5 py-4">{row.payment_method === 'bank' ? row.bank_account?.bank_name : 'Cash in Hand'}</td><td className="px-5 py-4 font-semibold">{financeMoney(row.amount)}</td><td className="px-5 py-4"><StatusPill status={row.status} /></td><td className="px-5 py-4 text-right">{row.status === 'draft' && hasPermission('accounts', 'can_update') && <div className="inline-flex gap-1"><button onClick={() => transition(row, 'post')} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4" /> Post</button><button onClick={() => transition(row, 'cancel')} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Ban className="h-4 w-4" /> Cancel</button></div>}</td></tr>)}</tbody></table></div></section>
    {createOpen && options && <VoucherModal options={options} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); setNotice({ type: 'success', text: 'Draft voucher created.' }); load(); }} />}
  </div>;
}

function VoucherModal({ options, onClose, onSaved }: { options: FinanceOptions; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(financeToday());
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [bankId, setBankId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try { await api.post('/v1/vouchers', { date, debit_account_code: account, amount: Number(amount), payment_method: method, bank_detail_id: bankId ? Number(bankId) : null, description: description || null }); onSaved(); }
    catch (submitError) { setError(getApiErrorMessage(submitError)); } finally { setSaving(false); }
  }
  return <OperationModal title="New payment voucher" description="The document remains a draft until an authorized user posts it." onClose={onClose} width="max-w-xl"><form onSubmit={submit} className="space-y-4 p-6">{error && <OperationNotice type="error">{error}</OperationNotice>}<OperationField label="Voucher date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationField label="Debit account" required><SearchSelect value={account} onChange={setAccount} options={options.accounts.filter((item) => item.is_active && !['1001', '1002'].includes(item.code)).map((item) => ({ value: item.code, label: `${item.code} · ${item.description}` }))} placeholder="Select account" searchPlaceholder="Search by code or name..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField><OperationField label="Amount" required><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationField label="Payment source" required><select value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="cash">Cash in Hand</option><option value="bank">Bank account</option></select></OperationField>{method === 'bank' && <OperationField label="Bank account" required><SearchSelect value={bankId} onChange={setBankId} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>}<OperationField label="Description"><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationActions saving={saving} submitLabel="Create draft" onCancel={onClose} disabled={!account || !amount || (method === 'bank' && !bankId)} /></form></OperationModal>;
}
