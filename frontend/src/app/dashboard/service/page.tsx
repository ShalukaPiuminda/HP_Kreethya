'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  HandCoins,
  PackageCheck,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Trash2,
  Truck,
  UserRoundCog,
  Wrench,
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
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/inventory';
import { dateInputValue, displayDate, numeric } from '@/lib/purchases';
import type {
  ServiceOptions,
  ServiceStatus,
  ServiceSummary,
  ServiceTicket,
} from '@/lib/service';
import { SearchSelect } from '@/components/search-select';
import { WarrantyClaimsPanel } from '@/components/warranty-claims-panel';

type PageTab = 'tickets' | 'warranty';
type WarrantyFocus = { claimId: number; action: 'handover' | 'detail'; key: number } | null;

type TicketAction =
  | 'dispatch'
  | 'receive-back'
  | 'assign-technician'
  | 'complete-repair'
  | 'invoice'
  | 'customer-payment'
  | 'supplier-payment';

interface TicketForm {
  return_date: string;
  customer_code: string;
  item_code: string;
  item_serial_no: string;
  problem_description: string;
  intake_condition: string;
  is_warranty: boolean;
  expected_completion_date: string;
}

interface ActionForm {
  action_date: string;
  supplier_code: string;
  estimated_return: string;
  supplier_reference: string;
  notes: string;
  repair_cost: string;
  technician_name: string;
  diagnosis: string;
  repair_details: string;
  parts_used: string;
  labor_charge: string;
  service_charge: string;
  amount: string;
  payment_method: string;
  bank_detail_id: string;
}

function blankTicketForm(): TicketForm {
  return {
    return_date: dateInputValue(),
    customer_code: '',
    item_code: '',
    item_serial_no: '',
    problem_description: '',
    intake_condition: '',
    is_warranty: false,
    expected_completion_date: '',
  };
}

function blankActionForm(options?: ServiceOptions): ActionForm {
  return {
    action_date: dateInputValue(),
    supplier_code: options?.service_suppliers[0]?.Code ?? '',
    estimated_return: '',
    supplier_reference: '',
    notes: '',
    repair_cost: '0',
    technician_name: '',
    diagnosis: '',
    repair_details: '',
    parts_used: '',
    labor_charge: '0',
    service_charge: '0',
    amount: '',
    payment_method: 'cash',
    bank_detail_id: options?.bank_accounts[0]?.id?.toString() ?? '',
  };
}

