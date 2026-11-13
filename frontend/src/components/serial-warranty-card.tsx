'use client';

import { PackageCheck, ShieldAlert, ShieldCheck, ShieldOff, ShoppingCart, Truck, Wrench } from 'lucide-react';
import { StatusPill } from '@/components/operation-ui';
import {
  daysLeftLabel,
  formatDate,
  formatPeriod,
  SERIAL_TRANS_LABELS,
  type SerialLookupUnit,
} from '@/lib/warranty';

function WarrantyBadge({
  label,
  valid,
  expiry,
  daysLeft,
  missingText,
}: {
  label: string;
  valid: boolean;
  expiry: string | null | undefined;
  daysLeft: number | null;
  missingText: string;
}) {
  if (!expiry) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{missingText}</p>
        </div>
      </div>
    );
  }

  const Icon = valid ? ShieldCheck : ShieldAlert;

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 ${
        valid ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${valid ? 'text-emerald-600' : 'text-rose-600'}`} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-1 text-sm font-bold">{valid ? 'Within warranty' : 'Not covered'}</p>
        <p className="mt-0.5 text-xs opacity-80">
          Until {formatDate(expiry)}
          {daysLeft !== null ? ` · ${daysLeftLabel(daysLeft)}` : ''}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value || '-'}</span>
    </div>
  );
}

/**
 * Everything known about one serial unit: warranty validity, purchase and sale details,
 * movement timeline and earlier claims. Shared by Serial Lookup and the claim form.
 */
export function SerialWarrantyCard({
  unit,
  compact = false,
  actions,
}: {
  unit: SerialLookupUnit;
  compact?: boolean;
  actions?: React.ReactNode;
}) {
  const warranty = unit.warranty;
  const voided = warranty?.status === 'void';
  const returned = warranty?.status === 'returned';
  const notWarranted = !unit.item?.has_warranty && !warranty;
  const isLine = !unit.is_serialized;
  const heldQty = warranty ? warranty.qty - warranty.returned_qty : 0;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs font-bold text-indigo-700">{unit.item_code}</p>
          <h3 className="text-lg font-bold text-slate-950">{unit.item?.item_description ?? 'Unknown item'}</h3>
          {isLine ? (
            <p className="mt-0.5 text-sm text-slate-500">
              Non-serialized · Qty {warranty?.qty ?? 0}
              {warranty?.returned_qty ? ` (${warranty.returned_qty} returned)` : ''}
              {warranty?.batch_no ? ` · Batch ${warranty.batch_no}` : ''}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-500">
              Serial <span className="font-mono font-semibold text-slate-800">{unit.item_serial_no}</span>
              {' · '}
              {unit.in_stock ? `In stock${unit.current_store_name ? ` at ${unit.current_store_name}` : ''}` : 'Not in stock'}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {notWarranted ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This item is not set up with warranty in the item master.
        </div>
      ) : warranty?.status === 'cancelled' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="flex items-center gap-2 font-bold">
            <ShieldOff className="h-4 w-4" /> Warranty cancelled
          </p>
          <p className="mt-1">{warranty.cancel_reason}</p>
          <p className="mt-1 text-xs opacity-75">
            By {warranty.cancelled_by ?? '-'}
            {warranty.cancelled_at ? ` on ${formatDate(warranty.cancelled_at)}` : ''}
            {warranty.customer_warranty_expiry ? ` · was valid until ${formatDate(warranty.customer_warranty_expiry)}` : ''}
          </p>
        </div>
      ) : voided ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          This unit&apos;s warranty was voided (it was replaced under a warranty claim).
        </div>
      ) : returned || (isLine && heldQty <= 0) ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          All units on this invoice line were returned, so there is no warranty left on it.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <WarrantyBadge
            label="Customer warranty"
            valid={unit.customer_warranty_valid}
            expiry={warranty?.customer_warranty_expiry}
            daysLeft={unit.customer_days_left}
            missingText={unit.in_stock ? 'Not sold yet' : 'No sale on record'}
          />
          <WarrantyBadge
            label="Supplier warranty"
            valid={unit.supplier_warranty_valid}
            expiry={warranty?.supplier_warranty_expiry}
            daysLeft={unit.supplier_days_left}
            missingText="No supplier warranty"
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <ShoppingCart className="h-3.5 w-3.5" /> Sale
          </p>
          <InfoRow label="Customer" value={warranty?.customer_name} />
          <InfoRow label="Phone" value={warranty?.customer_phone} />
          <InfoRow
            label={warranty?.sale_type === 'HP' ? 'HP invoice' : 'Invoice'}
            value={warranty?.sale_no && <span className="font-mono text-xs">{warranty.sale_no}</span>}
          />
          <InfoRow label="Sale date" value={warranty?.sale_date && formatDate(warranty.sale_date)} />
          <InfoRow label="Period" value={warranty?.warranty_period && formatPeriod(warranty.warranty_period, warranty.warranty_unit)} />
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Truck className="h-3.5 w-3.5" /> Purchase
          </p>
          <InfoRow label="Supplier" value={unit.supplier_name ?? warranty?.supplier_code} />
          <InfoRow label="GRN" value={warranty?.grn_no && <span className="font-mono text-xs">{warranty.grn_no}</span>} />
          <InfoRow label="GRN date" value={warranty?.grn_date && formatDate(warranty.grn_date)} />
          <InfoRow
            label="Period"
            value={warranty?.supplier_warranty_period && formatPeriod(warranty.supplier_warranty_period, warranty.supplier_warranty_unit)}
          />
        </div>
      </div>

      {unit.item?.warranty_terms && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty terms</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{unit.item.warranty_terms}</p>
        </div>
      )}

      {unit.claims.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Previous claims ({unit.claims.length})
          </p>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {unit.claims.map((claim) => (
              <li key={claim.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-slate-700">{claim.claim_no}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {formatDate(claim.claim_date)}
                    {isLine ? ` · Qty ${claim.qty}` : ''}
                  </span>
                  <p className="truncate text-slate-600">{claim.fault_description}</p>
                </div>
                <StatusPill status={claim.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {(unit.service_tickets?.length ?? 0) > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Wrench className="h-3.5 w-3.5" /> Service history ({unit.service_tickets?.length})
          </p>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {unit.service_tickets?.map((ticket) => (
              <li key={ticket.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-slate-700">{ticket.ticket_no}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {formatDate(ticket.return_date)}
                    {ticket.is_warranty ? ' · Warranty' : ' · Paid repair'}
                  </span>
                  <p className="truncate text-slate-600">{ticket.problem_description}</p>
                </div>
                <StatusPill status={ticket.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && unit.movements.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <PackageCheck className="h-3.5 w-3.5" /> Serial history
          </p>
          <ol className="relative space-y-3 border-l border-slate-200 pl-5">
            {unit.movements.map((movement, index) => (
              <li key={`${movement.trans_no}-${movement.trans_code}-${index}`} className="relative">
                <span
                  className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                    movement.qty_in > 0 ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-slate-900">
                    {SERIAL_TRANS_LABELS[movement.trans_code] ?? movement.trans_code}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{movement.trans_no}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {formatDate(movement.date)} · {movement.qty_in > 0 ? 'In to' : 'Out of'}{' '}
                  {movement.store_name ?? `store #${movement.store_id}`}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
