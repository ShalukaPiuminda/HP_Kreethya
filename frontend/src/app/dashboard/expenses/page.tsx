'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Plus } from 'lucide-react';
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
import { type Expense, type FinanceOptions, financeDate, financeMoney, financeToday } from '@/lib/finance';
import { useAuth } from '@/lib/auth-context';
import { SearchSelect } from '@/components/search-select';

export default function ExpensesPage() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Expense[]>([]);
  const [options, setOptions] = useState<FinanceOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, optionResponse] = await Promise.all([api.getAll<Expense>('/v1/expenses'), api.get<FinanceOptions>('/v1/finance/options')]);
      setRows(list.data || []); setOptions(optionResponse.data || null);
    } catch (error) { setNotice({ type: 'error', text: getApiErrorMessage(error) }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  const totals = useMemo(() => ({ total: rows.reduce((sum, row) => sum + Number(row.Expense_Amount), 0), cash: rows.filter((row) => row.payment_method === 'cash').reduce((sum, row) => sum + Number(row.Expense_Amount), 0), bank: rows.filter((row) => row.payment_method === 'bank').reduce((sum, row) => sum + Number(row.Expense_Amount), 0) }), [rows]);
  return <div className="space-y-6"><OperationHeader eyebrow="Operating Costs" title="Expenses" description="Capture branch expenses against the correct ledger account and funding source with immediate double-entry posting." icon={BadgeDollarSign} actions={hasPermission('accounts', 'can_create') ? <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Post expense</button> : null} />{notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}<section className="grid gap-4 sm:grid-cols-3"><OperationMetric label="Total expenses" value={financeMoney(totals.total)} tone="rose" /><OperationMetric label="Paid by cash" value={financeMoney(totals.cash)} tone="amber" /><OperationMetric label="Paid by bank" value={financeMoney(totals.bank)} tone="indigo" /></section><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="content-scrollbar overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Expense</th><th className="px-5 py-3">Account</th><th className="px-5 py-3">Payment source</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <LoadingTableRow columns={5} label="Loading expenses..." /> : rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-14 text-center text-slate-400">No expenses posted.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-5 py-4"><div className="font-semibold">{row.Expense_no}</div><div className="text-xs text-slate-500">{financeDate(row.Expense_date)} · {row.Expense_note || 'No note'}</div></td><td className="px-5 py-4">{row.expense_account_code} · {row.ExpenseType}</td><td className="px-5 py-4 capitalize">{row.payment_method === 'bank' ? row.bank_account?.bank_name : 'Cash in Hand'}</td><td className="px-5 py-4 font-semibold text-rose-700">{financeMoney(row.Expense_Amount)}</td><td className="px-5 py-4"><StatusPill status={row.status} /></td></tr>)}</tbody></table></div></section>{open && options && <ExpenseModal options={options} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setNotice({ type: 'success', text: 'Expense posted.' }); load(); }} />}</div>;
}

function ExpenseModal({ options, onClose, onSaved }: { options: FinanceOptions; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(financeToday()); const [account, setAccount] = useState(''); const [amount, setAmount] = useState(''); const [method, setMethod] = useState('cash'); const [bankId, setBankId] = useState(''); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { await api.post('/v1/expenses', { expense_date: date, expense_account_code: account, amount: Number(amount), payment_method: method, bank_detail_id: bankId ? Number(bankId) : null, note: note || null }); onSaved(); } catch (submitError) { setError(getApiErrorMessage(submitError)); } finally { setSaving(false); } }
  const expenseAccounts = options.accounts.filter((item) => item.is_active && item.type?.category?.name === 'Expenses');
  return <OperationModal title="Post operating expense" onClose={onClose} width="max-w-xl"><form onSubmit={submit} className="space-y-4 p-6">{error && <OperationNotice type="error">{error}</OperationNotice>}<OperationField label="Expense date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationField label="Expense account" required><SearchSelect value={account} onChange={setAccount} options={expenseAccounts.map((item) => ({ value: item.code, label: `${item.code} · ${item.description}` }))} placeholder="Select expense account" searchPlaceholder="Search by code or name..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField><OperationField label="Amount" required><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationField label="Payment source" required><select value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5"><option value="cash">Cash in Hand</option><option value="bank">Bank account</option></select></OperationField>{method === 'bank' && <OperationField label="Bank account" required><SearchSelect value={bankId} onChange={setBankId} options={options.bank_accounts.map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))} placeholder="Select account" searchPlaceholder="Search bank accounts..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5" /></OperationField>}<OperationField label="Expense note"><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5" /></OperationField><OperationActions saving={saving} submitLabel="Post expense" onCancel={onClose} disabled={!account || !amount || (method === 'bank' && !bankId)} /></form></OperationModal>;
}
