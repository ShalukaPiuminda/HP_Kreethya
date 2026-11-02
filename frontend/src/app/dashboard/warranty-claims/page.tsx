'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Eye,
  Handshake,
  LoaderCircle,
  Plus,
  Printer,
  RefreshCcw,
  Repeat,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  ShieldOff,
  Wrench,
} from 'lucide-react';
import { CancelWarrantyDialog, restoreWarranty } from '@/components/cancel-warranty-dialog';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  daysLeftLabel,
  formatDate,
  OPEN_CLAIM_STATUSES,
  unitKey,
  WARRANTY_CLAIM_STATUSES,
  WARRANTY_CLAIM_TRANSITIONS,
  warrantyStatusLabel,
  type SerialLookupUnit,
  type WarrantyClaim,
  type WarrantyClaimStatus,
  type WarrantyClaimSummary,
} from '@/lib/warranty';
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
import { SerialWarrantyCard } from '@/components/serial-warranty-card';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

const initialFilters = { search: '', status: 'open', from: '', to: '' };

type Meta = { current_page: number; last_page: number; total: number };

type LookupMode = 'serial' | 'invoice';

type ClaimPrefill = { mode: LookupMode; query: string; item: string; line: string };

function claimUnitLabel(claim: WarrantyClaim): string {
  return claim.item_serial_no
    ? `Serial ${claim.item_serial_no}`
    : `Invoice ${claim.sale_no ?? '-'} · Qty ${claim.qty}`;
}

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function WarrantyClaimsPage() {
  return (
    <Suspense fallback={null}>
      <WarrantyClaimsWorkspace />
    </Suspense>
  );
}

