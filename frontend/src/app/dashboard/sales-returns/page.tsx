'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCcw, RotateCcw, Search } from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, parseSerialNumbers } from '@/lib/inventory';
import { dateInputValue, displayDate, numeric } from '@/lib/purchases';
import {
  SalesInvoice,
  SalesReturn,
  SalesReturnReason,
} from '@/lib/sales';
import { SearchSelect } from '@/components/search-select';

interface ReturnLineForm {
  invoice_detail_id: number;
  qty: string;
  serial_numbers: string;
}

export default function SalesReturnsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('sales', 'can_read');
  const canCreate = hasPermission('sales', 'can_create');
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [reasons, setReasons] = useState<SalesReturnReason[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [returnDate, setReturnDate] = useState(dateInputValue());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [lines, setLines] = useState<ReturnLineForm[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [returnResponse, invoiceResponse, reasonResponse] = await Promise.all([
        api.getAll<SalesReturn>('/v1/sales-returns'),
        api.getAll<SalesInvoice>('/v1/sales-invoices'),
        api.getAll<SalesReturnReason>('/v1/sales-return-reasons'),
      ]);
      setReturns(returnResponse.data ?? []);
      setInvoices(invoiceResponse.data ?? []);
      setReasons(reasonResponse.data ?? []);
    } catch (error) {
      setNotice({ type: 'error', message: getApiErrorMessage(error, 'Unable to load sales returns.') });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const selectedInvoice = invoices.find((invoice) => invoice.Invoice_no === invoiceNo);
  const eligibleInvoices = invoices.filter((invoice) => invoice.status !== 'returned');
  const filteredReturns = returns.filter((salesReturn) => {
    const term = search.trim().toLowerCase();
    return !term
      || salesReturn.return_no.toLowerCase().includes(term)
      || salesReturn.invoice_no.toLowerCase().includes(term)
      || salesReturn.customer_nic.toLowerCase().includes(term);
  });

  const returnTotal = useMemo(() => {
    if (!selectedInvoice) return 0;
    return lines.reduce((sum, line) => {
      const detail = selectedInvoice.details.find((item) => item.id === line.invoice_detail_id);
      if (!detail) return sum;
      return sum + numeric(detail.Net_value) / Math.max(1, detail.QTY) * numeric(line.qty);
    }, 0);
  }, [lines, selectedInvoice]);

  const currentOutstanding = numeric(selectedInvoice?.Credite);
  const creditAdjustment = Math.min(returnTotal, currentOutstanding);
  const refundAmount = Math.max(0, returnTotal - creditAdjustment);
  const metrics = {
    returns: returns.length,
    value: returns.reduce((sum, salesReturn) => sum + numeric(salesReturn.net_amount), 0),
    credit: returns.reduce((sum, salesReturn) => sum + numeric(salesReturn.credit_adjustment), 0),
    refunds: returns.reduce((sum, salesReturn) => sum + numeric(salesReturn.refund_amount), 0),
  };

  if (!canRead) {
    return <OperationNotice type="error">You do not have permission to view sales returns.</OperationNotice>;
  }

  const selectInvoice = (value: string) => {
    const invoice = invoices.find((candidate) => candidate.Invoice_no === value);
    setInvoiceNo(value);
    setLines(invoice?.details.map((detail) => ({
      invoice_detail_id: detail.id,
      qty: '0',
      serial_numbers: '',
    })) ?? []);
  };

  const openCreate = () => {
    const invoice = eligibleInvoices[0];
    setReturnDate(dateInputValue());
    setReasonId(reasons[0]?.id.toString() ?? '');
    setRefundMethod('cash');
    selectInvoice(invoice?.Invoice_no ?? '');
    setNotice(null);
    setShowForm(true);
  };

  const updateLine = (detailId: number, field: 'qty' | 'serial_numbers', value: string) => {
    setLines((current) => current.map((line) =>
      line.invoice_detail_id === detailId ? { ...line, [field]: value } : line
    ));
  };

  const submitReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const selectedLines = lines
        .filter((line) => numeric(line.qty) > 0)
        .map((line) => {
          const detail = selectedInvoice?.details.find((item) => item.id === line.invoice_detail_id);
          return {
            invoice_detail_id: line.invoice_detail_id,
            qty: Number(line.qty),
            serial_numbers: detail?.item?.is_serialized
              ? parseSerialNumbers(line.serial_numbers)
              : [],
          };
        });
      await api.post('/v1/sales-returns', {
        return_date: returnDate,
        invoice_no: invoiceNo,
        reason_id: Number(reasonId),
        refund_method: refundMethod,
        items: selectedLines,
      });
      setShowForm(false);
      await loadData();
      setNotice({ type: 'success', message: 'Sales return posted and stock restored successfully.' });
    } catch (error) {
      setNotice({ type: 'error', message: getApiErrorMessage(error, 'Unable to post the sales return.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Sales"
        title="Sales Returns"
        description="Return exact invoice lines, restore their original store batches, reduce customer credit, and separate any cash refund."
        icon={RotateCcw}
        actions={canCreate ? (
          <button type="button" onClick={openCreate} disabled={eligibleInvoices.length === 0 || reasons.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 disabled:bg-slate-300">
            <Plus className="h-4 w-4" /> New Sales Return
          </button>
        ) : undefined}
      />
      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}
      {reasons.length === 0 && !loading && <OperationNotice type="error">Create at least one sales return reason before posting returns.</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Returns" value={metrics.returns.toLocaleString()} tone="indigo" />
        <OperationMetric label="Returned Value" value={formatCurrency(metrics.value)} />
        <OperationMetric label="Credit Reduced" value={formatCurrency(metrics.credit)} tone="emerald" />
        <OperationMetric label="Refunded" value={formatCurrency(metrics.refunds)} tone="amber" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-2 border-b border-slate-200 p-4">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search return, invoice, or NIC" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none" /></div>
          <button type="button" onClick={loadData} className="rounded-xl border border-slate-200 p-2.5 text-slate-500"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3.5">Return</th><th className="px-5 py-3.5">Original Invoice</th><th className="px-5 py-3.5">Reason</th><th className="px-5 py-3.5 text-right">Items</th><th className="px-5 py-3.5 text-right">Credit</th><th className="px-5 py-3.5 text-right">Refund</th><th className="px-5 py-3.5 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={7} label="Loading sales returns..." /> : filteredReturns.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-14 text-center text-slate-400">No sales returns found.</td></tr>
              ) : filteredReturns.map((salesReturn) => (
                <tr key={salesReturn.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4"><div className="font-mono text-xs font-bold text-indigo-700">{salesReturn.return_no}</div><div className="mt-1 text-xs text-slate-500">{displayDate(salesReturn.return_date)}</div></td>
                  <td className="px-5 py-4"><div className="font-mono text-xs font-semibold">{salesReturn.invoice_no}</div><div className="mt-1 text-xs text-slate-400">{salesReturn.invoice?.Customer_Name || salesReturn.customer_nic}</div></td>
                  <td className="px-5 py-4 text-slate-700">{salesReturn.reason?.reason || '-'}</td>
                  <td className="px-5 py-4 text-right font-bold">{salesReturn.details.reduce((sum, line) => sum + line.qty, 0)}</td>
                  <td className="px-5 py-4 text-right text-emerald-700">{formatCurrency(numeric(salesReturn.credit_adjustment))}</td>
                  <td className="px-5 py-4 text-right text-amber-700">{formatCurrency(numeric(salesReturn.refund_amount))}</td>
                  <td className="px-5 py-4 text-right font-bold">{formatCurrency(numeric(salesReturn.net_amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <OperationModal title="New Sales Return" description="Only quantities not previously returned remain selectable." onClose={() => !saving && setShowForm(false)} width="max-w-5xl">
          <form onSubmit={submitReturn} className="space-y-6 p-6">
            {notice?.type === 'error' && <OperationNotice type="error">{notice.message}</OperationNotice>}
            <div className="grid gap-4 md:grid-cols-4">
              <OperationField label="Return Date" required><input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} className={inputClass} required /></OperationField>
              <OperationField label="Invoice" required className="md:col-span-2"><SearchSelect value={invoiceNo} onChange={selectInvoice} options={eligibleInvoices.map((invoice) => ({ value: invoice.Invoice_no, label: invoice.Invoice_no, description: invoice.Customer_Name }))} placeholder="Select invoice" searchPlaceholder="Search by invoice no or customer..." className={inputClass} required /></OperationField>
              <OperationField label="Reason" required><SearchSelect value={reasonId} onChange={setReasonId} options={reasons.map((reason) => ({ value: String(reason.id), label: reason.reason }))} placeholder="Select reason" searchPlaceholder="Search reasons..." className={inputClass} required /></OperationField>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-sm font-bold">Return Lines</h3></div>
              <div className="space-y-3 p-4">
                {selectedInvoice?.details.map((detail) => {
                  const line = lines.find((candidate) => candidate.invoice_detail_id === detail.id);
                  const returned = detail.return_details?.reduce((sum, item) => sum + item.qty, 0) ?? 0;
                  const returnable = detail.QTY - returned;
                  return (
                    <div key={detail.id} className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_140px_180px]">
                      <div><div className="font-mono text-xs font-bold text-indigo-700">{detail.Item_code}</div><div className="mt-1 font-semibold">{detail.Item_description}</div><div className="mt-1 text-xs text-slate-400">{detail.batch_no ? `Batch ${detail.batch_no} · ` : ''}{returnable} of {detail.QTY} returnable</div></div>
                      <OperationField label="Return Qty"><input type="number" min="0" max={returnable} value={line?.qty ?? '0'} onChange={(event) => updateLine(detail.id, 'qty', event.target.value)} className={inputClass} disabled={returnable === 0} /></OperationField>
                      {detail.item?.is_serialized ? <OperationField label="Serial Numbers"><textarea value={line?.serial_numbers ?? ''} onChange={(event) => updateLine(detail.id, 'serial_numbers', event.target.value)} className={inputClass} rows={2} /></OperationField> : <div className="flex items-center justify-end font-bold">{formatCurrency(numeric(detail.Net_value) / Math.max(1, detail.QTY) * numeric(line?.qty))}</div>}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-4">
              <OperationField label="Refund Method"><select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} className={inputClass}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="store_credit">Store credit</option></select></OperationField>
              <OperationMetric label="Return Total" value={formatCurrency(returnTotal)} />
              <OperationMetric label="Credit Adjustment" value={formatCurrency(creditAdjustment)} tone="emerald" />
              <OperationMetric label="Customer Refund" value={formatCurrency(refundAmount)} tone="amber" />
            </div>

            <OperationActions saving={saving} submitLabel="Post Sales Return" onCancel={() => setShowForm(false)} disabled={!invoiceNo || !reasonId || returnTotal <= 0} />
          </form>
        </OperationModal>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100';
