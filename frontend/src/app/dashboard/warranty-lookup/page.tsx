'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FilePlus2, LoaderCircle, RotateCcw, ScanSearch, Search, ShieldOff } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { unitKey, type SerialLookupUnit } from '@/lib/warranty';
import { OperationHeader, OperationNotice } from '@/components/operation-ui';
import { CancelWarrantyDialog, restoreWarranty } from '@/components/cancel-warranty-dialog';
import { SerialWarrantyCard } from '@/components/serial-warranty-card';

type LookupMode = 'serial' | 'invoice';

export default function WarrantyLookupPage() {
  return (
    <Suspense fallback={null}>
      <WarrantyLookupWorkspace />
    </Suspense>
  );
}

function claimHref(unit: SerialLookupUnit): string {
  const params = new URLSearchParams({ item: unit.item_code });
  if (unit.item_serial_no) {
    params.set('serial', unit.item_serial_no);
  } else if (unit.warranty?.sale_no) {
    params.set('invoice', unit.warranty.sale_no);
    params.set('line', String(unit.warranty.id));
  }
  return `/dashboard/warranty-claims?${params.toString()}`;
}

function WarrantyLookupWorkspace() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const canCreateClaim = hasPermission('warranty-claims', 'can_create');
  const canCancel = hasPermission('warranty-claims', 'can_update');
  const [cancelUnit, setCancelUnit] = useState<SerialLookupUnit | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const initialInvoice = searchParams.get('invoice');
  const [mode, setMode] = useState<LookupMode>(initialInvoice ? 'invoice' : 'serial');
  const [query, setQuery] = useState(initialInvoice ?? searchParams.get('serial') ?? '');
  const [searched, setSearched] = useState('');
  const [units, setUnits] = useState<SerialLookupUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (value: string, lookupMode: LookupMode) => {
    const code = value.trim();
    if (!code) return;

    setLoading(true);
    setError(null);
    setSearched(code);
    try {
      const path = lookupMode === 'serial' ? 'lookup' : 'invoice';
      const response = await api.get<SerialLookupUnit[]>(`/v1/warranty/${path}/${encodeURIComponent(code)}`);
      setUnits(response.data ?? []);
    } catch (requestError) {
      setUnits([]);
      setError(
        getApiErrorMessage(
          requestError,
          lookupMode === 'serial' ? 'Unable to look up this serial number.' : 'Unable to look up this invoice.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const invoice = searchParams.get('invoice');
    const serial = searchParams.get('serial');
    if (!invoice && !serial) return;
    const timer = window.setTimeout(() => lookup(invoice ?? serial ?? '', invoice ? 'invoice' : 'serial'), 0);
    return () => window.clearTimeout(timer);
  }, [lookup, searchParams]);

  const switchMode = (next: LookupMode) => {
    setMode(next);
    setQuery('');
    setUnits([]);
    setSearched('');
    setError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSuccess(null);
    lookup(query, mode);
  };

  const restoreUnitWarranty = async (unit: SerialLookupUnit) => {
    if (!unit.warranty) return;
    setSaving(true);
    setError(null);
    try {
      await restoreWarranty(unit.warranty.id);
      setSuccess('Warranty restored.');
      await lookup(searched, mode);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to restore the warranty.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Warranty"
        title="Warranty Lookup"
        description="Find warranty by serial number (serialized items) or by sales / HP invoice number (any warranty item), with supplier, customer, history and earlier claims."
        icon={ScanSearch}
      />

      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
              {option === 'serial' ? 'Serial no' : 'Invoice no'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === 'serial' ? 'Scan or type serial number + Enter' : 'Invoice no, HP agreement no or reference no + Enter'}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 font-mono text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            Look up
          </button>
        </div>
      </form>

      {error && <OperationNotice type="error">{error}</OperationNotice>}

      {!loading && !error && searched && units.length === 0 && (
        <OperationNotice type="warning">No records found for {searched}.</OperationNotice>
      )}

      {mode === 'serial' && units.length > 1 && (
        <OperationNotice type="warning">
          Serial {searched} is used by {units.length} different items. Check the item before creating a claim.
        </OperationNotice>
      )}

      {success && <OperationNotice type="success">{success}</OperationNotice>}

      {units.map((unit) => {
        const status = unit.warranty?.status;
        const showClaim = canCreateClaim && status === 'active' && unit.claimable_qty > 0;
        const showCancel = canCancel && (status === 'active' || status === 'in_stock');
        const showRestore = canCancel && status === 'cancelled';

        return (
          <SerialWarrantyCard
            key={unitKey(unit)}
            unit={unit}
            actions={
              showClaim || showCancel || showRestore ? (
                <>
                  {showClaim && (
                    <Link
                      href={claimHref(unit)}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                    >
                      <FilePlus2 className="h-4 w-4" />
                      Create claim
                    </Link>
                  )}
                  {showCancel && (
                    <button
                      type="button"
                      onClick={() => setCancelUnit(unit)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      <ShieldOff className="h-4 w-4" />
                      Cancel warranty
                    </button>
                  )}
                  {showRestore && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => restoreUnitWarranty(unit)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore warranty
                    </button>
                  )}
                </>
              ) : undefined
            }
          />
        );
      })}

      {cancelUnit?.warranty && (
        <CancelWarrantyDialog
          warrantyId={cancelUnit.warranty.id}
          description={`${cancelUnit.item?.item_description ?? cancelUnit.item_code} · ${
            cancelUnit.item_serial_no ? `Serial ${cancelUnit.item_serial_no}` : `Invoice ${cancelUnit.warranty.sale_no ?? '-'}`
          }`}
          isInvoiceLine={!cancelUnit.item_serial_no}
          onClose={() => setCancelUnit(null)}
          onCancelled={async () => {
            setCancelUnit(null);
            setSuccess('Warranty cancelled.');
            await lookup(searched, mode);
          }}
        />
      )}
    </div>
  );
}