export default function ServicePage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('service', 'can_read');
  const canCreate = hasPermission('service', 'can_create');
  const canUpdate = hasPermission('service', 'can_update');
  const canDelete = hasPermission('service', 'can_delete');
  const canReadWarranty = hasPermission('warranty', 'can_read');
  const [pageTab, setPageTab] = useState<PageTab>('tickets');
  const [warrantyFocus, setWarrantyFocus] = useState<WarrantyFocus>(null);
  const focusCounter = useRef(0);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [options, setOptions] = useState<ServiceOptions | null>(null);
  const [summary, setSummary] = useState<ServiceSummary | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [ticketForm, setTicketForm] = useState<TicketForm>(blankTicketForm);
  const [editingTicket, setEditingTicket] = useState<ServiceTicket | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [action, setAction] = useState<TicketAction | null>(null);
  const [actionForm, setActionForm] = useState<ActionForm>(blankActionForm);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | ServiceStatus>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const [ticketResponse, optionResponse, summaryResponse] = await Promise.all([
        api.getAll<ServiceTicket>('/v1/service-tickets'),
        api.get<ServiceOptions>('/v1/service-tickets/options'),
        api.get<ServiceSummary>('/v1/service-tickets/summary'),
      ]);
      setTickets(ticketResponse.data ?? []);
      setOptions(optionResponse.data ?? null);
      setSummary(summaryResponse.data ?? null);
      setSelectedTicket((current) => {
        if (!current) return null;
        return (ticketResponse.data ?? []).find((ticket) => ticket.id === current.id) ?? null;
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to load service tickets.'),
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

  const visibleTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = status === 'all' || ticket.status === status;
      const matchesSearch = !term || [
        ticket.ticket_no,
        ticket.customer_name,
        ticket.customer_nic,
        ticket.item_code,
        ticket.item_serial_no ?? '',
      ].some((value) => value.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [search, status, tickets]);

  const selectedItem = options?.items.find((item) => item.item_code === ticketForm.item_code);

  // ?tab=warranty&claim=<id>&action=handover keeps the selected tab on refresh and in links.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      if (params.get('tab') !== 'warranty') return;
      setPageTab('warranty');
      if (params.get('claim')) {
        setWarrantyFocus({
          claimId: Number(params.get('claim')),
          action: params.get('action') === 'handover' ? 'handover' : 'detail',
          key: ++focusCounter.current,
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const switchTab = (next: PageTab, focus: WarrantyFocus = null) => {
    setPageTab(next);
    setWarrantyFocus(focus);
    setSelectedTicket(null);
    const query = new URLSearchParams();
    if (next === 'warranty') query.set('tab', 'warranty');
    if (focus) {
      query.set('claim', String(focus.claimId));
      query.set('action', focus.action);
    }
    window.history.replaceState(null, '', `${window.location.pathname}${query.size ? `?${query}` : ''}`);
    if (next === 'tickets') void loadData();
  };

  const openWarrantyClaim = (claimId: number, claimAction: 'handover' | 'detail') =>
    switchTab('warranty', { claimId, action: claimAction, key: ++focusCounter.current });

  if (!canRead) {
    return (
      <OperationNotice type="error">
        You do not have permission to view service tickets.
      </OperationNotice>
    );
  }

  const openCreate = () => {
    setEditingTicket(null);
    setTicketForm({
      ...blankTicketForm(),
      customer_code: options?.customers[0]?.Code ?? '',
      item_code: options?.items[0]?.item_code ?? '',
    });
    setNotice(null);
    setShowTicketForm(true);
  };

  const openEdit = (ticket: ServiceTicket) => {
    setEditingTicket(ticket);
    setTicketForm({
      return_date: dateValue(ticket.return_date),
      customer_code: ticket.customer_code ?? '',
      item_code: ticket.item_code,
      item_serial_no: ticket.item_serial_no ?? '',
      problem_description: ticket.problem_description,
      intake_condition: ticket.intake_condition ?? '',
      is_warranty: ticket.is_warranty,
      expected_completion_date: dateValue(ticket.expected_completion_date),
    });
    setShowTicketForm(true);
  };

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const payload = {
        ...ticketForm,
        item_serial_no: ticketForm.item_serial_no || null,
        intake_condition: ticketForm.intake_condition || null,
        expected_completion_date: ticketForm.expected_completion_date || null,
      };
      const response = editingTicket
        ? await api.put<ServiceTicket>(`/v1/service-tickets/${editingTicket.id}`, payload)
        : await api.post<ServiceTicket>('/v1/service-tickets', payload);

      setShowTicketForm(false);
      setEditingTicket(null);
      await loadData();
      if (response.data) setSelectedTicket(response.data);
      setNotice({
        type: 'success',
        message: editingTicket
          ? 'Service intake details updated.'
          : 'Service ticket created successfully.',
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to save the service ticket.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteTicket = async (ticket: ServiceTicket) => {
    if (!window.confirm(`Delete service ticket ${ticket.ticket_no}?`)) return;
    setSaving(true);
    try {
      await api.delete(`/v1/service-tickets/${ticket.id}`);
      if (selectedTicket?.id === ticket.id) setSelectedTicket(null);
      await loadData();
      setNotice({ type: 'success', message: 'Service ticket deleted.' });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to delete the service ticket.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const openAction = (nextAction: TicketAction) => {
    setAction(nextAction);
    setActionForm(blankActionForm(options ?? undefined));
    setNotice(null);
  };

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTicket || !action) return;

    setSaving(true);
    setNotice(null);
    try {
      const payload = actionPayload(action, actionForm);
      const response = await api.post<ServiceTicket>(
        `/v1/service-tickets/${selectedTicket.id}/${action}`,
        payload
      );
      setAction(null);
      if (response.data) setSelectedTicket(response.data);
      await loadData();
      setNotice({
        type: 'success',
        message: actionSuccessMessage(action),
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: getApiErrorMessage(error, 'Unable to update the service workflow.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="After-Sales Operations"
        title="Service Tickets"
        description="Manage customer intake, external supplier repairs, technician work, service billing, settlements, and item handover from one controlled workflow."
        icon={Wrench}
        actions={pageTab === 'warranty' ? undefined : (
          <>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition hover:text-indigo-700 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                disabled={!options?.customers.length || !options?.items.length}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none"
              >
                <Plus className="h-4 w-4" />
                New Service Ticket
              </button>
            )}
          </>
        )}
      />

      {canReadWarranty && (
        <div className="flex gap-1 border-b border-slate-200">
          {([
            ['tickets', 'Service tickets'],
            ['warranty', 'Warranty claims'],
          ] as Array<[PageTab, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                pageTab === key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {pageTab === 'warranty' && canReadWarranty ? (
        <WarrantyClaimsPanel
          key={warrantyFocus?.key ?? 'warranty'}
          compact
          focusClaimId={warrantyFocus?.claimId ?? null}
          focusAction={warrantyFocus?.action ?? null}
        />
      ) : (
      <>
      {notice && <OperationNotice type={notice.type}>{notice.message}</OperationNotice>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric
          label="Open Tickets"
          value={(summary?.open_tickets ?? 0).toLocaleString()}
          help={`${summary?.with_supplier ?? 0} currently with suppliers`}
          tone="indigo"
        />
        <OperationMetric
          label="Under Repair"
          value={(summary?.under_repair ?? 0).toLocaleString()}
          help="Assigned to internal technicians"
          tone="amber"
        />
        <OperationMetric
          label="Customer Outstanding"
          value={formatCurrency(summary?.customer_outstanding ?? 0)}
          help="Unsettled service invoices"
          tone="rose"
        />
        <OperationMetric
          label="Supplier Outstanding"
          value={formatCurrency(summary?.supplier_outstanding ?? 0)}
          help={`${summary?.completed_tickets ?? 0} tickets completed`}
          tone="emerald"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ticket, customer, item, or serial number"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'all' | ServiceStatus)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-600 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="all">All workflow stages</option>
            {SERVICE_STATUSES.map((option) => (
              <option key={option} value={option}>{formatStatus(option)}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Ticket</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Item / Serial</th>
                <th className="px-5 py-3.5">Problem</th>
                <th className="px-5 py-3.5">Current Stage</th>
                <th className="px-5 py-3.5">Financial Position</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={7} label="Loading service tickets..." />
              ) : visibleTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    No service tickets match the selected filters.
                  </td>
                </tr>
              ) : visibleTickets.map((ticket) => {
                const invoice = latest(ticket.invoices);
                const dispatch = latest(ticket.dispatches);
                const customerOutstanding = invoice
                  ? Math.max(0, numeric(invoice.net_payable) - numeric(invoice.paid_amount))
                  : 0;
                const supplierOutstanding = dispatch
                  ? Math.max(0, numeric(dispatch.repair_cost) - numeric(dispatch.paid_amount))
                  : 0;

                return (
                  <tr key={ticket.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-4">
                      <div className="font-mono text-xs font-bold text-indigo-700">{ticket.ticket_no}</div>
                      <div className="mt-1 text-xs text-slate-400">{displayDate(ticket.return_date)}</div>
                      {ticket.is_warranty && (
                        <span className="mt-2 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                          {isClaimRepair(ticket) ? 'Free warranty' : 'Warranty'}
                        </span>
                      )}
                      {ticket.warranty_claim && (
                        <button
                          type="button"
                          onClick={() => openWarrantyClaim(ticket.warranty_claim!.id, 'detail')}
                          className="mt-1 block font-mono text-[10px] text-violet-600 hover:underline"
                        >
                          Claim {ticket.warranty_claim.claim_no}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{ticket.customer_name}</div>
                      <div className="mt-1 text-xs text-slate-400">{ticket.customer_nic}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-800">
                        {ticket.item?.item_description ?? ticket.item_code}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {ticket.item_serial_no || 'No serial'}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="max-w-xs truncate text-slate-600">{ticket.problem_description}</div>
                      {ticket.assigned_technician && (
                        <div className="mt-1 text-xs font-semibold text-indigo-600">
                          {ticket.assigned_technician}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={ticket.status} />
                      <div className="mt-2 text-xs text-slate-400">
                        {nextStepLabel(ticket.status)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {invoice || dispatch ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Customer</span>
                            <span className={customerOutstanding > 0 ? 'font-bold text-rose-700' : 'font-semibold text-emerald-700'}>
                              {formatCurrency(customerOutstanding)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-400">Supplier</span>
                            <span className={supplierOutstanding > 0 ? 'font-bold text-amber-700' : 'font-semibold text-emerald-700'}>
                              {formatCurrency(supplierOutstanding)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{isClaimRepair(ticket) ? 'No charge (warranty)' : 'Not billed'}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTicket(ticket)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-indigo-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Workflow
                        </button>
                        {canUpdate && ticket.status === 'received' && (
                          <button
                            type="button"
                            onClick={() => openEdit(ticket)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:text-indigo-700"
                            title="Edit intake"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && ticket.status === 'received' && (
                          <button
                            type="button"
                            onClick={() => deleteTicket(ticket)}
                            className="rounded-lg border border-rose-200 p-2 text-rose-500 transition hover:bg-rose-50"
                            title="Delete ticket"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showTicketForm && (
        <OperationModal
          title={editingTicket ? 'Edit Service Intake' : 'New Service Ticket'}
          description="Capture the customer, item identity, reported fault, intake condition, and expected completion."
          onClose={() => !saving && setShowTicketForm(false)}
          width="max-w-4xl"
        >
          <form onSubmit={submitTicket} className="space-y-6 p-6">
            {notice?.type === 'error' && (
              <OperationNotice type="error">{notice.message}</OperationNotice>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <OperationField label="Received Date" required>
                <input type="date" value={ticketForm.return_date} onChange={(event) => setTicketForm({ ...ticketForm, return_date: event.target.value })} className={inputClass} required />
              </OperationField>
              <OperationField label="Expected Completion">
                <input type="date" value={ticketForm.expected_completion_date} onChange={(event) => setTicketForm({ ...ticketForm, expected_completion_date: event.target.value })} className={inputClass} />
              </OperationField>
              <OperationField label="Customer" required>
                <SearchSelect
                  value={ticketForm.customer_code}
                  onChange={(value) => setTicketForm({ ...ticketForm, customer_code: value })}
                  options={(options?.customers ?? []).map((customer) => ({ value: customer.Code, label: `${customer.Code} - ${customer.name}`, description: customer.NIC }))}
                  placeholder="Select customer"
                  searchPlaceholder="Search by code, name or NIC..."
                  className={inputClass}
                  required
                />
              </OperationField>
              <OperationField label="Item" required>
                <SearchSelect
                  value={ticketForm.item_code}
                  onChange={(value) => setTicketForm({ ...ticketForm, item_code: value, item_serial_no: '' })}
                  options={(options?.items ?? []).map((item) => ({ value: item.item_code, label: `${item.item_code} - ${item.item_description}` }))}
                  placeholder="Select item"
                  searchPlaceholder="Search by code or description..."
                  className={inputClass}
                  required
                />
              </OperationField>
              <OperationField label="Serial Number" required={Boolean(selectedItem?.is_serialized)}>
                <input value={ticketForm.item_serial_no} onChange={(event) => setTicketForm({ ...ticketForm, item_serial_no: event.target.value })} className={inputClass} required={Boolean(selectedItem?.is_serialized)} />
              </OperationField>
              <label className="flex items-center gap-3 self-end rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                <input type="checkbox" checked={ticketForm.is_warranty} onChange={(event) => setTicketForm({ ...ticketForm, is_warranty: event.target.checked })} className="h-4 w-4 rounded border-violet-300 text-violet-600" />
                Warranty service
              </label>
              <OperationField label="Reported Problem" required className="md:col-span-2">
                <textarea value={ticketForm.problem_description} onChange={(event) => setTicketForm({ ...ticketForm, problem_description: event.target.value })} className={inputClass} rows={4} required />
              </OperationField>
              <OperationField label="Intake Condition" className="md:col-span-2">
                <textarea value={ticketForm.intake_condition} onChange={(event) => setTicketForm({ ...ticketForm, intake_condition: event.target.value })} className={inputClass} rows={3} placeholder="Physical condition, included accessories, visible damage..." />
              </OperationField>
            </div>
            <OperationActions
              saving={saving}
              submitLabel={editingTicket ? 'Update Intake' : 'Create Ticket'}
              onCancel={() => setShowTicketForm(false)}
              disabled={!ticketForm.customer_code || !ticketForm.item_code || !ticketForm.problem_description.trim()}
            />
          </form>
        </OperationModal>
      )}

      {selectedTicket && (
        <TicketWorkspace
          ticket={selectedTicket}
          canUpdate={canUpdate}
          options={options}
          onClose={() => setSelectedTicket(null)}
          onAction={openAction}
          onWarrantyHandover={
            canReadWarranty && isClaimRepair(selectedTicket)
              ? () => openWarrantyClaim(selectedTicket.warranty_claim!.id, 'handover')
              : undefined
          }
        />
      )}

      {selectedTicket && action && (
        <ActionModal
          action={action}
          ticket={selectedTicket}
          form={actionForm}
          options={options}
          saving={saving}
          notice={notice}
          onChange={setActionForm}
          onSubmit={submitAction}
          onClose={() => !saving && setAction(null)}
        />
      )}
      </>
      )}
    </div>
  );
}

function TicketWorkspace({
  ticket,
  canUpdate,
  options,
  onClose,
  onAction,
  onWarrantyHandover,
}: {
  ticket: ServiceTicket;
  canUpdate: boolean;
  options: ServiceOptions | null;
  onClose: () => void;
  onAction: (action: TicketAction) => void;
  /** Warranty tickets are released from the warranty claim, never invoiced. */
  onWarrantyHandover?: () => void;
}) {
  const invoice = latest(ticket.invoices);
  const dispatch = latest(ticket.dispatches);
  const customerOutstanding = invoice
    ? Math.max(0, numeric(invoice.net_payable) - numeric(invoice.paid_amount))
    : 0;
  const supplierOutstanding = dispatch
    ? Math.max(0, numeric(dispatch.repair_cost) - numeric(dispatch.paid_amount))
    : 0;
  const actions = availableActions(ticket, customerOutstanding, supplierOutstanding);

  return (
    <OperationModal
      title={ticket.ticket_no}
      description={`${ticket.customer_name} · ${ticket.item?.item_description ?? ticket.item_code}`}
      onClose={onClose}
      width="max-w-6xl"
    >
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 rounded-2xl bg-slate-950 p-5 text-white lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current Workflow Stage</div>
            <div className="mt-2 flex items-center gap-3">
              <StatusPill status={ticket.status} />
              <span className="text-sm text-slate-300">
                {isClaimRepair(ticket) && ticket.status === 'repaired'
                  ? 'Free warranty repair done. Hand the item over from the warranty claim.'
                  : nextStepLabel(ticket.status)}
              </span>
            </div>
          </div>
          {(canUpdate && actions.length > 0) || (onWarrantyHandover && ticket.status === 'repaired') ? (
            <div className="flex flex-wrap gap-2">
              {onWarrantyHandover && ticket.status === 'repaired' && (
                <button
                  type="button"
                  onClick={onWarrantyHandover}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600"
                >
                  <PackageCheck className="h-4 w-4" />
                  Hand over (warranty)
                </button>
              )}
              {actions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => onAction(item.action)}
                  disabled={item.action === 'dispatch' && !options?.service_suppliers.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailCard label="Customer" value={ticket.customer_name} help={ticket.customer_nic} />
          <DetailCard label="Item Serial" value={ticket.item_serial_no || 'Not recorded'} help={ticket.item_code} />
          <DetailCard
            label="Customer Due"
            value={isClaimRepair(ticket) ? 'No charge' : formatCurrency(customerOutstanding)}
            help={isClaimRepair(ticket) ? `Free warranty service · ${ticket.warranty_claim?.claim_no}` : invoice?.invoice_no ?? 'Not invoiced'}
          />
          <DetailCard label="Supplier Due" value={formatCurrency(supplierOutstanding)} help={dispatch?.dispatch_no ?? 'No external repair'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-900">Intake & Repair Details</h3>
              <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                <DetailTerm label="Reported Problem" value={ticket.problem_description} />
                <DetailTerm label="Intake Condition" value={ticket.intake_condition || 'Not recorded'} />
                <DetailTerm label="Assigned Technician" value={ticket.assigned_technician || 'Not assigned'} />
                <DetailTerm label="Repair Summary" value={ticket.repair_summary || 'Not completed'} />
              </dl>
            </div>

            {dispatch && (
              <div className="rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-900">External Supplier Repair</h3>
                <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <DetailTerm label="Supplier" value={dispatch.supplier?.name ?? dispatch.supplier_code} />
                  <DetailTerm label="Dispatch" value={`${dispatch.dispatch_no} / ${displayDate(dispatch.dispatch_date)}`} />
                  <DetailTerm label="Supplier Report" value={dispatch.supplier_report || 'Awaiting report'} />
                  <DetailTerm label="Repair Cost" value={`${formatCurrency(numeric(dispatch.repair_cost))} · ${formatStatus(dispatch.payment_status)}`} />
                </dl>
              </div>
            )}

            {invoice && (
              <div className="rounded-2xl border border-slate-200 p-5">
                <h3 className="text-sm font-bold text-slate-900">Service Invoice</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <FinancialTile label="Service Charge" value={numeric(invoice.service_charge)} />
                  <FinancialTile label="Supplier Cost" value={numeric(invoice.supplier_repair_cost)} />
                  <FinancialTile label="Invoice Total" value={numeric(invoice.net_payable)} emphasis />
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <div className="font-mono text-xs font-bold text-indigo-700">{invoice.invoice_no}</div>
                    <div className="mt-1 text-xs text-slate-400">{displayDate(invoice.invoice_date)}</div>
                  </div>
                  <StatusPill status={invoice.payment_status} />
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900">Status Timeline</h3>
            <div className="mt-5 space-y-0">
              {ticket.tracks.map((track, index) => (
                <div key={track.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100">
                      <ClipboardCheck className="h-4 w-4" />
                    </span>
                    {index < ticket.tracks.length - 1 && <span className="my-2 h-full min-h-8 w-px bg-slate-200" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-bold text-slate-900">{formatStatus(track.event_name)}</div>
                      <div className="text-xs text-slate-400">{displayDate(track.event_date)}</div>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{track.description}</p>
                    <div className="mt-1 text-[11px] font-semibold text-indigo-500">{track.UID}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </OperationModal>
  );
}

function ActionModal({
  action,
  ticket,
  form,
  options,
  saving,
  notice,
  onChange,
  onSubmit,
  onClose,
}: {
  action: TicketAction;
  ticket: ServiceTicket;
  form: ActionForm;
  options: ServiceOptions | null;
  saving: boolean;
  notice: { type: 'success' | 'error'; message: string } | null;
  onChange: (form: ActionForm) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}) {
  const metadata = ACTION_METADATA[action];
  const invoice = latest(ticket.invoices);
  const dispatch = latest(ticket.dispatches);
  const maximum = action === 'customer-payment'
    ? Math.max(0, numeric(invoice?.net_payable) - numeric(invoice?.paid_amount))
    : action === 'supplier-payment'
      ? Math.max(0, numeric(dispatch?.repair_cost) - numeric(dispatch?.paid_amount))
      : 0;
  const needsBank = ['customer-payment', 'supplier-payment'].includes(action)
    && form.payment_method !== 'cash';

  return (
    <OperationModal
      title={metadata.title}
      description={`${ticket.ticket_no} · ${ticket.customer_name}`}
      onClose={onClose}
      width="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-5 p-6">
        {notice?.type === 'error' && <OperationNotice type="error">{notice.message}</OperationNotice>}
        <OperationField label={metadata.dateLabel} required>
          <input type="date" value={form.action_date} onChange={(event) => onChange({ ...form, action_date: event.target.value })} className={inputClass} required />
        </OperationField>
        {action === 'dispatch' && (
          <div className="grid gap-4 md:grid-cols-2">
            <OperationField label="Service Supplier" required className="md:col-span-2">
              <SearchSelect
                value={form.supplier_code}
                onChange={(value) => onChange({ ...form, supplier_code: value })}
                options={(options?.service_suppliers ?? []).map((supplier) => ({ value: supplier.Code, label: `${supplier.Code} - ${supplier.name}` }))}
                placeholder="Select service supplier"
                searchPlaceholder="Search suppliers..."
                className={inputClass}
                required
              />
            </OperationField>
            <OperationField label="Estimated Return">
              <input type="date" value={form.estimated_return} onChange={(event) => onChange({ ...form, estimated_return: event.target.value })} className={inputClass} />
            </OperationField>
            <OperationField label="Supplier Reference">
              <input value={form.supplier_reference} onChange={(event) => onChange({ ...form, supplier_reference: event.target.value })} className={inputClass} />
            </OperationField>
            <OperationField label="Dispatch Notes" className="md:col-span-2">
              <textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} className={inputClass} rows={3} />
            </OperationField>
          </div>
        )}
        {action === 'receive-back' && (
          <>
            <OperationField label="Supplier Repair Cost">
              <input type="number" min="0" step="0.01" value={form.repair_cost} onChange={(event) => onChange({ ...form, repair_cost: event.target.value })} className={inputClass} />
            </OperationField>
            <OperationField label="Supplier Report">
              <textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} className={inputClass} rows={4} />
            </OperationField>
          </>
        )}
        {action === 'assign-technician' && (
          <>
            <OperationField label="Technician Name" required>
              <input value={form.technician_name} onChange={(event) => onChange({ ...form, technician_name: event.target.value })} className={inputClass} required />
            </OperationField>
            <OperationField label="Initial Diagnosis">
              <textarea value={form.diagnosis} onChange={(event) => onChange({ ...form, diagnosis: event.target.value })} className={inputClass} rows={4} />
            </OperationField>
          </>
        )}
        {action === 'complete-repair' && (
          <>
            <OperationField label="Repair Details" required>
              <textarea value={form.repair_details} onChange={(event) => onChange({ ...form, repair_details: event.target.value })} className={inputClass} rows={4} required />
            </OperationField>
            <div className="grid gap-4 md:grid-cols-2">
              <OperationField label="Parts Used">
                <textarea value={form.parts_used} onChange={(event) => onChange({ ...form, parts_used: event.target.value })} className={inputClass} rows={3} />
              </OperationField>
              <OperationField label="Internal Labor Charge">
                <input type="number" min="0" step="0.01" value={form.labor_charge} onChange={(event) => onChange({ ...form, labor_charge: event.target.value })} className={inputClass} />
              </OperationField>
            </div>
          </>
        )}
        {action === 'invoice' && (
          <>
            <OperationField label="Service Charge" help={`Supplier cost added automatically: ${formatCurrency(numeric(dispatch?.repair_cost))}`} required>
              <input type="number" min="0" step="0.01" value={form.service_charge} onChange={(event) => onChange({ ...form, service_charge: event.target.value })} className={inputClass} required />
            </OperationField>
            <OperationField label="Invoice Note">
              <textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} className={inputClass} rows={3} />
            </OperationField>
          </>
        )}
        {(action === 'customer-payment' || action === 'supplier-payment') && (
          <>
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <div className="text-xs uppercase tracking-wide text-slate-400">Maximum Outstanding</div>
              <div className="mt-1 text-2xl font-bold">{formatCurrency(maximum)}</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <OperationField label="Payment Amount" required>
                <input type="number" min="0.01" max={maximum} step="0.01" value={form.amount} onChange={(event) => onChange({ ...form, amount: event.target.value })} className={inputClass} required />
              </OperationField>
              <OperationField label="Payment Method" required>
                <select value={form.payment_method} onChange={(event) => onChange({ ...form, payment_method: event.target.value })} className={inputClass}>
                  <option value="cash">Cash</option>
                  {action === 'customer-payment' && <option value="card">Card</option>}
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </OperationField>
              {needsBank && (
                <OperationField label="Bank Account" required className="md:col-span-2">
                  <SearchSelect
                    value={form.bank_detail_id}
                    onChange={(value) => onChange({ ...form, bank_detail_id: value })}
                    options={(options?.bank_accounts ?? []).map((bank) => ({ value: String(bank.id), label: bank.bank_name, description: bank.account_no }))}
                    placeholder="Select bank account"
                    searchPlaceholder="Search bank accounts..."
                    className={inputClass}
                    required
                  />
                </OperationField>
              )}
              <OperationField label="Payment Note" className="md:col-span-2">
                <textarea value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} className={inputClass} rows={3} />
              </OperationField>
            </div>
          </>
        )}
        <OperationActions
          saving={saving}
          submitLabel={metadata.submitLabel}
          onCancel={onClose}
          disabled={
            !form.action_date
            || (action === 'dispatch' && !form.supplier_code)
            || (action === 'assign-technician' && !form.technician_name.trim())
            || (action === 'complete-repair' && !form.repair_details.trim())
            || (action === 'invoice' && numeric(form.service_charge) + numeric(dispatch?.repair_cost) <= 0)
            || ((action === 'customer-payment' || action === 'supplier-payment') && (
              numeric(form.amount) <= 0 || numeric(form.amount) > maximum || (needsBank && !form.bank_detail_id)
            ))
          }
        />
      </form>
    </OperationModal>
  );
}

const SERVICE_STATUSES: ServiceStatus[] = [
  'received',
  'dispatched_to_supplier',
  'received_from_supplier',
  'under_repair',
  'repaired',
  'invoiced',
  'customer_paid',
  'completed',
];

const ACTION_METADATA: Record<TicketAction, {
  title: string;
  dateLabel: string;
  submitLabel: string;
}> = {
  dispatch: { title: 'Dispatch to Service Supplier', dateLabel: 'Dispatch Date', submitLabel: 'Dispatch Item' },
  'receive-back': { title: 'Receive Back from Supplier', dateLabel: 'Received Date', submitLabel: 'Receive Item' },
  'assign-technician': { title: 'Assign Internal Technician', dateLabel: 'Issue Date', submitLabel: 'Assign Technician' },
  'complete-repair': { title: 'Complete Repair Work', dateLabel: 'Completion Date', submitLabel: 'Complete Repair' },
  invoice: { title: 'Create Service Invoice', dateLabel: 'Invoice Date', submitLabel: 'Create Invoice' },
  'customer-payment': { title: 'Record Customer Payment', dateLabel: 'Payment Date', submitLabel: 'Post Customer Payment' },
  'supplier-payment': { title: 'Settle Service Supplier', dateLabel: 'Payment Date', submitLabel: 'Post Supplier Payment' },
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function availableActions(
  ticket: ServiceTicket,
  customerOutstanding: number,
  supplierOutstanding: number
): Array<{ action: TicketAction; label: string; icon: LucideIcon }> {
  const actions: Array<{ action: TicketAction; label: string; icon: LucideIcon }> = [];
  if (ticket.status === 'received') {
    actions.push(
      { action: 'dispatch', label: 'Dispatch Supplier', icon: Truck },
      { action: 'assign-technician', label: 'Assign Technician', icon: UserRoundCog }
    );
  }
  if (ticket.status === 'dispatched_to_supplier') {
    actions.push({ action: 'receive-back', label: 'Receive Back', icon: PackageCheck });
  }
  if (ticket.status === 'received_from_supplier') {
    actions.push({ action: 'assign-technician', label: 'Assign Technician', icon: UserRoundCog });
  }
  if (ticket.status === 'under_repair') {
    actions.push({ action: 'complete-repair', label: 'Complete Repair', icon: CheckCircle2 });
  }
  if (ticket.status === 'repaired' && !isClaimRepair(ticket)) {
    actions.push({ action: 'invoice', label: 'Create Invoice', icon: ReceiptText });
  }
  if (customerOutstanding > 0 && ['invoiced', 'customer_paid'].includes(ticket.status)) {
    actions.push({ action: 'customer-payment', label: 'Customer Payment', icon: HandCoins });
  }
  if (supplierOutstanding > 0 && (ticket.status !== 'completed' || isClaimRepair(ticket))) {
    actions.push({ action: 'supplier-payment', label: 'Supplier Payment', icon: Banknote });
  }
  return actions;
}

function actionPayload(action: TicketAction, form: ActionForm): Record<string, unknown> {
  if (action === 'dispatch') {
    return {
      supplier_code: form.supplier_code,
      dispatch_date: form.action_date,
      estimated_return: form.estimated_return || null,
      supplier_reference: form.supplier_reference || null,
      dispatch_notes: form.notes || null,
    };
  }
  if (action === 'receive-back') {
    return {
      received_date: form.action_date,
      repair_cost: numeric(form.repair_cost),
      supplier_report: form.notes || null,
    };
  }
  if (action === 'assign-technician') {
    return {
      issue_date: form.action_date,
      technician_name: form.technician_name,
      diagnosis: form.diagnosis || null,
    };
  }
  if (action === 'complete-repair') {
    return {
      completed_date: form.action_date,
      repair_details: form.repair_details,
      parts_used: form.parts_used || null,
      labor_charge: numeric(form.labor_charge),
    };
  }
  if (action === 'invoice') {
    return {
      invoice_date: form.action_date,
      service_charge: numeric(form.service_charge),
      invoice_note: form.notes || null,
    };
  }
  return {
    payment_date: form.action_date,
    amount: numeric(form.amount),
    payment_method: form.payment_method,
    bank_detail_id: form.payment_method === 'cash' ? null : Number(form.bank_detail_id),
    payment_note: form.notes || null,
  };
}

function actionSuccessMessage(action: TicketAction) {
  return ({
    dispatch: 'Item dispatched to the service supplier.',
    'receive-back': 'Item received back and supplier cost recorded.',
    'assign-technician': 'Item assigned to the technician.',
    'complete-repair': 'Repair work completed.',
    invoice: 'Service invoice created.',
    'customer-payment': 'Customer payment posted.',
    'supplier-payment': 'Supplier payment posted.',
  } satisfies Record<TicketAction, string>)[action];
}

function latest<T extends { id: number }>(records: T[] | undefined): T | undefined {
  if (!records?.length) return undefined;
  return records.reduce((current, item) => item.id > current.id ? item : current);
}

function dateValue(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function formatStatus(value: string) {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Repairs for an active warranty claim are free: no invoice, released from the claim. */
function isClaimRepair(ticket: ServiceTicket) {
  return Boolean(ticket.warranty_claim) && ticket.warranty_claim?.status !== 'rejected';
}

function nextStepLabel(status: ServiceStatus) {
  return ({
    received: 'Choose supplier dispatch or internal repair.',
    dispatched_to_supplier: 'Awaiting return from the service supplier.',
    received_from_supplier: 'Ready for internal technician verification.',
    under_repair: 'Technician repair work is active.',
    repaired: 'Ready to create the customer invoice.',
    invoiced: 'Awaiting customer and supplier settlements.',
    customer_paid: 'Customer settled; complete supplier settlement.',
    completed: 'Item released and workflow closed.',
  } satisfies Record<ServiceStatus, string>)[status];
}

function DetailCard({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 truncate font-bold text-slate-900">{value}</div>
      {help && <div className="mt-1 truncate text-xs text-slate-400">{help}</div>}
    </div>
  );
}

function DetailTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 leading-6 text-slate-700">{value}</dd>
    </div>
  );
}

function FinancialTile({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${emphasis ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-1 font-bold">{formatCurrency(value)}</div>
    </div>
  );
}
