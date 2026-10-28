'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ClipboardCheck,
  FileSearch,
  Gavel,
  History,
  PackageCheck,
  Printer,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldX,
  Wrench,
} from 'lucide-react';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { ScanInput } from '@/components/scan-input';
import { SearchSelect } from '@/components/search-select';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { StockItem, Store } from '@/lib/inventory';
import { dateInputValue, displayDate } from '@/lib/purchases';
import {
  CUSTODY_STATUSES,
  RESOLUTION_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  type WarrantyCandidate,
  type WarrantyClaim,
  type WarrantyClaimDetail,
  type WarrantyClaimStatus,
  type WarrantyHistory,
  type WarrantyResolution,
  type WarrantyServiceTicket,
} from '@/lib/warranty';

type StatusTab = 'all' | 'received' | 'in_repair' | 'ready_for_pickup' | 'delivered' | 'closed';

const STATUS_TABS: Array<{ key: StatusTab; label: string; statuses: WarrantyClaimStatus[] | null }> = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'received', label: 'Received', statuses: ['received'] },
  { key: 'in_repair', label: 'In repair', statuses: ['in_repair'] },
  { key: 'ready_for_pickup', label: 'Ready for pickup', statuses: ['ready_for_pickup'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered'] },
  { key: 'closed', label: 'Refunded / Rejected', statuses: ['refunded', 'rejected'] },
];

type Modal =
  | { kind: 'receive'; candidate: WarrantyCandidate }
  | { kind: 'decide'; claim: WarrantyClaim }
  | { kind: 'handover'; claim: WarrantyClaim }
  | { kind: 'reject'; claim: WarrantyClaim }
  | { kind: 'detail'; claimId: number }
  | { kind: 'history'; candidate: WarrantyCandidate }
  | null;

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100';

function ordinal(value: number) {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? 'st'
    : value % 10 === 2 && value % 100 !== 12 ? 'nd'
      : value % 10 === 3 && value % 100 !== 13 ? 'rd'
        : 'th';
  return `${value}${suffix}`;
}

function candidateKey(candidate: WarrantyCandidate) {
  return `${candidate.source_type}-${candidate.source_detail_id}-${candidate.item_serial_no ?? ''}`;
}

function saleLabel(row: { source_type: string; agreement_no: string | null; invoice_no: string }) {
  return row.source_type === 'hp' ? `HP ${row.agreement_no ?? row.invoice_no}` : row.invoice_no;
}

/** Opens the print tab before an await so the browser does not block it as a popup. */
function openPendingPrintWindow() {
  if (typeof window === 'undefined') return null;
  return window.open('', '_blank');
}

function printUrl(claimId: number, doc: 'receipt' | 'handover') {
  return `/dashboard/warranty-claims/${claimId}/print?doc=${doc}`;
}

export function StatusBadge({ status }: { status: WarrantyClaimStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Warranty claim workflow: find the sold unit, receive it, decide after inspection,
 * and hand it back. Used on the Warranty Claims page and the Service tickets tab.
 */
export function WarrantyClaimsPanel({
  compact = false,
  focusClaimId,
  focusAction,
}: {
  /** Hide the page header when embedded in another page. */
  compact?: boolean;
  /** Open this claim when the panel loads (e.g. from a service ticket). */
  focusClaimId?: number | null;
  focusAction?: 'handover' | 'detail' | null;
}) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('warranty', 'can_read');
  const canCreate = hasPermission('warranty', 'can_create');
  const canUpdate = hasPermission('warranty', 'can_update');

  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [documentNo, setDocumentNo] = useState('');
  const [lookupLabel, setLookupLabel] = useState('');
  const [candidates, setCandidates] = useState<WarrantyCandidate[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [modal, setModal] = useState<Modal>(null);
  const [focusHandled, setFocusHandled] = useState(false);

  const loadClaims = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [claimResponse, storeResponse] = await Promise.all([
        api.getAll<WarrantyClaim>('/v1/warranty-claims'),
        api.getAll<Store>('/v1/stores'),
      ]);
      setClaims(claimResponse.data ?? []);
      setStores(storeResponse.data ?? []);
    } catch (error) {
      setNotice({ type: 'error', message: getApiErrorMessage(error, 'Unable to load warranty claims.') });
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const timer = window.setTimeout(loadClaims, 0);
    return () => window.clearTimeout(timer);
  }, [loadClaims]);

  useEffect(() => {
    if (focusHandled || loading || !focusClaimId) return;
    const claim = claims.find((candidate) => candidate.id === focusClaimId);
    const timer = window.setTimeout(() => {
      setFocusHandled(true);
      if (claim && focusAction === 'handover' && claim.status === 'ready_for_pickup') {
        setModal({ kind: 'handover', claim });
      } else {
        setModal({ kind: 'detail', claimId: focusClaimId });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [claims, focusAction, focusClaimId, focusHandled, loading]);

  const runLookup = async (query: { serial?: string; document_no?: string }) => {
    const params = new URLSearchParams(query as Record<string, string>);
    setLookingUp(true);
    setNotice(null);
    setLookupLabel(query.serial ? `serial ${query.serial}` : `document ${query.document_no}`);
    try {
      const response = await api.get<WarrantyCandidate[]>(`/v1/warranty-claims/lookup?${params}`);
      setCandidates(response.data ?? []);
    } catch (error) {
      setCandidates(null);
      setNotice({ type: 'error', message: getApiErrorMessage(error, 'Warranty lookup failed.') });
    } finally {
      setLookingUp(false);
    }
  };

  const afterSave = async (message: string) => {
    setModal(null);
    setCandidates(null);
    await loadClaims();
    setNotice({ type: 'success', message });
  };

  const filteredClaims = useMemo(() => {
    const tab = STATUS_TABS.find((candidate) => candidate.key === statusTab);
    const term = search.trim().toLowerCase();
    return claims.filter((claim) => {
      if (tab?.statuses && !tab.statuses.includes(claim.status)) return false;
      return !term || [
        claim.claim_no,
        claim.invoice_no,
        claim.agreement_no,
        claim.item_code,
        claim.item_description,
        claim.item_serial_no,
        claim.replacement_serial_no,
        claim.service_ticket_no,
        claim.customer_name,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [claims, search, statusTab]);

  const tabCounts = useMemo(() => Object.fromEntries(STATUS_TABS.map((tab) => [
    tab.key,
    tab.statuses ? claims.filter((claim) => tab.statuses?.includes(claim.status)).length : claims.length,
  ])) as Record<StatusTab, number>, [claims]);

  const monthStart = dateInputValue().slice(0, 8) + '01';
  const metrics = {
    withUs: claims.filter((claim) => CUSTODY_STATUSES.includes(claim.status)).length,
    toDecide: claims.filter((claim) => claim.status === 'received').length,
    ready: claims.filter((claim) => claim.status === 'ready_for_pickup').length,
    deliveredThisMonth: claims.filter((claim) => claim.delivered_date && claim.delivered_date >= monthStart).length,
  };

  if (!canRead) {
    return <OperationNotice type="error">You do not have permission to view warranty claims.</OperationNotice>;
  }

  return (
    <div className="space-y-6">
      {!compact && (
        <OperationHeader
          eyebrow="Service"
          title="Warranty Claims"
          description="Receive a unit under warranty, decide after inspection, and hand it back. Warranty work is never charged to the customer."
          icon={ShieldCheck}
          actions={
            <Link
              href="/dashboard/reports/warranty"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <CalendarClock className="h-4 w-4" /> Warranty report
            </Link>
          }
        />
      )}
      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Units with us" value={metrics.withUs.toLocaleString()} tone="indigo" />
        <OperationMetric label="Waiting for decision" value={metrics.toDecide.toLocaleString()} tone="amber" />
        <OperationMetric label="Ready for pickup" value={metrics.ready.toLocaleString()} tone="emerald" />
        <OperationMetric label="Delivered this month" value={metrics.deliveredThisMonth.toLocaleString()} />
      </section>

      {canCreate && (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileSearch className="h-4 w-4 text-indigo-500" /> Receive a warranty item
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <OperationField label="Serial number">
              <ScanInput
                onScan={(code) => runLookup({ serial: code })}
                placeholder="Scan or type the serial + Enter"
                disabled={lookingUp}
              />
            </OperationField>
            <OperationField label="Invoice / HP agreement no">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (documentNo.trim()) runLookup({ document_no: documentNo.trim() });
                }}
              >
                <input
                  value={documentNo}
                  onChange={(event) => setDocumentNo(event.target.value)}
                  placeholder="INV-... or agreement no"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={lookingUp || !documentNo.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
                >
                  <Search className="h-4 w-4" /> Find
                </button>
              </form>
            </OperationField>
          </div>

          {lookingUp && <p className="text-sm text-slate-500">Searching…</p>}
          {candidates && !lookingUp && (
            candidates.length === 0 ? (
              <OperationNotice type="error">No sold item found for {lookupLabel}.</OperationNotice>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Serial</th>
                      <th className="px-4 py-3">Sale</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Warranty</th>
                      <th className="px-4 py-3 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {candidates.map((candidate) => (
                      <tr key={candidateKey(candidate)} className={candidate.eligible ? '' : 'bg-slate-50/60 text-slate-500'}>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-bold text-indigo-700">{candidate.item_code}</div>
                          <div className="mt-0.5">{candidate.item_description}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {candidate.item_serial_no ?? `Qty ${candidate.claimable_qty} of ${candidate.sold_qty}`}
                          {candidate.sold_serial_no && candidate.sold_serial_no !== candidate.item_serial_no && (
                            <div className="text-[11px] text-slate-400">Replaced {candidate.sold_serial_no}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold">{saleLabel(candidate)}</div>
                          <div className="text-xs text-slate-400">{displayDate(candidate.sale_date)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{candidate.customer_name || '—'}</div>
                          <div className="text-xs text-slate-400">{candidate.customer_phone}</div>
                        </td>
                        <td className="px-4 py-3">
                          {candidate.eligible ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                              <ShieldCheck className="h-3.5 w-3.5" /> Valid · {candidate.days_left} days left
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                              <ShieldX className="h-3.5 w-3.5" /> {candidate.reason}
                            </span>
                          )}
                          {candidate.warranty_expiry_date && (
                            <div className="mt-1 text-xs text-slate-400">Until {displayDate(candidate.warranty_expiry_date)}</div>
                          )}
                        </td>
                        <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                          {candidate.claim_count > 0 && (
                            <button
                              type="button"
                              onClick={() => setModal({ kind: 'history', candidate })}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <History className="h-3.5 w-3.5" /> History ({candidate.claim_count})
                            </button>
                          )}
                          {candidate.custody_claim && (
                            <button
                              type="button"
                              onClick={() => setModal({ kind: 'detail', claimId: candidate.custody_claim!.id })}
                              className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                              Open {candidate.custody_claim.claim_no}
                            </button>
                          )}
                          {candidate.eligible && (
                            <button
                              type="button"
                              onClick={() => setModal({ kind: 'receive', candidate })}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Receive
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-4 pt-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              className={`rounded-t-lg border-b-2 px-3 py-2 text-xs font-semibold transition ${
                statusTab === tab.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search claim, ticket, invoice, serial, item or customer" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none" />
          </div>
          <button type="button" onClick={loadClaims} className="rounded-xl border border-slate-200 p-2.5 text-slate-500"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Claim</th>
                <th className="px-5 py-3.5">Item / Serial</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Decision</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={6} label="Loading warranty claims..." /> : filteredClaims.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">No warranty claims found.</td></tr>
              ) : filteredClaims.map((claim) => (
                <tr key={claim.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <button type="button" onClick={() => setModal({ kind: 'detail', claimId: claim.id })} className="font-mono text-xs font-bold text-indigo-700 hover:underline">
                      {claim.claim_no}
                    </button>
                    <div className="mt-1 text-xs text-slate-500">{displayDate(claim.claim_date)}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">{saleLabel(claim)}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold">{claim.item_description || claim.item_code}</div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{claim.item_serial_no ?? `Qty ${claim.qty}`}</div>
                    <div className="mt-1 max-w-xs text-xs text-slate-400">{claim.problem_description}</div>
                  </td>
                  <td className="px-5 py-4">{claim.customer_name || '—'}</td>
                  <td className="px-5 py-4">
                    {claim.resolution ? (
                      <>
                        <div className="font-semibold">{RESOLUTION_LABELS[claim.resolution]}</div>
                        <div className="mt-1 font-mono text-xs text-slate-500">
                          {claim.service_ticket_no && `Ticket ${claim.service_ticket_no}`}
                          {claim.replacement_serial_no && `New serial ${claim.replacement_serial_no}`}
                          {claim.sales_return_no && `Return ${claim.sales_return_no}`}
                        </div>
                        {claim.outcome_note && <div className="mt-1 max-w-xs text-xs text-slate-400">{claim.outcome_note}</div>}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting inspection</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={claim.status} />
                    {claim.delivered_date && <div className="mt-1 text-xs text-slate-400">Delivered {displayDate(claim.delivered_date)}</div>}
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-5 py-4 text-right">
                    {claim.status === 'received' && canUpdate && (
                      <ActionButton icon={Gavel} label="Decide" tone="indigo" onClick={() => setModal({ kind: 'decide', claim })} />
                    )}
                    {claim.status === 'in_repair' && (
                      <>
                        <a href="/dashboard/service" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          <Wrench className="h-3.5 w-3.5" /> {claim.service_ticket_no}
                        </a>
                        {canUpdate && <ActionButton icon={Ban} label="Reject" tone="rose" onClick={() => setModal({ kind: 'reject', claim })} />}
                      </>
                    )}
                    {claim.status === 'ready_for_pickup' && canCreate && (
                      <ActionButton icon={PackageCheck} label="Hand over" tone="emerald" onClick={() => setModal({ kind: 'handover', claim })} />
                    )}
                    {claim.status === 'delivered' && (
                      <a href={printUrl(claim.id, 'handover')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <Printer className="h-3.5 w-3.5" /> Slip
                      </a>
                    )}
                    {CUSTODY_STATUSES.includes(claim.status) && (
                      <a href={printUrl(claim.id, 'receipt')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <Printer className="h-3.5 w-3.5" /> Receipt
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modal?.kind === 'receive' && (
        <ReceiveModal candidate={modal.candidate} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.kind === 'decide' && (
        <DecideModal claim={modal.claim} stores={stores} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.kind === 'handover' && (
        <HandoverModal claim={modal.claim} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.kind === 'reject' && (
        <RejectModal claim={modal.claim} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.kind === 'detail' && (
        <ClaimDetailModal claimId={modal.claimId} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'history' && (
        <OperationModal
          title="Warranty history"
          description={`${modal.candidate.item_code} · ${modal.candidate.item_serial_no ?? modal.candidate.item_description ?? ''}`}
          onClose={() => setModal(null)}
          width="max-w-4xl"
        >
          <div className="p-6">
            <UnitHistory candidate={modal.candidate} />
          </div>
        </OperationModal>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: typeof Gavel;
  label: string;
  tone: 'indigo' | 'emerald' | 'rose';
  onClick: () => void;
}) {
  const tones = {
    indigo: 'bg-indigo-600 text-white hover:bg-indigo-700',
    emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
    rose: 'border border-rose-200 text-rose-700 hover:bg-rose-50',
  };
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tones[tone]}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function useHistory(sourceType: string, detailId: number, serial: string | null) {
  const [history, setHistory] = useState<WarrantyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      source_type: sourceType,
      source_detail_id: String(detailId),
      ...(serial ? { serial } : {}),
    });
    api.get<WarrantyHistory>(`/v1/warranty-claims/history?${params}`)
      .then((response) => { if (active) setHistory(response.data ?? null); })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason, 'Unable to load warranty history.')); });
    return () => { active = false; };
  }, [detailId, serial, sourceType]);

  return { history, error };
}

function UnitHistory({ candidate }: { candidate: WarrantyCandidate }) {
  const { history, error } = useHistory(candidate.source_type, candidate.source_detail_id, candidate.item_serial_no);
  if (error) return <OperationNotice type="error">{error}</OperationNotice>;
  if (!history) return <p className="text-sm text-slate-500">Loading history…</p>;
  return <HistoryList history={history} />;
}

/** Previous claims on the unit with the service work done on each, plus paid service tickets. */
function HistoryList({ history, excludeClaimId }: { history: WarrantyHistory; excludeClaimId?: number }) {
  const claims = history.claims.filter((claim) => claim.id !== excludeClaimId);

  return (
    <div className="space-y-3">
      {history.serial_chain.length > 1 && (
        <p className="text-xs text-slate-500">Serial history: {history.serial_chain.join(' → ')}</p>
      )}
      {claims.length === 0 && history.service_tickets.length === 0 && (
        <p className="text-sm text-slate-500">No previous warranty claims or service jobs for this unit.</p>
      )}
      {claims.map((claim) => (
        <div key={claim.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-xs font-bold text-indigo-700">{claim.claim_no} · {displayDate(claim.claim_date)}</div>
            <StatusBadge status={claim.status} />
          </div>
          <div className="mt-2 text-sm"><span className="font-semibold">Problem:</span> {claim.problem_description}</div>
          {claim.resolution && (
            <div className="mt-1 text-sm">
              <span className="font-semibold">Decision:</span> {RESOLUTION_LABELS[claim.resolution]}
              {claim.replacement_serial_no && ` → new serial ${claim.replacement_serial_no}`}
              {claim.outcome_note && <span className="text-slate-500"> — {claim.outcome_note}</span>}
            </div>
          )}
          {claim.service_ticket && <TicketWork ticket={claim.service_ticket} />}
          {claim.delivered_date && (
            <div className="mt-1 text-xs text-slate-500">Handed over {displayDate(claim.delivered_date)}{claim.collected_by ? ` to ${claim.collected_by}` : ''}</div>
          )}
        </div>
      ))}
      {history.service_tickets.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other service jobs</div>
          {history.service_tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-xl border border-dashed border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono font-bold text-slate-700">{ticket.ticket_no} · {displayDate(ticket.return_date ?? null)}</span>
                <span className="text-slate-500">{ticket.is_warranty ? 'Warranty' : 'Paid service'} · {ticket.status.replace(/_/g, ' ')}</span>
              </div>
              {ticket.problem_description && <div className="mt-1 text-sm">{ticket.problem_description}</div>}
              <TicketWork ticket={ticket} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketWork({ ticket }: { ticket: WarrantyServiceTicket }) {
  const issues = ticket.issues ?? [];
  const dispatches = ticket.dispatches ?? [];
  if (issues.length === 0 && dispatches.length === 0) {
    return <div className="mt-2 text-xs text-slate-400">Service ticket {ticket.ticket_no} · {ticket.status.replace(/_/g, ' ')} · no repair recorded yet</div>;
  }

  return (
    <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
      <div className="font-semibold text-slate-700">Service ticket {ticket.ticket_no}</div>
      {dispatches.map((dispatch) => (
        <div key={dispatch.id}>
          Sent to {dispatch.supplier?.name ?? 'supplier'} on {displayDate(dispatch.dispatch_date)}
          {dispatch.received_date && `, back ${displayDate(dispatch.received_date)}`}
          {dispatch.supplier_report && ` — ${dispatch.supplier_report}`}
        </div>
      ))}
      {issues.map((issue) => (
        <div key={issue.id}>
          <span className="font-semibold">{issue.technician_name ?? 'Technician'}</span>
          {issue.completed_date && ` (${displayDate(issue.completed_date)})`}
          {issue.diagnosis && ` · Diagnosis: ${issue.diagnosis}`}
          {issue.repair_details && ` · Repair: ${issue.repair_details}`}
          {issue.parts_used && ` · Parts: ${issue.parts_used}`}
        </div>
      ))}
    </div>
  );
}

function ReceiveModal({
  candidate,
  onClose,
  onSaved,
}: {
  candidate: WarrantyCandidate;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { history } = useHistory(candidate.source_type, candidate.source_detail_id, candidate.item_serial_no);
  const [form, setForm] = useState({
    claim_date: dateInputValue(),
    qty: '1',
    problem_description: '',
    intake_condition: '',
    accessories_received: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = history?.claims.length ?? candidate.claim_count;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const printWindow = openPendingPrintWindow();
    try {
      const response = await api.post<WarrantyClaim>('/v1/warranty-claims', {
        claim_date: form.claim_date,
        source_type: candidate.source_type,
        source_detail_id: candidate.source_detail_id,
        item_serial_no: candidate.item_serial_no,
        qty: candidate.item_serial_no ? 1 : Number(form.qty),
        problem_description: form.problem_description,
        intake_condition: form.intake_condition || null,
        accessories_received: form.accessories_received || null,
        remarks: form.remarks || null,
      });
      if (response.data && printWindow) printWindow.location.href = printUrl(response.data.id, 'receipt');
      else printWindow?.close();
      await onSaved(`Warranty claim ${response.data?.claim_no ?? ''} received. Inspect the item and record the decision.`);
    } catch (reason) {
      printWindow?.close();
      setError(getApiErrorMessage(reason, 'Unable to receive the warranty claim.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperationModal
      title="Receive Warranty Item"
      description={`${candidate.item_code} · ${candidate.item_description ?? ''}${candidate.item_serial_no ? ` · Serial ${candidate.item_serial_no}` : ''}`}
      onClose={() => !saving && onClose()}
      width="max-w-3xl"
    >
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <OperationNotice type="success">
          Sold on {displayDate(candidate.sale_date)} ({saleLabel(candidate)}) to {candidate.customer_name || 'walk-in customer'}. Warranty valid until {displayDate(candidate.warranty_expiry_date)} ({candidate.days_left} days left). No charge to the customer.
        </OperationNotice>

        {previous > 0 && (
          <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              This will be the {ordinal(previous + 1)} warranty claim on this unit.
              {previous + 1 >= 3 && ' Consider replacing it instead of another repair.'}
            </div>
            {history && <HistoryList history={history} />}
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <OperationField label="Received date" required>
            <input type="date" value={form.claim_date} onChange={(event) => setForm({ ...form, claim_date: event.target.value })} className={inputClass} required />
          </OperationField>
          {!candidate.item_serial_no && (
            <OperationField label={`Qty (max ${candidate.claimable_qty})`} required>
              <input type="number" min="1" max={candidate.claimable_qty} value={form.qty} onChange={(event) => setForm({ ...form, qty: event.target.value })} className={inputClass} required />
            </OperationField>
          )}
        </div>
        <OperationField label="Problem reported by the customer" required>
          <textarea value={form.problem_description} onChange={(event) => setForm({ ...form, problem_description: event.target.value })} rows={3} className={inputClass} required />
        </OperationField>
        <div className="grid gap-4 md:grid-cols-2">
          <OperationField label="Condition on receipt">
            <input value={form.intake_condition} onChange={(event) => setForm({ ...form, intake_condition: event.target.value })} placeholder="Scratches, dents, display marks..." className={inputClass} />
          </OperationField>
          <OperationField label="Accessories received">
            <input value={form.accessories_received} onChange={(event) => setForm({ ...form, accessories_received: event.target.value })} placeholder="Charger, box, cable..." className={inputClass} />
          </OperationField>
        </div>
        <OperationField label="Remarks">
          <input value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} className={inputClass} />
        </OperationField>
        <OperationActions saving={saving} submitLabel="Receive & print receipt" onCancel={onClose} disabled={!form.problem_description.trim()} />
      </form>
    </OperationModal>
  );
}

function DecideModal({
  claim,
  stores,
  onClose,
  onSaved,
}: {
  claim: WarrantyClaim;
  stores: Store[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    decision_date: dateInputValue(),
    resolution: 'repair' as WarrantyResolution,
    outcome_note: '',
    replacement_store_id: claim.store_id ? String(claim.store_id) : '',
    replacement_serial_no: '',
    replacement_batch_no: '',
    refund_method: 'cash',
    collected_by: claim.customer_name ?? '',
  });
  const [stockItem, setStockItem] = useState<StockItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get<StockItem[]>(`/v1/stock?search=${encodeURIComponent(claim.item_code)}`)
      .then((response) => {
        if (active) setStockItem((response.data ?? []).find((item) => item.item_code === claim.item_code) ?? null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [claim.item_code]);

  const serials = (stockItem?.available_serials ?? []).filter((serial) => String(serial.store_id) === form.replacement_store_id);
  const batches = (stockItem?.batches ?? []).filter((batch) => String(batch.store_id) === form.replacement_store_id && batch.qty_in_hand > 0);
  const isSerialized = Boolean(claim.item_serial_no) || Boolean(stockItem?.is_serialized);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const printWindow = form.resolution === 'replace' ? openPendingPrintWindow() : null;
    try {
      await api.post(`/v1/warranty-claims/${claim.id}/decide`, {
        decision_date: form.decision_date,
        resolution: form.resolution,
        outcome_note: form.outcome_note || null,
        replacement_store_id: form.resolution === 'replace' ? Number(form.replacement_store_id) : null,
        replacement_serial_no: form.resolution === 'replace' && isSerialized ? form.replacement_serial_no : null,
        replacement_batch_no: form.resolution === 'replace' && stockItem?.is_batch ? form.replacement_batch_no : null,
        refund_method: form.resolution === 'refund' ? form.refund_method : null,
        collected_by: form.resolution === 'replace' ? form.collected_by || null : null,
      });
      if (printWindow) printWindow.location.href = printUrl(claim.id, 'handover');
      const messages: Record<WarrantyResolution, string> = {
        repair: 'Sent for repair. A free warranty service ticket was opened.',
        replace: 'Replacement unit issued and handed over free of charge.',
        refund: 'Refund posted through a sales return.',
        reject: 'Warranty rejected. Hand the item back to the customer when they collect it.',
      };
      await onSaved(`${claim.claim_no}: ${messages[form.resolution]}`);
    } catch (reason) {
      printWindow?.close();
      setError(getApiErrorMessage(reason, 'Unable to record the decision.'));
    } finally {
      setSaving(false);
    }
  };

  const resolutions = (['repair', 'replace', 'refund', 'reject'] as WarrantyResolution[])
    .filter((resolution) => resolution !== 'refund' || claim.source_type === 'invoice');

  return (
    <OperationModal
      title={`Decide ${claim.claim_no}`}
      description={`${claim.item_code} · ${claim.item_description ?? ''}${claim.item_serial_no ? ` · Serial ${claim.item_serial_no}` : ''}`}
      onClose={() => !saving && onClose()}
      width="max-w-3xl"
    >
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <div><span className="font-semibold">Problem:</span> {claim.problem_description}</div>
          {claim.intake_condition && <div className="mt-1"><span className="font-semibold">Condition:</span> {claim.intake_condition}</div>}
          {claim.accessories_received && <div className="mt-1"><span className="font-semibold">Accessories:</span> {claim.accessories_received}</div>}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <OperationField label="Decision date" required>
            <input type="date" value={form.decision_date} onChange={(event) => setForm({ ...form, decision_date: event.target.value })} className={inputClass} required />
          </OperationField>
        </div>

        <OperationField label="Decision after inspection" required>
          <div className="grid gap-2 sm:grid-cols-4">
            {resolutions.map((resolution) => (
              <button
                key={resolution}
                type="button"
                onClick={() => setForm({ ...form, resolution })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  form.resolution === resolution
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {RESOLUTION_LABELS[resolution]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {form.resolution === 'repair' && 'Opens a free warranty service ticket. The item stays with us until it is handed over.'}
            {form.resolution === 'replace' && 'Issues another unit from stock now and hands it over. The new unit keeps the original warranty expiry.'}
            {form.resolution === 'refund' && 'Posts a sales return for this unit. The faulty unit stays with us and is not put back into sellable stock.'}
            {form.resolution === 'reject' && 'Warranty does not cover this (e.g. physical or liquid damage). The item waits for the customer to collect it unrepaired.'}
            {claim.source_type === 'hp' && ' Hire purchase refunds are handled from the hire purchase return screen.'}
          </p>
        </OperationField>

        {form.resolution === 'replace' && (
          <div className="grid gap-4 md:grid-cols-2">
            <OperationField label="Issue from store" required>
              <select value={form.replacement_store_id} onChange={(event) => setForm({ ...form, replacement_store_id: event.target.value, replacement_serial_no: '' })} className={inputClass} required>
                <option value="">Select store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </OperationField>
            {isSerialized && (
              <OperationField label="Replacement serial" required>
                {stockItem ? (
                  <SearchSelect
                    value={form.replacement_serial_no}
                    onChange={(value) => setForm({ ...form, replacement_serial_no: value })}
                    options={serials.map((serial) => ({ value: serial.serial_no, label: serial.serial_no }))}
                    placeholder={serials.length ? 'Select serial' : 'No serials in this store'}
                    searchPlaceholder="Search serial numbers..."
                    className={inputClass}
                    required
                  />
                ) : (
                  <input value={form.replacement_serial_no} onChange={(event) => setForm({ ...form, replacement_serial_no: event.target.value })} className={inputClass} required />
                )}
              </OperationField>
            )}
            {stockItem?.is_batch && (
              <OperationField label="Replacement batch" required>
                <select value={form.replacement_batch_no} onChange={(event) => setForm({ ...form, replacement_batch_no: event.target.value })} className={inputClass} required>
                  <option value="">Select batch</option>
                  {batches.map((batch) => <option key={batch.batch_no} value={batch.batch_no}>{batch.batch_no} · {batch.qty_in_hand} left</option>)}
                </select>
              </OperationField>
            )}
            <OperationField label="Collected by">
              <input value={form.collected_by} onChange={(event) => setForm({ ...form, collected_by: event.target.value })} className={inputClass} />
            </OperationField>
          </div>
        )}

        {form.resolution === 'refund' && (
          <OperationField label="Refund method">
            <select value={form.refund_method} onChange={(event) => setForm({ ...form, refund_method: event.target.value })} className={inputClass}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="store_credit">Store credit</option>
            </select>
          </OperationField>
        )}

        <OperationField label={form.resolution === 'reject' ? 'Reason for rejection' : 'Inspection notes'} required={form.resolution === 'reject'}>
          <textarea value={form.outcome_note} onChange={(event) => setForm({ ...form, outcome_note: event.target.value })} rows={2} className={inputClass} required={form.resolution === 'reject'} />
        </OperationField>

        <OperationActions saving={saving} submitLabel={`Confirm · ${RESOLUTION_LABELS[form.resolution]}`} onCancel={onClose} />
      </form>
    </OperationModal>
  );
}

function HandoverModal({
  claim,
  onClose,
  onSaved,
}: {
  claim: WarrantyClaim;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    delivered_date: dateInputValue(),
    collected_by: claim.customer_name ?? '',
    handover_note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const printWindow = openPendingPrintWindow();
    try {
      await api.post(`/v1/warranty-claims/${claim.id}/handover`, {
        delivered_date: form.delivered_date,
        collected_by: form.collected_by || null,
        handover_note: form.handover_note || null,
      });
      if (printWindow) printWindow.location.href = printUrl(claim.id, 'handover');
      await onSaved(`${claim.claim_no} handed over free of charge. The unit can be claimed again if needed.`);
    } catch (reason) {
      printWindow?.close();
      setError(getApiErrorMessage(reason, 'Unable to hand over the item.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperationModal title={`Hand over ${claim.claim_no}`} description={`${claim.item_description ?? claim.item_code}${claim.item_serial_no ? ` · Serial ${claim.item_serial_no}` : ''}`} onClose={() => !saving && onClose()} width="max-w-xl">
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <OperationNotice type="success">
          {claim.resolution === 'reject'
            ? `Returning unrepaired: ${claim.outcome_note ?? 'warranty rejected'}.`
            : 'Warranty repair completed. No charge to the customer.'}
          {claim.accessories_received && ` Return accessories: ${claim.accessories_received}.`}
        </OperationNotice>
        <div className="grid gap-4 md:grid-cols-2">
          <OperationField label="Handover date" required>
            <input type="date" value={form.delivered_date} onChange={(event) => setForm({ ...form, delivered_date: event.target.value })} className={inputClass} required />
          </OperationField>
          <OperationField label="Collected by">
            <input value={form.collected_by} onChange={(event) => setForm({ ...form, collected_by: event.target.value })} className={inputClass} />
          </OperationField>
        </div>
        <OperationField label="Note">
          <input value={form.handover_note} onChange={(event) => setForm({ ...form, handover_note: event.target.value })} placeholder="Tested in front of customer..." className={inputClass} />
        </OperationField>
        <OperationActions saving={saving} submitLabel="Hand over & print slip" onCancel={onClose} />
      </form>
    </OperationModal>
  );
}

function RejectModal({
  claim,
  onClose,
  onSaved,
}: {
  claim: WarrantyClaim;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/v1/warranty-claims/${claim.id}/reject`, { reason });
      await onSaved(`${claim.claim_no} rejected. Service ticket ${claim.service_ticket_no} continues as a paid job.`);
    } catch (failure) {
      setError(getApiErrorMessage(failure, 'Unable to reject the claim.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperationModal title={`Reject ${claim.claim_no}`} description="Damage found during repair that warranty does not cover." onClose={() => !saving && onClose()} width="max-w-lg">
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <OperationNotice type="error">
          Service ticket {claim.service_ticket_no} becomes a normal paid service job. Invoice and collect from the customer in Service Tickets.
        </OperationNotice>
        <OperationField label="Reason" required>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className={inputClass} required />
        </OperationField>
        <OperationActions saving={saving} submitLabel="Reject warranty" onCancel={onClose} disabled={!reason.trim()} />
      </form>
    </OperationModal>
  );
}

function ClaimDetailModal({ claimId, onClose }: { claimId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<WarrantyClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.get<WarrantyClaimDetail>(`/v1/warranty-claims/${claimId}`)
      .then((response) => { if (active) setDetail(response.data ?? null); })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason, 'Unable to load the claim.')); });
    return () => { active = false; };
  }, [claimId]);

  const claim = detail?.claim;

  return (
    <OperationModal
      title={claim ? `Warranty claim ${claim.claim_no}` : 'Warranty claim'}
      description={claim ? `${claim.item_description ?? claim.item_code}${claim.item_serial_no ? ` · Serial ${claim.item_serial_no}` : ''} · ${claim.customer_name ?? ''}` : undefined}
      onClose={onClose}
      width="max-w-4xl"
    >
      <div className="space-y-6 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        {!detail && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {claim && detail && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={claim.status} />
              <span className="text-xs text-slate-500">Sold {saleLabel(claim)} · warranty until {displayDate(claim.warranty_expiry_date)}</span>
              <span className="ml-auto flex gap-2">
                <a href={printUrl(claim.id, 'receipt')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Printer className="h-3.5 w-3.5" /> Receipt
                </a>
                {claim.status === 'delivered' && (
                  <a href={printUrl(claim.id, 'handover')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Printer className="h-3.5 w-3.5" /> Handover slip
                  </a>
                )}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 rounded-xl border border-slate-200 p-4 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received {displayDate(claim.claim_date)}</div>
                <div><span className="font-semibold">Problem:</span> {claim.problem_description}</div>
                {claim.intake_condition && <div><span className="font-semibold">Condition:</span> {claim.intake_condition}</div>}
                {claim.accessories_received && <div><span className="font-semibold">Accessories:</span> {claim.accessories_received}</div>}
              </div>
              <div className="space-y-1 rounded-xl border border-slate-200 p-4 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {claim.resolution ? `Decided ${displayDate(claim.decided_date)}` : 'Awaiting decision'}
                </div>
                {claim.resolution && <div><span className="font-semibold">Decision:</span> {RESOLUTION_LABELS[claim.resolution]}</div>}
                {claim.outcome_note && <div><span className="font-semibold">Notes:</span> {claim.outcome_note}</div>}
                {claim.replacement_serial_no && <div><span className="font-semibold">Replacement serial:</span> {claim.replacement_serial_no}</div>}
                {claim.sales_return_no && <div><span className="font-semibold">Sales return:</span> {claim.sales_return_no}</div>}
                {claim.delivered_date && (
                  <div><span className="font-semibold">Handed over:</span> {displayDate(claim.delivered_date)}{claim.collected_by ? ` to ${claim.collected_by}` : ''}{claim.handover_note ? ` — ${claim.handover_note}` : ''}</div>
                )}
              </div>
            </div>

            {claim.service_ticket && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><Wrench className="h-4 w-4 text-indigo-500" /> Repair work</h3>
                <TicketWork ticket={claim.service_ticket} />
              </section>
            )}

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><ClipboardCheck className="h-4 w-4 text-indigo-500" /> Timeline</h3>
              <ol className="space-y-2 border-l border-slate-200 pl-4">
                {(claim.events ?? []).map((event) => (
                  <li key={event.id} className="text-sm">
                    <div className="text-xs text-slate-400">{event.created_at?.replace('T', ' ').slice(0, 16)} · {event.UID}</div>
                    <div>{event.description}</div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4 text-indigo-500" /> Other claims and service on this unit</h3>
              <HistoryList history={detail.history} excludeClaimId={claim.id} />
            </section>
          </>
        )}
      </div>
    </OperationModal>
  );
}
