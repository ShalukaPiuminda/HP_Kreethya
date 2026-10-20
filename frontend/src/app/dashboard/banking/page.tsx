'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Plus } from 'lucide-react';
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
import { type BankEntry, type FinanceOptions, type FinanceSummary, financeDate, financeMoney, financeToday } from '@/lib/finance';
import { useAuth } from '@/lib/auth-context';
import { SearchSelect } from '@/components/search-select';

export default function BankingPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<BankEntry[]>([]);
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, optionResponse, summaryResponse] = await Promise.all([api.getAll<BankEntry>('/v1/bank-entries'), api.get<FinanceOptions>('/v1/finance/options'), api.get<FinanceSummary>('/v1/finance/summary')]);
      setRows(list.data || []); setOptions(optionResponse.data || null); setSummary(summaryResponse.data || null);
    } catch (error) { setNotice({ type: 'error', text: getApiErrorMessage(error) }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  const deposits = rows.filter((row) => row.entry_type === 'deposit').reduce((sum, row) => sum + Number(row.amount), 0);
  const withdrawals = rows.filter((row) => row.entry_type === 'withdrawal').reduce((sum, row) => sum + Number(row.amount), 0);
  const charges = rows.reduce((sum, row) => sum + Number(row.bank_charges), 0);
  return <div className="space-y-6"><OperationHeader eyebrow="Treasury" title="Banking" description="Record deposits and withdrawals against internal bank accounts, including automatic bank-charge expense posting." icon={Landmark} actions={hasPermission('accounts', 'can_create') ? <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New bank entry</button> : null} />{notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><OperationMetric label="Ledger bank balance" value={financeMoney(summary?.bank_balance)} tone="indigo" /><OperationMetric label="Deposits" value={financeMoney(deposits)} tone="emerald" /><OperationMetric label="Withdrawals" value={financeMoney(withdrawals)} tone="amber" /><OperationMetric label="Bank charges" value={financeMoney(charges)} tone="rose" /></section><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="content-scrollbar overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Entry</th><th className="px-5 py-3">Bank</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Offset account</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Charges</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <LoadingTableRow columns={7} label="Loading bank entries..." /> : rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-400">No bank entries posted.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-5 py-4"><div className="font-semibold">{row.invoice_no}</div><div className="text-xs text-slate-500">{financeDate(row.date)} · {row.description || 'No description'}</div></td><td className="px-5 py-4">{row.bank_account?.bank_name}<div className="text-xs text-slate-500">{row.bank_account?.account_no}</div></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 font-semibold ${row.entry_type === 'deposit' ? 'text-emerald-700' : 'text-amber-700'}`}>{row.entry_type === 'deposit' ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}{row.entry_type}</span></td><td className="px-5 py-4">{row.entry_type === 'deposit' ? row.credit_account?.description : row.debit_account?.description}</td><td className="px-5 py-4 font-semibold">{financeMoney(row.amount)}</td><td className="px-5 py-4">{financeMoney(row.bank_charges)}</td><td className="px-5 py-4"><StatusPill status={row.status} /></td></tr>)}</tbody></table></div></section>{open && options && <BankEntryModal options={options} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setNotice({ type: 'success', text: 'Bank entry posted.' }); load(); }} />}</div>;
}

function BankEntryModal({ options, onClose, onSaved }: { options: FinanceOptions; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(financeToday()); const [bankId, setBankId] = useState(''); const [type, setType] = useState('deposit'); const [offset, setOffset] = useState('1001'); const [amount, setAmount] = useState(''); const [charges, setCharges] = useState('0'); const [description, setDescription] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await api.post('/v1/bank-entries', { date, bank_detail_id: Number(bankId), entry_type: type, offset_account_code: offset, amount: Number(amount), bank_charges: Number(charges || 0), description: description || null }); onSaved(); } catch (submitError) { setError(getApiErrorMessage(submitError)); } finally { setSaving(false); } }
  return <OperationModal title="Post bank entry" onClose={onClose} width="max-w-xl"><form onSubmit={submit} className="space-y-4 p-6">{error && <OperationNotice type="error">{error}</OperationNotice>}<OperationField label="Entry date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationField label="Internal bank account" required><SearchSelect value={bankId} onChange={setBankId} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField><OperationField label="Entry type" required><select value={type} onChange={(event) => setType(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="deposit">Deposit into bank</option><option value="withdrawal">Withdrawal from bank</option></select></OperationField><OperationField label={type === 'deposit' ? 'Credit / source account' : 'Debit / destination account'} required><SearchSelect value={offset} onChange={setOffset} options={options.accounts.filter((item) => item.is_active && item.code !== '1002').map((item) => ({ value: item.code, label: `${item.code} · ${item.description}` }))} placeholder="Select account" searchPlaceholder="Search by code or name..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField><div className="grid gap-4 sm:grid-cols-2"><OperationField label="Amount" required><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationField label="Bank charges"><input type="number" min="0" step="0.01" value={charges} onChange={(event) => setCharges(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField></div><OperationField label="Description"><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationActions saving={saving} submitLabel="Post bank entry" onCancel={onClose} disabled={!bankId || !offset || !amount} /></form></OperationModal>;
}