function WarrantyClaimsWorkspace() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('warranty-claims', 'can_create');
  const canUpdate = hasPermission('warranty-claims', 'can_update');

  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [summary, setSummary] = useState<WarrantyClaimSummary | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<ClaimPrefill | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '25' });
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const [listResponse, summaryResponse] = await Promise.all([
        api.get<WarrantyClaim[]>(`/v1/warranty-claims?${params.toString()}`),
        api.get<WarrantyClaimSummary>('/v1/warranty-claims/summary'),
      ]);
      setClaims(listResponse.data ?? []);
      setMeta(listResponse.meta ?? null);
      setSummary(summaryResponse.data ?? null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load warranty claims.'));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => {
    const timer = window.setTimeout(loadClaims, 0);
    return () => window.clearTimeout(timer);
  }, [loadClaims]);

  // Opened from Serial Lookup's "Create claim" button.
  useEffect(() => {
    const serial = searchParams.get('serial');
    const invoice = searchParams.get('invoice');
    if ((!serial && !invoice) || !canCreate) return;
    const timer = window.setTimeout(() => {
      setCreatePrefill({
        mode: serial ? 'serial' : 'invoice',
        query: serial ?? invoice ?? '',
        item: searchParams.get('item') ?? '',
        line: searchParams.get('line') ?? '',
      });
      setCreateOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canCreate, searchParams]);

  // Opened from a service ticket: /dashboard/warranty-claims?claim=<id>
  useEffect(() => {
    const claimId = Number(searchParams.get('claim'));
    if (!claimId) return;
    const timer = window.setTimeout(() => setSelectedId(claimId), 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Warranty"
        title="Warranty Claims"
        description="Receive faulty units by serial number, check customer and supplier warranty, send to the supplier, and close with repair, replacement or rejection."
        icon={ShieldCheck}
        actions={
          <>
            <button
              type="button"
              onClick={() => loadClaims()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  setCreatePrefill(null);
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                New Claim
              </button>
            )}
          </>
        }
      />

      {error && <OperationNotice type="error">{error}</OperationNotice>}
      {success && <OperationNotice type="success">{success}</OperationNotice>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Open claims" value={String(summary?.open ?? 0)} tone="indigo" />
        <OperationMetric
          label="At supplier"
          value={String(summary?.at_supplier ?? 0)}
          tone="amber"
          help={summary?.overdue_at_supplier ? `${summary.overdue_at_supplier} over 30 days` : undefined}
        />
        <OperationMetric
          label="Ready to hand over"
          value={String(summary?.awaiting_close ?? 0)}
          tone="emerald"
          help="Repaired, replaced or rejected"
        />
        <OperationMetric label="Handed over" value={String(summary?.closed ?? 0)} help={summary?.in_service ? `${summary.in_service} in service` : undefined} />
      </div>

      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5"
      >
        <input
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder="Search claim no, serial, item, customer, invoice..."
          className={`${inputClass} xl:col-span-2`}
        />
        <select
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          className={inputClass}
        >
          <option value="">All statuses</option>
          <option value="open">Open (not resolved)</option>
          {WARRANTY_CLAIM_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>{status.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          className={inputClass}
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          className={inputClass}
          aria-label="To date"
        />
        <div className="flex gap-2 md:col-span-2 xl:col-span-5 xl:justify-end">
          <button type="button" onClick={resetFilters} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Reset
          </button>
          <button type="submit" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Apply Filters
          </button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Claim</th>
                <th className="px-5 py-3">Item / Serial</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Warranty</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={7} label="Loading warranty claims..." />
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-500">
                    No warranty claims found.
                  </td>
                </tr>
              ) : (
                claims.map((claim) => (
                  <tr key={claim.id} className="align-top hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="font-mono text-xs font-semibold text-slate-800">{claim.claim_no}</div>
                      <div className="text-xs text-slate-500">{formatDate(claim.claim_date)}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-slate-800">{claim.item_description ?? claim.item_code}</div>
                      <div className="font-mono text-xs text-indigo-700">{claimUnitLabel(claim)}</div>
                      {(claim.previous_claims_count ?? 0) > 0 && (
                        <span
                          title="This unit has other warranty claims"
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-200"
                        >
                          <Repeat className="h-3 w-3" />
                          Repeat · {(claim.previous_claims_count ?? 0) + 1} claims
                        </span>
                      )}
                      {claim.service_ticket_no && (
                        <div className="mt-1 font-mono text-[10px] text-violet-600">Service {claim.service_ticket_no}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-slate-800">{claim.customer_name ?? '-'}</div>
                      <div className="text-xs text-slate-500">{claim.customer_phone ?? ''}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                          claim.is_within_warranty
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-rose-50 text-rose-700 ring-rose-200'
                        }`}
                      >
                        {claim.is_within_warranty ? 'In warranty' : 'Out of warranty'}
                      </span>
                      {claim.customer_warranty_expiry && (
                        <div className="mt-1 text-xs text-slate-500">Until {formatDate(claim.customer_warranty_expiry)}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <div>{claim.supplier_name ?? claim.supplier_code ?? '-'}</div>
                      {claim.supplier_code && (
                        <div className={`text-xs ${claim.is_supplier_claimable ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {claim.is_supplier_claimable ? 'Supplier warranty valid' : 'Supplier warranty expired'}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <StatusPill status={claim.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedId(claim.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span>Page {meta.current_page} of {meta.last_page} · {meta.total} records</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= meta.last_page}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {createOpen && (
        <NewClaimModal
          prefill={createPrefill}
          onClose={() => setCreateOpen(false)}
          onCreated={async (claim) => {
            setCreateOpen(false);
            setSuccess(`Claim ${claim.claim_no} created for ${claimUnitLabel(claim)}.`);
            setPage(1);
            await loadClaims();
            setSelectedId(claim.id);
            // Intake receipt for the customer when the faulty item is received.
            window.open(`/dashboard/warranty-claims/${claim.id}/print?doc=intake`, '_blank');
          }}
        />
      )}

      {selectedId !== null && (
        <ClaimDetailModal
          claimId={selectedId}
          canUpdate={canUpdate}
          canCreateService={hasPermission('service', 'can_create')}
          canManageWarranty={canUpdate}
          onClose={() => setSelectedId(null)}
          onChanged={(message) => {
            setSuccess(message);
            loadClaims();
          }}
        />
      )}
    </div>
  );
}

function NewClaimModal({
  prefill,
  onClose,
  onCreated,
}: {
  prefill: ClaimPrefill | null;
  onClose: () => void;
  onCreated: (claim: WarrantyClaim) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<LookupMode>(prefill?.mode ?? 'serial');
  const [queryInput, setQueryInput] = useState(prefill?.query ?? '');
  const [units, setUnits] = useState<SerialLookupUnit[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [form, setForm] = useState({
    claim_date: today(),
    qty: '1',
    customer_name: '',
    customer_phone: '',
    fault_description: '',
    accessories_received: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const unit = units.find((candidate) => unitKey(candidate) === selectedKey) ?? null;
  const isLine = Boolean(unit && !unit.is_serialized);
  const openClaim = unit?.is_serialized
    ? unit.claims.find((claim) => OPEN_CLAIM_STATUSES.includes(claim.status))
    : undefined;
  const qty = Number(form.qty);
  const qtyValid = !isLine || (Number.isInteger(qty) && qty >= 1 && qty <= (unit?.claimable_qty ?? 0));

  const applyUnit = useCallback((chosen: SerialLookupUnit | null) => {
    setSelectedKey(chosen ? unitKey(chosen) : '');
    setForm((current) => ({
      ...current,
      qty: '1',
      customer_name: chosen?.warranty?.customer_name ?? '',
      customer_phone: chosen?.warranty?.customer_phone ?? '',
    }));
  }, []);

  const lookup = useCallback(
    async (value: string, lookupMode: LookupMode, preferred?: { item?: string; line?: string }) => {
      const code = value.trim();
      if (!code) return;
      setLooking(true);
      setLookupError(null);
      try {
        const path = lookupMode === 'serial' ? 'lookup' : 'invoice';
        const response = await api.get<SerialLookupUnit[]>(`/v1/warranty-claims/${path}/${encodeURIComponent(code)}`);
        const found = response.data ?? [];
        setUnits(found);
        const chosen =
          found.find((candidate) =>
            preferred?.line
              ? String(candidate.warranty?.id) === preferred.line
              : Boolean(preferred?.item) && candidate.item_code === preferred?.item
          ) ?? (found.length === 1 ? found[0] : null);
        applyUnit(chosen);
      } catch (requestError) {
        setUnits([]);
        applyUnit(null);
        setLookupError(
          getApiErrorMessage(
            requestError,
            lookupMode === 'serial' ? 'Unable to find this serial number.' : 'Unable to find this invoice.'
          )
        );
      } finally {
        setLooking(false);
      }
    },
    [applyUnit]
  );

  useEffect(() => {
    if (!prefill?.query) return;
    const timer = window.setTimeout(
      () => lookup(prefill.query, prefill.mode, { item: prefill.item, line: prefill.line }),
      0
    );
    return () => window.clearTimeout(timer);
  }, [lookup, prefill]);

  const switchMode = (next: LookupMode) => {
    setMode(next);
    setQueryInput('');
    setUnits([]);
    setLookupError(null);
    applyUnit(null);
  };

  const unitOptionLabel = (candidate: SerialLookupUnit) => {
    const name = `${candidate.item_code} · ${candidate.item?.item_description ?? ''}`;
    if (candidate.is_serialized) return `${name} · Serial ${candidate.item_serial_no}`;
    return `${name} · Qty ${candidate.warranty?.qty ?? 0}${candidate.warranty?.batch_no ? ` · Batch ${candidate.warranty.batch_no}` : ''}`;
  };

  const ready = Boolean(
    unit && !openClaim && qtyValid && (!isLine || unit.claimable_qty > 0)
    && form.claim_date && form.fault_description.trim().length >= 3
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!unit || !ready) return;

    setSaving(true);
    setFormError(null);
    try {
      const response = await api.post<WarrantyClaim>('/v1/warranty-claims', {
        claim_date: form.claim_date,
        item_code: unit.item_code,
        item_serial_no: unit.item_serial_no,
        serial_warranty_id: unit.is_serialized ? null : unit.warranty?.id ?? null,
        qty: unit.is_serialized ? 1 : qty,
        customer_code: unit.warranty?.customer_code ?? null,
        customer_name: form.customer_name.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
        fault_description: form.fault_description.trim(),
        accessories_received: form.accessories_received.trim() || null,
        remarks: form.remarks.trim() || null,
      });
      if (!response.data) throw new Error('The server did not return the claim.');
      await onCreated(response.data);
    } catch (requestError) {
      setFormError(getApiErrorMessage(requestError, 'Unable to create the warranty claim.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperationModal
      title="New Warranty Claim"
      description="Find the faulty item by serial number, or by invoice number for items without serials. Warranty status is checked automatically."
      onClose={() => !saving && onClose()}
      width="max-w-4xl"
      icon={ShieldCheck}
    >
      <form onSubmit={submit} className="space-y-5 px-6 py-6">
        {formError && <OperationNotice type="error">{formError}</OperationNotice>}

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(['serial', 'invoice'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => switchMode(option)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === option ? 'bg-slate-950 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {option === 'serial' ? 'By serial no' : 'By invoice no'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                lookup(queryInput, mode);
              }
            }}
            placeholder={mode === 'serial' ? 'Scan or type serial number + Enter' : 'Invoice no, HP agreement no or reference no + Enter'}
            className={`${inputClass} font-mono`}
          />
          <button
            type="button"
            onClick={() => lookup(queryInput, mode)}
            disabled={looking || !queryInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {looking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {mode === 'serial' ? 'Check serial' : 'Find invoice'}
          </button>
        </div>

        {lookupError && <OperationNotice type="error">{lookupError}</OperationNotice>}

        {units.length > 1 && (
          <OperationField
            label={mode === 'serial' ? 'This serial exists on more than one item. Select the item' : 'Select the item being claimed'}
            required
          >
            <select
              value={selectedKey}
              onChange={(event) => applyUnit(units.find((candidate) => unitKey(candidate) === event.target.value) ?? null)}
              className={inputClass}
            >
              <option value="">Select item...</option>
              {units.map((candidate) => (
                <option key={unitKey(candidate)} value={unitKey(candidate)}>
                  {unitOptionLabel(candidate)}
                </option>
              ))}
            </select>
          </OperationField>
        )}

        {unit && (
          <>
            <SerialWarrantyCard unit={unit} compact />

            {openClaim && (
              <OperationNotice type="error">
                This serial already has an open claim ({openClaim.claim_no}). Update that claim instead.
              </OperationNotice>
            )}
            {isLine && unit.claimable_qty <= 0 && (
              <OperationNotice type="error">
                All units on this invoice line are returned or already in an open claim.
              </OperationNotice>
            )}
            {!openClaim && unit.is_serialized && unit.in_stock && (
              <OperationNotice type="warning">
                This unit is currently in your stock, not with a customer. Check the serial before continuing.
              </OperationNotice>
            )}
            {!openClaim && !unit.customer_warranty_valid && (
              <OperationNotice type="warning">
                This unit is not within customer warranty
                {unit.customer_days_left !== null ? ` (${daysLeftLabel(unit.customer_days_left).toLowerCase()})` : ''}.
                You can still record the claim, then reject it or handle it as a paid service.
              </OperationNotice>
            )}

            <div className={`grid gap-4 ${isLine ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              <OperationField label="Claim date" required>
                <input
                  type="date"
                  value={form.claim_date}
                  onChange={(event) => setForm({ ...form, claim_date: event.target.value })}
                  className={inputClass}
                />
              </OperationField>
              {isLine && (
                <OperationField label="Faulty qty" required help={`Up to ${unit.claimable_qty}`}>
                  <input
                    type="number"
                    min="1"
                    max={unit.claimable_qty}
                    step="1"
                    value={form.qty}
                    onChange={(event) => setForm({ ...form, qty: event.target.value })}
                    className={`${inputClass} ${qtyValid ? '' : 'border-rose-400'}`}
                  />
                </OperationField>
              )}
              <OperationField label="Customer name">
                <input
                  value={form.customer_name}
                  onChange={(event) => setForm({ ...form, customer_name: event.target.value })}
                  className={inputClass}
                />
              </OperationField>
              <OperationField label="Customer phone">
                <input
                  value={form.customer_phone}
                  onChange={(event) => setForm({ ...form, customer_phone: event.target.value })}
                  className={inputClass}
                />
              </OperationField>
            </div>
            <OperationField label="Fault description" required>
              <textarea
                rows={3}
                value={form.fault_description}
                onChange={(event) => setForm({ ...form, fault_description: event.target.value })}
                placeholder="What is wrong with the unit, as reported by the customer"
                className={inputClass}
              />
            </OperationField>
            <div className="grid gap-4 sm:grid-cols-2">
              <OperationField label="Accessories received">
                <input
                  value={form.accessories_received}
                  onChange={(event) => setForm({ ...form, accessories_received: event.target.value })}
                  placeholder="e.g. Charger, box, remote"
                  className={inputClass}
                />
              </OperationField>
              <OperationField label="Remarks">
                <input
                  value={form.remarks}
                  onChange={(event) => setForm({ ...form, remarks: event.target.value })}
                  className={inputClass}
                />
              </OperationField>
            </div>
          </>
        )}

        <OperationActions saving={saving} disabled={!ready} onCancel={onClose} submitLabel="Create Claim" />
      </form>
    </OperationModal>
  );
}

type ReplacementOptions = {
  stores: { id: number; name: string }[];
  is_batch: boolean;
  is_serialized: boolean;
  qty: number;
  store_qty: { store_id: number; qty_in_hand: number }[];
  available_serials: { serial_no: string; store_id: number; store_name: string }[];
  batches: { batch_no: string; store_id: number; qty_in_hand: number }[];
};

const ACTION_LABELS: Record<WarrantyClaimStatus, string> = {
  received: 'Received',
  sent_to_supplier: 'Send to supplier',
  returned_from_supplier: 'Received back from supplier',
  in_service: 'Send to Service',
  repaired: 'Mark repaired',
  replaced: 'Replace unit',
  rejected: 'Reject claim',
  closed: 'Hand over to customer',
  cancelled: 'Cancel claim',
};

function ClaimDetailModal({
  claimId,
  canUpdate,
  canCreateService,
  canManageWarranty,
  onClose,
  onChanged,
}: {
  claimId: number;
  canUpdate: boolean;
  canCreateService: boolean;
  canManageWarranty: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [customerOptions, setCustomerOptions] = useState<{ Code: string; name: string; NIC: string }[] | null>(null);
  const [serviceCustomer, setServiceCustomer] = useState('');
  const [handover, setHandover] = useState({ to: '', nic: '', note: '' });
  const [cancelWarrantyOpen, setCancelWarrantyOpen] = useState(false);
  const [claim, setClaim] = useState<WarrantyClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<WarrantyClaimStatus | null>(null);
  const [actionForm, setActionForm] = useState({
    action_date: today(),
    supplier_ref_no: '',
    store_id: '',
    replacement_serial_no: '',
    batch_no: '',
    receive_faulty: true,
    note: '',
  });
  const [options, setOptions] = useState<ReplacementOptions | null>(null);
  const [saving, setSaving] = useState(false);

  const loadClaim = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<WarrantyClaim>(`/v1/warranty-claims/${claimId}`);
      setClaim(response.data ?? null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to load the claim.'));
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    const timer = window.setTimeout(loadClaim, 0);
    return () => window.clearTimeout(timer);
  }, [loadClaim]);

  const startAction = async (next: WarrantyClaimStatus) => {
    setAction(next);
    setError(null);
    setActionForm({
      action_date: today(),
      supplier_ref_no: claim?.supplier_ref_no ?? '',
      store_id: '',
      replacement_serial_no: '',
      batch_no: '',
      receive_faulty: true,
      note: '',
    });
    setHandover({ to: claim?.customer_name ?? '', nic: '', note: '' });
    setServiceCustomer(claim?.customer_code ?? '');

    // A service ticket needs a customer from the master; load the list only when missing.
    if (next === 'in_service' && !claim?.customer_code && !customerOptions) {
      try {
        const response = await api.get<{ customers: { Code: string; name: string; NIC: string }[] }>('/v1/service-tickets/options');
        setCustomerOptions(response.data?.customers ?? []);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, 'Unable to load customers.'));
      }
    }

    if (next === 'replaced' && !options) {
      try {
        const response = await api.get<ReplacementOptions>(`/v1/warranty-claims/${claimId}/replacement-options`);
        setOptions(response.data ?? null);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, 'Unable to load replacement stock.'));
      }
    }
  };

  const storeSerials = useMemo(
    () => options?.available_serials.filter((serial) => String(serial.store_id) === actionForm.store_id) ?? [],
    [actionForm.store_id, options]
  );
  const storeBatches = useMemo(
    () => options?.batches.filter((batch) => String(batch.store_id) === actionForm.store_id) ?? [],
    [actionForm.store_id, options]
  );

  const actionReady =
    action !== null &&
    (action !== 'replaced' ||
      (options !== null &&
        actionForm.store_id !== '' &&
        (!options.is_serialized || actionForm.replacement_serial_no.trim() !== '') &&
        (!options.is_batch || actionForm.batch_no !== ''))) &&
    (action !== 'in_service' || serviceCustomer !== '') &&
    (action !== 'closed' || handover.to.trim().length >= 2) &&
    (action !== 'cancelled' || actionForm.note.trim().length >= 3);

  const storeQty =
    options?.store_qty.find((store) => String(store.store_id) === actionForm.store_id)?.qty_in_hand ?? 0;

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!claim || !action || !actionReady) return;

    setSaving(true);
    setError(null);
    try {
      const response = action === 'in_service'
        ? await api.post<WarrantyClaim>(`/v1/warranty-claims/${claim.id}/send-to-service`, {
            customer_code: serviceCustomer || null,
            action_date: actionForm.action_date || null,
            note: actionForm.note.trim() || null,
          })
        : await api.post<WarrantyClaim>(`/v1/warranty-claims/${claim.id}/status`, {
            status: action,
            action_date: actionForm.action_date || null,
            supplier_ref_no: actionForm.supplier_ref_no.trim() || null,
            store_id: action === 'replaced' ? Number(actionForm.store_id) : null,
            replacement_serial_no: action === 'replaced' ? actionForm.replacement_serial_no.trim() || null : null,
            batch_no: action === 'replaced' && options?.is_batch ? actionForm.batch_no : null,
            receive_faulty: actionForm.receive_faulty,
            note: actionForm.note.trim() || null,
            handed_over_at: action === 'closed' ? actionForm.action_date || null : null,
            handed_over_to: action === 'closed' ? handover.to.trim() : null,
            handed_over_nic: action === 'closed' ? handover.nic.trim() || null : null,
            handover_note: action === 'closed' ? handover.note.trim() || null : null,
          });
      setClaim(response.data ?? null);
      setAction(null);
      setOptions(null);
      onChanged(
        action === 'in_service'
          ? `Claim ${claim.claim_no} sent to service as ticket ${response.data?.service_ticket_no ?? ''}.`
          : `Claim ${claim.claim_no}: ${warrantyStatusLabel(action).toLowerCase()}.`
      );
      if (action === 'closed') {
        window.open(`/dashboard/warranty-claims/${claim.id}/print?doc=handover`, '_blank');
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to update the claim.'));
    } finally {
      setSaving(false);
    }
  };

  const nextStatuses = claim
    ? WARRANTY_CLAIM_TRANSITIONS[claim.status].filter(
        (status) =>
          (status !== 'sent_to_supplier' || Boolean(claim.supplier_code))
          && (status !== 'in_service' || canCreateService)
      )
    : [];

  const restoreClaimWarranty = async () => {
    if (!claim?.serial_warranty) return;
    setSaving(true);
    setError(null);
    try {
      await restoreWarranty(claim.serial_warranty.id);
      await loadClaim();
      onChanged('Warranty restored.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to restore the warranty.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperationModal
      title={claim ? `Claim ${claim.claim_no}` : 'Warranty Claim'}
      description={claim ? `${claim.item?.item_description ?? claim.item_code} · ${claimUnitLabel(claim)}` : undefined}
      onClose={() => !saving && onClose()}
      width="max-w-4xl"
      icon={ShieldCheck}
    >
      <div className="space-y-5 px-6 py-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}

        {loading || !claim ? (
          <div className="py-12 text-center text-slate-400">
            <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600" />
            Loading claim...
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={claim.status} />
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                  claim.is_within_warranty
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-rose-50 text-rose-700 ring-rose-200'
                }`}
              >
                {claim.is_within_warranty ? 'In customer warranty' : 'Out of customer warranty'}
              </span>
              {claim.supplier_code && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                    claim.is_supplier_claimable
                      ? 'bg-violet-50 text-violet-700 ring-violet-200'
                      : 'bg-slate-100 text-slate-600 ring-slate-200'
                  }`}
                >
                  {claim.is_supplier_claimable ? 'Claimable from supplier' : 'Supplier warranty expired'}
                </span>
              )}
              {claim.serial_warranty?.status === 'cancelled' && (
                <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                  Warranty cancelled
                </span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <a
                  href={`/dashboard/warranty-claims/${claim.id}/print?doc=intake`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Intake receipt
                </a>
                {claim.status === 'closed' && (
                  <a
                    href={`/dashboard/warranty-claims/${claim.id}/print?doc=handover`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Handover receipt
                  </a>
                )}
                {canManageWarranty && claim.serial_warranty?.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => setCancelWarrantyOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Cancel warranty
                  </button>
                )}
                {canManageWarranty && claim.serial_warranty?.status === 'cancelled' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void restoreClaimWarranty()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore warranty
                  </button>
                )}
              </div>
            </div>

            {claim.service_ticket_no && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                <Wrench className="h-4 w-4" />
                <span>
                  Service ticket{' '}
                  <Link href={`/dashboard/service?ticket=${encodeURIComponent(claim.service_ticket_no)}`} className="font-mono font-semibold underline">
                    {claim.service_ticket_no}
                  </Link>
                  {claim.service_ticket ? ` · ${claim.service_ticket.status.replaceAll('_', ' ')}` : ''}
                  {claim.service_ticket?.is_warranty === false ? ' · paid repair' : ' · free warranty repair'}
                </span>
              </div>
            )}

            {claim.status === 'cancelled' && claim.cancel_reason && (
              <OperationNotice type="error">Claim cancelled: {claim.cancel_reason}</OperationNotice>
            )}

            {claim.handed_over_at && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="flex items-center gap-2 font-bold"><Handshake className="h-4 w-4" /> Handed over to {claim.handed_over_to}</p>
                <p className="mt-1 text-xs">
                  {new Date(claim.handed_over_at).toLocaleString('en-LK')}
                  {claim.handed_over_nic ? ` · NIC ${claim.handed_over_nic}` : ''}
                  {claim.handed_over_by ? ` · by ${claim.handed_over_by}` : ''}
                </p>
                {claim.handover_note && <p className="mt-1">{claim.handover_note}</p>}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <dl className="space-y-1.5 rounded-2xl border border-slate-200 p-4 text-sm">
                <DetailRow label="Claim date" value={formatDate(claim.claim_date)} />
                <DetailRow label="Customer" value={claim.customer_name} />
                <DetailRow label="Phone" value={claim.customer_phone} />
                <DetailRow label="Sale invoice" value={claim.sale_no} mono />
                <DetailRow label="Warranty until" value={claim.customer_warranty_expiry && formatDate(claim.customer_warranty_expiry)} />
                <DetailRow label="Accessories" value={claim.accessories_received} />
              </dl>
              <dl className="space-y-1.5 rounded-2xl border border-slate-200 p-4 text-sm">
                <DetailRow label="Supplier" value={claim.supplier?.name ?? claim.supplier_code} />
                <DetailRow label="Supplier ref" value={claim.supplier_ref_no} mono />
                <DetailRow label="Sent" value={claim.sent_date && formatDate(claim.sent_date)} />
                <DetailRow label="Returned" value={claim.returned_date && formatDate(claim.returned_date)} />
                <DetailRow label="Resolution" value={claim.resolution && warrantyStatusLabel(claim.resolution)} />
                <DetailRow label="Replacement serial" value={claim.replacement_serial_no} mono />
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fault</p>
              <p className="mt-1 whitespace-pre-line text-slate-800">{claim.fault_description}</p>
              {claim.remarks && (
                <>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Remarks</p>
                  <p className="mt-1 whitespace-pre-line text-slate-700">{claim.remarks}</p>
                </>
              )}
              {claim.item?.warranty_terms && (
                <>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty terms</p>
                  <p className="mt-1 whitespace-pre-line text-slate-600">{claim.item.warranty_terms}</p>
                </>
              )}
            </div>

            {(claim.previous_claims?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Other claims on this unit ({claim.previous_claims?.length})
                </p>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {claim.previous_claims?.map((previous) => (
                    <li key={previous.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-slate-700">{previous.claim_no}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {formatDate(previous.claim_date)}
                          {claim.item_serial_no ? '' : ` · Qty ${previous.qty}`}
                        </span>
                        <p className="truncate text-slate-600">{previous.fault_description}</p>
                      </div>
                      <StatusPill status={previous.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canUpdate && nextStatuses.length > 0 && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700">Next step</p>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => startAction(status)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        action === status
                          ? 'bg-indigo-600 text-white'
                          : status === 'rejected'
                            ? 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:text-indigo-700'
                      }`}
                    >
                      {ACTION_LABELS[status]}
                    </button>
                  ))}
                </div>

                {action && (
                  <form onSubmit={submitAction} className="mt-4 space-y-4">
                    {(action === 'sent_to_supplier' || action === 'returned_from_supplier') && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <OperationField label={action === 'sent_to_supplier' ? 'Sent date' : 'Returned date'}>
                          <input
                            type="date"
                            value={actionForm.action_date}
                            onChange={(event) => setActionForm({ ...actionForm, action_date: event.target.value })}
                            className={inputClass}
                          />
                        </OperationField>
                        <OperationField label="Supplier reference no">
                          <input
                            value={actionForm.supplier_ref_no}
                            onChange={(event) => setActionForm({ ...actionForm, supplier_ref_no: event.target.value })}
                            placeholder="RMA / job number"
                            className={inputClass}
                          />
                        </OperationField>
                      </div>
                    )}

                    {action === 'replaced' && (
                      <div className="space-y-4">
                        {!options ? (
                          <div className="text-sm text-slate-500">
                            <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />
                            Loading stock...
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-3">
                              <OperationField label="Issue from store" required>
                                <select
                                  value={actionForm.store_id}
                                  onChange={(event) =>
                                    setActionForm({
                                      ...actionForm,
                                      store_id: event.target.value,
                                      replacement_serial_no: '',
                                      batch_no: '',
                                    })
                                  }
                                  className={inputClass}
                                >
                                  <option value="">Select store...</option>
                                  {options.stores.map((store) => (
                                    <option key={store.id} value={store.id}>{store.name}</option>
                                  ))}
                                </select>
                              </OperationField>
                              {options.is_batch && (
                                <OperationField label="Batch" required>
                                  <select
                                    value={actionForm.batch_no}
                                    onChange={(event) => setActionForm({ ...actionForm, batch_no: event.target.value })}
                                    className={inputClass}
                                    disabled={!actionForm.store_id}
                                  >
                                    <option value="">Select batch...</option>
                                    {storeBatches.map((batch) => (
                                      <option key={batch.batch_no} value={batch.batch_no}>
                                        {batch.batch_no} ({batch.qty_in_hand} in hand)
                                      </option>
                                    ))}
                                  </select>
                                </OperationField>
                              )}
                              {options.is_serialized ? (
                                <OperationField
                                  label="Replacement serial"
                                  required
                                  help={actionForm.store_id ? `${storeSerials.length} serial(s) in this store` : undefined}
                                >
                                  <select
                                    value={actionForm.replacement_serial_no}
                                    onChange={(event) =>
                                      setActionForm({ ...actionForm, replacement_serial_no: event.target.value })
                                    }
                                    className={`${inputClass} font-mono`}
                                    disabled={!actionForm.store_id}
                                  >
                                    <option value="">Select serial...</option>
                                    {storeSerials.map((serial) => (
                                      <option key={serial.serial_no} value={serial.serial_no}>{serial.serial_no}</option>
                                    ))}
                                  </select>
                                </OperationField>
                              ) : (
                                <OperationField label="Replacement qty">
                                  <div className={`${inputClass} bg-slate-50`}>
                                    {options.qty}
                                    {actionForm.store_id && !options.is_batch && (
                                      <span className="ml-2 text-xs text-slate-500">({storeQty} in this store)</span>
                                    )}
                                  </div>
                                </OperationField>
                              )}
                            </div>
                            <label className="flex items-start gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={actionForm.receive_faulty}
                                onChange={(event) => setActionForm({ ...actionForm, receive_faulty: event.target.checked })}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300"
                              />
                              <span>
                                Take the faulty {claim.item_serial_no ? `unit (${claim.item_serial_no})` : `unit(s) (qty ${claim.qty})`} into this store&apos;s stock, so it can be
                                returned to the supplier or written off later.
                              </span>
                            </label>
                            <OperationNotice type="warning">
                              {options.is_serialized
                                ? 'The customer warranty moves to the replacement serial with the same expiry date.'
                                : `${options.qty} replacement unit(s) will be issued from stock. The customer keeps the same warranty expiry date.`}
                            </OperationNotice>
                          </>
                        )}
                      </div>
                    )}

                    {action === 'in_service' && (
                      <div className="space-y-3">
                        <OperationNotice type={claim.is_within_warranty ? 'success' : 'warning'}>
                          {claim.is_within_warranty
                            ? 'A free warranty service ticket will be opened. No payment is taken from the customer.'
                            : 'Out of warranty: the service ticket will be billed to the customer.'}
                        </OperationNotice>
                        {!claim.customer_code && (
                          <OperationField label="Customer for the service ticket" required>
                            <select
                              value={serviceCustomer}
                              onChange={(event) => setServiceCustomer(event.target.value)}
                              className={inputClass}
                            >
                              <option value="">Select customer...</option>
                              {customerOptions?.map((customer) => (
                                <option key={customer.Code} value={customer.Code}>
                                  {customer.Code} · {customer.name} · {customer.NIC}
                                </option>
                              ))}
                            </select>
                          </OperationField>
                        )}
                      </div>
                    )}

                    {action === 'closed' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <OperationField label="Handover date">
                          <input
                            type="date"
                            value={actionForm.action_date}
                            onChange={(event) => setActionForm({ ...actionForm, action_date: event.target.value })}
                            className={inputClass}
                          />
                        </OperationField>
                        <OperationField label="Received by (name)" required>
                          <input
                            value={handover.to}
                            onChange={(event) => setHandover({ ...handover, to: event.target.value })}
                            className={inputClass}
                          />
                        </OperationField>
                        <OperationField label="NIC">
                          <input
                            value={handover.nic}
                            onChange={(event) => setHandover({ ...handover, nic: event.target.value })}
                            className={inputClass}
                          />
                        </OperationField>
                        <OperationField label="Handover note">
                          <input
                            value={handover.note}
                            onChange={(event) => setHandover({ ...handover, note: event.target.value })}
                            placeholder="Accessories returned, condition..."
                            className={inputClass}
                          />
                        </OperationField>
                      </div>
                    )}

                    <OperationField label={action === 'cancelled' ? 'Reason for cancelling' : 'Note'} required={action === 'cancelled'}>
                      <input
                        value={actionForm.note}
                        onChange={(event) => setActionForm({ ...actionForm, note: event.target.value })}
                        placeholder={
                          action === 'rejected'
                            ? 'Reason for rejection'
                            : action === 'cancelled'
                              ? 'e.g. Customer withdrew the claim'
                              : 'Optional note for the history'
                        }
                        className={inputClass}
                      />
                    </OperationField>

                    <OperationActions
                      saving={saving}
                      disabled={!actionReady}
                      onCancel={() => setAction(null)}
                      submitLabel={ACTION_LABELS[action]}
                    />
                  </form>
                )}
              </div>
            )}

            {claim.logs && claim.logs.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</p>
                <ol className="relative space-y-3 border-l border-slate-200 pl-5">
                  {claim.logs.map((log) => (
                    <li key={log.id} className="relative">
                      <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                      <div className="text-sm font-semibold text-slate-900">{warrantyStatusLabel(log.to_status)}</div>
                      <p className="text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString('en-LK')} · {log.UID}
                      </p>
                      {log.note && <p className="mt-0.5 text-sm text-slate-600">{log.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {cancelWarrantyOpen && claim.serial_warranty && (
              <CancelWarrantyDialog
                warrantyId={claim.serial_warranty.id}
                description={`${claim.item?.item_description ?? claim.item_code} · ${claimUnitLabel(claim)}`}
                isInvoiceLine={!claim.item_serial_no}
                onClose={() => setCancelWarrantyOpen(false)}
                onCancelled={async () => {
                  setCancelWarrantyOpen(false);
                  await loadClaim();
                  onChanged('Warranty cancelled.');
                }}
              />
            )}
          </>
        )}
      </div>
    </OperationModal>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value || '-'}</dd>
    </div>
  );
}
